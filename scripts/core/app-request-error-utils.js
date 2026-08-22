(function(window) {
    'use strict';

    let lastChatRequestAt = 0;

    function waitForMs(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function waitForChatRateSlot(minInterval = 1200) {
        const waitMs = Math.max(0, lastChatRequestAt + minInterval - Date.now());
        if (waitMs > 0) await waitForMs(waitMs);
        lastChatRequestAt = Date.now();
    }

    function getRetryDelayMs(response, attempt) {
        const retryAfter = Number(response?.headers?.get?.('retry-after') || 0);
        if (retryAfter > 0) return Math.min(retryAfter * 1000, 8000);
        return [1500, 3000, 5000][attempt] || 5000;
    }

    function redactSensitiveErrorText(value) {
        return String(value || '')
            .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[模型密钥已隐藏]')
            .replace(/\bBearer\s+[A-Za-z0-9._~+\/=-]{8,}\b/gi, 'Bearer [授权信息已隐藏]')
            .replace(/((?:api[_-]?key|password|passwd|secret|access[_-]?token|refresh[_-]?token)\s*[:=]\s*["']?)[^"',\s}\]]+/gi, '$1[已隐藏]');
    }

    function extractBackendErrorText(value, depth = 0) {
        if (depth > 3 || value == null) return '';
        if (typeof value === 'string') {
            const raw = value.trim();
            if (!raw) return '';
            try {
                const parsed = JSON.parse(raw);
                return extractBackendErrorText(parsed, depth + 1) || raw;
            } catch (_error) {
                return raw;
            }
        }
        if (typeof value === 'object') {
            return ['code', 'type', 'message', 'error', 'details']
                .map(key => extractBackendErrorText(value[key], depth + 1))
                .filter(Boolean)
                .join(' ')
                .trim();
        }
        return String(value || '').trim();
    }

    function getAiLengthLimitMessage(status, raw, code) {
        const text = [code || '', raw || ''].join(' ');
        if (Number(status) === 413 || /INPUT_TOO_LONG|payload\s+too\s+large|request\s+entity\s+too\s+large|请求体过大|输入过长|章节内容过长/i.test(text)) {
            return '本次提交内容过长。请减少正文、关联文件、导入章节或补充指令后重试。';
        }
        if (/OUTPUT_TOO_LONG|max[_\s-]*tokens?.*(?:exceed|too\s*large|invalid|limit)|maximum\s+output|输出.*(?:过长|上限)/i.test(text)) {
            return '本次要求生成的内容超过模型输出上限。请降低字数、分段生成，或换上下文更大的模型。';
        }
        if (/context[_\s-]*(?:length|window)|context_length_exceeded|maximum\s+context|too\s+many\s+tokens|输入内容太长|超过.*(?:上下文|token|模型|长度|字数|字符)/i.test(text)) {
            return '本次输入超过模型上下文上限。请减少关联文件、章节、提示词或补充指令。';
        }
        return '';
    }

    function getAiRateLimitMessage(status, raw) {
        const text = String(raw || '');
        if (Number(status) !== 429 && !/\b429\b|Too Many Requests|Rate limit|rate_limit|限流|请求过于频繁/i.test(text)) return '';
        if (/quota|insufficient_quota|usage\s+limit|monthly\s+budget|hard\s+limit|额度|余额|账单/i.test(text)) {
            return '自备模型账户额度不足或服务容量受限。请到对应模型服务商检查，或切换其他模型。';
        }
        if (/tokens?\s+per\s+min|TPM|token.*rate\s*limit/i.test(text)) {
            return '当前模型每分钟可处理的 Token 已达上限。请稍后重试或降低输出长度。';
        }
        return '当前模型请求过于频繁，请稍后重试。';
    }

    function getFriendlyBackendError(status, raw, code, fallback) {
        const safe = redactSensitiveErrorText(extractBackendErrorText(raw));
        const lengthMessage = getAiLengthLimitMessage(status, safe, code);
        if (lengthMessage) return lengthMessage;
        const rateMessage = getAiRateLimitMessage(status, safe);
        if (rateMessage) return rateMessage;
        if (Number(status) === 401 || /invalid.*(?:api[_ -]?key|key)|unauthorized|authentication/i.test(safe)) {
            return '自备模型 API Key 无效，请检查模型设置。';
        }
        if (Number(status) === 403 || /forbidden|permission|权限/i.test(safe)) {
            return '自备模型拒绝访问，请检查 API Key 和模型权限。';
        }
        if (Number(status) === 402) {
            return '自备模型账户额度不足，请到对应模型服务商处理。';
        }
        if (Number(status) >= 500 || /upstream|service\s+unavailable|gateway|服务暂时不可用/i.test(safe)) {
            return '自备模型服务暂时不可用，请稍后重试或切换模型。';
        }
        if (/input[\s_-]*new[\s_-]*sensitive|new_sensitive|1026/i.test(safe)) {
            return '本次输入触发模型服务商的内容限制。请调整题材描述或减少敏感内容后重试。';
        }
        return safe || fallback || '模型请求失败';
    }

    function formatAiErrorForDisplay(error, fallback) {
        const status = Number(error?.status || error?.upstreamStatus || 0);
        const code = String(error?.code || '');
        const raw = [error?.rawBody, error?.message, code].filter(Boolean).join(' ');
        if (error?.name === 'AbortError' || code === 'AI_REQUEST_CANCELLED') return '已停止生成';
        if (error?.name === 'TimeoutError' || status === 408 || /timeout|timed\s*out|超时/i.test(raw)) {
            return '模型响应超时，本次生成未完成。';
        }
        return getFriendlyBackendError(status, raw, code, fallback);
    }

    function formatExecutionLogMessage(error, fallback) {
        return formatAiErrorForDisplay(error, fallback || '模型请求失败');
    }

    function formatBackendErrorData(status, data, fallback) {
        const code = String(data?.code || data?.error?.code || '');
        return getFriendlyBackendError(status, data, code, fallback);
    }

    function parseBackendErrorMessage(status, text, fallback) {
        try {
            return formatBackendErrorData(status, JSON.parse(text || '{}'), fallback);
        } catch (_error) {
            return getFriendlyBackendError(status, text, '', fallback);
        }
    }

    function formatMemoryAiError(error, fallback) {
        return formatAiErrorForDisplay(error, fallback || 'AI 分析失败');
    }

    function getChapterGenerationFailureLogMessage(error) {
        const text = String([error?.rawBody, error?.message, error?.code].filter(Boolean).join(' '));
        if (error?.name === 'AbortError' || /REQUEST_CANCELED|canceled by client/i.test(text)) return '生成已停止。';
        if (/AI_STREAM_IDLE_TIMEOUT|stream.*idle|输出中断|长时间没有继续输出/i.test(text)) return '模型输出中断，本次生成未完成。';
        if (/empty[_\s-]*response|AI\s*未输出|未输出正文|empty content|no content/i.test(text)) return 'AI 未输出正文，本次生成未完成。';
        return formatAiErrorForDisplay(error, '正文生成失败');
    }

    window.waitForMs = waitForMs;
    window.waitForChatRateSlot = waitForChatRateSlot;
    window.getRetryDelayMs = getRetryDelayMs;
    window.extractBackendErrorText = extractBackendErrorText;
    window.getAiLengthLimitMessage = getAiLengthLimitMessage;
    window.getFriendlyBackendError = getFriendlyBackendError;
    window.getAiRateLimitMessage = getAiRateLimitMessage;
    window.redactSensitiveErrorText = redactSensitiveErrorText;
    window.formatAiErrorForDisplay = formatAiErrorForDisplay;
    window.formatExecutionLogMessage = formatExecutionLogMessage;
    window.formatBackendErrorData = formatBackendErrorData;
    window.parseBackendErrorMessage = parseBackendErrorMessage;
    window.formatMemoryAiError = formatMemoryAiError;
    window.getChapterGenerationFailureLogMessage = getChapterGenerationFailureLogMessage;
    window.ZHIYU_REQUEST_ERROR_UTILS_READY = true;
})(window);
