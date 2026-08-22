(function(window) {
    'use strict';

    const AppState = window.ZHIYU_APP_STATE;
    const Toast = window.ZHIYU_TOAST || { warn() {}, success() {}, error() {}, info() {} };
    const Modal = window.ZHIYU_MODAL || { open() {}, close() {}, closeAll() {} };

    if (!AppState) {
        throw new Error('Outline UI requires app state module.');
    }

    function getOutlineMode() {
        return AppState.outline.mode === 'function' ? 'function' : 'outline';
    }

    function getOutlineStartLabel() {
        return getOutlineMode() === 'function' ? '生成内容' : '生成大纲';
    }

    function getOutlineSaveLabel() {
        return getOutlineMode() === 'function' ? '保存内容' : '保存到大纲';
    }

    function getOutlinePlaceholder() {
        return getOutlineMode() === 'function'
            ? '点击「生成内容」后内容将在此区域显示...'
            : '点击「开始生成大纲」后内容将在此区域显示...';
    }

    function isOutlineResultPlaceholder(content) {
        const text = String(content || '').trim();
        return text === '点击「开始生成大纲」后内容将在此区域显示...'
            || text === '点击「生成大纲」后内容将在此区域显示...'
            || text === '点击「生成内容」后内容将在此区域显示...';
    }

    function getOutlineResultTextForMode(mode) {
        return mode === 'function' ? (AppState.outline.functionalContent || '') : (AppState.outline.content || '');
    }

    let outlineResultDraftTimer = null;
    let pendingOutlineResultDraft = null;

    function getOutlineDraftSubMode() {
        return (typeof window.getOutlineSubMode === 'function' ? window.getOutlineSubMode() : AppState.outline.outlineSubMode) === 'advanced'
            ? 'advanced'
            : 'normal';
    }

    function captureOutlineResultDraft(options) {
        const resultBox = document.getElementById('outlineResultBox');
        const bookName = AppState.chapter.book || '';
        if (!resultBox || !bookName) return null;
        const content = resultBox.textContent || '';
        if (isOutlineResultPlaceholder(content)) return null;
        if (!content.trim() && !options?.allowBlank) return null;
        const mode = getOutlineMode();
        const subMode = getOutlineDraftSubMode();
        return {
            accountUid: window.AccountDataScope?.getActiveUid?.() || AppState.auth?.uid || 'guest',
            bookName,
            mode,
            subMode,
            outputKind: AppState.outline.advancedOutputKind === 'stage' ? 'stage' : 'master',
            stageKey: AppState.outline.advancedStageIdentity?.key || '',
            content,
        };
    }

    function applyOutlineResultDraftToState(draft) {
        if (!draft) return;
        if (draft.mode === 'function') AppState.outline.functionalContent = draft.content;
        else if (draft.subMode === 'advanced' && draft.outputKind === 'stage') AppState.outline.advancedStageContent = draft.content;
        else if (draft.subMode === 'advanced') AppState.outline.advancedContent = draft.content;
        else AppState.outline.content = draft.content;
    }

    function getOutlineGenerationIdentity(options) {
        const opts = options || {};
        return {
            accountUid: String(opts.accountUid || window.AccountDataScope?.getActiveUid?.() || AppState.auth?.uid || 'guest'),
            bookName: String(opts.bookName || AppState.chapter.book || ''),
            mode: opts.mode === 'function' ? 'function' : 'outline',
            subMode: opts.subMode === 'advanced' ? 'advanced' : 'normal',
            outputKind: opts.outputKind === 'stage' ? 'stage' : 'master',
            stageKey: String(opts.stageKey || ''),
        };
    }

    function doesOutlineGenerationRuntimeMatchCurrent(runtime, mode) {
        if (!runtime) return false;
        const current = getOutlineGenerationIdentity({
            mode: mode || getOutlineMode(),
            subMode: getOutlineDraftSubMode(),
            outputKind: AppState.outline.advancedOutputKind,
            stageKey: AppState.outline.advancedStageIdentity?.key || ''
        });
        if (runtime.accountUid !== current.accountUid || runtime.bookName !== current.bookName || runtime.mode !== current.mode) return false;
        if (runtime.mode === 'function') return true;
        if (runtime.subMode !== current.subMode) return false;
        if (runtime.subMode !== 'advanced') return true;
        return runtime.outputKind === current.outputKind
            && (runtime.outputKind !== 'stage' || !runtime.stageKey || runtime.stageKey === current.stageKey);
    }

    function isCurrentOutlineGenerationRuntime(runtime, mode) {
        return !!runtime?.active && doesOutlineGenerationRuntimeMatchCurrent(runtime, mode);
    }

    function isOutlineGenerationRuntimeBookCurrent(runtime) {
        if (!runtime) return false;
        const current = getOutlineGenerationIdentity({ mode: runtime.mode, subMode: runtime.subMode });
        return runtime.accountUid === current.accountUid && runtime.bookName === current.bookName;
    }

    function queueOutlineRuntimeDraft(runtime) {
        if (!runtime || !runtime.bookName) return;
        pendingOutlineResultDraft = {
            accountUid: runtime.accountUid,
            bookName: runtime.bookName,
            mode: runtime.mode,
            subMode: runtime.subMode,
            outputKind: runtime.outputKind,
            stageKey: runtime.stageKey,
            content: runtime.content || ''
        };
        if (outlineResultDraftTimer) clearTimeout(outlineResultDraftTimer);
        outlineResultDraftTimer = setTimeout(flushOutlineResultDraft, 250);
    }

    function startOutlineGenerationRuntime(options) {
        if (AppState.outline.generationRuntime?.active) return null;
        window.clearOutlineContinueSession?.();
        const identity = getOutlineGenerationIdentity(options);
        const runtime = {
            ...identity,
            taskId: `outline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            active: true,
            content: String(options?.content || ''),
            startedAt: Date.now()
        };
        AppState.outline.generationRuntime = runtime;
        if (isOutlineGenerationRuntimeBookCurrent(runtime)) applyOutlineResultDraftToState(runtime);
        queueOutlineRuntimeDraft(runtime);
        return runtime;
    }

    function updateOutlineGenerationRuntime(content, expectedRuntime) {
        const runtime = AppState.outline.generationRuntime;
        if (!runtime?.active) return false;
        if (expectedRuntime && runtime !== expectedRuntime) return false;
        runtime.content = String(content || '');
        const isCurrentBook = isOutlineGenerationRuntimeBookCurrent(runtime);
        if (isCurrentBook) applyOutlineResultDraftToState(runtime);
        queueOutlineRuntimeDraft(runtime);
        return doesOutlineGenerationRuntimeMatchCurrent(runtime, runtime.mode);
    }

    function normalizeOutlineStreamText(value, streamState) {
        const state = streamState || {};
        let text = String(value || '');
        if (!state.started) {
            text = text.replace(/^\uFEFF/, '').replace(/^(?:[ \t]*\r?\n)+/, '');
            if (!text) return '';
            state.started = true;
        }
        return text;
    }

    function appendOutlineStreamText(target, value, streamState, options) {
        if (!target) return '';
        const state = streamState || {};
        const firstVisibleChunk = !state.rendered;
        const text = options?.normalized
            ? String(value || '')
            : normalizeOutlineStreamText(value, state);
        if (!text) return '';
        if (typeof window.ZhiyuEditorAdapter?.appendPlainText === 'function') {
            window.ZhiyuEditorAdapter.appendPlainText(target, text);
        } else {
            target.appendChild(document.createTextNode(text));
        }
        if (firstVisibleChunk) {
            state.rendered = true;
            target.scrollTop = 0;
        }
        return text;
    }

    function finishOutlineGenerationRuntime(content, expectedRuntime) {
        const runtime = AppState.outline.generationRuntime;
        if (!runtime) return false;
        if (expectedRuntime && runtime !== expectedRuntime) return false;
        if (content !== undefined) runtime.content = String(content || '');
        const isCurrentBook = isOutlineGenerationRuntimeBookCurrent(runtime);
        if (isCurrentBook) applyOutlineResultDraftToState(runtime);
        const isCurrentView = doesOutlineGenerationRuntimeMatchCurrent(runtime, runtime.mode);
        runtime.active = false;
        queueOutlineRuntimeDraft(runtime);
        flushOutlineResultDraft();
        return isCurrentView;
    }

    function persistOutlineResultDraft(draft) {
        if (!draft) return false;
        const activeUid = window.AccountDataScope?.getActiveUid?.() || AppState.auth?.uid || 'guest';
        if (String(activeUid) !== String(draft.accountUid)) return false;
        if (draft.mode === 'function') {
            window.saveFunctionalOutlineDraft?.(draft.bookName, draft.content);
        } else if (draft.subMode === 'advanced' && draft.outputKind === 'stage' && draft.stageKey) {
            // 阶段粗纲未正式保存前只保留在当前页面状态；刷新或重新登录后自然清空。
            return true;
        } else if (draft.subMode === 'advanced') {
            window.saveAdvancedOutlineDraft?.(draft.bookName, draft.content);
        } else {
            window.saveNormalOutlineDraft?.(draft.bookName, draft.content);
        }
        return true;
    }

    function cancelOutlineResultDraftSave() {
        if (outlineResultDraftTimer) clearTimeout(outlineResultDraftTimer);
        outlineResultDraftTimer = null;
        pendingOutlineResultDraft = null;
    }

    function flushOutlineResultDraft() {
        if (outlineResultDraftTimer) clearTimeout(outlineResultDraftTimer);
        outlineResultDraftTimer = null;
        const draft = pendingOutlineResultDraft;
        pendingOutlineResultDraft = null;
        return persistOutlineResultDraft(draft);
    }

    function scheduleOutlineResultDraftSave() {
        const draft = captureOutlineResultDraft({ allowBlank: true });
        if (!draft) return false;
        applyOutlineResultDraftToState(draft);
        pendingOutlineResultDraft = draft;
        if (outlineResultDraftTimer) clearTimeout(outlineResultDraftTimer);
        outlineResultDraftTimer = setTimeout(flushOutlineResultDraft, 250);
        return true;
    }

    function saveCurrentOutlineResultDraft() {
        const draft = captureOutlineResultDraft({ allowBlank: true });
        if (!draft) return false;
        applyOutlineResultDraftToState(draft);
        cancelOutlineResultDraftSave();
        return persistOutlineResultDraft(draft);
    }

    function resetOutlineBookScopedState(options) {
        if (options?.discardPending) cancelOutlineResultDraftSave();
        else flushOutlineResultDraft();
        window.clearOutlineContinueSession?.();
        Object.assign(AppState.outline, {
            content: '',
            functionalContent: '',
            advancedContent: '',
            advancedStageContent: '',
            advancedStageIdentity: null,
            advancedOutputKind: 'master',
            outlineAdvancedMasterSnapshot: '',
            outlineAdvancedStages: [],
            outlineAdvancedSourceName: '',
            outlineAdvancedRecoveryState: null,
            outlineAdvancedLinkedFiles: [],
            outlineAdvancedLinkedDefaultsBook: '',
            functionalLinkedFiles: [],
            importedWorkSummary: '',
            importedWorkName: '',
            continueSession: null,
            continueBase: '',
            continueResult: '',
            continueRef: '',
            genres: [],
            outlineAdvancedGenres: [],
            functionalGenres: [],
            outlineNormalCustomGenre: '',
            outlineAdvancedCustomGenre: '',
            functionSubject: '',
            genrePreferenceTags: { normal: [], advanced: [], function: [] },
            genrePreferenceAppliedGenres: { normal: [], advanced: [], function: [] },
        });
    }

    function restoreOutlineBookScopedState(bookName) {
        AppState.outline.content = window.restoreNormalOutlineDraft?.(bookName) || '';
        AppState.outline.functionalContent = window.restoreFunctionalOutlineDraft?.(bookName) || '';
        AppState.outline.advancedContent = window.restoreAdvancedOutlineDraft?.(bookName) || '';
        AppState.outline.advancedStageContent = '';
        AppState.outline.advancedStageIdentity = null;
        AppState.outline.advancedOutputKind = 'master';
        AppState.outline.outlineAdvancedMasterSnapshot = '';
        AppState.outline.outlineAdvancedStages = [];
        AppState.outline.outlineAdvancedSourceName = '';
        window.applyBookGenreDefaults?.(bookName);
        return true;
    }

    function syncOutlineResultToState() {
        const draft = captureOutlineResultDraft();
        applyOutlineResultDraftToState(draft);
        return draft;
    }

    function updateOutlineFunctionLinkedCount() {
        const el = document.getElementById('outlineFunctionLinkedCount');
        if (!el) return;
        const files = Array.isArray(AppState.outline.functionalLinkedFiles) ? AppState.outline.functionalLinkedFiles : [];
        el.textContent = files.length > 0 ? ('已选择 ' + files.length + ' 项') : '未选择';
    }

    function setOutlineFunctionType(type) {
        AppState.outline.functionType = type === 'script' ? 'script' : 'imitate';
        document.querySelectorAll('#outlineFunctionTypeToggle .gender-opt').forEach(function(el) {
            el.classList.toggle('active', el.dataset.fn === AppState.outline.functionType);
        });
    }

    function getSelectedOutlineFunctionType() {
        return AppState.outline.functionType === 'script' ? 'script' : 'imitate';
    }

    function openOutlineTemplateSelector() {
        const isFunctionMode = getOutlineMode() === 'function';
        const context = isFunctionMode
            ? (getSelectedOutlineFunctionType() === 'script' ? 'functionalScript' : 'functionalOutline')
            : 'outline';
        const subCategory = isFunctionMode
            ? (getSelectedOutlineFunctionType() === 'script' ? '分镜' : '拆书')
            : '大纲';
        if (typeof window.openTemplateSelectorWithContext === 'function') {
            window.openTemplateSelectorWithContext({ context, subCategory });
            return;
        }
        if (typeof window.openTemplateSelector === 'function') window.openTemplateSelector({ context, subCategory });
    }

    function finishOutlineSuccess(ctx) {
        const { resultBox, btn, finalContent, successLog, runtime: expectedRuntime } = ctx || {};
        if (!resultBox || !btn) return;

        const runtime = expectedRuntime || AppState.outline.generationRuntime;
        const runtimeMatchesCurrent = runtime
            ? doesOutlineGenerationRuntimeMatchCurrent(runtime, runtime.mode)
            : true;
        if (runtimeMatchesCurrent) {
            resultBox.style.background = '';
            resultBox.textContent = finalContent || '';
        }
        finishOutlineGenerationRuntime(finalContent || '', runtime);
        if (runtimeMatchesCurrent) AppState.outline.content = finalContent || '';
        AppState.outline.importedWorkSummary = '';
        AppState.outline.importedWorkName = '';

        const refBooksCount = document.getElementById('refBooksCount');
        if (refBooksCount) refBooksCount.textContent = '';
        const outlineActions = document.getElementById('outlineActions');
        if (outlineActions) outlineActions.style.display = 'flex';

        btn.disabled = false;
        btn.textContent = getOutlineStartLabel();
        delete btn.dataset.generating;
        delete window.outlineAbortController;

        if (window.ZHIYU_UTILS?.appendLog) {
            window.ZHIYU_UTILS.appendLog(null, successLog, 'success');
        }
    }

    function finishOutlineError(ctx) {
        const { err, resultBox, btn, runtime: expectedRuntime } = ctx || {};
        if (!resultBox || !btn) return;

        const msg = typeof window.formatAiErrorForDisplay === 'function'
            ? window.formatAiErrorForDisplay(err, '大纲生成失败')
            : (err?.message || err || '未知错误');
        const isAbort = typeof window.isAbortLikeError === 'function'
            ? window.isAbortLikeError(err)
            : String(msg).includes('AbortError');
        const appendLog = window.ZHIYU_UTILS?.appendLog || function() {};
        const runtime = expectedRuntime || AppState.outline.generationRuntime;
        const runtimeMatchesCurrent = runtime
            ? doesOutlineGenerationRuntimeMatchCurrent(runtime, runtime.mode)
            : true;

        const currentVisibleText = runtimeMatchesCurrent && !isOutlineResultPlaceholder(resultBox.textContent || '')
            ? (resultBox.textContent || '')
            : '';
        const keptContent = String(runtime?.content || currentVisibleText || '');

        if (!runtimeMatchesCurrent) {
            appendLog(null, isAbort ? '已停止原作品的大纲生成' : '原作品的大纲生成失败：' + msg, isAbort ? 'warn' : 'error');
        } else if (isAbort) {
            resultBox.textContent = keptContent;
            appendLog(null, keptContent ? '已停止大纲生成，当前已生成内容已保留' : '已停止大纲生成', 'warn');
        } else if (String(msg).includes('402') || /quota|额度不足|余额不足/i.test(String(msg))) {
            resultBox.textContent = keptContent || '❌ 自备模型账户额度不足，请到对应模型服务商处理';
            appendLog(null, '自备模型账户额度不足', 'error');
        } else {
            resultBox.textContent = keptContent || ('❌ 生成失败：' + msg);
            appendLog(
                null,
                keptContent
                    ? '大纲生成中断，已保留成功内容：' + msg
                    : '大纲生成失败：' + msg,
                'error'
            );
        }

        finishOutlineGenerationRuntime(keptContent, runtime);
        if (runtimeMatchesCurrent) resultBox.style.background = '';
        btn.disabled = false;
        btn.textContent = getOutlineStartLabel();
        delete btn.dataset.generating;
        delete window.outlineAbortController;
    }

        const OUTLINE_GENRES_MALE = [
            '传统玄幻','玄幻脑洞','战神赘婿','东方仙侠','都市修真','西方奇幻',
            '传统武侠','都市高武','都市脑洞','都市种田','都市日常','科幻末世',
            '科幻','无限流','悬疑灵异','悬疑脑洞','悬疑','灵异','抗战谍战',
            '军事军旅','历史古代','年代历史','游戏体育','游戏电竞','体育',
            '动漫衍生','同人二创','二次元同人','官场','现实纪实'
        ];
        const OUTLINE_GENRES_FEMALE = [
            '女频悬疑','悬疑脑洞','古风世情','架空古言','古言脑洞','古代重生',
            '宫斗宅斗','宫廷权谋','宅斗种田','仙侠言情','玄幻言情','武侠言情',
            '女尊','西幻言情','灵异言情','科幻末世','末世言情','民国言情',
            '年代','年代言情','种田','快穿','穿书','现代重生','系统异能',
            '青春甜宠','校园言情','现言脑洞','豪门总裁','总裁豪门','都市职场',
            '职场婚恋','娱乐圈','星光璀璨','女频衍生','动漫衍生','游戏体育',
            '双男主','纯爱','双女主','百合','无 CP'
        ];
        const OUTLINE_WORDCOUNT = { short:'短篇 10-20万字', medium:'中篇 50万字', long:'长篇 100万字+', xlong:'超长篇 200万字+' };
        AppState.outline.tplTab = 'fav';
        AppState.outline.tplShowAll = false;
        AppState.outline.genreGender = AppState.outline.genreGender || 'male';
        AppState.outline.functionalGenreGender = AppState.outline.functionalGenreGender || 'male';
        AppState.outline.functionType = AppState.outline.functionType === 'script' ? 'script' : 'imitate';
        if (!Array.isArray(AppState.outline.functionalGenres)) AppState.outline.functionalGenres = [];
        if (!Array.isArray(AppState.outline.functionalLinkedFiles)) AppState.outline.functionalLinkedFiles = [];

        function initGenreTags() {
            if (typeof window.renderOutlineGenreTags === 'function') {
                window.renderOutlineGenreTags();
                return;
            }
            const container = document.getElementById('genreTags');
            if (!container) return;
            container.innerHTML = '';
            const genres = AppState.outline.genreGender === 'male' ? OUTLINE_GENRES_MALE : OUTLINE_GENRES_FEMALE;
            genres.forEach(g => {
                const tag = document.createElement('span');
                tag.className = 'genre-tag';
                tag.textContent = g;
                if (AppState.outline.genres.includes(g)) tag.classList.add('selected');
                tag.addEventListener('click', function() {
                    if (!this.classList.contains('selected') && AppState.outline.genres.length >= 4) {
                        Toast.warn('最多选择4个题材');
                        return;
                    }
                    this.classList.toggle('selected');
                    if (this.classList.contains('selected')) {
                        AppState.outline.genres.push(g);
                    } else {
                        AppState.outline.genres = AppState.outline.genres.filter(x => x !== g);
                    }
                });
                container.appendChild(tag);
            });
        }

        function initFunctionalGenreTags() {
            if (!Array.isArray(AppState.outline.functionalGenres)) AppState.outline.functionalGenres = [];
            window.renderOutlineGenreTags?.();
        }

        function renderOutlineMode() {
            const mode = getOutlineMode();
            const runtime = AppState.outline.generationRuntime;
            const runtimeMatches = doesOutlineGenerationRuntimeMatchCurrent(runtime, mode);
            const runtimeVisible = runtimeMatches && runtime.active;
            const modal = document.getElementById('outlineModal');
            if (modal) modal.dataset.mode = mode;
            document.querySelectorAll('#outlineModeTabs .outline-mode-tab').forEach(function(btn) {
                btn.classList.toggle('active', btn.dataset.mode === mode);
            });
            const resultBox = document.getElementById('outlineResultBox');
            const content = runtimeMatches ? runtime.content : getOutlineResultTextForMode(mode);
            if (resultBox) {
                resultBox.textContent = content || getOutlinePlaceholder();
                resultBox.style.background = runtimeVisible ? '#e3f2fd' : '';
                resultBox.style.color = '';
            }
            const title = document.getElementById('outlineSummaryTitle');
            if (title) title.textContent = mode === 'function' ? '5. 功能方向描述' : '5. 剧情梗概（可选）';
            const input = document.getElementById('outlineCoreSummary');
            if (input) {
                input.value = mode === 'function' ? (AppState.outline.functionalDirection || '') : (AppState.outline.coreSummary || '');
                input.placeholder = mode === 'function' ? '输入功能方向、拆书目标或剧本要求...' : '输入剧情梗概和灵感...';
            }
            const startBtn = document.getElementById('btnStartOutline');
            if (startBtn) {
                if (runtimeVisible) {
                    startBtn.dataset.generating = 'true';
                    startBtn.textContent = '停止生成';
                } else {
                    delete startBtn.dataset.generating;
                    startBtn.textContent = getOutlineStartLabel();
                }
            }
            const saveBtn = document.getElementById('btnOutlineSave');
            if (saveBtn) saveBtn.textContent = getOutlineSaveLabel();
            const refStatus = document.getElementById('refBooksCount');
            if (refStatus) refStatus.style.display = mode === 'function' ? 'none' : '';
            const subject = document.getElementById('outlineFunctionSubject');
            if (subject) subject.value = AppState.outline.functionSubject || '';
            setOutlineFunctionType(AppState.outline.functionType || 'imitate');
            const templateContext = mode === 'function'
                ? (getSelectedOutlineFunctionType() === 'script' ? 'functionalScript' : 'functionalOutline')
                : 'outline';
            window.renderOutlineTemplateSelection?.(templateContext);
            initFunctionalGenreTags();
            window.renderSummaryPreferenceChips?.();
            window.syncAdvancedOutlineUI?.();
            updateOutlineFunctionLinkedCount();
        }

        // 男频/女频切换
        document.getElementById('genreGenderToggle')?.addEventListener('click', function(e) {
            const opt = e.target.closest('.gender-opt');
            if (!opt) return;
            const g = opt.dataset.g;
            AppState.outline.genreGender = g;
            // 切换时清空已选题材
            AppState.outline.genres = [];
            // 更新按钮样式
            this.querySelectorAll('.gender-opt').forEach(el => {
                el.classList.toggle('active', el.dataset.g === g);
            });
            initGenreTags();
        });

        // 字数选择
        document.querySelectorAll('#outlineModal .wordcount-option').forEach(el => {
            el.addEventListener('click', function() {
                document.querySelectorAll('#outlineModal .wordcount-option').forEach(e => e.classList.remove('selected'));
                this.classList.add('selected');
            });
        });

        document.querySelectorAll('#outlineModeTabs .outline-mode-tab').forEach(btn => {
            btn.addEventListener('click', function() {
                const nextMode = this.dataset.mode === 'function' ? 'function' : 'outline';
                saveCurrentOutlineResultDraft();
                const input = document.getElementById('outlineCoreSummary');
                if (input) {
                    if (getOutlineMode() === 'function') AppState.outline.functionalDirection = input.value.trim();
                    else AppState.outline.coreSummary = input.value.trim();
                }
                AppState.outline.mode = nextMode;
                renderOutlineMode();
            });
        });

        document.getElementById('outlineFunctionTypeToggle')?.addEventListener('click', function(e) {
            const opt = e.target.closest('.gender-opt');
            if (!opt) return;
            setOutlineFunctionType(opt.dataset.fn);
        });

        document.getElementById('outlineFunctionSubject')?.addEventListener('input', function() {
            AppState.outline.functionSubject = this.value.trim();
        });

        document.getElementById('outlineResultBox')?.addEventListener('input', scheduleOutlineResultDraftSave);
        window.addEventListener('beforeunload', flushOutlineResultDraft);

        // 打开大纲弹窗
        document.getElementById('btnOutline')?.addEventListener('click', function() {
            if (!AppState.chapter.book) { Toast.warn('请先选择书籍'); return; }
            if (!AppState.outline.genres.length) AppState.outline.genres = [];
            initGenreTags();
            initFunctionalGenreTags();
            Modal.open('outlineModal');
            renderOutlineMode();
            AppState.outline.refBooks = [];
        });


    window.OUTLINE_GENRES_MALE = OUTLINE_GENRES_MALE;
    window.OUTLINE_GENRES_FEMALE = OUTLINE_GENRES_FEMALE;
    window.OUTLINE_WORDCOUNT = OUTLINE_WORDCOUNT;
    window.getOutlineMode = getOutlineMode;
    window.getOutlineStartLabel = getOutlineStartLabel;
    window.getOutlineSaveLabel = getOutlineSaveLabel;
    window.getOutlinePlaceholder = getOutlinePlaceholder;
    window.getOutlineResultTextForMode = getOutlineResultTextForMode;
    window.syncOutlineResultToState = syncOutlineResultToState;
    window.captureOutlineResultDraft = captureOutlineResultDraft;
    window.persistOutlineResultDraft = persistOutlineResultDraft;
    window.scheduleOutlineResultDraftSave = scheduleOutlineResultDraftSave;
    window.saveCurrentOutlineResultDraft = saveCurrentOutlineResultDraft;
    window.flushOutlineResultDraft = flushOutlineResultDraft;
    window.cancelOutlineResultDraftSave = cancelOutlineResultDraftSave;
    window.resetOutlineBookScopedState = resetOutlineBookScopedState;
    window.restoreOutlineBookScopedState = restoreOutlineBookScopedState;
    window.updateOutlineFunctionLinkedCount = updateOutlineFunctionLinkedCount;
    window.setOutlineFunctionType = setOutlineFunctionType;
    window.getSelectedOutlineFunctionType = getSelectedOutlineFunctionType;
    window.openOutlineTemplateSelector = openOutlineTemplateSelector;
    window.initFunctionalGenreTags = initFunctionalGenreTags;
    window.renderOutlineMode = renderOutlineMode;
    window.startOutlineGenerationRuntime = startOutlineGenerationRuntime;
    window.updateOutlineGenerationRuntime = updateOutlineGenerationRuntime;
    window.normalizeOutlineStreamText = normalizeOutlineStreamText;
    window.appendOutlineStreamText = appendOutlineStreamText;
    window.finishOutlineGenerationRuntime = finishOutlineGenerationRuntime;
    window.hasActiveOutlineGenerationRuntime = function() {
        return !!AppState.outline.generationRuntime?.active;
    };
    window.doesOutlineGenerationRuntimeMatchCurrent = doesOutlineGenerationRuntimeMatchCurrent;
    window.isCurrentOutlineGenerationRuntime = isCurrentOutlineGenerationRuntime;
    window.initGenreTags = initGenreTags;
    window.finishOutlineSuccess = finishOutlineSuccess;
    window.finishOutlineError = finishOutlineError;
    window.ZHIYU_OUTLINE_UI_READY = true;
})(window);
