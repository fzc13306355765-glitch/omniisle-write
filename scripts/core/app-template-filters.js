// Split project template filter bindings.
// Keeps template category, length and search interactions outside the main template page module.
(function(window) {
    'use strict';

    const AppState = window.ZHIYU_APP_STATE || window.AppState || {};

    function refreshTemplateGrid() {
        if (typeof window.refreshTemplateGrid === 'function') window.refreshTemplateGrid();
    }

    function resetTemplatePage() {
        if (typeof window.resetTemplatePage === 'function') {
            window.resetTemplatePage();
            return;
        }
        if (AppState.template) AppState.template.page = 1;
    }

    if (!AppState.template) AppState.template = {};
    AppState.template.listTab = AppState.template.listTab || 'all';
    AppState.template.lengthCats = AppState.template.lengthCats || [];
    AppState.template.subCats = AppState.template.subCats || [];
    AppState.template.page = AppState.template.page || 1;
    AppState.template.pageSize = AppState.template.pageSize || 12;

    document.querySelectorAll('#templateTabs .tab-item').forEach(function(tab) {
        tab.addEventListener('click', function() {
            document.querySelectorAll('#templateTabs .tab-item').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            AppState.template.listTab = this.dataset.tab;
            resetTemplatePage();
            refreshTemplateGrid();
        });
    });

    document.querySelectorAll('#templateLength button').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const cat = this.dataset.len;
            if (cat === 'all') {
                AppState.template.lengthCats = [];
                document.querySelectorAll('#templateLength button').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
            } else {
                this.classList.toggle('active');
                if (this.classList.contains('active')) {
                    if (!AppState.template.lengthCats.includes(cat)) AppState.template.lengthCats.push(cat);
                } else {
                    AppState.template.lengthCats = AppState.template.lengthCats.filter(c => c !== cat);
                }
                document.querySelector('#templateLength button[data-len="all"]')?.classList.remove('active');
            }
            resetTemplatePage();
            refreshTemplateGrid();
        });
    });

    document.querySelectorAll('#templateSubCat button').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const cat = this.dataset.sub;
            if (cat === 'all') {
                AppState.template.subCats = [];
                document.querySelectorAll('#templateSubCat button').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
            } else {
                this.classList.toggle('active');
                if (this.classList.contains('active')) {
                    if (!AppState.template.subCats.includes(cat)) AppState.template.subCats.push(cat);
                } else {
                    AppState.template.subCats = AppState.template.subCats.filter(c => c !== cat);
                }
                document.querySelector('#templateSubCat button[data-sub="all"]')?.classList.remove('active');
            }
            resetTemplatePage();
            refreshTemplateGrid();
        });
    });

    document.getElementById('templateSearch')?.addEventListener('input', function() {
        resetTemplatePage();
        refreshTemplateGrid();
    });

    document.getElementById('templateSort')?.addEventListener('change', function() {
        resetTemplatePage();
        refreshTemplateGrid();
    });

    window.bindTemplateFilters = true;
})(window);
