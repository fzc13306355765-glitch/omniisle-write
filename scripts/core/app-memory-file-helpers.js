(function(window) {
    'use strict';
    const REF_FILE_ID_KEY = '_refFileId';
    let refFileIdSequence = 0;
    const pendingRefFileIdSaves = new Set();
    let refFileIdSaveScheduled = false;

    function getMemBooksSafe() {
        return typeof window.getMemBooks === 'function' ? window.getMemBooks() : {};
    }

    function saveMemBooksSafe(memBooks) {
        if (typeof window.sMB === 'function') window.sMB(memBooks);
    }

    function scheduleRefFileIdSave(memBooks) {
        if (!memBooks || typeof memBooks !== 'object') return;
        pendingRefFileIdSaves.add(memBooks);
        if (refFileIdSaveScheduled) return;
        refFileIdSaveScheduled = true;
        Promise.resolve().then(function() {
            refFileIdSaveScheduled = false;
            const snapshots = Array.from(pendingRefFileIdSaves);
            pendingRefFileIdSaves.clear();
            snapshots.forEach(saveMemBooksSafe);
        });
    }

    function createRefFileId() {
        const uuid = String(window.crypto?.randomUUID?.() || '').trim();
        if (uuid) return 'mrf-' + uuid;
        refFileIdSequence += 1;
        return 'mrf-' + Date.now().toString(36)
            + '-' + refFileIdSequence.toString(36)
            + '-' + Math.random().toString(36).slice(2, 10);
    }

    function getRefFileId(file) {
        return file && typeof file === 'object' ? String(file[REF_FILE_ID_KEY] || '').trim() : '';
    }

    function ensureRefFileId(file) {
        if (!file || typeof file !== 'object') return '';
        const existing = getRefFileId(file);
        if (existing) return existing;
        const created = createRefFileId();
        file[REF_FILE_ID_KEY] = created;
        return created;
    }

    function countRefFileIdInBook(bookData, fileId) {
        if (!bookData || typeof bookData !== 'object' || !fileId) return 0;
        let count = 0;
        Object.keys(bookData).forEach(function(folderName) {
            const files = bookData[folderName];
            if (!Array.isArray(files)) return;
            files.forEach(function(file) {
                if (getRefFileId(file) === fileId) count += 1;
            });
        });
        return count;
    }

    function preserveMemoryReferenceFileIdentity(currentFile, replacementFile) {
        if (!replacementFile || typeof replacementFile !== 'object') return replacementFile;
        const currentId = getRefFileId(currentFile);
        if (currentId && !getRefFileId(replacementFile)) replacementFile[REF_FILE_ID_KEY] = currentId;
        return replacementFile;
    }

    function getRefFileContentSignature(file) {
        if (!file || typeof file !== 'object') return '';
        const input = [file.name || '', file.content || '', file.createdAt || '', file.updatedAt || ''].join('\u001f');
        let first = 2166136261;
        let second = 2246822507;
        for (let index = 0; index < input.length; index += 1) {
            const code = input.charCodeAt(index);
            first = Math.imul(first ^ code, 16777619);
            second = Math.imul(second ^ code, 3266489909);
        }
        return (first >>> 0).toString(16).padStart(8, '0')
            + '-' + (second >>> 0).toString(16).padStart(8, '0')
            + '-' + input.length;
    }

    function getRefFileFingerprint(file) {
        const fileId = getRefFileId(file);
        return fileId ? 'rfp3-' + fileId : 'rfp2-stable-' + getRefFileContentSignature(file);
    }

    function getLegacyFingerprintSignature(fingerprint) {
        const value = String(fingerprint || '');
        if (!/^rfp2-/i.test(value)) return '';
        const match = value.match(/-([0-9a-f]{8}-[0-9a-f]{8}-\d+)$/i);
        return match ? match[1].toLowerCase() : '';
    }

    function createMemoryReferenceSelection(bookName, folderName, fileIndex) {
        const memBooks = getMemBooksSafe();
        const files = memBooks?.[bookName]?.[folderName];
        const idx = Number(fileIndex);
        const file = Array.isArray(files) && Number.isInteger(idx) && idx >= 0 ? files[idx] : null;
        if (!file) return null;
        let hadPersistentId = !!getRefFileId(file);
        const fileId = ensureRefFileId(file);
        if (countRefFileIdInBook(memBooks?.[bookName], fileId) > 1) {
            file[REF_FILE_ID_KEY] = createRefFileId();
            hadPersistentId = false;
        }
        if (!hadPersistentId) scheduleRefFileIdSave(memBooks);
        return {
            name: file.name,
            memBook: bookName,
            ownerUid: String(window.AccountDataScope?.getActiveUid?.() || window.ZHIYU_APP_STATE?.auth?.uid || window.AppState?.auth?.uid || 'guest'),
            memFolder: folderName,
            memIdx: idx,
            memFingerprint: getRefFileFingerprint(file)
        };
    }

    function getRefFileContent(bookName, fileName, folderName, fileIndex, expectedFingerprint) {
        const memBooks = getMemBooksSafe();
        if (!memBooks[bookName]) return null;
        const requestedName = String(fileName || '');
        const cleanName = requestedName.replace(/\.md$/i, '');
        const matchesName = function(file) {
            return !!file && (
                file.name === cleanName
                || file.name === cleanName + '.md'
                || file.name === requestedName
            );
        };
        const toResult = function(file, folder, idx) {
            return {
                name: cleanName || String(file?.name || '').replace(/\.md$/i, ''),
                content: file?.content || '',
                folder,
                idx,
                fingerprint: getRefFileFingerprint(file)
            };
        };
        const matchesFingerprint = function(file) {
            const expected = String(expectedFingerprint || '');
            if (!expected) return true;
            if (getRefFileFingerprint(file) === expected) {
                const fileId = getRefFileId(file);
                return !fileId || countRefFileIdInBook(memBooks[bookName], fileId) === 1;
            }
            const legacySignature = getLegacyFingerprintSignature(expected);
            return !!legacySignature && legacySignature === getRefFileContentSignature(file);
        };

        if (folderName) {
            const files = memBooks[bookName][folderName];
            if (!Array.isArray(files)) return null;
            const idx = Number(fileIndex);
            const hasExactIndex = fileIndex !== undefined && fileIndex !== null && fileIndex !== '';
            if (hasExactIndex) {
                return Number.isInteger(idx) && idx >= 0 && idx < files.length
                    && matchesName(files[idx]) && matchesFingerprint(files[idx])
                    ? toResult(files[idx], folderName, idx)
                    : null;
            }
            const foundIndex = files.findIndex(function(file) { return matchesName(file) && matchesFingerprint(file); });
            return foundIndex >= 0 ? toResult(files[foundIndex], folderName, foundIndex) : null;
        }

        for (const folder in memBooks[bookName]) {
            if (folder === '__memoryTrash') continue;
            const files = memBooks[bookName][folder];
            if (!Array.isArray(files)) continue;
            const foundIndex = files.findIndex(function(file) { return matchesName(file) && matchesFingerprint(file); });
            if (foundIndex >= 0) return toResult(files[foundIndex], folder, foundIndex);
        }
        return null;
    }

    function saveRefFileContent(bookName, fileName, newContent, folderName) {
        const memBooks = getMemBooksSafe();
        if (!memBooks[bookName]) return false;
        const cleanName = fileName.replace(/\.md$/i, '');
        const folderNames = folderName && memBooks[bookName][folderName]
            ? [folderName].concat(Object.keys(memBooks[bookName]).filter(folder => folder !== folderName))
            : Object.keys(memBooks[bookName]);
        for (const folder of folderNames) {
            const files = memBooks[bookName][folder] || [];
            const idx = files.findIndex(
                f => f.name === cleanName || f.name === cleanName + '.md' || f.name === fileName
            );
            if (idx >= 0) {
                files[idx].content = newContent;
                files[idx].updatedAt = new Date().toISOString();
                saveMemBooksSafe(memBooks);
                return true;
            }
        }
        return false;
    }

    function getRoleListFile(bookName) {
        if (!bookName) return null;
        return getRefFileContent(bookName, bookName + '_角色列表')
            || getRefFileContent(bookName, '角色列表')
            || getRefFileContent(bookName, bookName + '_角色关系网')
            || getRefFileContent(bookName, '角色关系网');
    }

    const REGENERATION_MEMORY_TYPES = ['追踪表', '边界卡', '承接卡', '信息表', '信息卡', '设定集'];

    function isRegenerationMemoryFile(bookName, fileName) {
        const normalized = String(fileName || '').replace(/\.md$/i, '');
        return REGENERATION_MEMORY_TYPES.some(function(type) {
            return normalized === type || normalized === bookName + '_' + type;
        });
    }

    function createChapterRegenerationSnapshot(bookName, vi, ci) {
        const books = typeof window.gB === 'function' ? window.gB() : {};
        const chapter = books?.[bookName]?.volumes?.[vi]?.chapters?.[ci];
        if (!chapter) return null;
        const memBooks = getMemBooksSafe();
        const memoryFiles = [];
        Object.keys(memBooks?.[bookName] || {}).forEach(function(folderName) {
            const files = Array.isArray(memBooks[bookName][folderName]) ? memBooks[bookName][folderName] : [];
            files.forEach(function(file, index) {
                if (!file || !isRegenerationMemoryFile(bookName, file.name)) return;
                memoryFiles.push({
                    folderName,
                    index,
                    name: String(file.name || ''),
                    content: String(file.content || ''),
                    updatedAt: file.updatedAt
                });
            });
        });
        return {
            bookName,
            vi,
            ci,
            chapterLocalId: String(chapter._localId || window.ensureChapterLocalId?.(chapter) || ''),
            chapterContent: String(chapter.content || ''),
            memoryFiles
        };
    }

    function findSnapshotChapter(snapshot) {
        if (!snapshot) return null;
        const books = typeof window.gB === 'function' ? window.gB() : {};
        const byPosition = books?.[snapshot.bookName]?.volumes?.[snapshot.vi]?.chapters?.[snapshot.ci];
        if (!snapshot.chapterLocalId || String(byPosition?._localId || '') === snapshot.chapterLocalId) return byPosition || null;
        for (const volume of books?.[snapshot.bookName]?.volumes || []) {
            const found = (volume.chapters || []).find(function(chapter) {
                return String(chapter?._localId || '') === snapshot.chapterLocalId;
            });
            if (found) return found;
        }
        return null;
    }

    function restoreChapterRegenerationSnapshot(snapshot, resultBox) {
        const chapter = findSnapshotChapter(snapshot);
        if (!chapter) return false;
        chapter.content = snapshot.chapterContent;
        if (
            resultBox
            && window.AppState?.chapter?.book === snapshot.bookName
            && window.AppState?.chapter?.vi === snapshot.vi
            && window.AppState?.chapter?.ci === snapshot.ci
        ) {
            if (typeof window.ZhiyuEditorAdapter?.replaceContent === 'function') {
                window.ZhiyuEditorAdapter.replaceContent(resultBox, snapshot.chapterContent);
            } else {
                resultBox.textContent = snapshot.chapterContent;
            }
        }
        return true;
    }

    function applyChapterRegenerationContent(snapshot, nextContent) {
        const chapter = findSnapshotChapter(snapshot);
        if (!chapter) return null;
        chapter.content = String(nextContent || '');
        return chapter;
    }

    function isChapterRegenerationMemoryUnchanged(snapshot) {
        if (!snapshot) return true;
        const memBooks = getMemBooksSafe();
        return snapshot.memoryFiles.every(function(entry) {
            const files = memBooks?.[snapshot.bookName]?.[entry.folderName];
            const exact = Array.isArray(files) ? files[entry.index] : null;
            const file = exact && String(exact.name || '') === entry.name
                ? exact
                : (Array.isArray(files) ? files.find(item => String(item?.name || '') === entry.name) : null);
            return !!file
                && String(file.content || '') === entry.content
                && file.updatedAt === entry.updatedAt;
        });
    }

    // 旧入口保留兼容，但不再允许在生成开始前用正则删除整份记忆文件中的内容。
    // 成功后的章节级更新由各记忆卡的结构化 upsert 完成。
    function stripChapterFromMemoryCards() {
        return [];
    }

    function ensureMemBook(bookName) {
        const memBooks = getMemBooksSafe();
        if (!memBooks[bookName]) {
            memBooks[bookName] = { '默认文件夹': [] };
            saveMemBooksSafe(memBooks);
        }
        return getMemBooksSafe();
    }

    function findOrCreateMemoryFile(memBooks, bookName, defaultFolder, name, initContent) {
        for (const folder in memBooks[bookName]) {
            const found = memBooks[bookName][folder].find(f => f.name === name);
            if (found) return found;
        }
        const newFile = {
            name,
            content: initContent || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        memBooks[bookName][defaultFolder].push(newFile);
        return newFile;
    }

    window.ZHIYU_MEMORY_FILE_HELPERS = {
        getRefFileFingerprint,
        preserveMemoryReferenceFileIdentity,
        createMemoryReferenceSelection,
        getRefFileContent,
        saveRefFileContent,
        getRoleListFile,
        stripChapterFromMemoryCards,
        createChapterRegenerationSnapshot,
        restoreChapterRegenerationSnapshot,
        applyChapterRegenerationContent,
        isChapterRegenerationMemoryUnchanged,
        ensureMemBook,
        findOrCreateMemoryFile
    };
    window.getRefFileFingerprint = getRefFileFingerprint;
    window.preserveMemoryReferenceFileIdentity = preserveMemoryReferenceFileIdentity;
    window.createMemoryReferenceSelection = createMemoryReferenceSelection;
    window.getRefFileContent = getRefFileContent;
    window.saveRefFileContent = saveRefFileContent;
    window.getRoleListFile = getRoleListFile;
    window.stripChapterFromMemoryCards = stripChapterFromMemoryCards;
    window.createChapterRegenerationSnapshot = createChapterRegenerationSnapshot;
    window.restoreChapterRegenerationSnapshot = restoreChapterRegenerationSnapshot;
    window.applyChapterRegenerationContent = applyChapterRegenerationContent;
    window.isChapterRegenerationMemoryUnchanged = isChapterRegenerationMemoryUnchanged;
    window.ensureMemBook = ensureMemBook;
    window.findOrCreateMemoryFile = findOrCreateMemoryFile;
})(window);
