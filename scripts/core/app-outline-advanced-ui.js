(function(window) {
    'use strict';
    const AppState = window.ZHIYU_APP_STATE || window.AppState;
    const state = AppState.outline;
    if (!state.outlineSubMode) state.outlineSubMode = 'normal';
    if (!Array.isArray(state.outlineAdvancedLinkedFiles)) state.outlineAdvancedLinkedFiles = [];
    if (!state.advancedContent) state.advancedContent = '';
    if (!state.advancedOutputKind) state.advancedOutputKind = 'master';

    function getOutlineSubMode() { return state.outlineSubMode === 'advanced' ? 'advanced' : 'normal'; }
    function isAdvancedOutlineMode() { return getOutlineSubMode() === 'advanced' && (window.getOutlineMode?.() || state.mode || 'outline') === 'outline'; }
    function updateAdvancedOutlineSourceCount() {
        const content = window.getAdvancedOutlineMasterSource?.() || '';
        const node = document.getElementById('outlineAdvancedSourceCount');
        if (node) {
            const sourceName = String(state.outlineAdvancedSourceName || '').trim();
            node.textContent = content ? ('已选择' + (sourceName ? ' ' + sourceName.replace(/\.md$/i, '') : '') + ' ✅') : '未选择';
        }
    }
    function updateAdvancedOutlineLinkedCount() {
        const node = document.getElementById('outlineAdvancedLinkedCount');
        if (node) node.textContent = state.outlineAdvancedLinkedFiles.length ? '已选择 ' + state.outlineAdvancedLinkedFiles.length + ' 项' : '未选择';
    }
    function getAdvancedOutlineStageExpectedStartForDisplay(stage, stages, memBooks, visited) {
        const stageKey = String(stage?.key || '');
        const stageNo = Number(stageKey.replace(/^S/i, ''));
        if (!Number.isFinite(stageNo) || stageNo <= 0) return 0;
        if (stageNo === 1) return Number(stage?.startChapter) || 1;
        const previousKey = 'S' + String(stageNo - 1).padStart(2, '0');
        const seen = visited || new Set();
        if (seen.has(previousKey)) return 0;
        seen.add(previousKey);
        const previousStage = (stages || []).find(function(item) { return item.key === previousKey; });
        const previousRecord = window.findAdvancedStageFileRecord?.(String(AppState.chapter.book || ''), previousKey, memBooks);
        const previousContent = String(previousRecord?.file?.content || '').trim();
        if (!previousStage || !previousContent) return 0;
        const previousNumbers = window.getAdvancedStageChapterNumbers?.(previousContent) || [];
        if (!previousNumbers.length) return 0;
        const previousExpectedStart = getAdvancedOutlineStageExpectedStartForDisplay(previousStage, stages, memBooks, seen);
        if (!previousExpectedStart) return 0;
        if (typeof window.validateAdvancedStageCompleteness === 'function') {
            const validation = window.validateAdvancedStageCompleteness(previousContent, previousStage, previousExpectedStart);
            if (!validation.ok) return 0;
        } else if (previousNumbers[0] !== previousExpectedStart) {
            return 0;
        }
        return previousNumbers[previousNumbers.length - 1] + 1;
    }
    function isAdvancedOutlineStageGenerated(stage, stages, memBooks) {
        const stageKey = String(stage?.key || '');
        const bookName = String(AppState.chapter.book || '');
        if (!stageKey || !bookName) return false;
        const memory = memBooks || window.getMemBooks?.() || {};
        const expectedStart = getAdvancedOutlineStageExpectedStartForDisplay(stage, stages, memory);
        if (!expectedStart) return false;
        const savedRecord = window.findAdvancedStageFileRecord?.(bookName, stageKey, memory);
        const candidates = [savedRecord?.file?.content, window.restoreAdvancedOutlineStageDraft?.(bookName, stageKey)]
            .map(function(content) { return String(content || '').trim(); })
            .filter(Boolean);
        return candidates.some(function(content) {
            const numbers = window.getAdvancedStageChapterNumbers?.(content) || [];
            if (!numbers.length) return false;
            if (typeof window.validateAdvancedStageCompleteness !== 'function') return numbers[0] === expectedStart;
            return window.validateAdvancedStageCompleteness(content, stage, expectedStart).ok === true;
        });
    }
    function updateAdvancedOutlineStageOptions() {
        const select = document.getElementById('outlineAdvancedStageSelect');
        if (!select) return;
        const current = select.value;
        const source = window.getAdvancedOutlineMasterSource?.() || '';
        const stages = Array.isArray(state.outlineAdvancedStages) && state.outlineAdvancedStages.length
            ? state.outlineAdvancedStages
            : window.extractAdvancedOutlineStages(source);
        if (stages.length) {
            const memBooks = window.getMemBooks?.() || {};
            const options = stages.map(function(stage) {
                const option = document.createElement('option');
                const generated = isAdvancedOutlineStageGenerated(stage, stages, memBooks);
                option.value = stage.key;
                option.textContent = '【' + stage.key + '】' + stage.title;
                option.dataset.generated = generated ? 'true' : 'false';
                option.title = generated ? '该阶段粗纲已经完整生成' : '该阶段粗纲尚未完整生成';
                if (generated) option.style.color = '#9ca3af';
                return option;
            });
            select.replaceChildren(...options);
        } else {
            select.innerHTML = '<option value="">先选择包含阶段规划的大纲</option>';
        }
        select.disabled = !stages.length;
        if (stages.some(stage => stage.key === current)) select.value = current;
        const generateButton = document.getElementById('btnStartAdvancedStageOutlineBottom');
        if (generateButton) {
            generateButton.disabled = !stages.length;
            generateButton.title = stages.length ? '' : '请先在上方选择包含 Sxx 阶段规划的大纲';
        }
    }
    function updateAdvancedOutlineCostInfo() {
        const node = document.getElementById('outlineAdvancedCostInfo');
        if (!node) return;
        const schedule = window.getAdvancedOutlineSegmentSchedule();
        node.textContent = isAdvancedOutlineMode()
            ? `预计分 ${schedule.length} 段生成；使用当前选择的自备模型。`
            : '';
    }
    function syncAdvancedOutlineUI() {
        const mode = window.getOutlineMode?.() || state.mode || 'outline';
        const advanced = isAdvancedOutlineMode();
        const modal = document.getElementById('outlineModal');
        if (modal) {
            modal.dataset.mode = mode;
            modal.dataset.outlineSubmode = advanced ? 'advanced' : 'normal';
        }
        document.querySelectorAll('#outlineModal .outline-advanced-section').forEach(node => { node.style.display = advanced ? '' : 'none'; });
        document.querySelectorAll('#outlineModal .outline-normal-section').forEach(node => { node.style.display = advanced ? 'none' : ''; });
        document.querySelectorAll('#outlineSubModeTabs [data-submode]').forEach(node => node.classList.toggle('active', node.dataset.submode === getOutlineSubMode()));
        const masterExpanded = document.getElementById('outlineAdvancedMasterToggle')?.getAttribute('aria-expanded') === 'true';
        ['outlineGenreSection', 'outlineWordCountSection'].forEach(id => document.getElementById(id)?.classList.toggle('outline-advanced-fold-hidden', advanced && !masterExpanded));
        const result = document.getElementById('outlineResultBox');
        if (advanced && !state.advancedContent && typeof window.restoreAdvancedOutlineDraft === 'function') {
            state.advancedContent = window.restoreAdvancedOutlineDraft(AppState.chapter.book);
        }
        const runtime = state.generationRuntime;
        const runtimeMatches = !!runtime
            && window.doesOutlineGenerationRuntimeMatchCurrent?.(runtime, mode) !== false;
        const runtimeVisible = runtimeMatches && runtime.active;
        const visibleContent = state.advancedOutputKind === 'stage' ? state.advancedStageContent : state.advancedContent;
        if (result && mode === 'outline' && runtimeMatches) {
            result.textContent = runtime.content || window.getOutlinePlaceholder?.() || '点击「开始生成大纲」后内容将在此区域显示...';
        } else if (result && mode === 'outline' && advanced) {
            result.textContent = visibleContent || '点击「生成大纲」后内容将在此区域显示...';
        } else if (result && mode === 'outline' && !advanced) {
            const normalContent = state.content || window.restoreNormalOutlineDraft?.(AppState.chapter.book) || '';
            state.content = normalContent;
            result.textContent = normalContent || window.getOutlinePlaceholder?.() || '点击「开始生成大纲」后内容将在此区域显示...';
        }
        if (result && mode === 'outline') {
            result.style.background = runtimeVisible ? '#e3f2fd' : '';
        }
        const startButton = document.getElementById('btnStartOutline');
        if (startButton && mode === 'outline') {
            if (runtimeVisible) {
                startButton.dataset.generating = 'true';
                startButton.textContent = '停止生成';
            } else {
                delete startButton.dataset.generating;
                startButton.textContent = '生成大纲';
            }
        }
        updateAdvancedOutlineSourceCount(); updateAdvancedOutlineLinkedCount(); updateAdvancedOutlineStageOptions(); updateAdvancedOutlineCostInfo();
    }
    function setAdvancedOutlineGroupExpanded(group, expanded) {
        const config = group === 'stages'
            ? { button: 'outlineAdvancedStagesToggle', ids: ['outlineAdvancedSourceSection', 'outlineAdvancedStageSection', 'outlineAdvancedLinkSection'] }
            : { button: 'outlineAdvancedMasterToggle', ids: ['outlineGenreSection', 'outlineWordCountSection'] };
        config.ids.forEach(id => document.getElementById(id)?.classList.toggle('outline-advanced-fold-hidden', !expanded));
        const button = document.getElementById(config.button);
        if (button) { button.setAttribute('aria-expanded', String(expanded)); button.classList.toggle('is-collapsed', !expanded); }
    }
    function openAdvancedOutlinePicker() {
        if (typeof window.openOutlinePickerModal === 'function') window.openOutlinePickerModal('advanced');
        else window.ZHIYU_MODAL?.open?.('outlinePickerModal');
        updateAdvancedOutlineSourceCount();
        updateAdvancedOutlineStageOptions();
    }
    document.querySelectorAll('#outlineSubModeTabs [data-submode]').forEach(button => button.addEventListener('click', function() {
        const result = document.getElementById('outlineResultBox');
        if (typeof window.saveCurrentOutlineResultDraft === 'function') {
            window.saveCurrentOutlineResultDraft();
        } else if (isAdvancedOutlineMode() && result) {
            if (state.advancedOutputKind === 'stage') state.advancedStageContent = result.textContent || '';
            else state.advancedContent = result.textContent || '';
        } else if (result) {
            const normalContent = result.textContent || '';
            if (normalContent && !/^点击「生成大纲」/.test(normalContent)) {
                state.content = normalContent;
                window.saveNormalOutlineDraft?.(AppState.chapter.book, normalContent);
            }
        }
        state.outlineSubMode = this.dataset.submode === 'advanced' ? 'advanced' : 'normal';
        if (typeof window.renderOutlineMode === 'function') window.renderOutlineMode();
        else syncAdvancedOutlineUI();
    }));
    document.getElementById('outlineAdvancedMasterToggle')?.addEventListener('click', function() { setAdvancedOutlineGroupExpanded('master', this.getAttribute('aria-expanded') !== 'true'); });
    document.getElementById('outlineAdvancedStagesToggle')?.addEventListener('click', function() { setAdvancedOutlineGroupExpanded('stages', this.getAttribute('aria-expanded') !== 'true'); });
    document.getElementById('outlineAdvancedStageSelect')?.addEventListener('change', updateAdvancedOutlineCostInfo);
    Object.assign(window, { getOutlineSubMode, isAdvancedOutlineMode, updateAdvancedOutlineSourceCount, updateAdvancedOutlineLinkedCount, getAdvancedOutlineStageExpectedStartForDisplay, isAdvancedOutlineStageGenerated, updateAdvancedOutlineStageOptions, updateAdvancedOutlineCostInfo, syncAdvancedOutlineUI, setAdvancedOutlineGroupExpanded, openAdvancedOutlinePicker });
    syncAdvancedOutlineUI();
})(window);
