(function(window) {
    'use strict';

    const noop = function() {};
    let localLinkReadVersion = 0;
    const confirmedRefSelections = new Map();
    let activeRefSelectionScopeKey = '';
    let refSelectionOpenSnapshot = null;

    function getUtils() {
        return window.ZHIYU_UTILS || window.Utils || { escapeHtml: function(v) { return String(v || ''); } };
    }

    function getToast() {
        return window.ZHIYU_TOAST || window.Toast || { warn: noop, success: noop, error: noop, show: noop };
    }

    function getModal() {
        return window.ZHIYU_MODAL || window.Modal || { open: noop, close: noop };
    }

    function getSelectedBookName() {
        return document.getElementById('bookSel')?.value || '';
    }

    function getCurrentBook(bookName) {
        if (!bookName || typeof window.gB !== 'function') return null;
        const books = window.gB();
        return books ? books[bookName] : null;
    }

    function ensureMemoryBook(bookName) {
        if (typeof window.ensureMemBook === 'function') {
            window.ensureMemBook(bookName);
        }
    }

    function getMemoryBooks() {
        if (typeof window.getMemBooks === 'function') return window.getMemBooks();
        return {};
    }

    function getAppState() {
        const state = window.ZHIYU_APP_STATE || window.AppState || {};
        if (!state.chapter) state.chapter = { book: null, vi: -1, ci: -1 };
        if (!state.gen) state.gen = { templateId: '', refChapters: [], linkedFiles: [], linkedMemoryBookName: '', plotInput: '' };
        if (!state.outlineGen) state.outlineGen = {};
        if (!state.outline) state.outline = {};
        if (!Array.isArray(state.gen.linkedFiles)) state.gen.linkedFiles = [];
        if (!state.gen.linkedFilesByChapter || typeof state.gen.linkedFilesByChapter !== 'object') {
            state.gen.linkedFilesByChapter = {};
        }
        if (!state.gen.linkedDefaultsInitializedByChapter || typeof state.gen.linkedDefaultsInitializedByChapter !== 'object') {
            state.gen.linkedDefaultsInitializedByChapter = {};
        }
        if (typeof state.gen.linkedMemoryChapterScopeKey !== 'string') state.gen.linkedMemoryChapterScopeKey = '';
        if (!Array.isArray(state.outlineGen.linkedFiles)) state.outlineGen.linkedFiles = [];
        if (!Array.isArray(state.gen.refChapters)) state.gen.refChapters = [];
        if (!Array.isArray(state.gen.refSummaries)) state.gen.refSummaries = [];
        if (!Array.isArray(state.gen.refSummaryCandidates)) state.gen.refSummaryCandidates = [];
        if (!Array.isArray(state.gen.keyEventSummaries)) state.gen.keyEventSummaries = [];
        if (!Array.isArray(state.gen.keyEventSummaryCandidates)) state.gen.keyEventSummaryCandidates = [];
        if (!state.assistant) state.assistant = {};
        if (!Array.isArray(state.assistant.linkedFiles)) state.assistant.linkedFiles = [];
        if (!Array.isArray(state.outline.functionalLinkedFiles)) state.outline.functionalLinkedFiles = [];
        if (!Array.isArray(state.outline.outlineAdvancedLinkedFiles)) state.outline.outlineAdvancedLinkedFiles = [];
        return state;
    }

    function getBookScopedSelectionKey(bookName) {
        const normalizedName = String(bookName || '').trim();
        if (!normalizedName) return '';
        const book = getCurrentBook(normalizedName) || {};
        const ownerUid = String(book._ownerUid || window.AccountDataScope?.getActiveUid?.() || getAppState().auth?.uid || 'guest');
        const stableBookId = String(book._bid || book.bookId || book.id || '').trim();
        return ownerUid + '::' + (stableBookId ? ('id:' + stableBookId) : ('name:' + normalizedName));
    }

    function getMemoryLinkContext() {
        if (window._linkMemoryContext === 'outlineAdvanced') return 'outlineAdvanced';
        if (window._linkMemoryContext === 'plot-feedback') return 'plot-feedback';
        if (window._linkMemoryContext === 'fineOutline' || window._linkMemoryContext === 'og') return 'fineOutline';
        return window._linkMemoryContext === 'outlineFunction' ? 'outlineFunction' : 'generate';
    }

    function getMemoryLinkBookName(context) {
        const state = getAppState();
        const selectedBook = getSelectedBookName();
        return String(state.chapter?.book || selectedBook || '').trim();
    }

    function getMemoryLinkFilesForContext(context) {
        const state = getAppState();
        if (context === 'outlineAdvanced') return state.outline.outlineAdvancedLinkedFiles;
        if (context === 'plot-feedback') return state.assistant.linkedFiles;
        if (context === 'fineOutline') return state.outlineGen.linkedFiles;
        return context === 'outlineFunction' ? state.outline.functionalLinkedFiles : state.gen.linkedFiles;
    }

    function getActiveMemoryLinkFiles() {
        return getMemoryLinkFilesForContext(getMemoryLinkContext());
    }

    function setActiveMemoryLinkFiles(files) {
        const state = getAppState();
        if (getMemoryLinkContext() === 'outlineAdvanced') state.outline.outlineAdvancedLinkedFiles = Array.isArray(files) ? files : [];
        else if (getMemoryLinkContext() === 'plot-feedback') state.assistant.linkedFiles = Array.isArray(files) ? files : [];
        else if (getMemoryLinkContext() === 'fineOutline') state.outlineGen.linkedFiles = Array.isArray(files) ? files : [];
        else if (getMemoryLinkContext() === 'outlineFunction') state.outline.functionalLinkedFiles = Array.isArray(files) ? files : [];
        else {
            state.gen.linkedFiles = Array.isArray(files) ? files : [];
            persistActiveGenerationLinkedFiles();
        }
    }

    function ensureGenerationLinkedFilesBook(bookName) {
        const state = getAppState();
        const nextBookName = String(bookName || '').trim();
        const nextScopeKey = getBookScopedSelectionKey(nextBookName);
        const currentBookName = String(state.gen.linkedMemoryBookName || '').trim();
        const currentScopeKey = String(state.gen.linkedMemoryBookScopeKey || '');
        if (currentBookName === nextBookName && currentScopeKey === nextScopeKey) return false;
        state.gen.linkedFiles = [];
        state.gen.linkedFilesByChapter = {};
        state.gen.linkedDefaultsInitializedByChapter = {};
        state.gen.linkedMemoryChapterScopeKey = '';
        state.gen.refChapters = [];
        state.gen.refSummaries = [];
        state.gen.refSummaryCandidates = [];
        state.gen.keyEventSummaries = [];
        state.gen.keyEventSummaryCandidates = [];
        state.gen.keyEventInfo = { eventIds: [] };
        state.gen.refSelectionScopeKey = '';
        state.gen.linkedMemoryBookName = nextBookName;
        state.gen.linkedMemoryBookScopeKey = nextScopeKey;
        return true;
    }

    function cloneGenerationLinkedFiles(files) {
        return (Array.isArray(files) ? files : []).map(function(file) {
            return file && typeof file === 'object' ? Object.assign({}, file) : file;
        });
    }

    function getGenerationChapterSelectionKey(bookName, vi, ci) {
        const normalizedBookName = String(bookName || '').trim();
        const volumeIndex = Number(vi);
        const chapterIndex = Number(ci);
        if (!normalizedBookName || !Number.isInteger(volumeIndex) || volumeIndex < 0 || !Number.isInteger(chapterIndex) || chapterIndex < 0) {
            return '';
        }
        const chapter = getCurrentBook(normalizedBookName)?.volumes?.[volumeIndex]?.chapters?.[chapterIndex];
        if (!chapter) return '';
        const stableChapterId = String(chapter._localId || chapter._cid || chapter.id || '').trim();
        const chapterKey = stableChapterId ? ('id:' + stableChapterId) : ('position:' + volumeIndex + ':' + chapterIndex);
        return getBookScopedSelectionKey(normalizedBookName) + '::chapter:' + chapterKey;
    }

    function persistActiveGenerationLinkedFiles() {
        const state = getAppState();
        const activeKey = String(state.gen.linkedMemoryChapterScopeKey || '');
        if (!activeKey) return false;
        state.gen.linkedFilesByChapter[activeKey] = cloneGenerationLinkedFiles(state.gen.linkedFiles);
        return true;
    }

    function activateGenerationLinkedFilesChapter(bookName, vi, ci, previousContext) {
        const state = getAppState();
        const normalizedBookName = String(bookName || '').trim();
        const nextKey = getGenerationChapterSelectionKey(normalizedBookName, vi, ci);
        const activeKey = String(state.gen.linkedMemoryChapterScopeKey || '');
        const previousBookName = String(previousContext?.bookName || previousContext?.book || '').trim();
        const previousVi = Number(previousContext?.vi);
        const previousCi = Number(previousContext?.ci);
        const previousKey = getGenerationChapterSelectionKey(previousBookName, previousVi, previousCi);

        if (activeKey && activeKey !== nextKey) {
            state.gen.linkedFilesByChapter[activeKey] = cloneGenerationLinkedFiles(state.gen.linkedFiles);
        } else if (!activeKey && previousKey && previousKey !== nextKey && previousBookName === normalizedBookName) {
            state.gen.linkedFilesByChapter[previousKey] = cloneGenerationLinkedFiles(state.gen.linkedFiles);
        }

        if (!nextKey) {
            state.gen.linkedFiles = [];
            state.gen.linkedMemoryChapterScopeKey = '';
            return state.gen.linkedFiles;
        }

        if (activeKey !== nextKey) {
            state.gen.linkedFiles = Object.prototype.hasOwnProperty.call(state.gen.linkedFilesByChapter, nextKey)
                ? cloneGenerationLinkedFiles(state.gen.linkedFilesByChapter[nextKey])
                : [];
        }
        state.gen.linkedMemoryChapterScopeKey = nextKey;
        persistActiveGenerationLinkedFiles();
        return state.gen.linkedFiles;
    }

    function getGenerationLinkedFilesForChapter(bookName, vi, ci) {
        const state = getAppState();
        const targetKey = getGenerationChapterSelectionKey(bookName, vi, ci);
        if (!targetKey) return [];
        if (String(state.gen.linkedMemoryChapterScopeKey || '') !== targetKey) {
            activateGenerationLinkedFilesChapter(bookName, vi, ci);
        }
        return String(state.gen.linkedMemoryChapterScopeKey || '') === targetKey
            ? cloneGenerationLinkedFiles(state.gen.linkedFiles)
            : [];
    }

    function invalidateMemoryLinkFileReads() {
        localLinkReadVersion += 1;
    }

    function getChapterNumberFromName(name) {
        if (typeof window.extractChapterNum === 'function') return window.extractChapterNum(name);
        const match = String(name || '').match(/第\s*([一二三四五六七八九十百千万\d]+)\s*章/);
        if (!match) return null;
        const raw = match[1];
        if (/^\d+$/.test(raw)) return parseInt(raw, 10);
        return null;
    }

    function getCurrentChapterNumberForMemory(bookName) {
        const candidates = getCurrentChapterNumberCandidatesForMemory(bookName);
        return candidates[0] || 1;
    }

    function getCurrentChapterNumberCandidatesForMemory(bookName) {
        const state = getAppState();
        const books = typeof window.gB === 'function' ? window.gB() : {};
        const book = books && books[bookName];
        const vi = state.chapter?.book === bookName && typeof state.chapter?.vi === 'number' ? state.chapter.vi : null;
        const ci = state.chapter?.book === bookName && typeof state.chapter?.ci === 'number' ? state.chapter.ci : null;
        const nums = [];
        if (book && vi !== null && ci !== null && vi >= 0 && ci >= 0) {
            if (typeof window.calculateChapterNumber === 'function') nums.push(window.calculateChapterNumber(book, vi, ci));
            nums.push(ci + 1);
        } else if (ci !== null) {
            nums.push(ci + 1);
        }
        return Array.from(new Set(nums.filter(function(num) {
            return Number.isFinite(num) && num > 0;
        })));
    }

    function getCurrentChapterMemoryFolderName(folderKeyword) {
        const state = getAppState();
        const vi = state.chapter?.vi;
        if (typeof vi !== 'number' || vi < 0) return '';
        return folderKeyword + '-第' + (vi + 1) + '卷';
    }

    function isCurrentChapterMemoryFolder(folderName) {
        const name = String(folderName || '');
        if (name.indexOf('细纲') >= 0) return name === getCurrentChapterMemoryFolderName('细纲');
        if (name.indexOf('拆书') >= 0) return name === getCurrentChapterMemoryFolderName('拆书');
        return false;
    }

    function findCurrentChapterMemoryFile(bookMem, bookName, folderKeyword) {
        if (!bookMem) return null;
        const chapterNums = getCurrentChapterNumberCandidatesForMemory(bookName);
        if (!chapterNums.length) return null;
        const preferredFolder = getCurrentChapterMemoryFolderName(folderKeyword);
        const folders = Object.keys(bookMem).filter(function(folder) {
            return Array.isArray(bookMem[folder]) && folder.indexOf(folderKeyword) >= 0;
        });
        const currentFolders = folders.filter(function(folder) { return isCurrentChapterMemoryFolder(folder); });
        const orderedFolders = preferredFolder && folders.includes(preferredFolder)
            ? [preferredFolder].concat(currentFolders.filter(function(folder) { return folder !== preferredFolder; }))
            : currentFolders;
        for (const folder of orderedFolders) {
            const files = bookMem[folder] || [];
            for (let idx = 0; idx < files.length; idx++) {
                const fileName = files[idx]?.name || '';
                if (chapterNums.indexOf(getChapterNumberFromName(fileName)) >= 0) {
                    return window.createMemoryReferenceSelection?.(bookName, folder, idx)
                        || { name: fileName, memBook: bookName, memFolder: folder, memIdx: idx };
                }
            }
        }
        return null;
    }

    function findCurrentFineOutlineFile(bookMem, bookName) {
        return findCurrentChapterMemoryFile(bookMem, bookName, '细纲');
    }

    function findCurrentDecomposeFile(bookMem, bookName) {
        return findCurrentChapterMemoryFile(bookMem, bookName, '拆书');
    }

    function isFineOutlineOrDecomposeLink(file) {
        const folder = String(file?.memFolder || '');
        return folder.indexOf('细纲') >= 0 || folder.indexOf('拆书') >= 0;
    }

    function addMemoryLinkFileIfMissing(list, file) {
        if (!Array.isArray(list) || !file) return;
        if (!list.some(function(item) {
            return item.memFolder === file.memFolder && item.memIdx === file.memIdx;
        })) {
            list.push(file);
        }
    }

    function addRequiredMemoryLinksToList(book, bookName, list) {
        if (!book || !Array.isArray(list)) return;
        ['关键事件表', '资料索引'].forEach(function(suffix) {
            const expectedNames = [bookName + '_' + suffix, suffix, bookName + '_' + suffix + '.md', suffix + '.md'];
            for (const folder in book) {
                const files = Array.isArray(book[folder]) ? book[folder] : [];
                const idx = files.findIndex(function(file) { return expectedNames.includes(String(file?.name || '')); });
                if (idx >= 0) {
                    addMemoryLinkFileIfMissing(list, window.createMemoryReferenceSelection?.(bookName, folder, idx)
                        || { name: files[idx].name, memBook: bookName, memFolder: folder, memIdx: idx });
                    return;
                }
            }
        });
    }

    const ADVANCED_OUTLINE_DEFAULT_LINK_GROUPS = [
        ['资料索引', '剧情索引'],
        ['关键事件表', '关键事件'],
        ['信息表', '信息卡'],
        ['角色列表', '角色关系网'],
        ['设定集']
    ];

    function initializeAdvancedOutlineLinkDefaults(book, bookName, outlineState) {
        if (!book || !bookName || !outlineState || !Array.isArray(outlineState.outlineAdvancedLinkedFiles)) return;
        if (outlineState.outlineAdvancedLinkedDefaultsBook === bookName) return;
        outlineState.outlineAdvancedLinkedDefaultsBook = bookName;
        ADVANCED_OUTLINE_DEFAULT_LINK_GROUPS.forEach(function(aliases) {
            let match = null;
            for (const folder in book) {
                const files = Array.isArray(book[folder]) ? book[folder] : [];
                const idx = files.findIndex(function(file) {
                    const clean = cleanLinkFileName(file?.name, bookName);
                    return aliases.includes(clean);
                });
                if (idx >= 0) {
                    match = window.createMemoryReferenceSelection?.(bookName, folder, idx)
                        || { name: files[idx].name, memBook: bookName, memFolder: folder, memIdx: idx };
                    break;
                }
            }
            addMemoryLinkFileIfMissing(outlineState.outlineAdvancedLinkedFiles, match);
        });
    }

    function getActiveMemoryLinkContext() {
        return getMemoryLinkContext();
    }

    function openLinkMemorySelector() {
        const state = getAppState();
        window._linkMemoryContext = 'generate';
        const bookName = getMemoryLinkBookName('generate');
        ensureGenerationLinkedFilesBook(bookName);
        activateGenerationLinkedFilesChapter(bookName, state.chapter?.vi, state.chapter?.ci);
        const chapterScopeKey = String(state.gen.linkedMemoryChapterScopeKey || '');
        if (bookName) {
            const memBooks = getMemoryBooks();
            const book = memBooks[bookName];
            if (book && chapterScopeKey && !state.gen.linkedDefaultsInitializedByChapter[chapterScopeKey]) {
                const outlineAutoName = `${bookName}_大纲`;
                const autoGroups = [
                    [`${bookName}_设定集`],
                    [`${bookName}_信息表`, `${bookName}_信息卡`],
                    [`${bookName}_角色列表`, `${bookName}_角色关系网`],
                    [`${bookName}_边界卡`],
                    [`${bookName}_追踪表`],
                    [`${bookName}_承接卡`]
                ];
                const autoNames = autoGroups.flat();
                state.gen.linkedFiles = state.gen.linkedFiles.filter(function(file) {
                    return file.name !== outlineAutoName && !autoNames.includes(file.name) && !isFineOutlineOrDecomposeLink(file);
                });
                for (const candidates of autoGroups) {
                    let preferred = null;
                    for (const name of candidates) {
                        for (const folder in book) {
                            const idx = Array.isArray(book[folder]) ? book[folder].findIndex(file => file.name === name) : -1;
                            if (idx >= 0) {
                                preferred = window.createMemoryReferenceSelection?.(bookName, folder, idx)
                                    || { name, memBook: bookName, memFolder: folder, memIdx: idx };
                                break;
                            }
                        }
                        if (preferred) break;
                    }
                    if (preferred) addMemoryLinkFileIfMissing(state.gen.linkedFiles, preferred);
                }
                addRequiredMemoryLinksToList(book, bookName, state.gen.linkedFiles);
                const fineOutlineFile = findCurrentFineOutlineFile(book, bookName);
                addMemoryLinkFileIfMissing(state.gen.linkedFiles, fineOutlineFile);
                window._memoryLinkAutoFocusTarget = fineOutlineFile || null;
                state.gen.linkedDefaultsInitializedByChapter[chapterScopeKey] = true;
                persistActiveGenerationLinkedFiles();
            } else if (book && chapterScopeKey) {
                window._memoryLinkAutoFocusTarget = state.gen.linkedFiles.find(isFineOutlineOrDecomposeLink) || null;
            }
        }
        getModal().open('memoryLinkModal');
        refreshMemoryLinkTree();
        updateLinkedMemoryCount();
    }

    function openOutlineFunctionLinkSelector() {
        const state = getAppState();
        window._linkMemoryContext = 'outlineFunction';
        const bookName = getMemoryLinkBookName('outlineFunction');
        if (!bookName) {
            getToast().warn('请先选择书籍');
            return;
        }
        if (!Array.isArray(state.outline.functionalLinkedFiles)) state.outline.functionalLinkedFiles = [];
        getModal().open('memoryLinkModal');
        refreshMemoryLinkTree();
        updateLinkedMemoryCount();
    }

    function openAdvancedOutlineLinkSelector() {
        const state = getAppState();
        window._linkMemoryContext = 'outlineAdvanced';
        const bookName = getMemoryLinkBookName('outlineAdvanced');
        if (!bookName) { getToast().warn('请先选择书籍'); return; }
        if (!Array.isArray(state.outline.outlineAdvancedLinkedFiles)) state.outline.outlineAdvancedLinkedFiles = [];
        initializeAdvancedOutlineLinkDefaults(getMemoryBooks()[bookName], bookName, state.outline);
        getModal().open('memoryLinkModal');
        refreshMemoryLinkTree();
        updateLinkedMemoryCount();
    }

    function getChapterReferenceMeta(book, vi, ci) {
        const chapter = book?.volumes?.[vi]?.chapters?.[ci];
        if (!chapter) return null;
        return {
            vi,
            ci,
            chapterIndex: typeof window.calculateChapterNumber === 'function' ? window.calculateChapterNumber(book, vi, ci) : ci + 1,
            chapterName: chapter.name || '',
            localId: chapter._localId || ''
        };
    }

    function getPreviousChapterReferenceMetas(book, vi, ci, limit) {
        const result = [];
        if (!book || vi < 0 || ci < 0) return result;
        for (let v = vi; v >= 0 && result.length < limit; v--) {
            const chapters = book.volumes?.[v]?.chapters || [];
            const start = v === vi ? ci - 1 : chapters.length - 1;
            for (let c = start; c >= 0 && result.length < limit; c--) {
                const meta = getChapterReferenceMeta(book, v, c);
                if (meta) result.push(meta);
            }
        }
        return result;
    }

    function getSavedSummaryReference(bookName, meta) {
        if (!bookName || !meta || typeof window.findSavedChapterSummary !== 'function') return null;
        const saved = window.findSavedChapterSummary({
            bookName,
            vi: meta.vi,
            ci: meta.ci,
            localId: meta.localId || '',
            chapterNum: meta.chapterIndex,
            chapterName: meta.chapterName
        });
        const content = String(saved?.content || '').trim();
        if (!content) return null;
        return Object.assign({}, meta, { content });
    }

    function getChapterMetaByNumber(book, chapterNum) {
        const target = Number(chapterNum);
        if (!book || !Number.isFinite(target) || target <= 0) return null;
        let fallbackIndex = 0;
        for (let vi = 0; vi < (book.volumes || []).length; vi++) {
            const chapters = book.volumes[vi]?.chapters || [];
            for (let ci = 0; ci < chapters.length; ci++) {
                fallbackIndex += 1;
                const num = typeof window.calculateChapterNumber === 'function'
                    ? window.calculateChapterNumber(book, vi, ci)
                    : fallbackIndex;
                if (Number(num) === target) return getChapterReferenceMeta(book, vi, ci);
            }
        }
        return null;
    }

    function getExactOutlineEventIds(text) {
        const ids = typeof window.getOutlineEventIds === 'function'
            ? window.getOutlineEventIds(text)
            : (String(text || '').match(/\bF-\d{3,}\b/g) || []);
        return Array.from(new Set((ids || []).map(function(id) { return String(id || '').toUpperCase(); }).filter(Boolean)));
    }

    function getStageCoarseOutlineFiles(bookMem) {
        const result = [];
        Object.keys(bookMem || {}).forEach(function(folder) {
            const files = Array.isArray(bookMem[folder]) ? bookMem[folder] : [];
            files.forEach(function(file) {
                const name = String(file?.name || '');
                const content = String(file?.content || '');
                const stageMatch = name.match(/^(S\d{1,3})\s*阶段粗纲/i);
                if (!stageMatch && !/^#\s*阶段粗纲[:：]/m.test(content)) return;
                if (!getExactOutlineEventIds(content).length) return;
                result.push({
                    name,
                    folder,
                    stageKey: stageMatch ? ('S' + String(Number(stageMatch[1].slice(1))).padStart(2, '0')) : '',
                    content
                });
            });
        });
        return result;
    }

    function isStageChapterHeading(line) {
        return /^\s*(?:#{1,6}\s*)?第\s*[一二三四五六七八九十百千万\d]+\s*章/.test(String(line || ''));
    }

    function parseStageChapterBlocks(stageFile) {
        const lines = String(stageFile?.content || '').split(/\r?\n/);
        const blocks = [];
        let current = null;
        lines.forEach(function(line) {
            const chapterNum = isStageChapterHeading(line) ? getChapterNumberFromName(line) : null;
            if (chapterNum) {
                if (current) blocks.push(current);
                current = { chapterNum, lines: [line], stageKey: stageFile.stageKey || '', stageName: stageFile.name || '' };
            } else if (current) {
                current.lines.push(line);
            }
        });
        if (current) blocks.push(current);
        return blocks.map(function(block) {
            const text = block.lines.join('\n');
            return Object.assign(block, {
                content: text,
                eventIds: getExactOutlineEventIds(text)
            });
        }).filter(function(block) {
            return block.eventIds.length > 0;
        });
    }

    function extractEventNameFromBlocks(blocks, eventId) {
        const escaped = String(eventId || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(escaped + '\\s*[：:\\-—]?\\s*([^\\n，。；;、]{0,40})');
        for (const block of blocks || []) {
            const match = String(block.content || '').match(pattern);
            const name = String(match?.[1] || '').trim();
            if (name && !/^\s*$/.test(name)) return name;
        }
        return '';
    }

    function collectKeyEventSummaryCandidates(bookName, book, currentMeta) {
        const empty = { eventIds: [], refs: [] };
        if (!bookName || !book || !currentMeta) return empty;
        const bookMem = getMemoryBooks()?.[bookName] || {};
        const blocks = getStageCoarseOutlineFiles(bookMem).flatMap(parseStageChapterBlocks);
        if (!blocks.length) return empty;
        const currentChapterNum = Number(currentMeta.chapterIndex || 0);
        const currentIds = Array.from(new Set(blocks
            .filter(function(block) { return Number(block.chapterNum) === currentChapterNum; })
            .flatMap(function(block) { return block.eventIds || []; })));
        if (!currentIds.length) return empty;
        const currentIdSet = new Set(currentIds);
        const byChapter = new Map();
        blocks.forEach(function(block) {
            if (Number(block.chapterNum) >= currentChapterNum) return;
            const shared = (block.eventIds || []).filter(function(id) { return currentIdSet.has(id); });
            if (!shared.length) return;
            const meta = getChapterMetaByNumber(book, block.chapterNum);
            if (!meta) return;
            const key = meta.vi + ':' + meta.ci;
            const saved = getSavedSummaryReference(bookName, meta);
            const existing = byChapter.get(key) || Object.assign({}, meta, {
                content: '',
                missingSummary: true,
                eventIds: [],
                eventId: '',
                eventName: '',
                stageKey: block.stageKey || ''
            });
            existing.eventIds = Array.from(new Set(existing.eventIds.concat(shared)));
            existing.eventId = existing.eventIds.join('、');
            existing.eventName = extractEventNameFromBlocks(blocks, existing.eventIds[0]);
            existing.stageKey = existing.stageKey || block.stageKey || '';
            if (saved) {
                existing.content = saved.content;
                existing.missingSummary = false;
            }
            byChapter.set(key, existing);
        });
        return {
            eventIds: currentIds,
            refs: Array.from(byChapter.values()).sort(function(left, right) {
                return Number(right.chapterIndex || 0) - Number(left.chapterIndex || 0);
            })
        };
    }

    function cloneRefList(items) {
        return Array.isArray(items) ? items.map(function(item) { return Object.assign({}, item); }) : [];
    }

    function getCurrentRefSelectionScopeKey(bookName, state) {
        const bookScopeKey = getBookScopedSelectionKey(bookName);
        const vi = Number(state.chapter?.vi);
        const ci = Number(state.chapter?.ci);
        if (!bookScopeKey || state.chapter?.book !== bookName || !Number.isInteger(vi) || !Number.isInteger(ci) || vi < 0 || ci < 0) return '';
        const chapter = getCurrentBook(bookName)?.volumes?.[vi]?.chapters?.[ci];
        const stableChapterId = String(chapter?._cid || chapter?._localId || chapter?.id || chapter?._id || '').trim();
        return bookScopeKey + '::chapter:' + (stableChapterId ? encodeURIComponent(stableChapterId) : vi + ':' + ci);
    }

    function captureRefSelection(state) {
        return {
            refChapters: cloneRefList(state.gen.refChapters),
            refSummaries: cloneRefList(state.gen.refSummaries),
            keyEventSummaries: cloneRefList(state.gen.keyEventSummaries)
        };
    }

    function restoreRefSelection(state, selection) {
        const safeSelection = selection || {};
        const summaryKeys = new Set(cloneRefList(safeSelection.refSummaries).map(function(ref) { return ref.vi + ':' + ref.ci; }));
        const keyEventKeys = new Set(cloneRefList(safeSelection.keyEventSummaries).map(function(ref) { return ref.vi + ':' + ref.ci; }));
        state.gen.refChapters = cloneRefList(safeSelection.refChapters);
        state.gen.refSummaries = state.gen.refSummaryCandidates.filter(function(ref) {
            return summaryKeys.has(ref.vi + ':' + ref.ci);
        });
        state.gen.keyEventSummaries = state.gen.keyEventSummaryCandidates.filter(function(ref) {
            return keyEventKeys.has(ref.vi + ':' + ref.ci) && String(ref.content || '').trim() && !ref.missingSummary;
        });
    }

    function updateRefSelectionCount(state) {
        const total = (state.gen.refChapters || []).length
            + (state.gen.refSummaries || []).length
            + (state.gen.keyEventSummaries || []).length;
        const refCount = document.getElementById('refChapterCount');
        if (refCount) refCount.textContent = `已选择 ${total}`;
        const composerRefCount = document.getElementById('composerRefChapterCount');
        if (composerRefCount) composerRefCount.textContent = `已选择 ${total}`;
        window.updateChapterComposerState?.();
        return total;
    }

    function openRefChapterSelector() {
        const state = getAppState();
        const bookName = getMemoryLinkBookName();
        if (!bookName) {
            getToast().warn('请选择书籍');
            return;
        }

        const selectionScopeKey = getCurrentRefSelectionScopeKey(bookName, state);
        if (state.chapter && state.chapter.book === bookName && selectionScopeKey) {
            const book = getCurrentBook(bookName);
            const previous = getPreviousChapterReferenceMetas(book, state.chapter.vi, state.chapter.ci, 6);
            const defaultBodies = previous.slice(0, 3).map(function(meta) {
                return { vi: meta.vi, ci: meta.ci };
            });
            state.gen.refSummaryCandidates = previous.slice(3, 6).map(function(meta) {
                return getSavedSummaryReference(bookName, meta);
            }).filter(Boolean);
            const currentMeta = getChapterReferenceMeta(book, state.chapter.vi, state.chapter.ci);
            const keyEvent = collectKeyEventSummaryCandidates(bookName, book, currentMeta);
            state.gen.keyEventSummaryCandidates = keyEvent.refs;
            state.gen.keyEventInfo = { eventIds: keyEvent.eventIds };
            refSelectionOpenSnapshot = state.gen.refSelectionScopeKey === selectionScopeKey
                ? captureRefSelection(state)
                : { refChapters: [], refSummaries: [], keyEventSummaries: [] };
            const confirmed = confirmedRefSelections.get(selectionScopeKey);
            restoreRefSelection(state, confirmed || {
                refChapters: defaultBodies,
                refSummaries: [],
                keyEventSummaries: []
            });
            activeRefSelectionScopeKey = selectionScopeKey;
            state.gen.refSelectionScopeKey = selectionScopeKey;
        } else {
            refSelectionOpenSnapshot = captureRefSelection(state);
            activeRefSelectionScopeKey = '';
            state.gen.refChapters = [];
            state.gen.refSummaries = [];
            state.gen.refSummaryCandidates = [];
            state.gen.keyEventSummaryCandidates = [];
            state.gen.keyEventSummaries = [];
            state.gen.keyEventInfo = { eventIds: [] };
        }

        const modal = document.getElementById('refChapterModal');
        if (modal) modal.style.display = 'flex';
        window.renderRefChapterList?.(bookName);
        setTimeout(() => {
            const checked = document.querySelector('#refChapterList input:checked');
            if (checked) checked.closest('.ref-chapter-row')?.scrollIntoView({ block: 'center' });
        }, 100);
    }

    function cancelRefChapters() {
        const state = getAppState();
        restoreRefSelection(state, refSelectionOpenSnapshot);
        updateRefSelectionCount(state);
        refSelectionOpenSnapshot = null;
        activeRefSelectionScopeKey = '';
        const modal = document.getElementById('refChapterModal');
        if (modal) modal.style.display = 'none';
    }

    function getFolderSortWeight(folderName) {
        if (typeof window.getMemFolderSortWeight === 'function') return window.getMemFolderSortWeight(folderName);
        return 99;
    }

    function renderIcon(kind) {
        if (typeof window.renderLineIcon === 'function') return window.renderLineIcon(kind);
        return '';
    }

    const ASSOCIATED_LINK_FILE_DEFS = [
        { aliases: ['追踪卡', '追踪表'] },
        { aliases: ['边界卡'] },
        { aliases: ['承接卡'] },
        { aliases: ['设定集'] },
        { aliases: ['信息表', '信息卡'] },
        { aliases: ['角色列表', '角色关系网'] },
        { aliases: ['关键事件表'] },
        { aliases: ['资料索引'] }
    ];
    const OUTLINE_LINK_FILE_DEFS = [
        { aliases: ['大纲'] },
        { aliases: ['章节粗纲'] },
        { aliases: ['剧情总览', '母纲', '母大纲'] },
        { aliases: ['拆书设定', '拆书', '仿写设定', '仿写'] }
    ];

    function getAssociatedDefaultFolder(memBooks, bookName) {
        if (typeof window.getAssociatedMemoryDefaultFolder === 'function') {
            return window.getAssociatedMemoryDefaultFolder(memBooks, bookName);
        }
        const book = memBooks?.[bookName] || {};
        if (Array.isArray(book['关联文件夹'])) return '关联文件夹';
        if (Array.isArray(book['默认文件夹'])) return '默认文件夹';
        return '';
    }

    function cleanLinkFileName(fileName, bookName) {
        const normalize = typeof window.normalizeMemoryFileName === 'function'
            ? window.normalizeMemoryFileName
            : function(value) { return String(value || '').replace(/\.md$/i, ''); };
        let clean = normalize(fileName || '');
        if (clean.startsWith(bookName + '_')) clean = clean.substring(bookName.length + 1);
        return clean;
    }

    function getLinkDisplayName(fileName, bookName) {
        const clean = cleanLinkFileName(fileName, bookName);
        if (clean === '信息卡') return '信息表';
        if (clean === '角色关系网') return '角色列表';
        if (clean === '母大纲') return '剧情总览';
        if (clean === '拆书' || clean === '仿写' || clean === '仿写设定') return '拆书设定';
        return clean || fileName || '未命名文件';
    }

    function matchesLinkAliases(entry, aliases, bookName) {
        const clean = cleanLinkFileName(entry.file?.name, bookName);
        return aliases.some(function(alias) { return clean === alias || clean.endsWith('_' + alias); });
    }

    function pickOrderedLinkEntries(entries, definitions, used, bookName) {
        const result = [];
        definitions.forEach(function(definition) {
            entries.forEach(function(entry) {
                const key = entry.folder + ':' + entry.idx;
                if (!used.has(key) && matchesLinkAliases(entry, definition.aliases, bookName)) {
                    used.add(key);
                    result.push(entry);
                }
            });
        });
        return result;
    }

    function renderMemoryLinkCard(entry, activeFiles, bookName) {
        const utils = getUtils();
        const fileName = entry.file?.name || '';
        const checked = activeFiles.some(function(file) {
            return file.memFolder === entry.folder && file.memIdx === entry.idx;
        });
        const className = checked ? 'link-file-card checked' : 'link-file-card';
        const safeFolder = utils.escapeHtml(entry.folder);
        const safeFileName = utils.escapeHtml(fileName);
        const safeDisplayName = utils.escapeHtml(getLinkDisplayName(fileName, bookName));
        return '<div class="' + className + '" data-folder="' + safeFolder + '" data-idx="' + entry.idx + '" data-name="' + safeFileName + '">' +
            '<input type="checkbox" class="link-file-cb" data-folder="' + safeFolder + '" data-idx="' + entry.idx + '" aria-label="选择' + safeDisplayName + '" ' + (checked ? 'checked' : '') + '>' +
            '<span class="memory-link-card-icon">' + renderIcon('file') + '</span>' +
            '<span class="memory-link-card-name" title="' + safeFileName + '">' + safeDisplayName + '</span>' +
            '</div>';
    }

    function renderMemoryLinkCards(entries, activeFiles, bookName) {
        if (!entries.length) return '<div class="memory-link-empty">暂无可选文件</div>';
        return '<div class="memory-link-grid">' + entries.map(function(entry) {
            return renderMemoryLinkCard(entry, activeFiles, bookName);
        }).join('') + '</div>';
    }

    const MEMORY_LINK_CHIP_SOURCE_LABELS = Object.freeze({
        associated: '关联文件',
        'fine-outline': '细纲',
        decompose: '拆书',
        summary: '剧情梗概',
        custom: '用户上传或自定义文件'
    });

    function getMemoryLinkChipSource(file, associatedFolders) {
        const folder = String(file?.memFolder || file?.folder || '').trim();
        const name = String(file?.name || '').trim();
        if (!folder || file?.sourceType === 'local-upload') return 'custom';
        if (/细纲|细纲文件/.test(folder)) return 'fine-outline';
        if (/拆书|拆书文件/.test(folder)) return 'decompose';
        if (/章节概要|剧情梗概|剧情总览|剧情总结|总结概括/.test(folder + ' ' + name)) return 'summary';
        if (/^(默认文件夹|关联文件夹)$/.test(folder) || associatedFolders?.has?.(folder)) return 'associated';
        return 'custom';
    }

    function renderSelectedMemoryLinks(activeFiles, book, bookName, associatedFolders) {
        const utils = getUtils();
        if (!activeFiles.length) return '<div class="memory-link-empty selected">未选择文件</div>';
        return '<div class="memory-link-selected-list">' + activeFiles.map(function(file, index) {
            const storedName = file.name || (file.memFolder && book[file.memFolder]?.[file.memIdx]?.name) || '本地文件';
            const label = getLinkDisplayName(storedName, bookName);
            const source = getMemoryLinkChipSource(file, associatedFolders);
            const sourceLabel = MEMORY_LINK_CHIP_SOURCE_LABELS[source];
            return '<span class="memory-link-chip memory-link-chip-source-' + source + '" data-source-kind="' + source + '" title="' + utils.escapeHtml(storedName + '｜来源：' + sourceLabel) + '">' +
                '<span>' + utils.escapeHtml(label) + '</span>' +
                '<button type="button" class="memory-link-chip-remove" data-selected-index="' + index + '" aria-label="移除' + utils.escapeHtml(label) + '">&times;</button>' +
                '</span>';
        }).join('') + '</div>';
    }

    function renderMemoryLinkSection(title, bodyHtml, flexStyle) {
        return '<section class="memory-link-section" style="' + flexStyle + '">' +
            '<div class="memory-link-section-title"><span>' + title + '</span></div>' +
            '<div class="memory-link-section-body">' + bodyHtml + '</div>' +
            '</section>';
    }

    function refreshMemoryLinkTree() {
        const tree = document.getElementById('memoryLinkTree');
        const foldersPanel = document.getElementById('memoryLinkFolders');
        if (!tree) return;
        tree.innerHTML = '';
        if (foldersPanel) foldersPanel.innerHTML = '';

        const bookName = getMemoryLinkBookName();
        if (!bookName) {
            tree.innerHTML = '<div style="color:#888;font-size:13px;padding:10px;">请先在写作模块选择书籍</div>';
            return;
        }

        const memBooks = getMemoryBooks();
        const book = memBooks[bookName];
        if (!book) {
            tree.innerHTML = '<div style="color:#888;font-size:13px;padding:10px;">暂无关联文件的记忆书籍，请导入</div>';
            return;
        }

        const physicalFolderNames = Object.keys(book).filter(k => Array.isArray(book[k])).sort(function(a, b) {
            const aw = getFolderSortWeight(a);
            const bw = getFolderSortWeight(b);
            if (aw !== bw) return aw - bw;
            return a.localeCompare(b, 'zh-Hans-CN');
        });

        if (physicalFolderNames.length === 0) {
            tree.innerHTML = '<div style="color:#888;font-size:13px;padding:10px;">暂无文件夹，请在记忆模块中创建</div>';
            return;
        }

        const defaultFolder = getAssociatedDefaultFolder(memBooks, bookName);
        const knownParentAliases = ASSOCIATED_LINK_FILE_DEFS
            .concat(OUTLINE_LINK_FILE_DEFS)
            .flatMap(function(definition) { return definition.aliases; });
        const associatedPhysicalFolders = new Set(physicalFolderNames.filter(function(folderName) {
            if (folderName === defaultFolder || folderName === '默认文件夹' || folderName === '关联文件夹') return true;
            const cleanFolderName = cleanLinkFileName(folderName, bookName);
            return knownParentAliases.some(function(alias) {
                return cleanFolderName === alias || cleanFolderName.endsWith('_' + alias);
            });
        }));
        const associatedViewId = '__memory_link_associated__';
        const folderViews = [];
        if (associatedPhysicalFolders.size) {
            folderViews.push({
                id: associatedViewId,
                label: '关联文件',
                folders: Array.from(associatedPhysicalFolders),
                associated: true
            });
        }
        physicalFolderNames.forEach(function(folderName) {
            if (!associatedPhysicalFolders.has(folderName)) {
                folderViews.push({ id: folderName, label: folderName, folders: [folderName], associated: false });
            }
        });

        let selectedFolder = folderViews[0].id;
        const focusTarget = window._memoryLinkAutoFocusTarget;
        if (focusTarget && physicalFolderNames.includes(focusTarget.memFolder)) {
            selectedFolder = associatedPhysicalFolders.has(focusTarget.memFolder)
                ? associatedViewId
                : focusTarget.memFolder;
        }
        const selectedChapterFile = (getActiveMemoryLinkFiles() || []).find(function(f) {
            return f.memFolder && physicalFolderNames.includes(f.memFolder) && isFineOutlineOrDecomposeLink(f);
        });
        if (!focusTarget && selectedChapterFile) {
            selectedFolder = associatedPhysicalFolders.has(selectedChapterFile.memFolder)
                ? associatedViewId
                : selectedChapterFile.memFolder;
        }
        const currentChapterNums = getCurrentChapterNumberCandidatesForMemory(bookName);

        function renderFileGrid(folderViewId) {
            const folderView = folderViews.find(function(view) { return view.id === folderViewId; }) || folderViews[0];
            selectedFolder = folderView.id;
            if (foldersPanel) {
                foldersPanel.querySelectorAll('.link-folder-item').forEach(el => {
                    el.classList.toggle('active', el.dataset.folder === folderView.id);
                });
            }

            const activeFiles = getActiveMemoryLinkFiles();
            const fileEntries = folderView.folders.flatMap(function(folderName) {
                return (book[folderName] || []).map(function(file, idx) {
                    return { file, idx, folder: folderName };
                });
            });
            const isDefaultFolder = folderView.associated;
            let html = renderMemoryLinkSection(
                '已选文件',
                renderSelectedMemoryLinks(activeFiles, book, bookName, associatedPhysicalFolders),
                'flex:0 0 104px;'
            );
            if (isDefaultFolder) {
                const used = new Set();
                const associatedEntries = pickOrderedLinkEntries(fileEntries, ASSOCIATED_LINK_FILE_DEFS, used, bookName);
                const outlineEntries = pickOrderedLinkEntries(fileEntries, OUTLINE_LINK_FILE_DEFS, used, bookName);
                const extraEntries = fileEntries.filter(function(entry) {
                    return !used.has(entry.folder + ':' + entry.idx);
                });
                html += renderMemoryLinkSection(
                    '关联文件',
                    renderMemoryLinkCards(associatedEntries, activeFiles, bookName),
                    'flex:1 1 190px;'
                );
                html += renderMemoryLinkSection(
                    '大纲资料',
                    renderMemoryLinkCards(outlineEntries.concat(extraEntries), activeFiles, bookName),
                    'flex:1 1 150px;'
                );
            } else {
                html += renderMemoryLinkSection(
                    '当前文件夹：' + getUtils().escapeHtml(folderView.label),
                    renderMemoryLinkCards(fileEntries, activeFiles, bookName),
                    'flex:1 1 auto;'
                );
            }
            tree.innerHTML = html;

            tree.querySelectorAll('.memory-link-chip-remove').forEach(function(button) {
                button.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const index = parseInt(this.dataset.selectedIndex, 10);
                    setActiveMemoryLinkFiles(getActiveMemoryLinkFiles().filter(function(_, itemIndex) {
                        return itemIndex !== index;
                    }));
                    updateLinkedMemoryCount();
                    renderFileGrid(selectedFolder);
                });
            });

            tree.querySelectorAll('.link-file-card').forEach(function(card) {
                card.addEventListener('click', function(e) {
                    if (e.target.tagName === 'INPUT') return;
                    const cb = card.querySelector('.link-file-cb');
                    if (cb) {
                        cb.checked = !cb.checked;
                        cb.dispatchEvent(new Event('change'));
                    }
                });
            });

            tree.querySelectorAll('.link-file-cb').forEach(function(cb) {
                cb.addEventListener('change', function(e) {
                    e.stopPropagation();
                    const folder = this.dataset.folder;
                    const idx = parseInt(this.dataset.idx, 10);
                    if (this.checked) {
                        const selectedFiles = getActiveMemoryLinkFiles();
                        if (!selectedFiles.some(function(f) { return f.memFolder === folder && f.memIdx === idx; })) {
                            selectedFiles.push(window.createMemoryReferenceSelection?.(bookName, folder, idx)
                                || { name: book[folder][idx].name, memBook: bookName, memFolder: folder, memIdx: idx });
                            setActiveMemoryLinkFiles(selectedFiles);
                        }
                    } else {
                        setActiveMemoryLinkFiles(getActiveMemoryLinkFiles().filter(function(f) {
                            return !(f.memFolder === folder && f.memIdx === idx);
                        }));
                    }
                    updateLinkedMemoryCount();
                    renderFileGrid(selectedFolder);
                });
            });

            const chapterFolderName = folderView.associated ? '' : folderView.folders[0];
            if (currentChapterNums.length && isCurrentChapterMemoryFolder(chapterFolderName)) {
                setTimeout(function() {
                    let found = null;
                    const target = window._memoryLinkAutoFocusTarget;
                    const canMatchByChapterNum = isCurrentChapterMemoryFolder(chapterFolderName);
                    tree.querySelectorAll('.link-file-card').forEach(function(card) {
                        if (found) return;
                        if (target && target.memFolder === chapterFolderName && String(card.dataset.idx) === String(target.memIdx)) {
                            found = card;
                            return;
                        }
                        if (!canMatchByChapterNum) return;
                        const name = card.dataset.name || '';
                        if (currentChapterNums.indexOf(getChapterNumberFromName(name)) >= 0) found = card;
                    });
                    if (found) found.scrollIntoView({ block: 'center', behavior: 'smooth' });
                }, 80);
            }
        }

        if (foldersPanel) {
            folderViews.forEach(function(folderView) {
                const folderDiv = document.createElement('div');
                folderDiv.className = 'link-folder-item';
                folderDiv.dataset.folder = folderView.id;
                const folderCount = folderView.folders.reduce(function(total, folderName) {
                    return total + (book[folderName] || []).length;
                }, 0);
                folderDiv.innerHTML = '<span>' + renderIcon('folder') + '</span>' +
                    '<span class="link-folder-name">' + getUtils().escapeHtml(folderView.label) + '</span>' +
                    '<span class="link-folder-count">' + folderCount + '</span>';
                folderDiv.addEventListener('click', function() { renderFileGrid(folderView.id); });
                foldersPanel.appendChild(folderDiv);
            });
            renderFileGrid(selectedFolder);
        }
    }

    function updateLinkedMemoryCount() {
        const state = getAppState();
        const count = state.gen.linkedFiles.length;
        const text = count > 0 ? `已选择 ${count} 项` : '未选择';
        const linkedCount = document.getElementById('linkedFileCount');
        if (linkedCount) linkedCount.textContent = text;
        const scriptLinkedCount = document.getElementById('scriptLinkedFileCount');
        if (scriptLinkedCount) scriptLinkedCount.textContent = text;
        const composerLinkedFileCount = document.getElementById('composerLinkedFileCount');
        if (composerLinkedFileCount) composerLinkedFileCount.textContent = count > 0 ? `已选择 ${count}` : '';
        const functionCount = Array.isArray(state.outline?.functionalLinkedFiles) ? state.outline.functionalLinkedFiles.length : 0;
        const outlineFunctionLinkedCount = document.getElementById('outlineFunctionLinkedCount');
        if (outlineFunctionLinkedCount) outlineFunctionLinkedCount.textContent = functionCount > 0 ? `已选择 ${functionCount} 项` : '未选择';
        const advancedCount = Array.isArray(state.outline?.outlineAdvancedLinkedFiles) ? state.outline.outlineAdvancedLinkedFiles.length : 0;
        const advancedLinkedCount = document.getElementById('outlineAdvancedLinkedCount');
        if (advancedLinkedCount) advancedLinkedCount.textContent = advancedCount > 0 ? `已选择 ${advancedCount} 项` : '未选择';
        window.updateOGLinkedFileCount?.();
        window.updateChapterComposerState?.();
    }

    function confirmRefChapters() {
        const state = getAppState();
        const bodyKeys = new Set((state.gen.refChapters || []).map(function(ref) { return ref.vi + ':' + ref.ci; }));
        state.gen.keyEventSummaries = (state.gen.keyEventSummaries || []).filter(function(ref) {
            return !bodyKeys.has(ref.vi + ':' + ref.ci);
        });
        const refSummaryCount = Array.isArray(state.gen.refSummaries) ? state.gen.refSummaries.length : 0;
        const keyEventSummaryCount = Array.isArray(state.gen.keyEventSummaries) ? state.gen.keyEventSummaries.length : 0;
        const total = state.gen.refChapters.length + refSummaryCount + keyEventSummaryCount;
        if (activeRefSelectionScopeKey) {
            confirmedRefSelections.set(activeRefSelectionScopeKey, captureRefSelection(state));
            state.gen.refSelectionScopeKey = activeRefSelectionScopeKey;
        }
        updateRefSelectionCount(state);
        refSelectionOpenSnapshot = null;
        activeRefSelectionScopeKey = '';
        const modal = document.getElementById('refChapterModal');
        if (modal) modal.style.display = 'none';
    }

    function selectAllLinkedFiles() {
        document.querySelectorAll('#memoryLinkTree .link-file-cb').forEach(cb => {
            cb.checked = true;
            cb.dispatchEvent(new Event('change'));
        });
    }

    function invertLinkedFiles() {
        document.querySelectorAll('#memoryLinkTree .link-file-cb').forEach(cb => {
            cb.checked = !cb.checked;
            cb.dispatchEvent(new Event('change'));
        });
    }

    function openLocalLinkFilePicker() {
        document.getElementById('linkFilePicker')?.click();
    }

    function handleLocalLinkFileChange(e) {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        const input = e.target;
        const targetContext = getMemoryLinkContext();
        const targetBookName = getMemoryLinkBookName(targetContext);
        const targetOwnerUid = String(window.AccountDataScope?.getActiveUid?.() || getAppState().auth?.uid || 'guest');
        const targetFiles = getActiveMemoryLinkFiles();
        const targetReadVersion = localLinkReadVersion;
        let pendingReads = files.length;
        function isCurrentRead() {
            return targetReadVersion === localLinkReadVersion
                && getMemoryLinkBookName(targetContext) === targetBookName
                && String(window.AccountDataScope?.getActiveUid?.() || getAppState().auth?.uid || 'guest') === targetOwnerUid
                && getMemoryLinkFilesForContext(targetContext) === targetFiles;
        }
        function finishRead() {
            pendingReads -= 1;
            if (pendingReads > 0) return;
            if (isCurrentRead() && getMemoryLinkContext() === targetContext) {
                if (targetContext === 'generate') persistActiveGenerationLinkedFiles();
                updateLinkedMemoryCount();
                refreshMemoryLinkTree();
            }
            input.value = '';
        }
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = function(ev) {
                if (!isCurrentRead()) return;
                targetFiles.push({ name: file.name, content: ev.target.result, sourceType: 'local-upload', memBook: targetBookName, ownerUid: targetOwnerUid });
            };
            reader.onerror = function() { getToast().warn('文件读取失败：' + file.name); };
            reader.onloadend = finishRead;
            reader.readAsText(file);
        });
    }

    function confirmMemoryLink() {
        const context = window._linkMemoryContext;
        if (context === 'generate') persistActiveGenerationLinkedFiles();
        updateLinkedMemoryCount();
        if (context === 'fineOutline' || context === 'og') {
            const fineOutlineFileRow = document.getElementById('ogFileStacksRow');
            if (fineOutlineFileRow) fineOutlineFileRow.style.display = 'flex';
            window.refreshAllOGFileStacks?.();
        }
        getModal().close('memoryLinkModal');
        if (['outlineFunction', 'outlineAdvanced', 'fineOutline', 'og'].includes(context)) {
            window._linkMemoryContext = null;
        }
    }

    function bindOnce(id, type, handler) {
        const el = document.getElementById(id);
        if (!el || el.dataset.linkMemorySelectorBound === '1') return;
        el.dataset.linkMemorySelectorBound = '1';
        el.addEventListener(type, handler);
    }

    function bindLinkMemorySelector() {
        bindOnce('btnConfirmRefChapters', 'click', confirmRefChapters);
        bindOnce('btnCancelRefChapters', 'click', cancelRefChapters);
        bindOnce('btnCloseRefChapters', 'click', cancelRefChapters);
        bindOnce('refChapterModal', 'click', function(event) {
            if (event.target === event.currentTarget) cancelRefChapters();
        });
        bindOnce('btnSelectAll', 'click', selectAllLinkedFiles);
        bindOnce('btnInvertSelect', 'click', invertLinkedFiles);
        bindOnce('btnCloseMemoryLink', 'click', function() { getModal().close('memoryLinkModal'); });
        bindOnce('btnLocalLinkFile', 'click', openLocalLinkFilePicker);
        bindOnce('linkFilePicker', 'change', handleLocalLinkFileChange);
        bindOnce('btnConfirmMemoryLink', 'click', confirmMemoryLink);
        const root = document.documentElement;
        if (root && root.dataset.refChapterEscapeBound !== '1') {
            root.dataset.refChapterEscapeBound = '1';
            document.addEventListener('keydown', function(event) {
                const modal = document.getElementById('refChapterModal');
                if (event.key === 'Escape' && modal?.style.display === 'flex') {
                    event.preventDefault();
                    cancelRefChapters();
                }
            });
        }
    }

    window.getCurrentChapterNumberForMemory = getCurrentChapterNumberForMemory;
    window.getCurrentChapterNumberCandidatesForMemory = getCurrentChapterNumberCandidatesForMemory;
    window.getCurrentChapterMemoryFolderName = getCurrentChapterMemoryFolderName;
    window.isCurrentChapterMemoryFolder = isCurrentChapterMemoryFolder;
    window.findCurrentChapterMemoryFile = findCurrentChapterMemoryFile;
    window.findCurrentFineOutlineFile = findCurrentFineOutlineFile;
    window.findCurrentDecomposeFile = findCurrentDecomposeFile;
    window.isFineOutlineOrDecomposeLink = isFineOutlineOrDecomposeLink;
    window.addMemoryLinkFileIfMissing = addMemoryLinkFileIfMissing;
    window.addRequiredMemoryLinksToList = addRequiredMemoryLinksToList;
    window.initializeAdvancedOutlineLinkDefaults = initializeAdvancedOutlineLinkDefaults;
    window.getActiveMemoryLinkContext = getActiveMemoryLinkContext;
    window.openLinkMemorySelector = openLinkMemorySelector;
    window.openOutlineFunctionLinkSelector = openOutlineFunctionLinkSelector;
    window.openAdvancedOutlineLinkSelector = openAdvancedOutlineLinkSelector;
    window.openRefChapterSelector = openRefChapterSelector;
    window.cancelRefChapterSelection = cancelRefChapters;
    window.refreshMemoryLinkTree = refreshMemoryLinkTree;
    window.updateLinkedMemoryCount = updateLinkedMemoryCount;
    window.getMemoryLinkContext = getMemoryLinkContext;
    window.getMemoryLinkBookName = getMemoryLinkBookName;
    window.getBookScopedSelectionKey = getBookScopedSelectionKey;
    window.getMemoryLinkFilesForContext = getMemoryLinkFilesForContext;
    window.getActiveMemoryLinkFiles = getActiveMemoryLinkFiles;
    window.setActiveMemoryLinkFiles = setActiveMemoryLinkFiles;
    window.ensureGenerationLinkedFilesBook = ensureGenerationLinkedFilesBook;
    window.getGenerationChapterSelectionKey = getGenerationChapterSelectionKey;
    window.persistActiveGenerationLinkedFiles = persistActiveGenerationLinkedFiles;
    window.activateGenerationLinkedFilesChapter = activateGenerationLinkedFilesChapter;
    window.getGenerationLinkedFilesForChapter = getGenerationLinkedFilesForChapter;
    window.invalidateMemoryLinkFileReads = invalidateMemoryLinkFileReads;
    window.getMemoryLinkChipSource = getMemoryLinkChipSource;
    window.collectKeyEventSummaryCandidates = collectKeyEventSummaryCandidates;
    window.bindLinkMemorySelector = bindLinkMemorySelector;
    window.ZHIYU_LINK_MEMORY_SELECTOR_READY = true;

    bindLinkMemorySelector();
})(window);
