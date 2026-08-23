// ZHIYU_ACTION_PANEL_SHARED_UI_BEGIN
(function(window) {
    'use strict';

    var AppState = window.ZHIYU_APP_STATE || window.AppState || {};
    var Toast = window.ZHIYU_TOAST || window.Toast || {
        warn: function(){},
        success: function(){},
        error: function(){},
        show: function(){}
    };
    var Confirm = window.ZHIYU_CONFIRM || window.Confirm || {
        show: function(){ return Promise.resolve(false); }
    };
    var ACTION_DRAFT_PREFIX = 'zhiyu_action_panel_draft_v1';

    function isOperationTutorialActive() {
        return document.body?.classList.contains('zhiyu-outline-tutorial-active') === true
            || Date.now() < Number(window.ZHIYU_OPERATION_TUTORIAL_STORAGE_BLOCK_UNTIL || 0);
    }

    function readLargeDraft(key) {
        if (isOperationTutorialActive()) return '';
        return window.ZHIYU_LARGE_LOCAL_STORE?.get?.(key) ?? localStorage.getItem(key) ?? '';
    }

    function writeLargeDraft(key, value, kind) {
        if (isOperationTutorialActive()) return;
        if (window.ZHIYU_LARGE_LOCAL_STORE?.set) {
            window.ZHIYU_LARGE_LOCAL_STORE.set(key, value || '', kind || 'action_draft').catch(function(error) {
                console.error('功能区草稿保存失败：', error);
                Toast.warn('功能区草稿保存失败，请勿关闭页面');
            });
            return;
        }
        localStorage.setItem(key, value || '');
    }

    function removeLargeDraft(key) {
        if (isOperationTutorialActive()) return;
        if (window.ZHIYU_LARGE_LOCAL_STORE?.remove) {
            window.ZHIYU_LARGE_LOCAL_STORE.remove(key).catch(function(error) {
                console.error('功能区草稿删除失败：', error);
            });
            return;
        }
        localStorage.removeItem(key);
    }

    function outlineGen() {
        AppState.outlineGen = AppState.outlineGen || {};
        return AppState.outlineGen;
    }

    function safeDraftPart(value) {
        return String(value == null ? '' : value)
            .replace(/[^\w\u4e00-\u9fa5-]+/g, '_')
            .slice(0, 80);
    }

    function getActionContentBoxByTab(tabName) {
        var tab = tabName || outlineGen().activeTab || 'fineOutline';
        if (tab === 'decompose') return document.getElementById('dcContentBox');
        if (tab === 'aiPolish') return document.getElementById('apContentBox');
        return document.getElementById('ogContentBox');
    }

    function getActionInputElementByTab() {
        return document.getElementById('ogDescInput');
    }

    function getActionDraftContext(tabName) {
        var chapter = AppState.chapter || {};
        return {
            accountUid: window.AccountDataScope?.getActiveUid?.() || AppState.auth?.uid || 'guest',
            book: chapter.book || 'no_book',
            volume: Number.isFinite(Number(chapter.vi)) ? chapter.vi : 'x',
            chapterIndex: Number.isFinite(Number(chapter.ci)) ? chapter.ci : 'x',
            tab: tabName || outlineGen().activeTab || 'fineOutline'
        };
    }

    function getActionDraftBase(tabName, context) {
        var draftContext = context || getActionDraftContext(tabName);
        var rawKey = [
            ACTION_DRAFT_PREFIX,
            safeDraftPart(draftContext.book),
            draftContext.volume,
            draftContext.chapterIndex,
            safeDraftPart(draftContext.tab)
        ].join(':');
        return window.AccountDataScope?.key
            ? window.AccountDataScope.key(rawKey, draftContext.accountUid)
            : [draftContext.accountUid, rawKey].join(':');
    }

    function isNaturalizeTab(tabName) {
        return (tabName || outlineGen().activeTab || 'fineOutline') === 'aiPolish';
    }

    function getActionContentDraftKeys(tabName, context) {
        var base = getActionDraftBase(tabName, context);
        return { html: base + ':content_html', text: base + ':content_text' };
    }

    function getActionInputDraftKeys(tabName, context) {
        return { text: getActionDraftBase(tabName, context) + ':input_text' };
    }

    function getActionContentClearKey(tabName, context) {
        return getActionDraftBase(tabName, context) + ':content_cleared';
    }

    function getActionContentClearKeys(tabName, context) {
        return { content: getActionContentClearKey(tabName, context) };
    }

    function isActionContentCleared(tabName, context) {
        if (isNaturalizeTab(tabName) || isOperationTutorialActive()) return false;
        try {
            return localStorage.getItem(getActionContentClearKey(tabName, context)) === '1';
        } catch (_error) {
            return false;
        }
    }

    function markActionContentCleared(tabName, context) {
        if (isNaturalizeTab(tabName) || isOperationTutorialActive()) return;
        try {
            localStorage.setItem(getActionContentClearKey(tabName, context), '1');
        } catch (_error) {}
    }

    function removeActionContentClearMarks(tabName, context) {
        if (isNaturalizeTab(tabName) || isOperationTutorialActive()) return;
        try {
            localStorage.removeItem(getActionContentClearKey(tabName, context));
        } catch (_error) {}
    }

    function captureActionContentDraft(tabName) {
        var tab = tabName || outlineGen().activeTab || 'fineOutline';
        if (isNaturalizeTab(tab)) return null;
        var box = getActionContentBoxByTab(tab);
        if (!box) return null;
        var context = getActionDraftContext(tab);
        return Object.assign(context, {
            html: box.innerHTML || '',
            text: box.innerText || box.textContent || '',
            hadRuntimeContent: hasActionContent(tab)
        });
    }

    function isCurrentActionDraftContext(draft) {
        if (!draft) return false;
        var current = getActionDraftContext(draft.tab);
        return String(current.accountUid) === String(draft.accountUid)
            && String(current.book) === String(draft.book)
            && String(current.volume) === String(draft.volume)
            && String(current.chapterIndex) === String(draft.chapterIndex)
            && current.tab === draft.tab;
    }

    function saveActionContentDraft(tabName, capturedDraft) {
        var tab = tabName || capturedDraft?.tab || outlineGen().activeTab || 'fineOutline';
        if (isNaturalizeTab(tab)) return '';
        var draft = capturedDraft || captureActionContentDraft(tab);
        if (!draft) return '';
        var keys = getActionContentDraftKeys(tab, draft);
        var text = String(draft.text || '');
        if (!text.replace(/\u200B/g, '').trim()) {
            removeActionContentDraft(tab, draft);
            markActionContentCleared(tab, draft);
            if (draft.hadRuntimeContent && isCurrentActionDraftContext(draft)) {
                resetActionContentState(tab);
            }
            return '';
        }
        try {
            writeLargeDraft(keys.html, draft.html || '', 'action_content_html');
            writeLargeDraft(keys.text, text, 'action_content_text');
        } catch (_error) {}
        removeActionContentClearMarks(tab, draft);
        if (isCurrentActionDraftContext(draft)) {
            if (tab === 'decompose') outlineGen().dcContent = text;
            else outlineGen().ogContent = text;
        }
        return text;
    }

    function restoreActionContentDraft(tabName) {
        var tab = tabName || outlineGen().activeTab || 'fineOutline';
        if (isNaturalizeTab(tab)) {
            window.renderNaturalizePanel?.();
            return false;
        }
        var box = getActionContentBoxByTab(tab);
        if (!box || (box.innerText || box.textContent || '').trim()) return false;
        if (isActionContentCleared(tab)) return false;
        var keys = getActionContentDraftKeys(tab);
        var html = '';
        var text = '';
        try {
            html = readLargeDraft(keys.html);
            text = readLargeDraft(keys.text);
        } catch (_error) {}
        if (!html && !text) return false;
        if (html) box.innerHTML = html;
        else box.textContent = text;
        return true;
    }

    function saveActionInputDraft(tabName) {
        var tab = tabName || outlineGen().activeTab || 'fineOutline';
        if (isNaturalizeTab(tab)) return;
        var input = getActionInputElementByTab();
        if (!input) return;
        try {
            writeLargeDraft(getActionInputDraftKeys(tab).text, input.value || '', 'action_input');
        } catch (_error) {}
    }

    function restoreActionInputDraft(tabName) {
        var tab = tabName || outlineGen().activeTab || 'fineOutline';
        if (isNaturalizeTab(tab)) return false;
        var input = getActionInputElementByTab();
        if (!input) return false;
        var text = '';
        try {
            text = readLargeDraft(getActionInputDraftKeys(tab).text);
        } catch (_error) {}
        if (!text || input.value) return false;
        input.value = text;
        return true;
    }

    function getActionTabLabel(tabName) {
        if (tabName === 'decompose') return '拆书';
        if (tabName === 'aiPolish') return 'AI消痕';
        return '细纲';
    }

    function removeActionContentDraft(tabName, context) {
        if (isNaturalizeTab(tabName)) return;
        var keys = getActionContentDraftKeys(tabName, context);
        try {
            removeLargeDraft(keys.html);
            removeLargeDraft(keys.text);
        } catch (_error) {}
    }

    function resetActionContentState(tabName) {
        var tab = tabName || outlineGen().activeTab || 'fineOutline';
        if (isNaturalizeTab(tab)) {
            window.renderNaturalizePanel?.();
            return;
        }
        var box = getActionContentBoxByTab(tab);
        if (box) box.innerHTML = '';
        if (tab === 'decompose') outlineGen().dcContent = '';
        else outlineGen().ogContent = '';
    }

    function hasActionContent(tabName) {
        var tab = tabName || outlineGen().activeTab || 'fineOutline';
        var box = getActionContentBoxByTab(tab);
        var boxText = box ? (box.innerText || box.textContent || '').trim() : '';
        if (boxText) return true;
        if (tab === 'decompose') return !!String(outlineGen().dcContent || '').trim();
        if (isNaturalizeTab(tab)) return false;
        return !!String(outlineGen().ogContent || '').trim();
    }

    async function clearActionTabContent(tabName) {
        var tab = tabName || outlineGen().activeTab || 'fineOutline';
        if (isNaturalizeTab(tab)) {
            return typeof window.clearNaturalizeResult === 'function'
                ? window.clearNaturalizeResult()
                : false;
        }
        var controllerKey = tab === 'decompose' ? 'dcAbortController' : 'ogAbortController';
        var label = getActionTabLabel(tab);
        if (outlineGen()[controllerKey]) {
            Toast.warn(label + '正在生成，请先停止后再清空');
            return false;
        }
        if (!hasActionContent(tab)) {
            Toast.warn(label + '内容已经是空的');
            return false;
        }
        var ok = await Confirm.show(
            '确定清空当前“' + label + '”内容吗？不会删除正文、章节和记忆库文件。'
        );
        if (!ok) return false;
        var box = getActionContentBoxByTab(tab);
        if (box) box.innerHTML = '';
        removeActionContentDraft(tab);
        markActionContentCleared(tab);
        resetActionContentState(tab);
        Toast.success('已清空' + label + '内容');
        return true;
    }

    function clearCurrentAIPolishChapterState() {
        window.renderNaturalizePanel?.();
    }

    function syncActionContentState(tabName) {
        var tab = tabName || outlineGen().activeTab || 'fineOutline';
        if (isNaturalizeTab(tab)) {
            window.renderNaturalizePanel?.();
            return;
        }
        restoreActionContentDraft(tab);
        restoreActionInputDraft(tab);
    }

    function bindActionTabClearButtons() {
        document.querySelectorAll('.action-tab-clear[data-clear-tab]').forEach(function(button) {
            if (button.dataset.clearBound === '1') return;
            button.dataset.clearBound = '1';
            button.addEventListener('click', function(event) {
                event.preventDefault();
                event.stopPropagation();
                clearActionTabContent(this.dataset.clearTab || outlineGen().activeTab || 'fineOutline');
            });
        });
    }

    function watchActionContentDrafts() {
        ['fineOutline', 'decompose'].forEach(function(tabName) {
            var box = getActionContentBoxByTab(tabName);
            if (!box || box.dataset.actionDraftWatch === '1') return;
            box.dataset.actionDraftWatch = '1';
            var timer = null;
            var scheduleSave = function() {
                if (isOperationTutorialActive()) {
                    clearTimeout(timer);
                    timer = null;
                    return;
                }
                var draft = captureActionContentDraft(tabName);
                if (!draft) return;
                if (!String(draft.text || '').replace(/\u200B/g, '').trim() && draft.hadRuntimeContent) {
                    resetActionContentState(tabName);
                }
                clearTimeout(timer);
                timer = setTimeout(function() {
                    saveActionContentDraft(tabName, draft);
                }, 250);
            };
            box.addEventListener('input', scheduleSave);
            try {
                new MutationObserver(scheduleSave).observe(box, {
                    childList: true,
                    characterData: true,
                    subtree: true
                });
            } catch (_error) {}
        });
        var input = getActionInputElementByTab();
        if (input && input.dataset.actionInputDraftWatch !== '1') {
            input.dataset.actionInputDraftWatch = '1';
            input.addEventListener('input', function() {
                saveActionInputDraft(outlineGen().activeTab || 'fineOutline');
            });
            input.addEventListener('blur', function() {
                saveActionInputDraft(outlineGen().activeTab || 'fineOutline');
            });
        }
        bindActionTabClearButtons();
    }

    function getCurrentBodyPlainText() {
        var resultBox = document.getElementById('resultBox');
        return (resultBox?.innerText || resultBox?.textContent || '').trim();
    }

    function getResultBoxHTMLForChapterSave() {
        return document.getElementById('resultBox')?.innerHTML || '';
    }

    function getMainActionMaxWidth() {
        var panel = document.querySelector('.write-action-panel');
        return panel ? Math.max(260, Math.floor(panel.getBoundingClientRect().width || 0)) : 380;
    }

    window.safeDraftPart = safeDraftPart;
    window.getActionContentBoxByTab = getActionContentBoxByTab;
    window.getActionContentDraftKeys = getActionContentDraftKeys;
    window.getActionInputDraftKeys = getActionInputDraftKeys;
    window.getActionContentClearKey = getActionContentClearKey;
    window.getActionContentClearKeys = getActionContentClearKeys;
    window.isActionContentCleared = isActionContentCleared;
    window.removeActionContentClearMarks = removeActionContentClearMarks;
    window.getCurrentBodyPlainText = getCurrentBodyPlainText;
    if (!window.getMainActionMaxWidth) window.getMainActionMaxWidth = getMainActionMaxWidth;
    window.getResultBoxHTMLForChapterSave = getResultBoxHTMLForChapterSave;
    window.saveActionContentDraft = saveActionContentDraft;
    window.restoreActionContentDraft = restoreActionContentDraft;
    window.saveActionInputDraft = saveActionInputDraft;
    window.restoreActionInputDraft = restoreActionInputDraft;
    window.getActionTabLabel = getActionTabLabel;
    window.removeActionContentDraft = removeActionContentDraft;
    window.resetActionContentState = resetActionContentState;
    window.hasActionContent = hasActionContent;
    window.clearActionTabContent = clearActionTabContent;
    window.clearCurrentAIPolishChapterState = clearCurrentAIPolishChapterState;
    window.bindActionTabClearButtons = bindActionTabClearButtons;
    window.syncActionContentState = syncActionContentState;
    window.watchActionContentDrafts = watchActionContentDrafts;
    window.bindActionPanelSharedUi = watchActionContentDrafts;
    window.ZHIYU_ACTION_PANEL_SHARED_UI_READY = true;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', watchActionContentDrafts, { once: true });
    } else {
        watchActionContentDrafts();
    }
})(window);
// ZHIYU_ACTION_PANEL_SHARED_UI_END

