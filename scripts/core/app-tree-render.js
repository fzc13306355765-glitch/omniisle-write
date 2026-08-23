(function(window) {
    'use strict';

    const AppState = window.ZHIYU_APP_STATE || window.AppState;

    function getCatalogOpenMap(bookName) {
        if (!AppState.ui) AppState.ui = {};
        if (!AppState.ui.catalogOpenVolumes) AppState.ui.catalogOpenVolumes = {};
        if (!AppState.ui.catalogOpenVolumes[bookName]) AppState.ui.catalogOpenVolumes[bookName] = {};
        return AppState.ui.catalogOpenVolumes[bookName];
    }

    function setCatalogVolumeOpen(bookName, vi, isOpen) {
        const map = getCatalogOpenMap(bookName);
        map[String(vi)] = !!isOpen;
    }

    function isCatalogVolumeOpen(bookName, vi) {
        const map = getCatalogOpenMap(bookName);
        const key = String(vi);
        if (Object.prototype.hasOwnProperty.call(map, key)) return !!map[key];
        return true;
    }

    function openOnlyCatalogVolume(bookName, book, vi) {
        if (!book || !Array.isArray(book.volumes)) return;
        const map = {};
        book.volumes.forEach(function(_, idx) {
            map[String(idx)] = idx === vi;
        });
        if (!AppState.ui) AppState.ui = {};
        if (!AppState.ui.catalogOpenVolumes) AppState.ui.catalogOpenVolumes = {};
        AppState.ui.catalogOpenVolumes[bookName] = map;
    }

    function selectVolume(bookName, vi) {
        AppState.ui.selectedVolumeBook = bookName;
        AppState.ui.selectedVolumeVi = vi;
        document.querySelectorAll('#treeContent .chapter-item.selected, #treeContent .vol-item.selected').forEach(function(item) {
            item.classList.remove('selected');
        });
        const target = document.querySelector('#treeContent .vol-item[data-vi="' + vi + '"]');
        if (target) target.classList.add('selected');
    }

    function captureVolumeOpenState(tree) {
        const state = new Map();
        tree.querySelectorAll('.vol-item[data-vi]').forEach(function(volItem) {
            const children = volItem.nextElementSibling;
            if (!children || !children.classList.contains('vol-children')) return;
            state.set(Number(volItem.dataset.vi), children.classList.contains('open'));
        });
        return state;
    }

    function focusTreeChapter(vi, ci) {
        const item = document.querySelector('#treeContent .chapter-item[data-vi="' + vi + '"][data-ci="' + ci + '"]');
        if (item) item.scrollIntoView({ block: 'center' });
    }

    function scrollCatalogToChapter(vi, ci) {
        setTimeout(function() {
            const target = document.querySelector('#treeContent .chapter-item[data-vi="' + vi + '"][data-ci="' + ci + '"]');
            if (target) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }, 30);
    }

    function scrollCatalogToVolume(vi) {
        setTimeout(function() {
            const target = document.querySelector('#treeContent .vol-item[data-vi="' + vi + '"]');
            if (target) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }, 30);
    }

    function preferMemoryFile(current, next) {
        if (!current) return next || null;
        if (!next) return current;
        const currentHasContent = hasRefDisplayContent(current);
        const nextHasContent = hasRefDisplayContent(next);
        if (!currentHasContent && nextHasContent) return next;
        if (currentHasContent && !nextHasContent) return current;
        const currentTime = Date.parse(current.updatedAt || current.createdAt || '') || 0;
        const nextTime = Date.parse(next.updatedAt || next.createdAt || '') || 0;
        return nextTime > currentTime ? next : current;
    }

    function normalizeRefName(name, bookName) {
        let value = String(name || '').replace(/\.md$/i, '');
        const prefix = String(bookName || '') + '_';
        if (bookName && value.indexOf(prefix) === 0) value = value.slice(prefix.length);
        return value;
    }

    function getCurrentRefBookName() {
        return document.getElementById('bookSel')?.value || AppState.chapter?.book || '';
    }

    function getTreeMemoryBooks() {
        if (window.ZHIYU_BOOK_PREVIEW_CONTEXT?.active) {
            const preview = window.ZHIYU_MEMORY_PREVIEW_CONTEXT;
            return preview?.active && preview.books ? preview.books : {};
        }
        return window.getMemBooks?.() || {};
    }

    function readSavedChapterForTree() {
        if (window.ZHIYU_BOOK_PREVIEW_CONTEXT?.active) return null;
        return localStorage.getItem(AccountDataScope.key('novel_current_chapter'));
    }

    function getRefNameAliases(key, bookName) {
        const clean = String(key || '').replace(/\.md$/i, '');
        return [clean, clean + '.md', bookName + '_' + clean, bookName + '_' + clean + '.md'];
    }

    function makeRefFile(key, found, folderName) {
        const iconMap = { '大纲': 'file', '剧情总览': 'file', '拆书设定': 'file', '边界卡': 'file', '追踪表': 'file', '承接卡': 'file', '信息表': 'file', '角色列表': 'file', '设定集': 'file', '关键事件表': 'file', '资料索引': 'file' };
        return {
            icon: iconMap[key] || 'file',
            name: key,
            displayName: key,
            content: found?.content || '',
            isSys: true,
            updatedAt: found?.updatedAt,
            createdAt: found?.createdAt,
            folder: folderName || found?.folder || ''
        };
    }

    function addRefDisplayFile(file, targetList) {
        const allFiles = targetList || window._zhiyuRefDisplayFiles || [];
        if (!file) return;
        if (file.isSys) {
            const existingIndex = allFiles.findIndex(function(item) {
                return item.isSys && item.name === file.name;
            });
            if (existingIndex >= 0) {
                allFiles[existingIndex] = preferMemoryFile(allFiles[existingIndex], file);
                return;
            }
        }
        allFiles.push(file);
    }

    function hasRefDisplayContent(found) {
        const text = String(found?.content || '')
            .replace(/^#\s*(大纲|拆书|仿写)\s*$/gm, '')
            .replace(/^>\s*保存时间：.*$/gm, '')
            .trim();
        return text.length > 0;
    }

    function findRefFileInFolder(folderName, key) {
        const bookName = getCurrentRefBookName();
        const bookMem = getTreeMemoryBooks()[bookName];
        const list = Array.isArray(bookMem?.[folderName]) ? bookMem[folderName] : [];
        const aliases = getRefNameAliases(key, bookName).map(function(name) { return normalizeRefName(name, bookName); });
        const found = list.find(function(file) {
            return aliases.indexOf(normalizeRefName(file?.name || '', bookName)) >= 0;
        });
        return found ? Object.assign({ folder: folderName }, found) : null;
    }

    function findBodyRefFile(key) {
        const bookName = getCurrentRefBookName();
        const bookMem = getTreeMemoryBooks()[bookName];
        if (!bookMem) return null;
        const folders = Object.keys(bookMem).filter(function(folder) {
            const name = String(folder || '');
            return Array.isArray(bookMem[folder])
                && name.indexOf('细纲') < 0
                && name.indexOf('拆书') < 0
                && name.indexOf('仿写') < 0
                && name.indexOf('剧本') < 0;
        });
        let best = null;
        folders.forEach(function(folder) {
            const found = findRefFileInFolder(folder, key);
            if (found) best = preferMemoryFile(best, found);
        });
        return best;
    }

    function refreshTree(options = {}){
        const tree=document.getElementById('treeContent');
        const bookName=document.getElementById('bookSel').value;
        const openState = captureVolumeOpenState(tree);
        openState.forEach(function(isOpen, vi) {
            setCatalogVolumeOpen(bookName, vi, isOpen);
        });
        tree.innerHTML='';
        if(!bookName)return;
        const books=window.gB();
        const book=books[bookName];
        if(!book||!book.volumes)return;

        // 迁移旧数据：把章节列表中名为"大纲"的章节内容迁到 book.outline
        if (!book.outline?.content) {
            for (const vol of book.volumes) {
                const idx = vol.chapters.findIndex(ch => ch.name === '大纲');
                if (idx >= 0) {
                    book.outline = { content: vol.chapters[idx].content, updatedAt: new Date().toISOString() };
                    vol.chapters.splice(idx, 1);
                    window.sB(books);
                    break;
                }
            }
        }

        book.volumes.forEach((vol,vi)=>{
            const volDiv=document.createElement('div');
            volDiv.className='vol-item';
            volDiv.setAttribute('data-vi', vi);
            if (AppState.ui.selectedVolumeBook === bookName && AppState.ui.selectedVolumeVi === vi) {
                volDiv.classList.add('selected');
            }
            volDiv.innerHTML=`<span>${renderLineIcon('folder')} ${Utils.escapeHtml(vol.name)}</span>`;
            volDiv.addEventListener('click', function() {
                selectVolume(bookName, vi);
            });
            volDiv.addEventListener('dblclick',function(){
                const children=this.nextElementSibling;
                if(children) {
                    children.classList.toggle('open');
                    setCatalogVolumeOpen(bookName, vi, children.classList.contains('open'));
                }
            });
            volDiv.addEventListener('contextmenu', function(e) {
                e.preventDefault(); e.stopPropagation();
                showVolumeCtxMenu(e, bookName, vi, vol, book);
            });
            tree.appendChild(volDiv);

            const volChildren=document.createElement('div');
            volChildren.className='vol-children';
            const hasStoredOpenState = openState.has(vi);
            const shouldOpen = options.expandVolumeIndex === vi || (hasStoredOpenState ? openState.get(vi) : isCatalogVolumeOpen(bookName, vi));
            if (options.expandVolumeIndex === vi) setCatalogVolumeOpen(bookName, vi, true);
            if (shouldOpen) volChildren.classList.add('open');
            vol.chapters.forEach((ch,ci)=>{
                const chDiv=document.createElement('div');
                chDiv.className='chapter-item';
                chDiv.setAttribute('data-vi', vi);
                chDiv.setAttribute('data-ci', ci);
                const chWords = countWords(ch.content || '');
                chDiv.innerHTML=`<span class="chapter-title-content">${renderLineIcon('file')} ${Utils.escapeHtml(ch.name)}</span><span class="chapter-word-meta"><span class="ch-status-dot" style="display:${chWords > 0 ? 'inline' : 'none'};color:#27ae60;font-size:14px;">●</span><span class="chapter-word-count">${chWords > 0 ? chWords.toLocaleString() : ''}</span></span>`;
                chDiv.addEventListener('click',async function(){ loadChapter(bookName,vi,ci); });
                chDiv.addEventListener('contextmenu',function(e){ e.preventDefault(); showCtxMenu(e,bookName,vi,ci); });
                chDiv.setAttribute('draggable','true');
                chDiv.addEventListener('dragstart',function(e){ AppState.ui.dragChapter={book:bookName,vi,ci}; setTimeout(()=>this.classList.add('dragging'),0); e.dataTransfer.setData('text/plain',''); });
                chDiv.addEventListener('dragend',function(){ this.classList.remove('dragging'); AppState.ui.dragChapter=null; });
                chDiv.addEventListener('dragover',function(e){ e.preventDefault(); });
                chDiv.addEventListener('drop',function(e){ e.preventDefault(); if(AppState.ui.dragChapter){ moveChapter(AppState.ui.dragChapter.book,AppState.ui.dragChapter.vi,AppState.ui.dragChapter.ci,bookName,vi,ci); AppState.ui.dragChapter=null; } });
                volChildren.appendChild(chDiv);
            });
            tree.appendChild(volChildren);
        });
        if (Number.isInteger(options.selectVolumeIndex) && options.selectVolumeIndex >= 0) {
            selectVolume(bookName, options.selectVolumeIndex);
            const volumeItem = tree.querySelector('.vol-item[data-vi="' + options.selectVolumeIndex + '"]');
            if (volumeItem) volumeItem.scrollIntoView({ block: 'center' });
        }
        if (Number.isInteger(options.scrollToChapterVi) && Number.isInteger(options.scrollToChapterCi)) {
            scrollCatalogToChapter(options.scrollToChapterVi, options.scrollToChapterCi);
        }
        const savedChapter=readSavedChapterForTree();
        if(savedChapter && !(AppState.ui.selectedVolumeBook === bookName && AppState.ui.selectedVolumeVi >= 0)){
            try{
                let {vi,ci,localId}=JSON.parse(savedChapter);
                if (localId) {
                    const savedLocation = window.findChapterLocationByLocalId?.(books, localId, bookName);
                    if (savedLocation?.book === bookName) {
                        vi = savedLocation.vi;
                        ci = savedLocation.ci;
                    }
                }
                const item = tree.querySelector(`[data-vi="${vi}"][data-ci="${ci}"]`);
                if(item){
                    item.classList.add('selected');
                    item.scrollIntoView({block:'center'});
                    // 只有 AppState.chapter 为空时才触发完整加载（初始加载场景）
                    if(AppState.chapter.book !== bookName || AppState.chapter.vi !== vi || AppState.chapter.ci !== ci){
                        loadChapter(bookName,vi,ci);
                    }
                }
            }catch(e){}
        }

        // 底部固定区：关联文件区域
        const refsContainer = document.getElementById('treeRefs');
        refsContainer.innerHTML = '';
        {
            const refFileGroups = {
                body: { label: '正文/拆书', folder: null, keys: ['大纲', '剧情总览', '拆书设定', '边界卡', '追踪表', '承接卡', '信息表', '角色列表', '设定集', '关键事件表', '资料索引'] },
                script: { label: '剧本', folder: '剧本', keys: ['剧本', '分镜', '角色', '场景', '道具'] }
            };
            // 全文分析会确定性保存这三张空卡。它们是后续续写的合法占位文件，
            // 不能因为 content 为空就在作品栏里消失。
            const visibleEmptySystemFiles = new Set(['边界卡', '追踪表', '承接卡']);
            const refIconMap = { '大纲': 'file', '剧情总览': 'file', '拆书设定': 'file', '边界卡': 'file', '追踪表': 'file', '承接卡': 'file', '信息表': 'file', '角色列表': 'file', '设定集': 'file', '关键事件表': 'file', '资料索引': 'file', '剧本': 'file', '分镜': 'file', '角色': 'file', '场景': 'file', '道具': 'file' };
            const refNameAliases = { body: {
                '剧情总览': ['母大纲'],
                '拆书设定': ['拆书', '仿写', '仿写设定'],
                '信息表': ['信息卡'],
                '角色列表': ['角色关系网']
            } };
            const memBooks = getTreeMemoryBooks();
            const bookMem = memBooks[bookName];
            if (!AppState.ui.refFileType || !refFileGroups[AppState.ui.refFileType]) AppState.ui.refFileType = 'body';
            const activeRefType = AppState.ui.refFileType;
            const activeRefGroup = refFileGroups[activeRefType];
            const allFiles = [];

            function normalizeRefDisplayName(name) {
                return normalizeRefName(name || '', bookName);
            }
            function makeGroupedRefFile(key, found, folderName) {
                return {
                    icon: refIconMap[key] || 'file',
                    name: key,
                    displayName: key,
                    content: found?.content || '',
                    isSys: true,
                    updatedAt: found?.updatedAt,
                    createdAt: found?.createdAt,
                    folder: folderName || found?.folder || '',
                    refType: activeRefType
                };
            }
            function findGroupedRefFileInFolder(folderName, key) {
                const files = bookMem && Array.isArray(bookMem[folderName]) ? bookMem[folderName] : [];
                const names = [key].concat((refNameAliases[activeRefType] && refNameAliases[activeRefType][key]) || []);
                const prefixedNames = names.map(function(name) { return bookName + '_' + name; });
                const found = files.find(function(f) {
                    const clean = normalizeRefDisplayName(f.name || '');
                    return names.indexOf(clean) >= 0 || prefixedNames.indexOf(clean) >= 0;
                });
                return found ? { ...found, folder: folderName } : null;
            }
            function findGroupedBodyRefFile(key) {
                const names = [key].concat((refNameAliases.body && refNameAliases.body[key]) || []);
                const prefixedNames = names.map(function(name) { return bookName + '_' + name; });
                let found = null;
                let canonicalFound = false;
                if (bookMem) {
                    for (const folder in bookMem) {
                        if (folder === '仿写' || folder === '拆书' || folder === '剧本' || folder.startsWith('细纲-') || folder.startsWith('拆书-')) continue;
                        const files = Array.isArray(bookMem[folder]) ? bookMem[folder] : [];
                        const candidates = files.filter(function(f) {
                            const clean = normalizeRefDisplayName(f.name || '');
                            return names.indexOf(clean) >= 0 || prefixedNames.indexOf(clean) >= 0;
                        });
                        const canonical = candidates.filter(file => normalizeRefDisplayName(file.name || '') === key);
                        if (canonical.length) {
                            canonical.forEach(candidate => { found = preferMemoryFile(canonicalFound ? found : null, { ...candidate, folder }); });
                            canonicalFound = true;
                        } else if (!canonicalFound) {
                            candidates.forEach(candidate => { found = preferMemoryFile(found, { ...candidate, folder }); });
                        }
                    }
                }
                if (key === '大纲' && book.outline?.content) {
                    found = preferMemoryFile(found, { name: '大纲', content: book.outline.content, updatedAt: book.outline.updatedAt, folder: '' });
                }
                return found;
            }

            if (activeRefType === 'body') {
                activeRefGroup.keys.forEach(function(key) {
                    const found = findGroupedBodyRefFile(key);
                    if (!found || (!hasRefDisplayContent(found) && !visibleEmptySystemFiles.has(key))) return;
                    addRefDisplayFile(makeGroupedRefFile(key, found, ''), allFiles);
                });
                const systemNames = new Set(activeRefGroup.keys);
                Object.values(refNameAliases.body || {}).forEach(function(names) {
                    (names || []).forEach(function(name) { systemNames.add(name); });
                });
                Object.keys(bookMem || {}).forEach(function(folderName) {
                    const folderType = typeof window.zhiyuMemoryFolderType === 'function'
                        ? window.zhiyuMemoryFolderType(folderName)
                        : (/^(默认文件夹|关联文件夹)$/.test(folderName) ? 'associated' : 'custom');
                    if (folderType !== 'associated') return;
                    (bookMem[folderName] || []).forEach(function(file) {
                        const displayName = normalizeRefDisplayName(file?.name || '');
                        if (!displayName || systemNames.has(displayName)) return;
                        addRefDisplayFile({
                            icon: 'file',
                            name: file.name,
                            displayName,
                            content: file.content || '',
                            isSys: false,
                            updatedAt: file.updatedAt,
                            createdAt: file.createdAt,
                            folder: folderName,
                            refType: activeRefType
                        }, allFiles);
                    });
                });
            } else {
                activeRefGroup.keys.forEach(function(key) {
                    addRefDisplayFile(makeGroupedRefFile(key, findGroupedRefFileInFolder(activeRefGroup.folder, key), activeRefGroup.folder), allFiles);
                });
            }

            const fileKey = function(file) { return file.displayName || file.name || ''; };
            const orderedFiles = typeof window.sortRefDisplayFiles === 'function'
                ? window.sortRefDisplayFiles(bookName, activeRefType, allFiles)
                : allFiles.slice();
            const defaultVisibleNames = activeRefType === 'body'
                ? new Set(['大纲', '剧情总览', '设定集', '信息表', '角色列表', '边界卡', '追踪表', '承接卡', '关键事件表', '资料索引'])
                : new Set(activeRefGroup.keys);
            const visibleKey = typeof window.getRefUiPreferenceKey === 'function'
                ? window.getRefUiPreferenceKey(bookName, activeRefType, 'visible')
                : AccountDataScope.key('zhiyu_ref_visible_files_' + bookName + '_' + activeRefType);
            let selectedNames = window.readRefUiPreference?.(visibleKey);
            if (!Array.isArray(selectedNames)) {
                selectedNames = orderedFiles
                    .filter(function(file) {
                        const key = fileKey(file);
                        return !file.isSys
                            || defaultVisibleNames.has(file.name)
                            || defaultVisibleNames.has(key)
                            || /^S\d{2,}阶段粗纲$/i.test(key);
                    })
                    .map(fileKey);
            } else {
                const legacyNames = { '母大纲': '剧情总览', '拆书': '拆书设定', '仿写': '拆书设定', '仿写设定': '拆书设定', '信息卡': '信息表', '角色关系网': '角色列表' };
                selectedNames = Array.from(new Set(selectedNames.map(name => legacyNames[name] || name)));
            }
            const selectedSet = new Set(selectedNames);
            const displayFiles = orderedFiles.filter(function(file) { return selectedSet.has(fileKey(file)); });
            const hiddenFileCount = orderedFiles.length - displayFiles.length;

            const contentRegion = document.createElement('div');
            contentRegion.id = 'refFilesRegionContent';
            contentRegion.style.display = 'contents';
            refsContainer.appendChild(contentRegion);
            const tabRow = document.createElement('div');
            tabRow.style.cssText = 'display:flex;align-items:center;width:100%;border-bottom:1px solid #e5e7eb;margin:0 0 6px;padding:0;';
            Object.keys(refFileGroups).forEach(function(type) {
                const btn = document.createElement('button');
                const active = type === activeRefType;
                btn.type = 'button';
                btn.textContent = refFileGroups[type].label;
                btn.style.cssText = 'position:relative;flex:1;height:30px;border:0;border-radius:0;background:transparent;color:' + (active ? '#1976d2' : '#5f6672') + ';border-bottom:2px solid ' + (active ? '#1976d2' : 'transparent') + ';margin-bottom:-1px;padding:0;font-size:12px;font-weight:700;cursor:pointer;text-align:center;';
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    AppState.ui.refFileType = type;
                    refreshTree();
                });
                tabRow.appendChild(btn);
            });
            contentRegion.appendChild(tabRow);

            const collapsedKey = AccountDataScope.key('zhiyu_ref_files_collapsed_' + bookName);
            AppState.ui.refFilesCollapsed = Number(window.readRefUiPreference?.(collapsedKey)) === 1;
            refsContainer.style.position = 'relative';
            const refsToggleButton = document.createElement('button');
            refsToggleButton.type = 'button';
            refsToggleButton.className = 'ref-files-collapse-toggle';
            refsToggleButton.innerHTML = '<span style="width:18px;height:16px;display:flex;align-items:center;justify-content:center;transform:' + (AppState.ui.refFilesCollapsed ? 'rotate(180deg)' : 'none') + ';transform-origin:center center;"><span style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:7px solid currentColor;border-radius:2px;"></span></span>';
            refsToggleButton.title = AppState.ui.refFilesCollapsed ? '展开关联文件区域' : '收起关联文件区域';
            refsToggleButton.setAttribute('aria-label', refsToggleButton.title);
            refsToggleButton.setAttribute('aria-expanded', String(!AppState.ui.refFilesCollapsed));
            refsToggleButton.setAttribute('aria-controls', contentRegion.id);
            refsToggleButton.style.cssText = 'position:absolute;left:50%;top:0;transform:translate(-50%,-50%);width:34px;height:24px;padding:0;border:1px solid var(--border);border-radius:12px;background:var(--bg-card);color:var(--text-muted);font-weight:800;cursor:pointer;z-index:3;display:flex;align-items:center;justify-content:center;';
            refsToggleButton.addEventListener('click', function(e) {
                e.stopPropagation();
                AppState.ui.refFilesCollapsed = window.updateRefFilesCollapsedPreference(
                    collapsedKey,
                    AppState.ui.refFilesCollapsed
                );
            });
            refsContainer.appendChild(refsToggleButton);
            if (AppState.ui.refFilesCollapsed) {
                contentRegion.style.display = 'none';
                const collapsedSummary = document.createElement('div');
                collapsedSummary.className = 'ref-files-collapsed-summary';
                collapsedSummary.setAttribute('role', 'status');
                collapsedSummary.style.cssText = 'padding:15px 10px 8px;text-align:center;color:var(--text-muted);font-size:11px;line-height:1.45;white-space:normal;';
                if (orderedFiles.length === 0) {
                    collapsedSummary.textContent = '暂无关联文件';
                } else if (displayFiles.length === 0) {
                    collapsedSummary.textContent = '已隐藏 ' + hiddenFileCount + ' 个文件';
                } else if (hiddenFileCount > 0) {
                    collapsedSummary.textContent = '已收起 ' + displayFiles.length + ' 个文件 · 另有 ' + hiddenFileCount + ' 个文件已隐藏';
                } else {
                    collapsedSummary.textContent = '已收起 ' + displayFiles.length + ' 个文件';
                }
                refsContainer.appendChild(collapsedSummary);
                return;
            }

            if (orderedFiles.length === 0) return;

            const titleDiv = document.createElement('div');
            titleDiv.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:11px;font-weight:600;color:var(--text-muted);padding:4px 8px 4px;';
            const titleText = document.createElement('span');
            titleText.textContent = '关联文件区域';
            const settingsButton = document.createElement('button');
            settingsButton.type = 'button';
            settingsButton.className = 'ref-files-settings-trigger';
            settingsButton.textContent = '显示设置';
            settingsButton.style.cssText = 'height:22px;padding:0 7px;border:1px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text-muted);font-size:11px;cursor:pointer;';
            titleDiv.appendChild(titleText);
            titleDiv.appendChild(settingsButton);
            contentRegion.appendChild(titleDiv);

            const settingsPanel = document.createElement('div');
            settingsPanel.className = 'ref-files-settings-panel';
            const settingsOpenKey = typeof window.getRefUiPreferenceKey === 'function'
                ? window.getRefUiPreferenceKey(bookName, activeRefType, 'settingsOpen')
                : AccountDataScope.key('zhiyu_ref_settings_open_' + bookName + '_' + activeRefType);
            const settingsOpen = Number(window.readRefUiPreference?.(settingsOpenKey)) === 1;
            settingsPanel.style.cssText = 'display:' + (settingsOpen ? 'grid' : 'none') + ';position:fixed;left:0;top:0;transform:none;width:min(360px,calc(100vw - 32px));max-height:min(520px,80vh);grid-template-rows:auto minmax(0,1fr) auto;border:1px solid var(--border);border-radius:12px;background:var(--bg-card);color:var(--text);box-shadow:0 20px 45px rgba(15,23,42,.22);z-index:10020;overflow:hidden;';
            settingsPanel.addEventListener('click', function(e) { e.stopPropagation(); });
            let settingsDragged = false;
            function clampSettingsPosition(left, top) {
                const rect = settingsPanel.getBoundingClientRect();
                const width = rect.width || Math.min(360, window.innerWidth - 32);
                const height = rect.height || Math.min(520, window.innerHeight * 0.8);
                const margin = 12;
                return {
                    left: Math.max(margin, Math.min(left, window.innerWidth - width - margin)),
                    top: Math.max(margin, Math.min(top, window.innerHeight - height - margin))
                };
            }
            function positionSettingsPanel() {
                if (settingsDragged || settingsPanel.style.display === 'none') return;
                const buttonRect = settingsButton.getBoundingClientRect();
                const target = clampSettingsPosition(buttonRect.right + 10, buttonRect.top - 12);
                settingsPanel.style.left = target.left + 'px';
                settingsPanel.style.top = target.top + 'px';
            }
            const settingsHeader = document.createElement('div');
            settingsHeader.className = 'ref-files-settings-header';
            settingsHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-bottom:1px solid var(--border);cursor:move;user-select:none;';
            settingsHeader.innerHTML = '<strong style="font-size:14px;color:var(--text);">关联文件显示设置</strong><span style="font-size:12px;color:var(--text-muted);">勾选后在左侧显示</span>';
            settingsHeader.addEventListener('pointerdown', function(e) {
                if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
                e.preventDefault();
                e.stopPropagation();
                settingsDragged = true;
                const pointerId = e.pointerId;
                const startRect = settingsPanel.getBoundingClientRect();
                const offsetX = e.clientX - startRect.left;
                const offsetY = e.clientY - startRect.top;
                function onMove(event) {
                    if (event.pointerId !== pointerId) return;
                    const target = clampSettingsPosition(event.clientX - offsetX, event.clientY - offsetY);
                    settingsPanel.style.left = target.left + 'px';
                    settingsPanel.style.top = target.top + 'px';
                }
                function onUp(event) {
                    if (event.pointerId !== pointerId) return;
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                    window.removeEventListener('pointercancel', onUp);
                }
                settingsHeader.setPointerCapture?.(pointerId);
                window.addEventListener('pointermove', onMove);
                window.addEventListener('pointerup', onUp);
                window.addEventListener('pointercancel', onUp);
            });
            const settingsList = document.createElement('div');
            settingsList.className = 'ref-files-settings-list';
            settingsList.style.cssText = 'display:grid;grid-template-columns:1fr;gap:2px;padding:8px 10px;overflow-y:auto;min-height:0;max-height:390px;';
            let refDragState = null;
            function getRefOrderRows() {
                return Array.from(settingsList.querySelectorAll('[data-ref-order-key]'));
            }
            function clearRefShiftAnimations() {
                getRefOrderRows().forEach(function(row) {
                    row.__refShiftAnimation?.cancel?.();
                    row.__refShiftAnimation = null;
                    row.removeAttribute('data-ref-drag-shifting');
                });
            }
            function animateRefRowShifts(previousRects) {
                getRefOrderRows().forEach(function(row) {
                    if (row === refDragState?.sourceRow || row.style.display === 'none') return;
                    const previousRect = previousRects.get(row);
                    if (!previousRect) return;
                    const deltaY = previousRect.top - row.getBoundingClientRect().top;
                    if (Math.abs(deltaY) < 1) return;
                    row.__refShiftAnimation?.cancel?.();
                    row.setAttribute('data-ref-drag-shifting', '1');
                    if (typeof row.animate !== 'function') return;
                    const animation = row.animate([
                        { transform: 'translateY(' + deltaY + 'px)' },
                        { transform: 'translateY(0)' }
                    ], {
                        duration: 190,
                        easing: 'cubic-bezier(.2,.8,.2,1)'
                    });
                    row.__refShiftAnimation = animation;
                    function clearShiftMarker() {
                        if (row.__refShiftAnimation !== animation) return;
                        row.__refShiftAnimation = null;
                        row.removeAttribute('data-ref-drag-shifting');
                    }
                    animation.onfinish = clearShiftMarker;
                    animation.oncancel = clearShiftMarker;
                });
            }
            function moveFloatingRefRow(clientX, clientY) {
                if (!refDragState) return;
                refDragState.floatingRow.style.left = (clientX - refDragState.pointerOffsetX) + 'px';
                refDragState.floatingRow.style.top = (clientY - refDragState.pointerOffsetY) + 'px';
            }
            function updateRefPlaceholder(clientX, clientY) {
                if (!refDragState) return;
                moveFloatingRefRow(clientX, clientY);
                const listRect = settingsList.getBoundingClientRect();
                const isInside = clientX >= listRect.left && clientX <= listRect.right
                    && clientY >= listRect.top && clientY <= listRect.bottom;
                refDragState.hasValidDrop = isInside;
                refDragState.floatingRow.toggleAttribute('data-ref-drag-outside', !isInside);
                refDragState.floatingRow.style.opacity = isInside ? '.96' : '.62';
                refDragState.placeholder.style.opacity = isInside ? '1' : '.45';
                if (!isInside) return;
                const rows = getRefOrderRows().filter(function(row) {
                    return row !== refDragState.sourceRow;
                });
                let insertionIndex = rows.findIndex(function(row) {
                    const rect = row.getBoundingClientRect();
                    return clientY < rect.top + rect.height / 2;
                });
                if (insertionIndex < 0) insertionIndex = rows.length;
                const visibleItems = Array.from(settingsList.children).filter(function(node) {
                    return node === refDragState.placeholder
                        || (node.hasAttribute?.('data-ref-order-key') && node !== refDragState.sourceRow);
                });
                if (visibleItems.indexOf(refDragState.placeholder) === insertionIndex) return;
                const previousRects = new Map(rows.map(function(row) {
                    return [row, row.getBoundingClientRect()];
                }));
                const nextRow = rows[insertionIndex] || null;
                if (nextRow) settingsList.insertBefore(refDragState.placeholder, nextRow);
                else settingsList.appendChild(refDragState.placeholder);
                refDragState.placeholder.setAttribute('data-ref-placeholder-index', String(insertionIndex));
                animateRefRowShifts(previousRects);
            }
            function readRefPlaceholderOrder() {
                if (!refDragState) return [];
                const nextOrder = [];
                Array.from(settingsList.children).forEach(function(node) {
                    if (node === refDragState.placeholder) {
                        nextOrder.push(refDragState.sourceKey);
                        return;
                    }
                    if (node === refDragState.sourceRow) return;
                    const key = node.getAttribute?.('data-ref-order-key');
                    if (key) nextOrder.push(key);
                });
                return nextOrder;
            }
            function clearRefDragFeedback() {
                if (!refDragState) return;
                const state = refDragState;
                refDragState = null;
                state.removeListeners?.();
                try { state.dragArea.releasePointerCapture?.(state.pointerId); } catch (_) {}
                state.sourceRow.style.display = state.sourceDisplay;
                state.sourceRow.removeAttribute('data-ref-drag-active');
                state.dragArea.style.cursor = state.dragCursor;
                state.placeholder.remove();
                state.floatingRow.remove();
                document.documentElement.style.cursor = state.rootCursor;
                clearRefShiftAnimations();
            }
            function finishRefDrag() {
                if (!refDragState) return;
                const currentOrder = window.getRefDisplayOrder(bookName, activeRefType, orderedFiles);
                const nextOrder = readRefPlaceholderOrder();
                const isCompleteOrder = nextOrder.length === currentOrder.length
                    && currentOrder.every(function(key) { return nextOrder.includes(key); });
                const orderChanged = isCompleteOrder
                    && nextOrder.some(function(key, index) { return key !== currentOrder[index]; });
                clearRefDragFeedback();
                if (orderChanged) {
                    window.updateRefDisplayOrder(bookName, activeRefType, nextOrder, settingsOpenKey);
                }
            }
            function cancelRefDrag() {
                clearRefDragFeedback();
            }
            function beginRefDrag(event, sourceKey, sourceRow, dragArea) {
                cancelRefDrag();
                const sourceRect = sourceRow.getBoundingClientRect();
                const floatingRow = sourceRow.cloneNode(true);
                floatingRow.removeAttribute('data-ref-order-key');
                floatingRow.setAttribute('data-ref-drag-floating', sourceKey);
                floatingRow.setAttribute('aria-hidden', 'true');
                floatingRow.querySelectorAll('[data-ref-drag-key]').forEach(function(node) {
                    node.removeAttribute('data-ref-drag-key');
                });
                floatingRow.style.cssText += 'position:fixed;box-sizing:border-box;margin:0;pointer-events:none;z-index:100000;width:'
                    + sourceRect.width + 'px;height:' + sourceRect.height + 'px;left:' + sourceRect.left + 'px;top:'
                    + sourceRect.top + 'px;background:var(--bg-card,#fff);border:1px solid rgba(59,130,246,.55);box-shadow:0 14px 30px rgba(15,23,42,.25);opacity:.96;transform:scale(1.018);transition:opacity .14s ease,box-shadow .14s ease;';
                const placeholder = document.createElement('div');
                placeholder.setAttribute('data-ref-drag-placeholder', sourceKey);
                placeholder.setAttribute('data-ref-placeholder-index', String(getRefOrderRows().indexOf(sourceRow)));
                placeholder.setAttribute('aria-hidden', 'true');
                placeholder.style.cssText = 'display:flex;align-items:center;justify-content:center;box-sizing:border-box;height:'
                    + sourceRect.height + 'px;min-height:' + sourceRect.height + 'px;border:2px dashed rgba(59,130,246,.7);border-radius:7px;background:rgba(59,130,246,.10);color:#2563eb;font-size:11px;font-weight:700;letter-spacing:.02em;transition:opacity .14s ease,background-color .14s ease;';
                placeholder.textContent = '松开后放在这里';
                settingsList.insertBefore(placeholder, sourceRow);
                document.body.appendChild(floatingRow);
                const pointerId = event.pointerId;
                const rootCursor = document.documentElement.style.cursor;
                refDragState = {
                    sourceKey,
                    sourceRow,
                    sourceDisplay: sourceRow.style.display,
                    dragArea,
                    dragCursor: dragArea.style.cursor,
                    floatingRow,
                    placeholder,
                    pointerId,
                    pointerOffsetX: event.clientX - sourceRect.left,
                    pointerOffsetY: event.clientY - sourceRect.top,
                    rootCursor,
                    hasValidDrop: true,
                    removeListeners: null
                };
                sourceRow.setAttribute('data-ref-drag-active', '1');
                sourceRow.style.display = 'none';
                dragArea.style.cursor = 'grabbing';
                document.documentElement.style.cursor = 'grabbing';
                function onPointerMove(moveEvent) {
                    if (!refDragState || moveEvent.pointerId !== pointerId) return;
                    moveEvent.preventDefault();
                    const listRect = settingsList.getBoundingClientRect();
                    if (moveEvent.clientX >= listRect.left - 24 && moveEvent.clientX <= listRect.right + 24) {
                        if (moveEvent.clientY < listRect.top + 28) settingsList.scrollTop -= 10;
                        else if (moveEvent.clientY > listRect.bottom - 28) settingsList.scrollTop += 10;
                    }
                    updateRefPlaceholder(moveEvent.clientX, moveEvent.clientY);
                }
                function removePointerListeners() {
                    window.removeEventListener('pointermove', onPointerMove);
                    window.removeEventListener('pointerup', onPointerUp);
                    window.removeEventListener('pointercancel', onPointerCancel);
                    document.removeEventListener('keydown', onKeyDown, true);
                }
                function onPointerUp(upEvent) {
                    if (!refDragState || upEvent.pointerId !== pointerId) return;
                    updateRefPlaceholder(upEvent.clientX, upEvent.clientY);
                    if (refDragState?.hasValidDrop) finishRefDrag();
                    else cancelRefDrag();
                }
                function onPointerCancel(cancelEvent) {
                    if (!refDragState || cancelEvent.pointerId !== pointerId) return;
                    cancelRefDrag();
                }
                function onKeyDown(keyEvent) {
                    if (keyEvent.key !== 'Escape') return;
                    keyEvent.preventDefault();
                    cancelRefDrag();
                }
                refDragState.removeListeners = removePointerListeners;
                try { dragArea.setPointerCapture?.(pointerId); } catch (_) {}
                window.addEventListener('pointermove', onPointerMove, { passive: false });
                window.addEventListener('pointerup', onPointerUp);
                window.addEventListener('pointercancel', onPointerCancel);
                document.addEventListener('keydown', onKeyDown, true);
            }
            orderedFiles.forEach(function(file) {
                const key = fileKey(file);
                const row = document.createElement('div');
                row.className = 'ref-files-settings-row';
                row.setAttribute('data-ref-order-key', key);
                row.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) 1px 104px;align-items:center;min-height:34px;border-radius:7px;font-size:13px;color:var(--text);overflow:hidden;transition:transform .19s cubic-bezier(.2,.8,.2,1),background-color .16s ease,box-shadow .16s ease,opacity .16s ease;';
                const label = document.createElement('label');
                label.style.cssText = 'display:grid;grid-template-columns:22px minmax(0,1fr);align-items:center;gap:8px;min-width:0;height:100%;padding:3px 8px;cursor:pointer;';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = selectedSet.has(key);
                checkbox.addEventListener('change', function(e) {
                    e.stopPropagation();
                    selectedNames = window.updateRefVisibilitySetting(key, checkbox.checked, selectedNames, visibleKey, settingsOpenKey);
                });
                label.appendChild(checkbox);
                const name = document.createElement('span');
                name.textContent = key;
                name.title = key;
                name.style.cssText = 'display:block;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
                label.appendChild(name);
                const divider = document.createElement('span');
                divider.setAttribute('aria-hidden', 'true');
                divider.style.cssText = 'width:1px;height:22px;background:var(--border);';
                const dragArea = document.createElement('div');
                dragArea.setAttribute('data-ref-drag-key', key);
                dragArea.title = '按住并上下拖动调整顺序';
                dragArea.setAttribute('aria-label', '按住并上下拖动“' + key + '”调整顺序');
                dragArea.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:6px;min-width:0;height:100%;padding:3px 8px;border-radius:6px;color:var(--text-muted);cursor:grab;user-select:none;touch-action:none;transition:color .16s ease,background-color .16s ease;';
                dragArea.innerHTML = '<span aria-hidden="true" style="font-size:17px;line-height:1;color:currentColor;pointer-events:none;">≡</span><span style="font-size:11px;white-space:nowrap;pointer-events:none;">按住拖动</span>';
                dragArea.addEventListener('pointerdown', function(e) {
                    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
                    e.preventDefault();
                    e.stopPropagation();
                    beginRefDrag(e, key, row, dragArea);
                });
                row.appendChild(label);
                row.appendChild(divider);
                row.appendChild(dragArea);
                settingsList.appendChild(row);
            });
            const settingsFooter = document.createElement('div');
            settingsFooter.className = 'ref-files-settings-footer';
            settingsFooter.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;padding:10px 12px;border-top:1px solid var(--border);background:var(--bg-input);';
            const closeSettings = document.createElement('button');
            closeSettings.type = 'button';
            closeSettings.textContent = '关闭';
            closeSettings.style.cssText = 'height:30px;padding:0 14px;border:1px solid var(--border);border-radius:8px;background:var(--bg-card);color:var(--text);font-size:13px;font-weight:700;cursor:pointer;';
            closeSettings.addEventListener('click', function(e) {
                e.stopPropagation();
                cancelRefDrag();
                window.writeRefUiPreference?.(settingsOpenKey, 0);
                settingsPanel.style.display = 'none';
                settingsDragged = false;
            });
            settingsFooter.appendChild(closeSettings);
            settingsPanel.appendChild(settingsHeader);
            settingsPanel.appendChild(settingsList);
            settingsPanel.appendChild(settingsFooter);
            contentRegion.appendChild(settingsPanel);
            settingsButton.addEventListener('click', function(e) {
                e.stopPropagation();
                const opening = settingsPanel.style.display === 'none';
                settingsPanel.style.display = opening ? 'grid' : 'none';
                window.writeRefUiPreference?.(settingsOpenKey, opening ? 1 : 0);
                if (opening) {
                    settingsDragged = false;
                    requestAnimationFrame(positionSettingsPanel);
                }
            });
            if (settingsPanel.style.display !== 'none') requestAnimationFrame(positionSettingsPanel);

            const MAX_SHOW = 8;
            const moreKey = typeof window.getRefUiPreferenceKey === 'function'
                ? window.getRefUiPreferenceKey(bookName, activeRefType, 'moreExpanded')
                : AccountDataScope.key('zhiyu_ref_more_expanded_' + bookName + '_' + activeRefType);
            let expanded = Number(window.readRefUiPreference?.(moreKey)) === 1;
            const showFiles = expanded ? displayFiles : displayFiles.slice(0, MAX_SHOW);
            const renderRefEntry = (rf, idx) => window.renderRefEntry({ rf, idx, bookName, book });
            showFiles.forEach((rf, i) => { contentRegion.appendChild(renderRefEntry(rf, i)); });
            if (displayFiles.length > MAX_SHOW) {
                const moreDiv = document.createElement('div');
                moreDiv.className = 'chapter-item';
                moreDiv.style.cssText = 'color:#888;font-style:italic;font-size:12px;';
                moreDiv.innerHTML = '<span>' + renderLineIcon('folder') + (expanded ? ' 收起' : ' 更多 ' + (displayFiles.length - MAX_SHOW) + ' 个文件...') + '</span>';
                moreDiv.addEventListener('click', function() {
                    expanded = !expanded;
                    window.writeRefUiPreference?.(moreKey, expanded ? 1 : 0);
                    refreshTree();
                });
                contentRegion.appendChild(moreDiv);
            }
            return;
        }

    }


    window.selectVolume = selectVolume;
    window.getCatalogOpenMap = getCatalogOpenMap;
    window.setCatalogVolumeOpen = setCatalogVolumeOpen;
    window.isCatalogVolumeOpen = isCatalogVolumeOpen;
    window.openOnlyCatalogVolume = openOnlyCatalogVolume;
    window.scrollCatalogToVolume = scrollCatalogToVolume;
    window.scrollCatalogToChapter = scrollCatalogToChapter;
    window.addRefDisplayFile = addRefDisplayFile;
    window.makeRefFile = makeRefFile;
    window.hasRefDisplayContent = hasRefDisplayContent;
    window.findRefFileInFolder = findRefFileInFolder;
    window.findBodyRefFile = findBodyRefFile;
    window.refreshTree = refreshTree;
    window.ZHIYU_TREE_RENDER_READY = true;
})(window);
