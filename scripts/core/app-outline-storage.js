// Split project outline storage module.
// Saves and reads the current book outline without changing generation logic.
(function(window) {
    'use strict';

    const AppState = window.ZHIYU_APP_STATE || {};
    const StorageService = window.ZHIYU_STORAGE_SERVICE;
    const gB = window.gB || function() { return StorageService ? StorageService.getBooks() : {}; };
    const sB = window.sB || function(books) { if (StorageService) StorageService.saveBooks(books); };

    function getCurrentChapterName(bookName) {
        if (AppState.chapter?.book === bookName) {
            const books = gB();
            const ch = books[bookName]?.volumes?.[AppState.chapter.vi]?.chapters?.[AppState.chapter.ci];
            return ch?.name || '';
        }
        return '';
    }

    async function saveOutlineToBook(outlineContent) {
        if (!AppState.chapter?.book || !outlineContent) return false;
        const books = gB();
        const book = books[AppState.chapter.book];
        if (!book) return false;
        const previousOutline = book.outline ? { ...book.outline } : null;
        const hadMemoryPolicy = Object.prototype.hasOwnProperty.call(book, 'memoryPolicy');
        const previousMemoryPolicy = hadMemoryPolicy ? { ...(book.memoryPolicy || {}) } : null;
        if (!book.outline) book.outline = {};
        book.outline.content = outlineContent;
        book.outline.updatedAt = new Date().toISOString();
        if (typeof window.setEventIndexPolicy === 'function') {
            window.setEventIndexPolicy(book, false, 'normal-outline');
        }
        function rollbackOutlineSave() {
            if (previousOutline) book.outline = previousOutline;
            else delete book.outline;
            if (hadMemoryPolicy) book.memoryPolicy = previousMemoryPolicy;
            else delete book.memoryPolicy;
        }
        try {
            const saved = await Promise.resolve(sB(books));
            if (saved === false) {
                rollbackOutlineSave();
                return false;
            }
        } catch (error) {
            rollbackOutlineSave();
            throw error;
        }
        if (typeof window.updateChapWordCount === 'function') {
            window.updateChapWordCount(outlineContent);
        }
        return true;
    }

    function loadBookOutline(bookName) {
        const books = gB();
        const book = books[bookName];
        if (!book?.outline?.content) return null;
        return book.outline.content;
    }

    window.getCurrentChapterName = getCurrentChapterName;
    window.saveOutlineToBook = saveOutlineToBook;
    window.loadBookOutline = loadBookOutline;
    window.ZHIYU_OUTLINE_STORAGE_READY = true;
})(window);
