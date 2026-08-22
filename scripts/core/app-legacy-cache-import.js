(function(window) {
    'use strict';

    let legacyCacheImportData = null;

    function parseLegacyLocalObject(key) {
        try {
            const value = JSON.parse(localStorage.getItem(key) || 'null');
            return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
        } catch (e) { return null; }
    }

    async function readLegacyAccountCache() {
        const idbBooks = await window.ZHIYU_IDB.get('novel_books').catch(() => null);
        const localBooks = parseLegacyLocalObject('novel_books');
        const idbBookTime = Number(await window.ZHIYU_IDB.get('novel_books_updated_at').catch(() => 0) || 0);
        const localBookTime = Number(localStorage.getItem('novel_books_updated_at') || 0);
        const books = localBooks && (!idbBooks || localBookTime >= idbBookTime) ? localBooks : (idbBooks || localBooks || {});
        const idbMemBooks = await window.ZHIYU_IDB.get('mem_books').catch(() => null);
        const localMemBooks = parseLegacyLocalObject('novel_mem_books');
        return { books, memBooks: idbMemBooks || localMemBooks || {} };
    }

    async function openLegacyCacheImport() {
        if (!window.AppState.auth.isLoggedIn || !window.AppState.auth.uid) { window.Toast.warn('请先登录后再导入'); return; }
        const data = await readLegacyAccountCache();
        const names = Array.from(new Set(Object.keys(data.books || {}).concat(Object.keys(data.memBooks || {})))).sort();
        if (!names.length) { window.Toast.show('本机没有检测到未归属的旧作品缓存'); return; }
        legacyCacheImportData = data;
        const list = document.getElementById('legacyCacheImportList');
        list.innerHTML = '';
        names.forEach(function(name) {
            const row = document.createElement('label');
            row.className = 'legacy-cache-import-row';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = name;
            checkbox.dataset.legacyBook = '1';
            const text = document.createElement('span');
            text.textContent = name + (data.books[name] ? '' : '（仅有关联文件）');
            row.append(checkbox, text);
            list.appendChild(row);
        });
        window.Modal.open('legacyCacheImportModal');
    }

    function importLegacyLocalArtifacts(imported, uid) {
        let copied = 0;
        const keys = [];
        for (let i = 0; i < localStorage.length; i += 1) keys.push(localStorage.key(i));
        const prefixes = ['zhiyu_draft_', 'plot_', 'zhiyu_file_snapshot_', 'zhiyu_outline_snapshot_', 'zhiyu_advanced_outline_draft_', 'zhiyu_normal_outline_draft_', 'outline_'];
        (imported || []).forEach(function(item) {
            prefixes.forEach(function(prefix) {
                const sourceBase = prefix + item.sourceName;
                keys.forEach(function(oldKey) {
                    if (!oldKey || (oldKey !== sourceBase && !oldKey.startsWith(sourceBase + '_'))) return;
                    const suffix = oldKey.slice(sourceBase.length);
                    const scopeBeforeSuffix = /advanced_outline|normal_outline/.test(prefix);
                    const newKey = scopeBeforeSuffix
                        ? window.AccountDataScope.key(prefix + item.targetName) + suffix
                        : window.AccountDataScope.key(prefix + item.targetName + suffix);
                    if (localStorage.getItem(newKey) === null) {
                        localStorage.setItem(newKey, localStorage.getItem(oldKey) || '');
                        copied += 1;
                    }
                });
            });
            if (localStorage.getItem('novel_current_book') === item.sourceName) {
                localStorage.setItem(window.AccountDataScope.key('novel_current_book'), item.targetName);
                const currentChapter = localStorage.getItem('novel_current_chapter');
                if (currentChapter) localStorage.setItem(window.AccountDataScope.key('novel_current_chapter'), currentChapter);
            }
        });
        return copied;
    }

    async function confirmLegacyCacheImport() {
        if (!legacyCacheImportData || !window.AppState.auth.isLoggedIn) return;
        const selectedNames = Array.from(document.querySelectorAll('#legacyCacheImportList [data-legacy-book]:checked')).map(input => input.value);
        if (!selectedNames.length) { window.Toast.warn('请先勾选要导入的旧作品'); return; }
        const result = window.AccountDataScope.importLegacySelection({
            currentBooks: window.gB(),
            currentMemBooks: window.getMemBooks(),
            legacyBooks: legacyCacheImportData.books,
            legacyMemBooks: legacyCacheImportData.memBooks,
            selectedNames,
            uid: window.AppState.auth.uid,
        });
        importLegacyLocalArtifacts(result.imported, window.AppState.auth.uid);
        await Promise.all([window.sB(result.books), window.sMB(result.memBooks)]);
        legacyCacheImportData = null;
        window.Modal.close('legacyCacheImportModal');
        window.refreshOverview?.();
        window.refreshTree?.();
        window.refreshMemGrid?.();
        window.Toast.success('已导入 ' + result.imported.length + ' 个旧作品，原旧缓存仍保留');
    }

    document.getElementById('btnImportLegacyCache')?.addEventListener('click', openLegacyCacheImport);
    document.getElementById('btnConfirmLegacyCacheImport')?.addEventListener('click', confirmLegacyCacheImport);
    window.readLegacyAccountCache = readLegacyAccountCache;
    window.openLegacyCacheImport = openLegacyCacheImport;
    window.importLegacyLocalArtifacts = importLegacyLocalArtifacts;
    window.confirmLegacyCacheImport = confirmLegacyCacheImport;
})(window);
