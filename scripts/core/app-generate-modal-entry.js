(function(window) {
    'use strict';

    const AppState = window.ZHIYU_APP_STATE || window.AppState;
    const Toast = window.ZHIYU_TOAST || window.Toast;
    const Modal = window.ZHIYU_MODAL || window.Modal;
    const StorageService = window.ZHIYU_STORAGE_SERVICE || window.StorageService;
    const gB = window.gB;
    const getSelectedModelConfig = window.getSelectedModelConfig;
    const getTemplateLikeCount = window.getTemplateLikeCount || function(template) { return Number(template?.likes || template?.likeCount || 0); };
    const getTemplateUsageCount = window.getTemplateUsageCount || function(template) { return Number(template?.usageCount || template?.useCount || 0); };
    const createTemplateAuthorAvatar = window.createTemplateAuthorAvatar;

    function getTemplateTitle(templateId) {
        const templates = typeof window.gT === 'function' ? window.gT() : [];
        const tpl = templates.find(function(item) { return item && item.id === templateId; });
        return tpl?.title || '';
    }

    function getComposerTemplates() {
        const templates = typeof window.gT === 'function' ? window.gT() : [];
        return Array.isArray(templates) ? templates : [];
    }

    function getChapterComposerReadiness() {
        const state = AppState?.chapter || {};
        window.ensureGenerationLinkedFilesBook?.(state.book || '');
        const books = typeof gB === 'function' ? gB() : {};
        const chapter = books?.[state.book]?.volumes?.[state.vi]?.chapters?.[state.ci];
        const template = getComposerTemplates().find(function(item) {
            return item && item.id === AppState?.gen?.templateId;
        });
        const linkedFiles = typeof window.getGenerationLinkedFilesForChapter === 'function'
            ? window.getGenerationLinkedFilesForChapter(state.book, state.vi, state.ci)
            : [];
        const running = Object.keys(window.generationTasks || {}).length;
        const preflightRunning = !!window.__chapterGenerationPreflightActive;
        const reasons = [];
        const modelConfig = typeof window.getSelectedModelConfig === 'function' ? window.getSelectedModelConfig() : null;
        if (!state.book || Number(state.vi) < 0 || Number(state.ci) < 0 || !chapter) reasons.push('请选择一个正式章节');
        if (!template) reasons.push('请选择提示词模版');
        if (!linkedFiles.length) reasons.push('请选择关联文件');
        if (window.ZHIYU_COMMUNITY_MODE === true && (!modelConfig?.base || !modelConfig?.model)) reasons.push('请先添加自己的模型');
        if (running > 0) reasons.push('当前有章节正在生成');
        if (preflightRunning) reasons.push('正在准备生成，请稍等');
        return { ready: reasons.length === 0, reasons, chapter, template, linkedFiles, running, preflightRunning };
    }

    function updateChapterGenerationModelNotice() {
        const creditInfo = document.getElementById('genCreditInfo');
        if (!creditInfo) return;
        creditInfo.textContent = '使用当前选择的自备模型；费用由模型供应商结算';
        creditInfo.style.color = '#8b8d98';
    }

    function muteSelectedChapterCardForComposer() {
        const selected = document.querySelector('#treeContent .chapter-item.selected[data-vi][data-ci]');
        if (!selected || Number(selected.dataset.vi) < 0 || Number(selected.dataset.ci) < 0) return;
        const state = AppState?.chapter || {};
        const isGenerating = typeof window.isCurrentlyGeneratingChapter === 'function'
            && window.isCurrentlyGeneratingChapter(state.book, Number(selected.dataset.vi), Number(selected.dataset.ci));
        selected.classList.toggle('generation-target', !!isGenerating);
    }

    function closeComposerTemplateMenu() {
        window.closeTemplateQuickMenu?.();
    }

    function applyComposerTemplate(templateId, recordUsage) {
        const template = getComposerTemplates().find(function(item) { return item && item.id === templateId; });
        if (!template || !AppState?.gen) return false;
        if (typeof window.applyTemplateSelection === 'function') {
            return window.applyTemplateSelection(template, { context: 'chapter', recordUsage: recordUsage !== false });
        }
        AppState.gen.templateId = template.id;
        if (AppState.outline) AppState.outline.templateId = template.id;
        if (recordUsage && StorageService?.getTemplates && StorageService?.saveTemplates) {
            const storedTemplates = StorageService.getTemplates();
            const stored = Array.isArray(storedTemplates) ? storedTemplates.find(function(item) { return item && item.id === template.id; }) : null;
            if (stored) {
                stored.usageCount = Number(stored.usageCount || 0) + 1;
                stored.lastUsedAt = Date.now();
                StorageService.saveTemplates(storedTemplates);
            }
        }
        updateChapterComposerState();
        return true;
    }

    function updateChapterComposerState() {
        if (!AppState?.gen) return;
        window.ensureGenerationLinkedFilesBook?.(AppState.chapter?.book || '');
        if (!Array.isArray(AppState.gen.linkedFiles)) AppState.gen.linkedFiles = [];
        const templateName = document.getElementById('composerTemplateName');
        const modalTemplateName = document.getElementById('selectedTemplateName');
        const linkedCount = document.getElementById('composerLinkedFileCount');
        const generateBtn = document.getElementById('btnComposerGenerate');
        const title = getTemplateTitle(AppState.gen.templateId);
        const template = getComposerTemplates().find(function(item) { return item && item.id === AppState.gen.templateId; }) || null;
        if (templateName && typeof window.renderTemplateSelectionButton === 'function') {
            window.renderTemplateSelectionButton('btnComposerTemplate', template, {
                labelElement: templateName,
                placeholder: '选择提示词模版'
            });
        } else if (templateName) {
            templateName.textContent = title || '选择提示词模版';
        }
        if (modalTemplateName && typeof window.renderTemplateSelectionButton === 'function') {
            window.renderTemplateSelectionButton(modalTemplateName.closest('button'), template, {
                labelElement: modalTemplateName,
                placeholder: '未选择'
            });
        } else if (modalTemplateName) {
            modalTemplateName.textContent = title || '未选择';
        }
        if (linkedCount) linkedCount.textContent = AppState.gen.linkedFiles.length ? ('已选择 ' + AppState.gen.linkedFiles.length) : '';
        if (generateBtn) {
            const readiness = getChapterComposerReadiness();
            generateBtn.disabled = !readiness.ready;
            generateBtn.title = readiness.ready
                ? '按当前输入、模板和关联文件生成本章正文'
                : readiness.reasons.join('；');
        }
        updateChapterGenerationModelNotice();
    }

    function bindGenerateChapterDialogEntry() {
    document.getElementById('btnGen')?.addEventListener('click',async function(){
        if(!AppState.chapter.book){ Toast.warn('请先选择或创建一个章节'); return; }
        if(AppState.chapter.vi < 0){ Toast.warn('参考文件不能生成章节，请先选择一个正式章节'); return; }
        // 检查是否有正在进行的生成任务
        const running = Object.keys(window.generationTasks).length;
        if (running > 0) {
            const tasks = Object.values(window.generationTasks).map(t => {
                const books = gB(); const ch = books[t.book]?.volumes[t.vi]?.chapters[t.ci]; return ch?.name || '未知';
            });
            Toast.warn(`当前有 ${running} 个章节正在生成（${tasks.join('、')}），请等待完成后再生成新章节`);
            return;
        }
        updateChapterGenerationModelNotice();
        Modal.open('generateModal');
    });

    document.getElementById('chapterTargetWordsInput')?.addEventListener('input', updateChapterGenerationModelNotice);

    document.getElementById('btnComposerTemplate')?.addEventListener('click', function() {
        closeComposerTemplateMenu();
        if (typeof window.openTemplateSelector === 'function') window.openTemplateSelector({ context: 'chapter', subCategories: ['正文', '续写'] });
    });

    document.getElementById('btnComposerTemplateMenu')?.addEventListener('click', function(event) {
        event.preventDefault();
        event.stopPropagation();
        window.openTemplateQuickMenu?.(this, {
            context: 'chapter',
            getSelectedId: function() { return AppState?.gen?.templateId || ''; },
            onChange: updateChapterComposerState,
            onClear: updateChapterComposerState
        });
    });

    document.getElementById('btnComposerLinkFiles')?.addEventListener('click', function() {
        muteSelectedChapterCardForComposer();
        if (typeof window.openLinkMemorySelector === 'function') window.openLinkMemorySelector();
    });

    document.getElementById('btnComposerRefChapters')?.addEventListener('click', function() {
        if (typeof window.openRefChapterSelector === 'function') window.openRefChapterSelector();
    });

    document.getElementById('btnComposerGenerate')?.addEventListener('click', function() {
        const readiness = getChapterComposerReadiness();
        if (!readiness.ready) { Toast.warn(readiness.reasons[0]); return; }
        document.getElementById('btnStartGenerate')?.click();
        updateChapterComposerState();
    });

    updateChapterComposerState();

    }

    window.bindGenerateChapterDialogEntry = bindGenerateChapterDialogEntry;
    window.updateChapterComposerState = updateChapterComposerState;
    window.applyComposerTemplate = applyComposerTemplate;
    window.getChapterComposerReadiness = getChapterComposerReadiness;
    window.muteSelectedChapterCardForComposer = muteSelectedChapterCardForComposer;
    bindGenerateChapterDialogEntry();
    window.ZHIYU_GENERATE_MODAL_ENTRY_READY = true;
})(window);
