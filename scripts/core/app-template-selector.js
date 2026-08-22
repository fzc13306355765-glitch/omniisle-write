// 拆分项目提示词模板选择弹窗模块。
// 只负责本机模板的分类、搜索、收藏、查看和应用。
(function(window) {
    'use strict';

    const Utils = window.ZHIYU_UTILS || {};
    const Modal = window.ZHIYU_MODAL;
    const StorageService = window.ZHIYU_STORAGE_SERVICE || window.StorageService;
    const AppState = window.ZHIYU_APP_STATE || window.AppState || {};
    const getCurrentUserId = window.getCurrentUserId || function() { return ''; };
    const getUsableTemplates = window.gT || window.gTPublic || function() { return []; };
    const getTemplateLikeCount = window.getTemplateLikeCount || function(t) { return Number(t?.likes || t?.likeCount || 0); };
    const getTemplateUsageCount = window.getTemplateUsageCount || function(t) { return Number(t?.usageCount || 0); };
    const renderTemplateMetrics = window.renderTemplateMetrics || function(t) {
        return `👍 ${getTemplateLikeCount(t)} 🔥 ${getTemplateUsageCount(t)}`;
    };
    const createTemplateAuthorAvatar = window.createTemplateAuthorAvatar;
    const renderTemplateSelectorSidebar = window.renderTemplateSelectorSidebar || function() {};
    const filterTemplateSelectorItems = window.filterTemplateSelectorItems || function(templates) {
        return Array.isArray(templates) ? templates.slice() : [];
    };

    let tplSelectTab = 'public';
    let tplSelectSubCat = 'all';
    let tplSelectSubCats = [];
    let tplSelectSort = '综合';
    let tplSelectedId = '';

    const CONTEXT_CATEGORIES = {
        chapter: ['正文', '续写'],
        outline: ['大纲'],
        fineOutline: ['细纲'],
        decompose: ['拆书'],
        aiPolish: ['AI消痕'],
        functionalOutline: ['拆书'],
        functionalScript: ['分镜'],
        script: ['分镜']
    };

    function getTemplateContextCategories(context, fallback) {
        const categories = CONTEXT_CATEGORIES[context];
        if (categories && categories.length) return categories.slice();
        if (Array.isArray(fallback) && fallback.length) return fallback.slice();
        return fallback ? [fallback] : [];
    }

    function getTemplateRecentStorageKey() {
        const userId = String(getCurrentUserId() || 'anonymous').replace(/[^a-zA-Z0-9_-]/g, '_');
        return 'zhiyu-template-recents:' + userId;
    }

    function readTemplateRecents() {
        try {
            const value = JSON.parse(window.localStorage.getItem(getTemplateRecentStorageKey()) || '{}');
            return value && typeof value === 'object' ? value : {};
        } catch (_) {
            return {};
        }
    }

    function writeTemplateRecents(value) {
        try {
            window.localStorage.setItem(getTemplateRecentStorageKey(), JSON.stringify(value));
        } catch (_) {}
    }

    function getTemplateRecentIds(context) {
        const values = readTemplateRecents();
        return Array.isArray(values[context]) ? values[context].slice(0, 5) : [];
    }

    function recordTemplateRecent(context, templateId) {
        if (!context || !templateId) return;
        const values = readTemplateRecents();
        const ids = Array.isArray(values[context]) ? values[context] : [];
        values[context] = [templateId].concat(ids.filter(function(id) { return id !== templateId; })).slice(0, 5);
        writeTemplateRecents(values);
    }

    function getOGTemplateButtons() {
        const list = Array.prototype.slice.call(document.querySelectorAll('.btn-og-template, #btnOGTemplate'));
        return list.filter(function(btn, index) { return list.indexOf(btn) === index; });
    }

    function setOGTemplateButtonText(text) {
        setActionTemplateButtonText('fineOutline', text);
    }

    function getSelectedTemplateForContext(context) {
        const selectedId = typeof window.getTemplateContextTemplateId === 'function'
            ? window.getTemplateContextTemplateId(context)
            : '';
        return getUsableTemplates().find(function(item) { return item && item.id === selectedId; }) || null;
    }

    function setActionTemplateButtonText(context, text, selectedTemplate) {
        const id = context === 'decompose' ? 'btnDCTemplate' : 'btnOGTemplate';
        const button = document.getElementById(id);
        const template = selectedTemplate || getSelectedTemplateForContext(context);
        if (button && typeof window.renderTemplateSelectionButton === 'function') {
            window.renderTemplateSelectionButton(button, template, {
                title: template ? (text || template.title) : '',
                placeholder: '提示词模版'
            });
        } else if (button) {
            button.textContent = text || '提示词模版';
        }
    }

    function renderOutlineTemplateSelection(context) {
        const option = document.getElementById('outlineTemplateOption');
        const label = document.getElementById('outlineTemplateLabel');
        const name = document.getElementById('outlineSelectedTemplate');
        const avatarSlot = document.getElementById('outlineTemplateAvatar');
        if (!option || !name) return null;
        const selectedId = typeof window.getTemplateContextTemplateId === 'function'
            ? window.getTemplateContextTemplateId(context || 'outline')
            : AppState.outline?.templateId || '';
        const template = getUsableTemplates().find(function(item) { return item && item.id === selectedId; }) || null;
        if (!template) {
            option.classList.remove('is-selected');
            name.textContent = '';
            name.removeAttribute('title');
            if (label) label.textContent = '选择提示词模版';
            if (avatarSlot) avatarSlot.replaceChildren();
            return null;
        }
        name.textContent = template.title || '未命名模版';
        name.title = template.title || '未命名模版';
        option.classList.add('is-selected');
        if (avatarSlot) {
            avatarSlot.replaceChildren();
            if (typeof createTemplateAuthorAvatar === 'function') {
                avatarSlot.appendChild(createTemplateAuthorAvatar(template, 'template-outline-avatar'));
            }
        }
        return template;
    }

    function getTemplateSelectorSelectedId() {
        return tplSelectedId;
    }

    function openTemplateSelector(options) {
        options = options || {};
        if (options.context !== undefined) window._tplSelectContext = options.context || '';
        else window._tplSelectContext = '';
        tplSelectTab = 'public';
        tplSelectSubCats = getTemplateContextCategories(window._tplSelectContext, options.subCategories || options.subCategory);
        tplSelectSubCat = options.subCategory || tplSelectSubCats[0] || 'all';
        tplSelectSort = '综合';
        tplSelectedId = typeof window.getTemplateContextTemplateId === 'function'
            ? window.getTemplateContextTemplateId(window._tplSelectContext)
            : '';
        const searchInput = document.getElementById('tplSearch');
        const sortFilter = document.getElementById('tplSortFilter');
        const applyBtn = document.getElementById('btnApplyTemplate');
        if (searchInput) searchInput.value = '';
        if (sortFilter) {
            sortFilter.value = '综合';
            sortFilter.onchange = () => {
                tplSelectSort = sortFilter.value;
                refreshTplGrid();
            };
        }
        if (applyBtn) {
            applyBtn.disabled = !tplSelectedId;
            applyBtn.style.opacity = tplSelectedId ? '1' : '0.5';
        }
        buildTplSidebar();
        Modal.open('templateSelectModal');
        refreshTplGrid();
        if (typeof window._fetchPublicTemplates === 'function') {
            Promise.resolve(window._fetchPublicTemplates()).then(refreshTplGrid).catch(function() {});
        }
    }

    function buildTplSidebar() {
        renderTemplateSelectorSidebar({
            activeCategory: tplSelectSubCat,
            onSelect: function(filterKey) {
                tplSelectSubCat = filterKey;
                tplSelectSubCats = filterKey === 'all' ? [] : [filterKey];
                buildTplSidebar();
                refreshTplGrid();
            }
        });
    }

    function updateTemplateUsage(template) {
        if (!template || !StorageService?.getTemplates || !StorageService?.saveTemplates) return;
        const allTemplates = StorageService.getTemplates();
        const target = Array.isArray(allTemplates) ? allTemplates.find(function(item) { return item && item.id === template.id; }) : null;
        if (!target) return;
        target.usageCount = Number(target.usageCount || 0) + 1;
        target.lastUsedAt = Date.now();
        StorageService.saveTemplates(allTemplates);
    }

    function applyTemplateSelection(template, options) {
        const context = options?.context || window._tplSelectContext || '';
        if (!template) return false;
        const selectedTemplateName = document.getElementById('selectedTemplateName');
        const scriptSelectedTplName = document.getElementById('scriptSelectedTplName');
        const composerTemplateName = document.getElementById('composerTemplateName');
        const outlineTplOption = document.getElementById('outlineTemplateOption');
        const outlineTplName = document.getElementById('outlineSelectedTemplate');

        if (typeof window.setTemplateContextTemplateId === 'function') {
            window.setTemplateContextTemplateId(context, template.id);
        }
        if (context === 'aiPolish') {
            if (!AppState.outlineGen.apConfig) AppState.outlineGen.apConfig = {};
            AppState.outlineGen.apConfig.templateName = template.title;
            window.setAIPolishTemplateButtonText?.(template.title);
        } else if (context === 'fineOutline' || context === 'og' || context === 'decompose') {
            AppState.outlineGen.templateName = template.title;
            setActionTemplateButtonText(context === 'decompose' ? 'decompose' : 'fineOutline', template.title, template);
        } else {
            if (selectedTemplateName && context === 'chapter') {
                window.renderTemplateSelectionButton?.(selectedTemplateName.closest('button'), template, {
                    labelElement: selectedTemplateName,
                    placeholder: '未选择'
                });
            }
            if (scriptSelectedTplName && context === 'script') {
                window.renderTemplateSelectionButton?.(scriptSelectedTplName.closest('button'), template, {
                    labelElement: scriptSelectedTplName,
                    placeholder: '未选择'
                });
            }
            if (composerTemplateName && context === 'chapter') {
                window.renderTemplateSelectionButton?.('btnComposerTemplate', template, {
                    labelElement: composerTemplateName,
                    placeholder: '选择提示词模版'
                });
            }
            if (outlineTplOption && outlineTplName && (context === 'outline' || context === 'functionalOutline' || context === 'functionalScript')) {
                renderOutlineTemplateSelection(context);
            }
        }
        recordTemplateRecent(context, template.id);
        if (options?.recordUsage !== false) updateTemplateUsage(template);
        window.updateChapterComposerState?.();
        return true;
    }

    function clearTemplateSelection(context) {
        if (typeof window.setTemplateContextTemplateId === 'function') {
            window.setTemplateContextTemplateId(context, '');
        }
        if (context === 'aiPolish') {
            if (!AppState.outlineGen.apConfig) AppState.outlineGen.apConfig = {};
            AppState.outlineGen.apConfig.templateName = '';
            window.setAIPolishTemplateButtonText?.('');
        } else if (context === 'fineOutline' || context === 'og' || context === 'decompose') {
            AppState.outlineGen.templateName = '';
            setActionTemplateButtonText(context === 'decompose' ? 'decompose' : 'fineOutline', '提示词模版', null);
        } else if (context === 'outline' || context === 'functionalOutline' || context === 'functionalScript') {
            renderOutlineTemplateSelection(context);
        } else if (context === 'script') {
            const scriptName = document.getElementById('scriptSelectedTplName');
            if (scriptName) {
                window.renderTemplateSelectionButton?.(scriptName.closest('button'), null, {
                    labelElement: scriptName,
                    placeholder: '未选择'
                });
            }
        } else {
            const composer = document.getElementById('composerTemplateName');
            if (composer) {
                window.renderTemplateSelectionButton?.('btnComposerTemplate', null, {
                    labelElement: composer,
                    placeholder: '选择提示词模版'
                });
            }
        }
        window.updateChapterComposerState?.();
    }

    function selectTemplateInModal(t) {
        const applyBtn = document.getElementById('btnApplyTemplate');
        if (tplSelectedId === t.id) return;
        tplSelectedId = t.id;
        document.querySelectorAll('#tplGrid > div').forEach(c => c.style.border = '1px solid #e2e5ea');
        document.querySelectorAll('#tplGrid .tpl-card-selected').forEach(c => {
            c.style.border = '1px solid #e2e5ea';
            c.classList.remove('tpl-card-selected');
        });
        const cards = document.querySelectorAll('#tplGrid > div');
        cards.forEach(c => {
            if (c.dataset && c.dataset.tplId === t.id) {
                c.style.border = '2px solid #1976d2';
                c.classList.add('tpl-card-selected');
            }
        });
        if (applyBtn) {
            applyBtn.disabled = false;
            applyBtn.style.opacity = '1';
        }
    }

    document.querySelectorAll('.tpl-tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.tpl-tab-btn').forEach(b => {
                b.className = 'btn btn-outline btn-sm tpl-tab-btn';
            });
            this.className = 'btn btn-dark btn-sm tpl-tab-btn active';
            tplSelectTab = this.dataset.tab;
            refreshTplGrid();
        });
    });

    document.getElementById('tplSearch')?.addEventListener('input', Utils.debounce(() => refreshTplGrid(), 300));

    document.getElementById('btnApplyTemplate')?.addEventListener('click', function() {
        if (!tplSelectedId && window._tplSelectContext) {
            clearTemplateSelection(window._tplSelectContext);
            Modal.close('templateSelectModal');
            window._tplSelectContext = '';
            return;
        }
        if (!tplSelectedId) return;
        const t = getUsableTemplates().find(x => x.id === tplSelectedId);
        if (!t) return;
        applyTemplateSelection(t, { context: window._tplSelectContext || 'chapter' });
        Modal.close('templateSelectModal');
        window._tplSelectContext = '';
    });

    function refreshTplGrid() {
        const grid = document.getElementById('tplGrid');
        if (!grid) return;
        grid.innerHTML = '';
        const templates = getUsableTemplates();
        const searchInput = document.getElementById('tplSearch');
        const search = searchInput ? searchInput.value : '';
        const filtered = filterTemplateSelectorItems(templates, {
            tab: tplSelectTab,
            subCategory: tplSelectSubCat,
            subCategories: tplSelectSubCats,
            sort: tplSelectSort,
            search: search,
            currentUserId: getCurrentUserId()
        });

        if (filtered.length === 0) {
            grid.innerHTML = `<div style="color:#888;text-align:center;padding:20px;">暂无模板<br><span style="font-size:11px;">筛选: ${tplSelectSubCat} | 总数: ${templates.length} | 分类: ${tplSelectTab}</span></div>`;
            return;
        }

        filtered.forEach(t => {
            const card = document.createElement('div');
            card.className = 'tpl-selector-card';
            card.setAttribute('data-tpl-id', t.id);
            card.style.cssText = 'padding:18px 20px;background:#ebf5ff;border:1px solid #c8e4f8;border-radius:12px;cursor:pointer;transition:transform 0.2s,box-shadow 0.2s,border-color 0.2s;min-height:140px;overflow:hidden;';
            card.addEventListener('mouseenter', () => {
                if (!card.classList.contains('tpl-card-selected')) {
                    card.style.transform = 'translateY(-4px)';
                    card.style.borderColor = '#a0d8f0';
                    card.style.boxShadow = '0 10px 28px rgba(0,0,0,0.10)';
                }
            });
            card.addEventListener('mouseleave', () => {
                if (!card.classList.contains('tpl-card-selected')) {
                    card.style.transform = '';
                    card.style.borderColor = '#c8e4f8';
                    card.style.boxShadow = '';
                }
            });
            card.addEventListener('click', () => selectTemplateInModal(t));
            card.addEventListener('dblclick', () => {
                selectTemplateInModal(t);
                document.getElementById('btnApplyTemplate').click();
            });
            if (t.id === tplSelectedId) {
                card.style.border = '2px solid #5cbfe0';
                card.classList.add('tpl-card-selected');
            }

            const isBuiltIn = t.builtIn;
            card.innerHTML = `
                <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:10px;">
                    <div class="template-selector-avatar-slot"></div>
                    <div style="flex:1;min-width:0;">
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                            <span style="font-weight:600;font-size:15px;">${Utils.escapeHtml(t.title)}</span>
                            ${isBuiltIn ? '<span style="background:#e8f5e9;color:#2e7d32;font-size:11px;padding:2px 8px;border-radius:4px;">内置</span>' : ''}
                            <span style="font-size:12px;">${renderTemplateMetrics(t)}</span>
                        </div>
                        <div style="font-size:12px;color:#9a9ca6;margin-top:3px;">
                            <span>${Utils.escapeHtml(t.author || '未知')}</span>
                            <span style="margin:0 6px;">·</span>
                            <span>${Utils.formatDate(t.createdAt)}</span>
                        </div>
                    </div>
                </div>
                <div style="font-size:13px;color:#6e6e7a;line-height:1.7;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;margin-bottom:8px;">${Utils.escapeHtml(t.description || '暂无简介')}</div>
                <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#9a9ca6;border-top:1px solid #e2e5ea;padding-top:8px;">
                    <span style="background:#e8ebf2;color:#5a5d6b;padding:2px 8px;border-radius:4px;font-size:11px;">${Utils.escapeHtml(t.subCategory || t.category || '通用')}</span>
                    <span style="margin-left:auto;display:flex;gap:16px;align-items:center;">
                        <span class="tpl-view-btn" data-id="${t.id}" style="color:#1a1d2b;font-size:14px;font-weight:600;cursor:pointer;" onclick="event.stopPropagation();">查看</span>
                        <span class="tpl-fav-btn" data-id="${t.id}" style="cursor:pointer;color:${t.favorited?'#f0b400':'#9a9ca6'};font-size:14px;font-weight:600;" title="${t.favorited?'取消收藏':'收藏'}" onclick="event.stopPropagation();">${t.favorited?'⭐':'收藏'}</span>
                    </span>
                </div>`;
            const avatarSlot = card.querySelector('.template-selector-avatar-slot');
            if (avatarSlot && typeof createTemplateAuthorAvatar === 'function') {
                avatarSlot.replaceWith(createTemplateAuthorAvatar(t, 'template-selector-avatar'));
            }
            grid.appendChild(card);

            card.querySelector('.tpl-fav-btn').addEventListener('click', async function(e) {
                e.stopPropagation();
                const allT = StorageService.getTemplates();
                const target = allT.find(x => x.id === t.id);
                if (target) {
                    target.favorited = !target.favorited;
                    target.favoriteTime = target.favorited ? Date.now() : 0;
                    StorageService.saveTemplates(allT);

                    refreshTplGrid();
                }
            });

            card.querySelector('.tpl-view-btn').addEventListener('click', function(e) {
                e.stopPropagation();
                if (typeof window.openTemplateDetail === 'function') {
                    window.openTemplateDetail(t.id);
                }
            });
        });
    }

    window.openTemplateSelector = openTemplateSelector;
    window.openTemplateSelectorWithContext = openTemplateSelector;
    window.buildTplSidebar = buildTplSidebar;
    window.selectTemplateInModal = selectTemplateInModal;
    window.refreshTplGrid = refreshTplGrid;
    window.getOGTemplateButtons = getOGTemplateButtons;
    window.setOGTemplateButtonText = setOGTemplateButtonText;
    window.setActionTemplateButtonText = setActionTemplateButtonText;
    window.getTemplateSelectorSelectedId = getTemplateSelectorSelectedId;
    window.getTemplateContextCategories = getTemplateContextCategories;
    window.getTemplateRecentIds = getTemplateRecentIds;
    window.recordTemplateRecent = recordTemplateRecent;
    window.applyTemplateSelection = applyTemplateSelection;
    window.clearTemplateSelection = clearTemplateSelection;
    window.renderOutlineTemplateSelection = renderOutlineTemplateSelection;
})(window);
