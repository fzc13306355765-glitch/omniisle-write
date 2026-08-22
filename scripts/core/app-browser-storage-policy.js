(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.BrowserStoragePolicy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    function readRaw(storage, key) {
        try { return storage && storage.getItem(key); } catch (e) { return null; }
    }

    function remove(storage, key) {
        try { if (storage) storage.removeItem(key); } catch (e) {}
    }

    function writeJsonWithFallback(key, value, primary, fallback) {
        const raw = JSON.stringify(value);
        try {
            primary.setItem(key, raw);
            remove(fallback, key);
            return 'primary';
        } catch (primaryError) {
            remove(primary, key);
            fallback.setItem(key, raw);
            return 'fallback';
        }
    }

    function readJsonWithFallback(key, primary, fallback) {
        const values = [readRaw(primary, key), readRaw(fallback, key)];
        for (const raw of values) {
            if (!raw) continue;
            try { return JSON.parse(raw); } catch (e) {}
        }
        return null;
    }

    function removeFromBoth(key, primary, fallback) {
        remove(primary, key);
        remove(fallback, key);
    }

    return { writeJsonWithFallback, readJsonWithFallback, removeFromBoth };
});
