// 大文本本机存储：正文草稿、提示结果、头像等统一进入 IndexedDB。
// 对外保留同步读取接口，写入由队列异步落盘；启动和账号切换时会先完成旧数据迁移。
(function(window) {
    'use strict';

    const IDB = window.ZHIYU_IDB;
    const RECORD_PREFIX = 'zhiyu_large_record_v1:';
    const INDEX_PREFIX = 'zhiyu_large_index_v1:';
    const VERSION = 1;
    let activeUid = 'guest';
    let cache = new Map();
    let persistedCache = new Map();
    let index = new Map();
    let writeChain = Promise.resolve();
    let ready = false;
    let lastError = null;
    const operationTokens = new Map();

    function normalizeUid(uid) {
        return window.AccountDataScope?.normalizeUid?.(uid) || String(uid || 'guest');
    }

    function canMutateActiveAccount(options) {
        const lease = window.ZHIYU_ACCOUNT_WRITE_LEASE;
        return !lease || lease.assertCanWrite(activeUid, options) === true;
    }

    function beginLargeWrite(label, suppliedToken) {
        const lease = window.ZHIYU_ACCOUNT_WRITE_LEASE;
        if (suppliedToken && lease?.isWriteTokenCurrent?.(suppliedToken) === true) {
            return { lease, token: suppliedToken, ownsToken: false };
        }
        const token = lease?.beginWrite?.(activeUid, {
            message: '此账号已在另一个标签页编辑，当前“' + String(label || '大文本保存') + '”未写入本机。'
        }) || (!lease ? { legacy: true, uid: activeUid } : null);
        return { lease, token, ownsToken: true };
    }

    function largeWriteCurrent(operation) {
        return !operation?.lease || operation.lease.isWriteTokenCurrent?.(operation.token) === true;
    }

    function endLargeWrite(operation) {
        if (operation?.ownsToken !== false) operation?.lease?.endWrite?.(operation.token);
    }

    function checksum(value) {
        const text = String(value ?? '');
        let hash = 2166136261;
        for (let i = 0; i < text.length; i += 1) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(16).padStart(8, '0') + ':' + text.length;
    }

    function encodeKey(value) {
        return encodeURIComponent(String(value || ''));
    }

    function recordKey(logicalKey, uid) {
        return RECORD_PREFIX + encodeKey(uid || activeUid) + ':' + encodeKey(logicalKey);
    }

    function indexKey(uid) {
        return INDEX_PREFIX + encodeKey(uid || activeUid);
    }

    function isRecognizedLargeKey(key, uid, aliases) {
        const value = String(key || '');
        const normalizedUid = normalizeUid(uid);
        const profileNames = new Set([normalizedUid].concat(aliases || []).filter(Boolean).map(function(item) {
            return 'zhiyu_profile_' + String(item).replace(/[^\w.-]/g, '_');
        }));
        if (profileNames.has(value)) return true;

        const accountSuffix = '__uid_' + normalizedUid;
        if (!value.endsWith(accountSuffix)) return false;
        return /^(?:zhiyu_draft_|zhiyu_action_panel_draft_v1|zhiyu_action_(?:content|input)_draft|zhiyu_(?:normal|functional|advanced)_outline_draft_|zhiyu_(?:outline|file|ai)_snapshot_|outline_)/.test(value);
    }

    async function persistIndex(writeToken) {
        const lease = window.ZHIYU_ACCOUNT_WRITE_LEASE;
        if (lease && lease.isWriteTokenCurrent?.(writeToken) !== true) return false;
        if (!lease && !canMutateActiveAccount({ silent: true })) return false;
        const payload = {};
        index.forEach(function(meta, key) { payload[key] = meta; });
        if (writeToken?.fenceKey || writeToken?.leaseId) {
            if (!writeToken?.fenceKey || !writeToken?.leaseId || typeof IDB.setManyFenced !== 'function') {
                throw new Error('本机大文本存储版本过旧');
            }
            await IDB.setManyFenced([[indexKey(), payload]], writeToken.fenceKey, writeToken.leaseId);
        } else {
            await IDB.set(indexKey(), payload);
        }
        return true;
    }

    function enqueue(task) {
        writeChain = writeChain.then(task, task).catch(function(error) {
            lastError = error;
            console.error('大文本本机存储失败：', error);
            throw error;
        });
        return writeChain;
    }

    async function persistRecord(logicalKey, value, kind, updatedAt, writeToken) {
        const lease = window.ZHIYU_ACCOUNT_WRITE_LEASE;
        if (lease?.isWriteTokenCurrent?.(writeToken) !== true && !canMutateActiveAccount()) {
            throw new Error('当前标签页没有本机写入权');
        }
        const text = String(value ?? '');
        const record = {
            version: VERSION,
            uid: activeUid,
            kind: String(kind || 'text'),
            logicalKey: String(logicalKey || ''),
            value: text,
            updatedAt: Number(updatedAt || Date.now()),
            checksum: checksum(text)
        };
        const key = String(logicalKey);
        const previousMeta = index.get(key);
        index.set(key, {
            kind: record.kind,
            updatedAt: record.updatedAt,
            checksum: record.checksum
        });
        const indexPayload = {};
        index.forEach(function(meta, indexKeyValue) { indexPayload[indexKeyValue] = meta; });
        try {
            if (writeToken?.fenceKey || writeToken?.leaseId) {
                if (!writeToken?.fenceKey || !writeToken?.leaseId || typeof IDB.setManyFenced !== 'function') {
                    throw new Error('本机大文本存储版本过旧');
                }
                await IDB.setManyFenced([
                    [recordKey(logicalKey), record],
                    [indexKey(), indexPayload]
                ], writeToken.fenceKey, writeToken.leaseId);
            } else {
                await IDB.setMany([
                    [recordKey(logicalKey), record],
                    [indexKey(), indexPayload]
                ]);
            }
        } catch(error) {
            if (previousMeta === undefined) index.delete(key);
            else index.set(key, previousMeta);
            throw error;
        }
        const verified = await IDB.get(recordKey(logicalKey));
        if (!verified || verified.checksum !== record.checksum || verified.value !== record.value) {
            throw new Error('IndexedDB 回读校验失败');
        }
        persistedCache.set(String(logicalKey), text);
        return record;
    }

    async function migrateLegacyKey(logicalKey, kind, writeToken) {
        let raw = null;
        try { raw = localStorage.getItem(logicalKey); } catch (_error) {}
        if (raw === null) return false;

        const existing = await IDB.get(recordKey(logicalKey));
        const legacyChecksum = checksum(raw);
        let verified = existing;
        if (!existing || existing.checksum !== legacyChecksum || existing.value !== raw) {
            verified = await persistRecord(logicalKey, raw, kind, Date.now(), writeToken);
        } else {
            index.set(String(logicalKey), {
                kind: existing.kind || kind || 'text',
                updatedAt: Number(existing.updatedAt || 0),
                checksum: existing.checksum
            });
        }
        cache.set(String(logicalKey), String(verified.value || ''));
        persistedCache.set(String(logicalKey), String(verified.value || ''));
        if (verified.checksum === legacyChecksum && verified.value === raw) {
            try {
                localStorage.removeItem(logicalKey);
                if (localStorage.getItem(logicalKey) !== null) return false;
                const metaKey = logicalKey + ':meta';
                if (localStorage.getItem(metaKey) !== null) localStorage.removeItem(metaKey);
            } catch (_error) {
                return false;
            }
        }
        return true;
    }

    async function loadIndexedRecords() {
        const savedIndex = await IDB.get(indexKey());
        index = new Map(Object.entries(savedIndex && typeof savedIndex === 'object' ? savedIndex : {}));
        cache = new Map();
        persistedCache = new Map();
        for (const logicalKey of index.keys()) {
            const record = await IDB.get(recordKey(logicalKey));
            if (!record || record.uid !== activeUid || record.checksum !== checksum(record.value)) {
                index.delete(logicalKey);
                continue;
            }
            cache.set(logicalKey, String(record.value ?? ''));
            persistedCache.set(logicalKey, String(record.value ?? ''));
        }
        const lease = window.ZHIYU_ACCOUNT_WRITE_LEASE;
        if (!lease) await persistIndex();
    }

    async function init(uid, options) {
        if (!IDB) throw new Error('IndexedDB 存储服务不可用');
        await writeChain.catch(function() {});
        activeUid = normalizeUid(uid);
        ready = false;
        lastError = null;
        await loadIndexedRecords();

        const aliases = Array.isArray(options?.aliases) ? options.aliases : [];
        const legacyKeys = [];
        try {
            for (let i = 0; i < localStorage.length; i += 1) {
                const key = localStorage.key(i);
                if (isRecognizedLargeKey(key, activeUid, aliases)) legacyKeys.push(key);
            }
        } catch (_error) {}
        if (canMutateActiveAccount({ silent: true })) {
            const migrationOperation = beginLargeWrite('大文本旧数据迁移');
            if (!migrationOperation.token) return false;
            try {
                await persistIndex(migrationOperation.token);
            for (const key of legacyKeys) {
                const kind = key.startsWith('zhiyu_profile_') ? 'profile' : 'text';
                await migrateLegacyKey(key, kind, migrationOperation.token);
            }
            } finally {
                endLargeWrite(migrationOperation);
            }
        }
        ready = true;
        return true;
    }

    function get(logicalKey) {
        const key = String(logicalKey || '');
        if (cache.has(key)) return cache.get(key);
        try {
            const legacy = localStorage.getItem(key);
            return legacy === null ? null : legacy;
        } catch (_error) {
            return null;
        }
    }

    function getPersisted(logicalKey) {
        const key = String(logicalKey || '');
        if (persistedCache.has(key)) return persistedCache.get(key);
        try {
            const legacy = localStorage.getItem(key);
            return legacy === null ? null : legacy;
        } catch (_error) {
            return null;
        }
    }

    function set(logicalKey, value, kind, options) {
        const key = String(logicalKey || '');
        if (!key) return Promise.resolve(false);
        const suppliedToken = options?.writeToken;
        const lease = window.ZHIYU_ACCOUNT_WRITE_LEASE;
        if (lease?.isWriteTokenCurrent?.(suppliedToken) !== true && !canMutateActiveAccount()) return Promise.resolve(false);
        const writeOperation = beginLargeWrite('大文本保存', suppliedToken);
        if (!writeOperation.token) return Promise.resolve(false);
        const text = String(value ?? '');
        const operationToken = Number(operationTokens.get(key) || 0) + 1;
        operationTokens.set(key, operationToken);
        cache.set(key, text);
        const expectedUid = activeUid;
        return enqueue(async function() {
            try {
                if (expectedUid !== activeUid || !largeWriteCurrent(writeOperation)) return false;
                await persistRecord(key, text, kind, Date.now(), writeOperation.token);
                if (!largeWriteCurrent(writeOperation)) return false;
                try {
                    const legacy = localStorage.getItem(key);
                    if (legacy !== null && legacy === text) localStorage.removeItem(key);
                } catch (_error) {}
                return true;
            } finally {
                endLargeWrite(writeOperation);
            }
        });
    }

    function remove(logicalKey) {
        const key = String(logicalKey || '');
        if (!key) return Promise.resolve(false);
        if (!canMutateActiveAccount()) return Promise.resolve(false);
        const writeOperation = beginLargeWrite('大文本删除');
        if (!writeOperation.token) return Promise.resolve(false);
        const operationToken = Number(operationTokens.get(key) || 0) + 1;
        operationTokens.set(key, operationToken);
        const expectedUid = activeUid;
        return enqueue(async function() {
            try {
                if (expectedUid !== activeUid || !largeWriteCurrent(writeOperation)) return false;
                const previousMeta = index.get(key);
                index.delete(key);
                const indexPayload = {};
                index.forEach(function(meta, indexKeyValue) { indexPayload[indexKeyValue] = meta; });
                try {
                    if (writeOperation.token?.fenceKey && writeOperation.token?.leaseId) {
                        if (typeof IDB.mutateKvFenced !== 'function') throw new Error('本机大文本存储版本过旧');
                        await IDB.mutateKvFenced([
                            recordKey(key),
                            indexKey()
                        ], writeOperation.token.fenceKey, writeOperation.token.leaseId, function() {
                            return { entries: [[indexKey(), indexPayload]], deletes: [recordKey(key)], result: true };
                        });
                    } else {
                        await IDB.remove(recordKey(key));
                        await IDB.set(indexKey(), indexPayload);
                    }
                } catch(error) {
                    if (previousMeta !== undefined) index.set(key, previousMeta);
                    throw error;
                }
                const verified = await IDB.get(recordKey(key));
                if (verified != null) throw new Error('IndexedDB 删除回读校验失败');
                if (operationTokens.get(key) !== operationToken) return true;
                cache.delete(key);
                persistedCache.delete(key);
                try {
                    localStorage.removeItem(key);
                    localStorage.removeItem(key + ':meta');
                } catch (_error) {}
                return true;
            } finally {
                endLargeWrite(writeOperation);
            }
        });
    }

    function removeIfValue(logicalKey, expectedValue, options) {
        const key = String(logicalKey || '');
        if (!key) return Promise.resolve(false);
        const expectedText = String(expectedValue ?? '');
        const writeOperation = beginLargeWrite('大文本条件删除', options?.writeToken);
        if (!writeOperation.token) return Promise.resolve(false);
        const expectedUid = activeUid;
        const operationToken = Number(operationTokens.get(key) || 0) + 1;
        operationTokens.set(key, operationToken);
        const queued = enqueue(async function() {
            try {
                if (expectedUid !== activeUid || !largeWriteCurrent(writeOperation)) return { removed: false };
                if (cache.has(key) && String(cache.get(key) ?? '') !== expectedText) return { removed: false };
                const nextIndex = new Map(index);
                nextIndex.delete(key);
                const indexPayload = {};
                nextIndex.forEach(function(meta, indexKeyValue) { indexPayload[indexKeyValue] = meta; });
                const mutate = writeOperation.token?.fenceKey && writeOperation.token?.leaseId
                    ? IDB.mutateKvFenced?.bind(IDB)
                    : IDB.mutateKv?.bind(IDB);
                if (!mutate) throw new Error('本机大文本存储版本过旧');
                const args = [[recordKey(key), indexKey()]];
                if (writeOperation.token?.fenceKey && writeOperation.token?.leaseId) {
                    args.push(writeOperation.token.fenceKey, writeOperation.token.leaseId);
                }
                args.push(function(values) {
                    const current = values[recordKey(key)];
                    if (current && String(current.value ?? '') !== expectedText) {
                        return { entries: [], result: false };
                    }
                    return {
                        entries: [[indexKey(), indexPayload]],
                        deletes: current ? [recordKey(key)] : [],
                        result: true
                    };
                });
                const removed = await mutate(...args);
                if (removed !== true || !largeWriteCurrent(writeOperation)) return { removed: false };
                if (operationTokens.get(key) === operationToken) {
                    index = nextIndex;
                    if (cache.get(key) === expectedText) cache.delete(key);
                    if (persistedCache.get(key) === expectedText) persistedCache.delete(key);
                    try {
                        if (localStorage.getItem(key) === expectedText) localStorage.removeItem(key);
                        localStorage.removeItem(key + ':meta');
                    } catch (_error) {}
                }
                return { removed: true };
            } finally {
                endLargeWrite(writeOperation);
            }
        });
        return queued.then(function(result) { return result?.removed === true; });
    }

    function list(prefix) {
        const head = String(prefix || '');
        return Array.from(cache.keys()).filter(function(key) { return key.startsWith(head); });
    }

    function flush() {
        return writeChain.catch(function() { return false; });
    }

    function getHealth() {
        return {
            ready,
            uid: activeUid,
            recordCount: cache.size,
            writable: !lastError,
            lastError: lastError ? String(lastError.message || lastError) : ''
        };
    }

    window.ZHIYU_LARGE_LOCAL_STORE = {
        init,
        get,
        getPersisted,
        set,
        remove,
        removeIfValue,
        list,
        flush,
        migrateLegacyKey,
        getHealth,
        checksum
    };
})(window);
