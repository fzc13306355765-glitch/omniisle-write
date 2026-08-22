(function(window) {
    'use strict';

    function getState() {
        return window.ZHIYU_APP_STATE || window.AppState || {};
    }

    function getBooks() {
        return typeof window.gB === 'function' ? (window.gB() || {}) : {};
    }

    function getActiveUid() {
        return String(window.AccountDataScope?.getActiveUid?.() || getState().auth?.uid || 'local-community-user');
    }

    function captureTarget() {
        const state = getState();
        const current = state.chapter || {};
        if (!current.book || current.vi < 0 || current.ci < 0) return null;
        const books = getBooks();
        const chapter = books[current.book]?.volumes?.[current.vi]?.chapters?.[current.ci];
        if (!chapter) return null;
        if (!chapter._localId && typeof window.ensureChapterLocalId === 'function') {
            window.ensureChapterLocalId(chapter);
        }
        const editor = document.getElementById('resultBox');
        const content = editor ? editor.innerHTML : String(chapter.content || '');
        return {
            uid: getActiveUid(),
            book: current.book,
            vi: current.vi,
            ci: current.ci,
            localId: String(chapter._localId || ''),
            title: chapter.name || chapter.title || ('第' + (current.ci + 1) + '章'),
            content,
            version: Number(chapter._version || 1),
            wordCount: typeof window.countWords === 'function'
                ? window.countWords(content)
                : Number(chapter.wordCount || 0)
        };
    }

    function locateTarget(target, suppliedBooks) {
        if (!target?.book) return null;
        const books = suppliedBooks || getBooks();
        const book = books[target.book];
        if (!book) return null;
        const direct = book.volumes?.[target.vi]?.chapters?.[target.ci];
        if (direct && (!target.localId || String(direct._localId || '') === String(target.localId))) {
            return { books, book, chapter: direct, vi: target.vi, ci: target.ci };
        }
        for (let vi = 0; vi < (book.volumes || []).length; vi += 1) {
            const chapters = book.volumes[vi]?.chapters || [];
            for (let ci = 0; ci < chapters.length; ci += 1) {
                if (target.localId && String(chapters[ci]?._localId || '') === String(target.localId)) {
                    return { books, book, chapter: chapters[ci], vi, ci };
                }
            }
        }
        return null;
    }

    function isTargetActive(target) {
        if (!target || getActiveUid() !== String(target.uid || '')) return false;
        const located = locateTarget(target);
        const current = getState().chapter || {};
        return !!located
            && current.book === target.book
            && current.vi === located.vi
            && current.ci === located.ci;
    }

    function normalizeContent(content) {
        const utils = window.ZHIYU_UTILS || window.Utils;
        const normalized = typeof utils?.sanitizeHTML === 'function'
            ? utils.sanitizeHTML(content || '')
            : String(content || '');
        return normalized.replace(/<br(\s[^>]*)?><\/br>/gi, '<br$1>');
    }

    function comparableContent(content) {
        return normalizeContent(content)
            .replace(/<(?:p|div)>/gi, '<p>')
            .replace(/<\/(?:p|div)>/gi, '</p>')
            .replace(/<br\s*\/?>/gi, '<br>')
            .replace(/>\s+</g, '><')
            .trim();
    }

    window.ZHIYU_HISTORY_VERSION_CORE = Object.freeze({
        captureTarget,
        locateTarget,
        isTargetActive,
        isSameAccount(target) {
            return !!target && getActiveUid() === String(target.uid || '');
        },
        normalizeContent,
        comparableContent,
        getActiveUid
    });
    window.ZHIYU_HISTORY_VERSION_CORE_READY = true;
})(window);
