(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AccountDataScope = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    let activeUid = 'guest';

    function normalizeUid(uid) {
        const value = String(uid || '').trim();
        return (value || 'guest').replace(/[^\w.-]/g, '_').slice(0, 128) || 'guest';
    }

    function setActiveUid(uid) {
        activeUid = normalizeUid(uid);
        return activeUid;
    }

    function getActiveUid() { return activeUid; }

    function key(base, uid) {
        return String(base || '') + '__uid_' + normalizeUid(uid === undefined ? activeUid : uid);
    }

    function stampBooks(books, uid) {
        const ownerUid = normalizeUid(uid === undefined ? activeUid : uid);
        Object.values(books || {}).forEach(function(book) {
            if (book && typeof book === 'object' && !book._ownerUid) book._ownerUid = ownerUid;
        });
        return books || {};
    }

    function hasForeignBooks(books, uid) {
        const ownerUid = normalizeUid(uid === undefined ? activeUid : uid);
        return Object.values(books || {}).some(function(book) {
            return !!book && typeof book === 'object' && !!book._ownerUid && book._ownerUid !== ownerUid;
        });
    }

    function filterOwnedBooks(books, uid) {
        const ownerUid = normalizeUid(uid === undefined ? activeUid : uid);
        const filtered = {};
        Object.entries(books || {}).forEach(function(entry) {
            const name = entry[0];
            const book = entry[1];
            if (!book || typeof book !== 'object') return;
            if (book._ownerUid && book._ownerUid !== ownerUid) return;
            if (!book._ownerUid) book._ownerUid = ownerUid;
            filtered[name] = book;
        });
        return filtered;
    }

    function canSyncBook(book, uid) {
        const ownerUid = normalizeUid(uid === undefined ? activeUid : uid);
        return ownerUid !== 'guest' && !!book && book._ownerUid === ownerUid;
    }

    function clone(value) {
        if (value === undefined) return undefined;
        return JSON.parse(JSON.stringify(value));
    }

    function detachCloudIds(book) {
        if (!book || typeof book !== 'object') return book;
        delete book._bid;
        (book.volumes || []).forEach(function(volume) {
            (volume && volume.chapters || []).forEach(function(chapter) {
                if (!chapter || typeof chapter !== 'object') return;
                delete chapter._cid;
                delete chapter._version;
            });
        });
        return book;
    }

    function nextImportName(name, books, memBooks) {
        const base = String(name || '未命名作品').trim() || '未命名作品';
        if (!books[base] && !memBooks[base]) return base;
        let candidate = base + '（本机旧缓存）';
        let index = 2;
        while (books[candidate] || memBooks[candidate]) candidate = base + '（本机旧缓存' + index++ + '）';
        return candidate;
    }

    function importLegacySelection(options) {
        const input = options || {};
        const uid = normalizeUid(input.uid);
        if (uid === 'guest') throw new Error('请先登录后再导入旧缓存');
        const books = clone(input.currentBooks || {}) || {};
        const memBooks = clone(input.currentMemBooks || {}) || {};
        const legacyBooks = input.legacyBooks || {};
        const legacyMemBooks = input.legacyMemBooks || {};
        const selectedNames = Array.from(new Set(input.selectedNames || []));
        const imported = [];
        selectedNames.forEach(function(sourceName) {
            if (!legacyBooks[sourceName] && !legacyMemBooks[sourceName]) return;
            const targetName = nextImportName(sourceName, books, memBooks);
            if (legacyBooks[sourceName]) {
                const book = detachCloudIds(clone(legacyBooks[sourceName]));
                if (book && typeof book === 'object') { book.name = targetName; book._ownerUid = uid; }
                books[targetName] = book;
            }
            if (!books[targetName]) books[targetName] = { name: targetName, status: 'active', volumes: [], _ownerUid: uid };
            if (legacyMemBooks[sourceName]) memBooks[targetName] = clone(legacyMemBooks[sourceName]);
            imported.push({ sourceName, targetName });
        });
        stampBooks(books, uid);
        return { books, memBooks, imported };
    }

    return { normalizeUid, setActiveUid, getActiveUid, key, stampBooks, hasForeignBooks, filterOwnedBooks, canSyncBook, importLegacySelection };
});
