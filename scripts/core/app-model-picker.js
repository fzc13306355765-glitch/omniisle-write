// Model selection and custom model settings split from app-main.js.
// Keeps the original global function names for the remaining legacy generation flows.
(function() {
// ===== 模型选择 =====
const MODEL_CONFIG = window.ZHIYU_MODEL_CONFIG || {};
const BUILTIN_MODELS = MODEL_CONFIG.BUILTIN_MODELS || [];
const DEFAULT_MODEL_ID = MODEL_CONFIG.DEFAULT_MODEL_ID || '';
const MODEL_SCOPE_CONFIG = MODEL_CONFIG.MODEL_SCOPE_CONFIG || {
    writing: { storageKey: 'zhiyu_model_id', buttonId: 'btnModelSelect', label: '正文模型', prefix: '' }
};
const getModelDefinitionTier = MODEL_CONFIG.getModelDefinitionTier || function() { return 'normal'; };
const isModelUnavailable = MODEL_CONFIG.isModelUnavailable || function() { return false; };
const getRequestTier = MODEL_CONFIG.getRequestTier || function() { return 'normal'; };
const makeRequestId = MODEL_CONFIG.makeRequestId || function(prefix) {
    return prefix + ':' + Date.now().toString(36) + ':' + Math.random().toString(36).slice(2, 8);
};
const AppState = window.ZHIYU_APP_STATE || window.AppState || {};
const COMMUNITY_MODE = window.ZHIYU_COMMUNITY_MODE === true;
let selectedModelId = DEFAULT_MODEL_ID;
let activeModelScope = 'writing';
let pendingModelId = '';
let activeModelCategory = 'basic';
let customModels = [];
let selectedModelIds = {};
let modelStateEpoch = 0;
let customModelMutationRevision = 0;
let customModelSecretMigrationPending = false;
let customModelSecretMigrationToken = null;
const LEGACY_MODEL_ID_MIGRATIONS = Object.freeze({});
const ORDINARY_MODEL_ROUTES = Object.freeze([]);

function getTutorialModelPreview() {
    const preview = window.ZHIYU_MODEL_PREVIEW_CONTEXT;
    return preview?.active === true ? preview : null;
}

function getModelPickerModels() {
    const models = COMMUNITY_MODE ? customModels.slice() : [...BUILTIN_MODELS, ...customModels];
    const preview = getTutorialModelPreview();
    const previewName = String(preview?.modelId || '').trim();
    if (previewName && !models.some(function(model) { return model.name === previewName; })) {
        models.push({
            name: previewName,
            modelId: previewName,
            provider: '教程演示',
            desc: '仅用于操作引导，不会调用模型',
            official: true,
            tutorialPreview: true
        });
    }
    return models;
}

function sanitizeStorageId(raw) {
    return String(raw || 'guest').replace(/[^\w.-]/g, '_');
}

function getModelUserStorageId() {
    const scopedUid = window.AccountDataScope?.getActiveUid?.() || 'guest';
    return sanitizeStorageId(scopedUid);
}

function getLegacyModelUserStorageIds() {
    // 旧的全局、guest、用户名键没有可信所有者，禁止自动迁移到当前账号。
    return [];
}

function parseCustomModelList(raw) {
    try {
        const list = JSON.parse(raw || '[]');
        return Array.isArray(list) ? list.filter(Boolean) : [];
    } catch(e) {
        return [];
    }
}

function getCustomModelsStorageKey() {
    return 'zhiyu_custom_models_' + getModelUserStorageId();
}

function getCustomModelSecretId(model) {
    return [
        String(model?.source || 'picker'),
        String(model?.provider || ''),
        String(model?.modelId || model?.name || ''),
        String(model?.name || '')
    ].join('|');
}

function buildCustomModelStoragePayload(models) {
    const secrets = {};
    const metadata = (Array.isArray(models) ? models : []).map(function(model) {
        const clean = { ...(model || {}) };
        const secretId = getCustomModelSecretId(clean);
        if (clean.key) secrets[secretId] = String(clean.key);
        delete clean.key;
        clean.secretId = secretId;
        return clean;
    });
    return { metadata, secrets };
}

function saveCustomModelsForCurrentUser() {
    const storageKey = getCustomModelsStorageKey();
    const saveEpoch = modelStateEpoch;
    const saveUid = window.AccountDataScope?.getActiveUid?.() || 'guest';
    const saveRevision = ++customModelMutationRevision;
    const payload = buildCustomModelStoragePayload(customModels);
    const secureSave = window.ZHIYU_SECURE_STORE?.setCustomModelSecrets?.(payload.secrets) || Promise.resolve(false);
    return Promise.resolve(secureSave).then(function(saved) {
        if (saved !== true) return false;
        if (!isCurrentModelState(saveEpoch, saveUid)) return false;
        if (saveRevision !== customModelMutationRevision) return true;
        localStorage.setItem(storageKey, JSON.stringify(payload.metadata));
        return true;
    });
}

function refreshApiKeyPersistenceControls() {
    const enabled = window.ZHIYU_SECURE_STORE?.isPersistenceEnabled?.() === true;
    ['rememberCustomModelKey', 'rememberApiKeys'].forEach(function(id) {
        const input = document.getElementById(id);
        if (input) input.checked = enabled;
    });
    const status = document.getElementById('apiKeyStorageStatus');
    if (status) {
        status.textContent = enabled
            ? '已选择记住：密钥以加密形式保存在此浏览器。'
            : '当前仅在本页面会话中使用；刷新或关闭页面后需重新输入。';
    }
    return enabled;
}

function getCustomModelProtocol(provider) {
    const protocolMap = { claude: 'anthropic', gemini: 'openai', grok: 'openai' };
    return protocolMap[String(provider || '').trim()] || 'openai';
}

function getCustomProviderBaseUrlMap() {
    return {
        openai: 'https://api.openai.com/v1',
        deepseek: 'https://api.deepseek.com',
        minimax: 'https://api.minimax.io/v1',
        qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        glm: 'https://open.bigmodel.cn/api/paas/v4',
        kimi: 'https://api.moonshot.cn/v1',
        claude: 'https://api.anthropic.com/v1',
        siliconflow: 'https://api.siliconflow.cn/v1',
        gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
        grok: 'https://api.x.ai/v1'
    };
}

function getDefaultCustomModelBaseUrl(provider) {
    return getCustomProviderBaseUrlMap()[String(provider || '').trim()] || '';
}

function normalizeCustomModelBaseUrl(base) {
    let value = String(base || '').trim().replace(/\/+$/, '');
    while (/\/(?:chat\/completions|messages)$/i.test(value)) {
        value = value.replace(/\/(?:chat\/completions|messages)$/i, '').replace(/\/+$/, '');
    }
    return value;
}

function getCustomModelEndpointPath(protocol) {
    return protocol === 'anthropic' ? '/messages' : '/chat/completions';
}

function buildCustomModelTargetUrl(base, protocol) {
    return normalizeCustomModelBaseUrl(base) + getCustomModelEndpointPath(protocol || 'openai');
}

function isKnownCustomModelBaseUrl(base) {
    const normalized = normalizeCustomModelBaseUrl(base);
    return Object.values(getCustomProviderBaseUrlMap()).some(function(item) {
        return normalizeCustomModelBaseUrl(item) === normalized;
    });
}

function syncCustomModelBaseInputForProvider(input, provider, options) {
    if (!input) return;
    const opts = options || {};
    const defaultBase = getDefaultCustomModelBaseUrl(provider);
    const current = normalizeCustomModelBaseUrl(input.value);
    if (defaultBase) {
        if (opts.force || !current || isKnownCustomModelBaseUrl(current)) input.value = defaultBase;
        input.placeholder = defaultBase;
    } else {
        if (opts.clear) input.value = '';
        input.placeholder = 'https://api.example.com/v1';
    }
}

function getApiSettingsModelDisplayName(api) {
    const modelId = String(api?.model || '').trim();
    if (!modelId) return '';
    const existsAsBuiltin = BUILTIN_MODELS.some(function(m) { return m && m.name === modelId; });
    return existsAsBuiltin ? (modelId + '（自定义）') : modelId;
}

function syncApiConfigToCustomModel(api) {
    const modelId = String(api?.model || '').trim();
    if (!modelId) return null;
    const provider = String(api?.provider || 'custom').trim() || 'custom';
    const displayName = getApiSettingsModelDisplayName({ ...api, model: modelId });
    const entry = {
        name: displayName,
        modelId,
        provider,
        key: String(api?.key || '').trim(),
        base: normalizeCustomModelBaseUrl(api?.base),
        official: false,
        protocol: getCustomModelProtocol(provider),
        source: 'apiSettings'
    };
    const idx = customModels.findIndex(function(m) {
        if (!m) return false;
        return m.source === 'apiSettings'
            || m.name === displayName
            || ((m.modelId || m.name) === modelId && String(m.provider || '') === provider);
    });
    if (idx >= 0) customModels[idx] = { ...customModels[idx], ...entry };
    else customModels.push(entry);
    saveCustomModelsForCurrentUser();
    return entry;
}

function normalizeModelId(modelId) {
    const rawModelId = String(modelId || '').trim();
    const migratedModelId = LEGACY_MODEL_ID_MIGRATIONS[rawModelId.toLowerCase()] || rawModelId;
    const allModels = getModelPickerModels();
    if (allModels.some(function(m) { return m.name === migratedModelId; })) return migratedModelId;
    return COMMUNITY_MODE ? String(customModels[0]?.name || '') : DEFAULT_MODEL_ID;
}

function normalizeModelScope(scope) {
    return MODEL_SCOPE_CONFIG[scope] ? scope : 'writing';
}

function getModelScopeStorageKey(scope) {
    const modelScope = normalizeModelScope(scope);
    return MODEL_SCOPE_CONFIG[modelScope].storageKey + '_' + getModelUserStorageId();
}

function migrateModelStorageToCurrentUser() {
    // 仅保留兼容函数名。无可信所有者的旧全局配置不得迁入任何账号。
    return false;
}

function loadCustomModelsForCurrentUser() {
    const storageKey = getCustomModelsStorageKey();
    const currentUid = window.AccountDataScope?.getActiveUid?.() || 'guest';
    if (customModelSecretMigrationToken
        && customModelSecretMigrationToken.storageKey === storageKey
        && isCurrentModelState(customModelSecretMigrationToken.epoch, currentUid)) {
        return customModels.slice();
    }
    const list = parseCustomModelList(localStorage.getItem(storageKey));
    const secrets = window.ZHIYU_SECURE_STORE?.getCustomModelSecrets?.() || {};
    let foundPlaintextKey = false;
    const merged = list.map(function(model) {
        const item = { ...(model || {}) };
        const secretId = item.secretId || getCustomModelSecretId(item);
        if (item.key) {
            secrets[secretId] = String(item.key);
            foundPlaintextKey = true;
        }
        item.key = String(secrets[secretId] || '');
        item.secretId = secretId;
        return item;
    });
    if (foundPlaintextKey && window.ZHIYU_SECURE_STORE?.isReadyForCurrentScope?.()) {
        customModels = merged;
        const migrationPayload = buildCustomModelStoragePayload(merged);
        const migrationToken = {
            storageKey,
            uid: currentUid,
            epoch: modelStateEpoch,
            revision: customModelMutationRevision
        };
        customModelSecretMigrationToken = migrationToken;
        customModelSecretMigrationPending = true;
        window.ZHIYU_SECURE_STORE.setPersistenceEnabled(true).then(function(enabled) {
            if (!enabled) return false;
            if (customModelSecretMigrationToken !== migrationToken
                || !isCurrentModelState(migrationToken.epoch, migrationToken.uid)
                || migrationToken.revision !== customModelMutationRevision) return false;
            return window.ZHIYU_SECURE_STORE.setCustomModelSecrets(migrationPayload.secrets);
        }).then(function(saved) {
            if (saved !== true) return;
            if (customModelSecretMigrationToken !== migrationToken
                || !isCurrentModelState(migrationToken.epoch, migrationToken.uid)
                || migrationToken.revision !== customModelMutationRevision) return;
            localStorage.setItem(storageKey, JSON.stringify(migrationPayload.metadata));
        }).finally(function() {
            if (customModelSecretMigrationToken === migrationToken) {
                customModelSecretMigrationToken = null;
                customModelSecretMigrationPending = false;
                if (isCurrentModelState(migrationToken.epoch, migrationToken.uid)) refreshApiKeyPersistenceControls();
            }
        });
    }
    return merged;
}

function getStoredModelIdForScope(scope) {
    const modelScope = normalizeModelScope(scope);
    const scopedKey = getModelScopeStorageKey(modelScope);
    return localStorage.getItem(scopedKey) || '';
}

function normalizeCustomModelProtocols() {
    let needSave = false;
    customModels.forEach(function(cm) {
        if (!cm.protocol) {
            cm.protocol = getCustomModelProtocol(cm.provider);
            needSave = true;
        }
        const normalizedBase = normalizeCustomModelBaseUrl(cm.base);
        if (cm.base !== normalizedBase) {
            cm.base = normalizedBase;
            needSave = true;
        }
    });
    if (needSave && !customModelSecretMigrationPending) saveCustomModelsForCurrentUser();
}

function reloadModelStateForCurrentUser() {
    customModels = loadCustomModelsForCurrentUser();
    normalizeCustomModelProtocols();
    selectedModelIds = {};
    Object.keys(MODEL_SCOPE_CONFIG).forEach(function(scope) {
        if (COMMUNITY_MODE) {
            selectedModelIds[scope] = getStoredModelIdForScope(scope) || String(customModels[0]?.name || '');
        } else {
            selectedModelIds[scope] = getStoredModelIdForScope(scope) || DEFAULT_MODEL_ID;
        }
    });
    selectedModelId = normalizeModelId(selectedModelIds.writing || DEFAULT_MODEL_ID);
    if (typeof updateModelBtn === 'function') updateModelBtn();
    refreshApiKeyPersistenceControls();
    return true;
}

function getModelIdForScope(scope) {
    const modelScope = normalizeModelScope(scope);
    const fallbackId = COMMUNITY_MODE ? String(customModels[0]?.name || '') : DEFAULT_MODEL_ID;
    const storedModelId = selectedModelIds[modelScope] || fallbackId;
    const modelId = normalizeModelId(storedModelId);
    const modelCfg = getModelConfigById(modelId);
    const safeModelId = !COMMUNITY_MODE && isModelUnavailable(modelCfg) ? DEFAULT_MODEL_ID : modelId;
    selectedModelIds[modelScope] = safeModelId;
    if (safeModelId && safeModelId !== storedModelId) localStorage.setItem(getModelScopeStorageKey(modelScope), safeModelId);
    if (modelScope === 'writing') selectedModelId = safeModelId;
    return safeModelId;
}

function setModelIdForScope(scope, modelId) {
    const modelScope = normalizeModelScope(scope);
    const safeModelId = normalizeModelId(modelId || (COMMUNITY_MODE ? '' : DEFAULT_MODEL_ID));
    selectedModelIds[modelScope] = safeModelId;
    if (safeModelId) localStorage.setItem(getModelScopeStorageKey(modelScope), safeModelId);
    if (modelScope === 'writing') selectedModelId = safeModelId;
    updateModelBtn();
    if (modelScope === 'writing') window.updateChapterComposerState?.();
}

function getModelConfigById(modelId) {
    const safeModelId = normalizeModelId(modelId);
    // 先在自定义模型中找
    const cm = customModels.find(m => m.name === safeModelId);
    if (cm) return { name: cm.name, key: cm.key, base: normalizeCustomModelBaseUrl(cm.base), model: cm.modelId || cm.name, custom: true, normalCallUnitMultiplier: 1, protocol: cm.protocol || getCustomModelProtocol(cm.provider) };
    return { name: '', key: '', base: '', model: '', custom: true, communityUnconfigured: true, protocol: 'openai' };
}

function getModelConfigForScope(scope) {
    return getModelConfigById(getModelIdForScope(scope));
}

function getSelectedModelConfig() { return getModelConfigForScope('writing'); }
function getOutlineModelConfig() { return getModelConfigForScope('outline'); }
function getActionModelConfig() { return getModelConfigForScope('action'); }
function getChatModelConfig() { return getModelConfigForScope('chat'); }
function getDefaultFreeActionModelConfig() {
    return getModelConfigById(customModels[0]?.name || '');
}

function isCustomModel(scope) { return getModelConfigForScope(scope || 'writing').custom; }

function isUserAuthFailureForOrdinaryFallback(err) {
    return window.isAbortLikeError?.(err) === true;
}

function shouldRetryMemoryAnalysis(err) {
    const code = String(err?.code || '').trim().toUpperCase();
    const status = Number(err?.upstreamStatus || err?.status || 0);
    const raw = [
        err && err.message,
        err && err.code,
        err && err.rawBody,
        err
    ].filter(Boolean).map(String).join(' ');
    if (isUserAuthFailureForOrdinaryFallback(err)) return false;
    const providerFailure = /AGNES_API_KEY_INVALID|AI_PROVIDER_|AI_UPSTREAM_|AI_STREAM_INCOMPLETE|AI_STREAM_PROTOCOL|upstream_error|InternalServerError|OpenAIException|Too Many Requests|请求过于频繁|频繁|限流|rate[_\s-]*limit|EMPTY_RESPONSE|AI 分析未返回内容|AI 未返回内容|AI 未输出正文|模型没有返回内容|fetch failed|network|网络连接|连接到模型服务失败|ECONNRESET|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|timeout|socket/i.test(raw);
    if (providerFailure) return true;
    const upstreamStatusMatch = raw.match(/["']?upstreamStatus["']?\s*[:=]\s*(\d{3})/i);
    const upstreamStatus = Number(err?.upstreamStatus || upstreamStatusMatch?.[1] || 0);
    if ([401, 403, 408, 425, 429].includes(upstreamStatus) || upstreamStatus >= 500) return true;
    if ([401, 403].includes(Number(err?.status || 0))) return false;
    return [408, 425, 429].includes(status) || status >= 500;
}

function isOrdinaryBuiltinModel(model) {
    return !!model?.base && !!model?.model;
}

function isAdvancedOutlineAllowedModel(model) {
    return !!model?.base && !!model?.model;
}

function getAdvancedOutlineExecutionModelConfig() {
    const selected = getOutlineModelConfig();
    return isAdvancedOutlineAllowedModel(selected) ? selected : null;
}

function getOrdinaryModelCandidates() {
    if (COMMUNITY_MODE) {
        const selected = getSelectedModelConfig();
        if (!selected?.base || !selected?.model) return [];
        return [{ ...selected, custom: false, official: false, communityDirect: true, requestTier: 'normal' }];
    }
    return [];
}

function getMemoryAnalysisModelCandidates() {
    return getOrdinaryModelCandidates();
}

let _modelHealth = {};
let _modelHealthTime = 0;
let _modelHealthPromise = null;

function prepareModelAccountScopeChange() {
    modelStateEpoch += 1;
    customModelMutationRevision += 1;
    customModelSecretMigrationPending = false;
    customModelSecretMigrationToken = null;
    selectedModelId = DEFAULT_MODEL_ID;
    selectedModelIds = {};
    customModels = [];
    pendingModelId = '';
    activeModelScope = 'writing';
    activeModelCategory = 'basic';
    _modelHealth = {};
    _modelHealthTime = 0;
    _modelHealthPromise = null;
    ['customModelKey', 'apiKey'].forEach(function(id) {
        const input = document.getElementById(id);
        if (input) input.value = '';
    });
    ['modelSelectModal', 'addModelModal'].forEach(function(id) {
        try { window.ZHIYU_MODAL?.close?.(id); } catch (e) {}
    });
    updateModelBtn();
}

function isCurrentModelState(epoch, uid) {
    return epoch === modelStateEpoch
        && String(window.AccountDataScope?.getActiveUid?.() || 'guest') === String(uid || 'guest');
}

function updateModelBtn() {
    Object.keys(MODEL_SCOPE_CONFIG).forEach(function(scope) {
        const scopeCfg = MODEL_SCOPE_CONFIG[scope];
        const btn = document.getElementById(scopeCfg.buttonId);
        if (!btn) return;
        const modelId = getModelIdForScope(scope);
        const displayName = modelId || (COMMUNITY_MODE ? '添加自己的模型' : DEFAULT_MODEL_ID);
        btn.textContent = scopeCfg.prefix + displayName + ' ▼';
        btn.title = scopeCfg.label + '：' + displayName;
    });
}
reloadModelStateForCurrentUser();
updateModelBtn();

function getModelCategoryLabel(category) {
    if (COMMUNITY_MODE) return '自己的模型';
    return category === 'advanced' ? '高级模型' : '基础模型';
}

function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[ch];
    });
}

function getModelLogoInfo(model) {
    const fallback = String(model?.provider || model?.name || '?').trim().slice(0, 1).toUpperCase() || '?';
    return { src: '', label: String(model?.provider || model?.name || 'Model'), fallback };
}

function getModelProviderIcon(model) {
    return getModelLogoInfo(model);
}

function renderModelProviderIcon(model) {
    const logo = getModelProviderIcon(model);
    if (logo.src) {
        return '<img class="model-provider-icon" src="' + escapeHtml(logo.src) + '" alt="' + escapeHtml(logo.label) + '">';
    }
    return '<span class="model-provider-icon-fallback" aria-hidden="true">' + escapeHtml(logo.fallback) + '</span>';
}

function renderModelLogo(model) {
    const logo = getModelLogoInfo(model);
    if (logo.src) {
        const fallbackAttr = logo.fallbackSrc ? ' data-fallback-src="' + escapeHtml(logo.fallbackSrc) + '"' : '';
        return '<span class="model-logo-wrap"><img class="model-logo-img" src="' + escapeHtml(logo.src) + '"' + fallbackAttr + ' alt="' + escapeHtml(logo.label) + ' logo" loading="lazy"></span>';
    }
    return '<span class="model-logo-wrap model-logo-fallback" aria-hidden="true">' + escapeHtml(logo.fallback) + '</span>';
}

document.getElementById('modelSelectModal')?.addEventListener('wheel', function(e) { e.stopPropagation(); }, { passive: false });

function isAdvancedOutlineRestrictedContext() {
    return !COMMUNITY_MODE
        && activeModelScope === 'outline'
        && typeof window.isAdvancedOutlineMode === 'function'
        && window.isAdvancedOutlineMode();
}

function getDefaultAdvancedOutlineModelId() {
    return getModelIdForScope('outline');
}

function syncModelPickerCategoryAvailability() {
    const restricted = isAdvancedOutlineRestrictedContext();
    document.querySelectorAll('.model-picker-cat').forEach(function(cat) {
        const blocked = (COMMUNITY_MODE && cat.dataset.cat === 'advanced')
            || (restricted && cat.dataset.cat === 'advanced');
        cat.hidden = blocked;
        cat.setAttribute('aria-hidden', blocked ? 'true' : 'false');
        if (blocked) cat.classList.remove('active');
    });
    if (restricted) activeModelCategory = 'basic';
}

function openModelPicker(scope, options) {
    activeModelScope = normalizeModelScope(scope);
    const tutorialPreview = options?.tutorialPreview === true
        ? { active: true, modelId: options.modelId || '' }
        : getTutorialModelPreview();
    pendingModelId = tutorialPreview?.modelId
        ? normalizeModelId(tutorialPreview.modelId)
        : getModelIdForScope(activeModelScope);
    const frontmost = activeModelScope === 'chat';
    document.getElementById('modelSelectModal')?.classList.toggle('model-picker-frontmost', frontmost);
    document.getElementById('addModelModal')?.classList.toggle('model-picker-frontmost', frontmost);
    const allModels = getModelPickerModels();
    let currentModel = allModels.find(function(m) { return m.name === pendingModelId; });
    if (isAdvancedOutlineRestrictedContext() && !isAdvancedOutlineAllowedModel(currentModel)) {
        pendingModelId = getDefaultAdvancedOutlineModelId();
        currentModel = BUILTIN_MODELS.find(function(m) { return m.name === pendingModelId; });
    }
    activeModelCategory = isAdvancedOutlineRestrictedContext()
        ? 'basic'
        : (getModelDefinitionTier(currentModel) === 'advanced' ? 'advanced' : 'basic');
    syncModelPickerCategoryAvailability();
    document.querySelectorAll('.model-picker-cat').forEach(function(cat) {
        cat.classList.toggle('active', cat.dataset.cat === activeModelCategory);
    });
    const renderTask = renderModelPicker();
    Modal.open('modelSelectModal');
    return renderTask;
}

Object.keys(MODEL_SCOPE_CONFIG).forEach(function(scope) {
    const btn = document.getElementById(MODEL_SCOPE_CONFIG[scope].buttonId);
    if (btn) btn.addEventListener('click', function() { openModelPicker(scope); });
});

document.getElementById('btnConfirmModelSelect')?.addEventListener('click', function() {
    const safePending = normalizeModelId(pendingModelId || getModelIdForScope(activeModelScope));
    if (COMMUNITY_MODE && !safePending) {
        Toast.warn('请先添加自己的模型');
        Modal.open('addModelModal');
        return;
    }
    const pendingDefinition = getModelConfigById(safePending);
    if (isAdvancedOutlineRestrictedContext() && !isAdvancedOutlineAllowedModel(pendingDefinition)) {
        Toast.warn('请先添加并选择一个可用的自备模型');
        return;
    }
    setModelIdForScope(activeModelScope, safePending);
    pendingModelId = '';
    Modal.close('modelSelectModal');
    Toast.success('模型已应用');
});

async function fetchModelHealth() {
    _modelHealth = {};
    _modelHealthTime = Date.now();
    _modelHealthPromise = null;
    return {};
}

async function refreshModelHealthIfOpen() {
    if (Date.now() - _modelHealthTime < 120000) return;
    try {
        const modal = document.getElementById('modelSelectModal');
        if (!modal || modal.style.display !== 'flex') return;
        await fetchModelHealth();
        renderModelPicker();
    } catch(e) {}
}

async function renderModelPicker() {
    const renderEpoch = modelStateEpoch;
    const renderUid = window.AccountDataScope?.getActiveUid?.() || 'guest';
    const list = document.getElementById('modelPickerList');
    const headerTitle = document.getElementById('modelPickerTitle') || document.querySelector('#modelSelectModal .model-picker-header span:first-child');
    if (headerTitle) headerTitle.textContent = getModelCategoryLabel(activeModelCategory);
    const allModels = getModelPickerModels();
    const health = await fetchModelHealth();
    if (!isCurrentModelState(renderEpoch, renderUid)) return;
    const currentModelId = getModelIdForScope(activeModelScope);
    const viewSelectedId = normalizeModelId(pendingModelId || currentModelId);
    syncModelPickerCategoryAvailability();
    const restricted = isAdvancedOutlineRestrictedContext();
    const visibleModels = allModels.filter(function(m) {
        if (restricted) return isAdvancedOutlineAllowedModel(m);
        const tier = getModelDefinitionTier(m);
        return activeModelCategory === 'advanced' ? tier === 'advanced' : tier !== 'advanced';
    });
    if (activeModelCategory !== 'advanced') {
        // 普通模型按消耗次数分组展示；同倍率保留配置中的原有顺序。
        visibleModels.sort(function(left, right) {
            const leftMultiplier = Math.max(1, Number(left.normalCallUnitMultiplier || 1));
            const rightMultiplier = Math.max(1, Number(right.normalCallUnitMultiplier || 1));
            return leftMultiplier - rightMultiplier;
        });
    }
    if (!visibleModels.length) {
        list.innerHTML = '<div style="padding:20px;color:#8b8d98;text-align:center;">'
            + (COMMUNITY_MODE ? '尚未添加模型，请点击下方“添加模型”' : '暂无可选模型')
            + '</div>';
        return;
    }
    list.innerHTML = visibleModels.map(m => {
        const isSel = viewSelectedId === m.name;
        const isCustom = !m.official;
        const hk = m.healthKey || (m.freeProvider === 'siliconflow' ? 'siliconflow' : m.freeProvider === 'nvidia' ? 'nvidia' : 'minimax');
        const hStatus = health[hk] || 'ok';
        const isFrozen = isModelUnavailable(m);
        const barPct = isFrozen ? 35 : (hStatus === 'down' ? 15 : hStatus === 'slow' ? 50 : hStatus === 'checking' ? 35 : 90 + Math.floor(Math.random() * 10));
        const barColor = isFrozen ? '#9ca3af' : (hStatus === 'down' ? '#e74c3c' : hStatus === 'slow' ? '#f39c12' : '#28a745');
        const tag = isFrozen
            ? '<span class="model-picker-card-tag frozen">暂不可用</span>'
            : (m.tutorialPreview
                ? '<span class="model-picker-card-tag free">教程演示</span>'
                : (COMMUNITY_MODE ? '<span class="model-picker-card-tag free">自备 API</span>' : ''));
        const safeName = escapeHtml(m.name);
        const safeDataName = escapeHtml(m.name);
        const safeDesc = escapeHtml(m.desc || m.provider + ' 模型');
        const safeCapacityNotice = escapeHtml(m.capacityNotice || '');
        const delBtn = isCustom ? '<span class="model-del-btn" data-name="' + safeDataName + '" title="删除此模型">🗑️</span>' : '';
        return `<div class="model-picker-card${isSel?' selected':''}${isFrozen?' disabled':''}" data-name="${safeDataName}"${isFrozen ? ' title="该模型暂时不可用，请选择其他模型"' : ''}>
            <div class="model-picker-card-top">
                ${renderModelLogo(m)}<div class="model-picker-card-title"><span class="model-picker-card-name">${safeName}</span>${tag}</div>${delBtn}
            </div>
            <div class="model-picker-card-desc">${safeDesc}</div>
            ${safeCapacityNotice ? `<div class="model-picker-card-capacity-notice"><span aria-hidden="true">⚠</span><span>${safeCapacityNotice}</span></div>` : ''}
            <div class="model-picker-card-bar-wrap"><div class="model-picker-card-bar-inner" style="width:${barPct}%;background:${barColor}"></div></div>
        </div>`;
    }).join('');
    list.querySelectorAll('.model-logo-img[data-fallback-src]').forEach(img => {
        img.addEventListener('error', function() {
            const fallbackSrc = this.dataset.fallbackSrc;
            if (fallbackSrc) {
                this.removeAttribute('data-fallback-src');
                this.src = fallbackSrc;
            }
        }, { once: true });
    });
    // 删除按钮事件（必须在 innerHTML 之后绑定）
    list.querySelectorAll('.model-del-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const name = this.dataset.name;
            customModels = customModels.filter(m => m.name !== name);
            saveCustomModelsForCurrentUser();
            const affectedScopes = Object.keys(MODEL_SCOPE_CONFIG).filter(function(scope) {
                return selectedModelIds[scope] === name || localStorage.getItem(getModelScopeStorageKey(scope)) === name;
            });
            affectedScopes.forEach(function(scope) { setModelIdForScope(scope, DEFAULT_MODEL_ID); });
            if (pendingModelId === name) pendingModelId = getModelIdForScope(activeModelScope);
            renderModelPicker();
        });
    });
    list.querySelectorAll('.model-picker-card').forEach(card => {
        card.addEventListener('click', function() {
            if (this.classList.contains('disabled')) {
                Toast.warn('该模型暂时不可用，请选择其他模型');
                return;
            }
            pendingModelId = this.dataset.name;
            renderModelPicker();
        });
    });
}

