// 拆分项目记忆库页面模块。
// 只迁移记忆库页面、文件夹、文件列表、编辑弹窗和批量管理前端逻辑，不改变后端接口。
(function(window) {
    'use strict';

    const CONFIG = window.ZHIYU_CONFIG || {};
    const Utils = window.ZHIYU_UTILS || {};
    const Toast = window.ZHIYU_TOAST;
    const Confirm = window.ZHIYU_CONFIRM;
    const Prompt = window.ZHIYU_PROMPT || window.Prompt;
    const IDB = window.ZHIYU_IDB || window.IDB;
    const AppState = window.ZHIYU_APP_STATE || window.AppState || {};
    const gB = window.gB || function() { return {}; };
    const renderLineIcon = window.renderLineIcon || function() { return ''; };
    const countMemFiles = window.countMemFiles || function() { return 0; };
    const getMemBookGroupStats = window.getMemBookGroupStats || function() { return { associated: 0, fineOutline: 0, decompose: 0 }; };
    const getMemFolderType = window.getMemFolderType || function() { return 'associated'; };
    const getMemFolderTypeLabel = window.getMemFolderTypeLabel || function() { return '关联文件夹'; };
    const formatMemoryFolderName = window.formatMemoryFolderName || function(folderName) { return folderName; };
    const formatMemoryFileDisplayName = window.formatMemoryFileDisplayName || function(fileName) { return String(fileName || '').replace(/\.md$/i, ''); };
    const MEMORY_TRASH_KEY = '__memoryTrash';

    function triggerCloudSync() {
        if (typeof window._triggerCloudSync === 'function') window._triggerCloudSync();
    }

    function normalizeMemFileList(value) {
        if (Array.isArray(value)) return value;
        if (value && typeof value === 'object') {
            if (Array.isArray(value.files)) return value.files;
            if (Array.isArray(value.items)) return value.items;
            const values = Object.values(value).filter(function(item) {
                return item && typeof item === 'object' && ('content' in item || 'name' in item || 'fileName' in item || 'title' in item);
            });
            if (values.length) return values;
        }
        return [];
    }

        // =================== Memory display module entry ===================

        // 记忆库（IndexedDB + 内存缓存）
        let _memBooksCache = null;
        let _memBooksReadyUid = '';
        const _memBooksOwners = new WeakMap();
        async function _loadMemBooks(forceReload) {
            if (_memBooksCache && !forceReload) return;
            const scopeUid = AccountDataScope.getActiveUid();
            const storageKey = AccountDataScope.key('mem_books', scopeUid);
            _memBooksReadyUid = '';
            _memBooksCache = {};
            try {
                const val = await IDB.get(storageKey);
                if (AccountDataScope.getActiveUid() !== scopeUid) return;
                if (val !== undefined) { _memBooksCache = val; }
            } catch(e) {}
            const preferredMemory = window.ZHIYU_STORAGE_SERVICE?.getCurrentStorageMemoryBooks?.(scopeUid);
            if (preferredMemory && typeof preferredMemory === 'object' && !Array.isArray(preferredMemory)) {
                _memBooksCache = preferredMemory;
            }
            if (!_memBooksCache || typeof _memBooksCache !== 'object' || Array.isArray(_memBooksCache)) _memBooksCache = {};
            _memBooksOwners.set(_memBooksCache, scopeUid);
            // 启动加载只允许做无损结构迁移。文件正文属于用户数据，
            // 不能送入面向 AI 响应的清理器，也不能因为字符串变化自动回写。
            let migrated = false;
            for (const bookName in _memBooksCache) {
                const book = _memBooksCache[bookName];
                if (!book || typeof book !== 'object' || Array.isArray(book)) continue;
                for (const folder in _memBooksCache[bookName]) {
                    const original = _memBooksCache[bookName][folder];
                    if (folder === MEMORY_TRASH_KEY) {
                        const trashFiles = Array.isArray(original?.files) ? original.files : normalizeMemFileList(original);
                        if (!original || !Array.isArray(original.files)) {
                            _memBooksCache[bookName][folder] = { files: trashFiles };
                            migrated = true;
                        }
                        continue;
                    }
                    const files = normalizeMemFileList(original);
                    if (files !== original) {
                        _memBooksCache[bookName][folder] = files;
                        migrated = true;
                    }
                }
            }
            if (migrated) await _saveMemBooks(_memBooksCache);
            if (AccountDataScope.getActiveUid() === scopeUid) _memBooksReadyUid = scopeUid;
        }
        function getMemBooks(){ return _memBooksCache || {}; }
        function isMemBooksReadyForStorageBaseline(uid) {
            return !!uid && _memBooksReadyUid === uid;
        }
        let _memBooksSavePending = 0;
        const applyStorageMemorySnapshot = function(event) {
            const uid = String(event?.detail?.accountId || '');
            if (!uid || uid !== AccountDataScope.getActiveUid() || _memBooksSavePending > 0) return;
            const preferredMemory = window.ZHIYU_STORAGE_SERVICE?.getCurrentStorageMemoryBooks?.(uid);
            if (!preferredMemory || typeof preferredMemory !== 'object' || Array.isArray(preferredMemory)) return;
            _memBooksCache = preferredMemory;
            _memBooksOwners.set(_memBooksCache, uid);
            _memBooksReadyUid = uid;
            try {
                window.refreshMemGrid?.();
                window.renderMemFolderSidebar?.();
                window.renderMemFileList?.();
            } catch(error) {}
        };
        window.addEventListener?.('zhiyu:storage-v2-preferred-ready', applyStorageMemorySnapshot);
        window.addEventListener?.('zhiyu:storage-v1-fallback-ready', applyStorageMemorySnapshot);
        let _memBooksSaveQueue = Promise.resolve();
        async function waitForMemBooksSaveIdle() {
            const saved = await _memBooksSaveQueue;
            return saved !== false;
        }
        async function _saveMemBooks(mb, options) {
            if (window.ZHIYU_OPERATION_TUTORIAL?.isActive?.()
                || window.ZHIYU_MEMORY_PREVIEW_CONTEXT?.active
                || document.body?.classList.contains('zhiyu-outline-tutorial-active')) return false;
            const uid = AccountDataScope.getActiveUid();
            const ownerUid = mb && typeof mb === 'object' ? _memBooksOwners.get(mb) : '';
            if (ownerUid && ownerUid !== uid) return false;
            const key = AccountDataScope.key('mem_books', uid);
            const candidate = typeof structuredClone === 'function'
                ? structuredClone(mb || {})
                : JSON.parse(JSON.stringify(mb || {}));
            _memBooksSavePending += 1;
            _memBooksSaveQueue = _memBooksSaveQueue.then(async function() {
                try {
                    const storageService = window.ZHIYU_STORAGE_SERVICE;
                    const ok = storageService && typeof storageService.saveMemoryBooks === 'function'
                        ? await storageService.saveMemoryBooks(candidate, uid, options)
                        : await IDB.set(key, candidate);
                    if (ok === false) throw new Error('IndexedDB save returned false');
                    if (AccountDataScope.getActiveUid() !== uid) return false;
                    _memBooksCache = candidate;
                    _memBooksOwners.set(candidate, uid);
                    return true;
                } catch(e) {
                    try {
                        const persisted = await IDB.get(key);
                        if (AccountDataScope.getActiveUid() === uid) {
                            _memBooksCache = persisted && typeof persisted === 'object' && !Array.isArray(persisted)
                                ? persisted
                                : {};
                            _memBooksOwners.set(_memBooksCache, uid);
                        }
                    } catch(readError) {}
                    Toast.warn('本地关联文件保存失败，请稍后重试');
                    return false;
                }
            }).finally(function() {
                _memBooksSavePending = Math.max(0, _memBooksSavePending - 1);
            });
            return _memBooksSaveQueue;
        }
        function sMB(mb, options){
            return _saveMemBooks(mb, options).then(function(saved) {
                if (saved && options?.cloudWrite !== 'suppress') triggerCloudSync();
                return saved;
            });
        }
        async function sMBAtomic(mb) {
            const saved = await _saveMemBooks(mb, { commitCacheAfterPersist: true });
            if (saved) triggerCloudSync();
            return saved;
        }

        // 云端拉取/恢复专用：只保存到本地，不再触发普通云端回传，避免形成回声写入。
        async function saveMemoryBooksFromCloud(mb) {
            return _saveMemBooks(mb, { cloudWrite: 'suppress', source: 'cloud-restore' });
        }

        // 供需要同时提交作品和关联资料的功能更新内存缓存；持久化由统一事务完成，
        // 这里不再次写 IndexedDB，也不触发普通云同步。
        function replaceMemBooksSnapshot(mb, expectedUid) {
            const uid = AccountDataScope.getActiveUid();
            if (expectedUid && uid !== expectedUid) return false;
            _memBooksCache = mb && typeof mb === 'object' ? mb : {};
            _memBooksOwners.set(_memBooksCache, uid);
            _memBooksReadyUid = uid;
            return true;
        }

        function openMemBook(bookName){
            AppState.memory.book=bookName;
            AppState.memory.view='associated';
            AppState.memory.folder=''; // 重置文件夹选择
            const memBooks=getMemBooks();
            document.getElementById('memMain').style.display='none';
            document.getElementById('memSub').style.display='flex';
            document.getElementById('memTitle').textContent=bookName;
            document.getElementById('btnMemBatchManageSub').style.display='inline-flex';
            refreshMemTree();
        }

        function closeMem(){
            AppState.memory.book='';
            AppState.memory.folder='';
            AppState.memory.view='associated';
            document.getElementById('memMain').style.display='block';
            document.getElementById('memSub').style.display='none';
            document.getElementById('btnMemBatchManageSub').style.display='none';
            AppState.memory.batchMode=false;
            document.getElementById('btnMemBatchDelete').style.display='none';
            document.getElementById('memBatchActions').style.display='none';
            window.refreshMemGrid?.();
        }


        function refreshMemTree(){
            if(!AppState.memory.book)return;
            window.renderMemFolderSidebar?.();
            window.renderMemFileList?.();
        }

        function getMemoryTrash(bookData) {
            if (!bookData) return [];
            if (!bookData[MEMORY_TRASH_KEY] || !Array.isArray(bookData[MEMORY_TRASH_KEY].files)) {
                bookData[MEMORY_TRASH_KEY] = { files: [] };
            }
            return bookData[MEMORY_TRASH_KEY].files;
        }
        function cloneMemoryFile(file) {
            try {
                return JSON.parse(JSON.stringify(file || {}));
            } catch(e) {
                return Object.assign({}, file || {});
            }
        }
        function moveMemFileToTrash(memBooks, bookName, folderName, idx) {
            const folder = memBooks?.[bookName]?.[folderName];
            if (!Array.isArray(folder) || idx < 0 || idx >= folder.length) return null;
            const file = folder.splice(idx, 1)[0];
            const fileSnapshot = cloneMemoryFile(file);
            const trash = getMemoryTrash(memBooks[bookName]);
            trash.unshift({
                name: file?.name || '未命名文件',
                content: file?.content || '',
                file: fileSnapshot,
                type: file?.type || '',
                tags: Array.isArray(file?.tags) ? file.tags.slice() : [],
                originalFolder: folderName,
                originalFolderType: typeof window.getMemFolderType === 'function' ? window.getMemFolderType(folderName) : 'custom',
                deletedAt: new Date().toISOString(),
                createdAt: file?.createdAt || '',
                updatedAt: file?.updatedAt || ''
            });
            return file;
        }
        async function syncMemoryBookIfLoggedIn(bookName) {
            if (!AppState.auth?.isLoggedIn) return { skipped: true, reason: 'logged-out' };
            try {
                if (typeof window._syncCurrentBookMemoryToCloud !== 'function') {
                    throw new Error('统一云端记忆同步模块尚未加载');
                }
                return await window._syncCurrentBookMemoryToCloud(bookName);
            } catch(e) {
                Toast.warn('本地关联文件已保存；云端刚被其他页面更新或暂时不可用，请稍后重试。');
                return { skipped: true, reason: 'cloud-sync-failed', error: e };
            }
        }

        async function saveAndSyncMemoryBook(memBooks, bookName) {
            const saved = await _saveMemBooks(memBooks);
            if (!saved) return false;
            // _saveMemBooks 已把本地快照和可靠云写记录放进同一事务。
            // 此处不得再直连 POST，否则会和 outbox 并发、重复递增 revision。
            return true;
        }

        async function renameMemFolder(oldName){
            const newName = await Prompt.show('请输入新的文件夹名称：', oldName);
            if(!newName || newName===oldName) return;
            const memBooks=getMemBooks();
            if(memBooks[AppState.memory.book][newName]){
                Toast.warn('文件夹已存在！');
                return;
            }
            memBooks[AppState.memory.book][newName]=memBooks[AppState.memory.book][oldName];
            delete memBooks[AppState.memory.book][oldName];
            sMB(memBooks);
            AppState.memory.folder=newName;
            refreshMemTree();
        }

        async function deleteMemFolder(folderName){
            const _cf = await Confirm.show(`确定删除文件夹"${folderName}"？里面的文件也会被删除。`); if(!_cf) return;
            const memBooks=getMemBooks();
            const bookName = AppState.memory.book;
            const files = Array.isArray(memBooks[bookName][folderName]) ? memBooks[bookName][folderName] : [];
            for (let idx = files.length - 1; idx >= 0; idx--) {
                moveMemFileToTrash(memBooks, bookName, folderName, idx);
            }
            delete memBooks[bookName][folderName];
            await saveAndSyncMemoryBook(memBooks, bookName);
            AppState.memory.folder='';
            refreshMemTree();
        }

        async function renameMemFile(oldName, idx){
            // 系统文件不允许重命名
            const sysSuffixes = ['_大纲','_边界卡','_追踪表','_设定集','_信息卡','.md'];
            const isSys = sysSuffixes.some(s => oldName.endsWith(s)) || /^[^_]+_(大纲|边界卡|追踪表|设定集|信息卡)$/.test(oldName);
            if (isSys) { Toast.warn('系统文件不允许重命名'); return; }
            const newName = await Prompt.show('请输入新的文件名：', oldName);
            if(!newName || newName===oldName) return;
            const memBooks=getMemBooks();
            memBooks[AppState.memory.book][AppState.memory.folder][idx].name=newName;
            memBooks[AppState.memory.book][AppState.memory.folder][idx].updatedAt=new Date().toISOString();
            sMB(memBooks);
            window.renderMemFileList?.();
        }

        async function deleteMemFile(folderName, idx){
            const _cf = await Confirm.show('确定删除这个文件？'); if(!_cf) return;
            const memBooks=getMemBooks();
            const bookName = AppState.memory.book;
            moveMemFileToTrash(memBooks, bookName, folderName, idx);
            await saveAndSyncMemoryBook(memBooks, bookName);
            window.renderMemFileList?.();
            window.renderMemFolderSidebar?.(); // 更新文件夹数量
        }
        async function restoreMemoryTrashItem(idx) {
            const memBooks=getMemBooks();
            const bookName = AppState.memory.book;
            const trash = getMemoryTrash(memBooks[bookName]);
            const item = trash[idx];
            if (!item) return;
            const folderName = item.originalFolder || '默认文件夹';
            if (!Array.isArray(memBooks[bookName][folderName])) memBooks[bookName][folderName] = [];
            const restoredFile = cloneMemoryFile(item.file || item);
            delete restoredFile.file;
            delete restoredFile.originalFolder;
            delete restoredFile.originalFolderType;
            delete restoredFile.deletedAt;
            restoredFile.name = restoredFile.name || item.name || '未命名文件';
            restoredFile.content = restoredFile.content || item.content || '';
            restoredFile.type = restoredFile.type || item.type || '';
            restoredFile.tags = Array.isArray(restoredFile.tags) ? restoredFile.tags : (Array.isArray(item.tags) ? item.tags.slice() : []);
            restoredFile.createdAt = restoredFile.createdAt || item.createdAt || new Date().toISOString();
            restoredFile.updatedAt = new Date().toISOString();
            memBooks[bookName][folderName].push(restoredFile);
            trash.splice(idx, 1);
            await saveAndSyncMemoryBook(memBooks, bookName);
            refreshMemTree();
            Toast.success('文件已恢复');
        }
        async function permanentlyDeleteMemoryTrashItem(idx) {
            const _cf = await Confirm.show('确定彻底删除这个回收站文件？此操作不可恢复。'); if(!_cf) return;
            const memBooks=getMemBooks();
            const bookName = AppState.memory.book;
            const trash = getMemoryTrash(memBooks[bookName]);
            trash.splice(idx, 1);
            await saveAndSyncMemoryBook(memBooks, bookName);
            refreshMemTree();
        }
        async function clearMemoryTrash() {
            const memBooks=getMemBooks();
            const bookName = AppState.memory.book;
            const trash = getMemoryTrash(memBooks[bookName]);
            if (!trash.length) { Toast.warn('回收站为空'); return; }
            const _cf = await Confirm.show('确定清空记忆库回收站？此操作不可恢复。'); if(!_cf) return;
            trash.splice(0, trash.length);
            await saveAndSyncMemoryBook(memBooks, bookName);
            refreshMemTree();
        }
    window._loadMemBooks = _loadMemBooks;
    window.getMemBooks = getMemBooks;
    window.saveMemoryBooksFromCloud = saveMemoryBooksFromCloud;
    window.isMemBooksReadyForStorageBaseline = isMemBooksReadyForStorageBaseline;
    window.normalizeMemFileList = normalizeMemFileList;
    window._saveMemBooks = _saveMemBooks;
    window.waitForMemBooksSaveIdle = waitForMemBooksSaveIdle;
    window.sMB = sMB;
    window.sMBAtomic = sMBAtomic;
    window.replaceMemBooksSnapshot = replaceMemBooksSnapshot;
    window.openMemBook = openMemBook;
    window.closeMem = closeMem;
    window.refreshMemTree = refreshMemTree;
    window.renameMemFolder = renameMemFolder;
    window.deleteMemFolder = deleteMemFolder;
    window.renameMemFile = renameMemFile;
    window.deleteMemFile = deleteMemFile;
    window.MEMORY_TRASH_KEY = MEMORY_TRASH_KEY;
    window.getMemoryTrash = getMemoryTrash;
    window.moveMemFileToTrash = moveMemFileToTrash;
    window.restoreMemoryTrashItem = restoreMemoryTrashItem;
    window.permanentlyDeleteMemoryTrashItem = permanentlyDeleteMemoryTrashItem;
    window.clearMemoryTrash = clearMemoryTrash;
    window._syncMemoryBookIfLoggedIn = syncMemoryBookIfLoggedIn;
})(window);
