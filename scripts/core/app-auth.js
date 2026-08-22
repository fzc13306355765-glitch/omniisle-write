(function(window) {
    'use strict';

    const AppState = window.ZHIYU_APP_STATE || {};
    const LOCAL_SESSION_KEY = 'omniisle_write_local_session_v1';
    const identity = window.ZHIYU_COMMUNITY_RUNTIME?.getLocalIdentity?.() || {
        uid: window.getCurrentUserId?.() || 'community-local',
        displayName: '本地用户'
    };

    function applyLocalIdentity() {
        AppState.auth = AppState.auth && typeof AppState.auth === 'object' ? AppState.auth : {};
        Object.assign(AppState.auth, {
            isLoggedIn: true,
            uid: String(identity.uid || 'community-local'),
            username: 'local',
            displayName: String(identity.displayName || '本地用户'),
            avatar: ''
        });
        return AppState.auth;
    }

    function refreshUserUI() {
        applyLocalIdentity();
        const userBar = document.getElementById('userBar');
        const oldEntry = document.getElementById('loginBtn');
        if (userBar) userBar.style.display = 'none';
        if (oldEntry) oldEntry.style.display = 'none';
        return true;
    }

    async function restoreSession() {
        applyLocalIdentity();
        return true;
    }

    async function ensureLocalSession() {
        return applyLocalIdentity();
    }

    function getAuthHeaders(extraHeaders) {
        return Object.assign({ 'Content-Type': 'application/json' }, extraHeaders || {});
    }

    function createInactiveRemoteError(message) {
        const error = new Error(String(message || '社区版只使用本地身份'));
        error.code = 'COMMUNITY_LOCAL_IDENTITY_ONLY';
        return error;
    }

    function goToHome() {
        const overviewEntry = document.querySelector('[data-page="overview"]');
        if (overviewEntry instanceof HTMLElement) overviewEntry.click();
    }

    function noop() { return false; }
    async function resolvedFalse() { return false; }

    applyLocalIdentity();

    window.SESSION_KEY = LOCAL_SESSION_KEY;
    window.SESSION_EXPIRY_MS = 0;
    window.saveSession = applyLocalIdentity;
    window.decodeSessionUpgradeHeader = function() { return null; };
    window.replaceCurrentSessionFromUpgrade = noop;
    window.applySessionUpgradeFromResponse = noop;
    window.persistAuthSession = applyLocalIdentity;
    window.clearSession = noop;
    window.createAuthExpiredError = createInactiveRemoteError;
    window.isAuthExpiredError = function() { return false; };
    window.handleAuthExpired = noop;
    window.getAuthClientContext = function() { return { mode: 'local', uid: applyLocalIdentity().uid }; };
    window.ensureAuthSessionForAction = ensureLocalSession;
    window.getRestorableSessionUid = function() { return applyLocalIdentity().uid; };
    window.restoreSession = restoreSession;
    window.refreshUserUI = refreshUserUI;
    window.getAuthHeaders = getAuthHeaders;
    window.getAuthErrorMessage = function(error) { return String(error?.message || error || '本地操作失败'); };
    window.setAuthMode = noop;
    window.openChangePasswordModal = function() {
        window.ZHIYU_TOAST?.show?.('社区版没有账号密码，本机数据请通过导出文件备份');
        return false;
    };
    window.updateSinglePageAuthGate = refreshUserUI;
    window.syncSingleAuthMode = refreshUserUI;
    window.goToHome = goToHome;
    window.revokeCurrentSessionForLogout = resolvedFalse;
    window.logout = resolvedFalse;
    window.ZHIYU_AUTH_READY = true;
})(window);
