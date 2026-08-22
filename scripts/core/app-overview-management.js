// Split project overview management module.
// Keeps book restore/delete/rename/archive/batch/cover operations out of the legacy main script.
(function(window, document) {
    'use strict';

    const AppState = window.ZHIYU_APP_STATE;
    const STATUS = window.ZHIYU_STATUS;
    const Toast = window.ZHIYU_TOAST || window.Toast;
    const Confirm = window.ZHIYU_CONFIRM || window.Confirm;
    const Prompt = window.ZHIYU_PROMPT || window.Prompt;
    const LIFECYCLE_PENDING_PREFIX = 'zhiyu_local_lifecycle_request_v1_';

    function gB(){ return window.gB ? window.gB() : {}; }
    function sB(books, options){
        return typeof window.sB === 'function' ? window.sB(books, options) : Promise.resolve(false);
    }
    function getMemBooks(){ return typeof window.getMemBooks === 'function' ? window.getMemBooks() : {}; }
    function sMB(memBooks, options){
        return typeof window.sMB === 'function' ? window.sMB(memBooks, options) : Promise.resolve(false);
    }
    function touchBook(name){ if (typeof window.touchBook === 'function') window.touchBook(name); }
    function markBookDeleted(name, book){ if (typeof window.markBookDeleted === 'function') window.markBookDeleted(name, book); }
    function unmarkBookDeleted(name, book){ if (typeof window.unmarkBookDeleted === 'function') window.unmarkBookDeleted(name, book); }
    function refreshOverview(){ if (typeof window.refreshOverview === 'function') window.refreshOverview(); }
    function saveOverviewSyncVersions(){ if (typeof window._saveSyncVersions === 'function') window._saveSyncVersions(); }
    function updateOverviewSyncUI(){ if (typeof window.updateSyncUI === 'function') window.updateSyncUI(); }
    function cloneOverviewValue(value) {
        if (typeof structuredClone === 'function') return structuredClone(value);
        return JSON.parse(JSON.stringify(value || {}));
    }

    function lifecyclePendingKey(path, bookId, uid) {
        const action = String(path || '').split('/').filter(Boolean).pop() || 'action';
        const safeAction = action.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);
        const safeBookId = String(bookId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 110);
        return window.AccountDataScope.key(
            LIFECYCLE_PENDING_PREFIX + safeAction + '_' + safeBookId,
            uid
        );
    }

    async function findLifecyclePending(path, payload, uid) {
        if (!window.ZHIYU_IDB?.scanPrefix) return null;
        const wantedBookId = String(payload?.bookId || '').trim();
        const wantedName = String(payload?.oldBookName || payload?.bookName || '').trim();
        let found = null;
        await window.ZHIYU_IDB.scanPrefix(LIFECYCLE_PENDING_PREFIX, function(key, value) {
            if (found || !value || value.uid !== uid || value.path !== path) return;
            const storedPayload = value.requestPayload || {};
            const storedBookId = String(storedPayload.bookId || value.bookId || '').trim();
            const storedName = String(storedPayload.oldBookName || storedPayload.bookName || '').trim();
            if ((wantedBookId && storedBookId === wantedBookId)
                || (!wantedBookId && wantedName && storedName === wantedName)) {
                found = { key, value };
            }
        });
        return found;
    }

    async function saveLifecyclePending(key, value, accountTask, writeOperation) {
        if (!window.ZHIYU_IDB?.setMany) throw new Error('本机可靠操作存储尚未加载');
        if (writeOperation?.token?.fenceKey && writeOperation?.token?.leaseId) {
            if (!window.ZHIYU_IDB?.setManyFenced) throw new Error('本机可靠操作存储版本过旧');
            await window.ZHIYU_IDB.setManyFenced(
                [[key, value]],
                writeOperation.token.fenceKey,
                writeOperation.token.leaseId
            );
        } else {
            await window.ZHIYU_IDB.setMany([[key, value]]);
        }
        assertOverviewAccountTask(accountTask);
        assertOverviewWriteOperation(accountTask, writeOperation);
    }

    async function clearLifecyclePending(key, requestId, accountTask, writeOperation) {
        if (!window.ZHIYU_IDB?.mutateKv) throw new Error('本机可靠操作存储尚未加载');
        const fenced = writeOperation?.token?.fenceKey && writeOperation?.token?.leaseId;
        const mutate = fenced
            ? window.ZHIYU_IDB?.mutateKvFenced?.bind(window.ZHIYU_IDB)
            : window.ZHIYU_IDB.mutateKv.bind(window.ZHIYU_IDB);
        if (!mutate) throw new Error('本机可靠操作存储版本过旧');
        const args = [[key]];
        if (fenced) args.push(writeOperation.token.fenceKey, writeOperation.token.leaseId);
        args.push(function(values) {
            const current = values[key];
            if (current && String(current.requestId || '') !== String(requestId || '')) {
                return { entries: [], result: false };
            }
            return { deletes: [key], result: true };
        });
        await mutate(...args);
        assertOverviewAccountTask(accountTask);
        assertOverviewWriteOperation(accountTask, writeOperation);
    }

    async function commitOverviewBooksAndMemory(books, memBooks, accountTask, writeOperation, lifecycleMutation) {
        assertOverviewAccountTask(accountTask);
        assertOverviewWriteOperation(accountTask, writeOperation);
        const uid = String(accountTask?.uid || window.AccountDataScope?.getActiveUid?.() || '');
        const storage = window.StorageService;
        if (storage?.commitBooksAndMemory && window.AccountDataScope?.key) {
            const committed = await storage.commitBooksAndMemory(
                books,
                window.AccountDataScope.key('mem_books', uid),
                memBooks,
                uid,
                [],
                { source: 'book-lifecycle', lifecycleMutation }
            );
            assertOverviewAccountTask(accountTask);
            assertOverviewWriteOperation(accountTask, writeOperation);
            if (!committed) return false;
            return window.replaceMemBooksSnapshot?.(committed.memBooks || memBooks, uid) !== false;
        }
        const results = await Promise.all([
            sB(books, { cloudWrite: 'suppress', source: 'book-lifecycle', lifecycleMutation }),
            sMB(memBooks, { cloudWrite: 'suppress', source: 'book-lifecycle', lifecycleMutation })
        ]);
        assertOverviewAccountTask(accountTask);
        assertOverviewWriteOperation(accountTask, writeOperation);
        return results.every(Boolean);
    }

    function beginOverviewAccountTask() {
        if (typeof window.beginAccountScopedTask === 'function') return window.beginAccountScopedTask();
        const uid = String(window.AccountDataScope?.getActiveUid?.() || AppState.auth?.uid || '');
        const epoch = typeof window.getAccountScopeEpoch === 'function' ? window.getAccountScopeEpoch() : null;
        return {
            uid,
            epoch,
            signal: undefined,
            isCurrent: function() {
                if (String(window.AccountDataScope?.getActiveUid?.() || AppState.auth?.uid || '') !== uid) return false;
                return epoch == null || typeof window.isCurrentAccountSync !== 'function'
                    || window.isCurrentAccountSync(uid, epoch);
            },
            release: function() {}
        };
    }

    function assertOverviewAccountTask(task) {
        if (task?.isCurrent?.()) return;
        const error = new Error('账号已切换，旧账号作品操作结果已丢弃');
        error.code = 'ACCOUNT_CONTEXT_CHANGED';
        throw error;
    }

    function createOverviewAccountContextError() {
        const error = new Error('作品操作期间编辑权已变化，旧结果已停止应用');
        error.code = 'ACCOUNT_CONTEXT_CHANGED';
        return error;
    }

    function isOverviewAccountContextError(error) {
        return error?.code === 'ACCOUNT_CONTEXT_CHANGED' || error?.name === 'AbortError';
    }

    function beginOverviewWriteOperation(accountTask, label) {
        assertOverviewAccountTask(accountTask);
        const lease = window.ZHIYU_ACCOUNT_WRITE_LEASE;
        const token = lease?.beginWrite?.(accountTask.uid, {
            message: '此标签页为只读，当前“' + String(label || '作品操作') + '”已停止。'
        }) || (!lease ? { legacy: true, uid: accountTask.uid } : null);
        if (!token) throw createOverviewAccountContextError();
        return { uid: accountTask.uid, lease, token };
    }

    function assertOverviewWriteOperation(accountTask, operation) {
        assertOverviewAccountTask(accountTask);
        if (!operation || operation.uid !== accountTask.uid
            || (operation.lease
                && operation.lease.isWriteTokenCurrent?.(operation.token) !== true)) {
            throw createOverviewAccountContextError();
        }
        return true;
    }

    function endOverviewWriteOperation(operation) {
        operation?.lease?.endWrite?.(operation.token);
    }

        function getOverviewBookId(book, name) {
            if (typeof window.ensureBookStableId === 'function') return window.ensureBookStableId(book, name);
            return String(book?._bid || book?.bookId || book?.id || '');
        }

        function getOverviewKnownBookId(book) {
            return String(book?._bid || book?.bookId || book?.id || '').trim();
        }

        async function postOverviewLifecycle(path, payload, _fallbackMessage, suppliedTask, suppliedWriteOperation) {
            const accountTask = suppliedTask || beginOverviewAccountTask();
            const ownsTask = !suppliedTask;
            const ownsWriteOperation = !suppliedWriteOperation;
            let writeOperation = suppliedWriteOperation || null;
            try {
                assertOverviewAccountTask(accountTask);
                if (!writeOperation) writeOperation = beginOverviewWriteOperation(accountTask, '作品本机管理');
                assertOverviewWriteOperation(accountTask, writeOperation);
                const requestPayload = cloneOverviewValue(payload || {});
                const requestId = String(requestPayload.requestId || (
                    'local_lifecycle_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
                ));
                requestPayload.requestId = requestId;
                const bookId = String(requestPayload.bookId || '');
                return {
                    success: true,
                    requestId,
                    taskId: requestId,
                    bookId,
                    receipt: { bookId },
                    bookRevision: 1,
                    memoryRevision: 0,
                    localOnly: true,
                    path,
                    _requestPayload: requestPayload
                };
            } finally {
                if (ownsWriteOperation) endOverviewWriteOperation(writeOperation);
                if (ownsTask) accountTask.release?.();
            }
        }

        function isRemoteBookAlreadyAbsent(error) {
            return String(error?.code || '').trim().toUpperCase() === 'BOOK_NOT_FOUND';
        }

        async function waitForOverviewBookWrites(accountTask, writeOperation) {
            assertOverviewWriteOperation(accountTask, writeOperation);
            const storage = window.ZHIYU_STORAGE_SERVICE || window.StorageService;
            if (typeof storage?.waitForBooksWriteIdle === 'function') {
                const ready = await storage.waitForBooksWriteIdle(accountTask.uid);
                assertOverviewWriteOperation(accountTask, writeOperation);
                if (ready !== true) throw createOverviewAccountContextError();
            }
            return true;
        }

        function renameOverviewMemoryFiles(memoryBook, oldName, newName) {
            if (!memoryBook || typeof memoryBook !== 'object') return memoryBook;
            const oldPrefix = oldName + '_';
            const newPrefix = newName + '_';
            for (const folder in memoryBook) {
                memoryBook[folder] = (memoryBook[folder] || []).map(function(file) {
                    if (file?.name && file.name.startsWith(oldPrefix)) {
                        file.name = newPrefix + file.name.substring(oldPrefix.length);
                    }
                    return file;
                });
            }
            return memoryBook;
        }

        async function restoreBook(name, suppliedTask){
            const actionTask = suppliedTask || beginOverviewAccountTask();
            const ownsTask = !suppliedTask;
            let writeOperation = null;
            try {
            assertOverviewAccountTask(actionTask);
            const books=gB();
            const book = books[name];
            if (!book) return;
            const originalBookId = getOverviewKnownBookId(book);
            writeOperation = beginOverviewWriteOperation(actionTask, '恢复作品');
            let confirmedBookId = '';
            if (AppState.auth.isLoggedIn) {
                const knownBookId = getOverviewKnownBookId(book);
                try {
                    let result;
                    try {
                        result = await postOverviewLifecycle('restore', {
                            bookName: name,
                            bookId: knownBookId
                        }, '云端恢复失败', actionTask, writeOperation);
                    } catch(error) {
                        if (!knownBookId || !isRemoteBookAlreadyAbsent(error)) throw error;
                        // 旧版本本机可能保存过随机编号；仅在云端确认编号不存在时，按同账号同名旧记录补试一次。
                        result = await postOverviewLifecycle('restore', {
                            bookName: name,
                            bookId: ''
                        }, '云端恢复失败', actionTask, writeOperation);
                    }
                    confirmedBookId = String(result?.bookId || result?.receipt?.bookId || '').trim();
                } catch(error) {
                    if (isOverviewAccountContextError(error)) return;
                    AppState.sync.status = 'error';
                    updateOverviewSyncUI();
                    Toast.error(error.message || '恢复失败，请重试');
                    return;
                }
            }
            assertOverviewWriteOperation(actionTask, writeOperation);
            await waitForOverviewBookWrites(actionTask, writeOperation);
            const latestBooks = gB();
            const latestBook = latestBooks[name];
            if (!latestBook || (originalBookId && getOverviewKnownBookId(latestBook) !== originalBookId)) {
                Toast.warn('作品在恢复期间已变化，本机新内容已保留；请重新登录核对云端状态');
                return;
            }
            const nextBooks = cloneOverviewValue(latestBooks);
            const nextBook = nextBooks[name];
            nextBook.status=STATUS.ACTIVE;
            if (confirmedBookId) {
                nextBook._bid = confirmedBookId;
                nextBook.bookId = confirmedBookId;
            }
            const saved = await sB(nextBooks, {
                cloudWrite: 'suppress',
                source: 'book-lifecycle',
                lifecycleMutation: {
                    type: 'status',
                    bookId: confirmedBookId || originalBookId,
                    previousBookId: originalBookId,
                    bookName: name,
                    status: STATUS.ACTIVE
                },
                writeToken: writeOperation.token
            });
            assertOverviewWriteOperation(actionTask, writeOperation);
            if (!saved) {
                Toast.error('云端已恢复作品，但本机保存失败；重新登录后会自动恢复');
                return;
            }
            unmarkBookDeleted(name, nextBook);
            refreshOverview();
            } catch(error) {
                if (!isOverviewAccountContextError(error)) throw error;
            } finally {
                endOverviewWriteOperation(writeOperation);
                if (ownsTask) actionTask.release?.();
            }
        }

        async function permanentlyDeleteBook(name){
            const actionTask = beginOverviewAccountTask();
            let writeOperation = null;
            try {
            assertOverviewAccountTask(actionTask);
            // 检测关联的记忆库文件
            const warningMemBooks = getMemBooks();
            var memWarning = '';
            if (warningMemBooks[name]) {
                var fileCount = 0;
                for (var folder in warningMemBooks[name]) {
                    fileCount += (warningMemBooks[name][folder] || []).length;
                }
                if (fileCount > 0) {
                    memWarning = '\n\n⚠️ 记忆库中该作品的 ' + fileCount + ' 个文件也将被永久清除！';
                }
            }
            const _cf = await Confirm.show('确定彻底删除"' + name + '"？此操作不可恢复！' + memWarning); if(!_cf)return;
            assertOverviewAccountTask(actionTask);
            const books=gB();
            const deletedBook = books[name];
            if (!deletedBook) return;
            const deletedBookId = getOverviewBookId(deletedBook, name);
            writeOperation = beginOverviewWriteOperation(actionTask, '彻底删除作品');
            let remoteAlreadyAbsent = false;
            if (AppState.auth.isLoggedIn) {
                try {
                    await postOverviewLifecycle('delete', {
                        bookName: name,
                        bookId: deletedBookId
                    }, '云端彻底删除失败', actionTask, writeOperation);
                } catch(error) {
                    if (isOverviewAccountContextError(error)) return;
                    if (isRemoteBookAlreadyAbsent(error)) {
                        remoteAlreadyAbsent = true;
                    } else {
                        AppState.sync.status = 'error';
                        updateOverviewSyncUI();
                        Toast.error(error.message || '彻底删除失败，请重试');
                        return;
                    }
                }
            }
            assertOverviewWriteOperation(actionTask, writeOperation);
            await waitForOverviewBookWrites(actionTask, writeOperation);
            const latestBooks = gB();
            const latestDeletedBook = latestBooks[name];
            if (latestDeletedBook && getOverviewBookId(latestDeletedBook, name) !== deletedBookId) {
                Toast.warn('作品在删除期间已被替换，本机新作品已保留；请重新登录核对云端状态');
                return;
            }
            const nextBooks = cloneOverviewValue(latestBooks);
            const nextMemBooks = cloneOverviewValue(getMemBooks());
            if (nextBooks[name]) delete nextBooks[name];
            if (nextMemBooks[name]) delete nextMemBooks[name];
            const locallyDeleted = await commitOverviewBooksAndMemory(
                nextBooks,
                nextMemBooks,
                actionTask,
                writeOperation,
                { type: 'delete', bookId: deletedBookId, oldName: name }
            );
            assertOverviewWriteOperation(actionTask, writeOperation);
            if (!locallyDeleted) {
                Toast.error('云端已删除作品，但本机保存失败；重新登录后会自动对齐');
                return;
            }
            markBookDeleted(name, latestDeletedBook || deletedBook);
            window.discardOGLinkedMemoryBook?.(name);
            window.discardOGOutlineSelectionBook?.(name);
            touchBook(name); delete AppState.sync._versions[name]; saveOverviewSyncVersions();
            // 清空该作品的关联文件缓存
            if (AppState.chapter.book === name) {
                window.syncBookScopedReferenceState?.('', name);
                AppState.gen.linkedFiles = [];
                AppState.chapter = { book: null, vi: 0, ci: 0 };
            }
            refreshOverview();
            if (remoteAlreadyAbsent) {
                Toast.success('云端已无此作品，本机残留作品卡已清理。');
            }
            } catch(error) {
                if (!isOverviewAccountContextError(error)) throw error;
            } finally {
                endOverviewWriteOperation(writeOperation);
                actionTask.release?.();
            }
        }

        document.getElementById('coverFilePicker')?.addEventListener('change',function(e){
            const file=e.target.files[0];
            const bookName=AppState.ui.bookForCover;
            AppState.ui.bookForCover='';
            if(!file||!bookName)return;
            const reader=new FileReader();
            reader.onload=async function(ev){
                const books=gB();
                if(books[bookName]){ books[bookName].cover=ev.target.result; sB(books); refreshOverview(); }
            };
            reader.readAsDataURL(file);
        });

        document.getElementById('batchManageBtn')?.addEventListener('click',async function(){
            AppState.ui.batchMode=!AppState.ui.batchMode;
            document.getElementById('mainContent').classList.toggle('batch-mode',AppState.ui.batchMode);
            this.textContent=AppState.ui.batchMode?'取消管理':'批量管理';
            document.getElementById('batchArchiveBtn').style.display=AppState.ui.batchMode?'inline-flex':'none';
            document.getElementById('batchDeleteBtn').style.display=AppState.ui.batchMode?'inline-flex':'none';
            if(!AppState.ui.batchMode) document.querySelectorAll('.batch-check').forEach(c=>c.checked=false);
            updateBatchActions();
        });

        function updateBatchActions(){
            const checked=document.querySelectorAll('.batch-check:checked');
            document.getElementById('batchArchiveBtn').disabled=checked.length===0;
            document.getElementById('batchDeleteBtn').disabled=checked.length===0;
        }

        document.getElementById('batchArchiveBtn')?.addEventListener('click',async function(){
            if(this.disabled)return;
            const names = Array.from(document.querySelectorAll('.batch-check:checked'))
                .map(function(c) { return c.dataset.book; })
                .filter(Boolean);
            for (const name of names) {
                const saved = await archiveBook(name);
                if (!saved) return;
            }
            AppState.ui.batchMode=false;
            document.getElementById('batchManageBtn').click();
        });

        document.getElementById('batchDeleteBtn')?.addEventListener('click',async function(){
            if(this.disabled)return;
            const actionTask = beginOverviewAccountTask();
            try {
            const _cf = await Confirm.show('确定删除选中的作品？'); if(!_cf)return;
            assertOverviewAccountTask(actionTask);
            const names = Array.from(document.querySelectorAll('.batch-check:checked'))
                .map(function(c) { return c.dataset.book; })
                .filter(Boolean);
            for (const name of names) {
                assertOverviewAccountTask(actionTask);
                await trashBook(name, actionTask);
            }
            assertOverviewAccountTask(actionTask);
            AppState.ui.batchMode=false;
            document.getElementById('batchManageBtn').click();
            } catch(error) {
                if (!isOverviewAccountContextError(error)) throw error;
            } finally {
                actionTask.release?.();
            }
        });

        async function renameBook(oldName) {
            const actionTask = beginOverviewAccountTask();
            let writeOperation = null;
            try {
            const newName = await Prompt.show('请输入新书名：', oldName);
            assertOverviewAccountTask(actionTask);
            if (!newName || !newName.trim() || newName.trim() === oldName) return;
            const trimmedNew = newName.trim();
            const books = gB();
            if (books[trimmedNew]) { Toast.warn('已存在同名作品'); return; }
            const originalBook = books[oldName];
            if (!originalBook) return;
            writeOperation = beginOverviewWriteOperation(actionTask, '重命名作品');
            const bookId = getOverviewBookId(originalBook, oldName);
            let nextBooks = cloneOverviewValue(books);
            let nextMemBooks = cloneOverviewValue(getMemBooks() || {});
            const hadMemoryBook = Object.prototype.hasOwnProperty.call(nextMemBooks, oldName);
            nextBooks[trimmedNew] = nextBooks[oldName];
            delete nextBooks[oldName];
            if (hadMemoryBook) {
                nextMemBooks[trimmedNew] = nextMemBooks[oldName];
                delete nextMemBooks[oldName];
            }
            renameOverviewMemoryFiles(nextMemBooks[trimmedNew], oldName, trimmedNew);
            const renamedActiveBook = AppState.chapter.book === oldName;
            let appliedNewName = trimmedNew;
            if (AppState.auth.isLoggedIn) {
                try {
                    const renamePayload = {
                        oldBookName: oldName,
                        newBookName: trimmedNew,
                        bookId,
                        bookData: nextBooks[trimmedNew]
                    };
                    if (hadMemoryBook) renamePayload.memoryData = nextMemBooks[trimmedNew] || {};
                    const result = await postOverviewLifecycle(
                        'rename',
                        renamePayload,
                        '云端重命名失败',
                        actionTask,
                        writeOperation
                    );
                    const effectivePayload = result?._requestPayload || renamePayload;
                    const effectiveName = String(effectivePayload.newBookName || '').trim();
                    if (effectiveName) appliedNewName = effectiveName;
                } catch(error) {
                    if (isOverviewAccountContextError(error)) return;
                    AppState.sync.status = 'error';
                    updateOverviewSyncUI();
                    Toast.error(error.message || '重命名失败，请重试');
                    return;
                }
            }
            assertOverviewWriteOperation(actionTask, writeOperation);
            await waitForOverviewBookWrites(actionTask, writeOperation);
            const latestBooks = gB();
            const latestOriginalBook = latestBooks[oldName];
            if (!latestOriginalBook || getOverviewBookId(latestOriginalBook, oldName) !== bookId) {
                Toast.warn('作品在重命名期间已变化，本机新内容已保留；请重新登录核对云端状态');
                return;
            }
            if (latestBooks[appliedNewName] && appliedNewName !== oldName) {
                Toast.error('云端已完成重命名，但本机已有同名作品；本机内容已保留，请重新登录核对');
                return;
            }
            nextBooks = cloneOverviewValue(latestBooks);
            nextMemBooks = cloneOverviewValue(getMemBooks() || {});
            nextBooks[appliedNewName] = nextBooks[oldName];
            delete nextBooks[oldName];
            if (Object.prototype.hasOwnProperty.call(nextMemBooks, oldName)) {
                nextMemBooks[appliedNewName] = nextMemBooks[oldName];
                delete nextMemBooks[oldName];
                renameOverviewMemoryFiles(nextMemBooks[appliedNewName], oldName, appliedNewName);
            }
            const locallyRenamed = await commitOverviewBooksAndMemory(
                nextBooks,
                nextMemBooks,
                actionTask,
                writeOperation,
                { type: 'rename', bookId, oldName, newName: appliedNewName }
            );
            assertOverviewWriteOperation(actionTask, writeOperation);
            if (!locallyRenamed) {
                Toast.error(AppState.auth.isLoggedIn
                    ? '云端已重命名，但本机保存失败；重新登录后会自动对齐'
                    : '本机重命名保存失败，请重试');
                return;
            }
            if (renamedActiveBook) AppState.chapter.book = appliedNewName;
            touchBook(appliedNewName); touchBook(oldName);
            window.discardOGLinkedMemoryBook?.(oldName);
            window.discardOGLinkedMemoryBook?.(appliedNewName);
            window.discardOGOutlineSelectionBook?.(oldName);
            window.discardOGOutlineSelectionBook?.(appliedNewName);
            if (renamedActiveBook) {
                window.syncBookScopedReferenceState?.(appliedNewName, oldName)
                    ?? window.ensureGenerationLinkedFilesBook?.(appliedNewName);
            }
            window.updateLinkedMemoryCount?.();
            Toast.success((appliedNewName === trimmedNew ? '已重命名为：' : '已恢复上次重命名结果：') + appliedNewName);
            refreshOverview();
            } catch(error) {
                if (!isOverviewAccountContextError(error)) throw error;
            } finally {
                endOverviewWriteOperation(writeOperation);
                actionTask.release?.();
            }
        }

        async function archiveBook(name){
            const actionTask = beginOverviewAccountTask();
            let writeOperation = null;
            try {
            const books=cloneOverviewValue(gB());
            if (!books[name]) return false;
            writeOperation = beginOverviewWriteOperation(actionTask, '归档作品');
            books[name].status=STATUS.ARCHIVED;
            const saved = await sB(books, {
                source: 'book-lifecycle',
                lifecycleMutation: {
                    type: 'status',
                    bookId: getOverviewBookId(books[name], name),
                    bookName: name,
                    status: STATUS.ARCHIVED
                },
                writeToken: writeOperation.token
            });
            assertOverviewWriteOperation(actionTask, writeOperation);
            if (!saved) {
                Toast.error('作品归档未能安全保存，请重试');
                return false;
            }
            if (AppState.chapter.book === name) {
                window.syncBookScopedReferenceState?.('', name);
                AppState.gen.linkedFiles = [];
                AppState.chapter = { book: null, vi: 0, ci: 0 };
            }
            refreshOverview();
            return true;
            } catch(error) {
                if (!isOverviewAccountContextError(error)) throw error;
                return false;
            } finally {
                endOverviewWriteOperation(writeOperation);
                actionTask.release?.();
            }
        }

        async function trashBook(name, suppliedTask){
            const actionTask = suppliedTask || beginOverviewAccountTask();
            const ownsTask = !suppliedTask;
            let writeOperation = null;
            try {
            assertOverviewAccountTask(actionTask);
            const books=gB();
            const book = books[name];
            if (!book) return;
            const originalBookId = getOverviewBookId(book, name);
            writeOperation = beginOverviewWriteOperation(actionTask, '移入回收站');
            let remoteAlreadyAbsent = false;
            if (AppState.auth.isLoggedIn) {
                try {
                    await postOverviewLifecycle('trash', {
                        bookName: name,
                        bookId: getOverviewBookId(book, name)
                    }, '云端移入回收站失败', actionTask, writeOperation);
                } catch(error) {
                    if (isOverviewAccountContextError(error)) return;
                    if (isRemoteBookAlreadyAbsent(error)) {
                        remoteAlreadyAbsent = true;
                    } else {
                        AppState.sync.status = 'error';
                        updateOverviewSyncUI();
                        Toast.error(error.message || '移入回收站失败，请重试');
                        return;
                    }
                }
            }
            assertOverviewWriteOperation(actionTask, writeOperation);
            await waitForOverviewBookWrites(actionTask, writeOperation);
            const latestBooks = gB();
            const latestBook = latestBooks[name];
            if (!latestBook || getOverviewBookId(latestBook, name) !== originalBookId) {
                Toast.warn('作品在回收站操作期间已变化，本机新内容已保留；请重新登录核对云端状态');
                return;
            }
            const nextBooks = cloneOverviewValue(latestBooks);
            nextBooks[name].status=STATUS.TRASH;
            const saved = await sB(nextBooks, {
                cloudWrite: 'suppress',
                source: 'book-lifecycle',
                lifecycleMutation: {
                    type: 'status',
                    bookId: originalBookId,
                    bookName: name,
                    status: STATUS.TRASH
                },
                writeToken: writeOperation.token
            });
            assertOverviewWriteOperation(actionTask, writeOperation);
            if (!saved) {
                Toast.error('云端已移入回收站，但本机保存失败；重新登录后会自动对齐');
                return;
            }
            if (AppState.chapter.book === name) {
                window.syncBookScopedReferenceState?.('', name);
                AppState.gen.linkedFiles = [];
                AppState.chapter = { book: null, vi: 0, ci: 0 };
            }
            refreshOverview();
            if (remoteAlreadyAbsent) {
                Toast.warn('云端已无此作品，已将本机副本移入回收站。');
            }
            } catch(error) {
                if (!isOverviewAccountContextError(error)) throw error;
            } finally {
                endOverviewWriteOperation(writeOperation);
                if (ownsTask) actionTask.release?.();
            }
        }

    window.restoreBook = restoreBook;
    window.permanentlyDeleteBook = permanentlyDeleteBook;
    window.updateBatchActions = updateBatchActions;
    window.renameBook = renameBook;
    window.archiveBook = archiveBook;
    window.trashBook = trashBook;
})(window, document);
