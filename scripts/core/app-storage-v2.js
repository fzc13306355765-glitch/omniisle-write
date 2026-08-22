// 知屿浏览器储存 V2：保留 V1 kv，提供可校验的对象仓库影子副本与安全双写。
(function(window) {
    'use strict';

    const DB_NAME = 'zhiyu-store';
    const DB_VERSION = 2;
    const CHANNEL_NAME = 'zhiyu-storage-v2';
    const UPGRADE_LOCK_NAME = 'zhiyu-store-v2-upgrade';
    const MIN_REQUIRED_BYTES = 1024 * 1024;
    const CAPACITY_FACTOR = 2.2;
    const LARGE_SNAPSHOT_TEXT_UNIT_THRESHOLD = 4 * 1024 * 1024;
    const SNAPSHOT_DIGEST_CHUNK_UNITS = 512 * 1024;
    const V2_PREFERRED_READ_ENABLED = true;
    const STORE_DEFINITIONS = Object.freeze({
        storage_meta: {
            keyPath: 'accountId',
            indexes: [
                ['status', 'status'],
                ['v1BooksUpdatedAt', 'v1BooksUpdatedAt'],
                ['v1MemoryUpdatedAt', 'v1MemoryUpdatedAt']
            ]
        },
        works: {
            keyPath: ['accountId', 'workId'],
            indexes: [
                ['accountId', 'accountId'],
                ['accountId_order', ['accountId', 'order']],
                ['accountId_name', ['accountId', 'name']]
            ]
        },
        volumes: {
            keyPath: ['accountId', 'workId', 'volumeId'],
            indexes: [
                ['accountId', 'accountId'],
                ['accountId_workId', ['accountId', 'workId']],
                ['accountId_workId_order', ['accountId', 'workId', 'order']]
            ]
        },
        chapters: {
            keyPath: ['accountId', 'workId', 'chapterId'],
            indexes: [
                ['accountId', 'accountId'],
                ['accountId_workId', ['accountId', 'workId']],
                ['accountId_workId_volumeId_order', ['accountId', 'workId', 'volumeId', 'order']]
            ]
        },
        memory_files: {
            keyPath: ['accountId', 'workId', 'folderId', 'entryId'],
            indexes: [
                ['accountId', 'accountId'],
                ['accountId_workId', ['accountId', 'workId']],
                ['accountId_workId_folderId_order', ['accountId', 'workId', 'folderId', 'order']]
            ]
        },
        snapshots: {
            keyPath: ['accountId', 'snapshotId'],
            indexes: [
                ['accountId', 'accountId'],
                ['accountId_createdAt', ['accountId', 'createdAt']],
                ['accountId_reason', ['accountId', 'reason']]
            ]
        },
        sync_queue: {
            keyPath: ['accountId', 'queueId'],
            indexes: [
                ['accountId', 'accountId'],
                ['accountId_status', ['accountId', 'status']],
                ['accountId_nextAttemptAt', ['accountId', 'nextAttemptAt']]
            ]
        },
        tombstones: {
            keyPath: ['accountId', 'entityType', 'entityId'],
            indexes: [
                ['accountId', 'accountId'],
                ['accountId_entityType', ['accountId', 'entityType']]
            ]
        },
        migration_receipts: {
            keyPath: ['accountId', 'migrationId'],
            indexes: [
                ['accountId', 'accountId'],
                ['accountId_status', ['accountId', 'status']],
                ['accountId_createdAt', ['accountId', 'createdAt']]
            ]
        }
    });
    const PROJECTION_STORES = ['works', 'volumes', 'chapters', 'memory_files', 'tombstones'];
    const ALL_V2_STORES = Object.keys(STORE_DEFINITIONS);
    const accountStates = new Map();
    const pendingMigrations = new Map();
    const testFaults = new Map();
    let db = null;
    let databaseOpenPromise = null;
    let channel = null;
    let lastIssue = '';

    function setTestFault(name, count, errorName) {
        if (window.__ZHIYU_STORAGE_V2_TEST_MODE__ !== true) {
            throw new Error('储存 V2 故障注入只允许在隔离测试环境使用');
        }
        const key = String(name || '');
        if (!key) throw new Error('缺少故障名称');
        testFaults.set(key, {
            remaining: Math.max(0, Number(count || 1)),
            errorName: String(errorName || 'AbortError')
        });
    }

    function consumeTestFault(name) {
        const fault = testFaults.get(name);
        if (!fault || fault.remaining <= 0) return null;
        fault.remaining -= 1;
        if (fault.remaining <= 0) testFaults.delete(name);
        const error = new Error('隔离测试故障：' + name);
        error.name = fault.errorName;
        return error;
    }

    function normalizeAccountId(uid) {
        const scope = window.AccountDataScope;
        if (scope && typeof scope.normalizeUid === 'function') return scope.normalizeUid(uid);
        const value = String(uid || '').trim();
        return value || 'guest';
    }

    function accountScopedKey(base, accountId) {
        if (typeof window.AccountDataScope?.key === 'function') {
            return window.AccountDataScope.key(base, accountId);
        }
        return String(base || '') + '__uid_' + normalizeAccountId(accountId);
    }

    function getV1Keys(accountIdInput) {
        const accountId = normalizeAccountId(accountIdInput);
        const prefix = String(window.ZHIYU_CONFIG?.STORAGE_PREFIX || 'novel_');
        const books = accountScopedKey(prefix + 'books', accountId);
        const memory = accountScopedKey('mem_books', accountId);
        return {
            books,
            booksUpdatedAt: books + '_updated_at',
            memory,
            memoryUpdatedAt: memory + '_updated_at'
        };
    }

    function getV1TimestampKeys(accountIdInput) {
        const keys = getV1Keys(accountIdInput);
        return { books: keys.booksUpdatedAt, memory: keys.memoryUpdatedAt };
    }

    function cloneValue(value) {
        if (typeof structuredClone === 'function') return structuredClone(value);
        return JSON.parse(JSON.stringify(value));
    }

    function encodeNumber(value) {
        if (Number.isNaN(value)) return ['number', 'nan'];
        if (value === Infinity) return ['number', 'positive-infinity'];
        if (value === -Infinity) return ['number', 'negative-infinity'];
        if (Object.is(value, -0)) return ['number', 'negative-zero'];
        return ['number', 'finite', value];
    }

    function bytesToHex(buffer, byteOffset, byteLength) {
        return Array.from(
            new Uint8Array(buffer, Number(byteOffset || 0), Number(byteLength || 0)),
            function(byte) { return byte.toString(16).padStart(2, '0'); }
        ).join('');
    }

    function isArrayIndexKey(key, length) {
        if (!/^(0|[1-9]\d*)$/.test(key)) return false;
        const index = Number(key);
        return Number.isSafeInteger(index) && index >= 0 && index < length && index < 4294967295;
    }

    function encodeStructuredValue(value, seen, sortObjectKeys) {
        if (value === null) return ['null'];
        if (typeof value === 'undefined') return ['undefined'];
        if (typeof value === 'string') return ['string', value];
        if (typeof value === 'boolean') return ['boolean', value];
        if (typeof value === 'number') return encodeNumber(value);
        if (typeof value === 'bigint') return ['bigint', value.toString(10)];
        if (typeof value === 'function' || typeof value === 'symbol') {
            throw new TypeError('储存数据包含不可结构化克隆值');
        }
        if (typeof value !== 'object') return ['other', String(value)];
        if (seen.has(value)) throw new TypeError('储存数据包含循环或重复对象引用，已安全停留 V1');
        seen.add(value);
        let encoded;
        if (value instanceof Date) {
            encoded = ['date', encodeNumber(value.getTime())];
        } else if (value instanceof RegExp) {
            encoded = ['regexp', value.source, value.flags, Number(value.lastIndex || 0)];
        } else if (Array.isArray(value)) {
            const indexEntries = [];
            const extraEntries = [];
            Object.keys(value).forEach(function(key) {
                if (isArrayIndexKey(key, value.length)) {
                    indexEntries.push([
                        Number(key),
                        encodeStructuredValue(value[key], seen, sortObjectKeys)
                    ]);
                } else {
                    extraEntries.push([
                        key,
                        encodeStructuredValue(value[key], seen, sortObjectKeys)
                    ]);
                }
            });
            indexEntries.sort(function(left, right) { return left[0] - right[0]; });
            if (sortObjectKeys) {
                extraEntries.sort(function(left, right) {
                    if (left[0] < right[0]) return -1;
                    if (left[0] > right[0]) return 1;
                    return 0;
                });
            }
            encoded = ['array', value.length, indexEntries, extraEntries];
        } else if (value instanceof Map) {
            encoded = ['map', Array.from(value.entries(), function(entry) {
                return [
                    encodeStructuredValue(entry[0], seen, sortObjectKeys),
                    encodeStructuredValue(entry[1], seen, sortObjectKeys)
                ];
            })];
        } else if (value instanceof Set) {
            encoded = ['set', Array.from(value.values(), function(item) {
                return encodeStructuredValue(item, seen, sortObjectKeys);
            })];
        } else if (ArrayBuffer.isView(value)) {
            if (seen.has(value.buffer)) {
                throw new TypeError('储存数据包含共享二进制缓冲区引用，已安全停留 V1');
            }
            seen.add(value.buffer);
            const viewName = value instanceof DataView ? 'DataView' : String(value.constructor?.name || 'TypedArray');
            encoded = [
                'view',
                viewName,
                Number(value.byteOffset || 0),
                Number(value.byteLength || 0),
                bytesToHex(value.buffer, 0, value.buffer.byteLength)
            ];
        } else if (
            value instanceof ArrayBuffer
            || (typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer)
        ) {
            encoded = ['buffer', String(value.constructor?.name || 'ArrayBuffer'), bytesToHex(value, 0, value.byteLength)];
        } else if (typeof Blob !== 'undefined' && value instanceof Blob) {
            throw new TypeError('储存数据包含暂不支持哈希的 Blob/File，已安全停留 V1');
        } else if (value instanceof Error) {
            encoded = [
                'error',
                String(value.name || 'Error'),
                String(value.message || ''),
                String(value.stack || ''),
                Object.prototype.hasOwnProperty.call(value, 'cause')
                    ? encodeStructuredValue(value.cause, seen, sortObjectKeys)
                    : ['missing']
            ];
        } else {
            const keys = Object.keys(value);
            if (sortObjectKeys) keys.sort();
            encoded = ['object', keys.map(function(key) {
                return [key, encodeStructuredValue(value[key], seen, sortObjectKeys)];
            })];
        }
        return encoded;
    }

    function structuredValueJson(value, sortObjectKeys) {
        const cloned = cloneValue(value);
        return JSON.stringify(encodeStructuredValue(cloned, new Set(), sortObjectKeys === true));
    }

    function canonicalJson(value) {
        return structuredValueJson(value, true);
    }

    function canonicalJsonDetached(value) {
        return JSON.stringify(encodeStructuredValue(value, new Set(), true));
    }

    function orderedValueJson(value) {
        return structuredValueJson(value, false);
    }

    async function sha256Bytes(bytes) {
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest), function(byte) {
            return byte.toString(16).padStart(2, '0');
        }).join('');
    }

    async function sha256(value) {
        const bytes = new TextEncoder().encode(typeof value === 'string' ? value : canonicalJson(value));
        return sha256Bytes(bytes);
    }

    function exceedsSnapshotDigestThreshold(value, budget, seen) {
        if (budget.remaining < 0) return true;
        if (value === null || typeof value === 'undefined') return false;
        if (typeof value === 'string') {
            budget.remaining -= value.length;
            return budget.remaining < 0;
        }
        if (typeof value !== 'object') return false;
        if (seen.has(value)) throw new TypeError('Storage snapshot contains a repeated object reference');
        seen.add(value);
        if (ArrayBuffer.isView(value)) {
            budget.remaining -= Number(value.buffer?.byteLength || value.byteLength || 0);
            return budget.remaining < 0;
        }
        if (
            value instanceof ArrayBuffer
            || (typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer)
        ) {
            budget.remaining -= Number(value.byteLength || 0);
            return budget.remaining < 0;
        }
        if (typeof Blob !== 'undefined' && value instanceof Blob) {
            throw new TypeError('Storage snapshot cannot hash Blob or File values');
        }
        if (value instanceof Map) {
            for (const entry of value.entries()) {
                if (exceedsSnapshotDigestThreshold(entry[0], budget, seen)
                    || exceedsSnapshotDigestThreshold(entry[1], budget, seen)) return true;
            }
            return false;
        }
        if (value instanceof Set) {
            for (const item of value.values()) {
                if (exceedsSnapshotDigestThreshold(item, budget, seen)) return true;
            }
            return false;
        }
        const keys = Object.keys(value);
        for (let index = 0; index < keys.length; index += 1) {
            budget.remaining -= keys[index].length;
            if (budget.remaining < 0
                || exceedsSnapshotDigestThreshold(value[keys[index]], budget, seen)) return true;
        }
        return false;
    }

    function yieldSnapshotDigest() {
        if (typeof MessageChannel === 'function') {
            return new Promise(function(resolve) {
                const channel = new MessageChannel();
                channel.port1.onmessage = function() {
                    channel.port1.close();
                    channel.port2.close();
                    resolve();
                };
                channel.port2.postMessage(0);
            });
        }
        return new Promise(function(resolve) { setTimeout(resolve, 0); });
    }

    async function hashSnapshotDigestMeta(value) {
        const bytes = new TextEncoder().encode(canonicalJsonDetached(value));
        return {
            hash: await sha256Bytes(bytes),
            byteLength: bytes.byteLength
        };
    }

    async function hashSnapshotByteChunks(bytes, label) {
        const chunks = [];
        let byteLength = 0;
        for (let offset = 0; offset < bytes.byteLength; offset += SNAPSHOT_DIGEST_CHUNK_UNITS) {
            const chunk = bytes.subarray(
                offset,
                Math.min(bytes.byteLength, offset + SNAPSHOT_DIGEST_CHUNK_UNITS)
            );
            chunks.push([chunk.byteLength, await sha256Bytes(chunk)]);
            byteLength += chunk.byteLength;
            await yieldSnapshotDigest();
        }
        const meta = await hashSnapshotDigestMeta([label, bytes.byteLength, chunks]);
        return { hash: meta.hash, byteLength: byteLength + meta.byteLength };
    }

    async function hashSnapshotString(value) {
        const encoder = new TextEncoder();
        const chunks = [];
        let byteLength = 0;
        for (let offset = 0; offset < value.length;) {
            let end = Math.min(value.length, offset + SNAPSHOT_DIGEST_CHUNK_UNITS);
            if (end < value.length) {
                const previous = value.charCodeAt(end - 1);
                if (previous >= 0xD800 && previous <= 0xDBFF) end += 1;
            }
            const text = value.slice(offset, end);
            const bytes = encoder.encode(text);
            chunks.push([text.length, bytes.byteLength, await sha256Bytes(bytes)]);
            byteLength += bytes.byteLength;
            offset = end;
            await yieldSnapshotDigest();
        }
        const meta = await hashSnapshotDigestMeta(['string-chunks-v1', value.length, chunks]);
        return { hash: meta.hash, byteLength: byteLength + meta.byteLength };
    }

    async function hashLargeSnapshotNode(value, seen) {
        if (typeof value === 'string') return hashSnapshotString(value);
        if (value === null || typeof value !== 'object') {
            return hashSnapshotDigestMeta(encodeStructuredValue(value, new Set(), true));
        }
        if (seen.has(value)) throw new TypeError('Storage snapshot contains a repeated object reference');
        seen.add(value);
        if (value instanceof Date || value instanceof RegExp || value instanceof Error) {
            return hashSnapshotDigestMeta(encodeStructuredValue(value, new Set(), true));
        }
        if (typeof Blob !== 'undefined' && value instanceof Blob) {
            throw new TypeError('Storage snapshot cannot hash Blob or File values');
        }
        if (ArrayBuffer.isView(value)) {
            if (seen.has(value.buffer)) {
                throw new TypeError('Storage snapshot contains a shared binary buffer');
            }
            seen.add(value.buffer);
            const bytes = new Uint8Array(value.buffer, 0, value.buffer.byteLength);
            const digest = await hashSnapshotByteChunks(bytes, 'view-buffer-v1');
            const meta = await hashSnapshotDigestMeta([
                'view-merkle-v1',
                value instanceof DataView ? 'DataView' : String(value.constructor?.name || 'TypedArray'),
                Number(value.byteOffset || 0),
                Number(value.byteLength || 0),
                digest.hash
            ]);
            return { hash: meta.hash, byteLength: digest.byteLength + meta.byteLength };
        }
        if (
            value instanceof ArrayBuffer
            || (typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer)
        ) {
            return hashSnapshotByteChunks(new Uint8Array(value), 'buffer-merkle-v1');
        }
        if (value instanceof Map) {
            const entries = [];
            let byteLength = 0;
            for (const entry of value.entries()) {
                const key = await hashLargeSnapshotNode(entry[0], seen);
                const item = await hashLargeSnapshotNode(entry[1], seen);
                entries.push([key.hash, item.hash]);
                byteLength += key.byteLength + item.byteLength;
            }
            const meta = await hashSnapshotDigestMeta(['map-merkle-v1', entries]);
            return { hash: meta.hash, byteLength: byteLength + meta.byteLength };
        }
        if (value instanceof Set) {
            const entries = [];
            let byteLength = 0;
            for (const item of value.values()) {
                const digest = await hashLargeSnapshotNode(item, seen);
                entries.push(digest.hash);
                byteLength += digest.byteLength;
            }
            const meta = await hashSnapshotDigestMeta(['set-merkle-v1', entries]);
            return { hash: meta.hash, byteLength: byteLength + meta.byteLength };
        }
        const keys = Object.keys(value);
        if (Array.isArray(value)) {
            keys.sort(function(left, right) {
                const leftIndex = isArrayIndexKey(left, value.length);
                const rightIndex = isArrayIndexKey(right, value.length);
                if (leftIndex && rightIndex) return Number(left) - Number(right);
                if (leftIndex) return -1;
                if (rightIndex) return 1;
                return left < right ? -1 : (left > right ? 1 : 0);
            });
        } else {
            keys.sort();
        }
        const entries = [];
        let byteLength = 0;
        for (let index = 0; index < keys.length; index += 1) {
            const key = keys[index];
            const digest = await hashLargeSnapshotNode(value[key], seen);
            entries.push([
                Array.isArray(value) && isArrayIndexKey(key, value.length) ? Number(key) : key,
                digest.hash
            ]);
            byteLength += new TextEncoder().encode(key).byteLength + digest.byteLength;
        }
        const meta = await hashSnapshotDigestMeta([
            Array.isArray(value) ? 'array-merkle-v1' : 'object-merkle-v1',
            Array.isArray(value) ? value.length : null,
            entries
        ]);
        return { hash: meta.hash, byteLength: byteLength + meta.byteLength };
    }

    async function createSnapshotDigest(value) {
        const isLarge = exceedsSnapshotDigestThreshold(
            value,
            { remaining: LARGE_SNAPSHOT_TEXT_UNIT_THRESHOLD },
            new Set()
        );
        if (!isLarge) {
            const bytes = new TextEncoder().encode(canonicalJsonDetached(value));
            return {
                algorithm: 'canonical-sha256-v1',
                hash: await sha256Bytes(bytes),
                byteLength: bytes.byteLength
            };
        }
        const digest = await hashLargeSnapshotNode(value, new Set());
        return {
            algorithm: 'merkle-sha256-v1',
            hash: digest.hash,
            byteLength: digest.byteLength
        };
    }

    function jsonBytes(value) {
        return new TextEncoder().encode(canonicalJson(value)).byteLength;
    }

    function withoutFields(value, fields) {
        const result = {};
        Object.keys(value || {}).forEach(function(key) {
            if (!fields.includes(key)) result[key] = value[key];
        });
        return result;
    }

    function sourceId(value) {
        const text = String(value ?? '').trim();
        if (!text) return '';
        try {
            return 'src:' + encodeURIComponent(text);
        } catch(error) {
            let encoded = '';
            for (let index = 0; index < text.length; index += 1) {
                encoded += text.charCodeAt(index).toString(16).padStart(4, '0');
            }
            return 'src:utf16-' + encoded;
        }
    }

    async function derivedId(parts) {
        return 'derived:' + await sha256(parts);
    }

    async function collisionSafeId(baseId, used, fallbackParts, collisionParts) {
        let candidate = baseId;
        if (!candidate) candidate = await derivedId(fallbackParts);
        if (!used.has(candidate)) {
            used.add(candidate);
            return candidate;
        }
        candidate = 'collision:' + await sha256(collisionParts || fallbackParts);
        if (used.has(candidate)) throw new Error('储存 V2 身份碰撞，已安全停留在 V1');
        used.add(candidate);
        return candidate;
    }

    async function withRecordHash(record) {
        const output = cloneValue(record);
        output.recordHash = await sha256(withoutFields(output, ['recordHash']));
        return output;
    }

    function countTombstoneCandidate(data) {
        return !!(data && typeof data === 'object' && (
            data.deleted === true
            || data.archived === true
            || data.status === 'deleted'
            || data.status === 'trash'
            || data.status === 'archived'
        ));
    }

    async function computeManifestFromRecords(recordsInput, v1RebuildEqual) {
        const records = recordsInput || {};
        const works = (records.works || []).slice().sort(function(a, b) {
            return Number(a.order || 0) - Number(b.order || 0);
        });
        const workOrderIndex = new Map(works.map(function(record, index) {
            return [record.workId, index];
        }));
        const volumes = (records.volumes || []).slice().sort(function(a, b) {
            return (workOrderIndex.get(a.workId) ?? Number.MAX_SAFE_INTEGER)
                - (workOrderIndex.get(b.workId) ?? Number.MAX_SAFE_INTEGER)
                || Number(a.order || 0) - Number(b.order || 0)
                || String(a.volumeId || '').localeCompare(String(b.volumeId || ''));
        });
        const volumeOrderIndex = new Map(volumes.map(function(record, index) {
            return [record.workId + '\n' + record.volumeId, index];
        }));
        const chapters = (records.chapters || []).slice().sort(function(a, b) {
            return (volumeOrderIndex.get(a.workId + '\n' + a.volumeId) ?? Number.MAX_SAFE_INTEGER)
                - (volumeOrderIndex.get(b.workId + '\n' + b.volumeId) ?? Number.MAX_SAFE_INTEGER)
                || Number(a.order || 0) - Number(b.order || 0)
                || String(a.chapterId || '').localeCompare(String(b.chapterId || ''));
        });
        const memoryBooks = (records.memory_files || [])
            .filter(function(record) { return record.kind === 'memory-book'; })
            .sort(function(a, b) {
                return Number(a.bookOrder || 0) - Number(b.bookOrder || 0)
                    || String(a.bookName || '').localeCompare(String(b.bookName || ''));
            });
        const containers = (records.memory_files || [])
            .filter(function(record) { return record.kind === 'folder' || record.kind === 'raw-folder'; })
            .sort(function(a, b) {
                return Number(a.bookOrder || 0) - Number(b.bookOrder || 0)
                    || Number(a.order || 0) - Number(b.order || 0)
                    || String(a.folderId || '').localeCompare(String(b.folderId || ''));
            });
        const memoryFiles = [];
        const memoryOrder = memoryBooks.map(function(record) {
            return [record.workId, '@book', '@book'];
        });
        containers.forEach(function(container) {
            memoryOrder.push([container.workId, container.folderId, container.entryId]);
            (records.memory_files || [])
                .filter(function(record) {
                    return record.kind === 'file'
                        && record.workId === container.workId
                        && record.folderId === container.folderId;
                })
                .sort(function(a, b) {
                    return Number(a.order || 0) - Number(b.order || 0)
                        || String(a.entryId || '').localeCompare(String(b.entryId || ''));
                })
                .forEach(function(record) {
                    memoryFiles.push(record);
                    memoryOrder.push([record.workId, record.folderId, record.entryId]);
                });
        });
        return {
            accountCount: 1,
            workCount: works.length,
            volumeCount: volumes.length,
            chapterCount: chapters.length,
            memoryFolderCount: containers.length,
            memoryFileCount: memoryFiles.length,
            tombstoneCount: (records.tombstones || []).length,
            explicitClearCount: chapters.filter(function(record) { return record.explicitClear === true; }).length,
            contentHashes: chapters.map(function(record) { return record.contentHash; })
                .concat(memoryFiles.map(function(record) { return record.contentHash; })),
            orderHashes: {
                works: await sha256(works.map(function(record) { return record.workId; })),
                volumes: await sha256(volumes.map(function(record) { return [record.workId, record.volumeId]; })),
                chapters: await sha256(chapters.map(function(record) {
                    return [record.workId, record.volumeId, record.chapterId];
                })),
                memory: await sha256(memoryOrder)
            },
            v1RebuildEqual: v1RebuildEqual === true
        };
    }

    async function buildProjection(accountIdInput, booksInput, memBooksInput, timestamps) {
        const accountId = normalizeAccountId(accountIdInput);
        const source = cloneValue({
            books: booksInput && typeof booksInput === 'object' && !Array.isArray(booksInput)
                ? booksInput
                : {},
            memBooks: memBooksInput && typeof memBooksInput === 'object' && !Array.isArray(memBooksInput)
                ? memBooksInput
                : {}
        });
        const books = source.books;
        const memBooks = source.memBooks;
        canonicalJson(source);
        if (window.AccountDataScope?.hasForeignBooks?.(books, accountId)) {
            throw new Error('V1 作品包含其他账号的数据，已拒绝迁移到当前账号 V2');
        }
        const records = {
            works: [],
            volumes: [],
            chapters: [],
            memory_files: [],
            tombstones: []
        };
        const workNameToId = new Map();
        const usedWorkIds = new Set();

        for (const [workOrderIndex, bookName] of Object.keys(books).entries()) {
            const book = books[bookName] && typeof books[bookName] === 'object' && !Array.isArray(books[bookName])
                ? books[bookName]
                : {};
            const rawWorkId = book._bid;
            const workId = await collisionSafeId(
                sourceId(rawWorkId),
                usedWorkIds,
                ['work', accountId, workOrderIndex, rawWorkId || '', bookName],
                ['work-collision', accountId, workOrderIndex, rawWorkId || '', bookName, await sha256(book)]
            );
            workNameToId.set(bookName, workId);
            const workData = cloneValue(book);
            delete workData.volumes;
            const workRecord = await withRecordHash({
                accountId,
                workId,
                name: bookName,
                order: workOrderIndex,
                data: workData
            });
            records.works.push(workRecord);
            if (countTombstoneCandidate(book)) {
                records.tombstones.push(await withRecordHash({
                    accountId,
                    entityType: 'work',
                    entityId: workId,
                    deletedAt: Number(book.deletedAt || book.archivedAt || 0),
                    source: 'v1',
                    data: cloneValue(book)
                }));
            }

            const volumes = Array.isArray(book.volumes) ? book.volumes : [];
            const usedVolumeIds = new Set();
            const usedChapterIds = new Set();
            for (let volumeIndex = 0; volumeIndex < volumes.length; volumeIndex += 1) {
                const volume = volumes[volumeIndex] && typeof volumes[volumeIndex] === 'object'
                    ? volumes[volumeIndex]
                    : {};
                const rawVolumeId = volume._vid ?? volume._v2id;
                const volumeId = await collisionSafeId(
                    sourceId(rawVolumeId),
                    usedVolumeIds,
                    ['volume', workId, volumeIndex, rawVolumeId || '', volume.name || ''],
                    ['volume-collision', workId, volumeIndex, rawVolumeId || '', volume.name || '', await sha256(volume)]
                );
                const volumeData = cloneValue(volume);
                delete volumeData.chapters;
                records.volumes.push(await withRecordHash({
                    accountId,
                    workId,
                    volumeId,
                    name: String(volume.name || ''),
                    order: volumeIndex,
                    data: volumeData
                }));
                if (countTombstoneCandidate(volume)) {
                    records.tombstones.push(await withRecordHash({
                        accountId,
                        entityType: 'volume',
                        entityId: workId + '/' + volumeId,
                        deletedAt: Number(volume.deletedAt || volume.archivedAt || 0),
                        source: 'v1',
                        data: cloneValue(volume)
                    }));
                }

                const chapters = Array.isArray(volume.chapters) ? volume.chapters : [];
                for (let chapterIndex = 0; chapterIndex < chapters.length; chapterIndex += 1) {
                    const chapter = chapters[chapterIndex] && typeof chapters[chapterIndex] === 'object'
                        ? chapters[chapterIndex]
                        : {};
                    const rawChapterId = chapter._localId ?? chapter._cid;
                    const chapterId = await collisionSafeId(
                        sourceId(rawChapterId),
                        usedChapterIds,
                        ['chapter', workId, volumeId, chapterIndex, rawChapterId || '', chapter.name || ''],
                        ['chapter-collision', workId, volumeId, chapterIndex, rawChapterId || '', chapter.name || '', await sha256(chapter)]
                    );
                    const content = String(chapter.content ?? '');
                    const contentHash = await sha256(content);
                    const explicitClear = !!chapter.contentClearedAt || chapter.explicitClear === true;
                    records.chapters.push(await withRecordHash({
                        accountId,
                        workId,
                        volumeId,
                        chapterId,
                        order: chapterIndex,
                        data: cloneValue(chapter),
                        contentHash,
                        explicitClear
                    }));
                    if (countTombstoneCandidate(chapter)) {
                        records.tombstones.push(await withRecordHash({
                            accountId,
                            entityType: 'chapter',
                            entityId: workId + '/' + volumeId + '/' + chapterId,
                            deletedAt: Number(chapter.deletedAt || chapter.archivedAt || 0),
                            source: 'v1',
                            data: cloneValue(chapter)
                        }));
                    }
                }
            }
        }

        let memoryBookOrderIndex = 0;
        for (const bookName of Object.keys(memBooks)) {
            const memoryBook = memBooks[bookName] && typeof memBooks[bookName] === 'object'
                && !Array.isArray(memBooks[bookName])
                ? memBooks[bookName]
                : {};
            const workId = workNameToId.get(bookName)
                || await derivedId(['memory-work', accountId, bookName]);
            records.memory_files.push(await withRecordHash({
                accountId,
                workId,
                bookName,
                bookOrder: memoryBookOrderIndex,
                folderId: '@book',
                entryId: '@book',
                kind: 'memory-book',
                order: -1
            }));
            const usedFolderIds = new Set();
            let folderOrderIndex = 0;
            for (const sourceContainerKey of Object.keys(memoryBook)) {
                const original = memoryBook[sourceContainerKey];
                const folderId = await collisionSafeId(
                    sourceId(sourceContainerKey),
                    usedFolderIds,
                    ['memory-folder', workId, folderOrderIndex, sourceContainerKey, await sha256(original)]
                );
                const common = {
                    accountId,
                    workId,
                    bookName,
                    bookOrder: memoryBookOrderIndex,
                    folderId,
                    sourceContainerKey,
                    folderName: sourceContainerKey,
                    order: folderOrderIndex
                };
                let files = null;
                let containerRecord;
                if (Array.isArray(original)) {
                    files = original;
                    containerRecord = Object.assign({}, common, {
                        entryId: '@container',
                        kind: 'folder',
                        containerKind: 'array',
                        folderData: {}
                    });
                } else if (original && typeof original === 'object' && Array.isArray(original.files)) {
                    files = original.files;
                    containerRecord = Object.assign({}, common, {
                        entryId: '@container',
                        kind: 'folder',
                        containerKind: 'object-with-files',
                        folderData: withoutFields(cloneValue(original), ['files'])
                    });
                } else {
                    containerRecord = Object.assign({}, common, {
                        entryId: '@raw',
                        kind: 'raw-folder',
                        containerKind: 'raw',
                        data: cloneValue(original)
                    });
                }
                records.memory_files.push(await withRecordHash(containerRecord));

                if (files) {
                    const usedFileIds = new Set();
                    for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
                        const file = files[fileIndex] && typeof files[fileIndex] === 'object'
                            ? files[fileIndex]
                            : { value: files[fileIndex] };
                        const rawFileId = file._mid ?? file._id ?? file.id;
                        const fileId = await collisionSafeId(
                            sourceId(rawFileId),
                            usedFileIds,
                            ['memory-file', folderId, fileIndex, rawFileId || '', file.name || '', file.createdAt || ''],
                            ['memory-file-collision', folderId, fileIndex, rawFileId || '', file.name || '', file.createdAt || '', await sha256(file)]
                        );
                        const entryId = 'file:' + fileId;
                        const contentHash = await sha256(String(file.content ?? ''));
                        records.memory_files.push(await withRecordHash(Object.assign({}, common, {
                            entryId,
                            kind: 'file',
                            containerKind: containerRecord.containerKind,
                            order: fileIndex,
                            data: cloneValue(file),
                            contentHash
                        })));
                        if (countTombstoneCandidate(file)) {
                            records.tombstones.push(await withRecordHash({
                                accountId,
                                entityType: 'memory_file',
                                entityId: workId + '/' + folderId + '/' + entryId,
                                deletedAt: Number(file.deletedAt || file.archivedAt || 0),
                                source: 'v1',
                                data: cloneValue(file)
                            }));
                        }
                    }
                }
                folderOrderIndex += 1;
            }
            memoryBookOrderIndex += 1;
        }

        const manifestBase = await computeManifestFromRecords(records, false);
        const manifestHash = await sha256(manifestBase);
        return {
            accountId,
            source: { books, memBooks },
            records,
            timestamps: {
                v1BooksUpdatedAt: Number(timestamps?.v1BooksUpdatedAt || 0),
                v1MemoryUpdatedAt: Number(timestamps?.v1MemoryUpdatedAt || 0)
            },
            manifest: Object.assign({}, manifestBase, { verified: false }),
            manifestHash
        };
    }

    function byOrder(a, b) {
        return Number(a?.order || 0) - Number(b?.order || 0);
    }

    function rebuildV1(projection) {
        const records = projection?.records || projection || {};
        const works = Array.isArray(records.works) ? records.works.slice().sort(byOrder) : [];
        const volumes = Array.isArray(records.volumes) ? records.volumes.slice().sort(byOrder) : [];
        const chapters = Array.isArray(records.chapters) ? records.chapters.slice().sort(byOrder) : [];
        const memoryFiles = Array.isArray(records.memory_files) ? records.memory_files.slice() : [];
        const books = {};
        const workObjects = new Map();
        const volumeObjects = new Map();

        works.forEach(function(record) {
            const book = cloneValue(record.data || {});
            book.volumes = [];
            books[record.name] = book;
            workObjects.set(record.workId, book);
        });
        volumes.forEach(function(record) {
            const book = workObjects.get(record.workId);
            if (!book) throw new Error('V2 回建缺少作品');
            const volume = cloneValue(record.data || {});
            volume.chapters = [];
            book.volumes.push(volume);
            volumeObjects.set(record.workId + '\n' + record.volumeId, volume);
        });
        chapters.forEach(function(record) {
            const volume = volumeObjects.get(record.workId + '\n' + record.volumeId);
            if (!volume) throw new Error('V2 回建缺少卷');
            volume.chapters.push(cloneValue(record.data || {}));
        });

        const memBooks = {};
        memoryFiles
            .filter(function(record) { return record.kind === 'memory-book'; })
            .sort(function(a, b) {
                return Number(a.bookOrder || 0) - Number(b.bookOrder || 0)
                    || String(a.bookName || '').localeCompare(String(b.bookName || ''));
            })
            .forEach(function(record) {
                if (!Object.prototype.hasOwnProperty.call(memBooks, String(record.bookName || ''))) {
                    memBooks[String(record.bookName || '')] = {};
                }
            });
        const containers = memoryFiles
            .filter(function(record) { return record.kind === 'folder' || record.kind === 'raw-folder'; })
            .sort(function(a, b) {
                return Number(a.bookOrder || 0) - Number(b.bookOrder || 0)
                    || Number(a.order || 0) - Number(b.order || 0)
                    || String(a.folderId || '').localeCompare(String(b.folderId || ''));
            });
        containers.forEach(function(container) {
            const bookName = String(container.bookName || '');
            const folderKey = String(container.sourceContainerKey ?? '');
            if (!memBooks[bookName]) memBooks[bookName] = {};
            if (container.kind === 'raw-folder') {
                memBooks[bookName][folderKey] = cloneValue(container.data);
                return;
            }
            const files = memoryFiles
                .filter(function(record) {
                    return record.kind === 'file'
                        && record.workId === container.workId
                        && record.folderId === container.folderId;
                })
                .sort(byOrder)
                .map(function(record) { return cloneValue(record.data); });
            if (container.containerKind === 'object-with-files') {
                memBooks[bookName][folderKey] = Object.assign({}, cloneValue(container.folderData || {}), { files });
            } else {
                memBooks[bookName][folderKey] = files;
            }
        });
        return { books, memBooks };
    }

    function sameCollectionKeyOrder(source, rebuilt) {
        const sameKeys = function(left, right) {
            return JSON.stringify(Object.keys(left || {})) === JSON.stringify(Object.keys(right || {}));
        };
        if (!sameKeys(source?.books, rebuilt?.books) || !sameKeys(source?.memBooks, rebuilt?.memBooks)) return false;
        for (const bookName of Object.keys(source?.memBooks || {})) {
            if (!sameKeys(source.memBooks[bookName], rebuilt.memBooks?.[bookName])) return false;
        }
        return true;
    }

    async function verifyProjection(projection) {
        for (const storeName of PROJECTION_STORES) {
            for (const record of projection.records[storeName] || []) {
                const expected = await sha256(withoutFields(record, ['recordHash']));
                if (expected !== record.recordHash) throw new Error('V2 记录哈希校验失败：' + storeName);
            }
        }
        const recomputedManifest = await computeManifestFromRecords(
            projection.records,
            projection.manifest?.v1RebuildEqual === true
        );
        const storedComparable = withoutFields(projection.manifest || {}, ['verified', 'v1RebuildEqual']);
        const recomputedComparable = withoutFields(recomputedManifest, ['v1RebuildEqual']);
        if (canonicalJson(storedComparable) !== canonicalJson(recomputedComparable)) {
            throw new Error('V2 清单计数、内容哈希或顺序哈希不一致');
        }
        const currentManifestHash = await sha256(recomputedManifest);
        if (String(projection.manifestHash || '') !== currentManifestHash) {
            throw new Error('V2 清单哈希不一致');
        }
        const rebuilt = rebuildV1(projection);
        const booksEqual = canonicalJson(rebuilt.books) === canonicalJson(projection.source.books);
        const memoryEqual = canonicalJson(rebuilt.memBooks) === canonicalJson(projection.source.memBooks);
        const collectionOrderEqual = sameCollectionKeyOrder(projection.source, rebuilt);
        if (!booksEqual || !memoryEqual || !collectionOrderEqual) throw new Error('V2 回建与 V1 原数据或顺序不一致');
        const verifiedManifest = await computeManifestFromRecords(projection.records, true);
        projection.manifest = Object.assign({}, verifiedManifest, { verified: true });
        projection.manifestHash = await sha256(verifiedManifest);
        return { rebuilt, manifest: cloneValue(projection.manifest), manifestHash: projection.manifestHash };
    }

    function requestPromise(request) {
        return new Promise(function(resolve, reject) {
            request.onsuccess = function() { resolve(request.result); };
            request.onerror = function() { reject(request.error || new Error('IndexedDB 请求失败')); };
        });
    }

    function transactionPromise(tx) {
        return new Promise(function(resolve, reject) {
            tx.oncomplete = function() { resolve(true); };
            tx.onerror = function() { reject(tx.error || new Error('IndexedDB 事务失败')); };
            tx.onabort = function() { reject(tx.error || new Error('IndexedDB 事务已取消')); };
        });
    }

    function ensureSchema(upgradeDb, transaction) {
        Object.entries(STORE_DEFINITIONS).forEach(function(entry) {
            const storeName = entry[0];
            const definition = entry[1];
            const store = upgradeDb.objectStoreNames.contains(storeName)
                ? transaction.objectStore(storeName)
                : upgradeDb.createObjectStore(storeName, { keyPath: definition.keyPath });
            definition.indexes.forEach(function(indexDefinition) {
                const indexName = indexDefinition[0];
                if (!store.indexNames.contains(indexName)) {
                    store.createIndex(indexName, indexDefinition[1], { unique: false });
                }
            });
        });
        if (!upgradeDb.objectStoreNames.contains('kv')) upgradeDb.createObjectStore('kv');
    }

    function closeDatabase() {
        if (!db) return;
        try { db.close(); } catch(error) {}
        db = null;
    }

    function setState(accountId, patch) {
        const previous = accountStates.get(accountId) || {
            accountId,
            status: 'v1',
            readMode: 'v1',
            issue: '',
            updatedAt: 0
        };
        const next = Object.assign({}, previous, patch || {}, { updatedAt: Date.now() });
        accountStates.set(accountId, next);
        lastIssue = next.issue || '';
        try {
            window.dispatchEvent(new CustomEvent('zhiyu:storage-v2-state', { detail: cloneValue(next) }));
        } catch(error) {}
        return next;
    }

    function attachDatabase(connection) {
        db = connection;
        db.onversionchange = function() {
            closeDatabase();
            try {
                window.ZHIYU_TOAST?.warn?.('其他标签页更新了本机储存结构，请刷新页面重新对账');
            } catch(error) {}
            accountStates.forEach(function(_, accountId) {
                setState(accountId, {
                    status: 'needs_reconcile',
                    readMode: 'v1',
                    issue: '其他标签页更新了本机储存结构，请刷新页面重新对账'
                });
            });
        };
        return db;
    }

    function openVersion2() {
        return new Promise(function(resolve, reject) {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            let settled = false;
            request.onupgradeneeded = function() {
                ensureSchema(request.result, request.transaction);
            };
            request.onblocked = function() {
                lastIssue = '请关闭其他知屿旧标签页后刷新重试';
                try { window.ZHIYU_TOAST?.warn?.(lastIssue); } catch(error) {}
                try {
                    channel?.postMessage({ type: 'upgrade-blocked', message: lastIssue, at: Date.now() });
                } catch(error) {}
                if (!settled) {
                    settled = true;
                    reject(new Error(lastIssue));
                }
            };
            request.onsuccess = function() {
                if (settled) {
                    request.result.close();
                    return;
                }
                settled = true;
                resolve(attachDatabase(request.result));
            };
            request.onerror = function() {
                if (!settled) {
                    settled = true;
                    reject(request.error || new Error('无法打开储存 V2'));
                }
            };
        });
    }

    async function withUpgradeLock(task) {
        if (navigator.locks && typeof navigator.locks.request === 'function') {
            return navigator.locks.request(UPGRADE_LOCK_NAME, { mode: 'exclusive' }, task);
        }
        return task();
    }

    async function ensureDatabase(accountIdInput) {
        const accountId = normalizeAccountId(accountIdInput);
        if (db && db.version >= DB_VERSION) return db;
        if (databaseOpenPromise) return databaseOpenPromise;
        databaseOpenPromise = withUpgradeLock(async function() {
            try {
                channel?.postMessage({ type: 'upgrade-request', accountId, at: Date.now() });
            } catch(error) {}
            window.ZHIYU_IDB?.close?.();
            try {
                return await openVersion2();
            } catch(error) {
                setState(accountId, {
                    status: String(error?.message || '').includes('旧标签页') ? 'upgrade_blocked' : 'needs_reconcile',
                    readMode: 'v1',
                    issue: String(error?.message || error)
                });
                try { window.ZHIYU_TOAST?.warn?.(String(error?.message || error)); } catch(toastError) {}
                throw error;
            }
        });
        try {
            return await databaseOpenPromise;
        } finally {
            databaseOpenPromise = null;
        }
    }

    async function waitForDatabaseReady() {
        if (!databaseOpenPromise) return db;
        try {
            return await databaseOpenPromise;
        } catch(error) {
            return null;
        }
    }

    async function estimateCapacityFromBytes(sourceBytes) {
        const requiredBytes = Math.max(MIN_REQUIRED_BYTES, Math.ceil(sourceBytes * CAPACITY_FACTOR));
        if (!navigator.storage || typeof navigator.storage.estimate !== 'function') {
            return { ok: false, sourceBytes, requiredBytes, availableBytes: null, issue: '浏览器未提供储存容量估算' };
        }
        const estimate = await navigator.storage.estimate();
        if (!Number.isFinite(estimate?.quota) || !Number.isFinite(estimate?.usage)) {
            return { ok: false, sourceBytes, requiredBytes, availableBytes: null, issue: '浏览器储存容量信息不完整' };
        }
        const availableBytes = Math.max(0, estimate.quota - estimate.usage);
        return {
            ok: availableBytes >= requiredBytes,
            sourceBytes,
            requiredBytes,
            availableBytes,
            issue: availableBytes >= requiredBytes ? '' : '本机可用空间不足，已继续使用旧储存'
        };
    }

    async function estimateCapacity(books, memBooks) {
        return estimateCapacityFromBytes(jsonBytes({ books, memBooks }));
    }

    async function deleteAccountRecords(store, accountId) {
        return new Promise(function(resolve, reject) {
            const request = store.openCursor();
            request.onsuccess = function() {
                const cursor = request.result;
                if (!cursor) {
                    resolve(true);
                    return;
                }
                if (cursor.value?.accountId === accountId) cursor.delete();
                cursor.continue();
            };
            request.onerror = function() {
                reject(request.error || new Error('清理旧影子记录失败'));
            };
        });
    }

    async function writeProjectionTransaction(database, projection, v1Entries, options) {
        const storeNames = ['kv'].concat(ALL_V2_STORES);
        const tx = database.transaction(storeNames, 'readwrite');
        const accountId = projection.accountId;
        const completion = transactionPromise(tx);
        const writerFence = options?.writerFence;
        if (writerFence?.key && writerFence?.leaseId) {
            const currentFence = await requestPromise(tx.objectStore('kv').get(String(writerFence.key)));
            if (String(currentFence?.leaseId || '') !== String(writerFence.leaseId)) {
                try { tx.abort(); } catch(error) {}
                await completion.catch(function() {});
                const fenced = new Error('本机写入代次已变化，旧整库事务已取消');
                fenced.code = 'ACCOUNT_WRITER_FENCE_CHANGED';
                throw fenced;
            }
        }
        for (const storeName of PROJECTION_STORES) {
            await deleteAccountRecords(tx.objectStore(storeName), accountId);
        }
        await deleteAccountRecords(tx.objectStore('migration_receipts'), accountId);
        for (const storeName of PROJECTION_STORES) {
            const store = tx.objectStore(storeName);
            for (const record of projection.records[storeName]) store.put(record);
        }
        for (const entry of Array.isArray(v1Entries) ? v1Entries : []) {
            if (Array.isArray(entry) && entry.length >= 2 && entry[0]) {
                tx.objectStore('kv').put(entry[1], String(entry[0]));
            }
        }
        const migrationId = String(options?.migrationId || ('migration-' + Date.now() + '-' + Math.random().toString(16).slice(2)));
        const createdAt = Number(options?.createdAt || Date.now());
        const pendingReceipt = {
            accountId,
            migrationId,
            status: 'migrating',
            manifest: cloneValue(projection.manifest),
            manifestHash: projection.manifestHash,
            v1RebuildHash: '',
            error: '',
            createdAt
        };
        tx.objectStore('migration_receipts').put(pendingReceipt);
        tx.objectStore('storage_meta').put({
            accountId,
            schemaVersion: DB_VERSION,
            status: 'migrating',
            readMode: 'v1',
            v1BooksUpdatedAt: projection.timestamps.v1BooksUpdatedAt,
            v1MemoryUpdatedAt: projection.timestamps.v1MemoryUpdatedAt,
            migrationId,
            issue: '',
            updatedAt: createdAt
        });
        const transactionFault = consumeTestFault('v2-transaction-abort');
        if (transactionFault) {
            try { tx.abort(); } catch(error) {}
            await completion.catch(function() {});
            throw transactionFault;
        }
        await completion;
        return { migrationId, createdAt };
    }

    async function getAllForAccount(database, storeName, accountId) {
        const tx = database.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.indexNames.contains('accountId')
            ? store.index('accountId').getAll(IDBKeyRange.only(accountId))
            : store.getAll();
        const values = await requestPromise(request);
        await transactionPromise(tx);
        return (values || []).filter(function(record) { return record?.accountId === accountId; });
    }

    async function readProjection(database, accountIdInput) {
        const accountId = normalizeAccountId(accountIdInput);
        const records = {};
        for (const storeName of PROJECTION_STORES) {
            records[storeName] = await getAllForAccount(database, storeName, accountId);
        }
        return { accountId, records };
    }

    function getAllForAccountRequest(store, accountId) {
        return store.indexNames.contains('accountId')
            ? store.index('accountId').getAll(IDBKeyRange.only(accountId))
            : store.getAll();
    }

    async function failPreferredRead(accountId, issue, error) {
        const message = String(issue || error?.message || error || '本机 V2 校验未通过，已安全使用旧储存');
        await markNeedsReconcile(accountId, message);
        try { window.ZHIYU_TOAST?.warn?.('本机 V2 校验未通过，已安全使用旧储存'); } catch(toastError) {}
        return { ok: false, source: 'v1', reason: 'verification-failed', issue: message, error };
    }

    async function readPreferredAccount(accountIdInput) {
        const accountId = normalizeAccountId(accountIdInput);
        if (!V2_PREFERRED_READ_ENABLED) {
            return { ok: false, source: 'v1', reason: 'preferred-read-disabled' };
        }
        try {
            const database = await ensureDatabase(accountId);
            const keys = getV1Keys(accountId);
            const storeNames = ['kv', 'storage_meta', 'migration_receipts'].concat(PROJECTION_STORES);
            const tx = database.transaction(storeNames, 'readonly');
            const completion = transactionPromise(tx);
            const kv = tx.objectStore('kv');
            const metaStore = tx.objectStore('storage_meta');
            const receiptStore = tx.objectStore('migration_receipts');
            const projectionRequests = {};
            PROJECTION_STORES.forEach(function(storeName) {
                projectionRequests[storeName] = requestPromise(
                    getAllForAccountRequest(tx.objectStore(storeName), accountId)
                );
            });
            const [meta, books, memBooks, booksUpdatedAt, memoryUpdatedAt, receipts] = await Promise.all([
                requestPromise(metaStore.get(accountId)),
                requestPromise(kv.get(keys.books)),
                requestPromise(kv.get(keys.memory)),
                requestPromise(kv.get(keys.booksUpdatedAt)),
                requestPromise(kv.get(keys.memoryUpdatedAt)),
                requestPromise(getAllForAccountRequest(receiptStore, accountId))
            ]);
            const records = {};
            for (const storeName of PROJECTION_STORES) {
                records[storeName] = (await projectionRequests[storeName] || [])
                    .filter(function(record) { return record?.accountId === accountId; });
            }
            await completion;

            if (!meta || meta.status !== 'verified') {
                if (meta) {
                    setState(accountId, {
                        status: String(meta.status || 'v1'),
                        readMode: 'v1',
                        issue: String(meta.issue || ''),
                        migrationId: String(meta.migrationId || '')
                    });
                }
                return { ok: false, source: 'v1', reason: 'not-verified' };
            }
            const currentBooksUpdatedAt = Number(booksUpdatedAt || 0);
            const currentMemoryUpdatedAt = Number(memoryUpdatedAt || 0);
            if (
                currentBooksUpdatedAt !== Number(meta.v1BooksUpdatedAt || 0)
                || currentMemoryUpdatedAt !== Number(meta.v1MemoryUpdatedAt || 0)
            ) {
                return failPreferredRead(accountId, 'V1 时间已变化，V2 需要重新对账');
            }
            const receipt = (receipts || []).find(function(candidate) {
                return candidate?.accountId === accountId
                    && candidate.status === 'verified'
                    && candidate.migrationId === meta.migrationId;
            });
            if (
                !receipt
                || receipt.manifest?.verified !== true
                || receipt.manifest?.v1RebuildEqual !== true
                || !receipt.manifestHash
            ) {
                return failPreferredRead(accountId, 'V2 verified 收据缺失或不完整');
            }
            const source = {
                books: books && typeof books === 'object' && !Array.isArray(books) ? books : {},
                memBooks: memBooks && typeof memBooks === 'object' && !Array.isArray(memBooks) ? memBooks : {}
            };
            const projection = {
                accountId,
                source,
                records,
                timestamps: {
                    v1BooksUpdatedAt: currentBooksUpdatedAt,
                    v1MemoryUpdatedAt: currentMemoryUpdatedAt
                },
                manifest: cloneValue(receipt.manifest),
                manifestHash: String(receipt.manifestHash || '')
            };
            const verification = await verifyProjection(projection);
            const v1RebuildHash = await sha256(verification.rebuilt);
            if (String(receipt.v1RebuildHash || '') !== v1RebuildHash) {
                return failPreferredRead(accountId, 'V2 回建摘要与 verified 收据不一致');
            }
            if (consumeTestFault('preferred-read-delay')) {
                try {
                    window.dispatchEvent(new CustomEvent('zhiyu:storage-v2-test-stage', {
                        detail: { stage: 'preferred-read-verified', accountId }
                    }));
                } catch(error) {}
                await new Promise(function(resolve) { setTimeout(resolve, 75); });
            }
            const finalFreshness = await readFreshnessSnapshot(accountId);
            if (
                !finalFreshness?.meta
                || finalFreshness.meta.status !== 'verified'
                || finalFreshness.meta.migrationId !== meta.migrationId
                || finalFreshness.v1BooksUpdatedAt !== currentBooksUpdatedAt
                || finalFreshness.v1MemoryUpdatedAt !== currentMemoryUpdatedAt
            ) {
                return failPreferredRead(accountId, 'V2 校验期间 V1 或迁移状态发生变化');
            }
            setState(accountId, {
                status: 'verified',
                readMode: 'v2-preferred',
                issue: '',
                migrationId: meta.migrationId,
                manifest: verification.manifest,
                manifestHash: verification.manifestHash,
                v1BooksUpdatedAt: currentBooksUpdatedAt,
                v1MemoryUpdatedAt: currentMemoryUpdatedAt
            });
            return {
                ok: true,
                source: 'v2',
                accountId,
                books: verification.rebuilt.books,
                memBooks: verification.rebuilt.memBooks,
                timestamps: {
                    v1BooksUpdatedAt: currentBooksUpdatedAt,
                    v1MemoryUpdatedAt: currentMemoryUpdatedAt
                },
                manifest: verification.manifest,
                manifestHash: verification.manifestHash,
                migrationId: meta.migrationId
            };
        } catch(error) {
            if (accountStates.get(accountId)?.status === 'upgrade_blocked') {
                return { ok: false, source: 'v1', reason: 'upgrade-blocked', error };
            }
            return failPreferredRead(accountId, '', error);
        }
    }

    async function finalizeVerified(database, projection, migrationInfo, writerFence) {
        const readBack = await readProjection(database, projection.accountId);
        const missingReadBackFault = consumeTestFault('readback-missing-record');
        if (missingReadBackFault) {
            const targetStore = ['tombstones', 'chapters', 'memory_files', 'volumes', 'works']
                .find(function(storeName) { return readBack.records[storeName]?.length; });
            if (targetStore) readBack.records[targetStore].pop();
            else throw missingReadBackFault;
        }
        const missingTombstoneFault = consumeTestFault('readback-missing-tombstone');
        if (missingTombstoneFault) {
            if (readBack.records.tombstones?.length) readBack.records.tombstones.pop();
            else throw missingTombstoneFault;
        }
        const verifiedProjection = Object.assign({}, projection, { records: readBack.records });
        const verification = await verifyProjection(verifiedProjection);
        const v1RebuildHash = await sha256(verification.rebuilt);
        if (consumeTestFault('before-finalize-delay')) {
            await new Promise(function(resolve) { setTimeout(resolve, 75); });
        }
        const timestampKeys = getV1TimestampKeys(projection.accountId);
        const tx = database.transaction(['kv', 'storage_meta', 'migration_receipts'], 'readwrite');
        const completion = transactionPromise(tx);
        const kv = tx.objectStore('kv');
        if (writerFence?.key && writerFence?.leaseId) {
            const currentFence = await requestPromise(kv.get(String(writerFence.key)));
            if (String(currentFence?.leaseId || '') !== String(writerFence.leaseId)) {
                try { tx.abort(); } catch(error) {}
                await completion.catch(function() {});
                const fenced = new Error('本机写入代次已变化，旧迁移确认已取消');
                fenced.code = 'ACCOUNT_WRITER_FENCE_CHANGED';
                throw fenced;
            }
        }
        const currentBooksUpdatedAt = Number(await requestPromise(kv.get(timestampKeys.books)) || 0);
        const currentMemoryUpdatedAt = Number(await requestPromise(kv.get(timestampKeys.memory)) || 0);
        if (
            currentBooksUpdatedAt !== Number(projection.timestamps.v1BooksUpdatedAt || 0)
            || currentMemoryUpdatedAt !== Number(projection.timestamps.v1MemoryUpdatedAt || 0)
        ) {
            try { tx.abort(); } catch(error) {}
            await completion.catch(function() {});
            const changed = new Error('迁移校验期间旧储存发生变化，已保留 V1 并等待重新对账');
            changed.code = 'V1_CHANGED_DURING_MIGRATION';
            throw changed;
        }
        tx.objectStore('migration_receipts').put({
            accountId: projection.accountId,
            migrationId: migrationInfo.migrationId,
            status: 'verified',
            manifest: verification.manifest,
            manifestHash: verification.manifestHash,
            v1RebuildHash,
            error: '',
            createdAt: migrationInfo.createdAt
        });
        tx.objectStore('storage_meta').put({
            accountId: projection.accountId,
            schemaVersion: DB_VERSION,
            status: 'verified',
            readMode: V2_PREFERRED_READ_ENABLED ? 'v2-preferred' : 'v1',
            v1BooksUpdatedAt: projection.timestamps.v1BooksUpdatedAt,
            v1MemoryUpdatedAt: projection.timestamps.v1MemoryUpdatedAt,
            migrationId: migrationInfo.migrationId,
            issue: '',
            updatedAt: Date.now()
        });
        await completion;
        setState(projection.accountId, {
            status: 'verified',
            readMode: V2_PREFERRED_READ_ENABLED ? 'v2-preferred' : 'v1',
            issue: '',
            migrationId: migrationInfo.migrationId,
            manifest: verification.manifest,
            manifestHash: verification.manifestHash,
            v1BooksUpdatedAt: projection.timestamps.v1BooksUpdatedAt,
            v1MemoryUpdatedAt: projection.timestamps.v1MemoryUpdatedAt
        });
        return verification;
    }

    async function migrateAccount(options) {
        const accountId = normalizeAccountId(options?.accountId);
        setState(accountId, { status: 'checking', readMode: 'v1', issue: '' });
        try {
            const source = cloneValue({
                books: options?.books || {},
                memBooks: options?.memBooks || {}
            });
            const books = source.books;
            const memBooks = source.memBooks;
            const capacity = await estimateCapacity(books, memBooks);
            if (!capacity.ok) {
                setState(accountId, {
                    status: 'needs_reconcile',
                    readMode: 'v1',
                    issue: capacity.issue,
                    capacity
                });
                return { ok: false, reason: 'capacity', capacity };
            }
            const projection = await buildProjection(accountId, books, memBooks, options?.timestamps);
            await verifyProjection(cloneValue(projection));
            const database = await ensureDatabase(accountId);
            const writerFence = options?.writerFence || null;
            const migrationInfo = await writeProjectionTransaction(database, projection, [], { writerFence });
            const postWriteFault = consumeTestFault('after-shadow-commit');
            if (postWriteFault) throw postWriteFault;
            const verification = await finalizeVerified(database, projection, migrationInfo, writerFence);
            return { ok: true, accountId, capacity, verification };
        } catch(error) {
            const existing = accountStates.get(accountId);
            const upgradeBlocked = existing?.status === 'upgrade_blocked';
            setState(accountId, {
                status: upgradeBlocked ? 'upgrade_blocked' : 'needs_reconcile',
                readMode: 'v1',
                issue: upgradeBlocked ? existing.issue : String(error?.message || error)
            });
            if (!upgradeBlocked && error?.code !== 'ACCOUNT_WRITER_FENCE_CHANGED') {
                await markNeedsReconcile(accountId, String(error?.message || error));
            }
            return { ok: false, reason: 'migration-failed', error };
        }
    }

    function scheduleMigration(options) {
        const accountId = normalizeAccountId(options?.accountId);
        if (pendingMigrations.has(accountId)) return pendingMigrations.get(accountId);
        const task = Promise.resolve()
            .then(function() { return migrateAccount(Object.assign({}, options, { accountId })); })
            .finally(function() { pendingMigrations.delete(accountId); });
        pendingMigrations.set(accountId, task);
        return task;
    }

    function isDualWriteReady(accountIdInput) {
        return accountStates.get(normalizeAccountId(accountIdInput))?.status === 'verified';
    }

    async function dualWrite(options) {
        const accountId = normalizeAccountId(options?.accountId);
        if (!isDualWriteReady(accountId)) return { participated: false, ok: false };
        const directFault = consumeTestFault('dual-write');
        if (directFault) throw directFault;
        if (consumeTestFault('dual-write-delay')) {
            await new Promise(function(resolve) { setTimeout(resolve, 50); });
        }
        const capacity = await estimateCapacity(options?.books || {}, options?.memBooks || {});
        if (!capacity.ok) {
            const error = new Error(capacity.issue || '本机空间不足，V2 双写已跳过');
            error.name = 'QuotaExceededError';
            throw error;
        }
        const projection = await buildProjection(accountId, options?.books || {}, options?.memBooks || {}, options?.timestamps);
        await verifyProjection(cloneValue(projection));
        const database = await ensureDatabase(accountId);
        let v1Committed = false;
        try {
            const migrationInfo = await writeProjectionTransaction(
                database,
                projection,
                options?.v1Entries || [],
                {
                    migrationId: 'dual-' + Date.now() + '-' + Math.random().toString(16).slice(2),
                    writerFence: options?.writerFence || null
                }
            );
            v1Committed = true;
            const postWriteFault = consumeTestFault('after-shadow-commit');
            if (postWriteFault) throw postWriteFault;
            const verification = await finalizeVerified(
                database,
                projection,
                migrationInfo,
                options?.writerFence || null
            );
            broadcastV1Updated(accountId, Math.max(
                projection.timestamps.v1BooksUpdatedAt,
                projection.timestamps.v1MemoryUpdatedAt
            ));
            return { participated: true, ok: true, verification };
        } catch(error) {
            if (v1Committed && error && typeof error === 'object') error.v1Committed = true;
            throw error;
        }
    }

    async function markNeedsReconcile(accountIdInput, issue) {
        const accountId = normalizeAccountId(accountIdInput);
        setState(accountId, { status: 'needs_reconcile', readMode: 'v1', issue: String(issue || 'V2 需要重新对账') });
        try {
            const database = await ensureDatabase(accountId);
            const tx = database.transaction('storage_meta', 'readwrite');
            const store = tx.objectStore('storage_meta');
            const current = await requestPromise(store.get(accountId));
            store.put(Object.assign({}, current || {}, {
                accountId,
                schemaVersion: DB_VERSION,
                status: 'needs_reconcile',
                readMode: 'v1',
                issue: String(issue || 'V2 需要重新对账'),
                updatedAt: Date.now()
            }));
            await transactionPromise(tx);
        } catch(error) {}
        return true;
    }

    function sanitizeRuntime(runtime, accountId, reason, createdAt) {
        const chapter = runtime?.chapter || {};
        const editor = runtime?.editor || {};
        const selection = runtime?.selection || {};
        const output = {
            accountId,
            bookName: String(runtime?.bookName || chapter.book || ''),
            bookId: String(runtime?.bookId || ''),
            volumeId: String(runtime?.volumeId || ''),
            chapterId: String(runtime?.chapterId || ''),
            selection: {
                start: Number.isFinite(Number(selection.start)) ? Number(selection.start) : 0,
                end: Number.isFinite(Number(selection.end)) ? Number(selection.end) : 0
            },
            editor: {
                text: String(editor.text || ''),
                html: String(editor.html || ''),
                cursorStart: Number.isFinite(Number(editor.cursorStart)) ? Number(editor.cursorStart) : 0,
                cursorEnd: Number.isFinite(Number(editor.cursorEnd)) ? Number(editor.cursorEnd) : 0
            },
            chapterSyncPaused: runtime?.chapterSyncPaused === true,
            reason: String(reason || 'cloud-restore'),
            createdAt
        };
        cloneValue(output);
        return output;
    }

    async function createRestoreSnapshot(options) {
        const accountId = normalizeAccountId(options?.accountId);
        const consumeValues = options?.consumeValues === true;
        const books = consumeValues
            ? (options?.books || {})
            : cloneValue(options?.books || {});
        const memBooks = consumeValues
            ? (options?.memBooks || {})
            : cloneValue(options?.memBooks || {});
        const reason = String(options?.reason || 'cloud-restore');
        const createdAt = Date.now();
        const runtime = sanitizeRuntime(options?.runtime || {}, accountId, reason, createdAt);
        const digestSource = { accountId, books, memBooks, runtime, reason, createdAt };
        const digest = await createSnapshotDigest(digestSource);
        const capacity = await estimateCapacityFromBytes(digest.byteLength);
        if (!capacity.ok) throw new Error(capacity.issue || '恢复前快照空间不足');
        const database = await ensureDatabase(accountId);
        const snapshotId = 'snapshot-' + createdAt + '-' + Math.random().toString(16).slice(2);
        const manifestHash = digest.hash;
        const record = {
            accountId,
            snapshotId,
            reason,
            books,
            memBooks,
            runtime,
            manifestHash,
            createdAt
        };
        if (digest.algorithm !== 'canonical-sha256-v1') {
            record.manifestAlgorithm = digest.algorithm;
        }
        const snapshotFault = consumeTestFault('snapshot-write');
        if (snapshotFault) throw snapshotFault;
        const tx = database.transaction('snapshots', 'readwrite');
        tx.objectStore('snapshots').put(record);
        await transactionPromise(tx);
        return {
            ok: true,
            accountId,
            snapshotId,
            manifestHash,
            manifestAlgorithm: digest.algorithm,
            createdAt
        };
    }

    function broadcastV1Updated(accountIdInput, updatedAt) {
        const accountId = normalizeAccountId(accountIdInput);
        try {
            channel?.postMessage({ type: 'v1-updated', accountId, updatedAt: Number(updatedAt || Date.now()) });
        } catch(error) {}
    }

    async function getMeta(accountIdInput) {
        const accountId = normalizeAccountId(accountIdInput);
        try {
            const database = await ensureDatabase(accountId);
            const tx = database.transaction('storage_meta', 'readonly');
            const value = await requestPromise(tx.objectStore('storage_meta').get(accountId));
            await transactionPromise(tx);
            return value || null;
        } catch(error) {
            return null;
        }
    }

    async function readFreshnessSnapshot(accountIdInput) {
        const accountId = normalizeAccountId(accountIdInput);
        const readFromConnection = async function(connection, closeAfterRead) {
            if (
                connection.version < DB_VERSION
                || !connection.objectStoreNames.contains('kv')
                || !connection.objectStoreNames.contains('storage_meta')
            ) {
                if (closeAfterRead) connection.close();
                return null;
            }
            try {
                const timestampKeys = getV1TimestampKeys(accountId);
                const tx = connection.transaction(['kv', 'storage_meta'], 'readonly');
                const completion = transactionPromise(tx);
                const kv = tx.objectStore('kv');
                const metaStore = tx.objectStore('storage_meta');
                const [meta, booksUpdatedAt, memoryUpdatedAt] = await Promise.all([
                    requestPromise(metaStore.get(accountId)),
                    requestPromise(kv.get(timestampKeys.books)),
                    requestPromise(kv.get(timestampKeys.memory))
                ]);
                await completion;
                if (closeAfterRead) connection.close();
                return {
                    meta: meta || null,
                    v1BooksUpdatedAt: Number(booksUpdatedAt || 0),
                    v1MemoryUpdatedAt: Number(memoryUpdatedAt || 0)
                };
            } catch(error) {
                if (closeAfterRead) connection.close();
                return null;
            }
        };
        if (db && db.version >= DB_VERSION) return readFromConnection(db, false);
        return new Promise(function(resolve) {
            const request = indexedDB.open(DB_NAME);
            request.onerror = function() { resolve(null); };
            request.onsuccess = function() {
                readFromConnection(request.result, true).then(resolve, function() { resolve(null); });
            };
        });
    }

    async function readMigrationSnapshot(accountIdInput) {
        const accountId = normalizeAccountId(accountIdInput);
        const database = await ensureDatabase(accountId);
        const keys = getV1Keys(accountId);
        const tx = database.transaction('kv', 'readonly');
        const completion = transactionPromise(tx);
        const kv = tx.objectStore('kv');
        const [books, memBooks, booksUpdatedAt, memoryUpdatedAt] = await Promise.all([
            requestPromise(kv.get(keys.books)),
            requestPromise(kv.get(keys.memory)),
            requestPromise(kv.get(keys.booksUpdatedAt)),
            requestPromise(kv.get(keys.memoryUpdatedAt))
        ]);
        await completion;
        if (consumeTestFault('migration-snapshot-delay')) {
            try {
                window.dispatchEvent(new CustomEvent('zhiyu:storage-v2-test-stage', {
                    detail: { stage: 'migration-snapshot-read', accountId }
                }));
            } catch(error) {}
            await new Promise(function(resolve) { setTimeout(resolve, 75); });
        }
        return {
            accountId,
            books: cloneValue(books && typeof books === 'object' && !Array.isArray(books) ? books : {}),
            memBooks: cloneValue(memBooks && typeof memBooks === 'object' && !Array.isArray(memBooks) ? memBooks : {}),
            timestamps: {
                v1BooksUpdatedAt: Number(booksUpdatedAt || 0),
                v1MemoryUpdatedAt: Number(memoryUpdatedAt || 0)
            }
        };
    }

    async function checkV1Freshness(options) {
        const accountId = normalizeAccountId(options?.accountId);
        const snapshot = await readFreshnessSnapshot(accountId);
        const meta = snapshot?.meta || null;
        if (!meta || meta.status !== 'verified') {
            if (meta) {
                setState(accountId, {
                    status: String(meta.status || 'v1'),
                    readMode: 'v1',
                    issue: String(meta.issue || ''),
                    migrationId: String(meta.migrationId || ''),
                    v1BooksUpdatedAt: Number(meta.v1BooksUpdatedAt || 0),
                    v1MemoryUpdatedAt: Number(meta.v1MemoryUpdatedAt || 0)
                });
            }
            return { fresh: false, reason: 'not-verified', meta };
        }
        const currentBooksUpdatedAt = Number(snapshot.v1BooksUpdatedAt || 0);
        const currentMemoryUpdatedAt = Number(snapshot.v1MemoryUpdatedAt || 0);
        const fresh = currentBooksUpdatedAt === Number(meta.v1BooksUpdatedAt || 0)
            && currentMemoryUpdatedAt === Number(meta.v1MemoryUpdatedAt || 0);
        if (fresh) {
            setState(accountId, {
                status: 'verified',
                readMode: V2_PREFERRED_READ_ENABLED ? 'v2-preferred' : 'v1',
                issue: '',
                migrationId: String(meta.migrationId || ''),
                v1BooksUpdatedAt: currentBooksUpdatedAt,
                v1MemoryUpdatedAt: currentMemoryUpdatedAt
            });
            return { fresh: true, meta };
        }
        const issue = '检测到旧标签页更新了 V1，已切回旧储存并等待完整对账';
        await markNeedsReconcile(accountId, issue);
        try {
            window.dispatchEvent(new CustomEvent('zhiyu:storage-v2-reconcile-request', {
                detail: { accountId }
            }));
        } catch(error) {}
        return {
            fresh: false,
            reason: 'v1-changed',
            meta,
            current: {
                v1BooksUpdatedAt: currentBooksUpdatedAt,
                v1MemoryUpdatedAt: currentMemoryUpdatedAt
            }
        };
    }

    async function getReceipts(accountIdInput) {
        const database = await ensureDatabase(accountIdInput);
        return getAllForAccount(database, 'migration_receipts', normalizeAccountId(accountIdInput));
    }

    async function getSnapshots(accountIdInput) {
        const database = await ensureDatabase(accountIdInput);
        return getAllForAccount(database, 'snapshots', normalizeAccountId(accountIdInput));
    }

    function getHealth(accountIdInput) {
        const accountId = normalizeAccountId(accountIdInput);
        return {
            database: DB_NAME,
            schemaVersion: DB_VERSION,
            v2PreferredReadEnabled: V2_PREFERRED_READ_ENABLED,
            account: cloneValue(accountStates.get(accountId) || {
                accountId,
                status: 'v1',
                readMode: 'v1',
                issue: ''
            }),
            lastIssue
        };
    }

    try {
        if (typeof BroadcastChannel === 'function') {
            channel = new BroadcastChannel(CHANNEL_NAME);
            channel.addEventListener('message', function(event) {
                const message = event?.data || {};
                if (message.type === 'upgrade-request') {
                    window.ZHIYU_IDB?.close?.();
                    closeDatabase();
                    try {
                        channel.postMessage({ type: 'upgrade-ready', accountId: message.accountId, at: Date.now() });
                    } catch(error) {}
                } else if (message.type === 'v1-updated' && message.accountId) {
                    const state = accountStates.get(normalizeAccountId(message.accountId));
                    if (state?.status === 'verified') {
                        const accountId = normalizeAccountId(message.accountId);
                        setState(accountId, {
                            status: 'needs_reconcile',
                            readMode: 'v1',
                            issue: '检测到其他标签页更新了旧储存，正在重新对账'
                        });
                        try {
                            window.dispatchEvent(new CustomEvent('zhiyu:storage-v2-reconcile-request', {
                                detail: { accountId }
                            }));
                        } catch(error) {}
                    }
                }
            });
        }
    } catch(error) {
        channel = null;
    }

    window.ZHIYU_STORAGE_V2 = Object.freeze({
        DB_NAME,
        DB_VERSION,
        STORE_DEFINITIONS,
        ALL_V2_STORES,
        V2_PREFERRED_READ_ENABLED,
        canonicalJson,
        orderedValueJson,
        sha256,
        jsonBytes,
        buildProjection,
        rebuildV1,
        verifyProjection,
        estimateCapacity,
        ensureDatabase,
        waitForDatabaseReady,
        closeDatabase,
        migrateAccount,
        scheduleMigration,
        isDualWriteReady,
        dualWrite,
        markNeedsReconcile,
        createRestoreSnapshot,
        broadcastV1Updated,
        readProjection,
        readPreferredAccount,
        getMeta,
        checkV1Freshness,
        readMigrationSnapshot,
        getReceipts,
        getSnapshots,
        getHealth,
        setTestFault
    });
})(window);
