(function(window) {
    'use strict';

    function stripInternalEventIdsFromNovelText(text) {
        return String(text || '').replace(/\s*\[(?:F|R)-\d{3,}\]\s*/g, '').replace(/\b(?:F|R)-\d{3,}\b/g, '');
    }

    function cleanGeneratedChapterContent(content) {
        return stripInternalEventIdsFromNovelText(content)
            .replace(/^#?\s*第[一二三四五六七八九十百千\d]+章[^\n]*\n*/, '')
            .replace(/\n?---+\s*\n?\(?（?本章完\)?）?\s*$/g, '')
            .trim();
    }

    function validateGeneratedChapterOutput(content, options) {
        const cleanContent = cleanGeneratedChapterContent(content);
        const compact = cleanContent.replace(/\s/g, '');
        const reasons = [];
        if (!compact) reasons.push('AI 未输出正文');
        if (/<\/?think>|推理过程|思考过程|分析注释/i.test(cleanContent.slice(0, 300))) reasons.push('包含思考或分析内容');
        if (/^(以下是|下面是|我将|我会|作为AI|作为一个AI|创作说明|分析如下|好的，|当然可以)/.test(cleanContent)) reasons.push('不是纯正文');
        return { ok: reasons.length === 0, message: reasons[0] || '', reasons, content: cleanContent };
    }

    function validateAIPolishFinalText(text, sourceText) {
        const cleaner = typeof window.cleanAIPolishFinalText === 'function' ? window.cleanAIPolishFinalText : value => String(value || '').trim();
        const content = cleaner(text);
        if (!content) return { ok: false, content: '', message: '模型没有返回有效正文，本次优化结果未应用。' };
        if (/^(?:#{1,6}\s*)?(?:诊断报告|复核报告|剧情一致性|修正说明|优化说明|总结)[:：\s]/.test(content)) {
            return { ok: false, content, message: '模型返回了分析说明，没有返回可用的优化正文。' };
        }
        const sourceLength = String(sourceText || '').replace(/\s+/g, '').length;
        const outputLength = content.replace(/\s+/g, '').length;
        if (sourceLength >= 80 && outputLength < sourceLength * 0.55) return { ok: false, content, message: '模型返回的优化正文明显不完整，本次结果未应用。' };
        if (sourceLength >= 80 && outputLength > sourceLength * 1.6) return { ok: false, content, message: '模型返回的优化正文异常变长，本次结果未应用。' };
        return { ok: true, content, message: '' };
    }

    async function ensureGeneratedChapterOutputValidOnce(content, retry, options) {
        const validator = typeof options?.validator === 'function'
            ? options.validator
            : validateGeneratedChapterOutput;
        let result = validator(content, options);
        if (result.ok) return result.content;
        const firstMessage = result.message || result.reasons?.[0] || '生成内容未通过正文校验';
        if (typeof retry !== 'function') throw new Error(firstMessage);
        result = validator(await retry(result), options);
        if (!result.ok) throw new Error(result.message || result.reasons?.[0] || '生成内容未通过正文校验');
        return result.content;
    }

    Object.assign(window, { stripInternalEventIdsFromNovelText, cleanGeneratedChapterContent, validateGeneratedChapterOutput, validateAIPolishFinalText, ensureGeneratedChapterOutputValidOnce });
})(window);
