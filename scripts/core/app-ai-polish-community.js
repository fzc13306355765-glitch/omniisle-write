(function(window, document) {
    'use strict';

    const Toast = window.ZHIYU_TOAST || window.Toast || {
        warn: function() {},
        success: function() {},
        error: function() {}
    };
    const Confirm = window.ZHIYU_CONFIRM || window.Confirm;
    const strengthLabels = Object.freeze({
        extreme_low: '低级',
        very_low: '中级',
        low: '高级'
    });
    const strengthPrompts = Object.freeze({
        extreme_low: '尽量少改，只处理机械表达、重复句式和明显不自然的措辞，严格保持原意、情节和信息。',
        very_low: '在保持原意、情节和信息不变的前提下，改善节奏、句式和自然度，避免模板化表达。',
        low: '允许较明显地重组句式与段落，但不得改变人物、情节、事实、视角和前后衔接。'
    });

    let selectedStrength = 'extreme_low';
    let activeController = null;
    let activeMode = 'v1';
    let v2Result = '';
    let v2SourceChapterKey = '';
    let v2SourceText = '';

    function getAIPolishMode() {
        return activeMode;
    }

    function hasActiveAIPolishTask() {
        const state = window.ZHIYU_APP_STATE || window.AppState || {};
        return !!activeController || !!state.outlineGen?.apAbortController;
    }

    function syncModeControls() {
        document.querySelectorAll('[data-ai-polish-mode]').forEach(function(button) {
            const selected = button.dataset.aiPolishMode === activeMode;
            button.classList.toggle('active', selected);
            button.setAttribute('aria-selected', selected ? 'true' : 'false');
        });
        const v1Tools = document.getElementById('aiPolishV1Tools');
        const v2Tools = document.getElementById('naturalizeSplitAction');
        if (v1Tools) v1Tools.hidden = activeMode !== 'v1';
        if (v2Tools) v2Tools.hidden = activeMode !== 'v2';
    }

    function tutorialActive() {
        return document.body?.classList.contains('zhiyu-outline-tutorial-active') === true;
    }

    function getSourceText() {
        const editor = document.getElementById('resultBox');
        return String(editor?.innerText || editor?.textContent || '').trim();
    }

    function getCurrentSourceChapterKey() {
        if (typeof window.getCurrentAIPolishChapterKey === 'function') {
            return window.getCurrentAIPolishChapterKey();
        }
        const state = window.ZHIYU_APP_STATE || window.AppState || {};
        const chapter = state.chapter || {};
        return [String(chapter.book || ''), Number(chapter.vi), Number(chapter.ci)].join('|');
    }

    function isV2SourceCurrent() {
        return !!v2SourceChapterKey
            && v2SourceChapterKey === getCurrentSourceChapterKey()
            && v2SourceText === getSourceText();
    }

    function getChapterLabel() {
        const state = window.ZHIYU_APP_STATE || window.AppState || {};
        const bookName = String(state.chapter?.book || '');
        const volumeIndex = Number(state.chapter?.vi);
        const chapterIndex = Number(state.chapter?.ci);
        const books = typeof window.gB === 'function' ? window.gB() : {};
        return String(books?.[bookName]?.volumes?.[volumeIndex]?.chapters?.[chapterIndex]?.title || '未选择章节');
    }

    function getModelConfig() {
        const model = typeof window.getActionModelConfig === 'function'
            ? window.getActionModelConfig()
            : null;
        return model?.base && model?.model ? model : null;
    }

    function setStatus(text, online) {
        const status = document.getElementById('naturalizeServerStatus');
        if (!status || status.classList.contains('outline-tutorial-server-ready')) return;
        status.textContent = text;
        status.classList.toggle('is-online', online === true);
        status.classList.toggle('is-offline', online !== true);
        status.classList.remove('is-checking');
    }

    function updateAIPolishSharedStatus() {
        const model = getModelConfig();
        const label = document.getElementById('naturalizeChapterLabel');
        if (label) label.textContent = getChapterLabel();
        setStatus(model ? '自备工具模型已配置' : '请先配置自己的工具模型', !!model);
        updateWordCount();
    }

    function updateWordCount() {
        const state = window.ZHIYU_APP_STATE || window.AppState || {};
        const text = activeMode === 'v1'
            ? String(document.querySelector('#apContentBox .ap-final-text')?.innerText || state.outlineGen?.apFinalText || '').replace(/\s+/g, '')
            : String(document.getElementById('apContentBox')?.innerText || '').replace(/\s+/g, '');
        const counter = document.getElementById('naturalizeWordCount');
        if (counter) counter.textContent = String(text.length);
    }

    function renderNaturalizePanel() {
        if (tutorialActive()) return;
        if (activeMode !== 'v2') {
            updateAIPolishSharedStatus();
            return;
        }
        const sourceText = getSourceText();
        const model = getModelConfig();
        const start = document.getElementById('btnNaturalize');
        if (start && !activeController) {
            start.textContent = 'AI消痕 ' + strengthLabels[selectedStrength];
            start.disabled = !sourceText || !model;
        }
        updateAIPolishSharedStatus();
    }

    function renderActiveAIPolishPanel() {
        syncModeControls();
        if (activeMode === 'v1') {
            window.renderAIPolishV1Panel?.();
            return;
        }
        const resultBox = document.getElementById('apContentBox');
        if (resultBox && !activeController) resultBox.textContent = v2Result;
        const apply = document.getElementById('btnAPSave');
        if (apply && !activeController) apply.disabled = !String(v2Result || '').trim() || !isV2SourceCurrent();
        renderNaturalizePanel();
    }

    function setAIPolishMode(nextMode) {
        const normalized = nextMode === 'v2' ? 'v2' : 'v1';
        if (normalized === activeMode) {
            renderActiveAIPolishPanel();
            return true;
        }
        if (hasActiveAIPolishTask()) {
            Toast.warn('当前优化任务正在运行，请先停止后再切换');
            return false;
        }
        if (activeMode === 'v2') {
            v2Result = String(document.getElementById('apContentBox')?.innerText || v2Result || '').trim();
        }
        activeMode = normalized;
        const taskStatus = document.getElementById('naturalizeTaskStatus');
        if (taskStatus) taskStatus.hidden = true;
        const replaceStatus = document.getElementById('naturalizeReplaceStatus');
        if (replaceStatus) {
            replaceStatus.textContent = '未替换';
            replaceStatus.classList.remove('is-applied');
            replaceStatus.classList.add('is-unapplied');
        }
        window.setAPStatus?.('', false);
        renderActiveAIPolishPanel();
        return true;
    }

    function setStrength(strength) {
        if (!strengthLabels[strength]) return;
        selectedStrength = strength;
        document.querySelectorAll('#naturalizeLevelMenu [data-strength]').forEach(function(button) {
            const selected = button.dataset.strength === strength;
            button.classList.toggle('selected', selected);
            button.classList.toggle('active', selected);
        });
        document.getElementById('naturalizeLevelMenu')?.classList.remove('open');
        document.getElementById('btnNaturalizeLevel')?.setAttribute('aria-expanded', 'false');
        renderNaturalizePanel();
    }

    async function startNaturalizeV2() {
        if (activeMode !== 'v2') return false;
        if (tutorialActive()) return false;
        if (hasActiveAIPolishTask()) {
            Toast.warn('当前消痕任务正在运行，请先停止后再继续');
            return false;
        }
        const sourceText = getSourceText();
        if (!sourceText) {
            Toast.warn('请先选择一个有正文的章节');
            return false;
        }
        if (sourceText.length > 32000) {
            Toast.warn('单次优化内容过长，请先拆分章节后再试');
            return false;
        }
        const model = getModelConfig();
        if (!model) {
            Toast.warn('请先在设置中配置自己的工具模型');
            return false;
        }

        const resultBox = document.getElementById('apContentBox');
        const start = document.getElementById('btnNaturalize');
        const apply = document.getElementById('btnAPSave');
        const stop = document.getElementById('apStopBtn');
        const taskStatus = document.getElementById('naturalizeTaskStatus');
        const replaceStatus = document.getElementById('naturalizeReplaceStatus');
        let result = '';
        activeController = new AbortController();
        v2Result = '';
        v2SourceChapterKey = getCurrentSourceChapterKey();
        v2SourceText = sourceText;
        if (resultBox) resultBox.textContent = '';
        if (start) { start.disabled = true; start.textContent = '优化中...'; }
        if (apply) apply.disabled = true;
        if (stop) stop.style.display = 'block';
        if (taskStatus) { taskStatus.hidden = false; taskStatus.textContent = '生成中'; }
        if (replaceStatus) {
            replaceStatus.textContent = '未替换';
            replaceStatus.classList.remove('is-applied');
            replaceStatus.classList.add('is-unapplied');
        }

        const prompt = [
            '请优化下面这段中文小说正文。',
            strengthPrompts[selectedStrength],
            '只输出优化后的完整正文，不要解释，不要加标题、引号或代码块。',
            '',
            sourceText
        ].join('\n');
        try {
            await window.streamGenerate(
                { ...model },
                '你是专业的中文小说编辑，负责降低机械感并保持故事连续性。',
                prompt,
                function(chunk) {
                    result += String(chunk || '');
                    v2Result = result;
                    if (resultBox) resultBox.textContent = result;
                    updateWordCount();
                },
                function(finalText) {
                    result = String(finalText || result).trim();
                    v2Result = result;
                    if (resultBox) resultBox.textContent = result;
                    updateWordCount();
                },
                function(error) {
                    throw error instanceof Error ? error : new Error(String(error || '优化失败'));
                },
                activeController.signal
            );
            result = String(result || resultBox?.innerText || '').trim();
            if (!result) throw new Error('模型没有返回有效正文');
            v2Result = result;
            if (!isV2SourceCurrent()) {
                if (apply) apply.disabled = true;
                if (taskStatus) taskStatus.textContent = '来源已变化';
                Toast.warn('章节或正文已变化，这次结果不会覆盖当前正文');
                return false;
            }
            if (apply) apply.disabled = false;
            if (taskStatus) taskStatus.textContent = '已完成';
            Toast.success('优化完成，请检查后再应用到正文');
            return true;
        } catch (error) {
            const aborted = error?.name === 'AbortError';
            if (taskStatus) taskStatus.textContent = aborted ? '已停止' : '失败';
            if (!aborted) Toast.error(error?.message || '优化失败');
            return false;
        } finally {
            activeController = null;
            if (stop) stop.style.display = 'none';
            if (start) start.textContent = 'AI消痕 ' + strengthLabels[selectedStrength];
            renderNaturalizePanel();
        }
    }

    async function applyNaturalizeV2Result() {
        if (activeMode !== 'v2' || tutorialActive()) return false;
        const result = String(document.getElementById('apContentBox')?.innerText || '').trim();
        if (!result) {
            Toast.warn('当前没有可应用的优化结果');
            return false;
        }
        if (!isV2SourceCurrent()) {
            const apply = document.getElementById('btnAPSave');
            if (apply) apply.disabled = true;
            Toast.warn('这个优化结果不属于当前章节，或正文已经变化，请重新优化');
            return false;
        }
        const confirmed = await Confirm?.show?.('确定用当前优化结果覆盖本章正文吗？');
        if (!confirmed) return false;
        if (!isV2SourceCurrent()) {
            const apply = document.getElementById('btnAPSave');
            if (apply) apply.disabled = true;
            Toast.warn('确认期间章节或正文发生了变化，本次没有覆盖');
            return false;
        }
        window.invalidateAIPolishV1State?.();
        window.writePlainTextToResultBox?.(result, { saveChapter: true, dispatchInput: true });
        const replaceStatus = document.getElementById('naturalizeReplaceStatus');
        if (replaceStatus) {
            replaceStatus.textContent = '已替换';
            replaceStatus.classList.remove('is-unapplied');
            replaceStatus.classList.add('is-applied');
        }
        Toast.success('已应用到正文');
        return true;
    }

    function cancelNaturalizeV2() {
        if (!activeController) return false;
        activeController.abort(new DOMException('user_cancelled', 'AbortError'));
        return true;
    }

    function startNaturalize() {
        if (activeMode === 'v1') {
            window.openAIPolishConfig?.();
            return false;
        }
        return startNaturalizeV2();
    }

    function cancelNaturalize() {
        return activeMode === 'v1'
            ? window.cancelAIPolishV1?.() === true
            : cancelNaturalizeV2();
    }

    function applyNaturalizeResult() {
        return activeMode === 'v1'
            ? window.applyAIPolishV1Result?.()
            : applyNaturalizeV2Result();
    }

    async function clearNaturalizeResult() {
        if (activeMode === 'v1') return window.clearAIPolishV1Result?.() || false;
        if (activeController) {
            Toast.warn('消痕 II 正在处理，请先停止后再清空');
            return false;
        }
        if (!String(v2Result || document.getElementById('apContentBox')?.innerText || '').trim()) {
            Toast.warn('消痕 II 内容已经是空的');
            return false;
        }
        const confirmed = await Confirm?.show?.('确定清空当前“消痕 II”结果吗？不会删除章节正文。');
        if (!confirmed) return false;
        v2Result = '';
        v2SourceChapterKey = '';
        v2SourceText = '';
        const resultBox = document.getElementById('apContentBox');
        if (resultBox) resultBox.textContent = '';
        const apply = document.getElementById('btnAPSave');
        if (apply) apply.disabled = true;
        const replaceStatus = document.getElementById('naturalizeReplaceStatus');
        if (replaceStatus) {
            replaceStatus.textContent = '未替换';
            replaceStatus.classList.remove('is-applied');
            replaceStatus.classList.add('is-unapplied');
        }
        updateWordCount();
        Toast.success('已清空消痕 II 结果');
        return true;
    }

    document.getElementById('btnNaturalizeLevel')?.addEventListener('click', function(event) {
        event.stopPropagation();
        const menu = document.getElementById('naturalizeLevelMenu');
        const open = !menu?.classList.contains('open');
        menu?.classList.toggle('open', open);
        this.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.querySelectorAll('#naturalizeLevelMenu [data-strength]').forEach(function(button) {
        button.addEventListener('click', function(event) {
            event.stopPropagation();
            setStrength(this.dataset.strength);
        });
    });
    document.addEventListener('click', function() {
        document.getElementById('naturalizeLevelMenu')?.classList.remove('open');
        document.getElementById('btnNaturalizeLevel')?.setAttribute('aria-expanded', 'false');
    });
    document.querySelectorAll('[data-ai-polish-mode]').forEach(function(button) {
        button.addEventListener('click', function() { setAIPolishMode(this.dataset.aiPolishMode); });
    });
    document.getElementById('btnNaturalize')?.addEventListener('click', startNaturalizeV2);
    document.getElementById('btnAPSave')?.addEventListener('click', applyNaturalizeResult);
    document.getElementById('apStopBtn')?.addEventListener('click', cancelNaturalize);
    document.getElementById('apContentBox')?.addEventListener('input', function() {
        if (activeMode === 'v2') v2Result = String(this.innerText || '').trim();
        updateWordCount();
    });
    document.querySelector('.action-tab-btn[data-tab="aiPolish"]')?.addEventListener('click', function() {
        window.setTimeout(renderActiveAIPolishPanel, 0);
    });

    window.getAIPolishMode = getAIPolishMode;
    window.setAIPolishMode = setAIPolishMode;
    window.hasActiveAIPolishTask = hasActiveAIPolishTask;
    window.isNaturalizeV2Running = function() { return !!activeController; };
    window.startNaturalize = startNaturalize;
    window.startNaturalizeV2 = startNaturalizeV2;
    window.cancelNaturalize = cancelNaturalize;
    window.applyNaturalizeResult = applyNaturalizeResult;
    window.clearNaturalizeResult = clearNaturalizeResult;
    window.updateAIPolishSharedStatus = updateAIPolishSharedStatus;
    window.renderNaturalizePanel = renderActiveAIPolishPanel;
    window.renderAPSidePanel = renderActiveAIPolishPanel;
    setStrength(selectedStrength);
    syncModeControls();
    renderActiveAIPolishPanel();
})(window, document);
