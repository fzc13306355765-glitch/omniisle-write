(function(window) {
    'use strict';

    let accountScopeEpoch = 0;
    let currentAccountScopeReady = Promise.resolve(true);
    let accountTransitionSequence = 0;
    let activeAccountTransition = null;
    const accountTaskControllers = new Set();

    function getCanonicalAppState() {
        return window.ZHIYU_APP_STATE || window.AppState || {};
    }

    function stopOldAccountSync() {
        window.flushOutlineResultDraft?.();
        window.stopReliableCloudBackup?.();
        accountScopeEpoch += 1;
        accountTaskControllers.forEach(function(controller) {
            try { controller.abort(); } catch (e) {}
        });
        accountTaskControllers.clear();
        if (typeof window.stopChapterAutoSync === 'function') window.stopChapterAutoSync();
        if (window.outlineAbortController) {
            window.outlineAbortController.abort();
            delete window.outlineAbortController;
        }
        const state = getCanonicalAppState();
        ['ogAbortController', 'dcAbortController', 'apAbortController'].forEach(function(key) {
            const controller = state.outlineGen?.[key];
            if (controller && typeof controller.abort === 'function') controller.abort();
            if (state.outlineGen) state.outlineGen[key] = null;
        });
    }

    function beginAccountScopedTask(externalSignal) {
        const controller = new AbortController();
        const uid = window.AccountDataScope.getActiveUid();
        const authenticatedUid = String(getCanonicalAppState().auth?.uid || '');
        const epoch = accountScopeEpoch;
        const transitionId = activeAccountTransition?.id || 0;
        let externalAbort = null;
        if (externalSignal) {
            externalAbort = function() { controller.abort(externalSignal.reason); };
            if (externalSignal.aborted) externalAbort();
            else externalSignal.addEventListener('abort', externalAbort, { once: true });
        }
        accountTaskControllers.add(controller);
        if (activeAccountTransition || !authenticatedUid || authenticatedUid !== uid) controller.abort();
        return {
            uid,
            epoch,
            signal: controller.signal,
            matchesAccount() {
                return window.AccountDataScope.getActiveUid() === uid
                    && !activeAccountTransition
                    && transitionId === 0
                    && String(getCanonicalAppState().auth?.uid || '') === authenticatedUid
                    && !!authenticatedUid
                    && authenticatedUid === uid
                    && accountScopeEpoch === epoch;
            },
            isCurrent() {
                return !controller.signal.aborted
                    && this.matchesAccount();
            },
            release() {
                accountTaskControllers.delete(controller);
                if (externalSignal && externalAbort) {
                    try { externalSignal.removeEventListener('abort', externalAbort); } catch (e) {}
                }
            }
        };
    }

    function clearCurrentAccountRuntimeState() {
        const state = getCanonicalAppState();
        if (!state) return;
        const previousBookName = state.chapter?.book || '';
        window.resetOutlineBookScopedState?.({ discardPending: true });
        if (typeof window.syncBookScopedReferenceState === 'function') {
            window.syncBookScopedReferenceState('', previousBookName);
        } else {
            window.activateOGLinkedMemoryBook?.('');
            window.clearZhiyuAssistantReferenceForBookChange?.();
        }
        window.clearAllOGLinkedMemoryBooks?.();
        window.clearAllOGOutlineSelectionBooks?.();
        state.chapter = { book: null, vi: -1, ci: -1 };
        state.memory = { book: '', folder: '', batchMode: false };
        state.gen.refChapters = [];
        state.gen.linkedFiles = [];
        state.gen.linkedFilesByChapter = {};
        state.gen.linkedDefaultsInitializedByChapter = {};
        state.gen.linkedMemoryBookName = '';
        state.gen.linkedMemoryBookScopeKey = '';
        state.gen.linkedMemoryChapterScopeKey = '';
        state.gen.plotInput = '';
        state.outline.content = '';
        state.outline.advancedContent = '';
        state.outline.functionalContent = '';
        state.sync._versions = {};
        const resultBox = document.getElementById('resultBox');
        if (resultBox) {
            if (typeof window.clearRefFileEditorState === 'function') {
                window.clearRefFileEditorState(resultBox);
            } else {
                resultBox.querySelectorAll?.('canvas').forEach(function(canvas) { canvas._graphCleanup?.(); });
                [
                    'editingRefFile',
                    'editingRefBookName',
                    'editingRefFolder',
                    'editingRefType',
                    'infoCardOriginalMd',
                    'infoCardFolder',
                    'roleRelationOriginalMd',
                    'pendingFindReplacements'
                ].forEach(function(key) { delete resultBox.dataset[key]; });
                if (state.ui) state.ui.activeRefFileKey = '';
            }
            resultBox.textContent = '点击左侧章节查看内容，或生成新章节...';
            resultBox.style.background = '';
            resultBox.setAttribute('contenteditable', 'true');
            resultBox.classList.remove('ref-file-preview');
        }
        const bookSel = document.getElementById('bookSel');
        if (bookSel) bookSel.innerHTML = '';
    }

    function flushCurrentAccountEditorState() {
        const current = getCanonicalAppState().chapter || {};
        if (!current.book || current.vi < 0 || current.ci < 0) return Promise.resolve(true);
        const books = typeof window.gB === 'function' ? window.gB() : {};
        const resultBox = document.getElementById('resultBox');
        const content = typeof window.getResultBoxHTMLForChapterSave === 'function'
            ? window.getResultBoxHTMLForChapterSave()
            : resultBox?.innerHTML;
        if (content == null || /^点击左侧章节|^\[正在生成/.test(content)) return Promise.resolve(true);
        const normalized = typeof window.normalizeChapterEditorHTML === 'function'
            ? window.normalizeChapterEditorHTML(content)
            : content;
        const prepared = window.prepareChapterContentForLocalSave?.(
            current.book,
            current.vi,
            current.ci,
            normalized,
            { books }
        );
        if (!prepared) return Promise.resolve(true);
        const chapter = prepared.chapter;
        if (typeof window.attachCurrentAIDetectStateToChapter === 'function') window.attachCurrentAIDetectStateToChapter(chapter);
        if (typeof window._touchChapterForSync === 'function') window._touchChapterForSync(books[current.book], chapter);
        const saved = window.ZHIYU_STORAGE_SERVICE.saveBooks(books);
        if (!prepared.explicitClear && typeof window.saveDraft === 'function') {
            window.saveDraft(current.book, current.vi, current.ci, chapter.content, { pendingSync: true });
        }
        return Promise.resolve(saved).then(function(ok) {
            return ok !== false;
        });
    }

    async function fallbackToGuestScope(transitionId) {
        if (activeAccountTransition?.id !== transitionId) return false;
        const guestUid = window.AccountDataScope.normalizeUid('guest');
        window.AccountDataScope.setActiveUid(guestUid);
        clearCurrentAccountRuntimeState();
        const results = await Promise.all([
            window.ZHIYU_STORAGE_SERVICE.switchScope(guestUid),
            typeof window._loadMemBooks === 'function' ? window._loadMemBooks(true) : true,
        ]).catch(function() { return [false, false]; });
        return results[0] !== false;
    }

    async function switchLocalAccountScope(uid, options) {
        const settings = options && typeof options === 'object' ? options : {};
        const nextUid = window.AccountDataScope.normalizeUid(uid);
        const previousUid = window.AccountDataScope.getActiveUid();
        const transitionId = ++accountTransitionSequence;
        // 先立即让旧账号的网络任务失效，再等待本地保存；避免新 Token 与旧账号
        // 本地数据同时存在的过渡窗口。
        stopOldAccountSync();
        activeAccountTransition = { id: transitionId, fromUid: previousUid, toUid: nextUid };
        try {
            settings.deactivate?.();
            if (typeof window.waitForMemBooksSaveIdle === 'function') {
                const memorySaved = await window.waitForMemBooksSaveIdle();
                if (memorySaved === false) throw new Error('旧账号资料尚未安全写入本机');
            }
            if (activeAccountTransition?.id !== transitionId) return false;
            const flushed = await flushCurrentAccountEditorState();
            if (flushed === false) throw new Error('旧账号当前章节尚未安全写入本机');
            if (activeAccountTransition?.id !== transitionId) return false;

            if (previousUid !== nextUid) {
                window.ZhiyuFullTextAnalysisClient?.handleAccountScopeChange?.(nextUid);
                window.prepareModelAccountScopeChange?.();
                window.ZHIYU_SECURE_STORE?.clearRuntime?.();
                window.resetTemplateAccountScopeState?.();
                const epoch = accountScopeEpoch;
                window.AccountDataScope.setActiveUid(nextUid);
                clearCurrentAccountRuntimeState();
                const results = await Promise.all([
                    window.ZHIYU_STORAGE_SERVICE.switchScope(nextUid),
                    typeof window._loadMemBooks === 'function' ? window._loadMemBooks(true) : true,
                ]);
                if (activeAccountTransition?.id !== transitionId
                    || epoch !== accountScopeEpoch
                    || window.AccountDataScope.getActiveUid() !== nextUid
                    || results[0] === false) {
                    throw new Error('目标账号的本机数据未能安全加载');
                }
                await window.recoverEmergencyDrafts?.({
                    expectedUid: nextUid,
                    books: window.ZHIYU_STORAGE_SERVICE.getBooks?.() || {}
                });
                if (activeAccountTransition?.id !== transitionId
                    || epoch !== accountScopeEpoch
                    || window.AccountDataScope.getActiveUid() !== nextUid) {
                    throw new Error('紧急草稿恢复期间账号已变化');
                }
            }

            await settings.commit?.();
            if (activeAccountTransition?.id !== transitionId) return false;
            activeAccountTransition = null;
            window.reloadModelStateForCurrentUser?.();
            if (typeof window._loadSyncVersions === 'function') window._loadSyncVersions();
            if (document.readyState !== 'loading') {
                window.refreshOverview?.();
                window.refreshTree?.();
                window.refreshMemGrid?.();
                window.refreshSettings?.();
                window.resetTemplatePage?.();
                window.refreshTemplateGrid?.();
            }
            if (nextUid !== 'guest' && getCanonicalAppState().auth?.isLoggedIn) window._startChapterAutoSync?.();
            if (nextUid !== 'guest' && getCanonicalAppState().auth?.isLoggedIn) {
                await window.ZhiyuFullTextAnalysisClient?.resumeForCurrentUser?.();
            }
            return true;
        } catch(error) {
            if (activeAccountTransition?.id === transitionId) {
                await fallbackToGuestScope(transitionId);
                activeAccountTransition = null;
                settings.rollback?.(error);
            }
            throw error;
        }
    }

    async function reloadAccountWriterPersistentState(uid) {
        const expectedUid = window.AccountDataScope.normalizeUid(uid);
        if (!expectedUid || window.AccountDataScope.getActiveUid() !== expectedUid) return false;
        stopOldAccountSync();
        clearCurrentAccountRuntimeState();
        const snapshot = await window.ZHIYU_STORAGE_SERVICE?.reloadCurrentAccountData?.(expectedUid);
        if (!snapshot || window.AccountDataScope.getActiveUid() !== expectedUid) return false;
        const memoryReady = typeof window._loadMemBooks === 'function'
            ? await window._loadMemBooks(true)
            : true;
        if (memoryReady === false || window.AccountDataScope.getActiveUid() !== expectedUid) return false;
        window.reloadModelStateForCurrentUser?.();
        if (typeof window._loadSyncVersions === 'function') window._loadSyncVersions();
        if (document.readyState !== 'loading') {
            window.refreshOverview?.();
            window.refreshTree?.();
            window.refreshMemGrid?.();
            window.refreshSettings?.();
            window.resetTemplatePage?.();
            window.refreshTemplateGrid?.();
        }
        return true;
    }

    function setCurrentAccountScope(uid, options) {
        currentAccountScopeReady = switchLocalAccountScope(uid, options);
        return currentAccountScopeReady;
    }

    function ensureCurrentAccountScopeReady() { return currentAccountScopeReady; }
    function getAccountScopeEpoch() { return accountScopeEpoch; }
    function isCurrentAccountSync(uid, epoch) {
        return !activeAccountTransition
            && window.AccountDataScope.getActiveUid() === uid
            && String(getCanonicalAppState().auth?.uid || '') === String(uid || '')
            && accountScopeEpoch === epoch;
    }

    function isAccountScopeTransitioning() { return !!activeAccountTransition; }

    window.stopOldAccountSync = stopOldAccountSync;
    window.clearCurrentAccountRuntimeState = clearCurrentAccountRuntimeState;
    window.flushCurrentAccountEditorState = flushCurrentAccountEditorState;
    window.switchLocalAccountScope = switchLocalAccountScope;
    window.reloadAccountWriterPersistentState = reloadAccountWriterPersistentState;
    window.setCurrentAccountScope = setCurrentAccountScope;
    window.ensureCurrentAccountScopeReady = ensureCurrentAccountScopeReady;
    window.getAccountScopeEpoch = getAccountScopeEpoch;
    window.isCurrentAccountSync = isCurrentAccountSync;
    window.isAccountScopeTransitioning = isAccountScopeTransitioning;
    window.beginAccountScopedTask = beginAccountScopedTask;
})(window);
