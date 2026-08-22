(function(window) {
    'use strict';

    const MODEL_SCOPE_CONFIG = Object.freeze({
        writing: { storageKey: 'zhiyu_model_id', buttonId: 'btnModelSelect', label: '正文模型', prefix: '' },
        outline: { storageKey: 'zhiyu_outline_model_id', buttonId: 'btnOutlineModelSelect', label: '大纲模型', prefix: '大纲：' },
        action: { storageKey: 'zhiyu_action_model_id', buttonId: 'btnActionModelSelect', label: '工具模型', prefix: '模型：' },
        chat: { storageKey: 'zhiyu_chat_model_id', buttonId: '', label: '对话模型', prefix: '' }
    });

    function getModelDefinitionTier() { return 'user-provided'; }
    function isModelUnavailable() { return false; }
    function getRequestTier() { return 'user-provided'; }
    function makeRequestId(prefix) {
        return String(prefix || 'local') + ':' + Date.now().toString(36) + ':' + Math.random().toString(36).slice(2, 8);
    }

    window.ZHIYU_MODEL_CONFIG = {
        BUILTIN_MODELS: [],
        DEFAULT_MODEL_ID: '',
        ADVANCED_MODELS_FROZEN: false,
        TEMPORARILY_UNAVAILABLE_MODELS: [],
        MODEL_SCOPE_CONFIG,
        getModelDefinitionTier,
        isModelUnavailable,
        getRequestTier,
        makeRequestId
    };
    window.ZHIYU_MODEL_CONFIG_READY = true;
})(window);