// ===== ????????????? =====
            var ACTION_PANEL_APP_STATE = window.ZHIYU_APP_STATE || window.AppState || {};
            var ACTION_PANEL_UTILS = window.ZHIYU_UTILS || window.Utils || {};
            var ACTION_PANEL_TOAST = window.ZHIYU_TOAST || window.Toast || { warn: function(){}, success: function(){}, error: function(){}, show: function(){} };
            var ACTION_PANEL_CONFIRM = window.ZHIYU_CONFIRM || window.Confirm || { show: function(){ return Promise.resolve(false); } };
            var ACTION_PANEL_MODAL = window.ZHIYU_MODAL || window.Modal || { open: function(){}, close: function(){}, closeAll: function(){} };
            var ACTION_PANEL_FORMAT_CONSTRAINTS = window.ZHIYU_FORMAT_CONSTRAINTS || {};

            function getActionPanelFn(name) {
                return typeof window[name] === 'function' ? window[name] : null;
            }

            async function runActionPanelFn(name) {
                var fn = getActionPanelFn(name);
                if (!fn) {
                    ACTION_PANEL_TOAST.warn('功能尚未初始化完成，请刷新页面后重试');
                    return null;
                }
                return await fn();
            }

            function bindActionPanelButton(el, fnName) {
                if (!el) return;
                el.onclick = function() {
                    return runActionPanelFn(fnName);
                };
            }

            function refreshActionSendTitle() {
                var fn = getActionPanelFn('updateOGSendIdleTitle');
                if (fn) fn();
            }
            var actionTabs = document.querySelectorAll('.action-tab-btn');
            var currentActionTab = ACTION_PANEL_APP_STATE.outlineGen?.activeTab || 'fineOutline';

            // --- Tab 切换 ---
            var ogDragDivider = document.getElementById('ogDragDivider');
            var ogBtnRow = document.getElementById('ogBtnRow');
            var ogInputArea = document.getElementById('ogInputArea');
            var ogFileStacksRow = document.getElementById('ogFileStacksRow');
            var actionBtnsBottom = document.getElementById('actionBtnsBottom');
            var ogBox = document.getElementById('ogContentWrap');
            var dcBox = document.getElementById('dcContentWrap');
            var apBox = document.getElementById('apContentWrap');

            actionTabs.forEach(function(tab) {
                tab.addEventListener('click', function() {
                    var nextTab = this.dataset.tab || 'fineOutline';
                    if (typeof window.saveActionContentDraft === 'function') window.saveActionContentDraft(currentActionTab);
                    if (typeof window.saveActionInputDraft === 'function') window.saveActionInputDraft(currentActionTab);
                    actionTabs.forEach(function(t) { t.classList.remove('active'); });
                    this.classList.add('active');
                    ACTION_PANEL_APP_STATE.outlineGen.activeTab = nextTab;
                    currentActionTab = nextTab;
                    updateActionButtons();
                    // 显示/隐藏对应内容框
                    var isOG = nextTab === 'fineOutline';
                    var isDecompose = nextTab === 'decompose';
                    var isAiPolish = nextTab === 'aiPolish';
                    if (ogBox) ogBox.style.display = isOG ? '' : 'none';
                    if (dcBox) dcBox.style.display = isDecompose ? '' : 'none';
                    if (apBox) apBox.style.display = isAiPolish ? '' : 'none';
                    // 显示/隐藏对应文件堆行
                    if (ogFileStacksRow) ogFileStacksRow.style.display = isOG ? 'flex' : 'none';
                    var dcFileStacksRow = document.getElementById('dcFileStacksRow');
                    if (dcFileStacksRow) dcFileStacksRow.style.display = isDecompose ? 'flex' : 'none';
                    var apFileStacksRow = document.getElementById('apFileStacksRow');
                    if (apFileStacksRow) apFileStacksRow.style.display = isAiPolish ? 'flex' : 'none';
                    // 共用元素
                    if (ogDragDivider) ogDragDivider.style.display = isAiPolish ? 'none' : 'flex';
                    if (ogBtnRow) ogBtnRow.style.display = isAiPolish ? 'none' : 'flex';
                    if (ogInputArea) ogInputArea.style.display = isAiPolish ? 'none' : 'flex';
                    var ogSendBtn = document.getElementById('btnOGSend');
                    if (ogSendBtn) {
                        ogSendBtn.style.display = isAiPolish ? 'none' : '';
                        if (!isAiPolish) refreshActionSendTitle();
                    }
                    var actionModelBtn = document.getElementById('btnActionModelSelect');
                    if (actionModelBtn) actionModelBtn.style.display = isAiPolish ? 'none' : '';
                    if (actionBtnsBottom) actionBtnsBottom.style.display = 'none';
                    // 刷新文件图标
                    if (isOG) { refreshAllOGFileStacks(); }
                    else if (isDecompose) { refreshDecomposeFileStack(); }
                    var templateContext = isDecompose ? 'decompose' : 'fineOutline';
                    var templateId = window.getTemplateContextTemplateId?.(templateContext) || '';
                    var template = (typeof window.gT === 'function' ? window.gT() : []).find(function(item) {
                        return item && item.id === templateId;
                    });
                    if (typeof window.setActionTemplateButtonText === 'function') {
                        window.setActionTemplateButtonText(templateContext, template?.title || '提示词模版');
                    }
                    // 输入框占位符按Tab切换
                    var ogDesc = document.getElementById('ogDescInput');
                    if (ogDesc) {
                        if (isOG) ogDesc.placeholder = '在此输入大纲描述或剧情走向...';
                        else if (isDecompose) ogDesc.placeholder = '在此输入补充指令（可选）...';
                        else ogDesc.placeholder = '';
                    }
                    if (typeof window.syncActionContentState === 'function') {
                        window.syncActionContentState(nextTab);
                    }
                });
            });

            function updateActionButtons() {
                // 三Tab统一使用分割线+按钮行+输入框布局，旧底部按钮永久隐藏
                var bottom = document.getElementById('actionBtnsBottom');
                if (bottom) bottom.style.display = 'none';
                // 更新发送按钮行为
                var sendBtn = document.getElementById('btnOGSend');
                var actionModelBtn = document.getElementById('btnActionModelSelect');
                if (actionModelBtn) actionModelBtn.style.display = '';
                if (sendBtn) {
                    sendBtn.onclick = async function() {
                        var getController = getActionPanelFn('getActiveActionController');
                        if (getController && getController()) {
                            var stopGeneration = getActionPanelFn('stopActiveActionGeneration');
                            if (stopGeneration) stopGeneration();
                            return;
                        }
                        var tab = ACTION_PANEL_APP_STATE.outlineGen.activeTab;
                        if (tab === 'decompose') await runActionPanelFn('triggerDecompose');
                        else if (tab === 'aiPolish') await runActionPanelFn('startNaturalize');
                        else await runActionPanelFn('doOGSend');
                    };
                    refreshActionSendTitle();
                }
                // 三个独立保存/操作按钮
                var ogSave = document.getElementById('btnOGSave');
                bindActionPanelButton(ogSave, 'saveOGToMemory');
                var dcSave = document.getElementById('btnDCSave');
                bindActionPanelButton(dcSave, 'saveDecomposeToMemory');
            }

            function confirmActionToBody() {
                var cb = getActiveContentBox();
                var text = cb?.innerText?.trim();
                if (!text) { ACTION_PANEL_TOAST.warn('操作栏无内容'); return; }
                writePlainTextToResultBox(text, { saveChapter: true, dispatchInput: true });
                ACTION_PANEL_TOAST.success('已替换正文');
            }

            function confirmFineOutlineToBody() {
                var cb = getActiveContentBox();
                var text = cb?.innerText?.trim();
                if (!text) { ACTION_PANEL_TOAST.warn('操作栏无内容，请先生成细纲'); return; }
                confirmActionToBody();
            }

            // --- AI消痕 ---
            // 消痕 I 恢复 AI检测/剧情锁定/AI优化；消痕 II 保留直接优化流程。
