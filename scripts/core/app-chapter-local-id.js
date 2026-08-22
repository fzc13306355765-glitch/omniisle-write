(function(window) {
    'use strict';

    const AppState = window.ZHIYU_APP_STATE || window.AppState;
    const CHAPTER_LOCAL_ID_FIELD = '_localId';
    const _persistedChapterLocalIds = new Set();

    function createChapterLocalId() {
        const cryptoApi = typeof crypto !== 'undefined' ? crypto : null;
        if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
        return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    }

    function ensureChapterLocalId(chapter) {
        if (!chapter) return '';
        if (!chapter[CHAPTER_LOCAL_ID_FIELD]) chapter[CHAPTER_LOCAL_ID_FIELD] = createChapterLocalId();
        return chapter[CHAPTER_LOCAL_ID_FIELD];
    }

    function ensureAllChapterLocalIds(books) {
        let changed = false;
        Object.values(books || {}).forEach(function(book) {
            (book?.volumes || []).forEach(function(volume) {
                (volume?.chapters || []).forEach(function(chapter) {
                    if (!chapter?.[CHAPTER_LOCAL_ID_FIELD]) {
                        ensureChapterLocalId(chapter);
                        changed = true;
                    }
                });
            });
        });
        return changed;
    }

    function markChapterLocalIdsPersisted(books) {
        Object.values(books || {}).forEach(function(book) {
            (book?.volumes || []).forEach(function(volume) {
                (volume?.chapters || []).forEach(function(chapter) {
                    const localId = chapter?.[CHAPTER_LOCAL_ID_FIELD];
                    if (localId) _persistedChapterLocalIds.add(localId);
                });
            });
        });
    }

    function resetPersistedChapterLocalIds() {
        _persistedChapterLocalIds.clear();
    }

    function isChapterLocalIdPersisted(localId) {
        return !!localId && _persistedChapterLocalIds.has(localId);
    }

    function findChapterLocationByLocalId(books, localId, preferredBookName) {
        if (!localId) return null;
        const names = Object.keys(books || {});
        if (preferredBookName && names.includes(preferredBookName)) {
            names.splice(names.indexOf(preferredBookName), 1);
            names.unshift(preferredBookName);
        }
        for (const bookName of names) {
            const volumes = books?.[bookName]?.volumes || [];
            for (let vi = 0; vi < volumes.length; vi += 1) {
                const chapters = volumes[vi]?.chapters || [];
                const ci = chapters.findIndex(function(chapter) {
                    return chapter?.[CHAPTER_LOCAL_ID_FIELD] === localId;
                });
                if (ci >= 0) return { book: bookName, vi, ci, chapter: chapters[ci] };
            }
        }
        return null;
    }

    function getCurrentChapterLocalId(books) {
        const current = AppState?.chapter || {};
        if (!current.book || current.vi < 0 || current.ci < 0) return '';
        if (current.localId) return current.localId;
        const chapter = books?.[current.book]?.volumes?.[current.vi]?.chapters?.[current.ci];
        const localId = ensureChapterLocalId(chapter);
        if (localId) current.localId = localId;
        return localId;
    }

    function restoreCurrentChapterLocation(books, localId, preferredBookName) {
        const location = findChapterLocationByLocalId(books, localId, preferredBookName);
        if (!location || !AppState) return null;
        window.syncBookScopedReferenceState?.(location.book, AppState.chapter?.book || '');
        AppState.chapter = Object.assign({}, AppState.chapter, {
            book: location.book,
            vi: location.vi,
            ci: location.ci,
            localId
        });
        try {
            const scope = window.AccountDataScope;
            localStorage.setItem(scope.key('novel_current_book'), location.book);
            localStorage.setItem(scope.key('novel_current_chapter'), JSON.stringify({
                vi: location.vi,
                ci: location.ci,
                localId
            }));
        } catch (e) {}
        return location;
    }

    function syncCurrentChapterLocation(books) {
        const current = AppState?.chapter || {};
        const localId = getCurrentChapterLocalId(books);
        if (!localId) return null;
        return restoreCurrentChapterLocation(books, localId, current.book);
    }

    Object.assign(window, {
        CHAPTER_LOCAL_ID_FIELD,
        createChapterLocalId,
        ensureChapterLocalId,
        ensureAllChapterLocalIds,
        markChapterLocalIdsPersisted,
        resetPersistedChapterLocalIds,
        isChapterLocalIdPersisted,
        findChapterLocationByLocalId,
        getCurrentChapterLocalId,
        restoreCurrentChapterLocation,
        syncCurrentChapterLocation,
        ZHIYU_CHAPTER_LOCAL_ID_READY: true
    });
})(window);
