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

function createHarness(options) {
    const setup = options && typeof options === 'object' ? options : {};
    const storageKey = 'zhiyu_custom_models_guest';
    const legacyModels = Array.isArray(setup.initialModels) ? setup.initialModels : [{
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
    let persistedSecrets = { ...(setup.initialSecrets || {}) };
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

{
    const harness = createHarness();
    harness.window.loadCustomModelsForCurrentUser();
    harness.persistenceGate.resolve(true);
    await flushPromises();
    const result = harness.window.upsertCustomModelEntry({
        name: 'legacy-model',
        modelId: 'legacy-model',
        provider: 'custom',
        key: 'replacement-key-value',
        base: 'https://replacement.example.test/v1',
        official: false,
        protocol: 'openai',
        source: 'picker'
    });
    assert.equal(result.updated, true, '同名模型没有进入覆盖更新流程');
    await harness.window.saveCustomModelsForCurrentUser();
    const models = harness.window.loadCustomModelsForCurrentUser();
    assert.equal(models.length, 1, '同名模型更新后仍保留重复旧记录');
    assert.equal(models[0].base, 'https://replacement.example.test/v1');
    assert.equal(models[0].key, 'replacement-key-value');
    const selected = harness.window.getSelectedModelConfig();
    assert.equal(selected.base, 'https://replacement.example.test/v1', '正文仍读取同名模型的旧服务地址');
    assert.equal(selected.key, 'replacement-key-value', '正文仍读取同名模型的旧 API Key');
}

{
    const harness = createHarness();
    const baseUrls = harness.window.getCustomProviderBaseUrlMap();
    assert.equal(baseUrls.minimax, 'https://api.minimaxi.com/v1', 'MiniMax 国内选项没有使用国内开放平台地址');
    assert.equal(baseUrls.minimax_global, 'https://api.minimax.io/v1', 'MiniMax 国际选项没有使用国际开放平台地址');
    assert.deepEqual(
        JSON.parse(JSON.stringify(baseUrls)),
        {
            openai: 'https://api.openai.com/v1',
            opencode: 'https://opencode.ai/zen/v1',
            deepseek: 'https://api.deepseek.com',
            minimax: 'https://api.minimaxi.com/v1',
            minimax_global: 'https://api.minimax.io/v1',
            qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
            glm: 'https://open.bigmodel.cn/api/paas/v4',
            kimi: 'https://api.moonshot.cn/v1',
            claude: 'https://api.anthropic.com/v1',
            siliconflow: 'https://api.siliconflow.cn/v1',
            gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
            grok: 'https://api.x.ai/v1'
        },
        'MiniMax 区域拆分不应改动其他提供商默认地址'
    );
    assert.equal(
        harness.window.normalizeCustomModelBaseUrl('https://opencode.ai/zen/v1/models'),
        'https://opencode.ai/zen/v1',
        '模型列表完整地址没有整理为 OpenCode 基础 URL'
    );
    assert.match(
        harness.window.getCustomModelDiscoveryErrorMessage(
            { status: 401, message: 'generic 401' },
            { provider: 'minimax_global', base: baseUrls.minimax_global }
        ),
        /国际站[\s\S]*MiniMax（国内）/,
        'MiniMax 国际站 401 没有提示国内 Key 应切换站点'
    );
    assert.match(
        harness.window.getCustomModelDiscoveryErrorMessage(
            { status: 403, message: 'generic 403' },
            { provider: 'minimax', base: baseUrls.minimax }
        ),
        /国内站[\s\S]*MiniMax（国际）/,
        'MiniMax 国内站 403 没有提示国际 Key 应切换站点'
    );
    assert.match(
        harness.window.getCustomModelDiscoveryErrorMessage(
            { status: 401, message: 'generic 401' },
            { provider: 'minimax', base: baseUrls.minimax_global }
        ),
        /国际站[\s\S]*MiniMax（国内）/,
        '旧版 provider=minimax 的国际站配置没有按实际地址给出提示'
    );

    const legacySecretId = 'picker|minimax|legacy-minimax-model|legacy-minimax-model';
    const legacyMetadata = {
        name: 'legacy-minimax-model',
        modelId: 'legacy-minimax-model',
        provider: 'minimax',
        base: baseUrls.minimax_global,
        official: false,
        protocol: 'openai',
        source: 'picker',
        secretId: legacySecretId
    };
    const legacyHarness = createHarness({
        initialModels: [legacyMetadata],
        initialSecrets: { [legacySecretId]: 'legacy-international-key' }
    });
    const loadedLegacyModels = legacyHarness.window.loadCustomModelsForCurrentUser();
    assert.equal(loadedLegacyModels.length, 1, '旧 MiniMax 国际站配置没有从已有存储加载');
    const legacyInternational = legacyHarness.window.getSelectedModelConfig();
    assert.equal(legacyInternational.base, baseUrls.minimax_global, '旧 MiniMax 国际站配置被新默认地址改写');
    assert.equal(legacyInternational.key, 'legacy-international-key', '旧 MiniMax 国际站配置没有继续读取原 Key');

    assert.equal(await legacyHarness.window.saveCustomModelsForCurrentUser(), true, '旧 MiniMax 国际站配置重新保存失败');
    const reloadedMetadata = JSON.parse(legacyHarness.localStorage.getItem(legacyHarness.storageKey));
    const reloadHarness = createHarness({
        initialModels: reloadedMetadata,
        initialSecrets: legacyHarness.getPersistedSecrets()
    });
    reloadHarness.window.loadCustomModelsForCurrentUser();
    const reloadedInternational = reloadHarness.window.getSelectedModelConfig();
    assert.equal(reloadedInternational.base, baseUrls.minimax_global, '旧 MiniMax 国际站配置保存并重载后被改写');
    assert.equal(reloadedInternational.key, 'legacy-international-key', '旧 MiniMax 国际站 Key 保存并重载后丢失');
}

console.log('[model-key-upgrade] PASS 密钥升级、同名模型覆盖及 MiniMax 国内/国际地址均已验证');
