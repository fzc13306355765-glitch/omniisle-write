(function(window, document) {
    'use strict';

    const AppState = window.ZHIYU_APP_STATE;
    const IDB = window.ZHIYU_IDB;
    const Utils = window.ZHIYU_UTILS || window.Utils || {};
    const Toast = window.ZHIYU_TOAST || window.Toast || { warn() {}, error() {}, success() {}, info() {} };
    const Confirm = window.ZHIYU_CONFIRM || window.Confirm || { show() { return Promise.resolve(false); } };
    const STATE_VERSION = 1;
    const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
    const STAGE_TOTALS = Object.freeze({ short: 2, medium: 3, long: 5, xlong: 8 });
    const TARGET_CHAPTERS = Object.freeze({ short: 60, medium: 200, long: 400, xlong: 800 });
    const REQUEST_RULES = Object.freeze({
        short: Object.freeze({ estimatedCalls: 1 }),
        medium: Object.freeze({ estimatedCalls: 1 }),
        long: Object.freeze({ estimatedCalls: 2 }),
        xlong: Object.freeze({ estimatedCalls: 4 })
    });
    const RUNTIME_SESSION_ID = 'outline_inquiry_runtime:'
        + Date.now().toString(36)
        + ':'
        + Math.random().toString(36).slice(2);
    const stateCache = new Map();
    let generationMode = 'direct';
    let feedbackMode = 'suggest';
    let activeController = null;
    let restoring = false;
    let observedContextKey = '';

    function uid() {
        return String(window.AccountDataScope?.getActiveUid?.() || AppState?.auth?.uid || '');
    }

    function bookName() {
        return String(AppState?.chapter?.book || '');
    }

    function stateKey(accountUid, book) {
        return 'outline_inquiry_state:' + encodeURIComponent(accountUid || '') + ':' + encodeURIComponent(book || '');
    }

    function runningKey(accountUid) {
        return 'outline_inquiry_running:' + encodeURIComponent(accountUid || '');
    }

    function currentCacheKey() {
        return stateKey(uid(), bookName());
    }

    function isTerminal(state) {
        return !state || ['completed', 'cancelled', 'expired'].includes(state.status);
    }

    function isStateFromCurrentRuntime(state) {
        return !!state && state.runtimeSessionId === RUNTIME_SESSION_ID;
    }

    function isCurrentNormalOutline() {
        return (typeof window.getOutlineMode !== 'function' || window.getOutlineMode() === 'outline')
            && !(typeof window.isAdvancedOutlineMode === 'function' && window.isAdvancedOutlineMode());
    }

    function selectedWordCount() {
        return String(document.querySelector('#outlineModal .wordcount-option.selected')?.dataset?.wc || 'medium');
    }

    function splitChapterRanges(length) {
        const totalStages = STAGE_TOTALS[length] || STAGE_TOTALS.medium;
        const chapterStages = totalStages - 1;
        const target = TARGET_CHAPTERS[length] || TARGET_CHAPTERS.medium;
        const base = Math.floor(target / chapterStages);
        const remainder = target % chapterStages;
        const ranges = [];
        let start = 1;
        for (let index = 0; index < chapterStages; index += 1) {
            const size = base + (index < remainder ? 1 : 0);
            const end = start + size - 1;
            ranges.push({ start, end });
            start = end + 1;
        }
        return ranges;
    }

    function stageDefinition(state, index) {
        if (index === 1) return { index, kind: 'foundation', label: '基础设定与角色信息' };
        const range = state.chapterRanges[index - 2];
        return {
            index,
            kind: 'chapters',
            start: range.start,
            end: range.end,
            label: '章节粗纲第' + (index - 1) + '/' + (state.totalStages - 1) + '阶段'
        };
    }

    async function loadState(accountUid, book) {
        const key = stateKey(accountUid, book);
        if (stateCache.has(key)) return stateCache.get(key);
        const value = await IDB?.get?.(key).catch(() => null);
        if (value) stateCache.set(key, value);
        return value || null;
    }

    async function saveState(state) {
        if (!IDB || typeof IDB.set !== 'function') {
            throw new Error('当前浏览器无法使用大容量草稿存储，不能开始询问大纲。');
        }
        state.runtimeSessionId = RUNTIME_SESSION_ID;
        state.updatedAt = Date.now();
        state.expiresAt = state.expiresAt || (Date.now() + EXPIRY_MS);
        const key = stateKey(state.uid, state.bookName);
        stateCache.set(key, state);
        await IDB.set(key, state);
    }

    async function assertInquiryStorageReady() {
        if (!IDB
            || typeof IDB.get !== 'function'
            || typeof IDB.set !== 'function'
            || typeof IDB.remove !== 'function') {
            throw new Error('当前浏览器无法使用大容量草稿存储，不能开始询问大纲。');
        }
        const key = 'outline_inquiry_storage_probe:' + encodeURIComponent(uid());
        const token = 'probe:' + Date.now() + ':' + Math.random().toString(36).slice(2);
        try {
            await IDB.set(key, { token, createdAt: Date.now() });
            const stored = await IDB.get(key);
            if (!stored || stored.token !== token) {
                throw new Error('询问大纲草稿存储读写校验失败。');
            }
        } catch (error) {
            throw new Error('当前浏览器无法可靠保存询问大纲草稿，请释放浏览器存储空间后重试。', {
                cause: error
            });
        } finally {
            await IDB.remove(key).catch(() => {});
        }
    }

    async function removeState(state) {
        if (!state) return;
        const key = stateKey(state.uid, state.bookName);
        stateCache.delete(key);
        await IDB?.remove?.(key).catch(() => {});
    }

    async function clearCancelledInquiryLocally(state) {
        if (!state) return;
        state.status = 'cancelled';
        state.currentPartial = '';
        state.stages = [];
        await removeState(state);
        await releaseRunning(state);
        AppState.outline.content = state.previousOutlineContent || '';
        setResultText(state.previousOutlineContent || window.getOutlinePlaceholder?.() || '点击「开始生成大纲」后内容将在此区域显示...');
        document.getElementById('outlineInquiryInteraction').hidden = true;
        generationMode = 'direct';
        renderMode();
        renderControls(null);
        window.setOutlineStep?.('', false);
    }

    async function forceStopInquiryAfterReload(state) {
        if (!state || isTerminal(state)) return false;
        activeController?.abort(new DOMException('page_reloaded_inquiry', 'AbortError'));
        state.status = 'paused';
        state.stageReady = true;
        state.pausedOperation = state.activeOperation || 'stage';
        await saveState(state);
        Utils.appendLog?.(null, '页面刷新后已暂停询问大纲，已有内容保存在本机，可继续生成', 'warn');
        return true;
    }

    async function claimRunning(state) {
        const key = runningKey(state.uid);
        const current = await IDB?.get?.(key).catch(() => null);
        if (current
            && current.taskId !== state.taskId
            && Date.now() - Number(current.updatedAt || 0) < 5 * 60 * 1000) {
            throw new Error('本机已有另一个询问阶段正在生成，请等待完成或先停止。');
        }
        await IDB?.set?.(key, {
            taskId: state.taskId,
            bookName: state.bookName,
            stageIndex: state.currentStage,
            updatedAt: Date.now()
        });
    }

    async function releaseRunning(state) {
        const key = runningKey(state.uid);
        const current = await IDB?.get?.(key).catch(() => null);
        if (!current || current.taskId === state.taskId) await IDB?.remove?.(key).catch(() => {});
    }

    function startRunningHeartbeat(state) {
        return window.setInterval(() => {
            return claimRunning(state).catch(() => {});
        }, 60000);
    }

    function createSerializedSaveQueue(save) {
        let timer = 0;
        let error = null;
        let pending = Promise.resolve();
        const persist = () => {
            pending = pending
                .then(() => save())
                .catch(saveError => {
                    error = saveError;
                });
        };
        return {
            queue() {
                if (timer) return;
                timer = window.setTimeout(() => {
                    timer = 0;
                    persist();
                }, 200);
            },
            async flush() {
                if (timer) {
                    window.clearTimeout(timer);
                    timer = 0;
                    persist();
                }
                await pending;
                if (error) throw error;
            }
        };
    }

    function stageContent(state, index) {
        return state.stages.find(item => Number(item.index) === Number(index))?.content || '';
    }

    function joinContent(state, includePartial) {
        const completed = state.stages
            .slice()
            .sort((a, b) => Number(a.index) - Number(b.index))
            .map(item => String(item.content || '').trim())
            .filter(Boolean);
        if (includePartial && state.currentPartial?.trim()) completed.push(state.currentPartial.trim());
        return completed.join('\n\n');
    }

    function isResultBoxNearBottom(box) {
        if (!box) return true;
        return box.scrollHeight - box.scrollTop - box.clientHeight <= 1;
    }

    function setResultText(text, options) {
        const box = document.getElementById('outlineResultBox');
        if (!box) return;
        const preserveLivePosition = options?.preserveLivePosition === true;
        const shouldFollowLatest = preserveLivePosition && isResultBoxNearBottom(box);
        const previousScrollTop = box.scrollTop;
        box.textContent = String(text || '');
        if (shouldFollowLatest) {
            box.scrollTop = box.scrollHeight;
        } else if (preserveLivePosition) {
            box.scrollTop = previousScrollTop;
        } else {
            box.scrollTop = 0;
        }
    }

    function renderResult(state) {
        const box = document.getElementById('outlineResultBox');
        if (!box || !state || state.uid !== uid() || state.bookName !== bookName()) return;
        setResultText(
            joinContent(state, state.status === 'generating' || state.status === 'paused'),
            { preserveLivePosition: true }
        );
        const readOnly = !isTerminal(state);
        box.contentEditable = readOnly ? 'false' : 'true';
        box.dataset.inquiryReadonly = readOnly ? 'true' : 'false';
        box.style.background = state.status === 'generating' ? '#e3f2fd' : '';
    }

    function setFeedbackMode(mode) {
        feedbackMode = mode === 'revise' ? 'revise' : 'suggest';
        document.querySelectorAll('#outlineInquiryFeedbackToggle [data-inquiry-feedback]').forEach(button => {
            button.classList.toggle('active', button.dataset.inquiryFeedback === feedbackMode);
        });
        const input = document.getElementById('outlineInquiryFeedbackInput');
        if (input) {
            input.placeholder = feedbackMode === 'revise'
                ? '输入内容用于重新生成当前阶段，不进入下一阶段。'
                : '输入内容用于指导下一阶段，不改动当前已生成内容。';
        }
        syncSendButton();
    }

    function syncSendButton(state) {
        const button = document.getElementById('btnOutlineInquirySend');
        const input = document.getElementById('outlineInquiryFeedbackInput');
        if (!button) return;
        const running = state?.status === 'generating';
        const canResume = state?.status === 'paused' && !!String(state.currentPartial || '').trim();
        const disabled = !running && !canResume && feedbackMode === 'revise' && !String(input?.value || '').trim();
        button.disabled = disabled;
        button.textContent = running ? '■' : '➤';
        button.title = running ? '取消当前阶段生成' : (canResume ? '继续当前阶段' : '发送');
        button.setAttribute('aria-label', button.title);
        document.getElementById('outlineInquiryInteraction')?.classList.toggle('is-running', running);
    }

    function lockConfiguration(locked) {
        const modal = document.getElementById('outlineModal');
        modal?.classList.toggle('outline-inquiry-locked', !!locked);
        document.querySelectorAll('#outlineGenerationModeToggle button, #btnOutlineModelSelect').forEach(button => {
            button.disabled = !!locked;
        });
    }

    function renderControls(state) {
        const interaction = document.getElementById('outlineInquiryInteraction');
        const start = document.getElementById('btnStartOutline');
        const save = document.getElementById('btnOutlineSave');
        const active = state && !isTerminal(state);
        const directRuntime = AppState?.outline?.generationRuntime;
        const directGenerationActive = !active
            && generationMode === 'direct'
            && !!window.isCurrentOutlineGenerationRuntime?.(directRuntime, 'outline');
        if (interaction) interaction.hidden = !active || !state.stageReady;
        if (start && isCurrentNormalOutline()) {
            if (active) {
                start.textContent = '取消询问';
                start.dataset.inquiryActive = 'true';
                delete start.dataset.generating;
            } else if (directGenerationActive) {
                start.textContent = '停止生成';
                start.dataset.inquiryActive = 'false';
                start.dataset.generating = 'true';
            } else {
                start.textContent = '生成大纲';
                start.dataset.inquiryActive = 'false';
                delete start.dataset.generating;
            }
            start.disabled = false;
        }
        if (save && isCurrentNormalOutline()) {
            save.disabled = generationMode === 'inquiry'
                ? (!state || state.status !== 'completed')
                : false;
        }
        lockConfiguration(!!active);
        syncSendButton(state);
    }

    function renderMode() {
        document.querySelectorAll('#outlineGenerationModeToggle [data-outline-generation-mode]').forEach(button => {
            button.classList.toggle('active', button.dataset.outlineGenerationMode === generationMode);
        });
    }

    function highestChapter(text) {
        let max = 0;
        const pattern = /第\s*([0-9０-９]+)\s*章/g;
        let match;
        while ((match = pattern.exec(String(text || '')))) {
            const value = Number(String(match[1]).replace(/[０-９]/g, char => String(char.charCodeAt(0) - 65248)));
            if (Number.isFinite(value)) max = Math.max(max, value);
        }
        return max;
    }

    function chapterHeadings(text) {
        if (typeof window.getOutlineChapterHeadings === 'function') {
            return window.getOutlineChapterHeadings(text);
        }
        const headings = [];
        const source = String(text || '');
        const pattern = /^([ \t]*(?:#{1,6}[ \t]*)?第[ \t]*)(\d{1,12})([ \t]*章(?:[^\r\n]*)?)$/gmi;
        let match;
        while ((match = pattern.exec(source))) {
            headings.push({ number: Number(match[2]), index: match.index, text: match[0] });
        }
        return headings;
    }

    function normalizeChapterStage(content, definition, allowPartial) {
        const rawSource = String(content || '');
        const rawHeadings = chapterHeadings(rawSource);
        if (!rawHeadings.length) {
            throw new Error(definition.label + '没有识别到章节标题，应从第' + definition.start + '章开始');
        }
        const source = rawSource.slice(rawHeadings[0].index).trim();
        const headings = chapterHeadings(source);
        const expectedCount = definition.end - definition.start + 1;
        let headingIndex = 0;
        let normalized = source.replace(
            /^([ \t]*(?:#{1,6}[ \t]*)?第[ \t]*)([零〇两一二三四五六七八九十百千万\d]{1,12})([ \t]*章(?:[^\r\n]*)?)$/gmi,
            function(_line, prefix, _number, suffix) {
                const number = definition.start + headingIndex;
                headingIndex += 1;
                return prefix + number + suffix;
            }
        );
        if (headings.length > expectedCount) {
            const normalizedHeadings = chapterHeadings(normalized);
            normalized = normalized.slice(0, normalizedHeadings[expectedCount].index).trimEnd();
        }
        const actualCount = Math.min(headings.length, expectedCount);
        if (!allowPartial && actualCount < expectedCount) {
            throw new Error(
                definition.label + '只生成到第' + (definition.start + actualCount - 1)
                + '章，还需继续到第' + definition.end + '章'
            );
        }
        return {
            content: normalized,
            chapterCount: actualCount,
            nextChapter: Math.min(definition.end + 1, definition.start + actualCount),
            complete: actualCount >= expectedCount
        };
    }

    function tail(text, maxLength) {
        const value = String(text || '');
        return value.slice(Math.max(0, value.length - maxLength));
    }

    function buildStagePrompt(state, definition, suggestion) {
        if (definition.kind === 'foundation') {
            const foundationFormat = String(window.ZHIYU_FORMAT_CONSTRAINTS?.OUTLINE_FOUNDATION || '');
            return state.baseInput + '\n\n---\n【普通大纲询问模式：基础设定与角色信息阶段】\n'
                + foundationFormat + '\n'
                + '这是本次工作流的第一阶段。只完成开篇可用的稳定设定和角色初始信息。\n'
                + '本阶段严禁生成任何“第X章”章节粗纲。\n'
                + '不得生成全书阶段剧情、未来角色出场时间、隐藏身份揭露、背叛、死亡、结局或终局方向。\n'
                + '末尾如需给出“章节承接摘要”，只能压缩基础设定，不得加入未来剧情。\n'
                + '只输出本阶段内容，不解释工作流。';
        }
        const confirmedFoundation = tail(stageContent(state, 1), 10000);
        const previous = state.stages
            .filter(item => item.kind === 'chapters' && item.index < definition.index)
            .sort((a, b) => a.index - b.index)
            .map(item => item.content)
            .join('\n\n');
        const actualHighest = highestChapter(previous);
        const suggested = String(suggestion || '').trim();
        return state.baseInput + '\n\n---\n【普通大纲询问模式：' + definition.label + '】\n'
            + '所选模板要求的书名、简介、世界观、人物、力量体系等基础设定，已经在第一阶段完成。\n'
            + '从本阶段开始，模板只用于保持创意方向、风格、节奏和章节写法，不得重新生成或改写任何章节前内容。\n'
            + '已确认的设定与全书规划：\n' + confirmedFoundation + '\n\n'
            + (previous ? '上一章节粗纲阶段末尾：\n' + tail(previous, 7000) + '\n\n' : '')
            + '当前已确认的实际最高章号：第' + actualHighest + '章。\n'
            + '本阶段必须从第' + definition.start + '章连续生成到第' + definition.end + '章；章号不得重叠、倒退或缺失。\n'
            + (suggested ? '用户对本阶段的建议：' + suggested + '\n' : '')
            + '每章保持普通大纲的简短粗剧情格式，不写正文或细纲。\n'
            + (definition.index < state.totalStages
                ? '这不是最后阶段，只能停在阶段高潮、转折或悬念；不得完成最终大战、揭晓全部真相、让主角死亡并结束全书，也不得写全书完结。\n'
                : '这是最后阶段，请完成终局冲突并让全书自然收束。\n')
            + '只输出本阶段章节粗纲，不重复设定，不输出解释。';
    }

    function buildRevisionPrompt(state, definition, instruction, existingOverride) {
        const existing = String(existingOverride ?? stageContent(state, definition.index)).trim();
        const foundationFormat = definition.kind === 'foundation'
            ? String(window.ZHIYU_FORMAT_CONSTRAINTS?.OUTLINE_FOUNDATION || '')
            : '';
        return state.baseInput + '\n\n---\n【普通大纲询问模式：修改当前阶段】\n'
            + '当前阶段：' + definition.label + '\n'
            + (definition.kind === 'chapters'
                ? '章号范围必须保持第' + definition.start + '章到第' + definition.end + '章连续不变。\n'
                : foundationFormat + '\n本阶段仍只生成基础设定与角色初始信息，不得生成任何“第X章”章节粗纲或未来剧情规划。\n')
            + '用户修改要求：' + String(instruction || '').trim() + '\n\n'
            + '需要整体替换的原阶段内容：\n' + existing + '\n\n'
            + '请完整重新生成当前阶段，只输出替换后的阶段内容。';
    }

    function buildResumePrompt(basePrompt, definition, retainedPartial) {
        const partial = String(retainedPartial || '').trim();
        if (!partial) return basePrompt;
        if (definition.kind === 'foundation') {
            return basePrompt + '\n\n---\n【继续未完成的基础设定与角色信息】\n'
                + '以下内容已经成功生成并保留，不要复述、改写或从头重来：\n'
                + tail(partial, 12000) + '\n\n'
                + '请从最后一句之后继续补全本阶段。仍然不得生成任何“第X章”章节粗纲，只输出新增的续接内容。';
        }
        const normalized = normalizeChapterStage(partial, definition, true);
        if (normalized.complete) return '';
        return basePrompt + '\n\n---\n【继续未完成的章节粗纲】\n'
            + '以下是本阶段已经成功生成并保留的末尾，不要复述或重新生成已有章节：\n'
            + tail(normalized.content, 12000) + '\n\n'
            + '请只从第' + normalized.nextChapter + '章继续，连续写到第' + definition.end
            + '章。只输出新增章节，不要输出解释。';
    }

    function currentModelConfig(state) {
        const model = window.getOutlineModelConfig?.();
        if (!model?.base || !model?.model) {
            throw new Error('请先在设置中配置大纲模型的 API 地址、密钥和模型名称');
        }
        if (state?.model?.model && state.model.model !== model.model) {
            throw new Error('当前大纲模型与开始询问时不同，请切回原模型后继续');
        }
        return model;
    }

    async function streamStage(state, prompt, retainedPrefix) {
        const model = currentModelConfig(state);
        const controller = new AbortController();
        activeController = controller;
        const partialSaves = createSerializedSaveQueue(() => saveState(state));
        const prefix = String(retainedPrefix || '').trim();
        state.currentPartial = prefix;
        await saveState(state);
        try {
            let full = '';
            let generationError = null;
            const generated = await window.streamGenerate(
                { ...model, maxTokens: state.maxTokens },
                state.systemPrompt || '你是一名专业的中文网络小说大纲策划师。',
                prompt,
                function(chunk) {
                    full += String(chunk || '');
                    state.currentPartial = [prefix, full].filter(Boolean).join('\n\n');
                    renderResult(state);
                    partialSaves.queue();
                },
                function(content) {
                    if (String(content || '').trim()) full = String(content);
                },
                function(error) { generationError = error; },
                controller.signal
            );
            if (generationError) throw generationError;
            const finalContent = String(generated || full || '').trim();
            if (!finalContent) throw new Error('自备模型没有返回阶段内容，请重试当前阶段');
            await partialSaves.flush();
            state.requestCount = Number(state.requestCount || 0) + 1;
            return [prefix, finalContent].filter(Boolean).join('\n\n');
        } finally {
            await partialSaves.flush();
        }
    }

    function upsertStage(state, definition, content) {
        const clean = String(content || '').trim();
        const existing = state.stages.find(item => item.index === definition.index);
        const record = { ...definition, content: clean, confirmedAt: Date.now() };
        if (existing) Object.assign(existing, record);
        else state.stages.push(record);
        state.stages.sort((a, b) => a.index - b.index);
    }

    function normalizeStageContentForStorage(definition, content) {
        let clean = String(content || '').trim();
        if (definition?.kind !== 'foundation') return clean;
        if (typeof window.normalizeOutlineFoundationSegment !== 'function') {
            throw new Error('基础设定范围校验尚未加载，请刷新页面后重试。');
        }
        clean = String(window.normalizeOutlineFoundationSegment(clean)?.content || '').trim();
        if (!clean) {
            throw new Error('基础设定与角色信息阶段没有返回可保留内容，请修改建议后重试');
        }
        return clean;
    }

    function normalizeCompletedStageContent(definition, content) {
        const clean = normalizeStageContentForStorage(definition, content);
        if (definition?.kind !== 'chapters') return clean;
        return normalizeChapterStage(clean, definition, false).content;
    }

    async function runStage(state, options) {
        const opts = options || {};
        const definition = stageDefinition(state, state.currentStage);
        const retainedPartial = String(state.currentPartial || '');
        await claimRunning(state);
        const runningHeartbeat = startRunningHeartbeat(state);
        state.status = 'generating';
        state.stageReady = false;
        state.currentPartial = '';
        state.activeOperation = opts.revision ? 'revision' : 'stage';
        state.activeInstruction = opts.revision ? String(opts.instruction || state.activeInstruction || '') : '';
        await saveState(state);
        renderControls(state);
        renderResult(state);
        Utils.appendLog?.(null, '大纲生成询问中', 'progress');
        Utils.appendLog?.(null, '✍️ 正在生成' + definition.label, 'progress');
        window.setOutlineStep?.('正在生成' + definition.label + '...', true);
        try {
            let prompt = state.stagePrompts[String(definition.index)];
            if (opts.revision) {
                const revisionSource = String(
                    state.revisionSourceContent || stageContent(state, definition.index)
                ).trim();
                if (!revisionSource) {
                    throw new Error('没有找到需要修改的当前阶段内容，请重新生成该阶段');
                }
                state.revisionSourceContent = revisionSource;
                state.stages = state.stages.filter(item => item.index !== definition.index);
                state.currentPartial = '';
                prompt = buildRevisionPrompt(
                    state,
                    definition,
                    state.activeInstruction,
                    revisionSource
                );
                await saveState(state);
                renderResult(state);
            } else {
                if (!prompt) {
                    prompt = buildStagePrompt(state, definition, state.pendingSuggestion || '');
                    state.stagePrompts[String(definition.index)] = prompt;
                    await saveState(state);
                }
            }
            if (retainedPartial.trim()) {
                const resumePrompt = buildResumePrompt(prompt, definition, retainedPartial);
                if (!resumePrompt) {
                    const completedContent = normalizeCompletedStageContent(definition, retainedPartial);
                    upsertStage(state, definition, completedContent);
                    state.currentPartial = '';
                    state.stageReady = true;
                    state.status = 'waiting';
                    await saveState(state);
                    renderResult(state);
                    renderControls(state);
                    return;
                }
                prompt = resumePrompt;
            }
            let content = await streamStage(state, prompt, retainedPartial);
            content = normalizeCompletedStageContent(definition, content);
            upsertStage(state, definition, content);
            state.currentPartial = '';
            state.stageReady = true;
            state.status = 'waiting';
            state.pendingSuggestion = '';
            state.pausedOperation = '';
            state.activeInstruction = '';
            if (opts.revision) {
                state.modificationSuccessCount = Math.max(0, Number(state.modificationSuccessCount || 0)) + 1;
                state.revisionSourceContent = '';
            }
            await saveState(state);
            renderResult(state);
            renderControls(state);
            Utils.appendLog?.(null, '✅ ' + definition.label + (opts.revision ? '修改完成' : '生成完成'), 'success');
            Utils.appendLog?.(null, '大纲生成询问中', 'progress');
            window.setOutlineStep?.('等待确认：' + definition.label, false);
        } catch (error) {
            if (state.cancelling) return;
            const revisionFallback = opts.revision
                ? String(state.revisionSourceContent || '').trim()
                : '';
            if (revisionFallback) {
                upsertStage(state, definition, revisionFallback);
                state.currentPartial = '';
                state.pausedOperation = '';
            } else if (!String(state.currentPartial || '').trim() && retainedPartial.trim()) {
                state.currentPartial = retainedPartial;
            }
            if (error?.name === 'AbortError') {
                state.status = 'paused';
                state.stageReady = true;
                state.pausedOperation = state.activeOperation;
                Utils.appendLog?.(null, '已停止当前阶段；已有内容已保留，可再次发送继续', 'warn');
                window.setOutlineStep?.('当前阶段已停止，可继续', false);
            } else {
                state.status = 'paused';
                state.stageReady = true;
                const message = window.formatAiErrorForDisplay?.(error, '询问大纲生成失败') || String(error?.message || error);
                Utils.appendLog?.(null, message, 'error');
                Toast.error(message);
                window.setOutlineStep?.('当前阶段生成失败，可重试', false);
            }
            await saveState(state);
            renderResult(state);
            renderControls(state);
        } finally {
            window.clearInterval(runningHeartbeat);
            activeController = null;
            await releaseRunning(state);
        }
    }

    async function finalizeInquiry(state) {
        state.status = 'finalizing';
        state.stageReady = false;
        await saveState(state);
        renderControls(state);
        try {
            state.status = 'completed';
            state.stageReady = false;
            const content = joinContent(state, false);
            AppState.outline.content = content;
            await saveState(state);
            renderResult(state);
            renderControls(state);
            document.getElementById('outlineInquiryInteraction').hidden = true;
            Utils.appendLog?.(null, '✅ 大纲生成询问完成，共调用自备模型'
                + Number(state.requestCount || 0) + '次', 'success');
            window.setOutlineStep?.('', false);
            Toast.success('询问大纲已完成，可以保存到大纲');
        } catch (error) {
            state.status = 'waiting';
            state.stageReady = true;
            await saveState(state).catch(() => {
                stateCache.set(stateKey(state.uid, state.bookName), state);
            });
            renderControls(state);
            throw error;
        }
    }

    async function handleFeedback(state) {
        if (!state || isTerminal(state)) return;
        if (state.status === 'generating') {
            activeController?.abort(new DOMException('user_cancelled_stage', 'AbortError'));
            return;
        }
        if (state.status === 'paused' && String(state.currentPartial || '').trim()) {
            await runStage(state, {
                retry: true,
                revision: state.pausedOperation === 'revision',
                instruction: state.activeInstruction || ''
            });
            return;
        }
        const input = document.getElementById('outlineInquiryFeedbackInput');
        const text = String(input?.value || '').trim();
        if (feedbackMode === 'revise') {
            if (!text) return;
            if (input) input.value = '';
            await runStage(state, { revision: true, instruction: text });
            return;
        }
        if (input) input.value = '';
        if (state.currentStage >= state.totalStages && state.stages.length >= state.totalStages) {
            await finalizeInquiry(state);
            return;
        }
        if (state.status === 'paused' && !stageContent(state, state.currentStage)) {
            await runStage(state, { retry: true });
            return;
        }
        state.pendingSuggestion = text;
        state.currentStage += 1;
        state.stageReady = false;
        await saveState(state);
        await runStage(state);
    }

    async function startInquiry() {
        if (!uid()) throw new Error('本机身份尚未初始化，请刷新页面后重试');
        if (!bookName()) throw new Error('请先选择作品');
        if (!AppState.outline.genres?.length) throw new Error('请选择至少一个题材');
        const modelCfg = window.getOutlineModelConfig?.();
        if (!modelCfg?.base || !modelCfg?.model) {
            throw new Error('请先在设置中配置大纲模型的 API 地址、密钥和模型名称');
        }
        const templateId = window.getTemplateContextTemplateId?.('outline') || AppState.outline.templateId || '';
        if (!templateId) throw new Error('请选择一个提示词模版');
        const length = selectedWordCount();
        const prompt = window.buildOutlineGenerationPrompt({
            AppState,
            OUTLINE_WORDCOUNT: window.OUTLINE_WORDCOUNT,
            FORMAT_CONSTRAINTS: window.ZHIYU_FORMAT_CONSTRAINTS || {},
            gTPublic: window.gT || window.gTPublic,
            wcKey: length,
            coreSummary: document.getElementById('outlineCoreSummary')?.value.trim() || ''
        });
        const totalStages = STAGE_TOTALS[length] || STAGE_TOTALS.medium;
        const requestId = 'outline_inquiry:' + uid() + ':' + Date.now().toString(36);
        await assertInquiryStorageReady();
        const previousOutlineContent = String(AppState.outline.content || '');
        const state = {
            version: STATE_VERSION,
            uid: uid(),
            bookName: bookName(),
            status: 'waiting',
            taskId: requestId,
            requestId,
            length,
            totalStages,
            targetChapters: TARGET_CHAPTERS[length],
            chapterRanges: splitChapterRanges(length),
            currentStage: 1,
            stages: [],
            stagePrompts: {},
            currentPartial: '',
            pendingSuggestion: '',
            stageReady: false,
            modificationSuccessCount: 0,
            revisionSourceContent: '',
            templateId: prompt.templateId || templateId,
            templateTitle: prompt.template?.title || '',
            systemPrompt: prompt.systemPrompt || '',
            baseInput: prompt.userMessage,
            lockedInputs: {
                genres: [...AppState.outline.genres],
                summary: document.getElementById('outlineCoreSummary')?.value || '',
                length,
                templateId: prompt.templateId || templateId,
                modelId: modelCfg.id || modelCfg.model
            },
            model: {
                id: modelCfg.id || '',
                model: modelCfg.model
            },
            maxTokens: 16384,
            requestPlan: REQUEST_RULES[length] || REQUEST_RULES.medium,
            requestCount: 0,
            previousOutlineContent,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            expiresAt: Date.now() + EXPIRY_MS
        };
        await saveState(state).catch(storageError => {
            throw new Error('浏览器未能保存询问草稿，请释放存储空间后重试。', { cause: storageError });
        });
        setFeedbackMode('suggest');
        setResultText('');
        await runStage(state);
    }

    async function cancelInquiry(state) {
        if (!state || isTerminal(state)) return;
        const confirmed = await Confirm.show(
            '确定取消本次询问大纲吗？\n取消后不能继续当前流程，已经成功生成的内容会删除。',
            {
                title: '取消询问大纲',
                confirmText: '确定取消',
                cancelText: '继续询问',
                zIndex: 2147483200
            }
        );
        if (!confirmed) return;
        state.cancelling = true;
        activeController?.abort(new DOMException('user_cancelled_inquiry', 'AbortError'));
        Utils.appendLog?.(null, '本次询问大纲已取消：完成'
            + state.stages.length + '/' + state.totalStages + '个阶段，共调用自备模型'
            + Number(state.requestCount || 0) + '次', 'warn');
        await clearCancelledInquiryLocally(state);
    }

    async function restoreCurrentState() {
        if (restoring || !uid() || !bookName() || !IDB) return null;
        restoring = true;
        try {
            observedContextKey = currentCacheKey();
            const state = await loadState(uid(), bookName());
            if (!state) {
                renderControls(null);
                return null;
            }
            if (!isTerminal(state) && !isStateFromCurrentRuntime(state)) {
                await forceStopInquiryAfterReload(state);
            }
            generationMode = 'inquiry';
            if (!isTerminal(state) && Date.now() >= Number(state.expiresAt || 0)) {
                state.status = 'expired';
                await removeState(state);
                Utils.appendLog?.(null, '询问大纲已超过7天等待期限，本机临时流程已自动清除', 'warn');
                renderControls(null);
                return null;
            }
            if (!isTerminal(state)) {
                if (state.status === 'generating') {
                    state.status = 'paused';
                    state.stageReady = true;
                    await saveState(state);
                }
            } else if (state.status === 'completed') {
                AppState.outline.content = joinContent(state, false);
            }
            renderMode();
            renderResult(state);
            renderControls(state);
            return state;
        } finally {
            restoring = false;
        }
    }

    async function maybeHandleOutlineInquiryAction() {
        if (!isCurrentNormalOutline()) return false;
        const state = await loadState(uid(), bookName());
        if (state && !isTerminal(state)) {
            await cancelInquiry(state);
            return true;
        }
        if (generationMode !== 'inquiry') return false;
        try {
            await startInquiry();
        } catch (error) {
            const message = window.formatAiErrorForDisplay?.(error, '询问大纲启动失败') || String(error?.message || error);
            Utils.appendLog?.(null, message, 'error');
            Toast.error(message);
            renderControls(null);
        }
        return true;
    }

    function isOutlineInquirySaveBlocked() {
        const state = stateCache.get(currentCacheKey());
        return !!state && !isTerminal(state);
    }

    function bind() {
        document.querySelectorAll('#outlineGenerationModeToggle [data-outline-generation-mode]').forEach(button => {
            button.addEventListener('click', async function() {
                const state = await loadState(uid(), bookName());
                if (state && !isTerminal(state)) {
                    Toast.warn('询问进行中不能切换模式；如需切换，请先取消本次询问');
                    return;
                }
                generationMode = this.dataset.outlineGenerationMode === 'inquiry' ? 'inquiry' : 'direct';
                renderMode();
                renderControls(state);
            });
        });
        document.querySelectorAll('#outlineInquiryFeedbackToggle [data-inquiry-feedback]').forEach(button => {
            button.addEventListener('click', () => setFeedbackMode(button.dataset.inquiryFeedback));
        });
        document.getElementById('outlineInquiryFeedbackInput')?.addEventListener('input', () => syncSendButton(stateCache.get(currentCacheKey())));
        document.getElementById('btnOutlineInquirySend')?.addEventListener('click', async function() {
            try {
                const state = await loadState(uid(), bookName());
                await handleFeedback(state);
            } catch (error) {
                const message = window.formatAiErrorForDisplay?.(error, '询问大纲操作失败')
                    || String(error?.message || error);
                Utils.appendLog?.(null, message, 'error');
                Toast.error(message);
            }
        });
        document.getElementById('outlineModeTabs')?.addEventListener('click', () => setTimeout(restoreCurrentState, 0));
        document.getElementById('outlineSubModeTabs')?.addEventListener('click', () => setTimeout(restoreCurrentState, 0));
        document.getElementById('btnOutline')?.addEventListener('click', () => setTimeout(restoreCurrentState, 0));
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) restoreCurrentState();
        });
        window.addEventListener('focus', restoreCurrentState);
        setInterval(function() {
            const key = currentCacheKey();
            if (key !== observedContextKey) restoreCurrentState();
        }, 1000);
        renderMode();
        setFeedbackMode('suggest');
        restoreCurrentState();
    }

    window.maybeHandleOutlineInquiryAction = maybeHandleOutlineInquiryAction;
    window.isOutlineInquirySaveBlocked = isOutlineInquirySaveBlocked;
    window.restoreOutlineInquiryState = restoreCurrentState;
    window.ZHIYU_OUTLINE_INQUIRY_TEST_API = Object.freeze({
        STAGE_TOTALS,
        TARGET_CHAPTERS,
        REQUEST_RULES,
        splitChapterRanges,
        stageDefinition,
        highestChapter,
        chapterHeadings,
        normalizeChapterStage,
        normalizeStageContentForStorage,
        normalizeCompletedStageContent,
        buildStagePrompt,
        buildRevisionPrompt,
        buildResumePrompt,
        joinContent,
        runtimeSessionId: RUNTIME_SESSION_ID,
        isStateFromCurrentRuntime,
        renderControls,
        createSerializedSaveQueue,
        claimRunning,
        releaseRunning,
        startRunningHeartbeat
    });
    window.ZHIYU_OUTLINE_INQUIRY_READY = true;

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
    else bind();
})(window, document);
