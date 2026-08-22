// Prompt-template selector category sidebar split from app-template-selector.js.
(function(window) {
    'use strict';

    const TEMPLATE_SELECTOR_CATEGORIES = ['全部','通用','正文','续写','大纲','拆书','细纲','AI消痕','开篇','角色','分镜','其他'];

    function renderTemplateSelectorSidebar(options) {
        const opts = options || {};
        const sidebar = document.getElementById('tplSidebar');
        if (!sidebar) return;
        const activeCategory = opts.activeCategory || 'all';
        const onSelect = typeof opts.onSelect === 'function' ? opts.onSelect : function() {};
        sidebar.innerHTML = '';
        for (let i = 0; i < TEMPLATE_SELECTOR_CATEGORIES.length; i++) {
            const cat = TEMPLATE_SELECTOR_CATEGORIES[i];
            const filterKey = (cat === '全部') ? 'all' : cat;
            const div = document.createElement('div');
            const isActive = (activeCategory === filterKey);
            div.className = 'tpl-sidebar-item' + (isActive ? ' active' : '');
            div.textContent = cat;
            div.setAttribute('data-filter', filterKey);
            div.addEventListener('click', function() {
                onSelect(this.getAttribute('data-filter'));
            });
            sidebar.appendChild(div);
        }
    }

    window.TEMPLATE_SELECTOR_CATEGORIES = TEMPLATE_SELECTOR_CATEGORIES;
    window.renderTemplateSelectorSidebar = renderTemplateSelectorSidebar;
    window.ZHIYU_TEMPLATE_SELECTOR_SIDEBAR_READY = true;
})(window);