// 侧边栏分类切换（基础/高级）
document.querySelectorAll('.model-picker-cat').forEach(function(cat) {
    cat.addEventListener('click', function() {
        if (isAdvancedOutlineRestrictedContext() && this.dataset.cat === 'advanced') {
            Toast.warn('请使用已配置的自备模型');
            return;
        }
        activeModelCategory = this.dataset.cat || 'basic';
        document.querySelectorAll('.model-picker-cat').forEach(function(c){ c.classList.remove('active'); });
        this.classList.add('active');
        renderModelPicker();
    });
});

setTimeout(refreshModelHealthIfOpen, 300);

// 供应商选择自动填充 Base URL
document.getElementById('customModelProvider')?.addEventListener('change', function() {
    const provider = this.value;
    const normalizedBaseInput = document.getElementById('customModelBase');
    syncCustomModelBaseInputForProvider(normalizedBaseInput, provider, { force: true, clear: provider === 'custom' });
    return;
    const baseUrlMap = {
        'openai': 'https://api.openai.com/v1',
        'deepseek': 'https://api.deepseek.com',
        'minimax': 'https://api.minimax.chat/v1',
        'qwen': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        'glm': 'https://open.bigmodel.cn/api/paas/v4',
        'kimi': 'https://api.moonshot.cn/v1',
        'claude': 'https://api.anthropic.com/v1',
        'siliconflow': 'https://api.siliconflow.cn/v1',
        'gemini': 'https://generativelanguage.googleapis.com/v1beta/openai',
        'grok': 'https://api.x.ai/v1'
    };
    const baseInput = document.getElementById('customModelBase');
    if (baseUrlMap[provider]) {
        baseInput.value = baseUrlMap[provider];
    } else if (provider === 'custom') {
        baseInput.value = '';
        baseInput.placeholder = '请输入自定义中转站地址';
    }
});

