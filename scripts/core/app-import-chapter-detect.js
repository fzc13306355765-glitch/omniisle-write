// Split project import chapter AI detector.
// Owns the fallback AI chapter detection used by the import-book flow.
(function(window) {
    'use strict';

    function getImportModelCandidates() {
        const model = window.getActionModelConfig?.() || window.getSelectedModelConfig?.();
        return model?.base && model?.model ? [model] : [];
    }

    async function streamImportGenerate(...args) {
        if (typeof window.streamGenerate !== 'function') throw new Error('AI生成接口未加载');
        return window.streamGenerate(...args);
    }

    async function callImportLLMAPI(...args) {
        if (typeof window.callLLMAPI !== 'function') throw new Error('AI调用接口未加载');
        return window.callLLMAPI(...args);
    }

    async function aiDetectChapters(fullText) {
        const sample = String(fullText || '').substring(0, 15000);

        const prompt = `请分析以下小说文本，找出所有章节标题及其在文本中的位置。

【文本内容】
${sample}

请列出所有检测到的章节，每行一个，格式为：
第N章 章节标题名 | 起始位置数字

起始位置是章节标题第一个字在原文中的字符索引（从0开始）。如果章节没有标题名，只写"第N章"。
只输出章节列表，不要解释。

示例输出：
第一章 大漠惊魂 | 0
第二章 拜师学艺 | 5234
第三章 | 10892`;

        const candidates = getImportModelCandidates();
        if (!candidates.length) throw new Error('请先添加并选择一个自备模型');
        let result = '';
        let lastError = null;
        for (let index = 0; index < candidates.length; index += 1) {
            const modelCfg = candidates[index];
            try {
                const resp = await callImportLLMAPI(
                    { key: '', base: '', model: '' },
                    '你是专业文本分析助手。',
                    prompt,
                    modelCfg
                );
                result = resp?.content?.[0]?.text || resp?.choices?.[0]?.message?.content || '';
                if (String(result).trim()) break;
                const emptyError = new Error('AI章节分析未返回内容');
                emptyError.code = 'EMPTY_RESPONSE';
                throw emptyError;
            } catch (error) {
                if (typeof window.isAbortLikeError === 'function' && window.isAbortLikeError(error)) throw error;
                if (typeof window.isAuthExpiredError === 'function' && window.isAuthExpiredError(error)) throw error;
                lastError = error;
                const retryable = typeof window.shouldRetryMemoryAnalysis === 'function'
                    ? window.shouldRetryMemoryAnalysis(error)
                    : false;
                if (index >= candidates.length - 1 || !retryable) throw error;
            }
        }
        if (!String(result).trim() && lastError) throw lastError;

        const lines = String(result || '').split('\n').filter(line => line.includes('第') && line.includes('章') && line.includes('|'));
        const chapters = [];
        for (const line of lines) {
            const parts = line.split('|');
            if (parts.length < 2) continue;
            const title = parts[0].trim();
            const pos = parseInt(parts[1].trim(), 10);
            if (!Number.isNaN(pos) && pos >= 0 && pos < String(fullText || '').length) {
                chapters.push({ title, index: pos });
            }
        }

        if (chapters.length === 0) return null;

        return chapters.map(ch => ({
            0: ch.title,
            index: ch.index,
            input: fullText
        }));
    }

    window.aiDetectChapters = aiDetectChapters;
    window.ZHIYU_IMPORT_CHAPTER_DETECT_READY = true;
})(window);
