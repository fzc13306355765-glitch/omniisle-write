(function(window, document) {
    'use strict';

    const state = {
        selectedOutline: null,
        selectedBookName: '',
        selectedAccountUid: '',
        linkedFiles: []
    };

    function getAppState() {
        return window.ZHIYU_APP_STATE || window.AppState || {};
    }

    function getToast() {
        return window.ZHIYU_TOAST || window.Toast || {
            warn: function() {},
            error: function() {}
        };
    }

    function getModal() {
        return window.ZHIYU_MODAL || window.Modal || {
            open: function() {},
            close: function() {}
        };
    }

    function getMemoryBooks() {
        return typeof window.getMemBooks === 'function' ? window.getMemBooks() : {};
    }

    function renderIcon(type) {
        return typeof window.renderLineIcon === 'function' ? window.renderLineIcon(type) : '';
    }

    function collectOutlineContinueFiles(memBook) {
        const files = [];
        Object.keys(memBook || {}).forEach(function(folder) {
            const folderFiles = Array.isArray(memBook[folder]) ? memBook[folder] : [];
            folderFiles.forEach(function(file, idx) {
                if (!file || typeof file !== 'object' || Array.isArray(file)) return;
                files.push(Object.assign({}, file, { _folder: folder, _idx: idx }));
            });
        });
        return files;
    }

    function buildOCTree(treeId, files, mode, onChange) {
        const tree = document.getElementById(treeId);
        if (!tree) return;
        tree.innerHTML = '';

        if (files.length === 0) {
            tree.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:10px;text-align:center;">暂无文件</div>';
            return;
        }

        const grouped = {};
        files.forEach(function(file) {
            const folder = file._folder || '默认文件夹';
            if (!grouped[folder]) grouped[folder] = [];
            grouped[folder].push(file);
        });

        const selectAllId = treeId === 'ocTree1' ? 'btnOCSelectAll1' : 'btnOCSelectAll2';
        const invertId = treeId === 'ocTree1' ? 'btnOCInvert1' : 'btnOCInvert2';

        Object.keys(grouped).forEach(function(folderName) {
            const folderDiv = document.createElement('div');
            folderDiv.className = 'tree-folder';
            const folderArrow = document.createElement('span');
            folderArrow.className = 'oc-folder-arrow';
            folderArrow.setAttribute('aria-hidden', 'true');
            folderArrow.textContent = '⌄';
            const folderLabel = document.createElement('span');
            const folderIcon = document.createElement('span');
            folderIcon.setAttribute('aria-hidden', 'true');
            folderIcon.innerHTML = renderIcon('folder');
            const folderText = document.createElement('span');
            folderText.textContent = ' ' + folderName + ' (' + grouped[folderName].length + ')';
            folderLabel.append(folderIcon, folderText);
            folderDiv.append(folderArrow, folderLabel);
            folderDiv.style.cssText = 'display:flex;align-items:center;gap:6px;padding:5px 8px;font-weight:600;font-size:13px;cursor:pointer;border-radius:6px;user-select:none;';
            folderDiv.setAttribute('role', 'button');
            folderDiv.setAttribute('tabindex', '0');
            folderDiv.setAttribute('aria-expanded', 'true');

            const childrenDiv = document.createElement('div');
            childrenDiv.style.cssText = 'padding-left:16px;';

            grouped[folderName].forEach(function(file) {
                const fileDiv = document.createElement('div');
                fileDiv.className = 'tree-file';
                fileDiv.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 8px;cursor:pointer;font-size:13px;';

                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.style.cssText = 'width:auto;margin:0;flex-shrink:0;';
                cb.dataset.fileName = file.name;
                cb.dataset.folder = file._folder;
                cb.dataset.idx = file._idx;

                if (mode === 'radio') {
                    cb.addEventListener('change', function() {
                        if (this.checked) {
                            tree.querySelectorAll('input[type="checkbox"]').forEach(function(item) {
                                if (item !== cb) item.checked = false;
                            });
                            state.selectedOutline = file;
                        } else {
                            state.selectedOutline = null;
                        }
                        if (onChange) onChange(state.selectedOutline);
                    });
                } else {
                    cb.addEventListener('change', function() {
                        const fullChecked = [];
                        tree.querySelectorAll('input[type="checkbox"]:checked').forEach(function(item) {
                            const found = files.find(function(candidate) {
                                return candidate.name === item.dataset.fileName && candidate._folder === item.dataset.folder;
                            });
                            if (found) {
                                fullChecked.push({
                                    name: found.name,
                                    content: found.content || '',
                                    folder: found._folder,
                                    idx: found._idx,
                                    memFingerprint: window.getRefFileFingerprint?.(found) || ''
                                });
                            }
                        });
                        if (onChange) onChange(fullChecked);
                    });
                }

                fileDiv.appendChild(cb);
                const icon = document.createElement('span');
                icon.innerHTML = renderIcon('file');
                icon.style.cssText = 'flex-shrink:0;';
                fileDiv.appendChild(icon);

                const nameSpan = document.createElement('span');
                nameSpan.textContent = file.name;
                nameSpan.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
                fileDiv.appendChild(nameSpan);

                childrenDiv.appendChild(fileDiv);
            });

            const toggleFolder = function() {
                const isOpen = childrenDiv.style.display !== 'none';
                childrenDiv.style.display = isOpen ? 'none' : '';
                folderDiv.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
                const arrow = folderDiv.querySelector('.oc-folder-arrow');
                if (arrow) arrow.textContent = isOpen ? '›' : '⌄';
            };
            folderDiv.addEventListener('click', toggleFolder);
            folderDiv.addEventListener('keydown', function(event) {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggleFolder();
                }
            });
            childrenDiv.addEventListener('click', function(event) {
                const row = event.target.closest?.('.tree-file');
                if (!row || event.target.matches('input[type="checkbox"]')) return;
                const checkbox = row.querySelector('input[type="checkbox"]');
                checkbox?.click();
            });
            tree.appendChild(folderDiv);
            tree.appendChild(childrenDiv);
        });

        const selectAllBtn = document.getElementById(selectAllId);
        const invertBtn = document.getElementById(invertId);
        const triggerChange = function() {
            tree.querySelectorAll('input[type="checkbox"]').forEach(function(item) {
                item.dispatchEvent(new Event('change'));
            });
        };

        if (selectAllBtn) {
            selectAllBtn.onclick = function() {
                if (mode === 'radio') return;
                tree.querySelectorAll('input[type="checkbox"]').forEach(function(item) {
                    item.checked = true;
                });
                triggerChange();
            };
            selectAllBtn.style.display = mode === 'radio' ? 'none' : '';
        }

        if (invertBtn) {
            invertBtn.onclick = function() {
                if (mode === 'radio') return;
                tree.querySelectorAll('input[type="checkbox"]').forEach(function(item) {
                    item.checked = !item.checked;
                });
                triggerChange();
            };
            invertBtn.style.display = mode === 'radio' ? 'none' : '';
        }
    }

    function openOutlineContinueModal(bookName, memBook) {
        state.selectedOutline = null;
        state.selectedBookName = String(bookName || '');
        state.selectedAccountUid = String(window.AccountDataScope?.getActiveUid?.() || getAppState().auth?.uid || '');
        state.linkedFiles = [];

        const refInput = document.getElementById('ocRefInput');
        if (refInput) refInput.value = '';

        const allFiles = collectOutlineContinueFiles(memBook);

        const outlineFiles = allFiles.filter(function(file) {
            const name = file.name || '';
            return name.includes('_大纲') || name.endsWith('大纲.md') || name.endsWith('大纲');
        });
        const otherFiles = allFiles.filter(function(file) {
            return !outlineFiles.includes(file);
        });

        buildOCTree('ocTree1', outlineFiles, 'radio', function(file) {
            state.selectedOutline = file;
            const filtered = otherFiles.filter(function(candidate) {
                return candidate !== file;
            });
            buildOCTree('ocTree2', filtered, 'checkbox', function(checkedFiles) {
                state.linkedFiles = checkedFiles;
            });
        });

        buildOCTree('ocTree2', otherFiles, 'checkbox', function(checkedFiles) {
            state.linkedFiles = checkedFiles;
        });

        getModal().open('outlineContinueModal');
    }

    function handleOpenOutlineContinue() {
        const appState = getAppState();
        const toast = getToast();
        if (!appState.chapter || !appState.chapter.book) {
            toast.warn('请先选择一个作品');
            return;
        }

        const bookName = appState.chapter.book;
        const memBook = getMemoryBooks()[bookName];
        if (!memBook) {
            toast.warn('当前作品暂无记忆文件，请先生成大纲');
            return;
        }

        openOutlineContinueModal(bookName, memBook);
    }

    function handleConfirmOutlineContinue() {
        const toast = getToast();
        if (!state.selectedOutline) {
            toast.warn('请先选择一个要续写的大纲文件');
            return;
        }

        const outlineContent = state.selectedOutline.content || '';
        if (!outlineContent.trim()) {
            toast.warn('所选大纲文件内容为空');
            return;
        }

        const appState = getAppState();
        const activeUid = String(window.AccountDataScope?.getActiveUid?.() || appState.auth?.uid || '');
        if (activeUid !== state.selectedAccountUid) {
            toast.warn('账号已经切换，请重新选择要续写的大纲');
            return;
        }
        if (String(appState.chapter?.book || '') !== state.selectedBookName) {
            toast.warn('作品已经切换，请重新选择要续写的大纲');
            return;
        }
        const targetFolder = String(state.selectedOutline._folder || '');
        const targetIndex = Number(state.selectedOutline._idx);
        const targetFiles = getMemoryBooks()[state.selectedBookName]?.[targetFolder];
        const targetRecord = Array.isArray(targetFiles) ? targetFiles[targetIndex] : null;
        if (!targetRecord
            || String(targetRecord.name || '') !== String(state.selectedOutline.name || '')
            || String(targetRecord.content || '') !== outlineContent) {
            toast.warn('要续写的大纲已经变化，请重新选择后再生成');
            return;
        }

        window.clearOutlineContinueSession?.();

        getModal().close('outlineContinueModal');

        const resultBox = document.getElementById('outlineResultBox');
        if (resultBox) {
            resultBox.style.color = '';
            // 通过编辑器桥接层写入，确保后续流式追加不会清掉原大纲。
            // textContent 对普通 contenteditable 同样是纯文本写入，不会执行大纲中的 HTML。
            resultBox.textContent = outlineContent;
        }

        const button = document.getElementById('btnStartOutline');
        if (button) {
            button.textContent = '停止生成';
            button.dataset.generating = 'true';
            button.disabled = false;
        }

        appState.outline = appState.outline || {};
        appState.gen = appState.gen || {};
        appState.outline.continueBase = outlineContent;
        appState.outline.continueResult = '';
        const buildFolderSnapshot = window.ZHIYU_OUTLINE_CONTINUE_SAVE?.buildOutlineContinueFolderSnapshot;
        const isPrimaryOutlineFile = window.ZHIYU_OUTLINE_CONTINUE_SAVE?.isPrimaryOutlineMemoryFile;
        const bookOutlineContent = String(window.gB?.()?.[state.selectedBookName]?.outline?.content || '');
        const continueSession = {
            id: 'outline-continue-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10),
            active: true,
            ready: false,
            saved: false,
            accountUid: activeUid,
            bookName: state.selectedBookName,
            folder: targetFolder,
            index: targetIndex,
            name: String(state.selectedOutline.name || ''),
            baseContent: outlineContent,
            linkedFiles: state.linkedFiles.map(function(file) { return Object.assign({}, file); }),
            targetSnapshot: JSON.stringify(targetRecord || {}),
            folderSnapshot: typeof buildFolderSnapshot === 'function'
                ? buildFolderSnapshot(targetFiles)
                : JSON.stringify(Array.isArray(targetFiles) ? targetFiles : []),
            mirrorsBookOutline: typeof isPrimaryOutlineFile === 'function'
                && isPrimaryOutlineFile(state.selectedBookName, state.selectedOutline.name)
                && bookOutlineContent === outlineContent,
            userRef: '',
            generatedContent: '',
            startedAt: Date.now()
        };
        appState.outline.continueSession = continueSession;

        const refInput = document.getElementById('ocRefInput');
        appState.outline.continueRef = refInput ? refInput.value.trim() : '';
        continueSession.userRef = appState.outline.continueRef;

        if (typeof window.startOutlineContinueGenerate === 'function') {
            setTimeout(function() {
                if (appState.outline.continueSession !== continueSession || !continueSession.active) return;
                window.startOutlineContinueGenerate(continueSession);
            }, 300);
        } else {
            toast.error('大纲续写生成入口未加载，请刷新页面重试');
        }
    }

    function bindOutlineContinueModal() {
        const openButton = document.getElementById('btnOutlineContinue');
        if (openButton && openButton.dataset.outlineContinueModalBound !== '1') {
            openButton.dataset.outlineContinueModalBound = '1';
            openButton.addEventListener('click', handleOpenOutlineContinue);
        }

        const confirmButton = document.getElementById('btnOCConfirm');
        if (confirmButton && confirmButton.dataset.outlineContinueConfirmBound !== '1') {
            confirmButton.dataset.outlineContinueConfirmBound = '1';
            confirmButton.addEventListener('click', handleConfirmOutlineContinue);
        }
    }

    window.ZHIYU_OUTLINE_CONTINUE_MODAL = {
        buildOCTree,
        bindOutlineContinueModal,
        openOutlineContinueModal,
        collectOutlineContinueFiles
    };
    window.openOutlineContinueModal = openOutlineContinueModal;

    bindOutlineContinueModal();
})(window, document);