// 密钥可见性切换
document.getElementById('toggleKeyVisibility')?.addEventListener('click', function() {
    const keyInput = document.getElementById('customModelKey');
    if (keyInput.type === 'password') {
        keyInput.type = 'text';
        this.textContent = '🙈';
    } else {
        keyInput.type = 'password';
        this.textContent = '👁️';
    }
});

document.getElementById('btnSaveCustomModel')?.addEventListener('click', async function() {
    const p = document.getElementById('customModelProvider').value.trim();
    const k = document.getElementById('customModelKey').value.trim();
    const b = normalizeCustomModelBaseUrl(document.getElementById('customModelBase').value.trim());
    const n = document.getElementById('customModelName').value.trim();
    if (!n) { Toast.warn('请填写模型名称'); return; }
    if (window.ZHIYU_COMMUNITY_MODE === true) {
        if (!b) { Toast.warn('请填写模型服务地址'); return; }
        try {
            if (!window.ZHIYU_COMMUNITY_RUNTIME?.network?.requestProviderApproval?.(b)) return;
        } catch (error) {
            Toast.warn(error?.message || '模型地址不符合社区版安全规则');
            return;
        }
        const rememberKey = document.getElementById('rememberCustomModelKey')?.checked === true;
        if (k && rememberKey && !confirm('你选择了“记住 API Key”。密钥将以加密形式保存在当前浏览器中，请勿在公共或共享设备上使用。是否继续？')) return;
    } else if (k) {
        // 安全提醒：Key 将保存在浏览器本地存储中，请勿在公共设备上使用
        if (!confirm('您的 API Key 将保存在浏览器本地存储中（localStorage）。\n\n⚠️ 安全提示：\n- 请勿在公共或共享设备上保存 Key\n- 浏览器插件可能读取本地存储\n- 清除浏览器数据会导致 Key 丢失\n\n是否继续保存？')) return;
    }
    const protocol = getCustomModelProtocol(p);
    const rememberKey = window.ZHIYU_COMMUNITY_MODE === true
        ? document.getElementById('rememberCustomModelKey')?.checked === true
        : true;
    const persistenceChanged = await window.ZHIYU_SECURE_STORE?.setPersistenceEnabled?.(rememberKey);
    if (window.ZHIYU_COMMUNITY_MODE === true && persistenceChanged !== true) {
        Toast.error('API Key 保存方式修改失败，请重试');
        refreshApiKeyPersistenceControls();
        return;
    }
    const previousModels = customModels.slice();
    customModels.push({ name:n, modelId:n, provider:p, key:k, base:b, official:false, protocol });
    const saved = await saveCustomModelsForCurrentUser();
    if (saved === false) {
        customModels = previousModels;
        await saveCustomModelsForCurrentUser();
        Toast.error('模型设置保存失败，请重试');
        return;
    }
    Modal.close('addModelModal');
    document.getElementById('customModelProvider').value = '';
    document.getElementById('customModelKey').value = '';
    document.getElementById('customModelBase').value = '';
    document.getElementById('customModelName').value = '';
    activeModelScope = normalizeModelScope(activeModelScope || 'writing');
    pendingModelId = n;
    renderModelPicker();
    refreshApiKeyPersistenceControls();
    Toast.success(rememberKey ? '模型已添加，API Key 已记住' : '模型已添加，API Key 仅本次页面会话使用');
});

