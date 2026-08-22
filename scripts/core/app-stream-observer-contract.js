(function initStreamObserverContract(root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.ZHIYU_STREAM_OBSERVER = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createStreamObserverContract(root) {
    'use strict';

    const MAX_INSPECTION_CHARS = 4096;
    const FAILURE_PATTERN = /"error"\s*:|data:\s*\{[^\n]*"error"/i;

    function copyMetadata(target, source) {
        ['url', 'redirected', 'type'].forEach(function(key) {
            try {
                Object.defineProperty(target, key, {
                    configurable: true,
                    enumerable: false,
                    value: source[key]
                });
            } catch (e) {}
        });
        return target;
    }

    function observeResponse(response, onFinish) {
        const callback = typeof onFinish === 'function' ? onFinish : function() {};
        const metrics = { maxBufferedChars: 0, inspectedChars: 0, failed: !response?.ok };
        let settled = false;
        const finish = function(success, reason) {
            if (settled) return;
            settled = true;
            callback(!!success, reason || '', { ...metrics });
        };

        if (!response || !response.ok || !response.body || typeof response.body.getReader !== 'function') {
            finish(!!response?.ok, response?.ok ? 'response_without_stream' : 'http_error');
            return { response, metrics };
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let inspectionTail = '';
        const inspect = function(text) {
            if (!text) return;
            metrics.inspectedChars += text.length;
            const candidate = inspectionTail + text;
            if (FAILURE_PATTERN.test(candidate)) metrics.failed = true;
            inspectionTail = candidate.slice(-MAX_INSPECTION_CHARS);
            metrics.maxBufferedChars = Math.max(metrics.maxBufferedChars, inspectionTail.length);
        };

        const observedBody = new ReadableStream({
            async pull(controller) {
                try {
                    const chunk = await reader.read();
                    if (chunk.done) {
                        inspect(decoder.decode());
                        finish(!metrics.failed, metrics.failed ? 'stream_error_frame' : 'stream_complete');
                        controller.close();
                        return;
                    }
                    inspect(decoder.decode(chunk.value, { stream: true }));
                    controller.enqueue(chunk.value);
                } catch (error) {
                    finish(false, 'stream_read_error');
                    controller.error(error);
                }
            },
            async cancel(reason) {
                finish(false, 'stream_cancelled');
                try {
                    await reader.cancel(reason);
                } catch (e) {}
            }
        });

        const observedResponse = copyMetadata(new Response(observedBody, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
        }), response);
        return { response: observedResponse, metrics };
    }

    return Object.freeze({
        MAX_INSPECTION_CHARS,
        observeResponse
    });
});
