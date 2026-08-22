(function(window, document) {
    'use strict';

    const REWRITE_HIGHLIGHT_NAME = 'zhiyu-local-rewrite';
    const REWRITE_HIGHLIGHT_STYLE_ID = 'zhiyuLocalRewriteHighlightStyle';

    function byId(id) {
        return document.getElementById(id);
    }

    function logRewriteStartDetails(options) {
        const {
            bookName,
            vi,
            ci,
            dirLabel,
            linkedFiles
        } = options || {};
        const books = typeof window.gB === 'function' ? window.gB() : {};
        const chapter = books?.[bookName]?.volumes?.[vi]?.chapters?.[ci];
        const chapterNumber = typeof window.calculateChapterNumber === 'function'
            ? window.calculateChapterNumber(books?.[bookName], vi, ci)
            : (ci + 1);
        window.ZHIYU_UTILS?.appendLog?.(
            null,
            '正在重写第' + chapterNumber + '章《' + (chapter?.name || '') + '》（' + (dirLabel || '局部重写') + '）...'
        );

        if (Array.isArray(linkedFiles) && linkedFiles.length > 0 && typeof window.logToFloat === 'function') {
            const escapeHtml = window.ZHIYU_UTILS?.escapeHtml || function(value) { return String(value || ''); };
            window.logToFloat('<div>📎 关联文件：' + linkedFiles.map(function(file) { return escapeHtml(file.name); }).join('、') + '</div>');
        }
    }

    function prepareRewriteStreamingEditor(options) {
        const {
            editor,
            fullContent = '',
            selectionStart = 0,
            selectionEnd = 0,
            professionalFrom = null,
            professionalTo = null,
            range = null,
            bookName = '',
            vi = -1,
            ci = -1,
            updateChapWordCount
        } = options || {};
        if (!editor
            || typeof window.Highlight !== 'function'
            || !window.CSS?.highlights?.set
            || !window.CSS?.highlights?.delete) {
            return null;
        }

        const adapterState = window.ZhiyuEditorAdapter?.getState?.(editor);
        const professionalEditor = adapterState?.editor;
        let session;
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
                currentFrom: professionalFrom,
                currentTo: professionalTo
            };
        } else {
            const currentRange = range?.cloneRange?.();
            if (!currentRange) return null;
            session = {
                mode: 'dom',
                editor,
                originalHTML: editor.innerHTML,
                currentRange
            };
        }
        Object.assign(session, {
            fullContent,
            selectionStart,
            selectionEnd,
            bookName,
            vi,
            ci,
            running: true,
            result: ''
        });
        session.originalSignature = getRewriteContentSignature(session);
        session.expectedSignature = session.originalSignature;
        const handle = Object.freeze({ session });
        session.handle = handle;
        if (!refreshRewriteHighlight(session)) return null;

        editor.style.background = '';
        editor.setAttribute('contenteditable', 'false');
        if (typeof updateChapWordCount === 'function') updateChapWordCount('');
        window._rewriteSession = session;
        return handle;
    }

    function ensureRewriteHighlightStyle() {
        if (document.getElementById(REWRITE_HIGHLIGHT_STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = REWRITE_HIGHLIGHT_STYLE_ID;
        style.textContent = `::highlight(${REWRITE_HIGHLIGHT_NAME}){background:#fff3cd;color:inherit;}`;
        document.head?.appendChild?.(style);
    }

    function clearRewriteHighlight() {
        window.CSS?.highlights?.delete?.(REWRITE_HIGHLIGHT_NAME);
    }

    function createRewriteProfessionalRange(session) {
        const view = session?.professionalEditor?.view;
        if (!view?.domAtPos) return null;
        try {
            const start = view.domAtPos(session.currentFrom, 1);
            const end = view.domAtPos(session.currentTo, -1);
            const range = document.createRange();
            range.setStart(start.node, start.offset);
            range.setEnd(end.node, end.offset);
            return range;
        } catch (_error) {
            return null;
        }
    }

    function refreshRewriteHighlight(session) {
        const range = session?.mode === 'professional'
            ? createRewriteProfessionalRange(session)
            : session?.currentRange?.cloneRange?.();
        if (!range || range.collapsed) return false;
        try {
            ensureRewriteHighlightStyle();
            clearRewriteHighlight();
            window.CSS.highlights.set(REWRITE_HIGHLIGHT_NAME, new window.Highlight(range));
            if (session.mode === 'dom') session.currentRange = range.cloneRange();
            return true;
        } catch (_error) {
            clearRewriteHighlight();
            return false;
        }
    }

    function getRewriteContentSignature(session) {
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

    function rewriteContentMatchesExpected(session) {
        return !!session
            && getRewriteContentSignature(session) === session.expectedSignature;
    }

    function restoreRewriteSessionOriginal(session) {
        if (!session?.editor) return false;
        try {
            if (session.mode === 'professional' && session.originalDocJson) {
                const restored = session.professionalEditor?.commands?.setContent?.(
                    session.originalDocJson,
                    { emitUpdate: false, errorOnInvalidContent: false }
                );
                if (restored === false) return false;
            } else if (session.mode === 'dom') {
                session.editor.innerHTML = session.originalHTML || '';
            } else {
                return false;
            }
            session.expectedSignature = session.originalSignature;
            session.sourceChanged = false;
            return getRewriteContentSignature(session) === session.originalSignature;
        } catch (_error) {
            return false;
        }
    }

    function replaceRewriteProfessionalSelection(session, rewrittenText) {
        const professionalEditor = session?.professionalEditor;
        const from = session?.currentFrom;
        const to = session?.currentTo;
        if (!professionalEditor?.commands?.insertContentAt
            || !Number.isInteger(from)
            || !Number.isInteger(to)
            || to <= from) {
            return false;
        }
        const lines = rewrittenText.split('\n');
        const content = [];
        lines.forEach(function(line, index) {
            if (line) content.push({ type: 'text', text: line });
            if (index < lines.length - 1) content.push({ type: 'hardBreak' });
        });
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
            replaced = professionalEditor.commands.insertContentAt(
                { from, to },
                content.length === 1 ? content[0] : content,
                { updateSelection: false, parseOptions: { preserveWhitespace: 'full' }, errorOnInvalidContent: false }
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

    function replaceRewriteDomSelection(session, rewrittenText) {
        const range = session?.currentRange;
        if (!range || !session.editor?.contains?.(range.commonAncestorContainer)) return false;
        try {
            range.deleteContents();
            const replacement = document.createTextNode(rewrittenText);
            range.insertNode(replacement);
            const updatedRange = document.createRange();
            updatedRange.selectNodeContents(replacement);
            session.currentRange = updatedRange;
            return true;
        } catch (_error) {
            return false;
        }
    }

    function applyRewriteResult(options) {
        const rewrittenText = String(options?.result || '').trim();
        const handle = options?.handle;
        const session = window._rewriteSession;
        const chapter = (window.ZHIYU_APP_STATE || window.AppState || {}).chapter || {};
        if (!rewrittenText
            || !handle
            || !session
            || session.handle !== handle
            || chapter.book !== session.bookName
            || chapter.vi !== session.vi
            || chapter.ci !== session.ci) {
            return false;
        }
        if (!rewriteContentMatchesExpected(session)) {
            session.sourceChanged = true;
            session.running = false;
            return false;
        }
        const replaced = session.mode === 'professional'
            ? replaceRewriteProfessionalSelection(session, rewrittenText)
            : replaceRewriteDomSelection(session, rewrittenText);
        if (!replaced) return false;
        if (!refreshRewriteHighlight(session)) {
            restoreRewriteSessionOriginal(session);
            return false;
        }
        session.result = rewrittenText;
        session.running = false;
        session.sourceChanged = false;
        session.expectedSignature = getRewriteContentSignature(session);
        session.editor.style.background = '';
        session.editor.setAttribute('contenteditable', 'true');
        return true;
    }

    function cancelRewriteSession(handle) {
        const session = window._rewriteSession;
        if (!session || (handle && session.handle !== handle)) return false;
        clearRewriteHighlight();
        const chapter = (window.ZHIYU_APP_STATE || window.AppState || {}).chapter || {};
        if (chapter.book === session.bookName && chapter.vi === session.vi && chapter.ci === session.ci) {
            session.editor.style.background = '';
            session.editor.setAttribute('contenteditable', 'true');
        }
        window._rewriteSession = null;
        return true;
    }

    function finalizeRewriteBeforeChapterSave() {
        const session = window._rewriteSession;
        if (!session || session.running) return false;
        return cancelRewriteSession(session.handle);
    }

    function bindRewriteSaveFinalizers() {
        byId('btnSaveNewChapter')?.addEventListener('click', finalizeRewriteBeforeChapterSave, true);
        byId('btnConfirm')?.addEventListener('click', finalizeRewriteBeforeChapterSave, true);
    }

    function setRewriteBusyState() {
        const btnStop = byId('btnStop');
        if (btnStop) {
            btnStop.disabled = false;
            btnStop.textContent = '停止生成';
        }
        const btnGen = byId('btnGen');
        if (btnGen) btnGen.disabled = true;
        const btnRewrite = byId('btnRewrite');
        if (btnRewrite) {
            btnRewrite.disabled = true;
            btnRewrite.textContent = '重写中...';
        }
    }

    function resetRewriteBusyState() {
        const btnStop = byId('btnStop');
        if (btnStop) {
            btnStop.disabled = true;
            btnStop.textContent = '暂未生成';
        }
        const btnGen = byId('btnGen');
        if (btnGen) btnGen.disabled = false;
        const btnRewrite = byId('btnRewrite');
        if (btnRewrite) {
            btnRewrite.disabled = false;
            btnRewrite.textContent = '局部重写';
        }
    }

    function restoreRewriteOriginalContent(options) {
        const { handle } = options || {};
        return cancelRewriteSession(handle);
    }

    window.logRewriteStartDetails = logRewriteStartDetails;
    window.prepareRewriteStreamingEditor = prepareRewriteStreamingEditor;
    window.setRewriteBusyState = setRewriteBusyState;
    window.resetRewriteBusyState = resetRewriteBusyState;
    window.restoreRewriteOriginalContent = restoreRewriteOriginalContent;
    window.restoreRewriteSessionOriginal = restoreRewriteSessionOriginal;
    window.applyRewriteResult = applyRewriteResult;
    window.cancelRewriteSession = cancelRewriteSession;
    window.finalizeRewriteBeforeChapterSave = finalizeRewriteBeforeChapterSave;
    window.clearRewriteHighlight = clearRewriteHighlight;
    window.ZHIYU_REWRITE_PROGRESS_LOG_READY = true;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindRewriteSaveFinalizers, { once: true });
    } else {
        bindRewriteSaveFinalizers();
    }
})(window, document);
