// 统一的提示词模版快捷菜单：各功能独立记录最近五个，当前选择固定在菜单底部。
(function(window, document) {
    'use strict';

    let activeMenu = null;
    let activeAnchor = null;

    function getTemplates() {
        const list = typeof window.gT === 'function' ? window.gT() : [];
        return Array.isArray(list) ? list : [];
    }

    function getContextCategories(context) {
        return typeof window.getTemplateContextCategories === 'function'
            ? window.getTemplateContextCategories(context)
            : [];
    }

    function getMatchingTemplates(context) {
        const categories = getContextCategories(context);
        return getTemplates().filter(function(template) {
            return !categories.length || categories.some(function(category) {
                return template && (template.category === category || template.subCategory === category);
            });
        });
    }

    function closeTemplateQuickMenu() {
        if (activeMenu) activeMenu.remove();
        if (activeAnchor) activeAnchor.setAttribute('aria-expanded', 'false');
        activeMenu = null;
        activeAnchor = null;
    }

    function appendTemplateRow(container, template, onChoose, extraClass) {
        const row = onChoose ? document.createElement('button') : document.createElement('div');
        row.className = 'template-quick-menu-item' + (extraClass ? ' ' + extraClass : '');
        if (onChoose) {
            row.type = 'button';
            row.title = '使用提示词模版：' + (template.title || '未命名模板');
            row.addEventListener('click', function(event) {
                event.preventDefault();
                event.stopPropagation();
                onChoose(template);
            });
        }

        const title = document.createElement('span');
        title.className = 'template-quick-menu-name';
        title.textContent = template.title || '未命名模板';
        const metrics = document.createElement('span');
        metrics.className = 'template-quick-menu-metrics';
        const hot = typeof window.getTemplateUsageCount === 'function' ? window.getTemplateUsageCount(template) : 0;
        const likes = typeof window.getTemplateLikeCount === 'function' ? window.getTemplateLikeCount(template) : 0;
        metrics.innerHTML = '<span title="热度">🔥 ' + hot + '</span><span title="点赞">👍 ' + likes + '</span>';
        row.append(title, metrics);
        if (typeof window.createTemplateAuthorAvatar === 'function') {
            row.appendChild(window.createTemplateAuthorAvatar(template, 'template-quick-menu-avatar'));
        }
        container.appendChild(row);
        return row;
    }

    function positionMenu(menu, anchor) {
        const rect = anchor.getBoundingClientRect();
        const width = Math.min(360, Math.max(260, window.innerWidth - 24));
        const menuHeight = Math.min(300, menu.offsetHeight || 300);
        const spaceAbove = rect.top - 10;
        const spaceBelow = window.innerHeight - rect.bottom - 10;
        const openDown = spaceBelow > spaceAbove && spaceBelow >= Math.min(170, menuHeight);
        menu.classList.toggle('opens-down', openDown);
        menu.style.width = width + 'px';
        menu.style.left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)) + 'px';
        if (openDown) {
            menu.style.top = Math.min(rect.bottom + 6, window.innerHeight - 42) + 'px';
            menu.style.maxHeight = Math.max(150, spaceBelow) + 'px';
        } else {
            menu.style.top = Math.max(10, rect.top - Math.min(menuHeight, spaceAbove) - 6) + 'px';
            menu.style.maxHeight = Math.max(150, spaceAbove) + 'px';
        }
    }

    function openTemplateQuickMenu(anchor, options) {
        const opts = options || {};
        const context = opts.context || 'chapter';
        if (!anchor) return;
        if (activeAnchor === anchor) {
            closeTemplateQuickMenu();
            return;
        }
        closeTemplateQuickMenu();
        document.dispatchEvent(new CustomEvent('zhiyu:dropdown-open', {
            detail: { source: 'template-quick-menu' }
        }));

        const menu = document.createElement('div');
        menu.className = 'template-quick-menu';
        menu.setAttribute('role', 'menu');
        const scroll = document.createElement('div');
        scroll.className = 'template-quick-menu-scroll';
        const title = document.createElement('div');
        title.className = 'template-quick-menu-title';
        title.textContent = '常用模版';
        scroll.appendChild(title);

        const templates = getMatchingTemplates(context);
        const recentIds = typeof window.getTemplateRecentIds === 'function' ? window.getTemplateRecentIds(context) : [];
        const recent = recentIds.map(function(id) {
            return templates.find(function(template) { return template && template.id === id; });
        }).filter(Boolean);
        if (recent.length) {
            recent.forEach(function(template) {
                appendTemplateRow(scroll, template, function(selected) {
                    window.applyTemplateSelection?.(selected, { context: context });
                    opts.onChange?.(selected);
                    closeTemplateQuickMenu();
                });
            });
        } else {
            const empty = document.createElement('div');
            empty.className = 'template-quick-menu-empty';
            empty.textContent = '暂无最近使用的模版';
            scroll.appendChild(empty);
        }
        menu.appendChild(scroll);

        const selectedId = typeof opts.getSelectedId === 'function' ? opts.getSelectedId() : opts.selectedId;
        const current = getTemplates().find(function(template) { return template && template.id === selectedId; });
        if (current) {
            const currentBox = document.createElement('div');
            currentBox.className = 'template-quick-menu-current';
            const currentTitle = document.createElement('div');
            currentTitle.className = 'template-quick-menu-title';
            currentTitle.textContent = '当前选择';
            currentBox.appendChild(currentTitle);
            const row = appendTemplateRow(currentBox, current, null, 'is-current');
            const clear = document.createElement('button');
            clear.type = 'button';
            clear.className = 'template-quick-menu-clear';
            clear.textContent = '×';
            clear.title = '取消当前提示词模版';
            clear.setAttribute('aria-label', '取消当前提示词模版');
            clear.addEventListener('click', function(event) {
                event.preventDefault();
                event.stopPropagation();
                window.clearTemplateSelection?.(context);
                opts.onClear?.();
                closeTemplateQuickMenu();
            });
            row.appendChild(clear);
            menu.appendChild(currentBox);
        }

        document.body.appendChild(menu);
        activeMenu = menu;
        activeAnchor = anchor;
        anchor.setAttribute('aria-expanded', 'true');
        positionMenu(menu, anchor);
    }

    function getSelectedIdForContext(context, selectedSource) {
        if (typeof window.getTemplateContextTemplateId === 'function') {
            return window.getTemplateContextTemplateId(context);
        }
        const state = window.ZHIYU_APP_STATE || window.AppState || {};
        if (context === 'aiPolish') return String(state.outlineGen?.apConfig?.templateId || '').replace(/^tpl:/, '');
        if (context === 'fineOutline' || context === 'decompose') return state.outlineGen?.templateId || '';
        if (context === 'outline' || context === 'functionalOutline' || context === 'functionalScript') return state.outline?.templateId || '';
        if (context === 'script') return state.script?.templateId || '';
        return selectedSource === 'gen' ? state.gen?.templateId || '' : '';
    }

    function bindDataQuickMenus() {
        document.querySelectorAll('[data-template-quick-context]').forEach(function(button) {
            if (button.dataset.templateQuickBound === '1') return;
            button.dataset.templateQuickBound = '1';
            button.addEventListener('click', function(event) {
                event.preventDefault();
                event.stopPropagation();
                const context = button.dataset.templateQuickContext || 'chapter';
                openTemplateQuickMenu(button, {
                    context: context,
                    getSelectedId: function() { return getSelectedIdForContext(context, button.dataset.templateSelected); }
                });
            });
        });
        const outlineButton = document.getElementById('btnOutlineTemplateMenu');
        if (outlineButton && outlineButton.dataset.templateQuickBound !== '1') {
            outlineButton.dataset.templateQuickBound = '1';
            outlineButton.addEventListener('click', function(event) {
                event.preventDefault();
                event.stopPropagation();
                const state = window.ZHIYU_APP_STATE || window.AppState || {};
                const functionMode = window.getOutlineMode?.() === 'function';
                const context = !functionMode ? 'outline' : (state.outline?.functionType === 'script' ? 'functionalScript' : 'functionalOutline');
                openTemplateQuickMenu(outlineButton, {
                    context: context,
                    getSelectedId: function() { return getSelectedIdForContext(context, 'outline'); }
                });
            });
        }
    }

    document.addEventListener('click', function(event) {
        if (activeMenu && !activeMenu.contains(event.target) && event.target !== activeAnchor) closeTemplateQuickMenu();
    });
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') closeTemplateQuickMenu();
    });
    document.addEventListener('zhiyu:dropdown-open', function(event) {
        if (event.detail?.source !== 'template-quick-menu') closeTemplateQuickMenu();
    });
    window.addEventListener('resize', function() {
        if (activeMenu && activeAnchor) positionMenu(activeMenu, activeAnchor);
    });

    window.openTemplateQuickMenu = openTemplateQuickMenu;
    window.closeTemplateQuickMenu = closeTemplateQuickMenu;
    bindDataQuickMenus();
})(window, document);
