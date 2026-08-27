(function(window, document) {
    'use strict';

    function createOutlineContinueSaveError(message, code) {
        const error = new Error(message);
        error.code = code;
        return error;
    }

    function normalizeOutlineContinueEditorText(value) {
        return String(value || '')
            .replace(/\r\n?/g, '\n')
            .replace(/\u00a0/g, ' ')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/^\n+|\n+$/g, '');
    }

    function getReasoningSafeOutline(value) {
        return typeof window.stripOutlineReasoningText === 'function'
            ? window.stripOutlineReasoningText(value)
            : String(value || '').replace(/<think(?:\s[^>]*)?>[\s\S]*?<\/think\s*>/gi, '');
    }

    function extractOutlineContinueAddition(resultContent, baseContent) {
        // 专业编辑器会统一换行、NBSP 和行尾空格。这里只按它的纯文本显示规则
        // 核对原大纲前缀；原始 baseContent 仍用于并发身份校验，落盘内容会清理历史 reasoning。
        const result = normalizeOutlineContinueEditorText(resultContent);
        const base = normalizeOutlineContinueEditorText(baseContent);
        if (!base.trim()) {
            throw createOutlineContinueSaveError('原大纲内容为空，已停止增量保存', 'OUTLINE_CONTINUE_BASE_EMPTY');
        }
        if (!result.startsWith(base)) {
            throw createOutlineContinueSaveError(
                '结果框中的原大纲部分已经变化，无法确认安全追加位置。请重新打开大纲续写后再试。',
                'OUTLINE_CONTINUE_BASE_CHANGED'
            );
        }
        const addition = result
            .slice(base.length)
            .replace(/^\s*---\s*正在生成续写内容\s*---\s*/, '')
            .trim();
        if (!addition) {
            throw createOutlineContinueSaveError('没有可追加的续写内容', 'OUTLINE_CONTINUE_ADDITION_EMPTY');
        }
        return addition;
    }

    function joinOutlineContinueContent(baseContent, additionContent) {
        const base = String(baseContent || '');
        const addition = String(additionContent || '').trim();
        if (!addition) return base;
        if (!base) return addition;
        const separator = base.endsWith('\n\n') ? '' : (base.endsWith('\n') ? '\n' : '\n\n');
        return base + separator + addition;
    }

    function buildOutlineContinueFolderSnapshot(files) {
        return JSON.stringify(Array.isArray(files) ? files : []);
    }

    function isPrimaryOutlineMemoryFile(bookName, fileName) {
        let normalized = String(fileName || '').replace(/\.md$/i, '');
        const prefix = String(bookName || '') + '_';
        if (normalized.startsWith(prefix)) normalized = normalized.slice(prefix.length);
        return normalized === '大纲';
    }

    function prepareOutlineContinueAppend(books, memBooks, session, resultContent, nowValue) {
        if (!session?.active) {
            throw createOutlineContinueSaveError('当前没有可保存的大纲续写任务', 'OUTLINE_CONTINUE_SESSION_MISSING');
        }
        if (session.saved) {
            throw createOutlineContinueSaveError('本次续写已经保存，无需重复追加', 'OUTLINE_CONTINUE_ALREADY_SAVED');
        }
        if (!session.ready) {
            throw createOutlineContinueSaveError('请等待大纲续写完成后再保存', 'OUTLINE_CONTINUE_NOT_READY');
        }

        const bookName = String(session.bookName || '');
        const folderName = String(session.folder || '');
        const fileName = String(session.name || '');
        const baseContent = String(session.baseContent || '');
        const booksCandidate = JSON.parse(JSON.stringify(books || {}));
        const memBooksCandidate = JSON.parse(JSON.stringify(memBooks || {}));
        const book = booksCandidate[bookName];
        const files = memBooksCandidate[bookName]?.[folderName];
        if (!book || !Array.isArray(files)) {
            throw createOutlineContinueSaveError('要续写的大纲文件已经不存在，请重新选择', 'OUTLINE_CONTINUE_TARGET_MISSING');
        }

        const requestedIndex = Number(session.index);
        let targetIndex = -1;
        if (Number.isInteger(requestedIndex)
            && requestedIndex >= 0
            && requestedIndex < files.length
            && String(files[requestedIndex]?.name || '') === fileName) {
            targetIndex = requestedIndex;
        } else {
            const matches = files
                .map(function(file, index) { return { file, index }; })
                .filter(function(item) {
                    return String(item.file?.name || '') === fileName
                        && String(item.file?.content || '') === baseContent;
                });
            if (matches.length === 1) targetIndex = matches[0].index;
        }
        if (targetIndex < 0) {
            throw createOutlineContinueSaveError('无法唯一定位要续写的大纲文件，请重新选择', 'OUTLINE_CONTINUE_TARGET_AMBIGUOUS');
        }

        const targetFile = files[targetIndex];
        if (String(targetFile.content || '') !== baseContent) {
            throw createOutlineContinueSaveError(
                '原大纲在生成期间已经变化，为避免覆盖新内容，本次保存已停止。请重新打开大纲续写。',
                'OUTLINE_CONTINUE_TARGET_CHANGED'
            );
        }
        if (session.targetSnapshot && JSON.stringify(targetFile || {}) !== String(session.targetSnapshot)) {
            throw createOutlineContinueSaveError(
                '要续写的大纲文件身份已经变化，为避免写错文件，本次保存已停止。请重新选择。',
                'OUTLINE_CONTINUE_TARGET_CHANGED'
            );
        }
        if (session.folderSnapshot
            && buildOutlineContinueFolderSnapshot(files) !== String(session.folderSnapshot)) {
            throw createOutlineContinueSaveError(
                '大纲所在文件夹在生成期间已经变化，为避免写错文件，本次保存已停止。请重新选择。',
                'OUTLINE_CONTINUE_TARGET_CHANGED'
            );
        }

        const safeBaseContent = getReasoningSafeOutline(baseContent);
        const safeResultContent = getReasoningSafeOutline(resultContent);
        const additionContent = getReasoningSafeOutline(
            extractOutlineContinueAddition(safeResultContent, safeBaseContent)
        );
        const mergedContent = joinOutlineContinueContent(safeBaseContent, additionContent);
        const now = String(nowValue || new Date().toISOString());
        targetFile.content = mergedContent;
        targetFile.updatedAt = now;
        const shouldMirrorBookOutline = session.mirrorsBookOutline === true
            && isPrimaryOutlineMemoryFile(bookName, fileName);
        if (shouldMirrorBookOutline && String(book.outline?.content || '') !== baseContent) {
            throw createOutlineContinueSaveError(
                '作品主大纲在生成期间已经变化，为避免覆盖新内容，本次保存已停止。请重新选择。',
                'OUTLINE_CONTINUE_BOOK_OUTLINE_CHANGED'
            );
        }
        const mirrorsBookOutline = shouldMirrorBookOutline;
        if (mirrorsBookOutline) {
            book.outline = Object.assign({}, book.outline || {}, {
                content: mergedContent,
                updatedAt: now
            });
        }

        return {
            books: booksCandidate,
            memBooks: memBooksCandidate,
            bookName,
            folderName,
            targetIndex,
            additionContent,
            mergedContent,
            mirrorsBookOutline,
            updatedAt: now
        };
    }

    function getDeps() {
        return {
            AppState: window.ZHIYU_APP_STATE || window.AppState,
            Utils: window.ZHIYU_UTILS || window.Utils,
            Toast: window.ZHIYU_TOAST || window.Toast,
            Confirm: window.ZHIYU_CONFIRM || window.Confirm,
            saveOutlineToBook: window.saveOutlineToBook,
            touchBook: window.touchBook,
            refreshTree: window.refreshTree,
            getMemBooks: window.getMemBooks,
            sMB: window.sMB,
            generateAllMemoryFiles: window.generateAllMemoryFiles,
            ensureMemBook: window.ensureMemBook,
            syncOutlineResultToState: window.syncOutlineResultToState,
            getNormalOutlineMemorySource: window.getNormalOutlineMemorySource,
            getOutlineMode: window.getOutlineMode,
            getOutlinePlaceholder: window.getOutlinePlaceholder,
            getOutlineSaveLabel: window.getOutlineSaveLabel,
            getSelectedOutlineFunctionType: window.getSelectedOutlineFunctionType,
            hasAdvancedOutlineStorage: window.hasAdvancedOutlineStorage,
            clearAdvancedOutlineStorageFiles: window.clearAdvancedOutlineStorageFiles
        };
    }

    function bindOutlineSaveActions() {
        if (bindOutlineSaveActions.bound) return;
        bindOutlineSaveActions.bound = true;

        const {
            AppState,
            Utils,
            Toast,
            Confirm,
            saveOutlineToBook,
            touchBook,
            refreshTree,
            getMemBooks,
            sMB,
            generateAllMemoryFiles,
            ensureMemBook,
            syncOutlineResultToState,
            getNormalOutlineMemorySource,
            getOutlineMode,
            getOutlinePlaceholder,
            getOutlineSaveLabel,
            getSelectedOutlineFunctionType,
            hasAdvancedOutlineStorage,
            clearAdvancedOutlineStorageFiles
        } = getDeps();

        function normalizeMemoryFileName(name) {
            return String(name || '').replace(/\.md$/i, '');
        }

        function getSaveButtonLabel() {
            return typeof getOutlineSaveLabel === 'function' ? getOutlineSaveLabel() : '保存到大纲';
        }

        async function saveOutlineContinuation(resultContent, resultBox) {
            const session = AppState.outline?.continueSession;
            if (!session?.active) return false;
            if (session.saved) {
                Toast.warn('本次续写已经增量保存到所选大纲，无需重复保存');
                return true;
            }
            if (!session.ready) {
                Toast.warn('请等待大纲续写完成后再保存');
                return true;
            }

            const activeUid = String(window.AccountDataScope?.getActiveUid?.() || AppState.auth?.uid || '');
            if (!activeUid || (session.accountUid && String(session.accountUid) !== activeUid)) {
                throw createOutlineContinueSaveError('账号已经切换，本次续写未写入其他账号', 'OUTLINE_CONTINUE_ACCOUNT_CHANGED');
            }
            if (String(AppState.chapter?.book || '') !== String(session.bookName || '')) {
                throw createOutlineContinueSaveError('作品已经切换，本次续写未写入其他作品', 'OUTLINE_CONTINUE_BOOK_CHANGED');
            }

            const prepared = prepareOutlineContinueAppend(
                window.gB?.() || {},
                getMemBooks?.() || {},
                session,
                resultContent
            );
            const storage = window.ZHIYU_STORAGE_SERVICE;
            const scope = window.AccountDataScope;
            if (!storage?.commitBooksAndMemory || !scope?.key || !window.replaceMemBooksSnapshot) {
                throw createOutlineContinueSaveError('大纲增量保存服务尚未加载，请刷新页面重试', 'OUTLINE_CONTINUE_STORAGE_UNAVAILABLE');
            }
            const committed = await storage.commitBooksAndMemory(
                prepared.books,
                scope.key('mem_books', activeUid),
                prepared.memBooks,
                activeUid
            );
            if (!committed) {
                throw createOutlineContinueSaveError('大纲增量保存失败，原大纲已保留', 'OUTLINE_CONTINUE_COMMIT_FAILED');
            }
            if (window.replaceMemBooksSnapshot(prepared.memBooks, activeUid) !== true) {
                throw createOutlineContinueSaveError('大纲已经保存，但当前页面缓存未刷新，请刷新页面查看', 'OUTLINE_CONTINUE_CACHE_REFRESH_FAILED');
            }
            const savedFiles = prepared.memBooks?.[prepared.bookName]?.[prepared.folderName];
            const savedTarget = Array.isArray(savedFiles) ? savedFiles[prepared.targetIndex] : null;
            const savedTargetSnapshot = JSON.stringify(savedTarget || {});
            const savedFolderSnapshot = buildOutlineContinueFolderSnapshot(savedFiles);

            const sessionStillCurrent = AppState.outline?.continueSession === session
                && session.active
                && String(window.AccountDataScope?.getActiveUid?.() || AppState.auth?.uid || '') === activeUid
                && String(AppState.chapter?.book || '') === String(session.bookName || '');
            if (!sessionStillCurrent) {
                Object.assign(session, {
                    active: false,
                    ready: false,
                    saved: true,
                    baseContent: prepared.mergedContent,
                    generatedContent: prepared.additionContent,
                    index: prepared.targetIndex,
                    targetSnapshot: savedTargetSnapshot,
                    folderSnapshot: savedFolderSnapshot,
                    savedAt: Date.now()
                });
                Toast.warn('续写内容已保存到原作品；当前页面已切换，未改动新页面内容');
                return true;
            }

            AppState.outline.content = prepared.mergedContent;
            AppState.outline.continueBase = prepared.mergedContent;
            AppState.outline.continueResult = prepared.additionContent;
            Object.assign(session, {
                ready: false,
                saved: true,
                baseContent: prepared.mergedContent,
                generatedContent: prepared.additionContent,
                index: prepared.targetIndex,
                targetSnapshot: savedTargetSnapshot,
                folderSnapshot: savedFolderSnapshot,
                savedAt: Date.now()
            });
            if (resultBox) resultBox.textContent = prepared.mergedContent;
            window.updateChapWordCount?.(prepared.mergedContent);
            touchBook?.(prepared.bookName);
            refreshTree?.();
            window._triggerCloudSync?.();
            Utils.appendLog(null, '✅ 续写内容已增量追加到「' + session.name + '」，原大纲已保留', 'success');
            Toast.success('续写内容已追加到所选大纲');
            return true;
        }

        function isAssociatedMemoryFolderName(folderName) {
            const name = String(folderName || '');
            if (!name || name === '仿写' || name === '剧本') return false;
            if (typeof window.getMemFolderType === 'function') return window.getMemFolderType(name) === 'associated';
            return name.indexOf('细纲') < 0 && name.indexOf('拆书') < 0;
        }

        function getAssociatedMemoryFolderNames(memBooks, bookName) {
            const bookMem = (memBooks && memBooks[bookName]) || {};
            const folders = Object.keys(bookMem).filter(function(folderName) {
                return Array.isArray(bookMem[folderName]) && isAssociatedMemoryFolderName(folderName);
            });
            return folders.length ? folders : ['默认文件夹'];
        }

        function getAssociatedMemoryDefaultFolder(memBooks, bookName) {
            const bookMem = (memBooks && memBooks[bookName]) || {};
            if (Array.isArray(bookMem['关联文件夹'])) return '关联文件夹';
            if (Array.isArray(bookMem['默认文件夹'])) return '默认文件夹';
            return getAssociatedMemoryFolderNames(memBooks, bookName)[0] || '默认文件夹';
        }

        function buildNormalOutlineMemoryCandidate(memBooks, bookName) {
            const candidate = JSON.parse(JSON.stringify(memBooks || {}));
            // 所有清理和生成只发生在副本；完整分析成功后再由原子保存整体替换。
            return candidate;
        }

        function upsertFunctionalMemoryFile(memBooks, bookName, folderName, fileName, content, options) {
            if (!memBooks[bookName][folderName]) memBooks[bookName][folderName] = [];
            const now = new Date().toISOString();
            const cleanName = normalizeMemoryFileName(fileName);
            const aliasNames = options && Array.isArray(options.aliases) ? options.aliases : [];
            const searchNames = [cleanName].concat(aliasNames);
            const searchMemNames = searchNames.map(function(name) { return bookName + '_' + name; });
            const storageName = options && options.storageName ? options.storageName : fileName;
            const searchFolders = options && Array.isArray(options.searchFolders) && options.searchFolders.length ? options.searchFolders : [folderName];
            let found = null;
            for (const searchFolder of searchFolders) {
                const list = Array.isArray(memBooks[bookName][searchFolder]) ? memBooks[bookName][searchFolder] : [];
                found = list.find(function(file) {
                    const savedName = normalizeMemoryFileName(file.name || '');
                    return searchNames.indexOf(savedName) >= 0 || searchMemNames.indexOf(savedName) >= 0;
                });
                if (found) break;
            }
            if (found) {
                if (options && options.preserveExisting && String(found.content || '').trim()) return;
                found.name = storageName;
                found.content = content;
                found.updatedAt = now;
            } else {
                memBooks[bookName][folderName].push({ name: storageName, content, createdAt: now, updatedAt: now });
            }
        }

        function upsertNormalOutlineChapterOutlineFile(memBooks, bookName, content) {
            if (!memBooks[bookName]) memBooks[bookName] = { 默认文件夹: [] };
            const targetFolder = getAssociatedMemoryDefaultFolder(memBooks, bookName);
            upsertFunctionalMemoryFile(
                memBooks,
                bookName,
                targetFolder,
                '章节粗纲',
                String(content || '').trim(),
                {
                    searchFolders: getAssociatedMemoryFolderNames(memBooks, bookName),
                    storageName: bookName + '_章节粗纲'
                }
            );
        }

        function buildFunctionalMemoryPack(type, content) {
            const now = new Date().toLocaleString('zh-CN', { hour12: false });
            if (type === 'script') {
                return {
                    folder: '剧本',
                    files: [
                        { name: '剧本', content: '# 剧本\n\n> 保存时间：' + now + '\n\n' + content },
                        { name: '分镜', content: '# 分镜\n\n> 剧本总结提示词结构已预留，后续填入正式提示词后自动提取。\n\n## 待总结\n', preserveExisting: true },
                        { name: '角色', content: '# 角色\n\n> 剧本总结提示词结构已预留，后续填入正式提示词后自动提取。\n\n## 待总结\n', preserveExisting: true },
                        { name: '场景', content: '# 场景\n\n> 剧本总结提示词结构已预留，后续填入正式提示词后自动提取。\n\n## 待总结\n', preserveExisting: true },
                        { name: '道具', content: '# 道具\n\n> 剧本总结提示词结构已预留，后续填入正式提示词后自动提取。\n\n## 待总结\n', preserveExisting: true }
                    ]
                };
            }
            return {
                folder: '',
                files: [
                    { name: '拆书', content: '# 拆书\n\n> 保存时间：' + now + '\n\n' + content, aliases: ['仿写', '仿写设定'] }
                ]
            };
        }

        async function saveFunctionalContentToMemory() {
            const bookName = AppState.chapter.book;
            if (!bookName) { Toast.warn('请先选择书籍'); return false; }
            if (typeof syncOutlineResultToState === 'function') syncOutlineResultToState();
            const resultBox = document.getElementById('outlineResultBox');
            const placeholder = typeof getOutlinePlaceholder === 'function' ? getOutlinePlaceholder() : '';
            const content = (AppState.outline.functionalContent || resultBox?.textContent || '').trim();
            if (!content || content === placeholder) { Toast.warn('暂无可保存内容'); return false; }
            const functionType = typeof getSelectedOutlineFunctionType === 'function' ? getSelectedOutlineFunctionType() : '';
            if (!functionType) { Toast.warn('请先选择拆书或剧本'); return false; }

            ensureMemBook(bookName);
            const memBooks = getMemBooks();
            if (functionType === 'imitate') {
                const now = new Date().toLocaleString('zh-CN', { hour12: false });
                const targetFolder = getAssociatedMemoryDefaultFolder(memBooks, bookName);
                const sharedFolders = getAssociatedMemoryFolderNames(memBooks, bookName);
                upsertFunctionalMemoryFile(memBooks, bookName, targetFolder, '拆书', '# 拆书\n\n> 保存时间：' + now + '\n\n' + content, {
                    aliases: ['仿写', '仿写设定'],
                    searchFolders: sharedFolders,
                    storageName: bookName + '_拆书'
                });
                const resetSuffixes = ['_追踪表', '_边界卡', '_信息卡', '_设定集', '_承接卡'];
                for (const folder of sharedFolders) {
                    memBooks[bookName][folder] = (memBooks[bookName][folder] || []).filter(function(file) {
                        const name = normalizeMemoryFileName(file.name || '');
                        return !resetSuffixes.some(function(suffix) { return name.endsWith(suffix); });
                    });
                }
                await sMB(memBooks);
                let functionalWaitLogToken = '';
                try {
                    if (typeof Utils.beginExecutionLogWait === 'function') {
                        functionalWaitLogToken = Utils.beginExecutionLogWait('💾 拆书文件已保存，开始总结关联文件...', 'progress');
                    }
                    if (!functionalWaitLogToken) {
                        Utils.appendLog(null, '💾 拆书文件已保存，开始总结关联文件...', 'progress');
                    }
                    const genres = []
                        .concat(AppState.outline.functionalGenres || [])
                        .concat(AppState.outline.functionSubject ? [AppState.outline.functionSubject] : [])
                        .join('、');
                    await generateAllMemoryFiles(bookName, content, null, genres, 'outline', { primaryFileName: '拆书' });
                    refreshTree();
                    Utils.appendLog(null, '✅ 拆书、追踪表、边界卡、承接卡、设定集、信息卡 已生成', 'success');
                    Toast.success('拆书已保存并生成关联文件');
                    return true;
                } finally {
                    if (functionalWaitLogToken && typeof Utils.endExecutionLogWait === 'function') {
                        Utils.endExecutionLogWait(functionalWaitLogToken);
                    }
                }
            }

            const pack = buildFunctionalMemoryPack(functionType, content);
            const targetFolder = pack.folder || getAssociatedMemoryDefaultFolder(memBooks, bookName);
            const sharedFolders = pack.folder ? [targetFolder] : getAssociatedMemoryFolderNames(memBooks, bookName);
            pack.files.forEach(function(file) {
                const shouldPrefix = !pack.folder && ['拆书', '边界卡', '追踪表', '承接卡', '信息卡', '设定集'].includes(file.name);
                upsertFunctionalMemoryFile(memBooks, bookName, targetFolder, file.name, file.content, {
                    preserveExisting: !!file.preserveExisting,
                    aliases: file.aliases || [],
                    searchFolders: sharedFolders,
                    storageName: shouldPrefix ? bookName + '_' + file.name : file.name
                });
            });
            await sMB(memBooks);
            Utils.appendLog(null, '✅ 已保存到记忆库：' + targetFolder + '（' + pack.files.length + '个文件）', 'success');
            Toast.success('内容已保存到记忆库');
            return true;
        }

        window.saveFunctionalContentToMemory = saveFunctionalContentToMemory;

        // 保存大纲到记忆库（含保存到章节 + 生成四大文件）
        document.getElementById('btnOutlineSave')?.addEventListener('click', async function() {
            if (typeof window.isOutlineInquirySaveBlocked === 'function' && window.isOutlineInquirySaveBlocked()) {
                Toast.warn('询问大纲尚未全部完成，完成后才能正式保存');
                return;
            }
            if (typeof window.isAdvancedOutlineMode === 'function' && window.isAdvancedOutlineMode()) {
                const btn = this;
                btn.disabled = true;
                btn.textContent = '保存中...';
                try {
                    await window.saveAdvancedOutlineToMemory();
                } catch (err) {
                    console.error('保存高级大纲失败:', err);
                    const message = typeof window.formatAiErrorForDisplay === 'function'
                        ? window.formatAiErrorForDisplay(err, '高级大纲保存失败')
                        : String(err?.message || err || '高级大纲保存失败');
                    Utils.appendLog(null, message, 'error');
                    Toast.error(message);
                } finally {
                    btn.disabled = false;
                    btn.textContent = getSaveButtonLabel();
                }
                return;
            }
            const bookName = AppState.chapter.book;
            if (!bookName) { Toast.warn('请先选择书籍'); return; }

            const btn = document.getElementById('btnOutlineSave');
            btn.disabled = true;
            btn.textContent = '保存中...';

            if (typeof getOutlineMode === 'function' && getOutlineMode() === 'function') {
                try {
                    await saveFunctionalContentToMemory();
                    window._scheduleReliableCloudBackup?.('save-outline');
                } catch (err) {
                    console.error('保存功能性内容失败:', err);
                    const message = typeof window.formatAiErrorForDisplay === 'function'
                        ? window.formatAiErrorForDisplay(err, '功能性内容保存失败')
                        : String(err?.message || err || '功能性内容保存失败');
                    Utils.appendLog(null, message, 'error');
                    Toast.error(message);
                } finally {
                    btn.disabled = false;
                    btn.textContent = getSaveButtonLabel();
                }
                return;
            }

            // 先读取用户手动编辑的内容；确认前不改动当前作品或记忆数据。
            const resultBox = document.getElementById('outlineResultBox');
            const rawOutline = String(resultBox?.textContent || AppState.outline.content || '');
            const newOutline = rawOutline.trim();
            if (!newOutline) {
                Toast.warn('暂无大纲内容');
                btn.disabled = false;
                btn.textContent = getSaveButtonLabel();
                return;
            }

            if (AppState.outline?.continueSession?.active) {
                const saveSession = AppState.outline.continueSession;
                const saveOperationToken = 'outline-continue-save-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
                btn.dataset.outlineContinueSaveOperation = saveOperationToken;
                try {
                    await saveOutlineContinuation(rawOutline, resultBox);
                } catch (err) {
                    const message = String(err?.message || err || '大纲增量保存失败');
                    Utils.appendLog(null, '❌ 大纲续写未保存，原大纲未改动：' + message, 'error');
                    Toast.error(message);
                } finally {
                    if (btn.dataset.outlineContinueSaveOperation === saveOperationToken) {
                        delete btn.dataset.outlineContinueSaveOperation;
                        btn.disabled = false;
                        btn.textContent = getSaveButtonLabel();
                    }
                }
                return;
            }

            // 全量生成：先构建待写入副本；所有分析成功前不改动现有记忆文件。
            let outlineSaved = false;
            let outlineWaitLogToken = '';
            try {
                const memBooks = getMemBooks();
                if (typeof hasAdvancedOutlineStorage !== 'function' || typeof clearAdvancedOutlineStorageFiles !== 'function') {
                    throw new Error('关联文件安全检查尚未加载，请刷新页面后重试');
                }
                let memoryCandidate = buildNormalOutlineMemoryCandidate(memBooks, bookName);
                if (hasAdvancedOutlineStorage(bookName, memBooks)) {
                    if (typeof Confirm?.show !== 'function') {
                        throw new Error('保存确认组件尚未加载，请刷新页面后重试');
                    }
                    const confirmed = await Confirm.show('当前作品已有一套关联文件。继续保存后，系统会按新大纲重新生成以下关联文件。', {
                        variant: 'outline-rebuild',
                        title: '保存并重建关联文件',
                        subject: '《' + bookName + '》',
                        replaceItems: ['大纲、章节粗纲、阶段粗纲', '剧情总览、母大纲、关键事件表、资料索引', '设定集、信息表、角色列表、追踪表、边界卡、承接卡'],
                        keepItems: ['正文', '章节细纲', '拆书章节', '用户上传/自定义文件'],
                        confirmText: '继续保存',
                        cancelText: '取消'
                    });
                    if (!confirmed) return false;
                    memoryCandidate = clearAdvancedOutlineStorageFiles(bookName, memoryCandidate);
                }
                AppState.outline.content = newOutline;
                if (typeof Utils.beginExecutionLogWait === 'function') {
                    outlineWaitLogToken = Utils.beginExecutionLogWait('🧰 大纲保存处理中，正在分析关联资料', 'progress');
                }
                if (!outlineWaitLogToken) {
                    Utils.appendLog(null, '🧰 大纲保存处理中，正在分析关联资料', 'progress');
                }
                const saved = await saveOutlineToBook(newOutline);
                if (saved === false) {
                    throw new Error('大纲正文未能保存到章节目录');
                }
                outlineSaved = true;
                window.saveNormalOutlineDraft?.(bookName, newOutline);
                touchBook(bookName);
                Utils.appendLog(null, '💾 大纲已保存到章节目录', 'success');
                refreshTree();
                const memorySource = typeof getNormalOutlineMemorySource === 'function'
                    ? getNormalOutlineMemorySource(newOutline)
                    : null;
                if (!memorySource?.ok || !String(memorySource.content || '').trim()) {
                    throw new Error(memorySource?.message || '基础设定提取功能尚未加载，已停止关联资料分析');
                }
                const chapterOutlineContent = String(memorySource.chapterOutlineContent || '').trim();
                if (!chapterOutlineContent) {
                    throw new Error('未提取到从第1章开始的章节粗纲，已停止关联资料更新');
                }
                upsertNormalOutlineChapterOutlineFile(memoryCandidate, bookName, chapterOutlineContent);
                const genres = AppState.outline.genres.join('、');
                await generateAllMemoryFiles(bookName, memorySource.content, null, genres, 'outline', {
                    memoryProfile: 'normalOutline',
                    primaryFileName: '大纲',
                    compactRoleList: true,
                    atomicPersist: true,
                    memBooksCandidate: memoryCandidate
                });
                Utils.appendLog(null, '✅ 基础设定大纲、章节粗纲、边界卡、追踪表、设定集 已生成', 'success');
                refreshTree();
                Toast.success('大纲已保存！');
                window._scheduleReliableCloudBackup?.('save-outline');
            } catch (err) {
                const reason = err?.message || String(err || '未知错误');
                console.error('普通大纲保存或关联资料分析失败：', err);
                if (outlineSaved) {
                    const analysisMessage = typeof window.formatAiErrorForDisplay === 'function'
                        ? window.formatAiErrorForDisplay(err, '关联资料分析失败')
                        : reason;
                    Utils.appendLog(null, '❌ 大纲正文已保存；关联资料分析失败，原有关联资料未被替换：' + analysisMessage, 'error');
                    Toast.warn('大纲正文已保存，但关联资料未更新：' + String(analysisMessage).slice(0, 120));
                } else {
                    const message = typeof window.formatAiErrorForDisplay === 'function'
                        ? window.formatAiErrorForDisplay(err, '大纲保存失败')
                        : ('大纲保存失败：' + reason);
                    Utils.appendLog(null, message, 'error');
                    Toast.error(message);
                }
            } finally {
                if (outlineWaitLogToken && typeof Utils.endExecutionLogWait === 'function') {
                    Utils.endExecutionLogWait(outlineWaitLogToken);
                }
                btn.disabled = false;
                btn.textContent = getSaveButtonLabel();
            }
        });
    }

    window.bindOutlineSaveActions = bindOutlineSaveActions;
    window.ZHIYU_OUTLINE_CONTINUE_SAVE = Object.freeze({
        normalizeOutlineContinueEditorText,
        extractOutlineContinueAddition,
        joinOutlineContinueContent,
        buildOutlineContinueFolderSnapshot,
        isPrimaryOutlineMemoryFile,
        prepareOutlineContinueAppend
    });
    window.ZHIYU_OUTLINE_SAVE_ACTIONS_READY = true;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindOutlineSaveActions, { once: true });
    } else {
        bindOutlineSaveActions();
    }
})(window, document);
