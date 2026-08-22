(function(window) {
    'use strict';

    function buildOutlineGenerationPrompt(options) {
        const {
            AppState,
            OUTLINE_WORDCOUNT,
            FORMAT_CONSTRAINTS,
            gTPublic,
            wcKey,
            coreSummary,
            mode
        } = options || {};
        const directMode = mode === 'direct';

        const wcLabel = OUTLINE_WORDCOUNT[wcKey] || '中篇 50万字';
        const genreList = typeof window.getOutlineGenreList === 'function'
            ? window.getOutlineGenreList('normal')
            : AppState.outline.genres;
        const genres = genreList.join('、');
        const preferenceTags = typeof window.getGenrePreferenceTags === 'function'
            ? window.getGenrePreferenceTags({ key: 'normal', genres: genreList }, coreSummary)
            : [];
        const cleanSummary = typeof window.stripLeadingPreferenceTags === 'function'
            ? window.stripLeadingPreferenceTags(coreSummary)
            : coreSummary;
        const genreContext = typeof window.buildGenreContextPrompt === 'function'
            ? window.buildGenreContextPrompt(genreList, preferenceTags)
            : '';
        const publicTemplates = gTPublic();
        const ownedTemplates = typeof window.gT === 'function' ? window.gT() : [];
        const templates = [...publicTemplates, ...ownedTemplates].filter(function(template, index, list) {
            return template && list.findIndex(function(candidate) {
                return candidate && String(candidate.id || '') === String(template.id || '');
            }) === index;
        });
        const selectedTemplateId = typeof window.getTemplateContextTemplateId === 'function'
            ? window.getTemplateContextTemplateId('outline')
            : AppState.outline.templateId;
        const template = templates.find(function(item) {
            return item && (
                String(item.id || '') === String(selectedTemplateId || '')
                || String(item.cloudId || '') === String(selectedTemplateId || '')
            );
        });
        const serverTemplateId = String(template?.cloudId || template?.id || selectedTemplateId || '');
        // 公开模板列表只返回元数据，不下发提示词正文。
        // 此处必须保留空值，让官方生成接口按 templateId 读取真实模板；
        // 不能用通用提示词顶替，否则会绕过用户实际选择的模板。
        const systemPrompt = template?.systemPrompt || '';
        let userMessage = '请根据以下资料生成小说大纲，严格参考所有资料内容。\n\n';

        userMessage += `题材：${genres}\n小说总字数：${wcLabel}`;
        if (genreContext) userMessage += '\n\n' + genreContext;
        if (cleanSummary) userMessage += '\n\n核心梗概：' + cleanSummary;

        userMessage += directMode
            ? (FORMAT_CONSTRAINTS?.OUTLINE_DIRECT || FORMAT_CONSTRAINTS?.OUTLINE || '')
            : (FORMAT_CONSTRAINTS?.OUTLINE || '');

        if (AppState.outline.importedWorkSummary) {
            userMessage += '\n\n---\n以下是对参考作品《' + AppState.outline.importedWorkName + '》的AI内容分析。请吸收其中风格/节奏/结构的方法论，但禁止直接使用原作的设定、角色名、地名。\n' + AppState.outline.importedWorkSummary;
        }

        return {
            wcLabel,
            genres,
            preferenceTags,
            genreContext,
            templateId: serverTemplateId,
            template,
            systemPrompt,
            userMessage
        };
    }

    window.buildOutlineGenerationPrompt = buildOutlineGenerationPrompt;
    window.ZHIYU_OUTLINE_PROMPT_BUILDER_READY = true;
})(window);
