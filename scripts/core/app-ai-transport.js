(function(window) {
    'use strict';

    const DEFAULT_AI_CHAT_TIMEOUT_MS = 180000;
    const DEFAULT_AI_STREAM_TIMEOUT_MS = 900000;

    function normalizeTimeoutMs(value, fallback) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
        return Math.max(1000, Math.min(1800000, Math.floor(parsed)));
    }

    function createAbortError(signal, fallbackMessage) {
        const reason = signal?.reason;
        if (reason instanceof Error) return reason;
        const error = new Error(String(reason || fallbackMessage || '用户取消了生成'));
        error.name = 'AbortError';
        error.code = 'AI_REQUEST_CANCELLED';
        error.status = 499;
        return error;
    }

    function beginRequestControl(externalSignals, timeoutMs, fallbackTimeoutMs) {
        const controller = new AbortController();
        const signals = (Array.isArray(externalSignals) ? externalSignals : [externalSignals]).filter(Boolean);
        const listeners = [];
        const timer = setTimeout(function() {
            if (controller.signal.aborted) return;
            const error = new Error('AI 响应等待超时，本次生成未完成。');
            error.name = 'TimeoutError';
            error.code = 'AI_CLIENT_TIMEOUT';
            error.status = 408;
            controller.abort(error);
        }, normalizeTimeoutMs(timeoutMs, fallbackTimeoutMs));

        signals.forEach(function(signal) {
            const abortFromExternal = function() {
                if (!controller.signal.aborted) controller.abort(createAbortError(signal));
            };
            if (signal.aborted) abortFromExternal();
            else {
                signal.addEventListener('abort', abortFromExternal, { once: true });
                listeners.push({ signal, abortFromExternal });
            }
        });

        return {
            signal: controller.signal,
            release() {
                clearTimeout(timer);
                listeners.forEach(function(item) {
                    try { item.signal.removeEventListener('abort', item.abortFromExternal); } catch (_error) {}
                });
            }
        };
    }

    function waitForStep(value, signal) {
        if (!signal) return Promise.resolve(value);
        return new Promise(function(resolve, reject) {
            let settled = false;
            const finish = function(callback, result) {
                if (settled) return;
                settled = true;
                try { signal.removeEventListener('abort', onAbort); } catch (_error) {}
                callback(result);
            };
            const onAbort = function() { finish(reject, createAbortError(signal)); };
            signal.addEventListener('abort', onAbort, { once: true });
            if (signal.aborted) onAbort();
            Promise.resolve(value).then(
                function(result) { finish(resolve, result); },
                function(error) { finish(reject, error); }
            );
        });
    }

    async function runModelRequestWithTimeout(externalSignal, executor, timeoutMs) {
        if (typeof executor !== 'function') throw new TypeError('模型请求执行器无效');
        const requestControl = beginRequestControl(externalSignal, timeoutMs, DEFAULT_AI_STREAM_TIMEOUT_MS);
        try {
            return await waitForStep(
                Promise.resolve().then(function() {
                    if (requestControl.signal.aborted) throw createAbortError(requestControl.signal);
                    return executor(requestControl.signal);
                }),
                requestControl.signal
            );
        } finally {
            requestControl.release();
        }
    }

    function beginLocalIdentityTask(externalSignal) {
        if (typeof window.beginAccountScopedTask === 'function') {
            return window.beginAccountScopedTask(externalSignal);
        }
        const uid = window.AccountDataScope?.getActiveUid?.() || 'community-local';
        return {
            signal: externalSignal,
            matchesAccount() {
                return (window.AccountDataScope?.getActiveUid?.() || 'community-local') === uid;
            },
            release() {}
        };
    }

    function assertIdentityCurrent(task) {
        if (!task?.matchesAccount?.()) {
            const error = new Error('本地身份已变化，旧请求已停止');
            error.name = 'AbortError';
            error.code = 'LOCAL_IDENTITY_CHANGED';
            throw error;
        }
        if (task?.signal?.aborted) throw createAbortError(task.signal);
    }

    function normalizeTransportError(value, fallback, metadata) {
        const source = value && typeof value === 'object' ? value : null;
        const error = value instanceof Error
            ? value
            : new Error(String(source?.message || value || fallback || 'AI 调用失败'));
        const extra = metadata && typeof metadata === 'object' ? metadata : {};
        ['status', 'code', 'rawBody'].forEach(function(key) {
            if (error[key] !== undefined && error[key] !== null && error[key] !== '') return;
            const nextValue = extra[key] ?? source?.[key];
            if (nextValue !== undefined && nextValue !== null && nextValue !== '') error[key] = nextValue;
        });
        return error;
    }

    function parseErrorCode(rawBody) {
        try {
            const data = JSON.parse(String(rawBody || ''));
            return String(data?.code || data?.error?.code || '');
        } catch (_error) {
            return '';
        }
    }

    function createHttpError(response, rawBody, message) {
        return normalizeTransportError(new Error(message), message, {
            status: Number(response?.status || 0),
            code: parseErrorCode(rawBody),
            rawBody: String(rawBody || '')
        });
    }

    function reportError(onError, error) {
        try {
            onError(error);
        } catch (callbackError) {
            throw normalizeTransportError(callbackError, error?.message || 'AI 调用失败', error);
        }
    }

    function selectedModel(configOverride) {
        const model = configOverride && typeof configOverride === 'object'
            ? configOverride
            : window.getSelectedModelConfig?.();
        if (!model?.base || !model?.model) {
            const error = new Error('请先在设置中添加并选择自己的模型');
            error.code = 'COMMUNITY_MODEL_REQUIRED';
            throw error;
        }
        return model;
    }

    function makeRequest(model, systemPrompt, userMessage) {
        const protocol = String(model.protocol || 'openai').toLowerCase();
        const base = String(model.base || '').replace(/\/+$/, '');
        if (protocol === 'anthropic') {
            return {
                protocol,
                url: base + '/messages',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': String(model.key || ''),
                    'anthropic-version': '2023-06-01'
                },
                body: {
                    model: model.model,
                    max_tokens: model.maxTokens || window.CONFIG?.MAX_TOKENS_DEFAULT || 8192,
                    stream: true,
                    system: systemPrompt,
                    messages: [{ role: 'user', content: userMessage }]
                }
            };
        }
        const headers = { 'Content-Type': 'application/json' };
        if (String(model.key || '')) headers.Authorization = 'Bearer ' + model.key;
        return {
            protocol: 'openai',
            url: base + '/chat/completions',
            headers,
            body: {
                model: model.model,
                max_tokens: model.maxTokens || window.CONFIG?.MAX_TOKENS_DEFAULT || 8192,
                stream: true,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage }
                ]
            }
        };
    }

    async function streamGenerate(config, systemPrompt, userMessage, onChunk, onDone, onError, signal, requestOptions) {
        if (!signal && onError && typeof onError === 'object' && 'aborted' in onError) {
            signal = onError;
            onError = null;
        }
        const safeOnChunk = typeof onChunk === 'function'
            ? onChunk
            : function(chunk) { if (onChunk && 'textContent' in onChunk) onChunk.textContent += chunk; };
        const safeOnDone = typeof onDone === 'function' ? onDone : function() {};
        const safeOnError = typeof onError === 'function'
            ? onError
            : function(error) { throw normalizeTransportError(error, 'API 调用失败'); };
        const options = requestOptions && typeof requestOptions === 'object' ? requestOptions : {};
        const model = selectedModel(config);
        const request = makeRequest(model, String(systemPrompt || ''), String(userMessage || ''));
        const requestControl = beginRequestControl(
            [signal, options.signal],
            options.timeoutMs ?? model.timeoutMs,
            DEFAULT_AI_STREAM_TIMEOUT_MS
        );
        const identityTask = beginLocalIdentityTask(requestControl.signal);

        try {
            assertIdentityCurrent(identityTask);
            window.ZHIYU_COMMUNITY_RUNTIME?.network?.assertProviderRequest?.(request.url);
            const response = await waitForStep(fetch(request.url, {
                method: 'POST',
                headers: request.headers,
                body: JSON.stringify(request.body),
                signal: identityTask.signal
            }), identityTask.signal);
            assertIdentityCurrent(identityTask);
            if (!response.ok) {
                const rawBody = await response.text().catch(function() { return ''; });
                let message = `自备模型请求失败（${response.status}）`;
                if (response.status === 401) message = '自备模型 API Key 无效，请检查设置。';
                else if (response.status === 403) message = '自备模型拒绝访问，请检查 API Key 和模型权限。';
                else if (response.status === 429) message = '自备模型请求过于频繁或账户额度受限，请稍后重试。';
                else if (response.status >= 500) message = '自备模型服务暂时不可用，请稍后重试。';
                throw createHttpError(response, rawBody, message);
            }

            let fullContent = '';
            let completed = false;
            await waitForStep(window.ZhiyuSseContract.readSseData(response, {
                signal: identityTask.signal,
                onData(raw) {
                    assertIdentityCurrent(identityTask);
                    if (!raw) return;
                    if (raw.trim() === '[DONE]') {
                        completed = true;
                        return;
                    }
                    let data;
                    try { data = JSON.parse(raw); } catch (_error) { return; }
                    if (data?.error) {
                        const streamError = new Error('自备模型在生成过程中返回错误，请稍后重试。');
                        streamError.code = String(data.error.code || 'CUSTOM_MODEL_STREAM_ERROR');
                        streamError.rawBody = String(raw);
                        throw streamError;
                    }
                    if (data?.done === true
                        || data?.type === 'message_stop'
                        || String(data?.choices?.[0]?.finish_reason || '').trim()) {
                        completed = true;
                    }
                    let content = '';
                    if (request.protocol === 'openai') {
                        content = data.choices?.[0]?.delta?.content || '';
                    } else if (data.type === 'content_block_delta' && data.delta?.text) {
                        content = data.delta.text;
                    } else if (data.type === 'content_block_start' && data.content_block?.text) {
                        content = data.content_block.text;
                    }
                    if (content) {
                        fullContent += content;
                        safeOnChunk(content);
                    }
                }
            }), identityTask.signal);
            if (!completed) {
                const error = new Error('自备模型连接提前结束，未收到完成标志。');
                error.code = 'AI_STREAM_INCOMPLETE';
                throw error;
            }
            if (!fullContent.trim()) throw new Error('自备模型没有返回内容');
            assertIdentityCurrent(identityTask);
            window.recordLocalModelCall?.();
            safeOnDone(fullContent);
            return fullContent;
        } catch (value) {
            if (!identityTask.matchesAccount()) return '';
            reportError(safeOnError, normalizeTransportError(value, 'API 调用失败'));
            return '';
        } finally {
            identityTask.release();
            requestControl.release();
        }
    }

    async function streamCustomTemplateGenerate(config, _templateId, userMessage, onChunk, onDone, onError, signal, requestOptions) {
        const options = requestOptions && typeof requestOptions === 'object' ? requestOptions : {};
        const systemPrompt = String(options.systemPrompt || '').trim();
        if (!systemPrompt) {
            const error = new Error('没有找到本地模板内容，已停止发送请求');
            error.code = 'COMMUNITY_LOCAL_TEMPLATE_REQUIRED';
            reportError(typeof onError === 'function' ? onError : function(value) { throw value; }, error);
            return '';
        }
        return streamGenerate(config, systemPrompt, userMessage, onChunk, onDone, onError, signal, options);
    }

    async function callLLMAPI(config, systemPrompt, userMessage, modelOverride, requestOptions) {
        const model = selectedModel(modelOverride || config);
        const options = requestOptions && typeof requestOptions === 'object' ? requestOptions : {};
        let directError = null;
        const content = await streamGenerate(
            model,
            systemPrompt,
            userMessage,
            function() {},
            function() {},
            function(error) { directError = error; },
            options.signal,
            options
        );
        if (!String(content || '').trim()) throw directError || new Error('自备模型没有返回内容');
        return { content: [{ text: content }] };
    }

    window.ZHIYU_AI_TRANSPORT = {
        streamGenerate,
        streamCustomTemplateGenerate,
        callLLMAPI,
        runModelRequestWithTimeout
    };
    window.streamGenerate = streamGenerate;
    window.streamCustomTemplateGenerate = streamCustomTemplateGenerate;
    window.callLLMAPI = callLLMAPI;
    window.runModelRequestWithTimeout = runModelRequestWithTimeout;
    window.runOfficialAiRequestWithTimeout = runModelRequestWithTimeout;
    window.BACKEND_URL = '';
    window.STREAM_URL = '';
})(window);
