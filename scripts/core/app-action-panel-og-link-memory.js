// 细纲关联记忆文件选择。
(function() {
    function getMemoryFolderFiles(bookMem, folder) {
        return Array.isArray(bookMem?.[folder]) ? bookMem[folder] : [];
    }

    function getOGLinkedFiles() {
        var og = ACTION_PANEL_APP_STATE.outlineGen;
        if (!Array.isArray(og.linkedFiles)) og.linkedFiles = [];
        return og.linkedFiles;
    }

    function getMemoryFileDisplayName(fileName, bookName) {
        var name = String(fileName || '').replace(/\.(?:md|txt)$/i, '');
        var prefix = String(bookName || '') + '_';
        return prefix !== '_' && name.indexOf(prefix) === 0 ? name.slice(prefix.length) : name;
    }

    function cloneLinkedFiles(files) {
        return (Array.isArray(files) ? files : []).map(function(file) {
            return file && typeof file === 'object' ? Object.assign({}, file) : file;
        });
    }

    function getOGLinkedMemoryScopeKey(bookName) {
        var normalizedName = String(bookName || '').trim();
        if (!normalizedName) return '';
        if (typeof window.getBookScopedSelectionKey === 'function') {
            return window.getBookScopedSelectionKey(normalizedName);
        }
        var books = typeof window.gB === 'function' ? (window.gB() || {}) : {};
        var book = books[normalizedName] || {};
        var ownerUid = String(book._ownerUid || window.AccountDataScope?.getActiveUid?.() || ACTION_PANEL_APP_STATE.auth?.uid || 'guest');
        var stableBookId = String(book._bid || book.bookId || book.id || '').trim();
        return ownerUid + '::' + (stableBookId ? ('id:' + stableBookId) : ('name:' + normalizedName));
    }

    function switchOGLinkedMemoryBook(og, bookName) {
        if (!og.linkedFilesByBook || typeof og.linkedFilesByBook !== 'object') {
            og.linkedFilesByBook = {};
        }
        var nextScopeKey = getOGLinkedMemoryScopeKey(bookName);
        var currentScopeKey = String(og.linkedMemoryBookScopeKey || '');
        if (og.linkedMemoryBookName === bookName && currentScopeKey === nextScopeKey) return;
        if (og.linkedMemoryBookName && currentScopeKey) {
            og.linkedFilesByBook[currentScopeKey] = cloneLinkedFiles(og.linkedFiles);
        }
        var hasSavedSelection = !!nextScopeKey && Object.prototype.hasOwnProperty.call(og.linkedFilesByBook, nextScopeKey);
        og.linkedFiles = hasSavedSelection ? cloneLinkedFiles(og.linkedFilesByBook[nextScopeKey]) : [];
        og.linkedMemoryBookName = bookName;
        og.linkedMemoryBookScopeKey = nextScopeKey;
        og.linkedMemoryDefaultsApplied = hasSavedSelection;
    }

    function discardOGLinkedMemoryBook(bookName) {
        var og = ACTION_PANEL_APP_STATE.outlineGen;
        if (!og.linkedFilesByBook || typeof og.linkedFilesByBook !== 'object') og.linkedFilesByBook = {};
        var scopeKey = getOGLinkedMemoryScopeKey(bookName);
        if (scopeKey) delete og.linkedFilesByBook[scopeKey];
        delete og.linkedFilesByBook[String(bookName || '')];
        if (og.linkedMemoryBookName === bookName || (scopeKey && og.linkedMemoryBookScopeKey === scopeKey)) {
            og.linkedFiles = [];
            og.linkedMemoryBookName = '';
            og.linkedMemoryBookScopeKey = '';
            og.linkedMemoryDefaultsApplied = false;
        }
        window.refreshAllOGFileStacks?.();
    }

    function clearAllOGLinkedMemoryBooks() {
        var og = ACTION_PANEL_APP_STATE.outlineGen;
        og.linkedFiles = [];
        og.linkedFilesByBook = {};
        og.linkedMemoryBookName = '';
        og.linkedMemoryBookScopeKey = '';
        og.linkedMemoryDefaultsApplied = false;
        window.refreshAllOGFileStacks?.();
    }

    function activateOGLinkedMemoryBook(bookName) {
        var og = ACTION_PANEL_APP_STATE.outlineGen;
        switchOGLinkedMemoryBook(og, String(bookName || ''));
        window.refreshAllOGFileStacks?.();
        return getOGLinkedFiles();
    }

    function openOGLinkMemorySelector() {
        var bookName = ACTION_PANEL_APP_STATE.chapter?.book || document.getElementById('bookSel')?.value || '';
        if (!bookName) { ACTION_PANEL_TOAST.warn('请先选择书籍'); return; }
        window._linkMemoryContext = 'fineOutline';

        // 默认勾选设定集、信息表、角色列表；旧作品中的历史别名只作兼容候选。
        var og = ACTION_PANEL_APP_STATE.outlineGen;
        activateOGLinkedMemoryBook(bookName);
        getOGLinkedFiles();
        var memBooks = typeof window.getMemBooks === 'function' ? window.getMemBooks() : {};
        var bookMem = memBooks[bookName] || {};
        var defaultGroups = [
            ['设定集'],
            ['信息表', '信息卡'],
            ['角色列表', '角色关系网']
        ];
        if (!og.linkedMemoryDefaultsApplied) {
            defaultGroups.forEach(function(aliases) {
                var alreadySelected = og.linkedFiles.some(function(lf) {
                    return lf && aliases.indexOf(getMemoryFileDisplayName(lf.name, bookName)) >= 0;
                });
                if (alreadySelected) return;
                for (var aliasIndex = 0; aliasIndex < aliases.length; aliasIndex += 1) {
                    for (var folder in bookMem) {
                        var fileIndex = getMemoryFolderFiles(bookMem, folder).findIndex(function(file) {
                            return getMemoryFileDisplayName(file?.name, bookName) === aliases[aliasIndex];
                        });
                        if (fileIndex >= 0) {
                            var file = getMemoryFolderFiles(bookMem, folder)[fileIndex];
                            og.linkedFiles.push(window.createMemoryReferenceSelection?.(bookName, folder, fileIndex)
                                || { name: file.name, memBook: bookName, memFolder: folder, memIdx: fileIndex });
                            return;
                        }
                    }
                }
            });
            og.linkedMemoryDefaultsApplied = true;
        }

        // 细纲使用独立选择状态，同时补全记忆库位置，确保弹窗能正确回显勾选项。
        var normalizedFiles = [];
        (og.linkedFiles || []).forEach(function(lf) {
            var normalized = lf;
            if (!lf.memFolder || !Number.isInteger(lf.memIdx)) {
                for (var folder in bookMem) {
                    var fileIndex = getMemoryFolderFiles(bookMem, folder).findIndex(function(file) { return file.name === lf.name; });
                    if (fileIndex >= 0) {
                        normalized = window.createMemoryReferenceSelection?.(bookName, folder, fileIndex)
                            || { name: lf.name, memBook: bookName, memFolder: folder, memIdx: fileIndex };
                        break;
                    }
                }
            }
            if (!normalizedFiles.some(function(file) {
                return file.memFolder === normalized.memFolder && file.memIdx === normalized.memIdx && file.name === normalized.name;
            })) {
                normalizedFiles.push(normalized);
            }
        });
        og.linkedFiles = normalizedFiles;

        var modal = window.ZHIYU_MODAL
            || window.Modal
            || (typeof ACTION_PANEL_MODAL !== 'undefined' ? ACTION_PANEL_MODAL : null);
        if (!modal?.open) {
            window._linkMemoryContext = null;
            ACTION_PANEL_TOAST.error?.('关联文件窗口加载失败，请刷新页面后重试');
            return;
        }
        modal.open('memoryLinkModal');
        window.refreshMemoryLinkTree?.();
        window.updateLinkedMemoryCount?.();
    }

    function updateOGLinkedFileCount() {
        var count = getOGLinkedFiles().length;
        // 更新文件图标栈
        window.renderOGLinkedFileStack?.();
    }

    function getSelectedOGLinkedFilesData() {
        return getOGLinkedFiles().filter(function(f) { return f && f.name; });
    }

    window.getOGLinkedFiles = getOGLinkedFiles;
    window.getOGLinkedMemoryScopeKey = getOGLinkedMemoryScopeKey;
    window.activateOGLinkedMemoryBook = activateOGLinkedMemoryBook;
    window.discardOGLinkedMemoryBook = discardOGLinkedMemoryBook;
    window.clearAllOGLinkedMemoryBooks = clearAllOGLinkedMemoryBooks;
    window.openOGLinkMemorySelector = openOGLinkMemorySelector;
    window.updateOGLinkedFileCount = updateOGLinkedFileCount;
    window.getSelectedOGLinkedFilesData = getSelectedOGLinkedFilesData;
    window.ZHIYU_OG_LINK_MEMORY_READY = true;
})();
