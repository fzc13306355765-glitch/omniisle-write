(function(window, document) {
    'use strict';

    const POLISH_HIGHLIGHT_NAME = 'zhiyu-local-polish';
    const POLISH_HIGHLIGHT_STYLE_ID = 'zhiyuLocalPolishHighlightStyle';

    function getChapterIdentity() {
        return (window.ZHIYU_APP_STATE || window.AppState || {}).chapter || {};
    }

    function isCurrentSession(session) {
        const chapter = getChapterIdentity();
        return !!session
            && chapter.book === session.bookName
            && chapter.vi === session.vi
            && chapter.ci === session.ci;
    }

    function supportsSafeHighlight() {
        return typeof window.Highlight === 'function'
            && !!window.CSS?.highlights
            && typeof window.CSS.highlights.set === 'function'
            && typeof window.CSS.highlights.delete === 'function';
    }

    function ensurePolishHighlightStyle() {
        if (document.getElementById(POLISH_HIGHLIGHT_STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = POLISH_HIGHLIGHT_STYLE_ID;
        style.textContent = `::highlight(${POLISH_HIGHLIGHT_NAME}){background:#fff3cd;color:inherit;}`;
        document.head?.appendChild?.(style);
    }

    function clearPolishSelectionHighlight() {
        window.CSS?.highlights?.delete?.(POLISH_HIGHLIGHT_NAME);
    }

    function createDomRangeFromTextOffsets(root, start, end) {
        if (!root || !Number.isInteger(start) || !Number.isInteger(end) || end <= start) return null;
        const showText = window.NodeFilter?.SHOW_TEXT ?? 4;
        const walker = document.createTreeWalker?.(root, showText);
        if (!walker) return null;
        let offset = 0;
        let startNode = null;
        let startOffset = 0;
        let endNode = null;
        let endOffset = 0;
        let node = walker.nextNode();
        while (node) {
            const length = String(node.nodeValue ?? node.textContent ?? '').length;
            if (!startNode && start >= offset && start <= offset + length) {
                startNode = node;
                startOffset = start - offset;
            }
            if (end >= offset && end <= offset + length) {
                endNode = node;
                endOffset = end - offset;
                break;
            }
            offset += length;
            node = walker.nextNode();
        }
        if (!startNode || !endNode) return null;
        try {
            const range = document.createRange();
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);
            return range;
        } catch (_error) {
            return null;
        }
    }

    function createProfessionalDomRange(session) {
        const view = session?.professionalEditor?.view;
        const from = session?.currentFrom;
        const to = session?.currentTo;
        if (!view?.domAtPos || !Number.isInteger(from) || !Number.isInteger(to) || to <= from) return null;
        try {
            const start = view.domAtPos(from, 1);
            const end = view.domAtPos(to, -1);
            const range = document.createRange();
            range.setStart(start.node, start.offset);
            range.setEnd(end.node, end.offset);
            return range;
        } catch (_error) {
            return null;
        }
    }

    function refreshPolishSelectionHighlight(session, preferredRange) {
        if (!supportsSafeHighlight() || !session) return false;
        const range = session.mode === 'professional'
            ? createProfessionalDomRange(session)
            : preferredRange?.cloneRange?.() || session.currentRange?.cloneRange?.();
        if (!range || range.collapsed) return false;
        try {
            ensurePolishHighlightStyle();
            clearPolishSelectionHighlight();
            window.CSS.highlights.set(POLISH_HIGHLIGHT_NAME, new window.Highlight(range));
            if (session.mode === 'dom') session.currentRange = range.cloneRange();
            return true;
        } catch (_error) {
            clearPolishSelectionHighlight();
            return false;
        }
    }

    function preparePolishSelection(options = {}) {
        const {
            editor = null,
            selectedText = '',
            fullContent = '',
            beforeText = '',
            afterText = '',
            selectionStart = 0,
            selectionEnd = 0,
            professionalFrom = null,
            professionalTo = null,
            range = null,
            bookName = '',
            vi = -1,
            ci = -1
        } = options;
        if (!editor || !selectedText || !supportsSafeHighlight()) return null;

        const adapterState = window.ZhiyuEditorAdapter?.getState?.(editor);
        const professionalEditor = adapterState?.editor;
        let session = null;
        if (professionalEditor?.state?.doc) {
            if (!Number.isInteger(professionalFrom)
                || !Number.isInteger(professionalTo)
                || professionalTo <= professionalFrom) {
                return null;
            }
            session = {
                mode: 'professional',
                editor,
                professionalEditor,
                originalDocJson: professionalEditor.state.doc.toJSON(),
                professionalFrom,
                professionalTo,
                currentFrom: professionalFrom,
                currentTo: professionalTo
            };
        } else {
            const currentRange = range?.cloneRange?.()
                || createDomRangeFromTextOffsets(editor, selectionStart, selectionEnd);
            if (!currentRange) return null;
            session = {
                mode: 'dom',
                editor,
                originalHTML: editor.innerHTML,
                currentRange
            };
        }

        Object.assign(session, {
            selectedText,
            result: '',
            running: true,
            fullContent,
            beforeText,
            afterText,
            selectionStart,
            selectionEnd,
            bookName,
            vi,
            ci
        });
        session.originalSignature = getSessionContentSignature(session);
        session.expectedSignature = session.originalSignature;
        const handle = Object.freeze({ session });
        session.handle = handle;
        if (!refreshPolishSelectionHighlight(session, session.currentRange)) return null;

        editor.setAttribute('contenteditable', 'false');
        window._polishOriginal = selectedText;
        window._polishResult = null;
        window._polishMark = null;
        window._polishRange = session.currentRange || null;
        window._polishSession = session;
        return handle;
    }

    function replaceProfessionalSelection(session, polishedText) {
        const professionalEditor = session?.professionalEditor;
        const from = session?.currentFrom;
        const to = session?.currentTo;
        if (!professionalEditor?.commands?.insertContentAt
            || !Number.isInteger(from)
            || !Number.isInteger(to)
            || to <= from) {
            return false;
        }

        let mappedRange = null;
        const onTransaction = function({ transaction }) {
            if (!transaction?.docChanged || !transaction.mapping) return;
            mappedRange = {
                from: transaction.mapping.map(from, -1),
                to: transaction.mapping.map(to, 1)
            };
        };
        professionalEditor.on?.('transaction', onTransaction);
        let replaced = false;
        try {
            const lines = polishedText.split('\n');
            const replacementContent = [];
            lines.forEach(function(line, index) {
                if (line) replacementContent.push({ type: 'text', text: line });
                if (index < lines.length - 1) replacementContent.push({ type: 'hardBreak' });
            });
            replaced = professionalEditor.commands.insertContentAt(
                { from, to },
                replacementContent.length === 1 ? replacementContent[0] : replacementContent,
                {
                    updateSelection: false,
                    parseOptions: { preserveWhitespace: 'full' },
                    errorOnInvalidContent: false
                }
            ) !== false;
        } catch (_error) {
            replaced = false;
        } finally {
            professionalEditor.off?.('transaction', onTransaction);
        }
        if (!replaced
            || !Number.isInteger(mappedRange?.from)
            || !Number.isInteger(mappedRange?.to)
            || mappedRange.to <= mappedRange.from) {
            return false;
        }
        session.currentFrom = mappedRange.from;
        session.currentTo = mappedRange.to;
        return true;
    }

    function replaceDomSelection(session, polishedText) {
        const range = session?.currentRange;
        if (!range || !session.editor?.contains?.(range.commonAncestorContainer)) return false;
        try {
            range.deleteContents();
            const replacement = document.createTextNode(polishedText);
            range.insertNode(replacement);
            const updatedRange = document.createRange();
            updatedRange.selectNodeContents(replacement);
            session.currentRange = updatedRange;
            return true;
        } catch (_error) {
            return false;
        }
    }

    function getSessionContentSignature(session) {
        if (!session?.editor) return '';
        if (session.mode === 'professional') {
            try {
                return JSON.stringify(session.professionalEditor?.state?.doc?.toJSON?.() || null);
            } catch (_error) {
                return '';
            }
        }
        return String(session.editor.innerHTML || '');
    }

    function sessionContentMatchesExpected(session) {
        return !!session
            && typeof session.expectedSignature === 'string'
            && getSessionContentSignature(session) === session.expectedSignature;
    }

    function restoreSessionOriginal(session, options = {}) {
        if (!session?.editor) return false;
        if (!options.force && !sessionContentMatchesExpected(session)) {
            session.sourceChanged = true;
            session.running = false;
            return false;
        }
        if (session.mode === 'professional' && session.originalDocJson) {
            session.professionalEditor?.commands?.setContent?.(
                session.originalDocJson,
                { emitUpdate: false, errorOnInvalidContent: false }
            );
        } else if (session.mode === 'dom') {
            session.editor.innerHTML = session.originalHTML || '';
        }
        session.expectedSignature = session.originalSignature;
        session.sourceChanged = false;
        return true;
    }

    function applyPolishResult(options = {}) {
        const { result = '', handle = null } = options;
        const polishedText = String(result || '').trim();
        const session = window._polishSession;
        if (!polishedText
            || !handle
            || !session
            || session.handle !== handle
            || !isCurrentSession(session)) {
            return false;
        }
        if (!sessionContentMatchesExpected(session)) {
            session.sourceChanged = true;
            session.running = false;
            return false;
        }

        const replaced = session.mode === 'professional'
            ? replaceProfessionalSelection(session, polishedText)
            : replaceDomSelection(session, polishedText);
        if (!replaced || !refreshPolishSelectionHighlight(session, session.currentRange)) {
            restoreSessionOriginal(session, { force: replaced });
            return false;
        }

        window._polishResult = polishedText;
        window._polishRange = session.currentRange || null;
        session.result = polishedText;
        session.running = false;
        session.sourceChanged = false;
        session.expectedSignature = getSessionContentSignature(session);
        session.editor.setAttribute('contenteditable', 'false');
        window.updateChapWordCount?.(session.editor.textContent || '');
        return true;
    }

    function showPolishResultActions() {
        const btnGen = document.getElementById('btnGen');
        const btnConfirm = document.getElementById('btnConfirm');
        const btnRegen = document.getElementById('btnRegen');
        const btnRetry = document.getElementById('btnRetry');

        if (btnGen) btnGen.style.display = 'none';

        if (btnConfirm) {
            btnConfirm.style.display = 'inline-block';
            window.resetConfirmUseVisual?.(btnConfirm);
            btnConfirm.textContent = '确定润色';
            btnConfirm.title = '采用当前局部润色结果';
        }

        if (btnRegen) {
            btnRegen.style.display = 'inline-block';
            btnRegen.textContent = '🔄 重新润色';
            btnRegen.dataset.mode = 'repolish';
        }

        if (btnRetry) {
            btnRetry.style.display = 'inline-block';
            btnRetry.textContent = '❌ 放弃润色';
            btnRetry.dataset.mode = 'cancelPolish';
        }
    }

    window.preparePolishSelection = preparePolishSelection;
    window.applyPolishResult = applyPolishResult;
    window.showPolishResultActions = showPolishResultActions;
    window.clearPolishSelectionHighlight = clearPolishSelectionHighlight;
    window.refreshPolishSelectionHighlight = refreshPolishSelectionHighlight;
    window.createPolishDomRangeFromTextOffsets = createDomRangeFromTextOffsets;
    window.restorePolishSessionOriginal = restoreSessionOriginal;
    window.getLocalEditContentSignature = getSessionContentSignature;
    window.localEditSessionContentMatchesExpected = sessionContentMatchesExpected;
    window.replaceLocalEditProfessionalSelection = replaceProfessionalSelection;
    window.replaceLocalEditDomSelection = replaceDomSelection;
    window.ZHIYU_POLISH_PROGRESS_LOG_READY = true;
})(window, document);
