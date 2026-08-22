(function(window) {
    'use strict';

    async function generateWithModel(modelCfg, systemPrompt, prompt, requestTraceGroup, requestId) {
        const resp = await window.callLLMAPI(
            { key: '', base: '', model: '' },
            systemPrompt,
            prompt,
            modelCfg,
            {
                requestFeature: 'summary',
                requestId,
                requestTraceGroup: requestTraceGroup || ''
            }
        );
        return resp?.content?.[0]?.text || '';
    }

    function getOrdinaryCandidates() {
        const candidates = typeof window.getOrdinaryModelCandidates === 'function'
            ? window.getOrdinaryModelCandidates()
            : [];
        return candidates.filter(function(candidate) {
            return candidate && !candidate.custom && window.getRequestTier(candidate) !== 'advanced';
        });
    }

    async function generateWithOrdinaryModels(systemPrompt, prompt, requestTraceGroup) {
        const candidates = getOrdinaryCandidates();
        if (!candidates.length) throw new Error('没有可用的普通模型');
        const makeFallbackRequestId = function() {
            return window.makeRequestId?.('summary_memory')
                || `summary_memory:${Date.now()}:${Math.random().toString(16).slice(2)}`;
        };
        let requestId = makeFallbackRequestId();
        let lastError = null;
        for (let index = 0; index < candidates.length; index += 1) {
            const candidate = candidates[index];
            try {
                const result = await generateWithModel(
                    candidate,
                    systemPrompt,
                    prompt,
                    requestTraceGroup,
                    requestId
                );
                if (String(result || '').trim()) return result;
                const emptyError = new Error('AI 未返回内容');
                emptyError.code = 'EMPTY_RESPONSE';
                throw emptyError;
            } catch (error) {
                if (window.isAuthExpiredError?.(error)) throw error;
                lastError = error;
                const canRetry = typeof window.shouldRetryMemoryAnalysis === 'function'
                    && window.shouldRetryMemoryAnalysis(error);
                if (!canRetry || index >= candidates.length - 1) throw error;
                if (error?.code === 'EMPTY_RESPONSE') requestId = makeFallbackRequestId();
                window.Utils?.appendLog?.(
                    null,
                    '⚠️ 普通模型临时失败，正在自动切换下一个普通模型',
                    'progress'
                );
            }
        }
        throw lastError || new Error('普通模型调用失败');
    }

    function logMemoryAiError(error, fallback) {
        const message = typeof window.formatAiErrorForDisplay === 'function'
            ? window.formatAiErrorForDisplay(error, fallback)
            : String(error?.message || error || fallback);
        const detail = String(message || fallback).startsWith(fallback)
            ? String(message || fallback)
            : (fallback + '：' + String(message || fallback));
        window.Utils?.appendLog?.(null, '⚠️ ' + detail, 'error');
    }

    function shouldRethrowAuthError(error) {
        return window.isAuthExpiredError?.(error);
    }

    async function generateValidatedMemoryRow(systemPrompt, prompt, validator, cardName, retrySystemPrompt, requestTraceGroup) {
        const firstOutput = await generateWithOrdinaryModels(systemPrompt, prompt, requestTraceGroup);
        if (typeof validator !== 'function') return firstOutput;
        return window.validateMemoryOutputWithSingleRetry(
            firstOutput,
            validator,
            async ({ reason }) => generateWithOrdinaryModels(
                retrySystemPrompt || (systemPrompt + ' 请严格按格式返回，不要解释。'),
                prompt + '\n\n上一次失败原因：' + reason + '\n请只重新输出一行合格表格。',
                requestTraceGroup
            ),
            cardName
        );
    }

    async function generateTrackingCardFromOutline(bookName, outlineContent, genres) {
        if (!outlineContent) return '';
        const prompt = `根据以下小说大纲，提取追踪表信息。只输出表格，不要其他解释。

【大纲内容】
${outlineContent}

| 章节 | 章节进度 | 角色状态变化 | 伏笔追踪 |

章节填"大纲阶段"。章节进度：用一句话概括大纲规划的整体进度。角色状态变化：标注大纲中角色的初始状态（如"叶凡登场，修为练气期"）。伏笔追踪：列出大纲埋设的伏笔钩子，未解标⚪。

极简总结、不赘述，无新内容则跳过。`;
        try {
            return await generateWithOrdinaryModels(
                '你是一位专业的小说编辑，擅长整理和结构化小说信息。请严格按要求格式回复。',
                prompt
            );
        } catch (e) {
            if (shouldRethrowAuthError(e)) throw e;
            logMemoryAiError(e, '追踪表生成失败');
            throw e;
        }
    }

    async function generateBoundaryFromOutline(bookName, outlineContent) {
        if (!outlineContent) return '';
        const prompt = `根据以下小说大纲，提取边界卡信息。只输出表格，不要其他解释。

【大纲内容】
${outlineContent}

| 章节 | 本章禁区 | 下章规划 | 进度提醒(≤20字) |

章节填"大纲阶段"。本章禁区：根据大纲推断整体写作中应避免的雷区（2-3条，每条≤20字）。下章规划：大纲阶段暂填"见大纲"。进度提醒：用一句话（≤20字）提示故事推进方向。

极简总结、不赘述，无新内容则跳过。`;
        try {
            return await generateWithOrdinaryModels(
                '你是一位专业的小说设定分析师。请严格按要求格式回复。',
                prompt
            );
        } catch (e) {
            if (shouldRethrowAuthError(e)) throw e;
            logMemoryAiError(e, '边界卡生成失败');
            throw e;
        }
    }

    async function generateTrackingEntryFromChapter(bookName, chapterContent, meta) {
        if (!chapterContent) return '';
        const chapterNum = meta?.chapterNum || '?';
        const prompt = `分析以下小说章节，生成追踪表条目。只回复一行表格，不要其他解释。

正文内容：${chapterContent}

| 第${chapterNum}章 | {章节进度，≤20字} | {角色状态变化，死亡/退场/新登场，无则填—} | {伏笔追踪，新伏笔标⚪，已解标✅，无则填—} |`;
        try {
            const row = await generateValidatedMemoryRow(
                '你是一位专业的小说编辑。',
                prompt,
                output => window.validateTrackingRowOutput?.(output, chapterNum) || { ok: true, content: output },
                '追踪表',
                '你是一位专业的小说编辑。只输出一行合格表格。',
                meta?.requestTraceGroup || ''
            );
            return '\n' + row.trim().replace(/^\|?\s*/, '| ');
        } catch (e) {
            if (shouldRethrowAuthError(e)) throw e;
            logMemoryAiError(e, '追踪表条目生成失败');
            throw e;
        }
    }

    async function generateBoundaryEntryFromChapter(bookName, chapterContent, meta) {
        if (!chapterContent) return '';
        const chapterNum = meta?.chapterNum || '?';
        const prompt = `分析以下小说章节，生成边界卡条目。只回复一行表格，不要其他解释。

正文内容：${chapterContent}

| 第${chapterNum}章 | {本章禁区，≤20字} | {下章规划，≤20字} | {进度提醒，≤20字，提示下章该推进什么} |`;
        try {
            const row = await generateValidatedMemoryRow(
                '你是一位专业的小说设定分析师。',
                prompt,
                output => window.validateBoundaryRowOutput?.(output, chapterNum) || { ok: true, content: output },
                '边界卡',
                '你是一位专业的小说设定分析师。只输出一行合格表格。',
                meta?.requestTraceGroup || ''
            );
            return '\n' + row.trim().replace(/^\|?\s*/, '| ');
        } catch (e) {
            if (shouldRethrowAuthError(e)) throw e;
            logMemoryAiError(e, '边界卡条目生成失败');
            throw e;
        }
    }

    async function generateContinuityEntryFromChapter(bookName, chapterContent, meta) {
        if (!chapterContent) return null;
        const chapterNum = meta?.chapterNum || '?';
        const prompt = `分析以下小说章节，只提取"下一章承接"所需信息。只返回JSON，不要解释，不要Markdown。

字段和长度限制：
{
  "lastScene": "本章最后画面，≤30字",
  "unfinishedAction": "结尾未完成动作/冲突，≤30字，无则填—",
  "location": "结尾地点，≤20字",
  "presentCharacters": "结尾在场角色，≤30字",
  "characterState": "主要角色即时状态，≤40字",
  "emotionAftertaste": "结尾情绪余波，≤30字",
  "openingSuggestion": "下一章第一场怎么接，≤40字",
  "doNotOpenWith": "下一章开头应避免什么，≤40字"
}

当前作品：${bookName}
当前章节：第${chapterNum}章《${meta?.chapterName || ''}》
正文内容：
${chapterContent}`;
        try {
            let result = await generateWithOrdinaryModels(
                '你是长篇网文小说的章节承接编辑，只做简短、可执行的承接摘要。',
                prompt,
                meta?.requestTraceGroup || ''
            );
            let data = window.extractJSONBlock(result);
            if (!data || typeof data !== 'object' || !Object.keys(data).some(key => ['lastScene', 'unfinishedAction', 'location', 'openingSuggestion'].includes(key))) {
                result = await generateWithOrdinaryModels(
                    '你是长篇网文小说的章节承接编辑。只返回有效JSON。',
                    prompt + '\n\n上一次返回不是有效承接JSON，请重新返回一个JSON对象，不要解释，不要Markdown代码块。',
                    meta?.requestTraceGroup || ''
                );
                data = window.extractJSONBlock(result);
            }
            if (!data || typeof data !== 'object') throw new Error('承接卡格式校验失败');
            return window.normalizeContinuityData(data);
        } catch (e) {
            if (shouldRethrowAuthError(e)) throw e;
            logMemoryAiError(e, '承接卡生成失败');
            throw e;
        }
    }

    window.ZHIYU_MEMORY_AI_GENERATORS = {
        generateTrackingCardFromOutline,
        generateBoundaryFromOutline,
        generateTrackingEntryFromChapter,
        generateBoundaryEntryFromChapter,
        generateContinuityEntryFromChapter
    };

    window.generateTrackingCardFromOutline = generateTrackingCardFromOutline;
    window.generateBoundaryFromOutline = generateBoundaryFromOutline;
    window.generateTrackingEntryFromChapter = generateTrackingEntryFromChapter;
    window.generateBoundaryEntryFromChapter = generateBoundaryEntryFromChapter;
    window.generateContinuityEntryFromChapter = generateContinuityEntryFromChapter;
})(window);
