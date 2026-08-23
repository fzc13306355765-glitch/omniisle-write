import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const storageSource = fs.readFileSync(path.join(repoRoot, 'scripts/core/app-storage.js'), 'utf8');
const persisted = new Map();
const idbControls = { mutationDelayMs: 0 };

function createLocalStorage() {
    const values = new Map();
    return {
        getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
        setItem(key, value) { values.set(String(key), String(value)); },
        removeItem(key) { values.delete(String(key)); },
        clear() { values.clear(); }
    };
}

function createIndexedDB() {
    function requestWith(result) {
        const request = { result: undefined, error: null, onsuccess: null, onerror: null };
        queueMicrotask(function() {
            request.result = typeof result === 'function' ? result() : result;
            request.onsuccess?.();
        });
        return request;
    }

    const database = {
        objectStoreNames: { contains() { return true; } },
        createObjectStore() {},
        close() {},
        transaction() {
            const tx = { oncomplete: null, onerror: null, onabort: null, error: null };
            const store = {
                get(key) { return requestWith(function() { return persisted.get(String(key)); }); },
                put(value, key) {
                    persisted.set(String(key), value);
                    const request = requestWith(undefined);
                    setTimeout(function() { tx.oncomplete?.(); }, idbControls.mutationDelayMs);
                    return request;
                },
                delete(key) {
                    persisted.delete(String(key));
                    const request = requestWith(undefined);
                    setTimeout(function() { tx.oncomplete?.(); }, idbControls.mutationDelayMs);
                    return request;
                }
            };
            tx.objectStore = function() { return store; };
            return tx;
        }
    };

    return {
        open() {
            const request = { result: database, error: null, onupgradeneeded: null, onsuccess: null, onerror: null };
            queueMicrotask(function() {
                request.onupgradeneeded?.();
                request.onsuccess?.();
            });
            return request;
        }
    };
}

const activeScope = { uid: 'guest' };
const AccountDataScope = {
    normalizeUid(uid) { return String(uid || 'guest'); },
    getActiveUid() { return activeScope.uid; },
    setActiveUid(uid) { activeScope.uid = String(uid || 'guest'); return activeScope.uid; },
    key(prefix, uid) { return String(prefix) + ':' + String(uid || activeScope.uid); }
};
const localStorage = createLocalStorage();
const document = {
    visibilityState: 'visible',
    body: { classList: { contains() { return false; } } },
    addEventListener() {}
};
const windowObject = {
    ZHIYU_CONFIG: {},
    ZHIYU_STORAGE_V2: null,
    AccountDataScope,
    localStorage,
    document,
    addEventListener() {}
};
const context = {
    window: windowObject,
    document,
    localStorage,
    indexedDB: createIndexedDB(),
    AccountDataScope,
    navigator: { userAgent: 'Omniisle-Key-Storage-Smoke', language: 'zh-CN' },
    screen: { width: 1366, height: 768 },
    crypto: webcrypto,
    TextEncoder,
    TextDecoder,
    console,
    Promise,
    Map,
    Set,
    WeakSet,
    Uint8Array,
    ArrayBuffer,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Math,
    Date,
    RegExp,
    Error,
    TypeError,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    structuredClone
};
windowObject.indexedDB = context.indexedDB;
windowObject.crypto = webcrypto;
windowObject.navigator = context.navigator;
windowObject.screen = context.screen;

vm.runInNewContext(storageSource, context, { filename: 'scripts/core/app-storage.js' });

const store = windowObject.ZHIYU_SECURE_STORE;
const storageKey = 'secure_api_config:guest';
assert.ok(store, 'SecureStore should be exposed');

assert.equal(await store.init('guest'), true);
assert.equal(store.isPersistenceEnabled(), false, 'fresh profile must default to session-only');
assert.equal(await store.setCustomModelSecrets({ modelA: 'sk-session' }), true);
assert.equal(store.getCustomModelSecrets().modelA, 'sk-session');
assert.equal(persisted.has(storageKey), false, 'session-only key must not reach IndexedDB');

assert.equal(await store.setPersistenceEnabled(true), true);
assert.equal(store.isPersistenceEnabled(), true);
assert.equal(persisted.has(storageKey), true, 'opt-in must create an encrypted record');
assert.doesNotMatch(String(persisted.get(storageKey)), /sk-session/, 'persisted record must not contain plaintext key');

store.clearRuntime();
assert.equal(await store.init('guest'), true);
assert.equal(store.isPersistenceEnabled(), true, 'existing encrypted keys must remain compatible');
assert.equal(store.getCustomModelSecrets().modelA, 'sk-session');

idbControls.mutationDelayMs = 25;
const disablePending = store.setPersistenceEnabled(false);
assert.equal(store.isPersistenceEnabled(), false, 'opt-out intent must take effect before IndexedDB deletion finishes');
const saveDuringDisable = store.setCustomModelSecrets({ modelA: 'sk-during-disable' });
assert.deepEqual(await Promise.all([disablePending, saveDuringDisable]), [true, true]);
assert.equal(store.isPersistenceEnabled(), false);
assert.equal(persisted.has(storageKey), false, 'saving during opt-out must not recreate the persisted record');
assert.equal(store.getCustomModelSecrets().modelA, 'sk-during-disable', 'opting out keeps new keys usable in the current page session');

store.clearRuntime();
assert.equal(await store.init('guest'), true);
assert.equal(Object.keys(store.getCustomModelSecrets()).length, 0, 'session-only secrets must disappear after a new page runtime');

assert.equal(await store.setCustomModelSecrets({ modelA: 'sk-before-enable' }), true);
const enablePending = store.setPersistenceEnabled(true);
assert.equal(store.isPersistenceEnabled(), true, 'opt-in intent must take effect before IndexedDB persistence finishes');
const saveDuringEnable = store.setCustomModelSecrets({ modelA: 'sk-during-enable' });
assert.deepEqual(await Promise.all([enablePending, saveDuringEnable]), [true, true]);
assert.equal(persisted.has(storageKey), true, 'opt-in must leave an encrypted record after concurrent saves');

idbControls.mutationDelayMs = 0;
store.clearRuntime();
assert.equal(await store.init('guest'), true);
assert.equal(store.getCustomModelSecrets().modelA, 'sk-during-enable', 'the newest key saved during opt-in must survive reload');
assert.equal(await store.setPersistenceEnabled(false), true);

console.log('[key-storage] PASS 默认会话、主动记住、旧密文兼容、并发切换和取消记住均已验证');
