import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const modelPickerSource = fs.readFileSync(path.join(repoRoot, 'scripts/core/app-model-picker.js'), 'utf8');

function createDeferred() {
    let resolve;
    const promise = new Promise(function(done) { resolve = done; });
    return { promise, resolve };
}

function createLocalStorage(initialValues) {
    const values = new Map(Object.entries(initialValues || {}).map(function(entry) {
        return [String(entry[0]), String(entry[1])];
    }));
    return {
        getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
        setItem(key, value) { values.set(String(key), String(value)); },
        removeItem(key) { values.delete(String(key)); }
    };
}

function createHarness() {
    const storageKey = 'zhiyu_custom_models_guest';
    const legacyModels = [{
        name: 'legacy-model',
        modelId: 'legacy-model',
        provider: 'openai',
        key: 'legacy-key-value',
        base: 'https://api.example.test/v1',
        official: false
    }];
    const localStorage = createLocalStorage({ [storageKey]: JSON.stringify(legacyModels) });
    const persistenceGate = createDeferred();
    const secretWrites = [];
    let persistedSecrets = {};
    let persistenceCalls = 0;
    const secureStore = {
        isReadyForCurrentScope() { return true; },
        isPersistenceEnabled() { return false; },
        getCustomModelSecrets() { return { ...persistedSecrets }; },
        setPersistenceEnabled() {
            persistenceCalls += 1;
            return persistenceGate.promise;
        },
        async setCustomModelSecrets(secrets) {
            const snapshot = { ...(secrets || {}) };
            secretWrites.push(snapshot);
            persistedSecrets = snapshot;
            return true;
        }
    };
    const AccountDataScope = { getActiveUid() { return 'guest'; } };
    const document = {
        getElementById() { return null; },
        querySelector() { return null; },
        querySelectorAll() { return []; }
    };
    const windowObject = {
        ZHIYU_COMMUNITY_MODE: true,
        ZHIYU_MODEL_CONFIG: {
            BUILTIN_MODELS: [],
            DEFAULT_MODEL_ID: '',
            MODEL_SCOPE_CONFIG: { writing: { storageKey: 'zhiyu_model_id', buttonId: 'btnModelSelect', label: '正文模型', prefix: '' } }
        },
        ZHIYU_APP_STATE: {},
        ZHIYU_SECURE_STORE: secureStore,
        AccountDataScope,
        localStorage,
        document
    };
    const context = {
        window: windowObject,
        document,
        localStorage,
        console,
        Promise,
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
        URL,
        Toast: { warn() {}, error() {}, success() {}, info() {} },
        Modal: { close() {}, open() {} },
        confirm() { return true; },
        setTimeout() { return 0; },
        clearTimeout() {}
    };
    vm.runInNewContext(modelPickerSource, context, { filename: 'scripts/core/app-model-picker.js' });
    return {
        window: windowObject,
        localStorage,
        storageKey,
        persistenceGate,
        secretWrites,
        getPersistedSecrets() { return { ...persistedSecrets }; },
        getPersistenceCalls() { return persistenceCalls; }
    };
}

async function flushPromises() {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

{
    const harness = createHarness();
    const initial = harness.window.loadCustomModelsForCurrentUser();
    assert.equal(initial.length, 1);
    assert.equal(harness.getPersistenceCalls(), 1, 'legacy migration must start once');
    assert.equal(harness.window.loadCustomModelsForCurrentUser().length, 1);
    assert.equal(harness.getPersistenceCalls(), 1, 'reloading during migration must not start a duplicate migration');

    harness.window.syncApiConfigToCustomModel({
        model: 'new-model',
        provider: 'custom',
        key: 'new-key-value',
        base: 'https://new.example.test/v1'
    });
    await flushPromises();
    assert.equal(harness.window.loadCustomModelsForCurrentUser().length, 2, 'pending migration must expose the newest in-memory models');

    harness.persistenceGate.resolve(true);
    await flushPromises();
    const storedModels = JSON.parse(harness.localStorage.getItem(harness.storageKey));
    assert.equal(storedModels.length, 2, 'migration completion must not overwrite a model added during the delay');
    assert.equal(storedModels.some(function(model) { return Object.hasOwn(model, 'key'); }), false, 'plaintext keys must be removed after secure save');
    assert.equal(Object.values(harness.getPersistedSecrets()).includes('new-key-value'), true, 'the newly added key must remain in encrypted storage');
    assert.equal(harness.secretWrites.length, 1, 'the stale migration snapshot must not be written after a user mutation');
}

{
    const harness = createHarness();
    harness.window.loadCustomModelsForCurrentUser();
    harness.persistenceGate.resolve(true);
    await flushPromises();
    const storedModels = JSON.parse(harness.localStorage.getItem(harness.storageKey));
    assert.equal(storedModels.length, 1);
    assert.equal(Object.hasOwn(storedModels[0], 'key'), false, 'successful legacy migration must remove the plaintext key');
    assert.equal(Object.values(harness.getPersistedSecrets()).includes('legacy-key-value'), true, 'successful legacy migration must preserve the key securely');
}

console.log('[model-key-upgrade] PASS 单次升级、并发新增不丢失和旧明文安全升级均已验证');
