// 社区版全文分析执行器：复用用户已配置的模型，所有任务和结果只写浏览器本机。
(function(window) {
    'use strict';

    const RESULT_FILE_NAMES = Object.freeze([
        '大纲', '剧情总览', '设定集', '信息表', '角色列表', '追踪表', '边界卡', '承接卡'
    ]);
    const SYSTEM_PROMPT = '你是长篇小说资料整理助手。只依据本次提供的原文或已整理材料工作，不虚构，不补写未发生的剧情，并严格遵守输出格式。';
    const PROFILE_FILE_NAMES = Object.freeze(['设定集', '信息表', '角色列表']);
    const CARD_FILE_NAMES = Object.freeze(['追踪表', '边界卡', '承接卡']);
    const ACTIVE_TASK_STATUSES = new Set(['prepared', 'running', 'pause_requested', 'paused', 'retry_wait', 'merging', 'completed_unsaved']);
    const MATERIAL_LIMIT = 24000;
    const MAX_STEP_ATTEMPTS = 4;
    const MAX_PROVIDER_DISPATCHES_PER_REQUEST = 2;
    const TASK_EXECUTION_LEASE_TTL_MS = 15 * 60 * 1000;

    function getSchema() {
        const api = window.ZhiyuImportFullAnalysisSchema;
        if (!api) throw new Error('全文分析数据模块未加载，请刷新页面后重试');
        return api;
    }

    function getPlanner() {
        const api = window.ZhiyuImportFullAnalysisPlan;
        if (!api) throw new Error('全文分析分段模块未加载，请刷新页面后重试');
        return api;
    }

    function getStore() {
        const api = window.ZhiyuImportFullAnalysisCheckpointStore;
        if (!api) throw new Error('全文分析本机检查点未加载，请刷新页面后重试');
        return api;
    }

    function getCore() {
        const api = window.ZhiyuFullTextAnalysisCore;
        if (!api) throw new Error('全文分析基础模块未加载，请刷新页面后重试');
        return api;
    }

    function clone(value) {
        if (typeof structuredClone === 'function') return structuredClone(value);
        return JSON.parse(JSON.stringify(value));
    }

    function nowIso() {
        return new Date().toISOString();
    }

    function getOwnerId() {
        return String(
            window.AccountDataScope?.getActiveUid?.()
            || window.ZHIYU_COMMUNITY_RUNTIME?.getLocalIdentity?.()?.uid
            || 'community-local'
        ).trim();
    }

    function getModelDescriptor() {
        const model = window.getSelectedModelConfig?.();
        if (!model?.base || !model?.model) {
            const error = new Error('请先在模型设置中添加并选择自己的 API 模型');
            error.code = 'COMMUNITY_MODEL_REQUIRED';
            throw error;
        }
        return {
            name: String(model.name || model.model),
            base: String(model.base || '').replace(/\/+$/, ''),
            model: String(model.model || ''),
            protocol: String(model.protocol || 'openai')
        };
    }

    function modelRouteKey(model) {
        return [model?.base, model?.model, model?.protocol].map(function(part) {
            return String(part || '').trim().toLowerCase();
        }).join('|');
    }

    function assertTaskModel(task) {
        const current = getModelDescriptor();
        if (modelRouteKey(current) !== modelRouteKey(task?.model)) {
            const error = new Error('当前选择的模型与本任务开始时不同。请切回“' + String(task?.model?.name || task?.model?.model || '原模型') + '”后继续');
            error.code = 'FULL_ANALYSIS_MODEL_CHANGED';
            throw error;
        }
        return current;
    }

    function notify(control, message, details) {
        if (typeof control?.onProgress === 'function') {
            control.onProgress(Object.assign({ message: String(message || '') }, details || {}));
        }
    }

    function makeControlError(code, message) {
        const error = new Error(message);
        error.code = code;
        return error;
    }

    function assertCanCallModel(control) {
        control?.assertExecutionOwnership?.();
        if (control?.shouldPause?.()) throw makeControlError('FULL_ANALYSIS_PAUSED', '全文分析已暂停');
    }

    function parseMarkedFiles(value, expectedNames) {
        const expected = Array.isArray(expectedNames) ? expectedNames.slice() : [];
        const text = String(value || '').replace(/\r\n?/g, '\n').trim();
        const matches = Array.from(text.matchAll(/^###\s*FILE:\s*([^\r\n]+)\s*$/gmi));
        if (!matches.length) throw new Error('模型返回结果缺少文件标记');
        const files = {};
        matches.forEach(function(match, index) {
            const name = String(match[1] || '').trim().replace(/\.md$/i, '');
            if (!expected.includes(name)) throw new Error('模型返回了未要求的文件“' + name + '”');
            if (Object.prototype.hasOwnProperty.call(files, name)) throw new Error('模型重复返回了文件“' + name + '”');
            const start = Number(match.index || 0) + match[0].length;
            const end = index + 1 < matches.length ? Number(matches[index + 1].index) : text.length;
            files[name] = text.slice(start, end).trim();
        });
        const missing = expected.filter(function(name) { return !String(files[name] || '').trim(); });
        if (missing.length) throw new Error('模型返回结果缺少：' + missing.join('、'));
        if (Object.keys(files).length !== expected.length) throw new Error('模型返回的文件数量不正确');
        return files;
    }

    function parseChapterBlocks(value) {
        const text = String(value || '').replace(/\r\n?/g, '\n').trim();
        const headings = Array.from(text.matchAll(/^##\s*第\s*(\d+)\s*章(?:\s+([^\r\n]+))?\s*$/gm));
        return headings.map(function(match, index) {
            const start = Number(match.index || 0) + match[0].length;
            const end = index + 1 < headings.length ? Number(headings[index + 1].index) : text.length;
            const body = text.slice(start, end).trim();
            const plot = String(body.match(/^剧情[：:]\s*(.+)$/m)?.[1] || '').trim();
            const endState = String(body.match(/^章末[：:]\s*(.+)$/m)?.[1] || '').trim();
            return {
                chapterNumber: Number(match[1]),
                title: String(match[2] || '').trim(),
                plot,
                endState,
                raw: body
            };
        }).filter(function(block) { return Number.isInteger(block.chapterNumber) && block.plot; });
    }

    function parseSegmentResult(value, expectedNumbers) {
        const files = parseMarkedFiles(value, ['章节梗概', '资料事实']);
        const blocks = parseChapterBlocks(files['章节梗概']);
        const expected = uniqueNumbers(expectedNumbers);
        const expectedSet = new Set(expected);
        const actual = new Set(blocks.map(function(block) { return block.chapterNumber; }));
        const missing = expected.filter(function(number) {
            return !actual.has(Number(number));
        });
        if (missing.length) throw new Error('章节梗概缺少第 ' + missing.join('、') + ' 章');
        const extra = Array.from(actual).filter(function(number) { return !expectedSet.has(Number(number)); });
        if (extra.length) throw new Error('章节梗概返回了未要求的第 ' + extra.join('、') + ' 章');
        const counts = new Map();
        blocks.forEach(function(block) {
            counts.set(block.chapterNumber, Number(counts.get(block.chapterNumber) || 0) + 1);
        });
        const duplicated = Array.from(counts.entries()).filter(function(entry) { return entry[1] !== 1; }).map(function(entry) { return entry[0]; });
        if (duplicated.length) throw new Error('章节梗概重复返回了第 ' + duplicated.join('、') + ' 章');
        return { files, blocks };
    }

    function uniqueNumbers(values) {
        return Array.from(new Set((Array.isArray(values) ? values : []).map(Number).filter(function(value) {
            return Number.isInteger(value) && value > 0;
        }))).sort(function(left, right) { return left - right; });
    }

    function renderSegmentSource(segment) {
        return (segment?.chapters || []).map(function(part) {
            const number = Number(part.chapterNumber || part.chapterOrder + 1);
            const volume = String(part.volumeTitle || part.volume || '第一卷');
            const title = String(part.sourceTitle || part.chapterTitle || part.title || ('第' + number + '章'));
            const slice = Number(part.sliceTotal || 1) > 1
                ? '（正文分段 ' + Number(part.sliceIndex || part.partIndex + 1) + '/' + Number(part.sliceTotal) + '）'
                : '';
            return '【全书流水章号：第' + number + '章】【' + volume + '】【原标题：' + title + slice + '】\n' + String(part.content || '');
        }).join('\n\n');
    }

    function buildSegmentPrompt(segment) {
        const numbers = uniqueNumbers((segment?.chapters || []).map(function(part) { return part.chapterNumber || part.chapterOrder + 1; }));
        return [
            '请完整阅读以下正文，逐章提取已经发生的剧情事实。',
            '不得遗漏提供的正文片段，不得虚构原文没有的事件，不要写创作建议或未来规划。',
            '章节编号只使用每段标注的“全书流水章号”。以下章号必须各输出一次：' + numbers.map(function(number) { return '第' + number + '章'; }).join('、') + '。',
            '每章严格使用三行结构：“## 第123章 原标题”“剧情：本章实际发生的核心事件及结果”“章末：本章结束时已经形成的状态”。',
            '同时提取可核实的设定、势力、地点、关键物品、重要角色、别名和长期关系。没有事实时写“无”，不要编造。',
            '严格且只输出：',
            '### FILE: 章节梗概',
            '[逐章三行结构]',
            '### FILE: 资料事实',
            '## 设定事实',
            '## 信息事实',
            '## 角色候选与长期关系证据',
            '',
            renderSegmentSource(segment)
        ].join('\n');
    }

    function buildKnowledgeMergePrompt(materials) {
        return [
            '请合并以下多批小说资料事实，去除完全重复内容，保留事实对应的章号或先后变化。不得虚构。',
            '严格且只输出：',
            '### FILE: 资料事实汇总',
            '',
            materials.map(function(item, index) {
                return '【资料批次' + (index + 1) + '】\n' + String(item || '');
            }).join('\n\n')
        ].join('\n');
    }

    function buildProfilePrompt(bookName, knowledgeFacts, plotOverview) {
        const facts = String(knowledgeFacts || '').trim();
        const sourceLabel = facts && facts !== '无' ? '资料事实' : '逐章梗概';
        const source = facts && facts !== '无' ? facts : String(plotOverview || '');
        if (source.length > MATERIAL_LIMIT * 2) {
            throw makeControlError(
                'FULL_ANALYSIS_KNOWLEDGE_NOT_CONVERGED',
                '用于设定和角色整理的材料仍然过长。为避免静默丢掉后半部内容，任务已暂停并保留全部检查点'
            );
        }
        return [
            '请仅根据《' + String(bookName || '未命名作品') + '》的资料事实和逐章梗概整理三份关联资料。',
            '设定集只整理世界观、力量或能力体系、主角优势与限制、特殊规则；不存在超常能力时明确说明，不得强行添加系统或金手指。',
            '信息表只整理势力、地点、会持续影响剧情的关键物品。',
            '角色列表只保留仍存活且会持续影响后续的重要人物；同一角色的姓名和别名必须合并。势力、地点、物品和泛指身份不是角色。',
            '角色列表必须含“## 角色资料”和“## 角色关系”。角色资料使用固定八列表格：',
            '| 角色 | 性别 | 身份/定位 | 所属势力 | 核心目标 | 对话风格 | 当前状态 | 写作提醒 |',
            '| --- | --- | --- | --- | --- | --- | --- | --- |',
            '没有内容时保留表头并写“暂无”，不得编造。任何表格单元格内不要使用半角竖线。',
            '严格且只输出：',
            '### FILE: 设定集',
            '### FILE: 信息表',
            '### FILE: 角色列表',
            '',
            '【' + sourceLabel + '】',
            source || '无'
        ].join('\n');
    }

    function buildCardPrompt(sourceText) {
        return [
            '请阅读以下真实正文，整理三张用于续写的卡片。只记录正文已经确认的内容。',
            '追踪表要包含仍未解决的长期事项；边界卡要包含当前不能违背的设定和状态；承接卡要包含最新章节结束时可直接承接的场景、人物状态和未完成动作。',
            '每张卡都要保留最近章节的 Markdown 表格，章节号使用“第123章”。没有事项时明确写“暂无”，不要只留标题。',
            '严格且只输出：',
            '### FILE: 追踪表',
            '### FILE: 边界卡',
            '### FILE: 承接卡',
            '',
            sourceText
        ].join('\n');
    }

    function buildCardMergePrompt(fragments) {
        return [
            '请合并以下流水卡片段。去除重复条目，只保留仍有效的事项，并保留章号最大的最近10章记录。不得新增材料中没有的事实。',
            '追踪表必须有“## 长期未结事项”，边界卡必须有“## 当前有效边界”，承接卡必须有“## 当前承接”。',
            '严格且只输出：',
            '### FILE: 追踪表',
            '### FILE: 边界卡',
            '### FILE: 承接卡',
            '',
            fragments.map(function(files, index) {
                return '【卡片批次' + (index + 1) + '】\n'
                    + CARD_FILE_NAMES.map(function(name) { return '### FILE: ' + name + '\n' + String(files[name] || ''); }).join('\n');
            }).join('\n\n')
        ].join('\n');
    }

    function stripLeadingTitle(value) {
        const lines = String(value || '').replace(/\r\n?/g, '\n').split('\n');
        while (lines.length && !lines[0].trim()) lines.shift();
        if (lines.length && /^#\s+/.test(lines[0])) lines.shift();
        while (lines.length && !lines[0].trim()) lines.shift();
        return lines.join('\n').trim();
    }

    function buildFinalOutline(files) {
        return [
            '# 大纲', '',
            '## 设定集', stripLeadingTitle(files['设定集']), '',
            '## 信息表', stripLeadingTitle(files['信息表']), '',
            '## 角色列表', stripLeadingTitle(files['角色列表']), '',
            '## 剧情梗概', stripLeadingTitle(files['剧情总览'])
        ].join('\n').trim();
    }

    function getRecordMap(bundle, type, key) {
        const map = new Map();
        (bundle?.records?.[type] || []).forEach(function(record) {
            const id = String(record?.[key] || record?.recordId || record?.requestId || '');
            if (id) map.set(id, record);
        });
        return map;
    }

    function outputRecord(bundle, recordId) {
        return getRecordMap(bundle, 'output', 'recordId').get(recordId) || null;
    }

    function summaryRecord(bundle, recordId) {
        return getRecordMap(bundle, 'summary_node', 'recordId').get(recordId) || null;
    }

    async function loadTask(ownerId, taskId) {
        return getStore().loadTaskBundle(String(ownerId || getOwnerId()), String(taskId || ''));
    }

    async function patchTask(ownerId, taskId, patch) {
        await getStore().writeRecords(ownerId, taskId, [], patch);
        return loadTask(ownerId, taskId);
    }

    function retryDispatchCount(bundle) {
        return (bundle?.records?.request || []).reduce(function(total, request) {
            const validationAttempt = Number(String(request?.stepKey || '').match(/:attempt:(\d+)$/)?.[1] || 1);
            return total + (validationAttempt > 1 ? 1 : 0) + Math.max(0, Number(request?.attempt || 1) - 1);
        }, 0);
    }

    async function obtainResponse(bundle, stepKey, prompt, control) {
        assertCanCallModel(control);
        const task = bundle.task;
        const ownerId = task.ownerId;
        const taskId = task.taskId;
        const schema = getSchema();
        const requestId = schema.makeStableId('request', [taskId, stepKey]);
        const requests = getRecordMap(bundle, 'request', 'requestId');
        const payloads = getRecordMap(bundle, 'response_payload', 'responsePayloadRef');
        const existing = requests.get(requestId);
        if (existing?.responsePayloadRef && payloads.has(existing.responsePayloadRef)) {
            return { request: existing, raw: String(payloads.get(existing.responsePayloadRef)?.payload || '') };
        }
        if (existing?.status === 'dispatched' || existing?.status === 'response_unknown') {
            if (typeof control?.approveUnknownResponseRetry !== 'function'
                || control.approveUnknownResponseRetry(requestId) !== true) {
                const error = makeControlError(
                    'FULL_ANALYSIS_RESPONSE_UNKNOWN',
                    '上次请求可能已经被模型服务商处理，但结果未保存。继续重试可能再次产生一次 API 请求，请确认后再继续'
                );
                error.requestId = requestId;
                throw error;
            }
            notify(control, '你已确认重新请求上次结果未知的步骤。', { kind: 'warning' });
        }
        if (Number(existing?.attempt || 0) >= MAX_PROVIDER_DISPATCHES_PER_REQUEST) {
            throw makeControlError('FULL_ANALYSIS_REQUEST_RETRY_LIMIT', '当前模型请求已重试达到上限。请检查模型配置，或清除任务后重新开始');
        }
        const validationAttempt = Number(String(stepKey || '').match(/:attempt:(\d+)$/)?.[1] || 1);
        const isRetryDispatch = validationAttempt > 1 || Number(existing?.attempt || 0) > 0;
        if (isRetryDispatch && retryDispatchCount(bundle) >= Number(task.maxRetryDispatches || 24)) {
            throw makeControlError('FULL_ANALYSIS_TASK_RETRY_LIMIT', '本任务的模型重试次数已达到安全上限。请检查模型是否适合严格格式输出，或清除任务后重新开始');
        }
        const model = assertTaskModel(task);
        const request = {
            requestId,
            stepKey,
            status: 'dispatched',
            attempt: Number(existing?.attempt || 0) + 1,
            model,
            createdAt: existing?.createdAt || nowIso(),
            updatedAt: nowIso()
        };
        await getStore().saveRequest(ownerId, taskId, request, {
            status: task.phase === 'segments' ? 'running' : 'merging',
            currentStep: stepKey
        });
        notify(control, '正在调用“' + model.name + '”处理当前步骤', { kind: 'current', stepKey });
        try {
            const result = await window.callLLMAPI(
                {},
                SYSTEM_PROMPT,
                prompt,
                undefined,
                { signal: control?.signal, timeoutMs: 10 * 60 * 1000, feature: 'community-full-analysis' }
            );
            control?.assertExecutionOwnership?.();
            const raw = String(result?.content?.[0]?.text || '').trim();
            if (!raw) throw new Error('模型没有返回可用内容');
            const savedRequest = await getStore().saveResponsePayload(ownerId, taskId, request, raw);
            return { request: savedRequest, raw };
        } catch(error) {
            const leaseLost = String(error?.code || '') === 'FULL_ANALYSIS_EXECUTION_LEASE_LOST';
            if (!leaseLost) {
                await getStore().saveRequest(ownerId, taskId, Object.assign({}, request, {
                    status: 'response_unknown',
                    errorCode: String(error?.code || error?.name || 'MODEL_REQUEST_FAILED'),
                    errorMessage: String(error?.message || '模型请求失败').slice(0, 500),
                    updatedAt: nowIso()
                }), {
                    lastErrorCode: 'FULL_ANALYSIS_RESPONSE_UNKNOWN',
                    lastError: '模型请求已发出，但返回结果没有完整保存；再次请求前需要确认'
                }).catch(function() {});
                const unknownError = makeControlError(
                    'FULL_ANALYSIS_RESPONSE_UNKNOWN',
                    '模型请求已经发出，但返回结果没有完整保存。再次请求前需要你确认可能产生重复 API 请求'
                );
                unknownError.requestId = requestId;
                unknownError.cause = error;
                throw unknownError;
            }
            throw error;
        }
    }

    async function runValidatedStep(options) {
        const input = options || {};
        let bundle = await loadTask(input.ownerId, input.taskId);
        const existing = input.recordType === 'summary_node'
            ? summaryRecord(bundle, input.recordId)
            : outputRecord(bundle, input.recordId);
        if (existing) return existing;
        const existingAttempts = (bundle.records?.request || []).filter(function(request) {
            return String(request?.stepKey || '').startsWith(input.stepKey + ':attempt:');
        }).sort(function(left, right) { return Number(left?.attempt || 0) - Number(right?.attempt || 0); });
        const payloads = getRecordMap(bundle, 'response_payload', 'responsePayloadRef');
        for (const request of existingAttempts) {
            if (!request?.responsePayloadRef || !payloads.has(request.responsePayloadRef)) continue;
            try {
                const raw = String(payloads.get(request.responsePayloadRef)?.payload || '');
                const parsed = input.parse(raw);
                const value = Object.assign({
                    recordId: input.recordId,
                    kind: input.kind,
                    generatedAt: nowIso()
                }, parsed || {});
                await getStore().commitRequestRecords(input.ownerId, input.taskId, request, [{
                    recordType: input.recordType,
                    recordId: input.recordId,
                    value
                }], input.taskPatch || {});
                notify(input.control, input.successMessage || '已从本机响应检查点恢复当前步骤', { kind: 'complete', stepKey: input.stepKey });
                return value;
            } catch(error) {
                if (error?.name === 'AbortError' || String(error?.code || '').startsWith('FULL_ANALYSIS_PAUSED')) throw error;
            }
        }
        const unknownRequest = existingAttempts.find(function(request) {
            return (request?.status === 'dispatched' || request?.status === 'response_unknown')
                && (!request.responsePayloadRef || !payloads.has(request.responsePayloadRef));
        });
        if (unknownRequest) {
            const validationAttempt = Number(String(unknownRequest.stepKey || '').match(/:attempt:(\d+)$/)?.[1] || 1);
            const prompt = validationAttempt === 1
                ? input.prompt
                : input.prompt + '\n\n重要：上一轮输出格式未通过检查。本轮必须严格使用指定的 FILE 标记，不要解释。';
            const response = await obtainResponse(bundle, unknownRequest.stepKey, prompt, input.control);
            const parsed = input.parse(response.raw);
            const value = Object.assign({
                recordId: input.recordId,
                kind: input.kind,
                generatedAt: nowIso()
            }, parsed || {});
            await getStore().commitRequestRecords(input.ownerId, input.taskId, response.request, [{
                recordType: input.recordType,
                recordId: input.recordId,
                value
            }], input.taskPatch || {});
            notify(input.control, input.successMessage || '当前步骤已完成并保存检查点', { kind: 'complete', stepKey: input.stepKey });
            return value;
        }
        const previousAttempts = existingAttempts.length;
        if (previousAttempts >= MAX_STEP_ATTEMPTS) {
            throw makeControlError('FULL_ANALYSIS_STEP_RETRY_LIMIT', '当前步骤已尝试 ' + MAX_STEP_ATTEMPTS + ' 次仍未通过格式检查。请更换更稳定的模型，或清除任务后重新开始');
        }
        let lastError = null;
        const attemptsThisRun = Math.min(2, MAX_STEP_ATTEMPTS - previousAttempts);
        for (let offset = 1; offset <= attemptsThisRun; offset += 1) {
            const attempt = previousAttempts + offset;
            const stepKey = input.stepKey + ':attempt:' + attempt;
            const prompt = attempt === 1
                ? input.prompt
                : input.prompt + '\n\n重要：上一轮输出格式未通过检查。本轮必须严格使用指定的 FILE 标记，不要解释。';
            try {
                const response = await obtainResponse(bundle, stepKey, prompt, input.control);
                const parsed = input.parse(response.raw);
                const value = Object.assign({
                    recordId: input.recordId,
                    kind: input.kind,
                    generatedAt: nowIso()
                }, parsed || {});
                await getStore().commitRequestRecords(input.ownerId, input.taskId, response.request, [{
                    recordType: input.recordType,
                    recordId: input.recordId,
                    value
                }], input.taskPatch || {});
                notify(input.control, input.successMessage || '当前步骤已完成并保存检查点', { kind: 'complete', stepKey: input.stepKey });
                return value;
            } catch(error) {
                if (error?.name === 'AbortError' || String(error?.code || '').startsWith('FULL_ANALYSIS_PAUSED')) throw error;
                if (error?.code === 'FULL_ANALYSIS_RESPONSE_UNKNOWN') throw error;
                lastError = error;
                notify(input.control, '模型返回格式未通过检查：' + String(error?.message || '格式错误'), { kind: 'warning' });
                bundle = await loadTask(input.ownerId, input.taskId);
            }
        }
        throw lastError || new Error('当前步骤未能生成有效结果');
    }

    function packMaterials(items, limit) {
        const groups = [];
        let current = [];
        let size = 0;
        (Array.isArray(items) ? items : []).forEach(function(item) {
            const text = String(item || '').trim();
            if (!text) return;
            if (current.length && size + text.length > limit) {
                groups.push(current);
                current = [];
                size = 0;
            }
            current.push(text);
            size += text.length;
        });
        if (current.length) groups.push(current);
        return groups;
    }

    async function reduceKnowledge(ownerId, taskId, materials, control, namespace) {
        const recordPrefix = String(namespace || 'knowledge').replace(/[^a-z0-9_-]/gi, '_');
        let current = [];
        (Array.isArray(materials) ? materials : []).forEach(function(material) {
            getCore().splitTextPreservingAll(String(material || ''), 18000).forEach(function(part) {
                if (part.trim()) current.push(part.trim());
            });
        });
        if (!current.length) return '无';
        let round = 1;
        while ((current.join('\n\n').length > MATERIAL_LIMIT || current.length > 1) && round <= 6) {
            const groups = packMaterials(current, MATERIAL_LIMIT);
            if (groups.length === 1 && current.join('\n\n').length <= MATERIAL_LIMIT) break;
            const next = [];
            for (let index = 0; index < groups.length; index += 1) {
                const recordId = recordPrefix + '_round_' + round + '_batch_' + (index + 1);
                const value = await runValidatedStep({
                    ownerId,
                    taskId,
                    recordType: 'summary_node',
                    recordId,
                    kind: 'knowledge_reduction',
                    stepKey: recordId,
                    prompt: buildKnowledgeMergePrompt(groups[index]),
                    parse: function(raw) {
                        return { content: parseMarkedFiles(raw, ['资料事实汇总'])['资料事实汇总'] };
                    },
                    control,
                    successMessage: '资料事实汇总批次 ' + (index + 1) + '/' + groups.length + ' 已保存'
                });
                next.push(value.content);
            }
            if (next.join('\n\n').length >= current.join('\n\n').length && next.length >= current.length) break;
            current = next;
            round += 1;
        }
        const reduced = current.join('\n\n');
        if (reduced.length > MATERIAL_LIMIT * 2 || current.length > 2) {
            throw makeControlError(
                'FULL_ANALYSIS_KNOWLEDGE_NOT_CONVERGED',
                '资料事实过长，六轮汇总后仍未能完整收敛。为避免静默丢掉后半部内容，任务已暂停并保留全部检查点'
            );
        }
        return reduced;
    }

    function mergeChapterBlocks(segmentNodes, plan) {
        const byNumber = new Map();
        const expectedNumbers = new Set((plan?.chapters || []).map(function(chapter) {
            return Number(chapter.chapterNumber);
        }));
        (Array.isArray(segmentNodes) ? segmentNodes : []).forEach(function(node) {
            (node.blocks || []).forEach(function(block) {
                const number = Number(block.chapterNumber);
                if (!expectedNumbers.has(number)) return;
                if (!byNumber.has(number)) byNumber.set(number, []);
                byNumber.get(number).push(block);
            });
        });
        const chapterByNumber = new Map((plan.chapters || []).map(function(chapter) {
            return [Number(chapter.chapterNumber), chapter];
        }));
        const lines = ['# 剧情总览', ''];
        let currentVolume = '';
        const analyzedNumbers = [];
        Array.from(byNumber.keys()).sort(function(left, right) { return left - right; }).forEach(function(number) {
            const blocks = byNumber.get(number);
            const source = chapterByNumber.get(number) || {};
            const volume = String(source.volume || '第一卷');
            if (volume !== currentVolume) {
                lines.push('# ' + volume.replace(/^#+\s*/, ''), '');
                currentVolume = volume;
            }
            const plots = Array.from(new Set(blocks.map(function(block) { return block.plot; }).filter(Boolean)));
            const endStates = Array.from(new Set(blocks.map(function(block) { return block.endState; }).filter(Boolean)));
            lines.push(
                '## 第' + number + '章 ' + String(source.title || blocks[0]?.title || ''),
                '剧情：' + plots.join('；'),
                '章末：' + (endStates[endStates.length - 1] || '原文未明确'),
                ''
            );
            analyzedNumbers.push(number);
        });
        return { content: lines.join('\n').trim(), analyzedNumbers };
    }

    async function buildCards(ownerId, taskId, chapters, control) {
        const recent = (Array.isArray(chapters) ? chapters : []).slice(-10);
        const chunks = getCore().buildAnalysisChunks(recent.map(function(chapter) {
            return {
                id: chapter.chapterId,
                chapterNumber: chapter.chapterNumber,
                title: chapter.title,
                volume: chapter.volume,
                content: chapter.content
            };
        }), { maxChars: 22000, maxChapters: 10 });
        const fragments = [];
        for (let index = 0; index < chunks.length; index += 1) {
            const recordId = 'card_fragment_' + (index + 1);
            const value = await runValidatedStep({
                ownerId,
                taskId,
                recordType: 'output',
                recordId,
                kind: 'card_fragment',
                stepKey: recordId,
                prompt: buildCardPrompt(chunks[index].text),
                parse: function(raw) { return { files: parseMarkedFiles(raw, CARD_FILE_NAMES) }; },
                control,
                successMessage: '续写卡片批次 ' + (index + 1) + '/' + chunks.length + ' 已保存'
            });
            fragments.push(value.files);
        }
        if (!fragments.length) throw new Error('没有可生成续写卡片的章节');
        let current = fragments;
        let round = 1;
        while (current.length > 1 && round <= 6) {
            const groups = [];
            let group = [];
            let length = 0;
            current.forEach(function(files) {
                const size = CARD_FILE_NAMES.reduce(function(total, name) { return total + String(files[name] || '').length; }, 0);
                if (group.length && length + size > MATERIAL_LIMIT) {
                    groups.push(group);
                    group = [];
                    length = 0;
                }
                group.push(files);
                length += size;
            });
            if (group.length) groups.push(group);
            const next = [];
            for (let index = 0; index < groups.length; index += 1) {
                if (groups[index].length === 1) {
                    next.push(groups[index][0]);
                    continue;
                }
                const recordId = 'card_merge_' + round + '_' + (index + 1);
                const value = await runValidatedStep({
                    ownerId,
                    taskId,
                    recordType: 'output',
                    recordId,
                    kind: 'card_merge',
                    stepKey: recordId,
                    prompt: buildCardMergePrompt(groups[index]),
                    parse: function(raw) { return { files: parseMarkedFiles(raw, CARD_FILE_NAMES) }; },
                    control,
                    successMessage: '续写卡片汇总批次已保存'
                });
                next.push(value.files);
            }
            if (next.length >= current.length) break;
            current = next;
            round += 1;
        }
        if (current.length !== 1) throw new Error('续写卡片材料过多，未能在安全范围内汇总');
        return current[0];
    }

    function makeTaskInput(input, options) {
        const ownerId = String(options?.ownerId || getOwnerId());
        const chapters = (Array.isArray(input.chapters) ? input.chapters : []).map(function(chapter, index) {
            return Object.assign({}, chapter, { chapterNumber: index + 1 });
        });
        const plan = getPlanner().buildPlan({
            bookName: input.bookName,
            chapters,
            sourceWorkId: input.sourceWorkId,
            analysisScope: options?.analysisScope
        });
        const model = getModelDescriptor();
        const taskId = getSchema().makeStableId('community_task', [
            ownerId,
            plan.sourceSnapshotId,
            Date.now(),
            Math.random()
        ]);
        const timestamp = nowIso();
        const task = {
            schemaVersion: getStore().SCHEMA_VERSION,
            taskId,
            ownerId,
            sourceWorkId: plan.sourceWorkId,
            sourceSnapshotId: plan.sourceSnapshotId,
            sourceFingerprint: plan.sourceFingerprint,
            sourceBookName: plan.bookName,
            sourceBookType: input.bookType === 'script' ? 'script' : 'novel',
            mode: options?.mode === 'staged' ? 'staged' : 'automatic',
            analysisScope: plan.analysisScope,
            status: 'prepared',
            phase: 'segments',
            segmentTotal: plan.segments.length,
            segmentManifest: plan.segments.map(function(segment) {
                return {
                    index: segment.index,
                    unitIds: segment.unitIds.slice(),
                    startChapterNumber: segment.startChapterNumber,
                    endChapterNumber: segment.endChapterNumber
                };
            }),
            nextSegmentIndex: 0,
            completedSegmentCount: 0,
            skippedSegmentIndices: [],
            actualModelCalls: 0,
            maxRetryDispatches: Math.max(24, plan.segments.length + 12),
            model,
            createdAt: timestamp,
            updatedAt: timestamp
        };
        return {
            task,
            plan,
            sourceSnapshot: Object.assign({}, plan.sourceSnapshot, { ownerId, taskId }),
            sourceUnits: plan.sourceUnits
        };
    }

    async function createTask(input, options) {
        const prepared = makeTaskInput(input || {}, options || {});
        await getStore().ensureCapacity(Math.max(2 * 1024 * 1024, Number(prepared.plan.totalBillableChars || 0) * 3));
        return getStore().createTaskBundle(prepared);
    }

    function rebuildPlanFromCheckpoint(bundle) {
        const task = bundle?.task || {};
        const snapshot = bundle?.sourceSnapshot || {};
        if (String(snapshot.sourceFingerprint || '') !== String(task.sourceFingerprint || '')) {
            throw new Error('本机检查点中的正文快照校验失败，已停止继续');
        }
        const chapters = (snapshot.chapters || []).map(function(chapter, index) {
            const title = String(chapter.chapterTitle || ('第' + (index + 1) + '章'));
            return {
                chapterId: String(chapter.chapterId || ''),
                chapterNumber: Number(chapter.chapterNumber) || index + 1,
                title,
                volume: String(chapter.volumeTitle || '第一卷'),
                content: String(chapter.content || ''),
                originalIndex: Number(chapter.chapterOrder || index)
            };
        });
        const unitMap = new Map((bundle.sourceUnits || []).map(function(unit) { return [String(unit.unitId || ''), unit]; }));
        const manifest = Array.isArray(task.segmentManifest) ? task.segmentManifest : [];
        if (!manifest.length || manifest.length !== Number(task.segmentTotal || 0)) {
            throw new Error('本机任务缺少冻结的正文分段清单，已停止自动恢复');
        }
        const segments = manifest.map(function(segment, index) {
            const units = (segment.unitIds || []).map(function(unitId) { return unitMap.get(String(unitId)); }).filter(Boolean);
            if (!units.length || units.length !== (segment.unitIds || []).length) {
                throw new Error('本机任务的正文分段检查点不完整，已停止自动恢复');
            }
            return {
                index: Number(segment.index || index + 1),
                chapters: units,
                unitIds: segment.unitIds.slice(),
                startChapterNumber: Number(segment.startChapterNumber || 0),
                endChapterNumber: Number(segment.endChapterNumber || 0)
            };
        });
        return { chapters, segments, sourceFingerprint: task.sourceFingerprint };
    }

    async function runTaskBody(ownerId, taskId, control) {
        let bundle = await loadTask(ownerId, taskId);
        if (!bundle) throw new Error('找不到要继续的全文分析任务');
        let task = bundle.task;
        if (!ACTIVE_TASK_STATUSES.has(task.status)) return bundle;
        await patchTask(ownerId, taskId, { status: 'running', lastError: '', pausedReason: '' });
        bundle = await loadTask(ownerId, taskId);
        task = bundle.task;
        const plan = rebuildPlanFromCheckpoint(bundle);

        const skipped = new Set(Array.isArray(task.skippedSegmentIndices) ? task.skippedSegmentIndices.map(Number) : []);
        let nextIndex = Math.max(0, Number(task.nextSegmentIndex || 0));
        let finalizingEarly = task.finalizeRequested === true;
        if (finalizingEarly) nextIndex = plan.segments.length;
        for (; nextIndex < plan.segments.length; nextIndex += 1) {
            if (control?.shouldStop?.()) {
                finalizingEarly = true;
                await patchTask(ownerId, taskId, { finalizeRequested: true, stoppedEarly: true });
                break;
            }
            if (control?.shouldPause?.()) {
                await patchTask(ownerId, taskId, { status: 'paused', pausedReason: 'user', nextSegmentIndex: nextIndex });
                return loadTask(ownerId, taskId);
            }
            if (control?.shouldSkip?.()) {
                skipped.add(nextIndex);
                control.consumeSkip?.();
                await patchTask(ownerId, taskId, {
                    skippedSegmentIndices: Array.from(skipped),
                    nextSegmentIndex: nextIndex + 1,
                    completedSegmentCount: nextIndex + 1
                });
                notify(control, '已按你的要求跳过当前正文段', { kind: 'warning', segmentIndex: nextIndex });
                continue;
            }
            const segment = plan.segments[nextIndex];
            const recordId = 'segment_' + (nextIndex + 1);
            notify(control, '正在分析正文段 ' + (nextIndex + 1) + '/' + plan.segments.length, {
                kind: 'current', segmentIndex: nextIndex, segmentTotal: plan.segments.length
            });
            try {
                await runValidatedStep({
                    ownerId,
                    taskId,
                    recordType: 'summary_node',
                    recordId,
                    kind: 'segment',
                    stepKey: recordId,
                    prompt: buildSegmentPrompt(segment),
                    parse: function(raw) {
                        const expected = uniqueNumbers((segment.chapters || []).map(function(part) {
                            return part.chapterNumber || part.chapterOrder + 1;
                        }));
                        const parsed = parseSegmentResult(raw, expected);
                        return {
                            segmentIndex: nextIndex,
                            chapterNumbers: expected,
                            blocks: parsed.blocks,
                            knowledgeFacts: parsed.files['资料事实']
                        };
                    },
                    taskPatch: {
                        nextSegmentIndex: nextIndex + 1,
                        completedSegmentCount: nextIndex + 1,
                        actualModelCalls: Number(bundle.task.actualModelCalls || 0) + 1
                    },
                    control,
                    successMessage: '正文段 ' + (nextIndex + 1) + '/' + plan.segments.length + ' 已完成并保存'
                });
            } catch(error) {
                if (control?.shouldSkip?.()) {
                    skipped.add(nextIndex);
                    control.consumeSkip?.();
                    await patchTask(ownerId, taskId, {
                        skippedSegmentIndices: Array.from(skipped),
                        nextSegmentIndex: nextIndex + 1,
                        completedSegmentCount: nextIndex + 1,
                        status: 'running'
                    });
                    continue;
                }
                if (control?.shouldStop?.()) {
                    finalizingEarly = true;
                    await patchTask(ownerId, taskId, { finalizeRequested: true, stoppedEarly: true });
                    break;
                }
                throw error;
            }
            bundle = await loadTask(ownerId, taskId);
            if (task.mode === 'staged' && nextIndex + 1 < plan.segments.length) {
                await patchTask(ownerId, taskId, {
                    status: 'paused',
                    pausedReason: 'staged_review',
                    nextSegmentIndex: nextIndex + 1
                });
                notify(control, '当前正文段已完成，请确认后继续下一段', { kind: 'review' });
                return loadTask(ownerId, taskId);
            }
        }

        bundle = await loadTask(ownerId, taskId);
        const segmentNodes = (bundle.records?.summary_node || []).filter(function(record) { return record?.kind === 'segment'; });
        if (!segmentNodes.length) throw new Error('还没有完成任何正文段，不能直接生成总结');
        await patchTask(ownerId, taskId, {
            status: 'merging',
            phase: 'profiles',
            finalizeRequested: finalizingEarly,
            stoppedEarly: finalizingEarly || nextIndex < plan.segments.length
        });
        notify(control, '正文分段已结束，正在汇总剧情和资料', { kind: 'current' });

        const plot = mergeChapterBlocks(segmentNodes, plan);
        let knowledge = await reduceKnowledge(
            ownerId,
            taskId,
            segmentNodes.map(function(record) { return record.knowledgeFacts; }),
            control
        );
        if (!String(knowledge || '').trim() || String(knowledge || '').trim() === '无') {
            knowledge = await reduceKnowledge(ownerId, taskId, [plot.content], control, 'plot_fallback');
        }
        const profiles = await runValidatedStep({
            ownerId,
            taskId,
            recordType: 'output',
            recordId: 'profiles',
            kind: 'profiles',
            stepKey: 'profiles',
            prompt: buildProfilePrompt(task.sourceBookName, knowledge, plot.content),
            parse: function(raw) { return { files: parseMarkedFiles(raw, PROFILE_FILE_NAMES) }; },
            taskPatch: { phase: 'cards' },
            control,
            successMessage: '设定集、信息表和角色列表已生成并保存'
        });

        const analyzed = new Set(plot.analyzedNumbers);
        const cardChapters = plan.chapters.filter(function(chapter) { return analyzed.has(Number(chapter.chapterNumber)); });
        const cards = await buildCards(ownerId, taskId, cardChapters, control);
        const files = {
            大纲: '',
            剧情总览: plot.content,
            设定集: profiles.files['设定集'],
            信息表: profiles.files['信息表'],
            角色列表: profiles.files['角色列表'],
            追踪表: cards['追踪表'],
            边界卡: cards['边界卡'],
            承接卡: cards['承接卡']
        };
        files.大纲 = buildFinalOutline(files);
        const missing = RESULT_FILE_NAMES.filter(function(name) { return !String(files[name] || '').trim(); });
        if (missing.length) throw new Error('最终分析结果缺少：' + missing.join('、'));
        const finalValue = {
            recordId: 'final',
            kind: 'final',
            files,
            resultHash: getCore().fingerprint(JSON.stringify(RESULT_FILE_NAMES.map(function(name) { return [name, files[name]]; }))),
            analyzedChapterNumbers: plot.analyzedNumbers,
            sourceChapterCount: plan.chapters.length,
            partial: plot.analyzedNumbers.length < plan.chapters.length
                || skipped.size > 0
                || finalizingEarly
                || nextIndex < plan.segments.length,
            generatedAt: nowIso()
        };
        await getStore().writeRecords(ownerId, taskId, [{
            recordType: 'output',
            recordId: 'final',
            value: finalValue
        }], {
            status: 'completed_unsaved',
            phase: 'done',
            completedAt: nowIso(),
            currentStep: '',
            analyzedChapterCount: plot.analyzedNumbers.length
        });
        notify(control, '全文分析已经完成，八个文件都已保存在本机检查点中', { kind: 'complete' });
        return loadTask(ownerId, taskId);
    }

    function taskExecutionLeaseKey(ownerId, taskId) {
        return 'zhiyu:community-full-analysis:execution:' + encodeURIComponent(String(ownerId || ''))
            + ':' + encodeURIComponent(String(taskId || ''));
    }

    function readTaskExecutionLease(ownerId, taskId) {
        try {
            const raw = window.localStorage?.getItem?.(taskExecutionLeaseKey(ownerId, taskId));
            const record = raw ? JSON.parse(raw) : null;
            return record && typeof record === 'object' ? record : null;
        } catch(error) {
            return null;
        }
    }

    function isTaskExecutionActive(ownerId, taskId) {
        const record = readTaskExecutionLease(ownerId, taskId);
        return !!record && Number(record.expiresAt || 0) > Date.now();
    }

    function acquirePersistentTaskLease(ownerId, taskId, writeToken, webLockHeld) {
        const storage = window.localStorage;
        if (!storage?.getItem || !storage?.setItem || !storage?.removeItem) {
            if (webLockHeld) return null;
            throw makeControlError('FULL_ANALYSIS_EXECUTION_LEASE_UNAVAILABLE', '当前浏览器缺少安全的多标签页任务锁，已停止运行');
        }
        const key = taskExecutionLeaseKey(ownerId, taskId);
        const current = readTaskExecutionLease(ownerId, taskId);
        if (current && Number(current.expiresAt || 0) > Date.now()) {
            throw makeControlError('FULL_ANALYSIS_ANOTHER_TAB_ACTIVE', '同一个全文分析任务仍由另一个标签页持有，请回到原标签页继续');
        }
        const token = {
            tokenId: String(window.crypto?.randomUUID?.() || (Date.now() + '-' + Math.random())),
            ownerId: String(ownerId || ''),
            taskId: String(taskId || ''),
            tabId: String(writeToken?.tabId || ''),
            leaseId: String(writeToken?.leaseId || ''),
            expiresAt: Date.now() + TASK_EXECUTION_LEASE_TTL_MS
        };
        storage.setItem(key, JSON.stringify(token));
        if (String(readTaskExecutionLease(ownerId, taskId)?.tokenId || '') !== token.tokenId) {
            throw makeControlError('FULL_ANALYSIS_ANOTHER_TAB_ACTIVE', '另一个标签页同时取得了全文分析任务锁，本页已停止运行');
        }
        return token;
    }

    function refreshPersistentTaskLease(token) {
        if (!token) return true;
        const key = taskExecutionLeaseKey(token.ownerId, token.taskId);
        const current = readTaskExecutionLease(token.ownerId, token.taskId);
        if (String(current?.tokenId || '') !== String(token.tokenId || '')
            || Number(current?.expiresAt || 0) <= Date.now()) return false;
        token.expiresAt = Date.now() + TASK_EXECUTION_LEASE_TTL_MS;
        window.localStorage.setItem(key, JSON.stringify(token));
        return String(readTaskExecutionLease(token.ownerId, token.taskId)?.tokenId || '') === token.tokenId;
    }

    function releasePersistentTaskLease(token) {
        if (!token) return;
        try {
            const current = readTaskExecutionLease(token.ownerId, token.taskId);
            if (String(current?.tokenId || '') === String(token.tokenId || '')) {
                window.localStorage.removeItem(taskExecutionLeaseKey(token.ownerId, token.taskId));
            }
        } catch(error) {}
    }

    async function withTaskExecutionLease(ownerId, taskId, operation) {
        const lease = window.ZHIYU_ACCOUNT_WRITE_LEASE;
        if (!lease?.beginWrite || !lease?.isWriteTokenCurrent || !lease?.endWrite) {
            throw makeControlError('FULL_ANALYSIS_EXECUTION_LEASE_UNAVAILABLE', '本机多标签页保护尚未就绪，请刷新页面后重试');
        }
        const locks = window.navigator?.locks;
        const runWithAccountLease = async function(webLockHeld) {
            const writeToken = lease.beginWrite(ownerId, { silent: true });
            if (!writeToken) {
                throw makeControlError('FULL_ANALYSIS_ANOTHER_TAB_ACTIVE', '另一个标签页正在使用当前作品数据。请回到原标签页继续全文分析，或先接管编辑权');
            }
            let taskLeaseToken = null;
            try {
                taskLeaseToken = acquirePersistentTaskLease(ownerId, taskId, writeToken, webLockHeld === true);
                return await operation(function assertCurrent() {
                    if (!lease.isWriteTokenCurrent(writeToken)) {
                        throw makeControlError('FULL_ANALYSIS_EXECUTION_LEASE_LOST', '当前标签页已失去编辑权，全文分析已停止，检查点仍保留');
                    }
                    if (!refreshPersistentTaskLease(taskLeaseToken)) {
                        throw makeControlError('FULL_ANALYSIS_EXECUTION_LEASE_LOST', '当前标签页已失去全文分析任务锁，已停止运行，检查点仍保留');
                    }
                });
            } finally {
                releasePersistentTaskLease(taskLeaseToken);
                lease.endWrite(writeToken);
            }
        };
        if (!locks?.request) return runWithAccountLease(false);
        const lockName = 'zhiyu-community-full-analysis:' + String(ownerId || '') + ':' + String(taskId || '');
        return locks.request(lockName, { mode: 'exclusive', ifAvailable: true }, function(lock) {
            if (!lock) {
                throw makeControlError('FULL_ANALYSIS_ANOTHER_TAB_ACTIVE', '同一个全文分析任务正在另一个标签页运行，请勿重复启动');
            }
            return runWithAccountLease(true);
        });
    }

    async function runTask(ownerId, taskId, control) {
        return withTaskExecutionLease(ownerId, taskId, function(assertExecutionOwnership) {
            const guardedControl = Object.assign({}, control || {}, { assertExecutionOwnership });
            return runTaskBody(ownerId, taskId, guardedControl);
        });
    }

    async function getFinalResult(ownerId, taskId) {
        const bundle = await loadTask(ownerId, taskId);
        return outputRecord(bundle, 'final');
    }

    async function listTasks(ownerId) {
        return getStore().listTasks(String(ownerId || getOwnerId()));
    }

    async function deleteTask(ownerId, taskId) {
        return getStore().deleteTask(String(ownerId || getOwnerId()), String(taskId || ''));
    }

    window.ZhiyuCommunityFullAnalysisEngine = Object.freeze({
        RESULT_FILE_NAMES,
        ACTIVE_TASK_STATUSES,
        getOwnerId,
        getModelDescriptor,
        makeTaskInput,
        createTask,
        loadTask,
        listTasks,
        runTask,
        isTaskExecutionActive,
        getFinalResult,
        deleteTask,
        parseMarkedFiles,
        parseChapterBlocks,
        parseSegmentResult,
        buildFinalOutline
    });
})(window);
