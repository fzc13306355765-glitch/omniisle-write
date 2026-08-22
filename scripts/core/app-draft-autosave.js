// Draft autosave module.
// Keeps the original global function names while isolating drafts by account.
(function(window, document) {
    'use strict';

    const DRAFT_PREFIX = 'zhiyu_draft_';
    const DRAFT_META_SUFFIX = '_meta';
    const DRAFT_RECORD_VERSION = 3;
    const EMERGENCY_DRAFT_PREFIX = 'zhiyu_emergency_draft_v1_id_';
    const EMERGENCY_DRAFT_VERSION = 1;
    const EMERGENCY_DRAFT_MAX_BYTES = 32 * 1024;
    const pendingDraftWrites = new Map();
    let lastDraftFailureNoticeAt = 0;

    function getChapterDraftContext(book, vi, ci) {
        const books = typeof window.gB === 'function' ? window.gB() : {};
        const bookData = books?.[book];
        const chapter = bookData?.volumes?.[vi]?.chapters?.[ci];
        return { books, bookData, chapter };
    }

    function getChapterDraftStorageKey(book, vi, ci, createIfMissing) {
        const context = getChapterDraftContext(book, vi, ci);
        const localId = context.chapter?._localId
            || (createIfMissing ? window.ensureChapterLocalId?.(context.chapter) : '');
        return localId ? window.AccountDataScope.key(DRAFT_PREFIX + 'id_' + localId) : '';
    }

    function legacyDraftKey(book, vi, ci) {
        return window.AccountDataScope.key(DRAFT_PREFIX + book + '_' + vi + '_' + ci);
    }

    function draftMetaKey(storageKey) {
        return storageKey ? storageKey + DRAFT_META_SUFFIX : '';
    }

    function draftChecksum(content) {
        const text = String(content ?? '');
        let hash = 2166136261;
        for (let index = 0; index < text.length; index += 1) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(16).padStart(8, '0') + ':' + text.length;
    }

    function setDraftPersistenceStatus(kind, message) {
        const saveButton = document.getElementById('btnSaveNewChapter');
        if (!saveButton?.parentNode) return;
        let status = document.getElementById('chapterPersistenceStatus');
        if (!status) {
            status = document.createElement('span');
            status.id = 'chapterPersistenceStatus';
            status.setAttribute('role', 'status');
            status.setAttribute('aria-live', 'polite');
            saveButton.parentNode.insertBefore(status, saveButton.nextSibling);
        }
        status.dataset.state = kind || '';
        status.textContent = String(message || '');
        status.style.display = message ? 'inline-flex' : 'none';
    }

    function notifyDraftSaveFailure(error) {
        const message = '草稿保存失败，请勿关闭页面；请检查浏览器存储空间后重试。';
        setDraftPersistenceStatus('error', message);
        const now = Date.now();
        if (now - lastDraftFailureNoticeAt > 10000) {
            lastDraftFailureNoticeAt = now;
            window.ZHIYU_TOAST?.warn?.(message);
        }
        const resultBox = document.getElementById('resultBox');
        if (resultBox) {
            resultBox.dataset.draftSaveError = '1';
            resultBox.title = message;
        }
        return error;
    }

    function clearDraftPersistenceFailure() {
        const resultBox = document.getElementById('resultBox');
        if (resultBox?.dataset.draftSaveError === '1') {
            delete resultBox.dataset.draftSaveError;
            resultBox.removeAttribute('title');
        }
        const status = document.getElementById('chapterPersistenceStatus');
        if (status?.dataset.state === 'error') setDraftPersistenceStatus('', '');
    }

    function readDraftRecord(storageKey, options) {
        if (!storageKey) return null;
        const largeStore = window.ZHIYU_LARGE_LOCAL_STORE;
        const persistedOnly = options?.persistedOnly === true;
        const raw = persistedOnly && typeof largeStore?.getPersisted === 'function'
            ? largeStore.getPersisted(storageKey)
            : (largeStore?.get?.(storageKey) ?? localStorage.getItem(storageKey));
        if (raw === null) return null;
        try {
            const record = JSON.parse(raw);
            if ([2, DRAFT_RECORD_VERSION].includes(Number(record?.version)) && typeof record.content === 'string') {
                const activeUid = String(window.AccountDataScope?.getActiveUid?.() || 'guest');
                if (String(record.accountUid || 'guest') !== activeUid) return null;
                if (record.checksum !== draftChecksum(record.content)) return null;
                return {
                    content: record.content,
                    updatedAt: Number(record.updatedAt || 0),
                    baseRevision: Number(record.baseRevision ?? record.revision ?? 0),
                    targetRevision: Number(record.targetRevision || 0),
                    revision: Number(record.baseRevision ?? record.revision ?? 0),
                    accountUid: activeUid,
                    bookName: String(record.bookName || ''),
                    volumeIndex: Number(record.volumeIndex ?? -1),
                    chapterIndex: Number(record.chapterIndex ?? -1),
                    chapterLocalId: String(record.chapterLocalId || ''),
                    cleared: record.cleared === true,
                    pendingSync: record.pendingSync === true,
                    contentClearedAt: Number(record.contentClearedAt || 0),
                    checksum: record.checksum
                };
            }
        } catch (e) {}
        try {
            const meta = JSON.parse(localStorage.getItem(draftMetaKey(storageKey)) || '{}');
            return {
                content: raw,
                updatedAt: Number(meta.updatedAt || 0),
                revision: Number(meta.revision || 0),
                baseRevision: Number(meta.baseRevision ?? meta.revision ?? 0),
                targetRevision: Number(meta.targetRevision || 0),
                accountUid: String(window.AccountDataScope?.getActiveUid?.() || 'guest'),
                bookName: String(meta.bookName || ''),
                volumeIndex: Number(meta.volumeIndex ?? -1),
                chapterIndex: Number(meta.chapterIndex ?? -1),
                chapterLocalId: String(meta.chapterLocalId || ''),
                cleared: meta.cleared === true,
                pendingSync: meta.pendingSync === true,
                contentClearedAt: Number(meta.contentClearedAt || 0),
                checksum: draftChecksum(raw)
            };
        } catch (e) {}
        return {
            content: raw,
            updatedAt: 0,
            revision: 0,
            baseRevision: 0,
            targetRevision: 0,
            accountUid: String(window.AccountDataScope?.getActiveUid?.() || 'guest'),
            bookName: '',
            volumeIndex: -1,
            chapterIndex: -1,
            chapterLocalId: '',
            cleared: false,
            pendingSync: false,
            contentClearedAt: 0,
            checksum: draftChecksum(raw)
        };
    }

    function writeDraftRecord(storageKey, content, updatedAt, chapterLocalId, options) {
        if (!storageKey) return null;
        const meta = options || {};
        const revision = Number(updatedAt);
        const record = {
            version: DRAFT_RECORD_VERSION,
            content: String(content ?? ''),
            updatedAt: Number.isFinite(revision) ? revision : Date.now(),
            baseRevision: Math.max(0, Number(meta.baseRevision ?? meta.revision ?? 0)),
            targetRevision: Math.max(0, Number(meta.targetRevision || 0)),
            accountUid: String(window.AccountDataScope?.getActiveUid?.() || 'guest'),
            bookName: String(meta.bookName || ''),
            volumeIndex: Number(meta.volumeIndex ?? -1),
            chapterIndex: Number(meta.chapterIndex ?? -1),
            chapterLocalId: String(chapterLocalId || ''),
            cleared: meta.cleared === true,
            pendingSync: meta.pendingSync === true,
            contentClearedAt: Number(meta.contentClearedAt || 0),
            checksum: draftChecksum(content)
        };
        const serialized = JSON.stringify(record);
        const largeStore = window.ZHIYU_LARGE_LOCAL_STORE;
        let persistence = Promise.resolve(true);
        if (largeStore?.set) {
            persistence = Promise.resolve(largeStore.set(storageKey, serialized, 'chapter_draft', {
                writeToken: meta.writeToken
            }))
                .then(function(saved) { return saved !== false; })
                .catch(function(error) {
                    notifyDraftSaveFailure(error);
                    return false;
                });
        } else {
            localStorage.setItem(storageKey, serialized);
        }
        try {
            Object.defineProperty(record, 'persistence', {
                value: persistence,
                configurable: false,
                enumerable: false,
                writable: false
            });
        } catch(error) {}
        try { localStorage.removeItem(draftMetaKey(storageKey)); } catch (e) {}
        clearDraftPersistenceFailure();
        return record;
    }

    function removeDraftRecord(storageKey) {
        if (!storageKey) return Promise.resolve(true);
        try {
            if (window.ZHIYU_LARGE_LOCAL_STORE?.remove) {
                return Promise.resolve(window.ZHIYU_LARGE_LOCAL_STORE.remove(storageKey)).then(function(removed) {
                    if (removed === false) return false;
                    localStorage.removeItem(draftMetaKey(storageKey));
                    return window.ZHIYU_LARGE_LOCAL_STORE.get?.(storageKey) == null;
                }).catch(function(error) {
                    console.error('草稿删除失败：', error);
                    return false;
                });
            } else {
                localStorage.removeItem(storageKey);
            }
            localStorage.removeItem(draftMetaKey(storageKey));
            return Promise.resolve(localStorage.getItem(storageKey) === null);
        } catch (error) {
            return Promise.resolve(false);
        }
    }

    async function removeDraftRecordIfUnchanged(storageKey, expectedUpdatedAt, writeToken) {
        if (!storageKey) return true;
        const current = readDraftRecord(storageKey);
        if (!current) return true;
        if (Number.isFinite(Number(expectedUpdatedAt))
            && Number(current.updatedAt || 0) !== Number(expectedUpdatedAt)) return false;
        const largeStore = window.ZHIYU_LARGE_LOCAL_STORE;
        const raw = largeStore?.get?.(storageKey) ?? localStorage.getItem(storageKey);
        if (raw === null) return true;
        if (typeof largeStore?.removeIfValue === 'function') {
            return (await largeStore.removeIfValue(storageKey, raw, { writeToken })) === true;
        }
        const latest = largeStore?.get?.(storageKey) ?? localStorage.getItem(storageKey);
        if (latest !== raw) return false;
        return removeDraftRecord(storageKey);
    }

    function utf8ByteLength(value) {
        const text = String(value ?? '');
        if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).length;
        let bytes = 0;
        for (let index = 0; index < text.length; index += 1) {
            const code = text.charCodeAt(index);
            if (code < 0x80) bytes += 1;
            else if (code < 0x800) bytes += 2;
            else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
                bytes += 4;
                index += 1;
            } else bytes += 3;
        }
        return bytes;
    }

    function emergencyDraftStorageKey(chapterLocalId, uid) {
        if (!chapterLocalId) return '';
        return window.AccountDataScope.key(
            EMERGENCY_DRAFT_PREFIX + String(chapterLocalId),
            uid === undefined ? window.AccountDataScope.getActiveUid() : uid
        );
    }

    function makeEmergencyPatch(baseContent, currentContent) {
        const base = String(baseContent ?? '');
        const current = String(currentContent ?? '');
        let prefixLength = 0;
        const sharedLength = Math.min(base.length, current.length);
        while (prefixLength < sharedLength && base.charCodeAt(prefixLength) === current.charCodeAt(prefixLength)) {
            prefixLength += 1;
        }
        let suffixLength = 0;
        while (
            suffixLength < base.length - prefixLength
            && suffixLength < current.length - prefixLength
            && base.charCodeAt(base.length - 1 - suffixLength) === current.charCodeAt(current.length - 1 - suffixLength)
        ) suffixLength += 1;
        return {
            prefixLength,
            suffixLength,
            deleteCount: base.length - prefixLength - suffixLength,
            insertText: current.slice(prefixLength, current.length - suffixLength)
        };
    }

    function applyEmergencyPatch(baseContent, record) {
        const base = String(baseContent ?? '');
        const prefixLength = Number(record?.prefixLength);
        const suffixLength = Number(record?.suffixLength);
        const deleteCount = Number(record?.deleteCount);
        if (![prefixLength, suffixLength, deleteCount].every(Number.isSafeInteger)
            || prefixLength < 0 || suffixLength < 0 || deleteCount < 0
            || prefixLength + suffixLength + deleteCount !== base.length
            || typeof record?.insertText !== 'string') return null;
        const restored = base.slice(0, prefixLength) + record.insertText + base.slice(base.length - suffixLength);
        return draftChecksum(restored) === record.currentChecksum ? restored : null;
    }

    function captureChapterEmergencyDraft(book, vi, ci, content, options) {
        try {
            const meta = options && typeof options === 'object' ? options : {};
            const context = getChapterDraftContext(book, vi, ci);
            const chapter = context.chapter;
            const localId = String(chapter?._localId || '');
            const uid = String(window.AccountDataScope?.getActiveUid?.() || 'guest');
            if (window.ZHIYU_ACCOUNT_WRITE_LEASE
                && !window.ZHIYU_ACCOUNT_WRITE_LEASE.assertCanWrite(uid, { silent: true })) return false;
            const currentContent = String(content ?? '');
            if (!book || vi < 0 || ci < 0 || !localId
                || currentContent === '[正在生成中，请稍候...]'
                || currentContent === '点击左侧章节查看内容，或生成新章节...') return false;
            const explicitClear = meta.cleared === true
                && currentContent === ''
                && Number(meta.contentClearedAt || 0) > 0;
            if (!explicitClear && window.wouldBlankOverwriteExisting?.(currentContent, chapter?.content)) return false;
            const stableKey = getChapterDraftStorageKey(book, vi, ci, false);
            // beforeunload 必须以真正写入 IndexedDB 的内容为基线。
            // LargeLocalStore.get() 会同步返回尚未落盘的内存缓存，不能据此跳过紧急记录。
            const durableDraft = readDraftRecord(stableKey, { persistedOnly: true });
            const baseContent = durableDraft ? durableDraft.content : String(chapter?.content ?? '');
            if (baseContent === currentContent) return true;
            const patch = makeEmergencyPatch(baseContent, currentContent);
            const record = {
                version: EMERGENCY_DRAFT_VERSION,
                recordId: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                    ? crypto.randomUUID()
                    : Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10),
                accountUid: uid,
                chapterLocalId: localId,
                bookName: String(book),
                volumeIndex: Number(vi),
                chapterIndex: Number(ci),
                createdAt: Date.now(),
                baseChecksum: draftChecksum(baseContent),
                currentChecksum: draftChecksum(currentContent),
                baseRevision: Math.max(0, Number(meta.baseRevision ?? chapter?._version ?? 0)),
                targetRevision: Math.max(0, Number(meta.targetRevision || (Number(meta.baseRevision ?? chapter?._version ?? 0) + 1))),
                cleared: explicitClear,
                pendingSync: true,
                contentClearedAt: explicitClear ? Number(meta.contentClearedAt) : 0,
                ...patch
            };
            const serialized = JSON.stringify(record);
            if (utf8ByteLength(serialized) > EMERGENCY_DRAFT_MAX_BYTES) return false;
            const storageKey = emergencyDraftStorageKey(localId, uid);
            localStorage.setItem(storageKey, serialized);
            return localStorage.getItem(storageKey) === serialized;
        } catch (error) {
            return false;
        }
    }

    function listEmergencyDraftKeys(uid) {
        const suffix = '__uid_' + window.AccountDataScope.normalizeUid(uid);
        const keys = [];
        try {
            for (let index = 0; index < localStorage.length; index += 1) {
                const key = localStorage.key(index);
                if (key?.includes(EMERGENCY_DRAFT_PREFIX) && key.endsWith(suffix)) keys.push(key);
            }
        } catch (error) {}
        return keys;
    }

    async function recoverEmergencyDrafts(options) {
        const settings = options && typeof options === 'object' ? options : {};
        const expectedUid = String(settings.expectedUid || window.AccountDataScope?.getActiveUid?.() || 'guest');
        const books = settings.books || (typeof window.gB === 'function' ? window.gB() : {});
        const result = { recovered: 0, retained: 0, invalid: 0 };
        for (const storageKey of listEmergencyDraftKeys(expectedUid)) {
            if (String(window.AccountDataScope?.getActiveUid?.() || '') !== expectedUid) break;
            let raw = '';
            let record = null;
            try {
                raw = localStorage.getItem(storageKey) || '';
                if (!raw || utf8ByteLength(raw) > EMERGENCY_DRAFT_MAX_BYTES) throw new Error('紧急草稿超过大小上限');
                record = JSON.parse(raw);
            } catch (error) {
                result.invalid += 1;
                continue;
            }
            if (Number(record?.version) !== EMERGENCY_DRAFT_VERSION
                || String(record.accountUid || '') !== expectedUid
                || !record.recordId || !record.chapterLocalId
                || typeof record.baseChecksum !== 'string'
                || typeof record.currentChecksum !== 'string') {
                result.invalid += 1;
                continue;
            }
            const location = window.findChapterLocationByLocalId?.(books, record.chapterLocalId, record.bookName);
            if (!location) {
                result.retained += 1;
                continue;
            }
            const stableKey = getChapterDraftStorageKey(location.book, location.vi, location.ci, false);
            const existingDraft = readDraftRecord(stableKey);
            let restoredContent = null;
            if (existingDraft && draftChecksum(existingDraft.content) === record.currentChecksum) {
                restoredContent = existingDraft.content;
            } else {
                const candidates = [];
                if (existingDraft) candidates.push(existingDraft.content);
                candidates.push(String(location.chapter?.content ?? ''));
                const base = candidates.find(function(value) {
                    return draftChecksum(value) === record.baseChecksum;
                });
                if (base !== undefined) restoredContent = applyEmergencyPatch(base, record);
            }
            if (restoredContent === null
                || (record.cleared === true && (restoredContent !== '' || Number(record.contentClearedAt || 0) <= 0))) {
                result.retained += 1;
                continue;
            }
            const restored = saveDraft(location.book, location.vi, location.ci, restoredContent, {
                updatedAt: Math.max(Number(record.createdAt || 0), Number(existingDraft?.updatedAt || 0) + 1),
                baseRevision: Number(record.baseRevision || 0),
                targetRevision: Number(record.targetRevision || 0),
                cleared: record.cleared === true,
                pendingSync: true,
                contentClearedAt: Number(record.contentClearedAt || 0),
                writeToken: settings.writeToken
            });
            const persisted = restored && await Promise.resolve(restored.persistence);
            await window.ZHIYU_LARGE_LOCAL_STORE?.flush?.();
            const verified = loadDraftRecord(location.book, location.vi, location.ci);
            if (!persisted || !verified || draftChecksum(verified.content) !== record.currentChecksum) {
                result.retained += 1;
                continue;
            }
            try {
                const latest = JSON.parse(localStorage.getItem(storageKey) || '{}');
                if (latest.recordId !== record.recordId) {
                    result.retained += 1;
                    continue;
                }
                localStorage.removeItem(storageKey);
                if (localStorage.getItem(storageKey) !== null) throw new Error('紧急草稿删除回读失败');
                result.recovered += 1;
            } catch (error) {
                result.retained += 1;
            }
        }
        if (result.recovered > 0) window.ZHIYU_EMERGENCY_DRAFT_RECOVERED = result.recovered;
        return result;
    }

    function migrateLegacyChapterDraft(book, vi, ci, stableKey) {
        const oldKey = legacyDraftKey(book, vi, ci);
        const oldRecord = readDraftRecord(oldKey);
        if (!oldRecord) return null;
        const context = getChapterDraftContext(book, vi, ci);
        const localId = context.chapter?._localId || '';
        if (!localId || oldRecord.chapterLocalId !== localId) return null;
        const migrated = writeDraftRecord(stableKey, oldRecord.content, oldRecord.updatedAt, localId, {
            ...oldRecord,
            bookName: book,
            volumeIndex: vi,
            chapterIndex: ci,
            revision: Number(context.chapter?._version || oldRecord.revision || 0)
        });
        if (migrated) {
            Promise.resolve(migrated.persistence).then(function(saved) {
                if (saved) return removeDraftRecord(oldKey);
                return false;
            });
        }
        return migrated;
    }

    function saveDraft(book, vi, ci, content, options) {
        if (!book || vi < 0 || ci < 0) return;
        const meta = options && typeof options === 'object' ? options : {};
        const uid = String(window.AccountDataScope?.getActiveUid?.() || 'guest');
        const leaseApi = window.ZHIYU_ACCOUNT_WRITE_LEASE;
        const suppliedWriteToken = meta.writeToken;
        const reusingWriteToken = !!suppliedWriteToken
            && leaseApi?.isWriteTokenCurrent?.(suppliedWriteToken) === true;
        const writeToken = reusingWriteToken
            ? suppliedWriteToken
            : (leaseApi?.beginWrite?.(uid, {
                message: '此账号已在另一个标签页编辑，本页草稿未保存。'
            }) || (!leaseApi ? { legacy: true } : null));
        if (!writeToken) return null;
        const finishDraftWrite = function(record) {
            if (reusingWriteToken) return record;
            if (record) {
                Promise.resolve(record.persistence).finally(function() {
                    leaseApi?.endWrite?.(writeToken);
                });
            } else {
                leaseApi?.endWrite?.(writeToken);
            }
            return record;
        };
        try {
            const context = getChapterDraftContext(book, vi, ci);
            const localId = window.ensureChapterLocalId?.(context.chapter) || '';
            const stableKey = getChapterDraftStorageKey(book, vi, ci, true);
            if (!localId || !stableKey) return finishDraftWrite(null);
            const storedRevision = Number(readDraftRecord(stableKey)?.updatedAt || 0);
            const pendingRevision = Number(pendingDraftWrites.get(localId)?.updatedAt || 0);
            const hasExplicitRevision = Object.prototype.hasOwnProperty.call(meta, 'updatedAt')
                && Number.isFinite(Number(meta.updatedAt));
            const updatedAt = hasExplicitRevision
                ? Number(meta.updatedAt)
                : Math.max(Date.now(), storedRevision + 1, pendingRevision + 1);
            const record = {
                stableKey,
                content: String(content ?? ''),
                localId,
                updatedAt,
                baseRevision: Number(meta.baseRevision ?? context.chapter?._version ?? 0),
                targetRevision: Number(meta.targetRevision || (Number(meta.baseRevision ?? context.chapter?._version ?? 0) + 1)),
                bookName: book,
                volumeIndex: vi,
                chapterIndex: ci,
                cleared: meta.cleared === true,
                pendingSync: meta.pendingSync === true,
                contentClearedAt: Number(meta.contentClearedAt || 0)
            };
            if (window.isChapterLocalIdPersisted?.(localId)) {
                pendingDraftWrites.delete(localId);
                return finishDraftWrite(writeDraftRecord(stableKey, record.content, record.updatedAt, localId, {
                    ...record,
                    writeToken
                }));
            }
            const pending = record;
            pendingDraftWrites.set(localId, pending);
            const written = writeDraftRecord(stableKey, record.content, record.updatedAt, localId, {
                ...record,
                writeToken
            });
            if (!written) {
                pendingDraftWrites.delete(localId);
                return finishDraftWrite(null);
            }
            const storage = window.ZHIYU_STORAGE_SERVICE;
            if (!storage || typeof storage.saveBooks !== 'function') {
                return finishDraftWrite(written);
            }
            Promise.resolve(storage.saveBooks(context.books, { writeToken })).then(function(ok) {
                if (pendingDraftWrites.get(localId) !== pending) return;
                pendingDraftWrites.delete(localId);
                if (ok === false) notifyDraftSaveFailure(new Error('章节身份保存失败'));
            }).catch(function() {
                if (pendingDraftWrites.get(localId) === pending) {
                    pendingDraftWrites.delete(localId);
                    notifyDraftSaveFailure(new Error('章节身份保存失败'));
                }
            });
            return finishDraftWrite(written);
        } catch (e) {
            notifyDraftSaveFailure(e);
            return finishDraftWrite(null);
        }
    }

    function loadDraft(book, vi, ci) {
        const record = loadDraftRecord(book, vi, ci);
        return record ? record.content : null;
    }

    function loadDraftRecord(book, vi, ci) {
        if (!book || vi < 0 || ci < 0) return null;
        try {
            const stableKey = getChapterDraftStorageKey(book, vi, ci, true);
            const record = readDraftRecord(stableKey) || migrateLegacyChapterDraft(book, vi, ci, stableKey);
            if (!record) return null;
            const chapter = getChapterDraftContext(book, vi, ci).chapter;
            const localId = String(chapter?._localId || '');
            if (record.chapterLocalId && localId && record.chapterLocalId !== localId) return null;
            if (!record.chapterLocalId || !localId) {
                if (record.bookName && record.bookName !== String(book)) return null;
                if (record.volumeIndex >= 0 && record.volumeIndex !== Number(vi)) return null;
                if (record.chapterIndex >= 0 && record.chapterIndex !== Number(ci)) return null;
            }
            return record;
        } catch (e) {
            return null;
        }
    }

    async function clearDraftDurably(book, vi, ci, options) {
        if (!book) return false;
        const settings = options && typeof options === 'object' ? options : {};
        const uid = String(window.AccountDataScope?.getActiveUid?.() || 'guest');
        const leaseApi = window.ZHIYU_ACCOUNT_WRITE_LEASE;
        const suppliedWriteToken = settings.writeToken;
        const reuseWriteToken = !!suppliedWriteToken
            && leaseApi?.isWriteTokenCurrent?.(suppliedWriteToken) === true;
        const writeToken = reuseWriteToken
            ? suppliedWriteToken
            : (leaseApi?.beginWrite?.(uid, {
                message: '此账号已在另一个标签页编辑，本页不能清理草稿。'
            }) || (!leaseApi ? { legacy: true } : null));
        if (!writeToken) return false;
        try {
            const context = getChapterDraftContext(book, vi, ci);
            const localId = context.chapter?._localId || '';
            const expectedUpdatedAt = Object.prototype.hasOwnProperty.call(settings, 'expectedUpdatedAt')
                ? Number(settings.expectedUpdatedAt)
                : undefined;
            const pending = localId ? pendingDraftWrites.get(localId) : null;
            if (pending && Number.isFinite(expectedUpdatedAt)
                && Number(pending.updatedAt || 0) !== expectedUpdatedAt) return false;
            let cleared = await removeDraftRecordIfUnchanged(
                getChapterDraftStorageKey(book, vi, ci, false),
                expectedUpdatedAt,
                writeToken
            );
            if (!cleared) return false;
            const oldKey = legacyDraftKey(book, vi, ci);
            const oldRecord = readDraftRecord(oldKey);
            if (localId && oldRecord?.chapterLocalId === localId) {
                cleared = await removeDraftRecordIfUnchanged(oldKey, undefined, writeToken);
            }
            if (cleared && localId && (!pending || !Number.isFinite(expectedUpdatedAt)
                || Number(pending.updatedAt || 0) === expectedUpdatedAt)) pendingDraftWrites.delete(localId);
            return cleared;
        } catch (e) {
            return false;
        } finally {
            if (!reuseWriteToken) leaseApi?.endWrite?.(writeToken);
        }
    }

    function clearDraft(book, vi, ci) {
        return clearDraftDurably(book, vi, ci);
    }

    function chapterPlainTextForComparison(content, record) {
        const source = String(content ?? '');
        try {
            if (typeof window.ZhiyuEditorAdapter?.plainTextForCloud === 'function') {
                return String(window.ZhiyuEditorAdapter.plainTextForCloud(source, record) ?? '');
            }
        } catch (error) {}
        const fallback = source
            .replace(/<br\s*\/?\s*>/gi, '\n')
            .replace(/<\/(?:p|div|li|h[1-6])\s*>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;|&#160;/gi, ' ')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"')
            .replace(/&#39;|&apos;/gi, "'")
            .replace(/&amp;/gi, '&');
        return typeof window.ZHIYU_RICH_TEXT_CONTRACT?.normalizePlainText === 'function'
            ? window.ZHIYU_RICH_TEXT_CONTRACT.normalizePlainText(fallback)
            : fallback.replace(/\r\n?/g, '\n').trim();
    }

    function areChapterContentsEquivalent(leftContent, leftRecord, rightContent, rightRecord) {
        const left = String(leftContent ?? '');
        const right = String(rightContent ?? '');
        const leftFormat = String(leftRecord?.richText?.formatDigest || '');
        const rightFormat = String(rightRecord?.richText?.formatDigest || '');
        if (left === right) {
            return leftFormat || rightFormat
                ? !!leftFormat && leftFormat === rightFormat
                : true;
        }
        if (chapterPlainTextForComparison(left, leftRecord)
            !== chapterPlainTextForComparison(right, rightRecord)) return false;
        if (leftFormat || rightFormat) return !!leftFormat && leftFormat === rightFormat;
        const looksLikeHtml = value => /<[a-z][\s\S]*>/i.test(value);
        return !looksLikeHtml(left) && !looksLikeHtml(right);
    }

    function classifyDraftAgainstChapter(draft, chapter) {
        if (!draft) return { classification: 'same', automatic: false };
        const cloudVersion = Math.max(0, Number(chapter?._version || chapter?.version || 0));
        const baseRevision = Math.max(0, Number(draft.baseRevision ?? draft.revision ?? 0));
        const targetRevision = Math.max(0, Number(draft.targetRevision || (baseRevision ? baseRevision + 1 : 0)));
        const sameContent = String(draft.content ?? '') === String(chapter?.content ?? '');
        if (sameContent && !(draft.cleared === true && draft.pendingSync === true)) {
            return { classification: 'same', automatic: false, cloudVersion, baseRevision, targetRevision };
        }
        if (!baseRevision || !targetRevision || !cloudVersion) {
            return { classification: 'unknown', automatic: false, cloudVersion, baseRevision, targetRevision };
        }
        if (draft.cleared === true && draft.content === '' && Number(draft.contentClearedAt || 0) > 0) {
            return baseRevision === cloudVersion
                ? { classification: 'draft_newer', automatic: true, cleared: true, cloudVersion, baseRevision, targetRevision }
                : { classification: cloudVersion > baseRevision ? 'concurrent' : 'unknown', automatic: false, cleared: true, cloudVersion, baseRevision, targetRevision };
        }
        if (baseRevision === cloudVersion && targetRevision === baseRevision + 1) {
            return { classification: 'draft_newer', automatic: true, cloudVersion, baseRevision, targetRevision };
        }
        if (cloudVersion > baseRevision) {
            return {
                classification: draft.pendingSync === true ? 'concurrent' : 'cloud_newer',
                automatic: false,
                cloudVersion,
                baseRevision,
                targetRevision
            };
        }
        return { classification: 'unknown', automatic: false, cloudVersion, baseRevision, targetRevision };
    }

    function getExplicitChapterClearDraft(book, vi, ci) {
        const stored = loadDraftRecord(book, vi, ci);
        const localId = getChapterDraftContext(book, vi, ci).chapter?._localId || '';
        const pending = localId ? pendingDraftWrites.get(localId) : null;
        const record = stored || (pending ? { ...pending, chapterLocalId: pending.localId } : null);
        return record && record.cleared === true && record.content === '' ? record : null;
    }

    function isExplicitChapterClearPending(book, vi, ci) {
        return !!getExplicitChapterClearDraft(book, vi, ci)?.pendingSync;
    }

    async function confirmDraftSyncedAsync(book, vi, ci, expectedUpdatedAt) {
        const record = loadDraftRecord(book, vi, ci);
        if (!record?.pendingSync || Number(record.updatedAt) !== Number(expectedUpdatedAt)) return false;
        return (await clearDraftDurably(book, vi, ci, { expectedUpdatedAt })) === true;
    }

    function confirmDraftSynced(book, vi, ci, expectedUpdatedAt) {
        return confirmDraftSyncedAsync(book, vi, ci, expectedUpdatedAt);
    }

    function getChapterState() {
        return window.ZHIYU_APP_STATE?.chapter || window.AppState?.chapter || {};
    }

    function bindDraftAutosave() {
        const resultBox = document.getElementById('resultBox');
        if (!resultBox || resultBox.dataset.draftAutosaveBound === '1') return;
        resultBox.dataset.draftAutosaveBound = '1';

        let draftTimer = null;
        resultBox.addEventListener('input', function() {
            if (resultBox.dataset.editingRefFile) return;
            clearTimeout(draftTimer);
            draftTimer = setTimeout(function() {
                const books = typeof window.gB === 'function' ? window.gB() : {};
                if (!window.syncCurrentChapterLocation?.(books)) return;
                const s = getChapterState();
                if (!s || !s.book || s.vi < 0 || s.ci < 0) return;
                const content = typeof window.getResultBoxHTMLForChapterSave === 'function'
                    ? window.getResultBoxHTMLForChapterSave()
                    : resultBox.innerHTML;
                if (content === '[正在生成中，请稍候...]' || content === '点击左侧章节查看内容，或生成新章节...') return;
                const ch = books[s.book]?.volumes?.[s.vi]?.chapters?.[s.ci];
                const clearRecord = getExplicitChapterClearDraft(s.book, s.vi, s.ci);
                const isBlank = window.isBlankChapterContent?.(content) ?? !String(content || '').trim();
                if (isBlank && !clearRecord) {
                    if (ch && window.wouldBlankOverwriteExisting?.(content, ch.content)) clearDraft(s.book, s.vi, s.ci);
                    return;
                }
                if (ch && window.wouldBlankOverwriteExisting?.(content, ch.content, !!clearRecord)) {
                    clearDraft(s.book, s.vi, s.ci);
                    return;
                }
                saveDraft(s.book, s.vi, s.ci, content, clearRecord ? {
                    cleared: true,
                    pendingSync: true,
                    contentClearedAt: clearRecord.contentClearedAt
                } : { pendingSync: true });
            }, 500);
        });
    }

    window.ZHIYU_DRAFT_AUTOSAVE = {
        getChapterDraftContext,
        getChapterDraftStorageKey,
        draftKey: getChapterDraftStorageKey,
        legacyDraftKey,
        draftMetaKey,
        readDraftRecord,
        draftChecksum,
        emergencyDraftStorageKey,
        captureChapterEmergencyDraft,
        recoverEmergencyDrafts,
        writeDraftRecord,
        removeDraftRecord,
        migrateLegacyChapterDraft,
        saveDraft,
        loadDraft,
        loadDraftRecord,
        clearDraft,
        clearDraftDurably,
        chapterPlainTextForComparison,
        areChapterContentsEquivalent,
        classifyDraftAgainstChapter,
        getExplicitChapterClearDraft,
        isExplicitChapterClearPending,
        confirmDraftSynced,
        confirmDraftSyncedAsync,
        bindDraftAutosave
    };
    window.setDraftPersistenceStatus = setDraftPersistenceStatus;
    window.notifyDraftSaveFailure = notifyDraftSaveFailure;
    window.clearDraftPersistenceFailure = clearDraftPersistenceFailure;
    window.draftChecksum = draftChecksum;
    window.emergencyDraftStorageKey = emergencyDraftStorageKey;
    window.captureChapterEmergencyDraft = captureChapterEmergencyDraft;
    window.recoverEmergencyDrafts = recoverEmergencyDrafts;
    window.getChapterDraftStorageKey = getChapterDraftStorageKey;
    window.legacyDraftKey = legacyDraftKey;
    window.draftMetaKey = draftMetaKey;
    window.migrateLegacyChapterDraft = migrateLegacyChapterDraft;
    window.saveDraft = saveDraft;
    window.loadDraft = loadDraft;
    window.loadDraftRecord = loadDraftRecord;
    window.clearDraft = clearDraft;
    window.clearDraftDurably = clearDraftDurably;
    window.chapterPlainTextForComparison = chapterPlainTextForComparison;
    window.areChapterContentsEquivalent = areChapterContentsEquivalent;
    window.classifyDraftAgainstChapter = classifyDraftAgainstChapter;
    window.getExplicitChapterClearDraft = getExplicitChapterClearDraft;
    window.isExplicitChapterClearPending = isExplicitChapterClearPending;
    window.confirmDraftSynced = confirmDraftSynced;
    window.confirmDraftSyncedAsync = confirmDraftSyncedAsync;

    bindDraftAutosave();
})(window, document);
