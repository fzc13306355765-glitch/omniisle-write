// Split project active content box module.
// Selects the right-panel content box for outline, decompose, or AI polish tabs.
(function(window) {
    'use strict';

    const AppState = window.ZHIYU_APP_STATE || {};

        function getActiveContentBox() {
            var tab = AppState.outlineGen.activeTab;
            if (tab === 'decompose') return document.getElementById('dcContentBox');
            if (tab === 'aiPolish') return document.getElementById('apContentBox');
            return document.getElementById('ogContentBox');
        }

        // ===== 同步状态管理 =====

    window.getActiveContentBox = getActiveContentBox;
})(window);
