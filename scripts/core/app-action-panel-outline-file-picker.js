// ===== Action panel outline file picker =====
(function initActionPanelOutlineFilePickerModule() {
    var outlineLocalReadVersion = 0;

    function cloneOutlineSelection(files) {
        return (Array.isArray(files) ? files : []).map(function(file) {
            return file && typeof file === 'object' ? Object.assign({}, file) : file;
        });
    }

    function getOGOutlineSelectionScopeKey(bookName) {
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

    function clearOGOutlineTemporaryState() {
        var og = ACTION_PANEL_APP_STATE.outlineGen;
        og.pendingChapters = [];
        og.pendingStages = [];
        og.chapters = [];
        var statusEl = document.getElementById('ogPickerStatus');
        if (statusEl) statusEl.textContent = '';
        var splitArea = document.getElementById('ogSplitResultArea');
        if (splitArea) splitArea.style.display = 'none';
        var listEl = document.getElementById('ogSplitChapterList');
        if (listEl) listEl.innerHTML = '';
        window.refreshAllOGFileStacks?.();
    }

    function switchOutlineSelectionBook(og, bookName) {
        if (!og.linkedOutlineFilesByBook || typeof og.linkedOutlineFilesByBook !== 'object') {
            og.linkedOutlineFilesByBook = {};
        }
        if (!og.advancedLinkedOutlineFilesByBook || typeof og.advancedLinkedOutlineFilesByBook !== 'object') {
            og.advancedLinkedOutlineFilesByBook = {};
        }
        var nextScopeKey = getOGOutlineSelectionScopeKey(bookName);
        var currentScopeKey = String(og.linkedOutlineBookScopeKey || og.advancedLinkedOutlineBookScopeKey || '');
        if (og.linkedOutlineBookName === bookName && currentScopeKey === nextScopeKey) return false;
        if (currentScopeKey) {
            og.linkedOutlineFilesByBook[currentScopeKey] = cloneOutlineSelection(og.linkedOutlineFiles);
            og.advancedLinkedOutlineFilesByBook[currentScopeKey] = cloneOutlineSelection(og.advancedLinkedOutlineFiles);
        }
        og.linkedOutlineFiles = nextScopeKey ? cloneOutlineSelection(og.linkedOutlineFilesByBook[nextScopeKey]) : [];
        og.advancedLinkedOutlineFiles = nextScopeKey ? cloneOutlineSelection(og.advancedLinkedOutlineFilesByBook[nextScopeKey]) : [];
        og.linkedOutlineBookName = bookName;
        og.advancedLinkedOutlineBookName = bookName;
        og.linkedOutlineBookScopeKey = nextScopeKey;
        og.advancedLinkedOutlineBookScopeKey = nextScopeKey;
        outlineLocalReadVersion += 1;
        clearOGOutlineTemporaryState();
        return true;
    }

    function activateOGOutlineSelectionBook(bookName) {
        var changed = switchOutlineSelectionBook(ACTION_PANEL_APP_STATE.outlineGen, String(bookName || ''));
        updateOGPickerMemStatus();
        return changed;
    }

    function discardOGOutlineSelectionBook(bookName) {
        var og = ACTION_PANEL_APP_STATE.outlineGen;
        var scopeKey = getOGOutlineSelectionScopeKey(bookName);
        if (scopeKey) {
            delete og.linkedOutlineFilesByBook?.[scopeKey];
            delete og.advancedLinkedOutlineFilesByBook?.[scopeKey];
        }
        delete og.linkedOutlineFilesByBook?.[String(bookName || '')];
        delete og.advancedLinkedOutlineFilesByBook?.[String(bookName || '')];
        if (og.linkedOutlineBookName === bookName || (scopeKey && og.linkedOutlineBookScopeKey === scopeKey)) {
            switchOutlineSelectionBook(og, '');
        }
    }

    function clearAllOGOutlineSelectionBooks() {
        var og = ACTION_PANEL_APP_STATE.outlineGen;
        og.linkedOutlineFilesByBook = {};
        og.advancedLinkedOutlineFilesByBook = {};
        og.linkedOutlineFiles = [];
        og.advancedLinkedOutlineFiles = [];
        og.linkedOutlineBookName = '';
        og.advancedLinkedOutlineBookName = '';
        og.linkedOutlineBookScopeKey = '';
        og.advancedLinkedOutlineBookScopeKey = '';
        clearOGOutlineTemporaryState();
        updateOGPickerMemStatus();
    }

    function getActiveOGOutlinePickerMode(mode) {
        var requestedMode = mode || window.getOGOutlinePickerMode?.() || window._ogOutlineFiles?.mode;
        return requestedMode === 'advanced' ? 'advanced' : 'fineOutline';
    }

    function getOGOutlineFolderFiles(bookMem, folder) {
        return Array.isArray(bookMem?.[folder]) ? bookMem[folder] : [];
    }

    function getOGOutlineFolderNames(bookMem) {
        return Object.keys(bookMem || {}).filter(function(folder) {
            return Array.isArray(bookMem[folder]);
        });
    }

    function openOGOutlineFileModal() {
        var bookName = ACTION_PANEL_APP_STATE.chapter.book;
        if (!bookName) { ACTION_PANEL_TOAST.warn('请先选择书籍'); return; }
        var memBooks = getMemBooks();
        var bookMem = memBooks[bookName];
        if (!bookMem) { ACTION_PANEL_TOAST.warn('当前作品暂无记忆文件'); return; }
        var pickerMode = getActiveOGOutlinePickerMode();
        var advancedMode = pickerMode === 'advanced';
        activateOGOutlineSelectionBook(bookName);
        window._ogOutlineFiles = { bookName: bookName, bookMem: bookMem, mode: pickerMode };
        var folders = getOGOutlineFolderNames(bookMem).filter(function(folder) {
            return getOGOutlineFolderFiles(bookMem, folder).length > 0;
        });
        var preferredFolder = folders.find(function(folder) {
            return folder === '默认文件夹' || folder === '关联文件夹';
        }) || folders[0] || '';
        window._ogOutlineFileFolder = preferredFolder;
        if (advancedMode) ensureAdvancedOutlineDefaultSelection(bookMem);
        else ensureFineOutlineDefaultSelection(bookMem);
        refreshOGOutlineFileGrid();
        ACTION_PANEL_MODAL.open('ogOutlineFileModal');
    }

    function getOGOutlineFolderLabel(folder) {
        return folder === '默认文件夹' || folder === '关联文件夹' ? '关联文件' : folder;
    }

    function getOGOutlineResourceLabel(value) {
        var label = typeof window.normalizeMemoryFileName === 'function'
            ? window.normalizeMemoryFileName(value)
            : String(value || '').replace(/\.md$/i, '');
        var bookName = String(window._ogOutlineFiles?.bookName || '');
        if (bookName && label.startsWith(bookName + '_')) {
            label = label.substring(bookName.length + 1);
        }
        return label;
    }

    function isOGOutlineResource(item) {
        var folder = getOGOutlineResourceLabel(item?.folder);
        var name = getOGOutlineResourceLabel(item?.file?.name);
        return /章节粗纲|阶段粗纲|大纲|母纲|剧情总览|细纲/.test(folder + ' ' + name);
    }

    function isSameOGOutlineFile(left, right) {
        var leftFolder = String(left?.memFolder || left?.folder || '');
        var rightFolder = String(right?.memFolder || right?.folder || '');
        var leftIndex = Number(left?.memIdx ?? left?.idx);
        var rightIndex = Number(right?.memIdx ?? right?.idx);
        var bothIndexed = Number.isInteger(leftIndex) && leftIndex >= 0 && Number.isInteger(rightIndex) && rightIndex >= 0;
        return String(left?.name || '') === String(right?.name || '')
            && leftFolder === rightFolder
            && (!bothIndexed || leftIndex === rightIndex);
    }

    function createOGOutlineSelection(bookName, folder, index, checked) {
        var selected = window.createMemoryReferenceSelection?.(bookName, folder, index);
        if (!selected) {
            var file = getOGOutlineFolderFiles(getMemBooks()?.[bookName], folder)[index];
            selected = file ? { name: file.name, memBook: bookName, memFolder: folder, memIdx: index } : null;
        }
        return selected ? Object.assign({}, selected, { folder: folder, checked: checked !== false }) : null;
    }

    function getOGOutlineSelectionList(mode) {
        var og = ACTION_PANEL_APP_STATE.outlineGen;
        var advancedMode = getActiveOGOutlinePickerMode(mode) === 'advanced';
        var key = advancedMode ? 'advancedLinkedOutlineFiles' : 'linkedOutlineFiles';
        if (!Array.isArray(og[key])) og[key] = [];
        return og[key];
    }

    function setOGOutlineSelectionList(files, mode) {
        var og = ACTION_PANEL_APP_STATE.outlineGen;
        var advancedMode = getActiveOGOutlinePickerMode(mode) === 'advanced';
        og[advancedMode ? 'advancedLinkedOutlineFiles' : 'linkedOutlineFiles'] = files;
        if (advancedMode) og.pendingStages = [];
        else og.pendingChapters = [];
        return files;
    }

    function ensureAdvancedOutlineDefaultSelection(bookMem) {
        var files = getOGOutlineSelectionList();
        if (files.some(function(file) { return file.checked; })) return;
        var folders = getOGOutlineFolderNames(bookMem);
        for (var folderIndex = 0; folderIndex < folders.length; folderIndex += 1) {
            var folder = folders[folderIndex];
            var folderFiles = getOGOutlineFolderFiles(bookMem, folder);
            var index = folderFiles.findIndex(function(file) {
                var name = String(file?.name || '').replace(/\.md$/i, '');
                return name === '剧情总览' || name.endsWith('_剧情总览');
            });
            if (index >= 0) {
                var selected = createOGOutlineSelection(window._ogOutlineFiles?.bookName, folder, index, true);
                if (!selected) return;
                files.push(selected);
                setOGOutlineSelectionList(files);
                return;
            }
        }
    }

    function ensureFineOutlineDefaultSelection(bookMem) {
        var files = getOGOutlineSelectionList();
        var folders = getOGOutlineFolderNames(bookMem).sort(function(left, right) {
            var leftPreferred = left === '默认文件夹' || left === '关联文件夹';
            var rightPreferred = right === '默认文件夹' || right === '关联文件夹';
            return Number(rightPreferred) - Number(leftPreferred);
        });
        for (var folderIndex = 0; folderIndex < folders.length; folderIndex += 1) {
            var folder = folders[folderIndex];
            var folderFiles = getOGOutlineFolderFiles(bookMem, folder);
            var fileIndex = folderFiles.findIndex(function(candidate) {
                return getOGOutlineResourceLabel(candidate?.name) === '章节粗纲';
            });
            if (fileIndex < 0) continue;
            var file = folderFiles[fileIndex];
            var target = { name: file.name, folder: folder, memIdx: fileIndex };
            if (!files.some(function(selected) { return isSameOGOutlineFile(selected, target); })) {
                var selected = createOGOutlineSelection(window._ogOutlineFiles?.bookName, folder, fileIndex, true);
                if (!selected) return;
                files.push(selected);
                setOGOutlineSelectionList(files);
            }
            return;
        }
    }

    function renderOGOutlineFileCards(items, checkedFiles) {
        if (!items.length) return '<div class="memory-link-empty">暂无可选文件</div>';
        return '<div class="memory-link-grid">' + items.map(function(item) {
            var file = item.file;
            var checked = checkedFiles.some(function(selected) {
                return selected.checked && isSameOGOutlineFile(selected, { name: file.name, folder: item.folder, memIdx: item.index });
            });
            return '<div class="link-file-card' + (checked ? ' checked' : '') + '" data-folder="'
                + ACTION_PANEL_UTILS.escapeHtml(item.folder) + '" data-name="' + ACTION_PANEL_UTILS.escapeHtml(file.name)
                + '" data-index="' + item.index + '">'
                + '<input type="checkbox" class="link-file-cb" ' + (checked ? 'checked' : '') + ' aria-label="选择'
                + ACTION_PANEL_UTILS.escapeHtml(file.name) + '">'
                + '<span class="memory-link-card-icon">' + renderLineIcon('file') + '</span>'
                + '<span class="memory-link-card-name" title="' + ACTION_PANEL_UTILS.escapeHtml(file.name) + '">'
                + ACTION_PANEL_UTILS.escapeHtml(file.name) + '</span></div>';
        }).join('') + '</div>';
    }

    function renderOGOutlineSelectedFiles(checkedFiles) {
        var selected = checkedFiles.filter(function(file) { return file.checked; });
        if (!selected.length) return '<div class="memory-link-empty selected">未选择文件</div>';
        return '<div class="memory-link-selected-list">' + selected.map(function(file) {
            var source = typeof window.getMemoryLinkChipSource === 'function'
                ? window.getMemoryLinkChipSource(file, new Set(['默认文件夹', '关联文件夹']))
                : 'associated';
            var selectedIndex = checkedFiles.indexOf(file);
            return '<span class="memory-link-chip memory-link-chip-source-' + source + '" title="' + ACTION_PANEL_UTILS.escapeHtml(file.name) + '"><span>'
                + ACTION_PANEL_UTILS.escapeHtml(file.name) + '</span><button type="button" class="memory-link-chip-remove" data-selection-index="'
                + selectedIndex
                + '" aria-label="移除' + ACTION_PANEL_UTILS.escapeHtml(file.name) + '">&times;</button></span>';
        }).join('') + '</div>';
    }

    function renderOGOutlineSection(title, body, flex) {
        return '<section class="memory-link-section" style="' + flex + '"><div class="memory-link-section-title"><span>'
            + title + '</span></div><div class="memory-link-section-body">' + body + '</div></section>';
    }

    function refreshOGOutlineFileGrid() {
        var foldersEl = document.getElementById('ogOutlineFileFolders');
        var gridEl = document.getElementById('ogOutlineFileGrid');
        if (!foldersEl || !gridEl) return;
        var data = window._ogOutlineFiles;
        if (!data || !data.bookMem) return;
        var bookMem = data.bookMem;
        var checkedFiles = getOGOutlineSelectionList();

        var folders = getOGOutlineFolderNames(bookMem).filter(function(folder) {
            return getOGOutlineFolderFiles(bookMem, folder).length > 0;
        });
        if (!folders.length) {
            foldersEl.innerHTML = '';
            gridEl.innerHTML = '<div class="memory-link-empty">暂无文件</div>';
            return;
        }
        if (!folders.includes(window._ogOutlineFileFolder)) {
            window._ogOutlineFileFolder = folders[0];
        }
        foldersEl.innerHTML = '';
        folders.forEach(function(folder) {
            var div = document.createElement('div');
            div.className = 'link-folder-item' + (window._ogOutlineFileFolder === folder ? ' active' : '');
            div.innerHTML = '<span>' + renderLineIcon('folder') + '</span><span class="link-folder-name">'
                + ACTION_PANEL_UTILS.escapeHtml(getOGOutlineFolderLabel(folder)) + '</span><span class="link-folder-count">'
                + getOGOutlineFolderFiles(bookMem, folder).length + '</span>';
            div.onclick = function() {
                window._ogOutlineFileFolder = folder;
                refreshOGOutlineFileGrid();
            };
            foldersEl.appendChild(div);
        });

        var selFolder = window._ogOutlineFileFolder;
        var allFiles = getOGOutlineFolderFiles(bookMem, selFolder).map(function(file, index) {
            return { folder: selFolder, file: file, index: index };
        });
        var selectedSection = renderOGOutlineSection('已选文件', renderOGOutlineSelectedFiles(checkedFiles), 'flex:0 0 104px;');
        var contentSections = '';
        var isAssociatedFolder = selFolder === '默认文件夹' || selFolder === '关联文件夹';
        if (isAssociatedFolder) {
            var outlineFiles = allFiles.filter(isOGOutlineResource);
            var associatedFiles = allFiles.filter(function(item) { return !isOGOutlineResource(item); });
            contentSections += renderOGOutlineSection('关联文件', renderOGOutlineFileCards(associatedFiles, checkedFiles), 'flex:1 1 170px;');
            contentSections += renderOGOutlineSection('大纲资料', renderOGOutlineFileCards(outlineFiles, checkedFiles), 'flex:1 1 170px;');
        } else {
            contentSections += renderOGOutlineSection(
                '当前文件夹：' + ACTION_PANEL_UTILS.escapeHtml(getOGOutlineFolderLabel(selFolder)),
                renderOGOutlineFileCards(allFiles, checkedFiles),
                'flex:1 1 auto;'
            );
        }
        gridEl.innerHTML = selectedSection + contentSections;
        gridEl.querySelectorAll('.memory-link-chip-remove').forEach(function(button) {
            button.addEventListener('click', function(event) {
                event.stopPropagation();
                var files = getOGOutlineSelectionList();
                var existing = files[Number(this.dataset.selectionIndex)];
                if (existing) existing.checked = false;
                setOGOutlineSelectionList(files);
                refreshOGOutlineFileGrid();
            });
        });
        gridEl.querySelectorAll('.link-file-card').forEach(function(card) {
            card.addEventListener('click', function(event) {
                if (event.target.tagName === 'INPUT') return;
                var checkbox = card.querySelector('.link-file-cb');
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change'));
            });
        });
        gridEl.querySelectorAll('.link-file-cb').forEach(function(checkbox) {
            checkbox.addEventListener('change', function(event) {
                event.stopPropagation();
                var card = this.closest('.link-file-card');
                var target = { name: card.dataset.name, folder: card.dataset.folder, memIdx: Number(card.dataset.index) };
                var files = getOGOutlineSelectionList();
                var existing = files.find(function(file) { return isSameOGOutlineFile(file, target); });
                if (existing) existing.checked = this.checked;
                else {
                    var selected = createOGOutlineSelection(window._ogOutlineFiles?.bookName, target.folder, target.memIdx, this.checked);
                    if (selected) files.push(selected);
                }
                setOGOutlineSelectionList(files);
                refreshOGOutlineFileGrid();
            });
        });
    }

    function saveOGPickerMemState() {
        // 状态已在子弹窗点击时直接写入 ACTION_PANEL_APP_STATE.outlineGen.linkedOutlineFiles
    }

    function updateOGPickerMemStatus() {
        var statusEl = document.getElementById('ogPickerMemStatus');
        var labelEl = document.getElementById('ogPickerMemLabel');
        if (!statusEl) return;
        var checkedFiles = getOGOutlineSelectionList().filter(function(file) { return file.checked; });
        if (checkedFiles.length === 0) {
            statusEl.textContent = '点击选择';
            statusEl.style.color = '#8b8d98';
            if (labelEl) labelEl.textContent = '📂 从记忆库加载大纲';
        } else {
            var names = checkedFiles.map(function(file) { return file.name; }).join(', ');
            statusEl.textContent = '✅ 已加载';
            statusEl.style.color = '#27ae60';
            if (labelEl) labelEl.textContent = '📂 已加载：' + (names.length > 30 ? names.substring(0, 30) + '...' : names);
        }
        updateOGSplitButtonState();
    }

    function updateOGSplitButtonState() {
        var checkedFiles = getOGOutlineSelectionList().filter(function(file) { return file.checked; });
        var regexBtn = document.getElementById('btnOGRegexSplit');
        var aiBtn = document.getElementById('btnOGAiSplit');
        if (!regexBtn || !aiBtn) return;
        var hasContent = checkedFiles.length > 0;
        regexBtn.disabled = !hasContent;
        aiBtn.disabled = !hasContent;
        regexBtn.title = hasContent ? '' : '请先在记忆库中选择大纲文件';
        aiBtn.title = hasContent ? '' : '请先在记忆库中选择大纲文件';
    }

    function getCheckedOGOutlineText(mode) {
        var checkedFiles = getOGOutlineSelectionList(mode).filter(function(file) { return file.checked; });
        if (!checkedFiles.length) return '';
        var bookName = String(ACTION_PANEL_APP_STATE.chapter.book || '');
        var ownerUid = String(window.AccountDataScope?.getActiveUid?.() || ACTION_PANEL_APP_STATE.auth?.uid || 'guest');
        var chunks = [];
        for (var index = 0; index < checkedFiles.length; index += 1) {
            var checkedFile = checkedFiles[index];
            var fileName = checkedFile.name || '未命名资料';
            if (checkedFile.memBook && String(checkedFile.memBook) !== bookName) {
                ACTION_PANEL_TOAST.warn('大纲文件“' + fileName + '”属于其他作品，请重新选择');
                return null;
            }
            if (checkedFile.ownerUid && String(checkedFile.ownerUid) !== ownerUid) {
                ACTION_PANEL_TOAST.warn('大纲文件“' + fileName + '”属于其他账号，请重新选择');
                return null;
            }
            if (checkedFile.sourceType === 'local-upload') {
                if (!String(checkedFile.content || '').trim()) {
                    ACTION_PANEL_TOAST.warn('大纲文件“' + fileName + '”内容为空，请重新选择');
                    return null;
                }
                chunks.push(String(checkedFile.content));
                continue;
            }
            var folder = checkedFile.memFolder || checkedFile.folder;
            var fileIndex = checkedFile.memIdx ?? checkedFile.idx;
            var fingerprint = checkedFile.memFingerprint || checkedFile.fingerprint || '';
            if (!folder || !Number.isInteger(Number(fileIndex)) || !fingerprint) {
                ACTION_PANEL_TOAST.warn('大纲文件“' + fileName + '”的选择记录已过期，请重新选择');
                return null;
            }
            var found = typeof window.getRefFileContent === 'function'
                ? window.getRefFileContent(bookName, fileName, folder, Number(fileIndex), fingerprint)
                : null;
            if (!found || !String(found.content || '').trim()) {
                ACTION_PANEL_TOAST.warn('大纲文件“' + fileName + '”已移动、不存在或内容为空，请重新选择');
                return null;
            }
            chunks.push(String(found.content));
        }
        return chunks.join('\n\n').trim();
    }

    function bindOGOutlineFilePickerActions() {
        var selectAllBtn = document.getElementById('btnOGFileSelectAll');
        var invertBtn = document.getElementById('btnOGFileInvert');
        var localBtn = document.getElementById('btnOGFileLocal');
        var confirmBtn = document.getElementById('btnOGFileConfirm');

        if (selectAllBtn && !selectAllBtn.dataset.ogOutlineFilePickerBound) {
            selectAllBtn.dataset.ogOutlineFilePickerBound = '1';
            selectAllBtn.addEventListener('click', function() {
                var data = window._ogOutlineFiles;
                if (!data || !data.bookMem) return;
                var files = getOGOutlineSelectionList();
                getOGOutlineFolderNames(data.bookMem).forEach(function(folder) {
                    getOGOutlineFolderFiles(data.bookMem, folder).forEach(function(file, index) {
                        var existing = files.find(function(checkedFile) {
                            return isSameOGOutlineFile(checkedFile, { name: file.name, folder: folder, memIdx: index });
                        });
                        if (!existing) {
                            var selected = createOGOutlineSelection(data.bookName, folder, index, true);
                            if (selected) files.push(selected);
                        }
                        else existing.checked = true;
                    });
                });
                setOGOutlineSelectionList(files);
                refreshOGOutlineFileGrid();
            });
        }

        if (invertBtn && !invertBtn.dataset.ogOutlineFilePickerBound) {
            invertBtn.dataset.ogOutlineFilePickerBound = '1';
            invertBtn.addEventListener('click', function() {
                var data = window._ogOutlineFiles;
                if (!data || !data.bookMem) return;
                var files = getOGOutlineSelectionList();
                getOGOutlineFolderNames(data.bookMem).forEach(function(folder) {
                    getOGOutlineFolderFiles(data.bookMem, folder).forEach(function(file, index) {
                        var existing = files.find(function(checkedFile) {
                            return isSameOGOutlineFile(checkedFile, { name: file.name, folder: folder, memIdx: index });
                        });
                        if (!existing) {
                            var selected = createOGOutlineSelection(data.bookName, folder, index, true);
                            if (selected) files.push(selected);
                        }
                        else existing.checked = !existing.checked;
                    });
                });
                setOGOutlineSelectionList(files);
                refreshOGOutlineFileGrid();
            });
        }

        if (localBtn && !localBtn.dataset.ogOutlineFilePickerBound) {
            localBtn.dataset.ogOutlineFilePickerBound = '1';
            localBtn.addEventListener('click', function() {
                var input = document.createElement('input');
                input.type = 'file';
                input.accept = '.txt,.md';
                input.onchange = function() {
                    var file = input.files[0];
                    if (!file) return;
                    var targetBookName = String(window._ogOutlineFiles?.bookName || '');
                    var targetScopeKey = getOGOutlineSelectionScopeKey(targetBookName);
                    var targetMode = getActiveOGOutlinePickerMode();
                    var targetOwnerUid = String(window.AccountDataScope?.getActiveUid?.() || ACTION_PANEL_APP_STATE.auth?.uid || 'guest');
                    var targetReadVersion = ++outlineLocalReadVersion;
                    var reader = new FileReader();
                    reader.onload = function() {
                        if (targetReadVersion !== outlineLocalReadVersion
                            || getOGOutlineSelectionScopeKey(ACTION_PANEL_APP_STATE.chapter?.book) !== targetScopeKey
                            || String(window._ogOutlineFiles?.bookName || '') !== targetBookName
                            || getActiveOGOutlinePickerMode() !== targetMode
                            || String(window.AccountDataScope?.getActiveUid?.() || ACTION_PANEL_APP_STATE.auth?.uid || 'guest') !== targetOwnerUid) return;
                        var files = getOGOutlineSelectionList();
                        files.push({ name: file.name, checked: true, folder: '本地上传', content: reader.result, sourceType: 'local-upload', memBook: targetBookName, ownerUid: targetOwnerUid });
                        setOGOutlineSelectionList(files);
                        if (window._ogOutlineFiles && window._ogOutlineFiles.bookMem) {
                            var bookMem = window._ogOutlineFiles.bookMem;
                            if (!Array.isArray(bookMem['本地上传'])) bookMem['本地上传'] = [];
                            bookMem['本地上传'].push({ name: file.name, content: reader.result });
                        }
                        refreshOGOutlineFileGrid();
                    };
                    reader.readAsText(file);
                };
                input.click();
            });
        }

        if (confirmBtn && !confirmBtn.dataset.ogOutlineFilePickerBound) {
            confirmBtn.dataset.ogOutlineFilePickerBound = '1';
            confirmBtn.addEventListener('click', function() {
                ACTION_PANEL_MODAL.close('ogOutlineFileModal');
                updateOGPickerMemStatus();
                updateOGSplitButtonState();
                ACTION_PANEL_TOAST.success('已加载大纲文件');
            });
        }
    }

    window.openOGOutlineFileModal = openOGOutlineFileModal;
    window.refreshOGOutlineFileGrid = refreshOGOutlineFileGrid;
    window.saveOGPickerMemState = saveOGPickerMemState;
    window.updateOGPickerMemStatus = updateOGPickerMemStatus;
    window.updateOGSplitButtonState = updateOGSplitButtonState;
    window.getOGOutlineSelectionList = getOGOutlineSelectionList;
    window.getCheckedOGOutlineText = getCheckedOGOutlineText;
    window.getOGOutlineSelectionScopeKey = getOGOutlineSelectionScopeKey;
    window.activateOGOutlineSelectionBook = activateOGOutlineSelectionBook;
    window.discardOGOutlineSelectionBook = discardOGOutlineSelectionBook;
    window.clearAllOGOutlineSelectionBooks = clearAllOGOutlineSelectionBooks;
    window.bindOGOutlineFilePickerActions = bindOGOutlineFilePickerActions;
    window.ZHIYU_OG_OUTLINE_FILE_PICKER_READY = true;

    bindOGOutlineFilePickerActions();
})();
