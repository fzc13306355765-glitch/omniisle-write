// Split project save status module.
// The sidebar reflects normal local save results; cloud sync keeps its own state.
(function(window) {
    'use strict';

    const AppState = window.ZHIYU_APP_STATE || {};
    const saveState = {
        accountKey: '',
        loaded: false,
        sequence: 0,
        status: 'idle',
        message: '尚未执行新的保存',
        completedAt: 0
    };

    function getSyncVersionsKey() {
        return window.AccountDataScope.key('zhiyu_sync_versions');
    }

    function getSaveStatusKey() {
        return window.AccountDataScope?.key
            ? window.AccountDataScope.key('zhiyu_local_save_status_v1')
            : 'zhiyu_local_save_status_v1';
    }

    function _loadSyncVersions() {
        try {
            AppState.sync._versions = JSON.parse(
                localStorage.getItem(getSyncVersionsKey()) || '{}'
            );
        } catch(e) {}
    }

    function _saveSyncVersions() {
        try {
            localStorage.setItem(
                getSyncVersionsKey(),
                JSON.stringify(AppState.sync._versions)
            );
        } catch(e) {}
    }

    function touchBook(name) {
        AppState.sync._versions[name] = Date.now();
        _saveSyncVersions();
    }

    function loadSaveStateForAccount() {
        const key = getSaveStatusKey();
        if (saveState.loaded && saveState.accountKey === key) return;
        saveState.loaded = true;
        saveState.accountKey = key;
        saveState.status = 'idle';
        saveState.message = '尚未执行新的保存';
        saveState.completedAt = 0;
        try {
            const stored = JSON.parse(localStorage.getItem(key) || 'null');
            if (stored?.status === 'success' || stored?.status === 'error') {
                saveState.status = stored.status;
                saveState.message = String(stored.message || (
                    stored.status === 'success' ? '上一次保存成功' : '上一次保存失败'
                ));
                saveState.completedAt = Number(stored.completedAt || 0);
            }
        } catch(e) {}
    }

    function persistSaveState() {
        if (saveState.status !== 'success' && saveState.status !== 'error') return;
        try {
            localStorage.setItem(saveState.accountKey || getSaveStatusKey(), JSON.stringify({
                status: saveState.status,
                message: saveState.message,
                completedAt: saveState.completedAt
            }));
        } catch(e) {}
    }

    function renderSaveState() {
        loadSaveStateForAccount();
        window.ZhiyuLocalSaveCenter?.reflectSaveState?.({
            status: saveState.status,
            message: saveState.message,
            completedAt: saveState.completedAt
        });
    }

    function beginSave(source) {
        loadSaveStateForAccount();
        const token = ++saveState.sequence;
        saveState.status = 'checking';
        saveState.message = source === 'manual'
            ? '正在立即保存当前章节'
            : '正在自动保存当前章节';
        renderSaveState();
        return token;
    }

    function finishSave(token, succeeded, message) {
        loadSaveStateForAccount();
        if (token !== saveState.sequence) return false;
        saveState.status = succeeded ? 'success' : 'error';
        saveState.message = String(
            message || (succeeded ? '保存成功' : '保存失败，当前内容仍保留在编辑器或草稿中')
        );
        saveState.completedAt = Date.now();
        persistSaveState();
        renderSaveState();
        return true;
    }

    function updateSyncUI() {
        const bar = document.getElementById('syncBar');
        if (bar) bar.style.display = 'block';
        renderSaveState();
    }

    window.ZHIYU_SAVE_STATUS = Object.freeze({
        begin: beginSave,
        finish: finishSave,
        render: renderSaveState,
        getState: function() {
            loadSaveStateForAccount();
            return {
                status: saveState.status,
                message: saveState.message,
                completedAt: saveState.completedAt
            };
        }
    });
    window._loadSyncVersions = _loadSyncVersions;
    window._saveSyncVersions = _saveSyncVersions;
    window.touchBook = touchBook;
    window.updateSyncUI = updateSyncUI;
})(window);