window.normalizeModelId = normalizeModelId;
window.normalizeModelScope = normalizeModelScope;
window.getModelUserStorageId = getModelUserStorageId;
window.getLegacyModelUserStorageIds = getLegacyModelUserStorageIds;
window.getCustomModelsStorageKey = getCustomModelsStorageKey;
window.getModelScopeStorageKey = getModelScopeStorageKey;
window.loadCustomModelsForCurrentUser = loadCustomModelsForCurrentUser;
window.saveCustomModelsForCurrentUser = saveCustomModelsForCurrentUser;
window.refreshApiKeyPersistenceControls = refreshApiKeyPersistenceControls;
window.getCustomModelProtocol = getCustomModelProtocol;
window.getCustomProviderBaseUrlMap = getCustomProviderBaseUrlMap;
window.getDefaultCustomModelBaseUrl = getDefaultCustomModelBaseUrl;
window.normalizeCustomModelBaseUrl = normalizeCustomModelBaseUrl;
window.getCustomModelEndpointPath = getCustomModelEndpointPath;
window.buildCustomModelTargetUrl = buildCustomModelTargetUrl;
window.isKnownCustomModelBaseUrl = isKnownCustomModelBaseUrl;
window.syncCustomModelBaseInputForProvider = syncCustomModelBaseInputForProvider;
window.getApiSettingsModelDisplayName = getApiSettingsModelDisplayName;
window.syncApiConfigToCustomModel = syncApiConfigToCustomModel;
window.migrateModelStorageToCurrentUser = migrateModelStorageToCurrentUser;
window.getStoredModelIdForScope = getStoredModelIdForScope;
window.reloadModelStateForCurrentUser = reloadModelStateForCurrentUser;
window.prepareModelAccountScopeChange = prepareModelAccountScopeChange;
window.isCurrentModelState = isCurrentModelState;
window.getModelIdForScope = getModelIdForScope;
window.setModelIdForScope = setModelIdForScope;
window.getModelConfigById = getModelConfigById;
window.getModelConfigForScope = getModelConfigForScope;
window.getSelectedModelConfig = getSelectedModelConfig;
window.getOutlineModelConfig = getOutlineModelConfig;
window.getActionModelConfig = getActionModelConfig;
window.getChatModelConfig = getChatModelConfig;
window.getDefaultFreeActionModelConfig = getDefaultFreeActionModelConfig;
window.shouldRetryMemoryAnalysis = shouldRetryMemoryAnalysis;
window.isUserAuthFailureForOrdinaryFallback = isUserAuthFailureForOrdinaryFallback;
window.getOrdinaryModelCandidates = getOrdinaryModelCandidates;
window.getMemoryAnalysisModelCandidates = getMemoryAnalysisModelCandidates;
window.isAdvancedOutlineAllowedModel = isAdvancedOutlineAllowedModel;
window.getAdvancedOutlineExecutionModelConfig = getAdvancedOutlineExecutionModelConfig;
window.getModelDefinitionTier = getModelDefinitionTier;
window.isModelUnavailable = isModelUnavailable;
window.getRequestTier = getRequestTier;
window.makeRequestId = makeRequestId;
window.isCustomModel = isCustomModel;
window.updateModelBtn = updateModelBtn;
window.openModelPicker = openModelPicker;
window.fetchModelHealth = fetchModelHealth;
window.refreshModelHealthForPicker = refreshModelHealthIfOpen;
window.renderModelPicker = renderModelPicker;
window.getModelProviderIcon = getModelProviderIcon;
window.renderModelProviderIcon = renderModelProviderIcon;
window.ZHIYU_MODEL_PICKER_READY = true;
})();
