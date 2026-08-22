// Startup UI state split from app-main.js.
// Handles initial API defaults, overview search reset, right sidebar state and top-level hints.
(function(window, document) {
    'use strict';

    function applyDefaultApiConfig() {
        if (window.ZHIYU_COMMUNITY_MODE === true) return;
        const CONFIG = window.ZHIYU_CONFIG || {};
        const api = window.gA();
        if (!api || (api.base && api.base.trim() !== '')) return;

        api.base = CONFIG.DEFAULT_API_BASE;
        api.model = api.model || CONFIG.DEFAULT_MODEL;
        window.sA(api);

        const apiBase = document.getElementById('apiBase');
        const apiModel = document.getElementById('apiModel');
        if (apiBase) apiBase.value = api.base;
        if (apiModel) apiModel.value = api.model;
    }

    function resetOverviewSearch() {
        const AppState = window.ZHIYU_APP_STATE || window.AppState;
        const searchInput = document.getElementById('searchBooksInput');
        if (!searchInput || !AppState?.ui) return;

        searchInput.value = '';
        AppState.ui.searchQuery = '';

        // 延迟再清一次，抵消浏览器自动填充。
        setTimeout(function() {
            searchInput.value = '';
            AppState.ui.searchQuery = '';
            window.refreshOverview?.();
        }, 500);
    }

    function applyStartupUiState() {
        applyDefaultApiConfig();
        resetOverviewSearch();
        window.refreshOverview?.();
        window.updateNoticeRedDot?.();
        window.applyWriteButtonTooltips?.();
    }

    window.ZHIYU_STARTUP_UI_STATE = {
        applyStartupUiState,
        applyDefaultApiConfig,
        resetOverviewSearch
    };
    window.applyStartupUiState = applyStartupUiState;
})(window, document);
