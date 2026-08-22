// 拆分项目本地存储模块。
// 只迁移原 app-test 内联脚本里的 IDB、SecureStore、StorageService，不改变保存格式。
(function(window) {
    'use strict';

    const CONFIG = window.ZHIYU_CONFIG || {};
    const StorageV2 = window.ZHIYU_STORAGE_V2 || null;

// =================== [3] IndexedDB 存储层 ===================
        const IDB = (function() {
            const DB_NAME = 'zhiyu-store';
            const STORE = 'kv';
            let _db = null;
            let _openPromise = null;
            let _connectionGeneration = 0;

            async function _open() {
                if (_db) return _db;
                await StorageV2?.waitForDatabaseReady?.();
                if (_db) return _db;
                if (_openPromise) return _openPromise;
                const generation = _connectionGeneration;
                _openPromise = new Promise((resolve, reject) => {
                    const req = indexedDB.open(DB_NAME);
                    req.onupgradeneeded = () => {
                        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
                    };
                    req.onsuccess = () => {
                        if (generation !== _connectionGeneration) {
                            try { req.result.close(); } catch(e) {}
                            reject(new Error('IndexedDB 连接已为结构升级关闭'));
                            return;
                        }
                        _db = req.result;
                        _db.onversionchange = function() {
                            try { _db.close(); } catch(e) {}
                            _db = null;
                        };
                        resolve(_db);
                    };
                    req.onerror = () => reject(req.error);
                });
                try {
                    return await _openPromise;
                } finally {
                    _openPromise = null;
                }
            }

            async function get(key) {
                const db = await _open();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(STORE, 'readonly');
                    const req = tx.objectStore(STORE).get(key);
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => reject(req.error);
                });
            }

            async function set(key, value) {
                const db = await _open();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(STORE, 'readwrite');
                    const req = tx.objectStore(STORE).put(value, key);
                    let requestError = null;
                    req.onerror = () => { requestError = req.error || new Error('IndexedDB 保存失败'); };
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = () => reject(requestError || tx.error || new Error('IndexedDB 保存失败'));
                    tx.onabort = () => reject(requestError || tx.error || new Error('IndexedDB 保存已取消'));
                });
            }

            // 同一事务内写入多条记录。全文分析保存作品、关联资料和保存回执时使用，
            // 避免只保存一半导致下次打开作品与资料不一致。
            async function setMany(entries) {
                const items = Array.isArray(entries) ? entries.filter(function(item) {
                    return Array.isArray(item) && item.length >= 2 && item[0];
                }) : [];
                if (!items.length) return true;
                const db = await _open();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(STORE, 'readwrite');
                    const store = tx.objectStore(STORE);
                    let requestError = null;
                    items.forEach(function(item) {
                        const req = store.put(item[1], item[0]);
                        req.onerror = function() { requestError = req.error || new Error('IndexedDB 保存失败'); };
                    });
                    tx.oncomplete = function() { resolve(true); };
                    tx.onerror = function() { reject(requestError || tx.error || new Error('IndexedDB 保存失败')); };
                    tx.onabort = function() { reject(requestError || tx.error || new Error('IndexedDB 保存已取消')); };
                });
            }

            async function remove(key) {
                const db = await _open();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(STORE, 'readwrite');
                    const req = tx.objectStore(STORE).delete(key);
                    let requestError = null;
                    req.onerror = () => { requestError = req.error || new Error('IndexedDB 删除失败'); };
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = () => reject(requestError || tx.error || new Error('IndexedDB 删除失败'));
                    tx.onabort = () => reject(requestError || tx.error || new Error('IndexedDB 删除已取消'));
                });
            }

            async function setManyFenced(entries, fenceKey, expectedLeaseId) {
                const items = Array.isArray(entries) ? entries.filter(function(item) {
                    return Array.isArray(item) && item.length >= 2 && item[0];
                }) : [];
                if (!items.length) return true;
                if (!fenceKey || !expectedLeaseId) throw new Error('缺少本机事务写入代次');
                if (items.some(function(item) { return String(item[0]) === String(fenceKey); })) {
                    throw new Error('业务事务不能修改本机写入围栏');
                }
                const db = await _open();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(STORE, 'readwrite');
                    const store = tx.objectStore(STORE);
                    let requestError = null;
                    const fenceRequest = store.get(String(fenceKey));
                    fenceRequest.onsuccess = function() {
                        if (String(fenceRequest.result?.leaseId || '') !== String(expectedLeaseId)) {
                            requestError = new Error('本机写入代次已变化，旧事务已取消');
                            requestError.code = 'ACCOUNT_WRITER_FENCE_CHANGED';
                            try { tx.abort(); } catch(error) {}
                            return;
                        }
                        items.forEach(function(item) {
                            const req = store.put(item[1], item[0]);
                            req.onerror = function() { requestError = req.error || new Error('IndexedDB 保存失败'); };
                        });
                    };
                    fenceRequest.onerror = function() {
                        requestError = fenceRequest.error || new Error('本机写入代次读取失败');
                        try { tx.abort(); } catch(error) {}
                    };
                    tx.oncomplete = function() { resolve(true); };
                    tx.onerror = function() { reject(requestError || tx.error || new Error('IndexedDB 保存失败')); };
                    tx.onabort = function() { reject(requestError || tx.error || new Error('IndexedDB 保存已取消')); };
                });
            }

            async function scanPrefix(prefix, visitor) {
                const expectedPrefix = String(prefix || '');
                if (!expectedPrefix || typeof visitor !== 'function') return 0;
                const db = await _open();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(STORE, 'readonly');
                    const store = tx.objectStore(STORE);
                    const keyRangeApi = window.IDBKeyRange;
                    const range = keyRangeApi?.bound
                        ? keyRangeApi.bound(expectedPrefix, expectedPrefix + '\uffff')
                        : null;
                    const req = store.openCursor(range);
                    let count = 0;
                    req.onsuccess = function() {
                        const cursor = req.result;
                        if (!cursor) return;
                        const key = String(cursor.key || '');
                        if (key.startsWith(expectedPrefix)) {
                            try {
                                visitor(key, cursor.value);
                                count += 1;
                            } catch(error) {
                                try { tx.abort(); } catch(e) {}
                                reject(error);
                                return;
                            }
                        }
                        cursor.continue();
                    };
                    req.onerror = function() { reject(req.error || new Error('IndexedDB 扫描失败')); };
                    tx.oncomplete = function() { resolve(count); };
                    tx.onerror = function() { reject(tx.error || new Error('IndexedDB 扫描失败')); };
                    tx.onabort = function() { reject(tx.error || new Error('IndexedDB 扫描已取消')); };
                });
            }

            async function mutateKv(keys, mutator, options) {
                const settings = options && typeof options === 'object' ? options : {};
                const expectedFenceKey = String(settings.fenceKey || '');
                const expectedLeaseId = String(settings.expectedLeaseId || '');
                const requestedKeys = Array.from(new Set((keys || []).filter(Boolean).map(String)));
                if (expectedFenceKey && !requestedKeys.includes(expectedFenceKey)) requestedKeys.push(expectedFenceKey);
                if (!requestedKeys.length) throw new Error('缺少本机事务键');
                if (typeof mutator !== 'function') throw new Error('缺少本机事务处理器');
                if ((expectedFenceKey && !expectedLeaseId) || (!expectedFenceKey && expectedLeaseId)) {
                    throw new Error('本机事务写入代次不完整');
                }
                const db = await _open();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(STORE, 'readwrite');
                    const store = tx.objectStore(STORE);
                    const values = {};
                    let pending = requestedKeys.length;
                    let result;
                    let settled = false;
                    const fail = function(error) {
                        if (settled) return;
                        settled = true;
                        try { tx.abort(); } catch(e) {}
                        reject(error || new Error('本机事务失败'));
                    };
                    requestedKeys.forEach(function(key) {
                        const req = store.get(key);
                        req.onsuccess = function() {
                            values[key] = req.result;
                            pending -= 1;
                            if (pending > 0 || settled) return;
                            try {
                                if (expectedFenceKey
                                    && String(values[expectedFenceKey]?.leaseId || '') !== expectedLeaseId) {
                                    const error = new Error('本机写入代次已变化，旧事务已取消');
                                    error.code = 'ACCOUNT_WRITER_FENCE_CHANGED';
                                    throw error;
                                }
                                const mutation = mutator(values) || {};
                                const changedFence = (Array.isArray(mutation.entries) ? mutation.entries : []).some(function(entry) {
                                    return expectedFenceKey && String(entry?.[0] || '') === expectedFenceKey;
                                }) || (Array.isArray(mutation.deletes) ? mutation.deletes : []).some(function(key) {
                                    return expectedFenceKey && String(key || '') === expectedFenceKey;
                                });
                                if (changedFence) throw new Error('业务事务不能修改本机写入围栏');
                                result = mutation.result;
                                (Array.isArray(mutation.entries) ? mutation.entries : []).forEach(function(entry) {
                                    if (!Array.isArray(entry) || entry.length < 2 || !entry[0]) return;
                                    const put = store.put(entry[1], String(entry[0]));
                                    put.onerror = function() { fail(put.error || new Error('本机事务写入失败')); };
                                });
                                (Array.isArray(mutation.deletes) ? mutation.deletes : []).forEach(function(key) {
                                    if (!key) return;
                                    const remove = store.delete(String(key));
                                    remove.onerror = function() { fail(remove.error || new Error('本机事务删除失败')); };
                                });
                            } catch(error) {
                                fail(error);
                            }
                        };
                        req.onerror = function() { fail(req.error || new Error('本机事务读取失败')); };
                    });
                    tx.oncomplete = function() {
                        if (settled) return;
                        settled = true;
                        resolve(result);
                    };
                    tx.onerror = function() { fail(tx.error || new Error('本机事务失败')); };
                    tx.onabort = function() {
                        if (settled) return;
                        settled = true;
                        reject(tx.error || new Error('本机事务已取消'));
                    };
                });
            }

            async function mutateKvFenced(keys, fenceKeyValue, expectedLeaseId, mutator) {
                const key = String(fenceKeyValue || '');
                const leaseId = String(expectedLeaseId || '');
                if (!key || !leaseId) throw new Error('缺少本机事务写入代次');
                return mutateKv(keys, mutator, { fenceKey: key, expectedLeaseId: leaseId });
            }

            async function removeFenced(key, fenceKeyValue, expectedLeaseId) {
                const targetKey = String(key || '');
                if (!targetKey) return true;
                return mutateKvFenced([targetKey], fenceKeyValue, expectedLeaseId, function() {
                    return { deletes: [targetKey], result: true };
                });
            }

            function close() {
                _connectionGeneration += 1;
                if (!_db) return;
                try { _db.close(); } catch(e) {}
                _db = null;
            }

            return {
                get,
                set,
                setMany,
                setManyFenced,
                remove,
                removeFenced,
                scanPrefix,
                mutateKv,
                mutateKvFenced,
                close
            };
        })();

        // =================== [4] API Key 加密存储（密文存 IndexedDB）===================
        const SecureStore = (function() {
            const API_KEY_PREFIX = 'secure_api_config';
            let _cache = { apiConfig: {}, customModelSecrets: {} };
            let _cryptoKey = null;
            let _activeUid = 'guest';
            let _scopeEpoch = 0;
            let _writeChain = Promise.resolve();
            let _legacyUnscopedDetected = false;
            let _legacyUnscopedChecked = false;

            async function _deriveKey() {
                const fingerprint = [
                    navigator.userAgent || '',
                    screen.width || 0,
                    screen.height || 0,
                    navigator.language || ''
                ].join('|');
                const enc = new TextEncoder();
                const keyMaterial = await crypto.subtle.importKey(
                    'raw', enc.encode(fingerprint), 'PBKDF2', false, ['deriveKey']
                );
                const salt = enc.encode('zhiyu-writing-salt-v1');
                return crypto.subtle.deriveKey(
                    { name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' },
                    keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
                );
            }

            function _normalizeUid(uid) {
                return AccountDataScope.normalizeUid(uid === undefined ? AccountDataScope.getActiveUid() : uid);
            }

            function _storageKey(uid) {
                return AccountDataScope.key(API_KEY_PREFIX, _normalizeUid(uid));
            }

            function _emptyCache() {
                return { apiConfig: {}, customModelSecrets: {} };
            }

            function _normalizePayload(value) {
                if (!value || typeof value !== 'object' || Array.isArray(value)) return _emptyCache();
                if (value.apiConfig || value.customModelSecrets) {
                    return {
                        apiConfig: value.apiConfig && typeof value.apiConfig === 'object' ? { ...value.apiConfig } : {},
                        customModelSecrets: value.customModelSecrets && typeof value.customModelSecrets === 'object'
                            ? { ...value.customModelSecrets }
                            : {}
                    };
                }
                return { apiConfig: { ...value }, customModelSecrets: {} };
            }

            async function _persist(uid, payload, writeToken) {
                if (!_cryptoKey) _cryptoKey = await _deriveKey();
                const storageKey = _storageKey(uid);
                const iv = crypto.getRandomValues(new Uint8Array(12));
                const enc = new TextEncoder();
                const plainBuf = enc.encode(JSON.stringify(payload));
                const cipherBuf = await crypto.subtle.encrypt(
                    { name: 'AES-GCM', iv, additionalData: enc.encode(storageKey) },
                    _cryptoKey,
                    plainBuf
                );
                const encrypted = JSON.stringify({
                    version: 2,
                    iv: Array.from(iv),
                    data: Array.from(new Uint8Array(cipherBuf))
                });
                if (writeToken?.fenceKey && writeToken?.leaseId) {
                    await IDB.setManyFenced([[storageKey, encrypted]], writeToken.fenceKey, writeToken.leaseId);
                } else {
                    await IDB.set(storageKey, encrypted);
                }
            }

            function _queuePersist(uid, payload) {
                const snapshot = _normalizePayload(payload);
                const operation = _writeChain.then(function() {
                    const lease = window.ZHIYU_ACCOUNT_WRITE_LEASE;
                    const writeToken = lease?.beginWrite?.(uid, {
                        message: '此账号已在另一个标签页编辑，账号设置未保存。'
                    }) || (!lease ? { legacy: true, uid } : null);
                    if (!writeToken) throw new Error('当前标签页没有账号设置写入权');
                    return _persist(uid, snapshot, writeToken).then(function(result) {
                        if (lease && lease.isWriteTokenCurrent?.(writeToken) !== true) {
                            throw new Error('账号设置保存期间编辑权已变化');
                        }
                        return result;
                    }).finally(function() {
                        lease?.endWrite?.(writeToken);
                    });
                });
                _writeChain = operation.catch(function() {});
                return operation;
            }

            async function switchScope(uid) {
                const nextUid = _normalizeUid(uid);
                const epoch = ++_scopeEpoch;
                _activeUid = nextUid;
                _cache = _emptyCache();
                try {
                    if (!_cryptoKey) _cryptoKey = await _deriveKey();
                    if (!_legacyUnscopedChecked) {
                        _legacyUnscopedChecked = true;
                        const legacyEncrypted = await IDB.get(API_KEY_PREFIX);
                        _legacyUnscopedDetected = !!legacyEncrypted
                            || !!localStorage.getItem('novel_api')
                            || !!localStorage.getItem('zhiyu_custom_models');
                    }
                    const storageKey = _storageKey(nextUid);
                    const raw = await IDB.get(storageKey);
                    if (raw) {
                        const payload = JSON.parse(raw);
                        const iv = new Uint8Array(payload.iv);
                        const ciphertext = new Uint8Array(payload.data);
                        const enc = new TextEncoder();
                        const plainBuf = await crypto.subtle.decrypt(
                            { name: 'AES-GCM', iv, additionalData: enc.encode(storageKey) },
                            _cryptoKey,
                            ciphertext
                        );
                        if (epoch === _scopeEpoch && _activeUid === nextUid && AccountDataScope.getActiveUid() === nextUid) {
                            _cache = _normalizePayload(JSON.parse(new TextDecoder().decode(plainBuf)));
                        }
                    }
                } catch (e) {
                    if (epoch === _scopeEpoch && _activeUid === nextUid) _cache = _emptyCache();
                }
                return epoch === _scopeEpoch && _activeUid === nextUid && AccountDataScope.getActiveUid() === nextUid;
            }

            async function init(uid) {
                return switchScope(uid === undefined ? AccountDataScope.getActiveUid() : uid);
            }

            function _isCurrentScope() {
                return _activeUid === AccountDataScope.getActiveUid();
            }

            function get() {
                return _isCurrentScope() ? { ...(_cache.apiConfig || {}) } : {};
            }

            function getCustomModelSecrets() {
                return _isCurrentScope() ? { ...(_cache.customModelSecrets || {}) } : {};
            }

            async function set(data) {
                const uid = AccountDataScope.getActiveUid();
                const epoch = _scopeEpoch;
                const previous = _normalizePayload(_cache);
                const next = {
                    apiConfig: data && typeof data === 'object' ? { ...data } : {},
                    customModelSecrets: { ...(_cache.customModelSecrets || {}) }
                };
                if (_activeUid === uid) _cache = next;
                try {
                    await _queuePersist(uid, next);
                    return epoch === _scopeEpoch && _activeUid === uid && AccountDataScope.getActiveUid() === uid;
                } catch (e) {
                    if (epoch === _scopeEpoch && _activeUid === uid && _cache === next) _cache = previous;
                    console.error('API Key 加密存储失败:', e);
                }
                return false;
            }

            async function setCustomModelSecrets(secrets) {
                const uid = AccountDataScope.getActiveUid();
                const epoch = _scopeEpoch;
                const previous = _normalizePayload(_cache);
                const next = {
                    apiConfig: { ...(_cache.apiConfig || {}) },
                    customModelSecrets: secrets && typeof secrets === 'object' ? { ...secrets } : {}
                };
                if (_activeUid === uid) _cache = next;
                try {
                    await _queuePersist(uid, next);
                    return epoch === _scopeEpoch && _activeUid === uid && AccountDataScope.getActiveUid() === uid;
                } catch (e) {
                    if (epoch === _scopeEpoch && _activeUid === uid && _cache === next) _cache = previous;
                    console.error('自定义模型 Key 加密存储失败:', e);
                    return false;
                }
            }

            function clearRuntime() {
                _scopeEpoch += 1;
                _activeUid = AccountDataScope.getActiveUid();
                _cache = _emptyCache();
            }

            function isReadyForCurrentScope() {
                return !!_cryptoKey && _isCurrentScope();
            }

            function hasLegacyUnscopedConfig() {
                return _legacyUnscopedDetected;
            }

            return {
                init,
                switchScope,
                clearRuntime,
                isReadyForCurrentScope,
                hasLegacyUnscopedConfig,
                get,
                set,
                getCustomModelSecrets,
                setCustomModelSecrets
            };
        })();

        // =================== [5] 存储服务（IndexedDB + 内存缓存）===================
        const StorageService = (function() {
            const PREFIX = CONFIG.STORAGE_PREFIX;
            const KEYS = { BOOKS:'books', API:'api', TEMPLATES:'templates', SETTINGS:'settings' };
            const _cache = {};
            let _booksReadState = { status: 'unknown', error: '' };
            let _v2MigrationTimer = null;
            let _lastWriteTimestamp = 0;
            let _v2ReadEpoch = 0;
            let _preferredV2Memory = { uid: '', value: null, source: '' };
            let _persistedLocalSnapshot = { uid: '', books: '{}', memory: '{}' };
            const _booksWriteQueues = new Map();
            const _templateWriteQueues = new Map();
            let _storageScopeEpoch = 0;
            let _bookLifecycleSequence = 0;
            let _bookLifecycleMutations = [];

            function _resetBookLifecycleMutations() {
                _bookLifecycleSequence += 1;
                _bookLifecycleMutations = [];
            }

            function _bookStableId(book) {
                return String(book?._bid || book?.bookId || book?.id || '').trim();
            }

            function _findBookEntry(books, bookId, fallbackNames, alternateBookIds) {
                const source = books && typeof books === 'object' && !Array.isArray(books) ? books : {};
                const wantedIds = [bookId].concat(Array.isArray(alternateBookIds) ? alternateBookIds : [])
                    .map(function(value) { return String(value || '').trim(); })
                    .filter(Boolean);
                if (wantedIds.length) {
                    for (const name of Object.keys(source)) {
                        if (wantedIds.includes(_bookStableId(source[name]))) return { name, book: source[name] };
                    }
                    return null;
                }
                for (const name of (Array.isArray(fallbackNames) ? fallbackNames : [])) {
                    if (name && source[name]) return { name, book: source[name] };
                }
                return null;
            }

            function _recordBookLifecycleMutation(uid, mutation) {
                if (!mutation || typeof mutation !== 'object') return;
                const normalized = {
                    sequence: ++_bookLifecycleSequence,
                    uid: AccountDataScope.normalizeUid(uid),
                    type: String(mutation.type || '').trim(),
                    bookId: String(mutation.bookId || '').trim(),
                    previousBookId: String(mutation.previousBookId || '').trim(),
                    bookName: String(mutation.bookName || '').trim(),
                    oldName: String(mutation.oldName || mutation.bookName || '').trim(),
                    newName: String(mutation.newName || '').trim(),
                    status: String(mutation.status || '').trim()
                };
                if (!normalized.uid || !normalized.type) return;
                _bookLifecycleMutations.push(normalized);
            }

            function _rebaseSnapshotsAfterLifecycle(books, memBooks, uid, sinceSequence) {
                const nextBooks = _cloneStorageValue(books || {});
                const nextMemBooks = memBooks == null ? null : _cloneStorageValue(memBooks || {});
                const mutations = _bookLifecycleMutations.filter(function(mutation) {
                    return mutation.uid === uid && mutation.sequence > Number(sinceSequence || 0);
                });
                mutations.forEach(function(mutation) {
                    const fallbackNames = [mutation.oldName, mutation.bookName, mutation.newName].filter(Boolean);
                    const entry = _findBookEntry(
                        nextBooks,
                        mutation.bookId,
                        fallbackNames,
                        [mutation.previousBookId]
                    );
                    if (mutation.type === 'delete') {
                        if (entry) delete nextBooks[entry.name];
                        if (!mutation.bookId) fallbackNames.forEach(function(name) { delete nextBooks[name]; });
                        if (nextMemBooks && (entry || !mutation.bookId)) {
                            fallbackNames.forEach(function(name) { delete nextMemBooks[name]; });
                        }
                        return;
                    }
                    if (mutation.type === 'rename') {
                        if (entry && mutation.newName) {
                            delete nextBooks[entry.name];
                            nextBooks[mutation.newName] = entry.book;
                        }
                        if (nextMemBooks && (entry || !mutation.bookId) && mutation.oldName && mutation.newName
                            && Object.prototype.hasOwnProperty.call(nextMemBooks, mutation.oldName)) {
                            nextMemBooks[mutation.newName] = nextMemBooks[mutation.oldName];
                            delete nextMemBooks[mutation.oldName];
                        }
                        return;
                    }
                    if (mutation.type === 'status' && entry && mutation.status) {
                        entry.book.status = mutation.status;
                        if (mutation.bookId) {
                            entry.book._bid = mutation.bookId;
                            entry.book.bookId = mutation.bookId;
                        }
                    }
                });
                return { books: nextBooks, memBooks: nextMemBooks };
            }

            function _assertAccountWriter(uid, options) {
                const api = window.ZHIYU_ACCOUNT_WRITE_LEASE;
                return !api || api.assertCanWrite(String(uid || ''), options) === true;
            }

            function _beginAccountWrite(uid, label) {
                const api = window.ZHIYU_ACCOUNT_WRITE_LEASE;
                if (!api) return { legacy: true, uid: String(uid || '') };
                return api.beginWrite(String(uid || ''), {
                    message: '此账号已在另一个标签页编辑，当前“' + String(label || '保存') + '”未写入本机。'
                });
            }

            function _accountWriteTokenCurrent(token) {
                const api = window.ZHIYU_ACCOUNT_WRITE_LEASE;
                return !api || token?.legacy === true || api.isWriteTokenCurrent(token) === true;
            }

            function _endAccountWrite(token) {
                window.ZHIYU_ACCOUNT_WRITE_LEASE?.endWrite?.(token);
            }

            function _nextWriteTimestamp() {
                _lastWriteTimestamp = Math.max(Date.now(), _lastWriteTimestamp + 1);
                return _lastWriteTimestamp;
            }

            function _idbKey(key, uid) {
                const base = PREFIX + key;
                return [KEYS.BOOKS, KEYS.TEMPLATES].includes(key)
                    ? AccountDataScope.key(base, uid)
                    : base;
            }
            function _metaKey(key, uid) { return _idbKey(key, uid) + '_updated_at'; }
            function _memoryKey(uid) { return AccountDataScope.key('mem_books', uid); }
            function _memoryMetaKey(uid) { return _memoryKey(uid) + '_updated_at'; }

            function _parsePersistedSnapshot(snapshot) {
                if (typeof snapshot !== 'string') return null;
                try {
                    const value = JSON.parse(snapshot);
                    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
                } catch(error) {
                    return null;
                }
            }

            function _normalizeCloudOutboxRecords(records, uid) {
                const suffix = '__uid_' + AccountDataScope.normalizeUid(uid);
                return (Array.isArray(records) ? records : []).filter(function(record) {
                    const key = String(record?.key || '');
                    return key.startsWith('zhiyu_cloud_write_outbox_v1_')
                        && key.endsWith(suffix);
                }).map(function(record) {
                    return [String(record.key), _cloneStorageValue(record.value || {})];
                });
            }

            function _cloneStorageValue(value) {
                if (typeof structuredClone === 'function') return structuredClone(value);
                return JSON.parse(JSON.stringify(value || {}));
            }

            function _fingerprintStorageValue(value) {
                const text = String(value ?? '');
                let hash = 2166136261;
                for (let index = 0; index < text.length; index += 1) {
                    hash ^= text.charCodeAt(index);
                    hash = Math.imul(hash, 16777619);
                }
                return (hash >>> 0).toString(16).padStart(8, '0') + ':' + text.length;
            }

            function _fullAnalysisMemoryHash(bookName, memBook, fileNames) {
                const expectedNames = Array.isArray(fileNames) ? fileNames.map(String) : [];
                const files = memBook?.['关联文件夹'];
                if (!expectedNames.length || !Array.isArray(files)) return '';
                const pairs = [];
                for (const name of expectedNames) {
                    const matches = files.filter(function(file) {
                        return String(file?.name || '') === String(bookName || '') + '_' + name;
                    });
                    if (matches.length !== 1) return '';
                    pairs.push([name, String(matches[0]?.content || '')]);
                }
                return _fingerprintStorageValue(JSON.stringify(pairs));
            }

            function _enqueueBooksWrite(uid, operation) {
                const queueUid = AccountDataScope.normalizeUid(uid);
                if (!queueUid || typeof operation !== 'function') return Promise.resolve(false);
                const queueEpoch = _storageScopeEpoch;
                const accountEpoch = Number(window.getAccountScopeEpoch?.() || 0);
                const previous = _booksWriteQueues.get(queueUid) || Promise.resolve();
                const next = previous.catch(function() {}).then(function() {
                    if (AccountDataScope.getActiveUid() !== queueUid
                        || _storageScopeEpoch !== queueEpoch
                        || Number(window.getAccountScopeEpoch?.() || 0) !== accountEpoch) return false;
                    return operation();
                });
                let tracked = null;
                tracked = next.finally(function() {
                    if (_booksWriteQueues.get(queueUid) === tracked) _booksWriteQueues.delete(queueUid);
                });
                _booksWriteQueues.set(queueUid, tracked);
                return tracked;
            }

            function _enqueueTemplateWrite(uid, operation) {
                const queueUid = AccountDataScope.normalizeUid(uid);
                if (!queueUid || typeof operation !== 'function') return Promise.resolve(false);
                const queueEpoch = _storageScopeEpoch;
                const accountEpoch = Number(window.getAccountScopeEpoch?.() || 0);
                const previous = _templateWriteQueues.get(queueUid) || Promise.resolve();
                const next = previous.catch(function() {}).then(function() {
                    if (AccountDataScope.getActiveUid() !== queueUid
                        || _storageScopeEpoch !== queueEpoch
                        || Number(window.getAccountScopeEpoch?.() || 0) !== accountEpoch) return false;
                    return operation();
                });
                let tracked = null;
                tracked = next.finally(function() {
                    if (_templateWriteQueues.get(queueUid) === tracked) _templateWriteQueues.delete(queueUid);
                });
                _templateWriteQueues.set(queueUid, tracked);
                return tracked;
            }

            async function _waitForBooksWriteIdle(uid) {
                const expectedUid = AccountDataScope.normalizeUid(uid);
                const queueEpoch = _storageScopeEpoch;
                const accountEpoch = Number(window.getAccountScopeEpoch?.() || 0);
                while (true) {
                    if (AccountDataScope.getActiveUid() !== expectedUid
                        || _storageScopeEpoch !== queueEpoch
                        || Number(window.getAccountScopeEpoch?.() || 0) !== accountEpoch) return false;
                    const pending = _booksWriteQueues.get(expectedUid);
                    if (!pending) return true;
                    await pending.catch(function() {});
                }
            }

            async function _restoreBooksCacheFromDurable(uid) {
                if (AccountDataScope.getActiveUid() !== uid) return false;
                try {
                    const persisted = await IDB.get(_idbKey(KEYS.BOOKS, uid));
                    if (AccountDataScope.getActiveUid() !== uid) return false;
                    _cache[KEYS.BOOKS] = AccountDataScope.filterOwnedBooks(
                        persisted && typeof persisted === 'object' && !Array.isArray(persisted) ? persisted : {},
                        uid
                    );
                    return true;
                } catch(error) {
                    return false;
                }
            }

            async function _restoreTemplatesCacheFromDurable(uid) {
                if (AccountDataScope.getActiveUid() !== uid) return false;
                try {
                    const persisted = await IDB.get(_idbKey(KEYS.TEMPLATES, uid));
                    if (AccountDataScope.getActiveUid() !== uid) return false;
                    _cache[KEYS.TEMPLATES] = Array.isArray(persisted) ? persisted : [];
                    return true;
                } catch(error) {
                    return false;
                }
            }

            function _uniqueRestoredBookName(baseName, books) {
                const base = String(baseName || '云端作品').trim() || '云端作品';
                let candidate = base + '（云端恢复）';
                let index = 2;
                while (books?.[candidate]) candidate = base + '（云端恢复' + index++ + '）';
                return candidate;
            }

            function _prepareRestoredBookIdentity(bookInput, consumeInput) {
                const book = consumeInput && bookInput && typeof bookInput === 'object'
                    ? bookInput
                    : _cloneStorageValue(bookInput || {});
                delete book._bid;
                delete book.bookId;
                delete book.id;
                delete book._ownerUid;
                (Array.isArray(book.volumes) ? book.volumes : []).forEach(function(volume) {
                    if (!volume || typeof volume !== 'object') return;
                    delete volume._vid;
                    delete volume._v2id;
                    delete volume.id;
                    (Array.isArray(volume.chapters) ? volume.chapters : []).forEach(function(chapter) {
                        if (!chapter || typeof chapter !== 'object') return;
                        delete chapter._localId;
                        delete chapter._cid;
                        delete chapter.id;
                        delete chapter._ownerUid;
                        delete chapter._cloudSyncBaseline;
                        delete chapter._cloudSyncVersion;
                        delete chapter._cloudSyncedAt;
                    });
                });
                return book;
            }

            async function _loadKey(k, uid) {
                try {
                    const storageKey = _idbKey(k, uid);
                    const metaKey = _metaKey(k, uid);
                    let val = await IDB.get(storageKey);
                    let idbReady = val !== undefined && val !== null;
                    const idbMeta = Number(await IDB.get(metaKey) || 0);
                    const raw = localStorage.getItem(storageKey);
                    if (raw) {
                        const localMeta = Number(localStorage.getItem(metaKey) || 0);
                        if (!val || (localMeta && localMeta >= idbMeta)) {
                            const localValue = JSON.parse(raw);
                            const lease = window.ZHIYU_ACCOUNT_WRITE_LEASE;
                            const migrationToken = lease?.beginWrite?.(uid, { silent: true })
                                || (!lease ? { legacy: true, uid } : null);
                            try {
                                if (!migrationToken) throw new Error('当前标签页没有旧存储迁移写入权');
                                const entries = [[storageKey, localValue]];
                                if (localMeta) entries.push([metaKey, localMeta]);
                                if (migrationToken.fenceKey && migrationToken.leaseId) {
                                    await IDB.setManyFenced(entries, migrationToken.fenceKey, migrationToken.leaseId);
                                } else {
                                    await IDB.setMany(entries);
                                }
                                val = localValue;
                                idbReady = true;
                            } catch (e) {
                                val = localValue;
                                idbReady = false;
                            } finally {
                                lease?.endWrite?.(migrationToken);
                            }
                        }
                        if (k === KEYS.BOOKS && idbReady) {
                            localStorage.removeItem(storageKey);
                            localStorage.removeItem(metaKey);
                        }
                    }
                    return { status: 'ok', value: val };
                } catch (e) {
                    return { status: 'error', value: null, error: e };
                }
            }

            async function _loadTemplatesForScope(uid) {
                const ownerUid = AccountDataScope.normalizeUid(uid);
                const scoped = await _loadKey(KEYS.TEMPLATES, ownerUid);
                if (scoped.status !== 'ok' || Array.isArray(scoped.value)) return scoped;
                const legacyKey = PREFIX + KEYS.TEMPLATES;
                const publicKey = legacyKey + '__public_v1';
                const quarantineKey = legacyKey + '__unowned_v1';
                const ownedArchiveKey = legacyKey + '__owned_v1';
                const markerKey = legacyKey + '__scope_migrated_v1';
                try {
                    const marker = await IDB.get(markerKey);
                    if (marker) {
                        const [publicValue, ownedArchiveValue] = await Promise.all([
                            IDB.get(publicKey),
                            IDB.get(ownedArchiveKey)
                        ]);
                        const publicTemplates = Array.isArray(publicValue) ? publicValue : [];
                        const ownedArchive = ownedArchiveValue && typeof ownedArchiveValue === 'object'
                            ? ownedArchiveValue
                            : {};
                        const accountTemplates = publicTemplates.concat(
                            Array.isArray(ownedArchive[ownerUid]) ? ownedArchive[ownerUid] : []
                        );
                        const writeToken = _beginAccountWrite(ownerUid, '旧模板按账号复制');
                        if (!writeToken) throw new Error('当前标签页没有旧模板按账号复制写入权');
                        try {
                            const entries = [[_idbKey(KEYS.TEMPLATES, ownerUid), accountTemplates]];
                            if (writeToken.fenceKey && writeToken.leaseId) {
                                await IDB.setManyFenced(entries, writeToken.fenceKey, writeToken.leaseId);
                            } else {
                                await IDB.setMany(entries);
                            }
                        } finally {
                            _endAccountWrite(writeToken);
                        }
                        return { status: 'ok', value: accountTemplates };
                    }
                    const legacy = await IDB.get(legacyKey);
                    const legacyTemplates = Array.isArray(legacy) ? legacy : [];
                    const publicTemplates = legacyTemplates.filter(function(template) {
                        return template?.builtIn === true
                            || template?.isOfficial === true
                            || template?.isPublic === true;
                    });
                    const unownedPrivate = legacyTemplates.filter(function(template) {
                        return template?.builtIn !== true
                            && template?.isOfficial !== true
                            && template?.isPublic !== true
                            && !String(template?.creatorId || '').trim();
                    }).map(function(template) {
                        return { ...template, ownershipStatus: 'unowned_legacy' };
                    });
                    const privateByOwner = {};
                    legacyTemplates.forEach(function(template) {
                        if (template?.builtIn === true || template?.isOfficial === true || template?.isPublic === true) return;
                        const templateOwner = String(template?.creatorId || '').trim();
                        if (!templateOwner) return;
                        const normalizedOwner = AccountDataScope.normalizeUid(templateOwner);
                        const list = Array.isArray(privateByOwner[normalizedOwner]) ? privateByOwner[normalizedOwner] : [];
                        list.push({ ...template, creatorId: templateOwner });
                        privateByOwner[normalizedOwner] = list;
                    });
                    const accountTemplates = publicTemplates.concat(privateByOwner[ownerUid] || []);
                    const entries = [
                        [publicKey, publicTemplates],
                        [quarantineKey, unownedPrivate],
                        [ownedArchiveKey, privateByOwner],
                        [_idbKey(KEYS.TEMPLATES, ownerUid), accountTemplates],
                        [markerKey, {
                            migratedAt: new Date().toISOString(),
                            source: legacyKey,
                            publicCount: publicTemplates.length,
                            unownedCount: unownedPrivate.length
                        }]
                    ];
                    const writeToken = _beginAccountWrite(ownerUid, '旧模板隔离');
                    if (!writeToken) throw new Error('当前标签页没有旧模板隔离写入权');
                    try {
                        if (writeToken.fenceKey && writeToken.leaseId) {
                            await IDB.setManyFenced(entries, writeToken.fenceKey, writeToken.leaseId);
                        } else {
                            await IDB.setMany(entries);
                        }
                    } finally {
                        _endAccountWrite(writeToken);
                    }
                    return {
                        status: 'ok',
                        value: accountTemplates
                    };
                } catch(error) {
                    return { status: 'error', value: null, error };
                }
            }

            async function _readPersistedMemoryBooks(uid) {
                try {
                    const stored = await IDB.get(_memoryKey(uid));
                    return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
                } catch(error) {
                    return {};
                }
            }

            async function _readPersistedComponent(valueKey, timestampKey) {
                try {
                    return await IDB.mutateKv([valueKey, timestampKey], function(values) {
                        const value = values[valueKey] && typeof values[valueKey] === 'object'
                            && !Array.isArray(values[valueKey])
                            ? _cloneStorageValue(values[valueKey])
                            : {};
                        return {
                            entries: [],
                            result: {
                                value,
                                updatedAt: Number(values[timestampKey] || 0)
                            }
                        };
                    });
                } catch(error) {
                    return { value: {}, updatedAt: 0 };
                }
            }

            async function _persistV1AndV2(options) {
                const uid = String(options.uid || '');
                const v1Entries = Array.isArray(options.v1Entries) ? options.v1Entries : [];
                const writeToken = options.writeToken;
                const writeV1 = function(entries) {
                    if (writeToken?.fenceKey || writeToken?.leaseId) {
                        if (!writeToken?.fenceKey || !writeToken?.leaseId || typeof IDB.setManyFenced !== 'function') {
                            throw new Error('本机事务存储版本过旧，已停止未受围栏保护的保存');
                        }
                        return IDB.setManyFenced(entries, writeToken.fenceKey, writeToken.leaseId);
                    }
                    return IDB.setMany(entries);
                };
                const persistedBooksSnapshot = _snapshotLocalReadValue(options.books);
                const persistedMemorySnapshot = _snapshotLocalReadValue(options.memBooks);
                const booksKey = _idbKey(KEYS.BOOKS, uid);
                const memoryKey = _memoryKey(uid);
                const writesBooks = v1Entries.some(function(entry) {
                    return Array.isArray(entry) && String(entry[0] || '') === booksKey;
                });
                const writesMemory = v1Entries.some(function(entry) {
                    return Array.isArray(entry) && String(entry[0] || '') === memoryKey;
                });
                const rememberPersistedWrite = function() {
                    _rememberPersistedWriteSnapshots(
                        uid,
                        persistedBooksSnapshot,
                        persistedMemorySnapshot,
                        writesBooks,
                        writesMemory
                    );
                };
                const updatedAt = Math.max(
                    Number(options.v1BooksUpdatedAt || 0),
                    Number(options.v1MemoryUpdatedAt || 0),
                    Date.now()
                );
                const dualWriteAllowed = options.dualWriteAllowed !== false
                    && StorageV2
                    && typeof StorageV2.isDualWriteReady === 'function'
                    && StorageV2.isDualWriteReady(uid);
                if (dualWriteAllowed) {
                    try {
                        const dual = await StorageV2.dualWrite({
                            accountId: uid,
                            books: options.books || {},
                            memBooks: options.memBooks || {},
                            v1Entries,
                            timestamps: {
                                v1BooksUpdatedAt: Number(options.v1BooksUpdatedAt || 0),
                                v1MemoryUpdatedAt: Number(options.v1MemoryUpdatedAt || 0)
                            },
                            writerFence: writeToken?.fenceKey && writeToken?.leaseId
                                ? { key: writeToken.fenceKey, leaseId: writeToken.leaseId }
                                : null
                        });
                        if (dual?.participated && dual?.ok) {
                            rememberPersistedWrite();
                            return true;
                        }
                    } catch(error) {
                        if (error?.v1Committed === true) {
                            if (error?.code === 'ACCOUNT_WRITER_FENCE_CHANGED'
                                || !_accountWriteTokenCurrent(writeToken)) {
                                return true;
                            }
                            StorageV2.markNeedsReconcile?.(
                                uid,
                                'V2 收尾校验失败，但旧储存已安全完成保存：' + String(error?.message || error)
                            )?.catch?.(function() {});
                            StorageV2.broadcastV1Updated?.(uid, updatedAt);
                            _scheduleV2Migration(uid);
                            rememberPersistedWrite();
                            return true;
                        }
                        try {
                            await writeV1(v1Entries);
                            if (!_accountWriteTokenCurrent(writeToken)) return false;
                            StorageV2.markNeedsReconcile?.(
                                uid,
                                'V2 双写失败，已安全完成旧储存保存：' + String(error?.message || error)
                            )?.catch?.(function() {});
                            StorageV2.broadcastV1Updated?.(uid, updatedAt);
                            _scheduleV2Migration(uid);
                            rememberPersistedWrite();
                            return true;
                        } catch(v1Error) {
                            return false;
                        }
                    }
                }
                try {
                    await writeV1(v1Entries);
                    StorageV2?.broadcastV1Updated?.(uid, updatedAt);
                    _scheduleV2Migration(uid);
                    rememberPersistedWrite();
                    return true;
                } catch(error) {
                    return false;
                }
            }

            async function _checkV2Freshness(uid) {
                if (!StorageV2 || typeof StorageV2.checkV1Freshness !== 'function') {
                    return { fresh: false, reason: 'v2-unavailable' };
                }
                return StorageV2.checkV1Freshness({ accountId: uid });
            }

            function _clearPreferredV2Memory(uid) {
                if (!uid || _preferredV2Memory.uid === uid) {
                    _preferredV2Memory = { uid: '', value: null, source: '' };
                }
            }

            const LOCAL_READ_SNAPSHOT_CHAR_BUDGET = 4 * 1024 * 1024;
            const _deferredV2MigrationAccounts = new Set();

            function _exceedsLocalReadSnapshotBudget(value) {
                const pending = [value];
                const seen = new WeakSet();
                let characters = 0;
                while (pending.length) {
                    const current = pending.pop();
                    if (typeof current === 'string') {
                        characters += current.length;
                    } else if (current && typeof current === 'object') {
                        if (seen.has(current)) continue;
                        seen.add(current);
                        if (ArrayBuffer.isView(current)) {
                            characters += Number(current.byteLength || 0);
                        } else if (current instanceof ArrayBuffer) {
                            characters += Number(current.byteLength || 0);
                        } else {
                            Object.keys(current).forEach(function(key) {
                                characters += key.length;
                                pending.push(current[key]);
                            });
                        }
                    }
                    if (characters > LOCAL_READ_SNAPSHOT_CHAR_BUDGET) return true;
                }
                return false;
            }

            function _snapshotLocalReadValue(value) {
                const normalized = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
                try {
                    if (_exceedsLocalReadSnapshotBudget(normalized)) return null;
                    if (StorageV2 && typeof StorageV2.orderedValueJson === 'function') {
                        return StorageV2.orderedValueJson(normalized);
                    }
                    return JSON.stringify(normalized);
                } catch(error) {
                    return null;
                }
            }

            function _rememberPersistedSnapshots(uid, booksSnapshot, memorySnapshot) {
                if (!uid || AccountDataScope.getActiveUid() !== uid) return;
                _persistedLocalSnapshot = {
                    uid,
                    books: typeof booksSnapshot === 'string' ? booksSnapshot : null,
                    memory: typeof memorySnapshot === 'string' ? memorySnapshot : null
                };
            }

            function _rememberPersistedValues(uid, books, memBooks) {
                _rememberPersistedSnapshots(
                    uid,
                    _snapshotLocalReadValue(books),
                    _snapshotLocalReadValue(memBooks)
                );
            }

            function _shouldDeferAutomaticV2Migration(uid) {
                if (AccountDataScope.getActiveUid() !== uid) return false;
                if (_exceedsLocalReadSnapshotBudget(_cache[KEYS.BOOKS])) return true;
                if (!_isLiveMemoryReady(uid)) return false;
                try {
                    return _exceedsLocalReadSnapshotBudget(window.getMemBooks());
                } catch(error) {
                    return true;
                }
            }

            function _deferAutomaticV2Migration(uid) {
                if (_v2MigrationTimer) {
                    clearTimeout(_v2MigrationTimer);
                    _v2MigrationTimer = null;
                }
                if (_deferredV2MigrationAccounts.has(uid)) return;
                _deferredV2MigrationAccounts.add(uid);
                StorageV2?.markNeedsReconcile?.(
                    uid,
                    '本机作品或资料较大，已保留完整 V1 并延后 V2 对账，避免页面卡顿'
                )?.catch?.(function() {});
            }

            function _invalidatePersistedValuesAfterRestore(uid) {
                // 大文件恢复后不在主线程重建整库 JSON；未知基线会安全阻止异步回填覆盖恢复结果。
                _rememberPersistedSnapshots(uid, null, null);
            }

            function _rememberPersistedWriteSnapshots(
                uid,
                booksSnapshot,
                memorySnapshot,
                writesBooks,
                writesMemory
            ) {
                if (!uid || AccountDataScope.getActiveUid() !== uid) return;
                const current = _persistedLocalSnapshot.uid === uid
                    ? _persistedLocalSnapshot
                    : {
                        uid,
                        books: typeof booksSnapshot === 'string' ? booksSnapshot : null,
                        memory: typeof memorySnapshot === 'string' ? memorySnapshot : null
                    };
                _persistedLocalSnapshot = {
                    uid,
                    books: writesBooks
                        ? (typeof booksSnapshot === 'string' ? booksSnapshot : null)
                        : current.books,
                    memory: writesMemory
                        ? (typeof memorySnapshot === 'string' ? memorySnapshot : null)
                        : current.memory
                };
            }

            function _isLiveMemoryReady(uid) {
                if (typeof window.getMemBooks !== 'function') return false;
                if (typeof window.isMemBooksReadyForStorageBaseline === 'function') {
                    return window.isMemBooksReadyForStorageBaseline(uid) === true;
                }
                return true;
            }

            function _captureLocalReadBaseline(uid) {
                const persistedBooks = _persistedLocalSnapshot.uid === uid
                    ? _persistedLocalSnapshot.books
                    : undefined;
                const baseline = {
                    uid,
                    books: null,
                    hasLiveMemory: false,
                    memory: '',
                    dirtyAtStart: persistedBooks === undefined || persistedBooks === null
                };
                if (!baseline.dirtyAtStart) {
                    baseline.books = _snapshotLocalReadValue(_cache[KEYS.BOOKS]);
                    if (baseline.books === null || baseline.books !== persistedBooks) {
                        baseline.dirtyAtStart = true;
                    }
                }
                if (AccountDataScope.getActiveUid() === uid && _isLiveMemoryReady(uid)) {
                    const liveMemory = window.getMemBooks();
                    if (liveMemory && typeof liveMemory === 'object' && !Array.isArray(liveMemory)) {
                        baseline.hasLiveMemory = true;
                        const persistedMemory = _persistedLocalSnapshot.uid === uid
                            ? _persistedLocalSnapshot.memory
                            : undefined;
                        if (persistedMemory === undefined || persistedMemory === null) {
                            baseline.dirtyAtStart = true;
                        } else {
                            baseline.memory = _snapshotLocalReadValue(liveMemory);
                            if (baseline.memory === null || baseline.memory !== persistedMemory) {
                                baseline.dirtyAtStart = true;
                            }
                        }
                    }
                }
                return baseline;
            }

            function _localReadBaselineStillCurrent(baseline, expectedEpoch) {
                if (
                    !baseline
                    || baseline.dirtyAtStart
                    || AccountDataScope.getActiveUid() !== baseline.uid
                    || _v2ReadEpoch !== expectedEpoch
                ) return false;
                try {
                    if (_snapshotLocalReadValue(_cache[KEYS.BOOKS]) !== baseline.books) return false;
                    if (!baseline.hasLiveMemory) return true;
                    if (typeof window.getMemBooks !== 'function') return false;
                    return _snapshotLocalReadValue(window.getMemBooks()) === baseline.memory;
                } catch(error) {
                    return false;
                }
            }

            function _localDirtyReadResult() {
                return {
                    ok: false,
                    source: 'memory',
                    reason: 'skipped-local-dirty',
                    applied: false,
                    localDirty: true
                };
            }

            async function _applyV1Fallback(uid, expectedEpoch, baseline) {
                if (!StorageV2 || typeof StorageV2.readMigrationSnapshot !== 'function') {
                    return { applied: false, reason: 'v1-unavailable' };
                }
                try {
                    const snapshot = await StorageV2.readMigrationSnapshot(uid);
                    if (!_localReadBaselineStillCurrent(baseline, expectedEpoch)) {
                        return _localDirtyReadResult();
                    }
                    _cache[KEYS.BOOKS] = AccountDataScope.filterOwnedBooks(
                        snapshot.books && typeof snapshot.books === 'object' ? snapshot.books : {},
                        uid
                    );
                    _preferredV2Memory = {
                        uid,
                        value: _cloneStorageValue(snapshot.memBooks || {}),
                        source: 'v1'
                    };
                    _rememberPersistedValues(uid, _cache[KEYS.BOOKS], snapshot.memBooks || {});
                    window.resetPersistedChapterLocalIds?.();
                    window.markChapterLocalIdsPersisted?.(_cache[KEYS.BOOKS]);
                    try {
                        window.dispatchEvent(new CustomEvent('zhiyu:storage-v1-fallback-ready', {
                            detail: { accountId: uid }
                        }));
                    } catch(error) {}
                    return { applied: true, source: 'v1' };
                } catch(error) {
                    return { applied: false, reason: 'v1-read-failed' };
                }
            }

            async function _refreshV2Preferred(uid) {
                if (!StorageV2 || typeof StorageV2.readPreferredAccount !== 'function') {
                    return { ok: false, source: 'v1', reason: 'v2-unavailable' };
                }
                const expectedUid = String(uid || '');
                const expectedEpoch = _v2ReadEpoch;
                const localBaseline = _captureLocalReadBaseline(expectedUid);
                if (localBaseline.dirtyAtStart) return _localDirtyReadResult();
                const freshness = await _checkV2Freshness(expectedUid);
                if (!freshness?.fresh) {
                    if (freshness?.reason === 'v1-changed') {
                        const fallback = await _applyV1Fallback(expectedUid, expectedEpoch, localBaseline);
                        if (fallback?.localDirty) return fallback;
                        if (!fallback?.applied) _clearPreferredV2Memory(expectedUid);
                    } else {
                        _clearPreferredV2Memory(expectedUid);
                    }
                    _scheduleV2Migration(expectedUid);
                    return { ok: false, source: 'v1', reason: freshness?.reason || 'not-fresh' };
                }
                const preferred = await StorageV2.readPreferredAccount(expectedUid);
                if (!_localReadBaselineStillCurrent(localBaseline, expectedEpoch)) {
                    return _localDirtyReadResult();
                }
                if (
                    !preferred?.ok
                    || preferred.source !== 'v2'
                ) {
                    _clearPreferredV2Memory(expectedUid);
                    if (!preferred?.ok) {
                        const fallback = await _applyV1Fallback(
                            expectedUid,
                            expectedEpoch,
                            localBaseline
                        );
                        if (fallback?.localDirty) return fallback;
                    }
                    if (!preferred?.ok) _scheduleV2Migration(expectedUid);
                    return preferred || { ok: false, source: 'v1', reason: 'preferred-read-failed' };
                }
                if (AccountDataScope.hasForeignBooks(preferred.books, expectedUid)) {
                    await StorageV2.markNeedsReconcile?.(
                        expectedUid,
                        'V2 回建作品包含其他账号数据，已安全使用旧储存'
                    );
                    _clearPreferredV2Memory(expectedUid);
                    _scheduleV2Migration(expectedUid);
                    return { ok: false, source: 'v1', reason: 'foreign-owner' };
                }
                if (_v2MigrationTimer) {
                    clearTimeout(_v2MigrationTimer);
                    _v2MigrationTimer = null;
                }
                _cache[KEYS.BOOKS] = preferred.books;
                _preferredV2Memory = {
                    uid: expectedUid,
                    value: _cloneStorageValue(preferred.memBooks || {}),
                    source: 'v2'
                };
                _rememberPersistedValues(
                    expectedUid,
                    _cache[KEYS.BOOKS],
                    _preferredV2Memory.value
                );
                window.resetPersistedChapterLocalIds?.();
                window.markChapterLocalIdsPersisted?.(_cache[KEYS.BOOKS]);
                try {
                    window.dispatchEvent(new CustomEvent('zhiyu:storage-v2-preferred-ready', {
                        detail: { accountId: expectedUid }
                    }));
                } catch(error) {}
                return Object.assign({}, preferred, { applied: true });
            }

            function _scheduleV2Migration(uid) {
                if (!StorageV2 || typeof StorageV2.scheduleMigration !== 'function') return;
                if (!_assertAccountWriter(uid, { silent: true })) return;
                if (_shouldDeferAutomaticV2Migration(uid)) {
                    _deferAutomaticV2Migration(uid);
                    return;
                }
                _deferredV2MigrationAccounts.delete(uid);
                if (_v2MigrationTimer) clearTimeout(_v2MigrationTimer);
                _v2MigrationTimer = setTimeout(async function() {
                    _v2MigrationTimer = null;
                    if (_shouldDeferAutomaticV2Migration(uid)) {
                        _deferAutomaticV2Migration(uid);
                        return;
                    }
                    const writeToken = _beginAccountWrite(uid, '本机存储升级');
                    if (!writeToken) return;
                    try {
                        const snapshot = await StorageV2.readMigrationSnapshot(uid);
                        if (!_accountWriteTokenCurrent(writeToken)) return;
                        await StorageV2.scheduleMigration({
                            ...snapshot,
                            writerFence: writeToken.fenceKey && writeToken.leaseId
                                ? { key: writeToken.fenceKey, leaseId: writeToken.leaseId }
                                : null
                        });
                    } catch(error) {
                    } finally {
                        _endAccountWrite(writeToken);
                    }
                }, 5000);
            }

            async function init(uid) {
                _storageScopeEpoch += 1;
                _resetBookLifecycleMutations();
                _v2ReadEpoch += 1;
                _clearPreferredV2Memory();
                AccountDataScope.setActiveUid(uid);
                await window.ZHIYU_ACCOUNT_WRITE_LEASE?.ensure?.(uid, { silent: true });
                for (const k of [KEYS.BOOKS, KEYS.TEMPLATES, KEYS.SETTINGS]) {
                    const loaded = k === KEYS.TEMPLATES
                        ? await _loadTemplatesForScope(uid)
                        : await _loadKey(k, uid);
                    if (k === KEYS.BOOKS) _booksReadState = loaded.status === 'ok'
                        ? { status: 'ok', error: '' }
                        : { status: 'error', error: String(loaded.error?.message || loaded.error || 'IndexedDB 读取失败') };
                    _cache[k] = loaded.status === 'ok' ? loaded.value : null;
                }
                if (!_cache[KEYS.BOOKS]) _cache[KEYS.BOOKS] = {};
                _cache[KEYS.BOOKS] = AccountDataScope.filterOwnedBooks(_cache[KEYS.BOOKS], uid);
                const migratedBookIds = window.ensureAllBookStableIds?.(
                    _cache[KEYS.BOOKS],
                    { legacyMissing: true }
                ) || 0;
                if (migratedBookIds > 0) await _save(KEYS.BOOKS, _cache[KEYS.BOOKS]);
                window.resetPersistedChapterLocalIds?.();
                window.markChapterLocalIdsPersisted?.(_cache[KEYS.BOOKS]);
                if (!_cache[KEYS.TEMPLATES]) _cache[KEYS.TEMPLATES] = [];
                if (!_cache[KEYS.SETTINGS]) _cache[KEYS.SETTINGS] = {};
                window.ZHIYU_STORAGE_READ_ONLY = _booksReadState.status === 'error';
                await window.ZHIYU_LARGE_LOCAL_STORE?.init?.(AccountDataScope.getActiveUid(), {
                    aliases: [window.ZHIYU_APP_STATE?.auth?.username || '']
                });
                const activeUid = AccountDataScope.getActiveUid();
                const persistedMemoryBooks = await _readPersistedMemoryBooks(activeUid);
                _rememberPersistedValues(activeUid, _cache[KEYS.BOOKS], persistedMemoryBooks);
                _refreshV2Preferred(activeUid).catch(function() {
                    _scheduleV2Migration(activeUid);
                });
            }

            async function switchScope(uid) {
                _storageScopeEpoch += 1;
                _resetBookLifecycleMutations();
                _v2ReadEpoch += 1;
                _clearPreferredV2Memory();
                if (_v2MigrationTimer) {
                    clearTimeout(_v2MigrationTimer);
                    _v2MigrationTimer = null;
                }
                const nextUid = AccountDataScope.setActiveUid(uid);
                await window.ZHIYU_ACCOUNT_WRITE_LEASE?.ensure?.(nextUid, { silent: true });
                _cache[KEYS.BOOKS] = {};
                _cache[KEYS.TEMPLATES] = [];
                const [booksState, templatesState, persistedMemoryBooks, secureReady, largeReady] = await Promise.all([
                    _loadKey(KEYS.BOOKS, nextUid),
                    _loadTemplatesForScope(nextUid),
                    _readPersistedMemoryBooks(nextUid),
                    SecureStore.switchScope(nextUid),
                    window.ZHIYU_LARGE_LOCAL_STORE?.init?.(nextUid, {
                        aliases: [window.ZHIYU_APP_STATE?.auth?.username || '']
                    }) ?? true
                ]);
                if (AccountDataScope.getActiveUid() !== nextUid) return false;
                if (secureReady === false || largeReady === false || booksState.status !== 'ok'
                    || templatesState.status !== 'ok') {
                    _booksReadState = {
                        status: 'error',
                        error: booksState.status === 'ok' ? '大文本存储初始化失败' : String(booksState.error?.message || booksState.error || 'IndexedDB 读取失败')
                    };
                    window.ZHIYU_STORAGE_READ_ONLY = true;
                    return false;
                }
                _booksReadState = { status: 'ok', error: '' };
                window.ZHIYU_STORAGE_READ_ONLY = false;
                const books = booksState.value;
                _cache[KEYS.BOOKS] = AccountDataScope.filterOwnedBooks(books && typeof books === 'object' && !Array.isArray(books) ? books : {}, nextUid);
                _cache[KEYS.TEMPLATES] = Array.isArray(templatesState.value) ? templatesState.value : [];
                const migratedBookIds = window.ensureAllBookStableIds?.(
                    _cache[KEYS.BOOKS],
                    { legacyMissing: true }
                ) || 0;
                if (migratedBookIds > 0 && _assertAccountWriter(nextUid, { silent: true })) {
                    await _save(KEYS.BOOKS, _cache[KEYS.BOOKS]);
                }
                _rememberPersistedValues(nextUid, _cache[KEYS.BOOKS], persistedMemoryBooks);
                window.resetPersistedChapterLocalIds?.();
                window.markChapterLocalIdsPersisted?.(_cache[KEYS.BOOKS]);
                const preferred = await _refreshV2Preferred(nextUid);
                if (!preferred?.ok) _clearPreferredV2Memory(nextUid);
                return true;
            }

            async function reloadCurrentAccountData(uid) {
                const expectedUid = AccountDataScope.normalizeUid(uid);
                if (!expectedUid || AccountDataScope.getActiveUid() !== expectedUid) return false;
                _storageScopeEpoch += 1;
                _resetBookLifecycleMutations();
                _v2ReadEpoch += 1;
                _clearPreferredV2Memory(expectedUid);
                if (_v2MigrationTimer) {
                    clearTimeout(_v2MigrationTimer);
                    _v2MigrationTimer = null;
                }
                try {
                    const booksKey = _idbKey(KEYS.BOOKS, expectedUid);
                    const memoryKey = _memoryKey(expectedUid);
                    const [persistedBooks, persistedTemplates, persistedMemory, largeReady] = await Promise.all([
                        IDB.get(booksKey),
                        IDB.get(_idbKey(KEYS.TEMPLATES, expectedUid)),
                        IDB.get(memoryKey),
                        window.ZHIYU_LARGE_LOCAL_STORE?.init?.(expectedUid, {
                            aliases: [window.ZHIYU_APP_STATE?.auth?.username || '']
                        }) ?? true
                    ]);
                    if (AccountDataScope.getActiveUid() !== expectedUid || largeReady === false) return false;
                    const books = persistedBooks && typeof persistedBooks === 'object' && !Array.isArray(persistedBooks)
                        ? AccountDataScope.filterOwnedBooks(persistedBooks, expectedUid)
                        : {};
                    const memBooks = persistedMemory && typeof persistedMemory === 'object' && !Array.isArray(persistedMemory)
                        ? persistedMemory
                        : {};
                    const templates = Array.isArray(persistedTemplates) ? persistedTemplates : [];
                    _cache[KEYS.BOOKS] = books;
                    _cache[KEYS.TEMPLATES] = templates;
                    _booksReadState = { status: 'ok', error: '' };
                    window.ZHIYU_STORAGE_READ_ONLY = false;
                    _rememberPersistedValues(expectedUid, books, memBooks);
                    window.resetPersistedChapterLocalIds?.();
                    window.markChapterLocalIdsPersisted?.(books);
                    return { books, memBooks, templates };
                } catch(error) {
                    _booksReadState = { status: 'error', error: String(error?.message || error || 'IndexedDB 读取失败') };
                    window.ZHIYU_STORAGE_READ_ONLY = true;
                    return false;
                }
            }

            async function _save(key, val, options) {
                const uid = AccountDataScope.getActiveUid();
                const suppliedWriteToken = options?.writeToken;
                const reuseWriteToken = !!suppliedWriteToken && _accountWriteTokenCurrent(suppliedWriteToken);
                const writeToken = reuseWriteToken
                    ? suppliedWriteToken
                    : _beginAccountWrite(uid, key === KEYS.BOOKS ? '作品保存' : '设置保存');
                if (!writeToken) return false;
                try {
                    const now = _nextWriteTimestamp();
                    let ok = false;
                    const atomicEntries = _normalizeCloudOutboxRecords(options?.atomicRecords, uid);
                    if (key === KEYS.BOOKS) AccountDataScope.stampBooks(val, uid);
                    if (key === KEYS.BOOKS) {
                        _v2ReadEpoch += 1;
                        _clearPreferredV2Memory(uid);
                    }
                    const storageKey = _idbKey(key, uid);
                    const metaKey = _metaKey(key, uid);
                    try {
                        if (!_accountWriteTokenCurrent(writeToken)) return false;
                        if (key === KEYS.BOOKS) {
                            const persistedMemory = await _readPersistedComponent(
                                _memoryKey(uid),
                                _memoryMetaKey(uid)
                            );
                            if (!_accountWriteTokenCurrent(writeToken)) return false;
                            ok = await _persistV1AndV2({
                                uid,
                                books: val,
                                memBooks: persistedMemory.value,
                                v1Entries: [[storageKey, val], [metaKey, now]].concat(atomicEntries),
                                v1BooksUpdatedAt: now,
                                v1MemoryUpdatedAt: persistedMemory.updatedAt,
                                writeToken
                            });
                            if (ok && !_accountWriteTokenCurrent(writeToken)) return false;
                        } else {
                            if (writeToken?.fenceKey && writeToken?.leaseId) {
                                await IDB.setManyFenced(
                                    [[storageKey, val], [metaKey, now]],
                                    writeToken.fenceKey,
                                    writeToken.leaseId
                                );
                            } else {
                                await IDB.setMany([[storageKey, val], [metaKey, now]]);
                            }
                            if (!_accountWriteTokenCurrent(writeToken)) return false;
                            ok = true;
                        }
                        try { localStorage.removeItem(storageKey); localStorage.removeItem(metaKey); } catch(e3) {}
                    } catch (e) {}
                    return ok;
                } finally {
                    if (!reuseWriteToken) _endAccountWrite(writeToken);
                }
            }

            return {
                init,
                switchScope,
                reloadCurrentAccountData,
                waitForBooksWriteIdle: _waitForBooksWriteIdle,
                getBooks() { return _cache[KEYS.BOOKS] || {}; },
                saveBooks(b, options) {
                    const uid = AccountDataScope.getActiveUid();
                    const settings = options && typeof options === 'object' ? options : {};
                    const stagedBooks = _cloneStorageValue(b || {});
                    const lifecycleSequence = _bookLifecycleSequence;
                    return _enqueueBooksWrite(uid, async function() {
                    const suppliedWriteToken = settings.writeToken;
                    if (!_accountWriteTokenCurrent(suppliedWriteToken) && !_assertAccountWriter(uid)) {
                        return Promise.resolve(false);
                    }
                    if (_booksReadState.status === 'error') {
                        console.error('作品存储处于只读保护状态，已拒绝覆盖：', _booksReadState.error);
                        return Promise.resolve(false);
                    }
                    const preparedBooks = settings.source === 'book-lifecycle'
                        ? stagedBooks
                        : _rebaseSnapshotsAfterLifecycle(stagedBooks, null, uid, lifecycleSequence).books;
                    if (AccountDataScope.hasForeignBooks(preparedBooks, uid)) return false;
                    window.ensureAllBookStableIds?.(preparedBooks);
                    window.ensureAllChapterLocalIds?.(preparedBooks);
                    AccountDataScope.stampBooks(preparedBooks, uid);
                    const previousBooks = _persistedLocalSnapshot.uid === uid
                        ? _parsePersistedSnapshot(_persistedLocalSnapshot.books)
                        : null;
                    const atomicRecords = window.ZHIYU_COMMUNITY_MODE === true || settings.cloudWrite === 'suppress'
                        ? []
                        : (window.prepareCloudBookOutboxRecords?.(preparedBooks, previousBooks, uid, settings) || []);
                    return _save(KEYS.BOOKS, preparedBooks, { atomicRecords, writeToken: suppliedWriteToken }).then(async function(ok) {
                        if (ok) {
                            _cache[KEYS.BOOKS] = preparedBooks;
                            if (settings.lifecycleMutation) _recordBookLifecycleMutation(uid, settings.lifecycleMutation);
                            window.markChapterLocalIdsPersisted?.(preparedBooks);
                            if (window.ZHIYU_COMMUNITY_MODE !== true && atomicRecords.length) {
                                window.scheduleCloudWriteOutboxDrain?.(uid);
                            }
                        } else {
                            await _restoreBooksCacheFromDurable(uid);
                        }
                        return ok;
                    });
                    });
                },
                commitBooksAndMemory(books, memoryKey, memBooks, expectedUid, atomicRecords, options) {
                    const queueUid = String(expectedUid || '');
                    const settings = options && typeof options === 'object' ? options : {};
                    const stagedBooks = _cloneStorageValue(books || {});
                    const stagedMemBooks = _cloneStorageValue(memBooks || {});
                    const stagedAtomicRecords = _cloneStorageValue(Array.isArray(atomicRecords) ? atomicRecords : []);
                    const lifecycleSequence = _bookLifecycleSequence;
                    return _enqueueBooksWrite(queueUid, async function() {
                    _v2ReadEpoch += 1;
                    _clearPreferredV2Memory(String(expectedUid || ''));
                    const uid = AccountDataScope.getActiveUid();
                    if (_booksReadState.status === 'error') {
                        console.error('作品存储处于只读保护状态，已拒绝批量覆盖：', _booksReadState.error);
                        return false;
                    }
                    if (!expectedUid || uid !== expectedUid) return false;
                    const prepared = settings.source === 'book-lifecycle'
                        ? { books: stagedBooks, memBooks: stagedMemBooks }
                        : _rebaseSnapshotsAfterLifecycle(stagedBooks, stagedMemBooks, uid, lifecycleSequence);
                    const preparedBooks = prepared.books;
                    const preparedMemBooks = prepared.memBooks || {};
                    if (AccountDataScope.hasForeignBooks(preparedBooks, uid)) return false;
                    const writeToken = _beginAccountWrite(uid, '作品与资料原子保存');
                    if (!writeToken) return false;
                    try {
                        window.ensureAllBookStableIds?.(preparedBooks);
                        window.ensureAllChapterLocalIds?.(preparedBooks);
                        AccountDataScope.stampBooks(preparedBooks, uid);
                        const now = _nextWriteTimestamp();
                        const booksKey = _idbKey(KEYS.BOOKS, uid);
                        const memoryStorageKey = String(memoryKey || _memoryKey(uid));
                        const memoryMetaKey = memoryStorageKey + '_updated_at';
                        const entries = [
                            [booksKey, preparedBooks],
                            [_metaKey(KEYS.BOOKS, uid), now],
                            [memoryStorageKey, preparedMemBooks],
                            [memoryMetaKey, now]
                        ];
                        stagedAtomicRecords.forEach(function(record) {
                            if (record && record.key) entries.push([String(record.key), record.value]);
                        });
                        if (!_accountWriteTokenCurrent(writeToken)) return false;
                        const saved = await _persistV1AndV2({
                            uid,
                            books: preparedBooks,
                            memBooks: preparedMemBooks,
                            v1Entries: entries,
                            v1BooksUpdatedAt: now,
                            v1MemoryUpdatedAt: now,
                            writeToken
                        });
                        if (!saved || !_accountWriteTokenCurrent(writeToken)) return false;
                        if (AccountDataScope.getActiveUid() !== expectedUid) return false;
                        _cache[KEYS.BOOKS] = preparedBooks;
                        if (settings.lifecycleMutation) _recordBookLifecycleMutation(uid, settings.lifecycleMutation);
                        window.markChapterLocalIdsPersisted?.(preparedBooks);
                        try { localStorage.removeItem(booksKey); localStorage.removeItem(_metaKey(KEYS.BOOKS, uid)); } catch(e) {}
                        return { booksCacheCurrent: true, memBooks: preparedMemBooks };
                    } catch(e) {
                        return false;
                    } finally {
                        _endAccountWrite(writeToken);
                    }
                    });
                },
                commitCreatedBookAndMemory(options) {
                    const settings = options && typeof options === 'object' ? options : {};
                    const expectedUid = String(settings.expectedUid || '');
                    const bookName = String(settings.bookName || '').trim();
                    const memoryKey = String(settings.memoryKey || AccountDataScope.key('mem_books', expectedUid));
                    const receiptKey = String(settings.receiptKey || '');
                    const stagedBook = _cloneStorageValue(settings.book || {});
                    const stagedMemBook = _cloneStorageValue(settings.memBook || {});
                    const stagedReceipt = _cloneStorageValue(settings.receipt || {});
                    const stagedResultHash = _fullAnalysisMemoryHash(
                        bookName,
                        stagedMemBook,
                        stagedReceipt.resultFileNames
                    );
                    _v2ReadEpoch += 1;
                    _clearPreferredV2Memory(expectedUid);
                    if (!expectedUid || AccountDataScope.getActiveUid() !== expectedUid || !bookName || !receiptKey) return false;
                    if (_booksReadState.status === 'error' || typeof IDB.mutateKvFenced !== 'function') return false;
                    if (AccountDataScope.hasForeignBooks({ [bookName]: stagedBook }, expectedUid)) return false;
                    if (!stagedResultHash || stagedResultHash !== String(stagedReceipt.resultHash || '')) {
                        const error = new Error('全文分析文件内容与保存回执不一致，已停止写入');
                        error.code = 'FULL_ANALYSIS_SAVE_HASH_MISMATCH';
                        throw error;
                    }
                    const booksKey = _idbKey(KEYS.BOOKS, expectedUid);
                    const booksMetaKey = _metaKey(KEYS.BOOKS, expectedUid);
                    const memoryMetaKey = memoryKey + '_updated_at';
                    return _enqueueBooksWrite(expectedUid, async function() {
                    const writeToken = _beginAccountWrite(expectedUid, '新作品与资料原子保存');
                    if (!writeToken) return false;
                    try {
                    if (!_accountWriteTokenCurrent(writeToken)) return false;
                    const committed = await IDB.mutateKvFenced(
                        [booksKey, booksMetaKey, memoryKey, memoryMetaKey, receiptKey],
                        writeToken.fenceKey,
                        writeToken.leaseId,
                        function(values) {
                            const latestBooks = values[booksKey] && typeof values[booksKey] === 'object'
                                && !Array.isArray(values[booksKey])
                                ? _cloneStorageValue(values[booksKey])
                                : {};
                            const latestMemBooks = values[memoryKey] && typeof values[memoryKey] === 'object'
                                && !Array.isArray(values[memoryKey])
                                ? _cloneStorageValue(values[memoryKey])
                                : {};
                            const existingReceipt = values[receiptKey] && typeof values[receiptKey] === 'object'
                                ? values[receiptKey]
                                : null;
                            if (existingReceipt) {
                                const sameReceipt = String(existingReceipt.taskId || '') === String(stagedReceipt.taskId || '')
                                    && String(existingReceipt.resultHash || '') === String(stagedReceipt.resultHash || '')
                                    && String(existingReceipt.bookName || '') === bookName;
                                const existingBook = latestBooks[bookName];
                                const existingMemory = latestMemBooks[bookName];
                                const sameBook = !!existingBook
                                    && String(existingBook._bid || '') === String(existingReceipt.bookId || '');
                                if (!sameReceipt || !sameBook || !existingMemory) {
                                    const error = new Error('检测到不一致的全文分析保存回执，已停止覆盖本机作品');
                                    error.code = 'FULL_ANALYSIS_SAVE_RECEIPT_CONFLICT';
                                    throw error;
                                }
                                return {
                                    entries: [],
                                    result: {
                                        persisted: true,
                                        idempotent: true,
                                        bookName,
                                        bookId: String(existingBook._bid || ''),
                                        receipt: _cloneStorageValue(existingReceipt),
                                        books: latestBooks,
                                        memBooks: latestMemBooks
                                    }
                                };
                            }
                            if (Object.prototype.hasOwnProperty.call(latestBooks, bookName)
                                || Object.prototype.hasOwnProperty.call(latestMemBooks, bookName)) {
                                const error = new Error('该作品名已存在，请换一个新的作品名称');
                                error.code = 'FULL_ANALYSIS_BOOK_NAME_EXISTS';
                                throw error;
                            }
                            latestBooks[bookName] = _cloneStorageValue(stagedBook);
                            latestMemBooks[bookName] = _cloneStorageValue(stagedMemBook);
                            window.ensureAllBookStableIds?.(latestBooks);
                            window.ensureAllChapterLocalIds?.(latestBooks);
                            AccountDataScope.stampBooks(latestBooks, expectedUid);
                            const storedBook = latestBooks[bookName];
                            const receipt = Object.assign({}, stagedReceipt, {
                                bookName,
                                bookId: String(storedBook?._bid || ''),
                                committedAt: new Date().toISOString()
                            });
                            const now = _nextWriteTimestamp();
                            return {
                                entries: [
                                    [booksKey, latestBooks],
                                    [booksMetaKey, now],
                                    [memoryKey, latestMemBooks],
                                    [memoryMetaKey, now],
                                    [receiptKey, receipt]
                                ],
                                result: {
                                    persisted: true,
                                    idempotent: false,
                                    bookName,
                                    bookId: String(storedBook?._bid || ''),
                                    receipt,
                                    books: latestBooks,
                                    memBooks: latestMemBooks
                                }
                            };
                        }
                    );
                    if (!committed?.persisted || !_accountWriteTokenCurrent(writeToken)) return false;
                    _invalidatePersistedValuesAfterRestore(expectedUid);
                    StorageV2?.markNeedsReconcile?.(
                        expectedUid,
                        '已新增本机全文分析作品，V2 将从完整 V1 重新对账'
                    )?.catch?.(function() {});
                    StorageV2?.broadcastV1Updated?.(
                        expectedUid,
                        Number(await IDB.get(booksMetaKey).catch(function() { return Date.now(); }) || Date.now())
                    );
                    const cacheCurrent = AccountDataScope.getActiveUid() === expectedUid;
                    if (cacheCurrent) {
                        _cache[KEYS.BOOKS] = committed.books;
                        window.markChapterLocalIdsPersisted?.(committed.books);
                        try {
                            localStorage.removeItem(booksKey);
                            localStorage.removeItem(booksMetaKey);
                        } catch(e) {}
                        _scheduleV2Migration(expectedUid);
                    }
                    return Object.assign({}, committed, { booksCacheCurrent: cacheCurrent });
                    } finally {
                        _endAccountWrite(writeToken);
                    }
                    });
                },
                commitRestoredCopy(options) {
                    const settings = options && typeof options === 'object' ? options : {};
                    const expectedUid = String(settings.expectedUid || '');
                    _v2ReadEpoch += 1;
                    _clearPreferredV2Memory(expectedUid);
                    if (!expectedUid || AccountDataScope.getActiveUid() !== expectedUid) return false;
                    if (_booksReadState.status === 'error' || typeof IDB.mutateKv !== 'function') return false;
                    const booksKey = _idbKey(KEYS.BOOKS, expectedUid);
                    const booksMetaKey = _metaKey(KEYS.BOOKS, expectedUid);
                    const memoryKey = String(settings.memoryKey || AccountDataScope.key('mem_books', expectedUid));
                    const memoryMetaKey = memoryKey + '_updated_at';
                    const sourceBookName = String(settings.sourceBookName || settings.preferredName || '云端作品');
                    const stagedBook = _cloneStorageValue(settings.restoredBook || {});
                    const stagedMemBook = _cloneStorageValue(settings.restoredMemBook || {});
                    const includeMemory = settings.includeMemory === true;
                    if (AccountDataScope.hasForeignBooks({ [sourceBookName]: stagedBook }, expectedUid)) {
                        return false;
                    }
                    return _enqueueBooksWrite(expectedUid, async function() {
                    const writeToken = _beginAccountWrite(expectedUid, '云端恢复副本');
                    if (!writeToken) return false;
                    try {
                    if (!_accountWriteTokenCurrent(writeToken)) return false;
                    const committed = await IDB.mutateKvFenced(
                        [booksKey, booksMetaKey, memoryKey, memoryMetaKey],
                        writeToken.fenceKey,
                        writeToken.leaseId,
                        function(values) {
                            const latestBooks = values[booksKey] && typeof values[booksKey] === 'object'
                                && !Array.isArray(values[booksKey])
                                ? _cloneStorageValue(values[booksKey])
                                : {};
                            const latestMemBooks = values[memoryKey] && typeof values[memoryKey] === 'object'
                                && !Array.isArray(values[memoryKey])
                                ? _cloneStorageValue(values[memoryKey])
                                : {};
                            if (AccountDataScope.hasForeignBooks(latestBooks, expectedUid)) {
                                throw new Error('本机作品包含其他账号的数据，已拒绝创建恢复副本');
                            }
                            const finalBookName = _uniqueRestoredBookName(sourceBookName, latestBooks);
                            const restoredBook = _cloneStorageValue(stagedBook);
                            restoredBook.name = finalBookName;
                            latestBooks[finalBookName] = restoredBook;
                            if (includeMemory) latestMemBooks[finalBookName] = _cloneStorageValue(stagedMemBook);
                            window.ensureAllBookStableIds?.(latestBooks);
                            window.ensureAllChapterLocalIds?.(latestBooks);
                            AccountDataScope.stampBooks(latestBooks, expectedUid);
                            const now = _nextWriteTimestamp();
                            return {
                                entries: [
                                    [booksKey, latestBooks],
                                    [booksMetaKey, now],
                                    [memoryKey, latestMemBooks],
                                    [memoryMetaKey, now]
                                ],
                                result: {
                                    persisted: true,
                                    finalBookName,
                                    restoredBookId: String(restoredBook._bid || ''),
                                    books: latestBooks,
                                    memBooks: latestMemBooks
                                }
                            };
                        }
                    );
                    if (!committed?.persisted) return false;
                    _invalidatePersistedValuesAfterRestore(expectedUid);
                    StorageV2?.markNeedsReconcile?.(
                        expectedUid,
                        '已新增云端恢复副本，V2 将从完整 V1 重新对账'
                    )?.catch?.(function() {});
                    StorageV2?.broadcastV1Updated?.(
                        expectedUid,
                        Number(await IDB.get(booksMetaKey).catch(function() { return Date.now(); }) || Date.now())
                    );
                    if (AccountDataScope.getActiveUid() === expectedUid) {
                        _scheduleV2Migration(expectedUid);
                    }
                    const cacheCurrent = AccountDataScope.getActiveUid() === expectedUid;
                    if (cacheCurrent) {
                        _cache[KEYS.BOOKS] = committed.books;
                        window.markChapterLocalIdsPersisted?.(committed.books);
                        try {
                            localStorage.removeItem(booksKey);
                            localStorage.removeItem(booksMetaKey);
                        } catch(e) {}
                    }
                    return Object.assign({}, committed, { booksCacheCurrent: cacheCurrent });
                    } finally {
                        _endAccountWrite(writeToken);
                    }
                    });
                },
                commitRestoredCopies(options) {
                    const settings = options && typeof options === 'object' ? options : {};
                    const expectedUid = String(settings.expectedUid || '');
                    const copies = Array.isArray(settings.copies) ? settings.copies : [];
                    const consumeCopies = settings.consumeCopies === true;
                    _v2ReadEpoch += 1;
                    _clearPreferredV2Memory(expectedUid);
                    if (!expectedUid || AccountDataScope.getActiveUid() !== expectedUid) return false;
                    if (!copies.length || _booksReadState.status === 'error'
                        || typeof IDB.mutateKv !== 'function') return false;
                    const booksKey = _idbKey(KEYS.BOOKS, expectedUid);
                    const booksMetaKey = _metaKey(KEYS.BOOKS, expectedUid);
                    const memoryKey = String(settings.memoryKey || AccountDataScope.key('mem_books', expectedUid));
                    const memoryMetaKey = memoryKey + '_updated_at';
                    const staged = copies.map(function(copy) {
                        const sourceBookName = String(
                            copy?.sourceBookName
                            || copy?.preferredName
                            || copy?.restoredBook?.name
                            || '云端作品'
                        );
                        const restoredBook = _prepareRestoredBookIdentity(
                            copy?.restoredBook || {},
                            consumeCopies
                        );
                        if (AccountDataScope.hasForeignBooks({ [sourceBookName]: restoredBook }, expectedUid)) {
                            throw new Error('云端恢复内容包含其他账号的数据，已拒绝创建副本');
                        }
                        return {
                            sourceBookName,
                            restoredBook,
                            restoredMemBook: consumeCopies
                                ? (copy?.restoredMemBook || {})
                                : _cloneStorageValue(copy?.restoredMemBook || {}),
                            includeMemory: copy?.includeMemory === true
                        };
                    });
                    return _enqueueBooksWrite(expectedUid, async function() {
                    const writeToken = _beginAccountWrite(expectedUid, '批量云端恢复副本');
                    if (!writeToken) return false;
                    try {
                    if (!_accountWriteTokenCurrent(writeToken)) return false;
                    const committed = await IDB.mutateKvFenced(
                        [booksKey, booksMetaKey, memoryKey, memoryMetaKey],
                        writeToken.fenceKey,
                        writeToken.leaseId,
                        function(values) {
                            const latestBooks = values[booksKey] && typeof values[booksKey] === 'object'
                                && !Array.isArray(values[booksKey])
                                ? values[booksKey]
                                : {};
                            const latestMemBooks = values[memoryKey] && typeof values[memoryKey] === 'object'
                                && !Array.isArray(values[memoryKey])
                                ? values[memoryKey]
                                : {};
                            if (AccountDataScope.hasForeignBooks(latestBooks, expectedUid)) {
                                throw new Error('本机作品包含其他账号的数据，已拒绝创建恢复副本');
                            }
                            const restored = [];
                            staged.forEach(function(copy) {
                                const finalBookName = _uniqueRestoredBookName(
                                    copy.sourceBookName,
                                    latestBooks
                                );
                                const restoredBook = consumeCopies
                                    ? copy.restoredBook
                                    : _cloneStorageValue(copy.restoredBook);
                                restoredBook.name = finalBookName;
                                latestBooks[finalBookName] = restoredBook;
                                if (copy.includeMemory) {
                                    latestMemBooks[finalBookName] = consumeCopies
                                        ? copy.restoredMemBook
                                        : _cloneStorageValue(copy.restoredMemBook);
                                }
                                restored.push({
                                    sourceBookName: copy.sourceBookName,
                                    finalBookName,
                                    restoredBook
                                });
                            });
                            window.ensureAllBookStableIds?.(latestBooks);
                            window.ensureAllChapterLocalIds?.(latestBooks);
                            AccountDataScope.stampBooks(latestBooks, expectedUid);
                            const now = _nextWriteTimestamp();
                            return {
                                entries: [
                                    [booksKey, latestBooks],
                                    [booksMetaKey, now],
                                    [memoryKey, latestMemBooks],
                                    [memoryMetaKey, now]
                                ],
                                result: {
                                    persisted: true,
                                    restored: restored.map(function(item) {
                                        return {
                                            sourceBookName: item.sourceBookName,
                                            finalBookName: item.finalBookName,
                                            restoredBookId: String(
                                                latestBooks[item.finalBookName]?._bid || ''
                                            )
                                        };
                                    }),
                                    books: latestBooks,
                                    memBooks: latestMemBooks
                                }
                            };
                        }
                    );
                    if (!committed?.persisted) return false;
                    _invalidatePersistedValuesAfterRestore(expectedUid);
                    StorageV2?.markNeedsReconcile?.(
                        expectedUid,
                        '已新增轻量云端恢复副本，V2 将从完整 V1 重新对账'
                    )?.catch?.(function() {});
                    StorageV2?.broadcastV1Updated?.(
                        expectedUid,
                        Number(await IDB.get(booksMetaKey).catch(function() {
                            return Date.now();
                        }) || Date.now())
                    );
                    if (AccountDataScope.getActiveUid() === expectedUid) {
                        _cache[KEYS.BOOKS] = committed.books;
                        window.markChapterLocalIdsPersisted?.(committed.books);
                        _scheduleV2Migration(expectedUid);
                        try {
                            localStorage.removeItem(booksKey);
                            localStorage.removeItem(booksMetaKey);
                        } catch(error) {}
                    }
                    return Object.assign({}, committed, {
                        booksCacheCurrent: AccountDataScope.getActiveUid() === expectedUid
                    });
                    } finally {
                        _endAccountWrite(writeToken);
                    }
                    });
                },
                rollbackRestoredCopy(options) {
                    const settings = options && typeof options === 'object' ? options : {};
                    const expectedUid = String(settings.expectedUid || '');
                    _v2ReadEpoch += 1;
                    _clearPreferredV2Memory(expectedUid);
                    const bookName = String(settings.bookName || '');
                    const bookId = String(settings.bookId || '');
                    if (!expectedUid || !bookName || !bookId || typeof IDB.mutateKv !== 'function') return false;
                    const booksKey = _idbKey(KEYS.BOOKS, expectedUid);
                    const booksMetaKey = _metaKey(KEYS.BOOKS, expectedUid);
                    const memoryKey = String(settings.memoryKey || AccountDataScope.key('mem_books', expectedUid));
                    const memoryMetaKey = memoryKey + '_updated_at';
                    if (AccountDataScope.getActiveUid() !== expectedUid) return false;
                    return _enqueueBooksWrite(expectedUid, async function() {
                    const writeToken = _beginAccountWrite(expectedUid, '回滚恢复副本');
                    if (!writeToken) return false;
                    try {
                    if (!_accountWriteTokenCurrent(writeToken)) return false;
                    const rolledBack = await IDB.mutateKvFenced(
                        [booksKey, booksMetaKey, memoryKey, memoryMetaKey],
                        writeToken.fenceKey,
                        writeToken.leaseId,
                        function(values) {
                            const latestBooks = values[booksKey] && typeof values[booksKey] === 'object'
                                && !Array.isArray(values[booksKey])
                                ? _cloneStorageValue(values[booksKey])
                                : {};
                            const latestMemBooks = values[memoryKey] && typeof values[memoryKey] === 'object'
                                && !Array.isArray(values[memoryKey])
                                ? _cloneStorageValue(values[memoryKey])
                                : {};
                            const candidate = latestBooks[bookName];
                            if (!candidate || String(candidate._bid || '') !== bookId) {
                                return { entries: [], result: { removed: false, books: latestBooks, memBooks: latestMemBooks } };
                            }
                            delete latestBooks[bookName];
                            delete latestMemBooks[bookName];
                            const now = _nextWriteTimestamp();
                            return {
                                entries: [
                                    [booksKey, latestBooks],
                                    [booksMetaKey, now],
                                    [memoryKey, latestMemBooks],
                                    [memoryMetaKey, now]
                                ],
                                result: { removed: true, books: latestBooks, memBooks: latestMemBooks }
                            };
                        }
                    );
                    if (!rolledBack?.removed) return false;
                    _invalidatePersistedValuesAfterRestore(expectedUid);
                    StorageV2?.markNeedsReconcile?.(
                        expectedUid,
                        '已回滚云端恢复副本，V2 将从完整 V1 重新对账'
                    )?.catch?.(function() {});
                    StorageV2?.broadcastV1Updated?.(
                        expectedUid,
                        Number(await IDB.get(booksMetaKey).catch(function() { return Date.now(); }) || Date.now())
                    );
                    if (AccountDataScope.getActiveUid() === expectedUid) {
                        _cache[KEYS.BOOKS] = rolledBack.books;
                        window.markChapterLocalIdsPersisted?.(rolledBack.books);
                        _scheduleV2Migration(expectedUid);
                    }
                    return rolledBack;
                    } finally {
                        _endAccountWrite(writeToken);
                    }
                    });
                },
                saveMemoryBooks(memBooks, expectedUid, options) {
                    const queueUid = String(expectedUid || '');
                    const settings = options && typeof options === 'object' ? options : {};
                    const stagedBooksForMemory = _cloneStorageValue(_cache[KEYS.BOOKS] || {});
                    const stagedMemBooks = _cloneStorageValue(
                        memBooks && typeof memBooks === 'object' && !Array.isArray(memBooks) ? memBooks : {}
                    );
                    const lifecycleSequence = _bookLifecycleSequence;
                    return _enqueueBooksWrite(queueUid, async function() {
                    _v2ReadEpoch += 1;
                    _clearPreferredV2Memory(String(expectedUid || ''));
                    const uid = AccountDataScope.getActiveUid();
                    if (!expectedUid || uid !== expectedUid) return false;
                    const writeToken = _beginAccountWrite(uid, '资料保存');
                    if (!writeToken) return false;
                    try {
                    const value = settings.source === 'book-lifecycle'
                        ? stagedMemBooks
                        : (_rebaseSnapshotsAfterLifecycle(stagedBooksForMemory, stagedMemBooks, uid, lifecycleSequence).memBooks || {});
                    const previousMemory = _persistedLocalSnapshot.uid === uid
                        ? _parsePersistedSnapshot(_persistedLocalSnapshot.memory)
                        : null;
                    const atomicRecords = window.ZHIYU_COMMUNITY_MODE === true || settings.cloudWrite === 'suppress'
                        ? []
                        : (window.prepareCloudMemoryOutboxRecords?.(value, previousMemory, uid, settings) || []);
                    const booksKey = _idbKey(KEYS.BOOKS, uid);
                    const persistedBooks = await _readPersistedComponent(
                        booksKey,
                        _metaKey(KEYS.BOOKS, uid)
                    );
                    const books = persistedBooks.value;
                    if (!_accountWriteTokenCurrent(writeToken)) return false;
                    const now = _nextWriteTimestamp();
                    const dualWriteAllowed = !AccountDataScope.hasForeignBooks(books, uid);
                    const saved = await _persistV1AndV2({
                        uid,
                        books,
                        memBooks: value,
                        v1Entries: [[_memoryKey(uid), value], [_memoryMetaKey(uid), now]].concat(
                            _normalizeCloudOutboxRecords(atomicRecords, uid)
                        ),
                        v1BooksUpdatedAt: persistedBooks.updatedAt,
                        v1MemoryUpdatedAt: now,
                        dualWriteAllowed,
                        writeToken
                    });
                    if (saved && !_accountWriteTokenCurrent(writeToken)) return false;
                    if (saved && !dualWriteAllowed) {
                        StorageV2?.markNeedsReconcile?.(
                            uid,
                            '作品所有权需要人工核对，本次资料已安全保存到旧储存'
                        )?.catch?.(function() {});
                    }
                    if (saved && window.ZHIYU_COMMUNITY_MODE !== true && atomicRecords.length) {
                        window.scheduleCloudWriteOutboxDrain?.(uid);
                    }
                    return saved;
                    } finally {
                        _endAccountWrite(writeToken);
                    }
                    });
                },
                async createRestoreSnapshot(options) {
                    const settings = options && typeof options === 'object' ? options : {};
                    const expectedUid = String(settings.expectedUid || '');
                    if (!expectedUid || AccountDataScope.getActiveUid() !== expectedUid) return false;
                    if (!StorageV2 || typeof StorageV2.createRestoreSnapshot !== 'function') return false;
                    const booksKey = _idbKey(KEYS.BOOKS, expectedUid);
                    const memoryKey = _memoryKey(expectedUid);
                    const persisted = await IDB.mutateKv(
                        [booksKey, memoryKey],
                        function(values) {
                            return {
                                entries: [],
                                result: {
                                    books: values[booksKey] || {},
                                    memBooks: values[memoryKey] || {}
                                }
                            };
                        }
                    );
                    if (AccountDataScope.getActiveUid() !== expectedUid) return false;
                    return StorageV2.createRestoreSnapshot({
                        accountId: expectedUid,
                        books: persisted.books,
                        memBooks: persisted.memBooks,
                        consumeValues: true,
                        runtime: settings.runtime || {},
                        reason: settings.reason || 'cloud-restore'
                    });
                },
                getApiConfig() { return SecureStore.get(); },
                saveApiConfig(a) { return SecureStore.set(a); },
                getTemplates() { return _cache[KEYS.TEMPLATES] || []; },
                saveTemplates(t) {
                    const uid = AccountDataScope.getActiveUid();
                    const stagedTemplates = _cloneStorageValue(Array.isArray(t) ? t : []);
                    return _enqueueTemplateWrite(uid, async function() {
                        const saved = await _save(KEYS.TEMPLATES, stagedTemplates);
                        if (saved && AccountDataScope.getActiveUid() === uid) {
                            _cache[KEYS.TEMPLATES] = stagedTemplates;
                        } else if (!saved) {
                            await _restoreTemplatesCacheFromDurable(uid);
                        }
                        return saved;
                    });
                },
                getTemplateStorageKey(uid) { return _idbKey(KEYS.TEMPLATES, uid || AccountDataScope.getActiveUid()); },
                getSettings() { return _cache[KEYS.SETTINGS] || {}; },
                saveSettings(s) { _cache[KEYS.SETTINGS] = s; return _save(KEYS.SETTINGS, s); },
                getStorageHealth() {
                    return {
                        booksReadState: { ..._booksReadState },
                        largeStore: window.ZHIYU_LARGE_LOCAL_STORE?.getHealth?.() || null,
                        storageV2: StorageV2?.getHealth?.(AccountDataScope.getActiveUid()) || null
                    };
                },
                scheduleStorageV2Reconcile(uid) {
                    _scheduleV2Migration(String(uid || AccountDataScope.getActiveUid()));
                    return true;
                },
                checkStorageV2Freshness(uid) {
                    return _checkV2Freshness(String(uid || AccountDataScope.getActiveUid()));
                },
                refreshStorageV2Preferred(uid) {
                    return _refreshV2Preferred(String(uid || AccountDataScope.getActiveUid()));
                },
                getPreferredV2MemoryBooks(uid) {
                    const expectedUid = String(uid || AccountDataScope.getActiveUid());
                    if (
                        _preferredV2Memory.uid !== expectedUid
                        || _preferredV2Memory.source !== 'v2'
                        || !_preferredV2Memory.value
                    ) return null;
                    return _cloneStorageValue(_preferredV2Memory.value);
                },
                getCurrentStorageMemoryBooks(uid) {
                    const expectedUid = String(uid || AccountDataScope.getActiveUid());
                    if (_preferredV2Memory.uid !== expectedUid || !_preferredV2Memory.value) return null;
                    return _cloneStorageValue(_preferredV2Memory.value);
                }
            };
        })();

    window.addEventListener?.('zhiyu:storage-v2-reconcile-request', function(event) {
        const uid = String(event?.detail?.accountId || '');
        if (uid && uid === AccountDataScope.getActiveUid()) {
            StorageService.scheduleStorageV2Reconcile(uid);
        }
    });
    window.addEventListener?.('focus', function() {
        StorageService.refreshStorageV2Preferred(AccountDataScope.getActiveUid()).catch(function() {});
    });
    window.document?.addEventListener?.('visibilitychange', function() {
        if (window.document.visibilityState === 'visible') {
            StorageService.refreshStorageV2Preferred(AccountDataScope.getActiveUid()).catch(function() {});
        }
    });

    window.ZHIYU_IDB = IDB;
    window.ZHIYU_SECURE_STORE = SecureStore;
    window.ZHIYU_STORAGE_SERVICE = StorageService;
})(window);
