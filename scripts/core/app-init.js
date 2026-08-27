(function(window) {
    'use strict';

    const StorageService = window.ZHIYU_STORAGE_SERVICE || window.StorageService;
    const SecureStore = window.ZHIYU_SECURE_STORE || window.SecureStore;
    const STARTUP_MEMORY_WAIT_MS = 8000;
    let startupMemoryLoad = null;

    function sendAuthHeartbeat() { return Promise.resolve(false); }
    function startAuthPresenceHeartbeat() {}
    function stopAuthPresenceHeartbeat() {}

    function ensureStartupMemoryReady() {
        if (!startupMemoryLoad) {
            const load = Promise.resolve()
                .then(function() { return window._loadMemBooks?.(); })
                .then(function() { return true; })
                .catch(function(error) {
                    console.warn('记忆库本机初始化失败：', error);
                    if (startupMemoryLoad === load) startupMemoryLoad = null;
                    return false;
                });
            startupMemoryLoad = load;
        }
        return Promise.race([
            startupMemoryLoad,
            new Promise(function(resolve) {
                window.setTimeout(function() { resolve(false); }, STARTUP_MEMORY_WAIT_MS);
            })
        ]);
    }

    function runAfterFirstPaint(task) {
        const start = function() {
            Promise.resolve().then(task).catch(function(error) {
                console.warn('首屏本机任务失败：', error);
            });
        };
        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(start, { timeout: 1200 });
        } else if (typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(function() { window.setTimeout(start, 0); });
        } else {
            window.setTimeout(start, 0);
        }
    }

    async function init() {
        const identity = window.ZHIYU_COMMUNITY_RUNTIME?.getLocalIdentity?.();
        const initialUid = identity?.uid || 'community-local';
        window.ZhiyuFullTextAnalysisClient?.bind?.();
        await StorageService.init(initialUid);
        const initialBooks = StorageService.getBooks();
        if (window.ensureAllChapterLocalIds?.(initialBooks)) {
            await StorageService.saveBooks(initialBooks, { cloudWrite: 'suppress' });
        }
        await window.recoverEmergencyDrafts?.({
            expectedUid: window.AccountDataScope?.getActiveUid?.() || initialUid,
            books: initialBooks
        });
        await SecureStore.init();
        window.reloadModelStateForCurrentUser?.();
        await window.restoreSession?.();
        await window.ensureCurrentAccountScopeReady?.();
        const officialTemplatesReady = await window.ensureCommunityOfficialTemplates?.();
        if (officialTemplatesReady && officialTemplatesReady.ok === false) {
            console.warn('知屿内置模板保存失败：', officialTemplatesReady.reason || '本机模板库写入失败');
        }
        await window.ZhiyuFullTextAnalysisClient?.resumeForCurrentUser?.();
        window.refreshUserUI?.();
        window.bindEditorSaveShortcuts?.();
        window.applyStartupUiState?.();
        const storageHealth = StorageService.getStorageHealth?.();
        if (storageHealth?.booksReadState?.status === 'error') {
            window.ZHIYU_TOAST?.error?.('本机作品读取失败，已进入只读保护。请刷新页面重试，系统不会用空数据覆盖作品。');
        }
        window.updateSyncUI?.();
        if (identity?.persistence === 'session') {
            window.ZHIYU_TOAST?.error?.('浏览器只能在当前标签页保存本地身份。请在关闭标签页前导出作品。');
        } else if (identity?.temporary) {
            window.ZHIYU_TOAST?.error?.('浏览器无法保存本地身份。本次为临时会话，请在刷新或关闭页面前导出作品。');
        }

        runAfterFirstPaint(async function() {
            await ensureStartupMemoryReady();
            try {
                const templates = StorageService.getTemplates() || [];
                const cleaned = templates.filter(template => !template.deleted);
                if (cleaned.length < templates.length) StorageService.saveTemplates(cleaned);
            } catch (error) {
                console.warn('本机模板整理失败：', error);
            }
        });
    }

    window.ensureStartupMemoryReady = ensureStartupMemoryReady;
    window.sendAuthHeartbeat = sendAuthHeartbeat;
    window.startAuthPresenceHeartbeat = startAuthPresenceHeartbeat;
    window.stopAuthPresenceHeartbeat = stopAuthPresenceHeartbeat;
    window.init = init;
    window.ZHIYU_APP_INIT_READY = true;
})(window);
