// 社区版全文分析界面：不登录、不计费、不上传正文，复用现有用户模型配置和本地作品存储。
(function(window, document) {
    'use strict';

    const state = {
        bound: false,
        input: null,
        plan: null,
        bundle: null,
        task: null,
        result: null,
        logs: [],
        running: false,
        runPromise: null,
        abortController: null,
        pauseRequested: false,
        skipRequested: false,
        stopRequested: false,
        unknownRetryApproved: false,
        minimized: false,
        deleting: false,
        saving: false
    };

    function getEngine() {
        const api = window.ZhiyuCommunityFullAnalysisEngine;
        if (!api) throw new Error('社区版全文分析执行器未加载，请刷新页面后重试');
        return api;
    }

    function getStore() {
        return window.ZhiyuImportFullAnalysisCheckpointStore;
    }

    function getPlanner() {
        return window.ZhiyuImportFullAnalysisPlan;
    }

    function getToast() {
        return window.ZHIYU_TOAST || window.Toast || {
            success: function() {},
            warn: function() {},
            error: function() {}
        };
    }

    function getModal() {
        return window.ZHIYU_MODAL || window.Modal || { open: function() {}, close: function() {} };
    }

    function el(id) {
        return document.getElementById(id);
    }

    function clone(value) {
        if (typeof structuredClone === 'function') return structuredClone(value);
        return JSON.parse(JSON.stringify(value));
    }

    function escapeHtml(value) {
        return window.Utils?.escapeHtml
            ? window.Utils.escapeHtml(String(value || ''))
            : String(value || '').replace(/[&<>"']/g, function(char) {
                return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
            });
    }

    function appendLog(message, kind) {
        const text = String(message || '').trim();
        if (!text) return;
        const last = state.logs[state.logs.length - 1];
        if (last?.message === text && last?.kind === kind) return;
        state.logs.push({ message: text, kind: kind || 'complete', time: new Date().toISOString() });
        if (state.logs.length > 120) state.logs.splice(0, state.logs.length - 120);
        renderLogs();
    }

    function renderLogs() {
        const box = el('fullAnalysisLog');
        if (!box) return;
        const follow = box.scrollHeight - box.scrollTop - box.clientHeight < 42;
        box.innerHTML = state.logs.map(function(entry) {
            const css = entry.kind === 'current' ? ' is-current' : (entry.kind === 'warning' || entry.kind === 'error' ? ' is-error' : ' is-complete');
            const mark = entry.kind === 'current' ? '…' : (entry.kind === 'warning' || entry.kind === 'error' ? '!' : '✓');
            return '<div class="full-analysis-log-item' + css + '"><span aria-hidden="true">' + mark + '</span><div>'
                + escapeHtml(entry.message) + '</div></div>';
        }).join('');
        if (follow) box.scrollTop = box.scrollHeight;
    }

    function currentModels() {
        const models = typeof window.loadCustomModelsForCurrentUser === 'function'
            ? window.loadCustomModelsForCurrentUser()
            : [];
        return (Array.isArray(models) ? models : []).filter(function(model) {
            return model && model.name && model.base && (model.modelId || model.name);
        });
    }

    function closeModelMenu() {
        const menu = el('fullAnalysisNormalModelMenu');
        const button = el('btnFullAnalysisNormalModel');
        if (menu) menu.hidden = true;
        if (button) button.setAttribute('aria-expanded', 'false');
    }

    function renderModelPicker() {
        const models = currentModels();
        const selectedId = String(window.getModelIdForScope?.('writing') || '');
        const current = models.find(function(model) { return model.name === selectedId; }) || models[0] || null;
        if (current && current.name !== selectedId) window.setModelIdForScope?.('writing', current.name);
        const select = el('fullAnalysisNormalModel');
        if (select) {
            select.innerHTML = '';
            models.forEach(function(model) {
                const option = document.createElement('option');
                option.value = model.name;
                option.textContent = model.name;
                select.appendChild(option);
            });
            select.value = current?.name || '';
        }
        const label = el('fullAnalysisNormalModelLabel');
        if (label) label.textContent = current?.name || '请先添加模型';
        const menu = el('fullAnalysisNormalModelMenu');
        if (menu) {
            menu.innerHTML = '';
            models.forEach(function(model) {
                const option = document.createElement('button');
                option.type = 'button';
                option.className = 'full-analysis-model-option' + (model.name === current?.name ? ' is-selected' : '');
                option.dataset.fullAnalysisModelRoute = model.name;
                option.setAttribute('role', 'option');
                option.setAttribute('aria-selected', model.name === current?.name ? 'true' : 'false');
                const text = document.createElement('span');
                text.className = 'full-analysis-model-option-label';
                text.textContent = model.name;
                option.appendChild(text);
                menu.appendChild(option);
            });
        }
        const button = el('btnFullAnalysisNormalModel');
        if (button) button.disabled = !!state.task || !models.length;
        return current;
    }

    function setRangeControls(input) {
        const chapters = Array.isArray(input?.chapters) ? input.chapters : [];
        const chapterStart = el('fullAnalysisChapterStart');
        const chapterEnd = el('fullAnalysisChapterEnd');
        if (chapterStart) {
            chapterStart.min = '1';
            chapterStart.max = String(Math.max(1, chapters.length));
            chapterStart.value = '1';
        }
        if (chapterEnd) {
            chapterEnd.min = '1';
            chapterEnd.max = String(Math.max(1, chapters.length));
            chapterEnd.value = String(Math.max(1, chapters.length));
        }
        const volumes = [];
        chapters.forEach(function(chapter) {
            const name = String(chapter?.volumeName || chapter?.volume || '第一卷').trim() || '第一卷';
            if (!volumes.includes(name)) volumes.push(name);
        });
        ['fullAnalysisVolumeStart', 'fullAnalysisVolumeEnd'].forEach(function(id) {
            const select = el(id);
            if (!select) return;
            select.innerHTML = '';
            volumes.forEach(function(name, index) {
                const option = document.createElement('option');
                option.value = String(index + 1);
                option.textContent = name;
                select.appendChild(option);
            });
        });
        if (el('fullAnalysisVolumeStart')) el('fullAnalysisVolumeStart').value = '1';
        if (el('fullAnalysisVolumeEnd')) el('fullAnalysisVolumeEnd').value = String(Math.max(1, volumes.length));
        if (el('fullAnalysisScopeSelect')) el('fullAnalysisScopeSelect').value = 'all';
        if (el('fullAnalysisModeSelect')) el('fullAnalysisModeSelect').value = 'automatic';
        updateScopeVisibility();
    }

    function readScope() {
        const mode = ['chapter', 'volume'].includes(el('fullAnalysisScopeSelect')?.value)
            ? el('fullAnalysisScopeSelect').value
            : 'all';
        if (mode === 'chapter') {
            return {
                mode,
                start: Number(el('fullAnalysisChapterStart')?.value || 1),
                end: Number(el('fullAnalysisChapterEnd')?.value || 1)
            };
        }
        if (mode === 'volume') {
            return {
                mode,
                start: Number(el('fullAnalysisVolumeStart')?.value || 1),
                end: Number(el('fullAnalysisVolumeEnd')?.value || 1)
            };
        }
        return { mode: 'all' };
    }

    function updateScopeVisibility() {
        const mode = el('fullAnalysisScopeSelect')?.value || 'all';
        if (el('fullAnalysisChapterRange')) el('fullAnalysisChapterRange').hidden = mode !== 'chapter';
        if (el('fullAnalysisVolumeRange')) el('fullAnalysisVolumeRange').hidden = mode !== 'volume';
        refreshPreparedSelection();
    }

    function refreshPreparedSelection() {
        if (!state.input || state.task || !getPlanner()) return;
        try {
            state.plan = getPlanner().buildPlan({
                bookName: state.input.bookName,
                chapters: state.input.chapters,
                sourceWorkId: state.input.sourceWorkId,
                analysisScope: readScope()
            });
            const summary = el('fullAnalysisScopeSummary');
            if (summary) summary.textContent = '分析范围：' + state.plan.analysisScope.label + '；共 '
                + state.plan.chapterCount.toLocaleString() + ' 章，约 ' + state.plan.totalWords.toLocaleString() + ' 个有效字符。';
            const usage = el('fullAnalysisUsage');
            if (usage) usage.textContent = '预计至少需要 ' + state.plan.segments.length.toLocaleString()
                + ' 次正文分析请求，资料汇总和续写卡还会增加少量请求；费用由你的 API 服务商计算。';
            const progress = el('fullAnalysisProgressText');
            if (progress) progress.textContent = '准备分析 ' + state.plan.chapterCount.toLocaleString() + ' 章正文';
            if (el('fullAnalysisProgressBar')) el('fullAnalysisProgressBar').style.width = '0%';
        } catch(error) {
            state.plan = null;
            if (el('fullAnalysisScopeSummary')) el('fullAnalysisScopeSummary').textContent = error.message || '分析范围无效';
        }
    }

    function buildDefaultBookName(sourceName) {
        const base = String(sourceName || '新作品').trim() || '新作品';
        const suffix = '（全文分析结果）';
        let candidate = (base + suffix).slice(0, 120);
        const books = window.gB?.() || {};
        const memBooks = window.getMemBooks?.() || {};
        if (!Object.prototype.hasOwnProperty.call(books, candidate) && !Object.prototype.hasOwnProperty.call(memBooks, candidate)) return candidate;
        for (let index = 2; index < 1000; index += 1) {
            const extra = '（全文分析结果' + index + '）';
            candidate = base.slice(0, Math.max(1, 120 - extra.length)) + extra;
            if (!Object.prototype.hasOwnProperty.call(books, candidate) && !Object.prototype.hasOwnProperty.call(memBooks, candidate)) return candidate;
        }
        return ('全文分析结果-' + Date.now()).slice(0, 120);
    }

    function calculateProgress(task) {
        if (!task) return 0;
        if (task.status === 'completed_unsaved' || task.status === 'saved') return 100;
        const total = Math.max(1, Number(task.segmentTotal || 1));
        const completed = Math.max(0, Number(task.completedSegmentCount || task.nextSegmentIndex || 0));
        if (task.phase === 'profiles') return 78;
        if (task.phase === 'cards') return 90;
        if (task.phase === 'done') return 100;
        return Math.min(75, Math.round(75 * completed / total));
    }

    function taskStatusText(task) {
        if (!task) return '等待开始';
        if (task.status === 'completed_unsaved') return '分析完成，等待保存';
        if (task.status === 'saved') return '结果已保存';
        if (task.status === 'paused') return task.pausedReason === 'staged_review' ? '阶段完成，等待确认' : '分析已暂停';
        if (task.phase === 'profiles') return '正在汇总设定和角色资料';
        if (task.phase === 'cards') return '正在生成续写卡片';
        return '正文分析 ' + Math.min(Number(task.nextSegmentIndex || 0) + 1, Number(task.segmentTotal || 1))
            + '/' + Number(task.segmentTotal || 1);
    }

    function setVisible(id, visible, display) {
        const node = el(id);
        if (node) node.style.display = visible ? (display || 'inline-flex') : 'none';
    }

    function renderReview(task) {
        const section = el('fullAnalysisReviewSection');
        if (!section) return;
        const visible = task?.status === 'paused' || task?.status === 'completed_unsaved';
        section.style.display = visible ? 'block' : 'none';
        const summary = el('fullAnalysisReviewSummary');
        if (summary) {
            summary.textContent = task?.status === 'completed_unsaved'
                ? '分析已完成。请确认后保存到一个新的本机作品。'
                : (task?.pausedReason === 'staged_review'
                    ? '当前正文段已经完成并保存。继续后才会调用模型处理下一段。'
                    : '任务已暂停。已完成的检查点不会重复处理。');
        }
        const items = el('fullAnalysisReviewItems');
        if (items && task) {
            const skipped = Array.isArray(task.skippedSegmentIndices) ? task.skippedSegmentIndices.length : 0;
            items.textContent = '已处理 ' + Number(task.completedSegmentCount || 0) + '/' + Number(task.segmentTotal || 0)
                + ' 个正文段' + (skipped ? '，其中跳过 ' + skipped + ' 个' : '') + '。';
        }
    }

    function renderTask() {
        const task = state.task;
        const active = !!task && ['prepared', 'running', 'pause_requested', 'paused', 'retry_wait', 'merging'].includes(task.status);
        const completed = task?.status === 'completed_unsaved';
        const saved = task?.status === 'saved';
        const prepared = !task && !!state.input;
        const running = state.running || task?.status === 'running' || task?.status === 'merging';
        if (el('fullAnalysisProgressText')) el('fullAnalysisProgressText').textContent = taskStatusText(task);
        if (el('fullAnalysisProgressBar')) el('fullAnalysisProgressBar').style.width = calculateProgress(task) + '%';
        if (el('fullAnalysisUsage') && task) {
            el('fullAnalysisUsage').textContent = '本机任务：' + Number(task.completedSegmentCount || 0) + '/'
                + Number(task.segmentTotal || 0) + ' 个正文段；API 请求由你配置的模型服务商处理。';
        }
        const lock = !!task;
        if (el('fullAnalysisModeSection')) el('fullAnalysisModeSection').disabled = lock;
        if (el('fullAnalysisScopeSection')) el('fullAnalysisScopeSection').disabled = lock;
        if (el('btnFullAnalysisNormalModel')) el('btnFullAnalysisNormalModel').disabled = lock || !currentModels().length;
        setVisible('btnFullAnalysisStart', prepared, 'inline-flex');
        setVisible('btnFullAnalysisCancel', active && running, 'inline-flex');
        setVisible('btnFullAnalysisContinue', active && !running && task?.status === 'paused', 'inline-flex');
        setVisible('btnFullAnalysisSkipSegment', active && !running && task?.status === 'paused' && task?.phase === 'segments', 'inline-flex');
        setVisible('btnFullAnalysisStopNow', active && Number(task?.completedSegmentCount || 0) > 0, 'inline-flex');
        setVisible('btnFullAnalysisMinimize', !!task, 'inline-flex');
        setVisible('btnFullAnalysisRestart', !!task && !running, 'inline-flex');
        setVisible('btnFullAnalysisDoneClose', completed || saved, 'inline-flex');
        setVisible('btnFullAnalysisSave', completed, 'inline-flex');
        if (el('fullAnalysisSaveSection')) el('fullAnalysisSaveSection').style.display = completed ? 'block' : 'none';
        if (el('fullAnalysisDangerZone')) el('fullAnalysisDangerZone').style.display = task ? 'flex' : 'none';
        if (el('btnFullAnalysisBack')) el('btnFullAnalysisBack').style.display = task ? 'none' : 'inline-flex';
        if (el('btnFullAnalysisClose')) el('btnFullAnalysisClose').disabled = state.deleting;
        if (el('btnFullAnalysisDelete')) el('btnFullAnalysisDelete').disabled = state.deleting;
        if (el('btnFullAnalysisSave')) el('btnFullAnalysisSave').disabled = state.saving;
        renderReview(task);
        const taskbar = el('fullAnalysisTaskbar');
        if (taskbar) taskbar.classList.toggle('is-visible', state.minimized && !!task && (active || completed));
        if (el('fullAnalysisTaskbarTitle')) el('fullAnalysisTaskbarTitle').textContent = '《' + String(task?.sourceBookName || '未命名作品') + '》全文分析';
        if (el('fullAnalysisTaskbarProgress')) el('fullAnalysisTaskbarProgress').textContent = taskStatusText(task);
        setVisible('btnFullAnalysisTaskbarPause', state.minimized && active && running, 'inline-flex');
        renderLogs();
    }

    function openModal() {
        state.minimized = false;
        renderModelPicker();
        renderTask();
        getModal().open('fullTextAnalysisModal');
        return true;
    }

    function minimize() {
        if (!state.task) return false;
        state.minimized = true;
        getModal().close('fullTextAnalysisModal');
        renderTask();
        return true;
    }

    function requestClose() {
        if (state.running || (state.task && !['completed_unsaved', 'saved'].includes(state.task.status))) return minimize();
        getModal().close('fullTextAnalysisModal');
        return true;
    }

    async function reloadTask() {
        if (!state.task?.taskId) return null;
        state.bundle = await getEngine().loadTask(state.task.ownerId, state.task.taskId);
        state.task = state.bundle?.task || null;
        state.result = state.task ? await getEngine().getFinalResult(state.task.ownerId, state.task.taskId) : null;
        renderTask();
        return state.bundle;
    }

    async function patchCurrentTask(patch) {
        if (!state.task?.taskId) return null;
        await getStore().writeRecords(state.task.ownerId, state.task.taskId, [], patch || {});
        return reloadTask();
    }

    function buildControl(signal) {
        return {
            signal,
            shouldPause: function() { return state.pauseRequested; },
            shouldSkip: function() { return state.skipRequested; },
            shouldStop: function() { return state.stopRequested; },
            consumeSkip: function() { state.skipRequested = false; },
            approveUnknownResponseRetry: function() {
                if (!state.unknownRetryApproved) return false;
                state.unknownRetryApproved = false;
                return true;
            },
            onProgress: function(event) {
                appendLog(event.message, event.kind);
                reloadTask().catch(function() {});
            }
        };
    }

    async function runCurrentTask() {
        if (state.running || !state.task) return state.runPromise;
        state.running = true;
        state.pauseRequested = false;
        state.abortController = new AbortController();
        renderTask();
        const ownerId = state.task.ownerId;
        const taskId = state.task.taskId;
        state.runPromise = getEngine().runTask(ownerId, taskId, buildControl(state.abortController.signal))
            .then(async function(bundle) {
                state.bundle = bundle;
                state.task = bundle?.task || null;
                state.result = state.task ? await getEngine().getFinalResult(ownerId, taskId) : null;
                if (state.task?.status === 'completed_unsaved') {
                    appendLog('全文分析完成，八个文件已保存在本机，等待你确认保存到新作品。', 'complete');
                }
                return bundle;
            })
            .catch(async function(error) {
                const wasStop = state.stopRequested;
                const leaseBlocked = [
                    'FULL_ANALYSIS_ANOTHER_TAB_ACTIVE',
                    'FULL_ANALYSIS_EXECUTION_LEASE_UNAVAILABLE',
                    'FULL_ANALYSIS_EXECUTION_LEASE_LOST'
                ].includes(String(error?.code || ''));
                if (leaseBlocked) {
                    appendLog(error?.message || '另一个标签页正在运行这个任务', 'warning');
                    getToast().warn(error?.message || '另一个标签页正在运行这个任务');
                } else if (state.pauseRequested || error?.code === 'FULL_ANALYSIS_PAUSED' || error?.name === 'AbortError') {
                    await getStore().writeRecords(ownerId, taskId, [], {
                        status: 'paused',
                        pausedReason: state.pauseRequested ? 'user' : (wasStop ? 'stop_retry' : 'interrupted'),
                        lastError: wasStop ? '' : String(error?.message || ''),
                        lastErrorCode: wasStop ? '' : String(error?.code || error?.name || '')
                    }).catch(function() {});
                } else {
                    await getStore().writeRecords(ownerId, taskId, [], {
                        status: 'paused',
                        pausedReason: 'error',
                        lastError: String(error?.message || '全文分析失败').slice(0, 500),
                        lastErrorCode: String(error?.code || error?.name || 'FULL_ANALYSIS_FAILED')
                    }).catch(function() {});
                    appendLog(error?.message || '全文分析已暂停', 'error');
                    getToast().warn(error?.message || '全文分析已暂停，已完成进度不会丢失');
                }
                await reloadTask();
                throw error;
            })
            .finally(function() {
                state.running = false;
                state.abortController = null;
                state.runPromise = null;
                state.pauseRequested = false;
                state.stopRequested = false;
                state.unknownRetryApproved = false;
                reloadTask().catch(function() {}).finally(renderTask);
            });
        return state.runPromise;
    }

    async function startPreparedImport() {
        if (state.task) return runCurrentTask();
        if (!state.input) throw new Error('没有可分析的导入正文');
        if (!renderModelPicker()) throw new Error('请先在模型设置中添加并选择自己的 API 模型');
        const mode = el('fullAnalysisModeSelect')?.value === 'staged' ? 'staged' : 'automatic';
        const bundle = await getEngine().createTask(state.input, {
            ownerId: getEngine().getOwnerId(),
            mode,
            analysisScope: readScope()
        });
        state.bundle = bundle;
        state.task = bundle.task;
        state.logs = [];
        appendLog('本机任务已建立。正文不会上传到知屿服务器，只会发给你配置的模型 API。', 'complete');
        renderTask();
        return runCurrentTask();
    }

    async function requestPause() {
        if (!state.task || !state.running) return false;
        state.pauseRequested = true;
        await patchCurrentTask({ status: 'pause_requested', pausedReason: 'user' });
        state.abortController?.abort();
        appendLog('正在暂停；已完成的检查点会保留。', 'current');
        return true;
    }

    async function requestContinue() {
        if (!state.task) return false;
        if (state.task.lastErrorCode === 'FULL_ANALYSIS_RESPONSE_UNKNOWN') {
            const accepted = window.confirm(
                '上次模型请求的结果没有保存下来。模型服务商可能已经处理过它。\n\n'
                + '继续会重新发出这一步，可能再次产生一次 API 请求。确定继续吗？'
            );
            if (!accepted) return false;
            state.unknownRetryApproved = true;
        }
        state.pauseRequested = false;
        state.stopRequested = false;
        return runCurrentTask();
    }

    async function requestSkipSegment() {
        if (!state.task || state.task.phase !== 'segments') return false;
        state.skipRequested = true;
        if (state.running) state.abortController?.abort();
        else await requestContinue();
        return true;
    }

    async function requestStopNow() {
        if (!state.task) return false;
        if (!Number(state.task.completedSegmentCount || 0)) {
            throw new Error('第一段还没有完成，暂时不能直接总结；请先暂停，或等待第一段完成');
        }
        state.stopRequested = true;
        state.pauseRequested = false;
        appendLog('已请求立即停止正文分段，将用已完成内容生成最终八个文件。', 'warning');
        // 已进入资料汇总或续写卡阶段时，正文分段早已结束；继续当前汇总即可，
        // 此时中断模型只会制造一次不必要的重试。
        if (state.running && state.task.phase === 'segments') state.abortController?.abort();
        else await runCurrentTask();
        return true;
    }

    async function deleteCurrentTask() {
        if (!state.task || state.deleting) return false;
        const accepted = window.confirm('只删除这一个全文分析任务的本机检查点。已保存作品不会删除。确定继续吗？');
        if (!accepted) return false;
        state.deleting = true;
        state.pauseRequested = true;
        state.abortController?.abort();
        if (state.runPromise) await state.runPromise.catch(function() {});
        const ownerId = state.task.ownerId;
        const taskId = state.task.taskId;
        await getEngine().deleteTask(ownerId, taskId);
        state.bundle = null;
        state.task = null;
        state.result = null;
        state.logs = [];
        state.deleting = false;
        state.pauseRequested = false;
        if (state.input) {
            setRangeControls(state.input);
            refreshPreparedSelection();
        } else {
            getModal().close('fullTextAnalysisModal');
        }
        renderTask();
        getToast().success('这一个全文分析任务的本机检查点已删除');
        return true;
    }

    function buildVolumes(chapters, timestamp) {
        const groups = new Map();
        (Array.isArray(chapters) ? chapters : []).forEach(function(chapter, index) {
            const volumeName = String(chapter.volumeTitle || chapter.volumeName || '第一卷');
            if (!groups.has(volumeName)) groups.set(volumeName, []);
            const plain = String(chapter.content || '');
            groups.get(volumeName).push({
                name: String(chapter.chapterTitle || chapter.title || ('第' + (index + 1) + '章')),
                content: typeof window.plainTextToEditorHTML === 'function'
                    ? window.plainTextToEditorHTML(plain)
                    : escapeHtml(plain).replace(/\n/g, '<br>'),
                createdAt: timestamp,
                updatedAt: timestamp
            });
        });
        return Array.from(groups.entries()).map(function(entry) {
            return { name: entry[0], chapters: entry[1] };
        });
    }

    function writeResultFiles(bookName, memBook, files, timestamp) {
        const folderName = Array.isArray(memBook['关联文件夹'])
            ? '关联文件夹'
            : (Array.isArray(memBook['默认文件夹']) ? '默认文件夹' : '关联文件夹');
        if (!Array.isArray(memBook[folderName])) memBook[folderName] = [];
        const core = window.ZhiyuFullTextAnalysisCore;
        getEngine().RESULT_FILE_NAMES.forEach(function(name) {
            memBook[folderName].push({
                name: bookName + '_' + name,
                content: String(files[name] || ''),
                createdAt: timestamp,
                updatedAt: timestamp,
                source: core?.MEMORY_FILE_SOURCE_SYSTEM || 'system',
                managedBy: core?.MEMORY_FILE_MANAGER_SYSTEM || 'full-analysis'
            });
        });
    }

    function resultFilesHash(bookName, memBook) {
        const core = window.ZhiyuFullTextAnalysisCore;
        if (!core?.fingerprint) return '';
        const folder = memBook?.['关联文件夹'];
        if (!Array.isArray(folder)) return '';
        const pairs = [];
        for (const name of getEngine().RESULT_FILE_NAMES) {
            const matches = folder.filter(function(file) {
                return String(file?.name || '') === String(bookName || '') + '_' + name;
            });
            if (matches.length !== 1) return '';
            pairs.push([name, String(matches[0]?.content || '')]);
        }
        return core.fingerprint(JSON.stringify(pairs));
    }

    async function saveResult() {
        if (state.saving) throw new Error('正在保存，请不要重复点击');
        if (!state.task || state.task.status !== 'completed_unsaved') throw new Error('全文分析尚未完成');
        state.saving = true;
        renderTask();
        try {
            const storage = window.ZHIYU_STORAGE_SERVICE;
            const scope = window.AccountDataScope;
            if (!storage?.commitCreatedBookAndMemory || !scope?.key || !window.replaceMemBooksSnapshot) {
                throw new Error('本机原子保存服务尚未就绪，请刷新页面后重试');
            }
            const ownerId = String(state.task.ownerId || '');
            if (!ownerId || String(scope.getActiveUid?.() || '') !== ownerId) {
                throw new Error('当前本机身份已经变化，本次没有写入任何作品');
            }
            const result = state.result || await getEngine().getFinalResult(ownerId, state.task.taskId);
            if (!result?.files) throw new Error('本机分析结果不存在，已停止保存');
            const receiptKey = scope.key('community_full_analysis_receipt', ownerId) + '__' + String(state.task.taskId || '');
            const existingReceipt = await window.ZHIYU_IDB?.get?.(receiptKey);
            let bookName = String(el('fullAnalysisNewBookName')?.value || '').trim();
            if (existingReceipt
                && String(existingReceipt.taskId || '') === String(state.task.taskId || '')
                && String(existingReceipt.resultHash || '') === String(result.resultHash || '')) {
                bookName = String(existingReceipt.bookName || bookName).trim();
                if (el('fullAnalysisNewBookName')) el('fullAnalysisNewBookName').value = bookName;
                appendLog('检测到上次保存已经提交，正在核对并恢复同一作品。', 'warning');
            }
            if (!bookName) throw new Error('请输入新作品名称');
            if (['__proto__', 'prototype', 'constructor'].includes(bookName.toLowerCase())) throw new Error('该作品名称不可使用，请换一个名称');
            const timestamp = new Date().toISOString();
            const sourceChapters = state.bundle?.sourceSnapshot?.chapters || [];
            const book = {
                _bid: 'community-full-analysis-' + String(state.task.taskId || ''),
                status: window.ZHIYU_STATUS?.ACTIVE || window.STATUS?.ACTIVE || 'active',
                createdAt: timestamp,
                updatedAt: timestamp,
                volumes: buildVolumes(sourceChapters, timestamp),
                currentVol: 0,
                wordCount: sourceChapters.reduce(function(total, chapter) {
                    return total + Number(window.countChineseWords?.(chapter.content || '') || String(chapter.content || '').replace(/\s/g, '').length);
                }, 0),
                type: state.task.sourceBookType === 'script' ? 'script' : 'novel',
                outline: { content: String(result.files.大纲 || ''), updatedAt: timestamp }
            };
            window.ensureBookStableId?.(book);
            const memBook = { '关联文件夹': [] };
            writeResultFiles(bookName, memBook, result.files, timestamp);
            const preparedResultHash = resultFilesHash(bookName, memBook);
            if (!preparedResultHash || preparedResultHash !== String(result.resultHash || '')) {
                throw new Error('待保存的八个文件与分析结果校验不一致，本次没有写入作品');
            }
            const committed = await storage.commitCreatedBookAndMemory({
                expectedUid: ownerId,
                bookName,
                book,
                memBook,
                memoryKey: scope.key('mem_books', ownerId),
                receiptKey,
                receipt: {
                    taskId: String(state.task.taskId || ''),
                    resultHash: String(result.resultHash || ''),
                    resultFileNames: getEngine().RESULT_FILE_NAMES.slice(),
                    sourceFingerprint: String(state.task.sourceFingerprint || '')
                }
            });
            if (!committed?.persisted) throw new Error('本机作品与八个文件未能完整保存，原有内容没有改变');
            if (window.replaceMemBooksSnapshot(committed.memBooks, ownerId) !== true) {
                throw new Error('作品和八个文件已经保存，但当前页面缓存未刷新，请刷新页面查看');
            }
            const storedBook = committed.books?.[bookName];
            const storedFiles = committed.memBooks?.[bookName]?.['关联文件夹'] || [];
            const storedResultHash = resultFilesHash(bookName, committed.memBooks?.[bookName]);
            const verified = !!storedBook && !!String(committed.bookId || '')
                && String(storedBook._bid || '') === String(committed.bookId || '')
                && getEngine().RESULT_FILE_NAMES.every(function(name) {
                    return storedFiles.filter(function(file) { return file?.name === bookName + '_' + name; }).length === 1;
                })
                && storedResultHash === String(result.resultHash || '');
            const receiptVerified = committed.idempotent === true
                && String(committed.receipt?.taskId || '') === String(state.task.taskId || '')
                && String(committed.receipt?.resultHash || '') === String(result.resultHash || '')
                && String(committed.receipt?.bookId || '') === String(committed.bookId || '');
            if (committed.idempotent === true && !verified) {
                appendLog('上次保存已经完整提交，但作品内容后来发生过修改；本次没有覆盖这些修改。', 'warning');
            }
            if (!verified && !receiptVerified) throw new Error('保存后的本机校验未通过，分析任务仍保留，请刷新页面后检查');
            await getStore().writeRecords(ownerId, state.task.taskId, [], {
                status: 'saved',
                savedAt: timestamp,
                savedBookName: bookName,
                savedBookId: String(storedBook._bid || '')
            });
            window.unmarkBookDeleted?.(bookName, storedBook);
            await reloadTask();
            window.refreshOverview?.();
            window.refreshTree?.();
            window.refreshMemGrid?.();
            appendLog('作品正文和八个分析文件已一次性保存到本机新作品“' + bookName + '”。', 'complete');
            getToast().success('全文分析结果已保存到本机作品「' + bookName + '」');
            return storedBook;
        } finally {
            state.saving = false;
            renderTask();
        }
    }

    async function openFromImport(input) {
        if (state.task && getEngine().ACTIVE_TASK_STATUSES.has(state.task.status)) {
            openModal();
            getToast().warn('本机还有一个未结束的全文分析任务，请先继续或清除它');
            return state.task;
        }
        const bookName = String(input?.bookName || '').trim();
        const chapters = Array.isArray(input?.chapters) ? input.chapters.slice() : [];
        if (!bookName) throw new Error('请输入作品名称');
        if (!chapters.length) throw new Error('请至少选择一个章节');
        state.input = {
            bookName,
            bookType: input?.bookType === 'script' ? 'script' : 'novel',
            sourceWorkId: String(input?.sourceWorkId || ''),
            chapters
        };
        state.plan = null;
        state.bundle = null;
        state.task = null;
        state.result = null;
        state.logs = [];
        setRangeControls(state.input);
        if (el('fullAnalysisNewBookName')) el('fullAnalysisNewBookName').value = buildDefaultBookName(bookName);
        if (el('fullAnalysisStorageNotice')) {
            el('fullAnalysisStorageNotice').textContent = '社区版：任务进度和结果只保存在本机浏览器；正文仅发送给你选择的 API 模型，不经过知屿登录、计费、云任务或云备份。';
        }
        refreshPreparedSelection();
        openModal();
        return state.plan;
    }

    async function resumeForCurrentUser() {
        const ownerId = getEngine().getOwnerId();
        const tasks = await getEngine().listTasks(ownerId);
        const task = tasks.find(function(item) { return getEngine().ACTIVE_TASK_STATUSES.has(item.status); });
        if (!task) return false;
        state.bundle = await getEngine().loadTask(ownerId, task.taskId);
        state.task = state.bundle.task;
        state.result = await getEngine().getFinalResult(ownerId, task.taskId);
        state.input = {
            bookName: task.sourceBookName,
            bookType: task.sourceBookType,
            sourceWorkId: task.sourceWorkId,
            chapters: state.bundle.sourceSnapshot.chapters.map(function(chapter) {
                return {
                    id: chapter.chapterId,
                    title: chapter.chapterTitle,
                    volumeName: chapter.volumeTitle,
                    content: chapter.content,
                    _importOriginalIndex: chapter.chapterOrder,
                    selected: true
                };
            })
        };
        const wasRunning = ['running', 'merging', 'pause_requested'].includes(state.task.status);
        const accountWritable = window.ZHIYU_ACCOUNT_WRITE_LEASE?.canWrite?.(ownerId) === true;
        const runningElsewhere = wasRunning && (
            getEngine().isTaskExecutionActive?.(ownerId, task.taskId) === true
            || !accountWritable
        );
        if (wasRunning && !runningElsewhere && accountWritable) {
            await getStore().writeRecords(ownerId, task.taskId, [], {
                status: 'paused',
                pausedReason: 'browser_restarted',
                lastError: '',
                lastErrorCode: ''
            });
            state.bundle = await getEngine().loadTask(ownerId, task.taskId);
            state.task = state.bundle.task;
        }
        state.logs = [{
            message: runningElsewhere
                ? '另一个标签页正在运行这个任务；当前页面只显示进度，不会重复调用模型。'
                : '已恢复上次全文分析任务。已完成的检查点不会重复调用模型。',
            kind: runningElsewhere ? 'warning' : 'complete',
            time: new Date().toISOString()
        }];
        if (el('fullAnalysisNewBookName')) el('fullAnalysisNewBookName').value = buildDefaultBookName(task.sourceBookName);
        state.minimized = true;
        renderTask();
        return true;
    }

    function bind() {
        if (state.bound) return true;
        state.bound = true;
        el('btnFullAnalysisClose')?.addEventListener('click', requestClose);
        el('btnFullAnalysisDoneClose')?.addEventListener('click', requestClose);
        el('btnFullAnalysisBack')?.addEventListener('click', function() {
            getModal().close('fullTextAnalysisModal');
            getModal().open('importParseModal');
        });
        el('btnFullAnalysisStart')?.addEventListener('click', function() {
            startPreparedImport().catch(function(error) { getToast().warn(error.message || '全文分析暂时无法开始'); });
        });
        el('btnFullAnalysisCancel')?.addEventListener('click', function() {
            requestPause().catch(function(error) { getToast().warn(error.message || '暂停失败'); });
        });
        el('btnFullAnalysisContinue')?.addEventListener('click', function() {
            requestContinue().catch(function(error) { if (error?.name !== 'AbortError') getToast().warn(error.message || '继续失败'); });
        });
        el('btnFullAnalysisSkipSegment')?.addEventListener('click', function() {
            requestSkipSegment().catch(function(error) { getToast().warn(error.message || '跳过失败'); });
        });
        el('btnFullAnalysisStopNow')?.addEventListener('click', function() {
            requestStopNow().catch(function(error) { getToast().warn(error.message || '立即停止失败'); });
        });
        el('btnFullAnalysisRestart')?.addEventListener('click', function() {
            deleteCurrentTask().catch(function(error) { getToast().warn(error.message || '清除任务失败'); });
        });
        el('btnFullAnalysisDelete')?.addEventListener('click', function() {
            deleteCurrentTask().catch(function(error) { getToast().warn(error.message || '删除任务失败'); });
        });
        el('btnFullAnalysisMinimize')?.addEventListener('click', minimize);
        el('btnFullAnalysisExpand')?.addEventListener('click', openModal);
        el('btnFullAnalysisTaskbarPause')?.addEventListener('click', function() {
            requestPause().catch(function(error) { getToast().warn(error.message || '暂停失败'); });
        });
        el('btnFullAnalysisSave')?.addEventListener('click', function() {
            saveResult().catch(function(error) { getToast().warn(error.message || '保存失败，分析结果仍已保留'); });
        });
        el('fullAnalysisScopeSelect')?.addEventListener('change', updateScopeVisibility);
        ['fullAnalysisChapterStart', 'fullAnalysisChapterEnd', 'fullAnalysisVolumeStart', 'fullAnalysisVolumeEnd', 'fullAnalysisModeSelect'].forEach(function(id) {
            el(id)?.addEventListener('change', refreshPreparedSelection);
        });
        el('btnFullAnalysisNormalModel')?.addEventListener('click', function(event) {
            event.stopPropagation();
            if (state.task) return;
            const menu = el('fullAnalysisNormalModelMenu');
            if (!menu) return;
            renderModelPicker();
            menu.hidden = !menu.hidden;
            this.setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
        });
        el('fullAnalysisNormalModelMenu')?.addEventListener('click', function(event) {
            const option = event.target?.closest?.('[data-full-analysis-model-route]');
            if (!option || state.task) return;
            window.setModelIdForScope?.('writing', String(option.dataset.fullAnalysisModelRoute || ''));
            closeModelMenu();
            renderModelPicker();
            refreshPreparedSelection();
        });
        document.addEventListener('click', function(event) {
            if (!event.target?.closest?.('#fullAnalysisNormalModelPicker')) closeModelMenu();
        });
        el('fullTextAnalysisModal')?.addEventListener('click', function(event) {
            if (event.target === event.currentTarget) requestClose();
        });
        renderTask();
        return true;
    }

    window.ZhiyuFullTextAnalysisClient = Object.freeze({
        RESULT_FILE_NAMES: getEngine().RESULT_FILE_NAMES,
        bind,
        openModal,
        minimize,
        openFromImport,
        startFromImport: openFromImport,
        startPreparedImport,
        resumeForCurrentUser,
        requestPause,
        requestContinue,
        requestCancel: requestPause,
        requestDelete: deleteCurrentTask,
        requestRestart: deleteCurrentTask,
        requestStopNow,
        saveResult,
        writeResultFiles
    });
    window.ZHIYU_FULL_TEXT_ANALYSIS_CLIENT_READY = true;
})(window, document);
