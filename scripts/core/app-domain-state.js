// 拆分项目领域状态模块。
// 负责作品存储键、稳定作品编号和按账号隔离的删除墓碑。
(function(window) {
    'use strict';

const STORAGE_KEYS = { BOOKS:'novel_books', API:'novel_api', TEMPLATES:'novel_templates', SETTINGS:'novel_settings' };
        const STATUS = { ACTIVE:'active', ARCHIVED:'archived', TRASH:'trash' };
        const DELETED_BOOKS_KEY = 'zhiyu_deleted_books_v2';
        const LEGACY_DELETED_BOOKS_KEY = 'zhiyu_deleted_book_names_v1';
        const LEGACY_DELETED_BOOKS_QUARANTINE_KEY = 'zhiyu_deleted_book_names_quarantine_v1';
        const DEVICE_ID_KEY = 'zhiyu_device_id_v1';

        function randomIdentity(prefix) {
            const bytes = new Uint8Array(16);
            if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
            else {
                for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
            }
            return prefix + Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
        }

        function ensureBookStableId(book, options) {
            if (!book || typeof book !== 'object') return '';
            const existing = String(book._bid || book.bookId || book.id || '').trim();
            if (/^bk_[A-Za-z0-9_-]{8,100}$/.test(existing)) {
                book._bid = existing;
                return existing;
            }
            book._bid = randomIdentity('bk_');
            if (options?.legacyMissing === true) book._localBookIdOrigin = 'legacy-missing-id';
            return book._bid;
        }

        function ensureAllBookStableIds(books, options) {
            let changed = 0;
            Object.values(books || {}).forEach(function(book) {
                const before = String(book?._bid || '');
                const after = ensureBookStableId(book, options);
                if (after && before !== after) changed += 1;
            });
            return changed;
        }

        function activeUid() {
            return String(window.AccountDataScope?.getActiveUid?.() || 'guest');
        }

        function tombstoneStorageKey(uid) {
            if (window.AccountDataScope?.key) return window.AccountDataScope.key(DELETED_BOOKS_KEY, uid || activeUid());
            return DELETED_BOOKS_KEY + '__uid_' + (uid || activeUid());
        }

        function getDeviceId() {
            try {
                const existing = String(localStorage.getItem(DEVICE_ID_KEY) || '');
                if (existing) return existing;
                const created = randomIdentity('device_');
                localStorage.setItem(DEVICE_ID_KEY, created);
                return created;
            } catch(e) { return 'device_unknown'; }
        }

        function quarantineLegacyDeletedBookNames() {
            try {
                const legacyRaw = localStorage.getItem(LEGACY_DELETED_BOOKS_KEY);
                if (!legacyRaw || localStorage.getItem(LEGACY_DELETED_BOOKS_QUARANTINE_KEY)) return false;
                const legacy = JSON.parse(legacyRaw);
                if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) return false;
                localStorage.setItem(LEGACY_DELETED_BOOKS_QUARANTINE_KEY, JSON.stringify({
                    quarantinedAt: new Date().toISOString(),
                    reason: '旧记录只有书名，无法确认账号和作品编号，禁止自动应用',
                    records: legacy
                }));
                return true;
            } catch(e) { return false; }
        }

        function getDeletedBookTombstones(uid) {
            quarantineLegacyDeletedBookNames();
            const key = tombstoneStorageKey(uid);
            try {
                const raw = JSON.parse(localStorage.getItem(key) || '{}') || {};
                if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
                let changed = false;
                const now = Date.now();
                Object.keys(raw).forEach(function(bookId) {
                    const record = raw[bookId];
                    if (!record || typeof record !== 'object' || String(record.bookId || '') !== bookId) {
                        delete raw[bookId];
                        changed = true;
                        return;
                    }
                    if (record.status === 'deleted' && Number(record.expiresAt || 0) > 0 && Number(record.expiresAt) <= now) {
                        record.status = 'expired';
                        record.expiredAt = new Date(now).toISOString();
                        record.updatedAt = record.expiredAt;
                        record.revision = Number(record.revision || 0) + 1;
                        changed = true;
                    }
                });
                if (changed) localStorage.setItem(key, JSON.stringify(raw));
                return raw;
            } catch(e) { return {}; }
        }

        function saveDeletedBookTombstones(records, uid) {
            try {
                localStorage.setItem(tombstoneStorageKey(uid), JSON.stringify(records || {}));
                return true;
            } catch(e) { return false; }
        }

        function mergeDeletedBookTombstones(incomingRecords, uid) {
            const ownerUid = String(uid || activeUid());
            const localRecords = getDeletedBookTombstones(ownerUid);
            let changed = false;
            Object.entries(incomingRecords || {}).forEach(function(entry) {
                const bookId = String(entry[0] || '');
                const incoming = entry[1];
                if (!/^bk_[A-Za-z0-9_-]{8,100}$/.test(bookId)
                    || !incoming
                    || typeof incoming !== 'object'
                    || String(incoming.bookId || '') !== bookId
                    || String(incoming.uid || '') !== ownerUid
                    || !['deleted', 'restored', 'expired'].includes(String(incoming.status || ''))) {
                    return;
                }
                const normalized = {
                    bookId,
                    uid: ownerUid,
                    displayName: String(incoming.displayName || '').slice(0, 160),
                    revision: Math.max(1, Math.floor(Number(incoming.revision || 1))),
                    deletedAt: String(incoming.deletedAt || ''),
                    sourceDevice: String(incoming.sourceDevice || '').slice(0, 100),
                    status: String(incoming.status),
                    expiresAt: Math.max(0, Number(incoming.expiresAt || 0)),
                    updatedAt: String(incoming.updatedAt || incoming.restoredAt || incoming.expiredAt || incoming.deletedAt || '')
                };
                if (incoming.restoredAt) normalized.restoredAt = String(incoming.restoredAt);
                if (incoming.restoredByDevice) normalized.restoredByDevice = String(incoming.restoredByDevice).slice(0, 100);
                if (incoming.expiredAt) normalized.expiredAt = String(incoming.expiredAt);
                const local = localRecords[bookId];
                const incomingRevision = normalized.revision;
                const localRevision = Math.max(0, Math.floor(Number(local?.revision || 0)));
                const incomingTime = Date.parse(normalized.updatedAt || '') || 0;
                const localTime = Date.parse(local?.updatedAt || local?.restoredAt || local?.expiredAt || local?.deletedAt || '') || 0;
                if (!local || incomingRevision > localRevision || (incomingRevision === localRevision && incomingTime > localTime)) {
                    localRecords[bookId] = normalized;
                    changed = true;
                }
            });
            if (changed) saveDeletedBookTombstones(localRecords, ownerUid);
            return { changed, records: localRecords };
        }

        function resolveBook(name, suppliedBook) {
            if (suppliedBook && typeof suppliedBook === 'object') return suppliedBook;
            const books = typeof window.gB === 'function' ? window.gB() || {} : {};
            return books[name] && typeof books[name] === 'object' ? books[name] : null;
        }

        function markBookDeleted(name, suppliedBook, options) {
            const book = resolveBook(name, suppliedBook);
            const bookId = ensureBookStableId(book);
            if (!bookId) return false;
            const uid = activeUid();
            const records = getDeletedBookTombstones(uid);
            const previous = records[bookId] || {};
            const now = new Date().toISOString();
            records[bookId] = {
                bookId: bookId,
                uid: uid,
                displayName: String(name || book?.title || book?.name || ''),
                revision: Number(previous.revision || 0) + 1,
                deletedAt: now,
                sourceDevice: getDeviceId(),
                status: 'deleted',
                expiresAt: Number(options?.expiresAt || 0),
                updatedAt: now
            };
            return saveDeletedBookTombstones(records, uid);
        }

        function unmarkBookDeleted(name, suppliedBook) {
            const book = resolveBook(name, suppliedBook);
            const bookId = String(book?._bid || book?.bookId || book?.id || '');
            if (!bookId) return false;
            const uid = activeUid();
            const records = getDeletedBookTombstones(uid);
            const previous = records[bookId];
            if (!previous || previous.status !== 'deleted') return false;
            const now = new Date().toISOString();
            records[bookId] = Object.assign({}, previous, {
                revision: Number(previous.revision || 0) + 1,
                status: 'restored',
                restoredAt: now,
                restoredByDevice: getDeviceId(),
                updatedAt: now
            });
            return saveDeletedBookTombstones(records, uid);
        }

        function isBookTombstoned(book, uid) {
            const bookId = String(book?._bid || book?.bookId || book?.id || '');
            if (!bookId) return false;
            const record = getDeletedBookTombstones(uid)[bookId];
            return !!record && record.status === 'deleted' && String(record.uid || '') === String(uid || activeUid());
        }

        function getDeletedBookNames(uid) {
            const names = {};
            Object.values(getDeletedBookTombstones(uid)).forEach(function(record) {
                if (record?.status === 'deleted' && record.displayName) names[record.displayName] = record.deletedAt || true;
            });
            return names;
        }

        function normalizeBookName(name) {
            return String(name || '').trim();
        }

        function findBookNameConflict(name, exceptName) {
            const target = normalizeBookName(name);
            const except = normalizeBookName(exceptName);
            if (!target) return '';
            const books = typeof window.gB === 'function' ? window.gB() || {} : {};
            const memBooks = typeof window.getMemBooks === 'function' ? window.getMemBooks() || {} : {};
            const names = Array.from(new Set(Object.keys(books).concat(Object.keys(memBooks))));
            return names.find(function(existingName) {
                const current = normalizeBookName(existingName);
                return current === target && current !== except;
            }) || '';
        }

        function warnBookNameConflict() {
            const Toast = window.ZHIYU_TOAST || window.Toast;
            if (Toast && typeof Toast.warn === 'function') {
                Toast.warn('作品名已存在，回收站或归档里的同名作品也不能重复。请先彻底删除旧作品，或换一个名称。');
            }
        }

        // ===== 统一应用状态管理 =====

    window.ZHIYU_STORAGE_KEYS = STORAGE_KEYS;
    window.ZHIYU_STATUS = STATUS;
    window.ZHIYU_DELETED_BOOKS_KEY = DELETED_BOOKS_KEY;
    window.ZHIYU_LEGACY_DELETED_BOOKS_QUARANTINE_KEY = LEGACY_DELETED_BOOKS_QUARANTINE_KEY;
    window.ensureBookStableId = ensureBookStableId;
    window.ensureAllBookStableIds = ensureAllBookStableIds;
    window.getDeletedBookTombstones = getDeletedBookTombstones;
    window.mergeDeletedBookTombstones = mergeDeletedBookTombstones;
    window.isBookTombstoned = isBookTombstoned;
    window.quarantineLegacyDeletedBookNames = quarantineLegacyDeletedBookNames;
    window.getDeletedBookNames = getDeletedBookNames;
    window.markBookDeleted = markBookDeleted;
    window.unmarkBookDeleted = unmarkBookDeleted;
    window.normalizeBookName = normalizeBookName;
    window.findBookNameConflict = findBookNameConflict;
    window.warnBookNameConflict = warnBookNameConflict;
})(window);
