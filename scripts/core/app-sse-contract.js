(function(root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.ZhiyuSseContract = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    'use strict';

    const DEFAULT_SSE_BUFFER_LIMIT_CHARS = 2 * 1024 * 1024;
    const DEFAULT_SSE_EVENT_LINE_LIMIT = 10000;

    function createSseLimitError(limit) {
        const error = new Error(`AI 流式单条消息超过安全上限（${limit} 字符），已停止读取`);
        error.code = 'AI_STREAM_OUTPUT_LIMIT';
        error.status = 502;
        error.limit = limit;
        return error;
    }

    function createSseDataParser(onData, options) {
        const emit = typeof onData === 'function' ? onData : function() {};
        const opts = options || {};
        const maxBufferedChars = Math.max(
            1024,
            Number(opts.maxBufferedChars || DEFAULT_SSE_BUFFER_LIMIT_CHARS) || DEFAULT_SSE_BUFFER_LIMIT_CHARS
        );
        const maxEventLines = Math.max(
            1,
            Number(opts.maxEventLines || DEFAULT_SSE_EVENT_LINE_LIMIT) || DEFAULT_SSE_EVENT_LINE_LIMIT
        );
        const decoder = new TextDecoder();
        let textBuffer = '';
        let dataLines = [];
        let eventChars = 0;

        function emitEvent() {
            if (!dataLines.length) return;
            const payload = dataLines.join('\n');
            dataLines = [];
            eventChars = 0;
            emit(payload);
        }

        function appendDataLine(value) {
            const text = String(value || '');
            const nextChars = eventChars + text.length + (dataLines.length ? 1 : 0);
            if (nextChars > maxBufferedChars || dataLines.length + 1 > maxEventLines) {
                throw createSseLimitError(maxBufferedChars);
            }
            dataLines.push(text);
            eventChars = nextChars;
        }

        function consumeLine(line) {
            const cleanLine = String(line || '').replace(/\r$/, '');
            if (cleanLine.length > maxBufferedChars) {
                throw createSseLimitError(maxBufferedChars);
            }
            if (!cleanLine) {
                emitEvent();
                return;
            }
            if (cleanLine.startsWith(':')) return;
            if (cleanLine === 'data') {
                appendDataLine('');
                return;
            }
            if (cleanLine.startsWith('data:')) {
                appendDataLine(cleanLine.slice(5).replace(/^ /, ''));
            }
        }

        function consumeText(text, final) {
            const combined = textBuffer + String(text || '');
            const lastNewline = combined.lastIndexOf('\n');
            if (lastNewline < 0 && combined.length > maxBufferedChars) {
                throw createSseLimitError(maxBufferedChars);
            }
            const lines = combined.split('\n');
            const tail = lines.pop() || '';
            if (tail.length > maxBufferedChars) {
                throw createSseLimitError(maxBufferedChars);
            }
            textBuffer = final ? '' : tail;
            for (const line of lines) consumeLine(line);
            if (final && tail) consumeLine(tail);
            if (final) emitEvent();
        }

        return {
            push(chunk) {
                if (chunk && chunk.byteLength) consumeText(decoder.decode(chunk, { stream: true }), false);
            },
            finish() {
                consumeText(decoder.decode(), true);
            }
        };
    }

    async function readSseData(response, options) {
        const opts = options || {};
        if (!response?.body?.getReader) throw new Error('SSE_RESPONSE_BODY_MISSING');
        const reader = response.body.getReader();
        const parser = createSseDataParser(opts.onData, {
            maxBufferedChars: opts.maxBufferedChars,
            maxEventLines: opts.maxEventLines
        });
        let completed = false;
        let cancelled = false;
        try {
            while (true) {
                if (opts.signal?.aborted) {
                    await reader.cancel();
                    cancelled = true;
                    const error = new Error('用户取消了生成');
                    error.name = 'AbortError';
                    throw error;
                }
                const { done, value } = await reader.read();
                if (done) break;
                parser.push(value);
            }
            parser.finish();
            completed = true;
        } finally {
            if (!completed && !cancelled && typeof reader.cancel === 'function') {
                try {
                    await reader.cancel();
                } catch (error) {
                    // The transport may already be closed. Release the lock below.
                }
            }
            if (typeof reader.releaseLock === 'function') {
                try {
                    reader.releaseLock();
                } catch (error) {}
            }
        }
    }

    async function readJsonSse(response, options) {
        const opts = options || {};
        await readSseData(response, {
            signal: opts.signal,
            maxBufferedChars: opts.maxBufferedChars,
            maxEventLines: opts.maxEventLines,
            onData(raw) {
                if (!raw || raw.trim() === '[DONE]') return;
                let event;
                try {
                    event = JSON.parse(raw);
                } catch (error) {
                    if (typeof opts.onMalformed === 'function') opts.onMalformed(raw, error);
                    return;
                }
                if (typeof opts.onEvent === 'function') opts.onEvent(event);
            }
        });
    }

    async function collectZhiyuSseText(response, options) {
        const opts = options || {};
        let result = '';
        let hadText = false;
        let completed = false;
        await readJsonSse(response, {
            signal: opts.signal,
            onMalformed: opts.onMalformed,
            onEvent(event) {
                if (event?.error) {
                    throw createStreamError(event);
                }
                if (typeof event?.text === 'string' && event.text) {
                    hadText = true;
                    result += event.text;
                    if (typeof opts.onText === 'function') opts.onText(event.text, event);
                }
                if (event?.done) {
                    completed = true;
                    if (!hadText && typeof event.content === 'string') {
                        result = event.content;
                        if (result && typeof opts.onText === 'function') opts.onText(result, event);
                    }
                    if (typeof opts.onDone === 'function') opts.onDone(result, event);
                }
                if (typeof opts.onEvent === 'function') opts.onEvent(event);
            }
        });
        if (!completed && opts.requireCompleted !== false) {
            const error = new Error('AI 流式连接提前结束，未收到完成标志');
            error.code = 'AI_STREAM_INCOMPLETE';
            throw error;
        }
        return { content: result, completed, hadText };
    }

    function createStreamError(event) {
        const error = new Error(String(event?.error || '流式生成失败'));
        error.code = event?.code || 'STREAM_ERROR';
        error.contentDelivered = event?.contentDelivered === true;
        error.settlementPending = event?.settlementPending === true;
        error.resultCommitted = event?.resultCommitted === true;
        const status = Number(event?.upstreamStatus || event?.status || 0);
        if (Number.isFinite(status) && status > 0) {
            error.status = status;
            error.upstreamStatus = status;
        }
        try {
            error.rawBody = JSON.stringify(event || {});
        } catch (_error) {
            error.rawBody = String(event?.error || '');
        }
        return error;
    }

    return {
        createSseDataParser,
        readSseData,
        readJsonSse,
        collectZhiyuSseText,
        createStreamError
    };
});
