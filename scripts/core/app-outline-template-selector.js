// 普通/功能性大纲只复用统一模板选择器，避免旧的“收藏/曾用”弹窗覆盖公开模板入口。
(function(window) {
    'use strict';

    function getOutlineTemplateContext() {
        const state = window.ZHIYU_APP_STATE || window.AppState || {};
        const isFunctionMode = typeof window.getOutlineMode === 'function' && window.getOutlineMode() === 'function';
        if (!isFunctionMode) return { context: 'outline', subCategory: '大纲' };
        return state.outline?.functionType === 'script'
            ? { context: 'functionalScript', subCategory: '分镜' }
            : { context: 'functionalOutline', subCategory: '拆书' };
    }

    function openOutlineTemplateSelector() {
        const options = getOutlineTemplateContext();
        window.openTemplateSelector?.(options);
    }

    window.ZHIYU_OUTLINE_TEMPLATE_SELECTOR = { openOutlineTemplateSelector };
    window.bindOutlineTemplateSelector = function() {};
})(window);
