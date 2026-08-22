(function(window, document) {
    'use strict';

    let rewriteDirection = 'tail';

    function getAppState() {
        return window.ZHIYU_APP_STATE || window.AppState || {};
    }

    function getModal() {
        return window.ZHIYU_MODAL || window.Modal || {
            close: function() {}
        };
    }

    function getToast() {
        return window.Toast || {
            warn: function() {}
        };
    }

    function setTextById(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function setValueById(id, value) {
        const el = document.getElementById(id);
        if (el) el.value = value;
    }

    function getLinkedFilesCount() {
        const state = getAppState();
        const files = state.gen && Array.isArray(state.gen.linkedFiles) ? state.gen.linkedFiles : [];
        return files.length;
    }

    function updateRewriteLinkedFileCount() {
        const countEl = document.getElementById('rwLinkedFileCount');
        if (!countEl) return;
        const count = getLinkedFilesCount();
        countEl.textContent = count > 0 ? '已选择 ' + count + ' 项' : '未选择';
    }

    function setRewriteDirection(dir) {
        rewriteDirection = ['head', 'mid', 'tail'].includes(dir) ? dir : 'tail';
        const items = document.querySelectorAll('#rwDirectionGroup .gen-option');
        items.forEach(function(el) {
            el.classList.toggle('is-selected', el.dataset.direction === rewriteDirection);
            el.style.removeProperty('background');
            el.style.removeProperty('color');
        });
    }

    function getRewriteDirection() {
        return rewriteDirection;
    }

    function openLinkMemoryForRewrite() {
        if (typeof window.openLinkMemorySelector === 'function') {
            window.openLinkMemorySelector();
        }
    }

    function updatePrevChapterHint() {
        const prevEnd = typeof window.getPrevChapterEnd === 'function' ? window.getPrevChapterEnd() : '';
        const refEl = document.getElementById('rwRefPrevChapter');
        if (!refEl) return;
        if (prevEnd) {
            refEl.textContent = '✅ 已参考上一章';
            refEl.style.color = '#27ae60';
        } else {
            refEl.textContent = '（当前为第一章，无上一章参考）';
            refEl.style.color = '#8b8d98';
        }
    }

    function isNodeInsideEditor(editor, node) {
        return Boolean(editor && node && (node === editor || editor.contains(node)));
    }

    function getTextOffsetAtRangeBoundary(editor, container, offset) {
        const probe = document.createRange();
        probe.selectNodeContents(editor);
        probe.setEnd(container, offset);
        return probe.toString().length;
    }

    function getProfessionalRangeText(doc, from, to) {
        if (!doc || typeof doc.nodesBetween !== 'function') return null;
        const range = { from, to };
        let text = '';
        doc.nodesBetween(from, to, function(node, pos, parent, index) {
            if (node.isBlock && pos > from) text += '\n';
            const serializer = node.type?.spec?.toText;
            if (typeof serializer === 'function') {
                if (parent) text += serializer({ node, pos, parent, index, range }) || '';
                return false;
            }
            if (node.isText) {
                const start = Math.max(from, pos) - pos;
                text += String(node.text || '').slice(start, to - pos);
            }
        });
        return text;
    }

    function captureProfessionalRewriteSelection(editor, adapterState) {
        const professionalEditor = adapterState?.editor;
        const editorState = professionalEditor?.state;
        const selection = editorState?.selection;
        const doc = editorState?.doc;
        if (!selection || selection.empty || !doc) return null;

        const fullContent = editor.textContent || '';
        const fullModelText = getProfessionalRangeText(doc, 0, doc.content?.size ?? 0);
        const beforeText = getProfessionalRangeText(doc, 0, selection.from);
        const selectedText = getProfessionalRangeText(doc, selection.from, selection.to);
        if (fullModelText === null
            || beforeText === null
            || selectedText === null
            || fullModelText !== fullContent
            || !selectedText.trim()) {
            return null;
        }

        const selectionStart = beforeText.length;
        const selectionEnd = selectionStart + selectedText.length;
        if (selectionEnd > fullContent.length
            || fullContent.slice(selectionStart, selectionEnd) !== selectedText) {
            return null;
        }

        return {
            selectedText,
            fullContent,
            selectionStart,
            selectionEnd,
            professionalFrom: selection.from,
            professionalTo: selection.to,
            range: null
        };
    }

    function captureRewriteSelection(editor, selection) {
        if (!editor || !selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
        const range = selection.getRangeAt(0);
        if (!isNodeInsideEditor(editor, range.startContainer)
            || !isNodeInsideEditor(editor, range.endContainer)) {
            return null;
        }

        const adapterState = window.ZhiyuEditorAdapter?.getState?.(editor);
        if (adapterState) {
            // 专业编辑器必须使用自身文档模型；解析失败时安全拒绝，绝不回退到 DOM 猜位置。
            const professionalSelection = captureProfessionalRewriteSelection(editor, adapterState);
            if (professionalSelection) professionalSelection.range = range.cloneRange?.() || null;
            return professionalSelection;
        }

        const fullContent = editor.textContent || '';
        try {
            const selectionStart = getTextOffsetAtRangeBoundary(editor, range.startContainer, range.startOffset);
            const selectionEnd = getTextOffsetAtRangeBoundary(editor, range.endContainer, range.endOffset);
            if (selectionStart < 0 || selectionEnd <= selectionStart || selectionEnd > fullContent.length) return null;
            const selectedText = fullContent.slice(selectionStart, selectionEnd);
            if (!selectedText.trim()) return null;
            return {
                selectedText,
                fullContent,
                selectionStart,
                selectionEnd,
                range: range.cloneRange()
            };
        } catch (_error) {
            return null;
        }
    }

    function openRewriteModal() {
        const state = getAppState();
        const toast = getToast();

        if (!state.chapter || !state.chapter.book) {
            toast.warn('请先选择或创建一个章节');
            return;
        }
        if (state.chapter.vi < 0) {
            toast.warn('参考文件不能重写，请先选择一个正式章节');
            return;
        }

        const running = Object.keys(window.generationTasks || {}).length;
        if (running > 0) {
            toast.warn('当前有章节正在生成中，请等待完成');
            return;
        }

        const editor = document.getElementById('resultBox');
        const selection = window.getSelection();
        const rewriteSelection = captureRewriteSelection(editor, selection);
        if (!rewriteSelection) {
            toast.warn('请先在正文中选中要重写的段落');
            return;
        }
        const selectedLength = rewriteSelection.selectedText.trim().length;
        if (selectedLength < 50) {
            toast.warn('选中内容过少（当前 ' + selectedLength + ' 字），至少需要 50 字');
            return;
        }

        state.rewrite = rewriteSelection;

        setRewriteDirection('tail');
        updateRewriteLinkedFileCount();
        setValueById('rwTargetWords', 2000);
        setValueById('rwPlotDescription', '');
        updatePrevChapterHint();
        getModal().open('rewriteModal');
    }

    function closeRewriteModal() {
        getModal().close('rewriteModal');
    }

    function bindRewriteModalUi() {
        const rewriteButton = document.getElementById('btnRewrite');
        if (rewriteButton && rewriteButton.dataset.rewriteModalOpenBound !== '1') {
            rewriteButton.dataset.rewriteModalOpenBound = '1';
            rewriteButton.addEventListener('click', openRewriteModal);
        }

        const confirmMemoryButton = document.getElementById('btnConfirmMemoryLink');
        if (confirmMemoryButton && confirmMemoryButton.dataset.rewriteLinkedCountBound !== '1') {
            confirmMemoryButton.dataset.rewriteLinkedCountBound = '1';
            confirmMemoryButton.addEventListener('click', updateRewriteLinkedFileCount);
        }

        const cancelButton = document.getElementById('btnRWCancel');
        if (cancelButton && cancelButton.dataset.rewriteModalCancelBound !== '1') {
            cancelButton.dataset.rewriteModalCancelBound = '1';
            cancelButton.addEventListener('click', closeRewriteModal);
        }
    }

    window.ZHIYU_REWRITE_MODAL_UI = {
        bindRewriteModalUi,
        setRewriteDirection,
        getRewriteDirection,
        captureRewriteSelection,
        captureProfessionalRewriteSelection,
        getProfessionalRangeText,
        openLinkMemoryForRewrite,
        openRewriteModal,
        updateRewriteLinkedFileCount,
        closeRewriteModal
    };
    window.setRewriteDirection = setRewriteDirection;
    window.openLinkMemoryForRewrite = openLinkMemoryForRewrite;

    bindRewriteModalUi();
})(window, document);
