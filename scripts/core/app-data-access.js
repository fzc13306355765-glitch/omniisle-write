// Split project data access module.
// Keeps template/book local data helpers out of the legacy main script.
(function(window) {
    'use strict';

    const StorageService = window.ZHIYU_STORAGE_SERVICE || window.StorageService;
    const getCurrentUserId = window.getCurrentUserId;

    function isCommunityMode() {
        return window.ZHIYU_COMMUNITY_MODE === true;
    }

    function _triggerCloudSync() {
        if (isCommunityMode()) return null;
        if (typeof window._triggerCloudSync !== 'function') return null;
        const task = window._triggerCloudSync();
        if (task && typeof task.then === 'function') {
            window._zhiyuLastBooksSaveTask = task;
        }
        return task;
    }

        async function waitForBooksSaved(){
            const task = window._zhiyuLastBooksSaveTask;
            if (task && typeof task.then === 'function') return await task;
            return true;
        }

        function gT(){
            const currentUserId = String(getCurrentUserId() || '');
            const t = StorageService.getTemplates() || [];
            return t.filter(function(tpl) {
                if (!tpl || tpl.deleted) return false;
                if (tpl.builtIn || tpl.isOfficial || tpl.isPublic === true) return true;
                return !!currentUserId && String(tpl.creatorId || '') === currentUserId;
            });
        }
        function gTPublic(){ const t=StorageService.getTemplates()||[]; return t.filter(tpl=>(tpl.builtIn||tpl.isPublic===true) && !tpl.deleted); }

        // ===== 清理本地内置模板缓存（删除没有 deleted 字段的旧数据）=====
        try {
            const tpls = StorageService.getTemplates() || [];
            const cleaned = tpls.filter(t => t.creatorId || !t.builtIn || 'deleted' in t);
            if (cleaned.length < tpls.length) StorageService.saveTemplates(cleaned);
        } catch(e) {}
        function sT(t){ return StorageService.saveTemplates(t); }
        function gB(){ return StorageService.getBooks(); }
        function sB(b, options){
            const saveOptions = isCommunityMode()
                ? { ...(options || {}), cloudWrite: 'suppress' }
                : options;
            const task = Promise.resolve(StorageService.saveBooks(b, saveOptions)).then(function(saved) {
                if (saved === false) return false;
                if (isCommunityMode() || saveOptions?.cloudWrite === 'suppress') return true;
                const cloudTask = _triggerCloudSync();
                if (!cloudTask || typeof cloudTask.then !== 'function') return true;
                return Promise.resolve(cloudTask).then(function() { return true; });
            });
            window._zhiyuLastBooksSaveTask = task;
            return task;
        }

    window.gT = gT;
    window.gTPublic = gTPublic;
    window.sT = sT;
    window.gB = gB;
    window.sB = sB;
    window.waitForBooksSaved = waitForBooksSaved;
})(window);
