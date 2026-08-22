// 各功能当前提示词模板的状态边界。旧字段仅保留给正文、普通大纲和细纲的兼容读取。
(function(window) {
    'use strict';

    function getState() {
        return window.ZHIYU_APP_STATE || window.AppState || {};
    }

    function getTemplateContextTemplateId(context) {
        const state = getState();
        const outline = state.outline || {};
        const outlineGen = state.outlineGen || {};
        const outlineSlots = outline.templateIds || {};
        const actionSlots = outlineGen.templateIds || {};
        if (context === 'chapter') return state.gen?.templateId || '';
        if (context === 'script') return state.script?.templateId || '';
        if (context === 'outline') return outlineSlots.outline || outline.templateId || '';
        if (context === 'functionalOutline') return outlineSlots.functionalOutline || '';
        if (context === 'functionalScript') return outlineSlots.functionalScript || '';
        if (context === 'fineOutline' || context === 'og') return actionSlots.fineOutline || outlineGen.templateId || '';
        if (context === 'decompose') return actionSlots.decompose || '';
        if (context === 'aiPolish') return String(outlineGen.apConfig?.templateId || '').replace(/^tpl:/, '');
        return '';
    }

    function setTemplateContextTemplateId(context, templateId) {
        const state = getState();
        const id = templateId || '';
        if (context === 'chapter') {
            state.gen = state.gen || {};
            state.gen.templateId = id;
            return;
        }
        if (context === 'script') {
            state.script = state.script || {};
            state.script.templateId = id;
            return;
        }
        if (context === 'aiPolish') {
            state.outlineGen = state.outlineGen || {};
            state.outlineGen.apConfig = state.outlineGen.apConfig || {};
            state.outlineGen.apConfig.templateId = id ? 'tpl:' + id : '';
            return;
        }
        if (context === 'fineOutline' || context === 'og' || context === 'decompose') {
            state.outlineGen = state.outlineGen || {};
            state.outlineGen.templateIds = state.outlineGen.templateIds || {};
            const key = context === 'decompose' ? 'decompose' : 'fineOutline';
            state.outlineGen.templateIds[key] = id;
            if (key === 'fineOutline') state.outlineGen.templateId = id;
            return;
        }
        state.outline = state.outline || {};
        state.outline.templateIds = state.outline.templateIds || {};
        const key = context === 'functionalOutline'
            ? 'functionalOutline'
            : (context === 'functionalScript' ? 'functionalScript' : 'outline');
        state.outline.templateIds[key] = id;
        if (key === 'outline') state.outline.templateId = id;
    }

    function resetTemplateAccountScopeState() {
        const state = getState();
        state.gen = state.gen || {};
        state.script = state.script || {};
        state.outline = state.outline || {};
        state.outlineGen = state.outlineGen || {};
        state.gen.templateId = '';
        state.script.templateId = '';
        state.outline.templateId = '';
        state.outline.templateIds = {};
        state.outlineGen.templateId = '';
        state.outlineGen.templateIds = {};
        state.outlineGen.templateName = '';
        state.outlineGen.apConfig = { ...(state.outlineGen.apConfig || {}), templateId: '', templateName: '' };
        window._editingTplId = null;
        window._editingTpl = null;
        window._tplSelectContext = '';
        window.closeTemplateQuickMenu?.();
        window.ZHIYU_MODAL?.close?.('templateSelectModal');
    }

    window.getTemplateContextTemplateId = getTemplateContextTemplateId;
    window.setTemplateContextTemplateId = setTemplateContextTemplateId;
    window.resetTemplateAccountScopeState = resetTemplateAccountScopeState;
    window.ZHIYU_TEMPLATE_CONTEXT_STATE_READY = true;
})(window);
