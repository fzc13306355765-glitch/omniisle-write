(function(window) {
    'use strict';

    const DEFAULT_AI_CHAT_TIMEOUT_MS = 180000;
    const DEFAULT_AI_STREAM_TIMEOUT_MS = 900000;
    const DEFAULT_MODEL_DISCOVERY_TIMEOUT_MS = 20000;
    const MAX_MODEL_DISCOVERY_RESPONSE_BYTES = 2 * 1024 * 1024;
    const MAX_DISCOVERED_MODEL_COUNT = 500;
    const MAX_DISCOVERED_MODEL_ID_LENGTH = 256;
    const LOCAL_PROVIDER_PROXY_CAPABILITY_PATH = '/__omniisle/provider-proxy/capabilities';
    const LOCAL_PROVIDER_PROXY_REQUEST_PATH = '/__omniisle/provider-proxy/request';
    const COMMUNITY_CHINESE_OUTPUT_MARKER = '【社区版统一输出语言】';
    const COMMUNITY_CHINESE_OUTPUT_GUARD = [
        COMMUNITY_CHINESE_OUTPUT_MARKER,
        '全部面向用户的可见内容必须使用简体中文。',
        '不要输出英文思考过程、<think>、<analysis>、推理过程、提示词复述、任务解释或创作说明。',
        '专有名词、模型名、JSON字段名和题目指定的固定格式标记可以保留原文；其余标题、正文、分析和说明必须使用简体中文。'
    ].join('\n');
    const HIDDEN_AI_REASONING_TAGS = Object.freeze(['think', 'analysis']);
    const CHINESE_STREAM_RELEASE_COUNT = 6;
    const CHINESE_STREAM_GATE_LIMIT = 480;
    let localProviderProxyCapabilityPromise = null;

    function appendChineseOutputGuard(value) {
        const prompt = String(value || '').trim();
        if (prompt.endsWith(COMMUNITY_CHINESE_OUTPUT_GUARD)) return prompt;
        return (prompt ? prompt + '\n\n' : '') + COMMUNITY_CHINESE_OUTPUT_GUARD;
    }

    function getReasoningTagPrefixTailLength(value, prefixes) {
        const source = String(value || '');
        let longest = 0;
        prefixes.forEach(function(prefixValue) {
            const prefix = String(prefixValue || '').toLowerCase();
            const maximum = Math.min(source.length, Math.max(0, prefix.length - 1));
            for (let length = maximum; length > longest; length -= 1) {
                if (source.slice(-length).toLowerCase() === prefix.slice(0, length)) {
                    longest = length;
                    break;
                }
            }
        });
        return longest;
    }

    function createAiReasoningFilter() {
        const state = { pending: '', hiddenTag: '' };
        const openingPrefixes = HIDDEN_AI_REASONING_TAGS.map(function(tag) { return '<' + tag; });

        function push(value) {
            let pending = state.pending + String(value || '');
            state.pending = '';
            let visible = '';

            while (pending) {
                if (state.hiddenTag) {
                    const closePattern = new RegExp('<\\/' + state.hiddenTag + '\\s*>', 'i');
                    const closeMatch = pending.match(closePattern);
                    if (closeMatch) {
                        pending = pending.slice(Number(closeMatch.index || 0) + closeMatch[0].length);
                        state.hiddenTag = '';
                        continue;
                    }
                    const incompleteStart = pending.toLowerCase().lastIndexOf('</' + state.hiddenTag);
                    if (incompleteStart >= 0 && pending.indexOf('>', incompleteStart) < 0) {
                        state.pending = pending.slice(incompleteStart);
                    } else {
                        const retainedLength = getReasoningTagPrefixTailLength(pending, ['</' + state.hiddenTag]);
                        state.pending = retainedLength ? pending.slice(-retainedLength) : '';
                    }
                    return visible;
                }

                const openMatch = pending.match(/<(think|analysis)(?=[\s>])/i);
                if (!openMatch) {
                    const retainedLength = getReasoningTagPrefixTailLength(pending, openingPrefixes);
                    visible += pending.slice(0, pending.length - retainedLength);
                    state.pending = retainedLength ? pending.slice(-retainedLength) : '';
                    return visible.replace(/<\/(?:think|analysis)\s*>/gi, '');
                }
                const openIndex = Number(openMatch.index || 0);
                const openEnd = pending.indexOf('>', openIndex + openMatch[0].length);
                visible += pending.slice(0, openIndex);
                if (openEnd < 0) {
                    state.pending = pending.slice(openIndex);
                    return visible;
                }
                state.hiddenTag = String(openMatch[1] || '').toLowerCase();
                pending = pending.slice(openEnd + 1);
            }
            return visible;
        }

        function finish() {
            if (state.hiddenTag) {
                state.pending = '';
                state.hiddenTag = '';
                return '';
            }
            const tail = state.pending.replace(/<\/?(?:think|analysis)[^>]*>?/gi, '');
            state.pending = '';
            return tail;
        }

        return { push, finish };
    }

    function normalizeChineseOutputSample(value) {
        return String(value || '')
            .replace(/https?:\/\/\S+/gi, ' ')
            .replace(/"[A-Za-z_][A-Za-z0-9_-]*"\s*:/g, ' ')
            .replace(/\b(?:FILE|START|END|JSON|ZHIYU|TRUSTED|UNIT|STORY|COMPLETE)\b/gi, ' ');
    }

    function getChineseOutputStats(value) {
        const sample = normalizeChineseOutputSample(value);
        return {
            hanCount: (sample.match(/[\u3400-\u9fff]/g) || []).length,
            latinLetters: (sample.match(/[A-Za-z]/g) || []).length,
            latinWords: (sample.match(/\b[A-Za-z][A-Za-z'-]{2,}\b/g) || []).length
        };
    }

    function hasEnglishProseRun(value) {
        const sample = normalizeChineseOutputSample(value);
        return sample.split(/[\u3400-\u9fff]+/).some(function(segment) {
            return (segment.match(/\b[A-Za-z][A-Za-z'-]*\b/g) || []).length >= 6;
        });
    }

    function isChineseVisibleOutput(value) {
        const text = String(value || '').trim();
        if (!text) return false;
        if (hasEnglishProseRun(text)) return false;
        const stats = getChineseOutputStats(text);
        if (stats.hanCount >= 2) {
            return stats.latinLetters < 60 || stats.latinLetters <= stats.hanCount * 1.2;
        }
        if (stats.hanCount === 1) return stats.latinLetters <= 12;
        return false;
    }

    function createNonChineseOutputError() {
        const error = new Error('模型返回的可见内容主要不是中文，已停止写入。请重试或更换更适合中文写作的模型。');
        error.code = 'AI_OUTPUT_NOT_CHINESE';
        return error;
    }

    function stripLeadingEnglishReasoning(value) {
        const text = String(value || '');
        const firstHanIndex = text.search(/[\u3400-\u9fff]/);
        if (firstHanIndex <= 0) return text;
        const prefix = text.slice(0, firstHanIndex);
        const englishWords = prefix.match(/\b[A-Za-z][A-Za-z'-]{2,}\b/g) || [];
        if (englishWords.length < 2) return text;
        if (!/(?:the user|we need|i need|i should|let'?s|here is|here you go|of course|certainly|sure\b|analysis|reasoning|requested|detailed outline|novel outline|chapter outline)/i.test(prefix)) {
            return text;
        }
        const structuralTail = prefix.match(/(?:^|\r?\n)([ \t]*[#>*+-]{1,8}[ \t]*)$/)?.[1] || '';
        return structuralTail + text.slice(firstHanIndex).replace(/^(?:[ \t]*\r?\n)+/, '');
    }

    function assertChineseVisibleOutput(value) {
        if (!isChineseVisibleOutput(value)) throw createNonChineseOutputError();
        return String(value || '');
    }

    function createAiVisibleOutputGate(onChunk) {
        const reasoningFilter = createAiReasoningFilter();
        const emit = typeof onChunk === 'function' ? onChunk : function() {};
        let waiting = '';
        let lateWaiting = '';
        let fullContent = '';
        let released = false;

        function acceptVisible(value) {
            const visible = String(value || '');
            if (!visible) return;
            if (released) {
                lateWaiting += visible;
                if (hasEnglishProseRun(lateWaiting)) throw createNonChineseOutputError();
                if (/[\u3400-\u9fff]/.test(visible)) {
                    const ready = lateWaiting;
                    lateWaiting = '';
                    fullContent += ready;
                    emit(ready);
                }
                return;
            }
            waiting += visible;
            waiting = stripLeadingEnglishReasoning(waiting);
            const stats = getChineseOutputStats(waiting);
            const englishDominant = stats.latinWords >= 12
                && stats.latinLetters > stats.hanCount * 1.2;
            if (stats.hanCount >= CHINESE_STREAM_RELEASE_COUNT && !englishDominant) {
                released = true;
                const ready = waiting;
                waiting = '';
                fullContent = ready;
                emit(ready);
                return;
            }
            if (waiting.length >= CHINESE_STREAM_GATE_LIMIT && englishDominant) {
                throw createNonChineseOutputError();
            }
        }

        function push(value) {
            acceptVisible(reasoningFilter.push(value));
        }

        function finish() {
            acceptVisible(reasoningFilter.finish());
            if (released) {
                const finalContent = fullContent + lateWaiting;
                assertChineseVisibleOutput(finalContent);
                if (lateWaiting) emit(lateWaiting);
                lateWaiting = '';
                fullContent = finalContent;
                return fullContent;
            }
            if (!released) {
                waiting = stripLeadingEnglishReasoning(waiting);
                fullContent = waiting;
            }
            assertChineseVisibleOutput(fullContent);
            if (!released && waiting) {
                const ready = waiting;
                waiting = '';
                released = true;
                emit(ready);
            }
            return fullContent;
        }

        return { push, finish };
    }

    function assertOperationTutorialTransportDisabled() {
        const tutorialActive = window.ZHIYU_OPERATION_TUTORIAL?.isActive?.() === true
            || (typeof document !== 'undefined' && document.body?.classList.contains('zhiyu-outline-tutorial-active'));
        if (!tutorialActive) return;
        const error = new Error('操作引导教程使用预置内容，已阻止真实 AI 请求。');
        error.code = 'TUTORIAL_AI_DISABLED';
        throw error;
    }

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

    function isLoopbackAppLocation() {
        const hostname = String(window.location?.hostname || '').toLowerCase();
        return window.location?.protocol === 'http:'
            && (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1');
    }

    function readRequestHeaders(input) {
        const output = {};
        if (!input) return output;
        if (typeof input.forEach === 'function') {
            input.forEach(function(value, name) { output[String(name)] = String(value); });
            return output;
        }
        Object.entries(input).forEach(function(entry) {
            output[String(entry[0])] = String(entry[1] ?? '');
        });
        return output;
    }

    function loadLocalProviderProxyCapability() {
        if (!isLoopbackAppLocation()) return Promise.resolve(null);
        if (localProviderProxyCapabilityPromise) return localProviderProxyCapabilityPromise;
        localProviderProxyCapabilityPromise = Promise.resolve().then(async function() {
            const controller = new AbortController();
            const timer = setTimeout(function() { controller.abort(); }, 2000);
            try {
                const response = await fetch(LOCAL_PROVIDER_PROXY_CAPABILITY_PATH, {
                    method: 'GET',
                    signal: controller.signal,
                    cache: 'no-store',
                    credentials: 'same-origin',
                    referrerPolicy: 'no-referrer'
                });
                if (!response?.ok) return null;
                const payload = await response.json().catch(function() { return null; });
                const token = String(payload?.token || '');
                if (payload?.enabled !== true || payload?.version !== 1 || !token) return null;
                return Object.freeze({ token });
            } catch (_error) {
                return null;
            } finally {
                clearTimeout(timer);
            }
        });
        return localProviderProxyCapabilityPromise;
    }

    async function fetchProviderResponse(targetUrl, init) {
        const requestInit = init && typeof init === 'object' ? init : {};
        const capability = await loadLocalProviderProxyCapability();
        if (!capability) return fetch(targetUrl, requestInit);
        const envelope = {
            targetUrl: String(targetUrl || ''),
            method: String(requestInit.method || 'GET').toUpperCase(),
            headers: readRequestHeaders(requestInit.headers),
            body: requestInit.body === undefined || requestInit.body === null ? '' : String(requestInit.body)
        };
        const sendThroughProxy = function(activeCapability) {
            return fetch(LOCAL_PROVIDER_PROXY_REQUEST_PATH, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Omniisle-Local-Token': activeCapability.token
                },
                body: JSON.stringify(envelope),
                signal: requestInit.signal,
                credentials: 'same-origin',
                cache: 'no-store',
                redirect: 'error',
                referrerPolicy: 'no-referrer'
            });
        };
        let response = await sendThroughProxy(capability);
        if (response?.status === 403
            && response.headers?.get?.('x-omniisle-local-proxy-error') === 'invalid-token') {
            localProviderProxyCapabilityPromise = null;
            const refreshed = await loadLocalProviderProxyCapability();
            if (refreshed) response = await sendThroughProxy(refreshed);
        }
        return response;
    }

    async function runModelRequestWithTimeout(externalSignal, executor, timeoutMs) {
        assertOperationTutorialTransportDisabled();
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

    function redactActiveModelKey(value, activeKey) {
        const text = String(value || '');
        const secret = String(activeKey || '');
        return secret ? text.split(secret).join('[模型密钥已隐藏]') : text;
    }

    function createModelDiscoveryError(message, code, metadata) {
        const error = new Error(String(message || '模型列表检索失败'));
        error.code = String(code || 'MODEL_DISCOVERY_FAILED');
        const details = metadata && typeof metadata === 'object' ? metadata : {};
        if (details.status) error.status = Number(details.status);
        return error;
    }

    function hasSensitiveModelUrlQuery(url) {
        for (const name of url?.searchParams?.keys?.() || []) {
            const compactName = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (/^(?:key|apikey|token|accesstoken|auth|authorization|secret|password)$/.test(compactName)
                || /(?:apikey|token|secret|password)$/.test(compactName)) return true;
        }
        return false;
    }

    function buildModelDiscoveryUrl(base) {
        const rawBase = String(base || '').trim();
        if (!rawBase) {
            throw createModelDiscoveryError('请先填写模型服务地址', 'MODEL_DISCOVERY_BASE_REQUIRED');
        }
        let url;
        try {
            url = new URL(rawBase);
        } catch (_error) {
            throw createModelDiscoveryError('模型服务地址格式不正确', 'MODEL_DISCOVERY_BASE_INVALID');
        }
        if (url.username || url.password) {
            throw createModelDiscoveryError('模型服务地址不能包含用户名或密码', 'MODEL_DISCOVERY_URL_CREDENTIALS');
        }
        if (url.hash) {
            throw createModelDiscoveryError('模型服务地址不能包含 # 锚点', 'MODEL_DISCOVERY_URL_HASH');
        }
        if (hasSensitiveModelUrlQuery(url)) {
            throw createModelDiscoveryError(
                'API Key 或访问令牌不能放在模型服务网址中，请填写到 API Key 输入框',
                'MODEL_DISCOVERY_SECRET_IN_URL'
            );
        }
        let pathname = String(url.pathname || '/').replace(/\/+$/, '');
        while (/\/(?:chat\/completions|messages)$/i.test(pathname)) {
            pathname = pathname.replace(/\/(?:chat\/completions|messages)$/i, '').replace(/\/+$/, '');
        }
        if (!/\/models$/i.test(pathname)) pathname += '/models';
        url.pathname = pathname || '/models';
        return url.toString();
    }

    function buildModelDiscoveryHeaders(protocol, apiKey) {
        const headers = { Accept: 'application/json' };
        const key = String(apiKey || '').trim();
        if (String(protocol || 'openai').toLowerCase() === 'anthropic') {
            if (key) headers['x-api-key'] = key;
            headers['anthropic-version'] = '2023-06-01';
            headers['anthropic-dangerous-direct-browser-access'] = 'true';
        } else if (key) {
            headers.Authorization = 'Bearer ' + key;
        }
        return headers;
    }

    function getModelDiscoveryItems(payload) {
        if (Array.isArray(payload)) return payload;
        if (Array.isArray(payload?.data)) return payload.data;
        if (Array.isArray(payload?.models)) return payload.models;
        if (Array.isArray(payload?.result?.data)) return payload.result.data;
        if (Array.isArray(payload?.result?.models)) return payload.result.models;
        return [];
    }

    function normalizeDiscoveredModels(payload) {
        const models = [];
        const seen = new Set();
        for (const item of getModelDiscoveryItems(payload)) {
            const rawId = typeof item === 'string'
                ? item
                : item?.id ?? item?.modelId ?? item?.model ?? item?.name;
            const modelId = String(rawId || '').trim();
            if (!modelId
                || modelId.length > MAX_DISCOVERED_MODEL_ID_LENGTH
                || /[\u0000-\u001f\u007f]/.test(modelId)
                || seen.has(modelId)) continue;
            seen.add(modelId);
            models.push(modelId);
            if (models.length >= MAX_DISCOVERED_MODEL_COUNT) break;
        }
        return models;
    }

    function isOpenCodeZenTarget(url, config) {
        if (String(config?.provider || '').trim() === 'opencode') return true;
        try {
            const parsed = url instanceof URL ? url : new URL(String(url || ''));
            return parsed.hostname.toLowerCase() === 'opencode.ai' && /^\/zen(?:\/|$)/i.test(parsed.pathname);
        } catch (_error) {
            return false;
        }
    }

    function filterModelsForProvider(models, url, config) {
        if (!isOpenCodeZenTarget(url, config)) return models;
        // OpenCode Zen 的 GPT/Claude/Gemini 等模型使用 responses/messages/Google 接口；
        // 社区版正文通道当前只展示官方标为 chat/completions 的模型族。
        return models.filter(function(modelId) {
            return /^(?:deepseek-|minimax-|glm-|kimi-|mimo-|hy3-|nemotron-)/i.test(modelId)
                || /^(?:big-pickle|x-preview-f-free)$/i.test(modelId);
        });
    }

    function createModelDiscoveryHttpError(response) {
        const status = Number(response?.status || 0);
        let message = '模型服务拒绝了列表检索请求';
        if (status === 401 || status === 403) message = '模型服务拒绝访问，请检查 API Key 是否正确、是否有读取模型列表的权限';
        else if (status === 404) message = '这个服务地址没有提供模型列表接口';
        else if (status === 429) message = '模型服务请求过于频繁，请稍后再试';
        if (status) message += '（HTTP ' + status + '）';
        return createModelDiscoveryError(message, 'MODEL_DISCOVERY_HTTP', { status });
    }

    async function readModelDiscoveryResponse(response, signal) {
        const contentLength = Number(response?.headers?.get?.('content-length') || 0);
        if (contentLength > MAX_MODEL_DISCOVERY_RESPONSE_BYTES) {
            throw createModelDiscoveryError('模型列表过大，已停止读取', 'MODEL_DISCOVERY_RESPONSE_TOO_LARGE');
        }
        const reader = response?.body?.getReader?.();
        if (!reader) {
            const fallbackText = await waitForStep(response.text(), signal);
            if (new TextEncoder().encode(String(fallbackText || '')).byteLength > MAX_MODEL_DISCOVERY_RESPONSE_BYTES) {
                throw createModelDiscoveryError('模型列表过大，已停止读取', 'MODEL_DISCOVERY_RESPONSE_TOO_LARGE');
            }
            return String(fallbackText || '');
        }

        const decoder = new TextDecoder();
        let totalBytes = 0;
        let output = '';
        try {
            while (true) {
                const chunk = await waitForStep(reader.read(), signal);
                if (chunk?.done) break;
                const bytes = chunk?.value instanceof Uint8Array
                    ? chunk.value
                    : new Uint8Array(chunk?.value || []);
                totalBytes += bytes.byteLength;
                if (totalBytes > MAX_MODEL_DISCOVERY_RESPONSE_BYTES) {
                    try { await reader.cancel(); } catch (_error) {}
                    throw createModelDiscoveryError('模型列表过大，已停止读取', 'MODEL_DISCOVERY_RESPONSE_TOO_LARGE');
                }
                output += decoder.decode(bytes, { stream: true });
            }
            output += decoder.decode();
            return output;
        } finally {
            try { reader.releaseLock?.(); } catch (_error) {}
        }
    }

    async function discoverAvailableModels(config, requestOptions) {
        const modelConfig = config && typeof config === 'object' ? config : {};
        const options = requestOptions && typeof requestOptions === 'object' ? requestOptions : {};
        const url = buildModelDiscoveryUrl(modelConfig.base);
        const requestControl = beginRequestControl(
            options.signal,
            options.timeoutMs,
            DEFAULT_MODEL_DISCOVERY_TIMEOUT_MS
        );
        try {
            window.ZHIYU_COMMUNITY_RUNTIME?.network?.assertProviderRequest?.(url);
            const response = await waitForStep(fetchProviderResponse(url, {
                method: 'GET',
                headers: buildModelDiscoveryHeaders(modelConfig.protocol, modelConfig.key),
                signal: requestControl.signal,
                credentials: 'omit',
                cache: 'no-store',
                redirect: 'error',
                referrerPolicy: 'no-referrer'
            }), requestControl.signal);
            if (!response?.ok) throw createModelDiscoveryHttpError(response);

            const rawBody = await readModelDiscoveryResponse(response, requestControl.signal);

            let payload;
            try {
                payload = JSON.parse(String(rawBody || ''));
            } catch (_error) {
                throw createModelDiscoveryError('模型服务返回的列表格式无法识别', 'MODEL_DISCOVERY_INVALID_JSON');
            }
            const models = filterModelsForProvider(normalizeDiscoveredModels(payload), url, modelConfig);
            if (!models.length) {
                throw createModelDiscoveryError('模型服务没有返回可选择的模型', 'MODEL_DISCOVERY_EMPTY');
            }
            return models;
        } catch (value) {
            if (requestControl.signal.aborted) {
                const aborted = createAbortError(requestControl.signal, '模型列表检索已取消');
                if (aborted.code === 'AI_CLIENT_TIMEOUT') {
                    throw createModelDiscoveryError('检索模型列表超时，请稍后重试', 'MODEL_DISCOVERY_TIMEOUT', { status: 408 });
                }
                throw aborted;
            }
            if (value?.code) throw value;
            if (value instanceof TypeError) {
                throw createModelDiscoveryError(
                    '浏览器无法读取模型列表，可能是服务商未开放列表接口或未允许浏览器跨域访问',
                    'MODEL_DISCOVERY_NETWORK'
                );
            }
            throw createModelDiscoveryError('模型列表检索失败，请检查服务地址后重试', 'MODEL_DISCOVERY_FAILED');
        } finally {
            requestControl.release();
        }
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

    function buildModelRequestUrl(base, endpointPath) {
        let url;
        try {
            url = new URL(String(base || '').trim());
        } catch (_error) {
            throw normalizeTransportError(new Error('模型服务地址格式不正确'), '模型服务地址格式不正确');
        }
        if (hasSensitiveModelUrlQuery(url)) {
            const error = new Error('API Key 或访问令牌不能放在模型服务网址中，请在模型设置里使用 API Key 输入框');
            error.code = 'MODEL_SECRET_IN_URL';
            throw error;
        }
        let pathname = String(url.pathname || '/').replace(/\/+$/, '');
        while (/\/(?:chat\/completions|messages|models)$/i.test(pathname)) {
            pathname = pathname.replace(/\/(?:chat\/completions|messages|models)$/i, '').replace(/\/+$/, '');
        }
        url.pathname = pathname + String(endpointPath || '');
        url.hash = '';
        return url.toString();
    }

    function makeRequest(model, systemPrompt, userMessage) {
        const protocol = String(model.protocol || 'openai').toLowerCase();
        if (protocol === 'anthropic') {
            return {
                protocol,
                url: buildModelRequestUrl(model.base, '/messages'),
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
            url: buildModelRequestUrl(model.base, '/chat/completions'),
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
        assertOperationTutorialTransportDisabled();
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
        const request = makeRequest(
            model,
            appendChineseOutputGuard(systemPrompt),
            appendChineseOutputGuard(userMessage)
        );
        const requestControl = beginRequestControl(
            [signal, options.signal],
            options.timeoutMs ?? model.timeoutMs,
            DEFAULT_AI_STREAM_TIMEOUT_MS
        );
        const identityTask = beginLocalIdentityTask(requestControl.signal);

        try {
            assertIdentityCurrent(identityTask);
            window.ZHIYU_COMMUNITY_RUNTIME?.network?.assertProviderRequest?.(request.url);
            const response = await waitForStep(fetchProviderResponse(request.url, {
                method: 'POST',
                headers: request.headers,
                body: JSON.stringify(request.body),
                signal: identityTask.signal
            }), identityTask.signal);
            assertIdentityCurrent(identityTask);
            if (!response.ok) {
                const rawBody = redactActiveModelKey(
                    await response.text().catch(function() { return ''; }),
                    model.key
                );
                let message = `自备模型请求失败（${response.status}）`;
                if (response.status === 401) message = '自备模型 API Key 无效，请检查设置。';
                else if (response.status === 403) message = '自备模型拒绝访问，请检查 API Key 和模型权限。';
                else if (response.status === 429) message = '自备模型请求过于频繁或账户额度受限，请稍后重试。';
                else if (response.status >= 500) message = '自备模型服务暂时不可用，请稍后重试。';
                throw createHttpError(response, rawBody, message);
            }

            let fullContent = '';
            let completed = false;
            const visibleOutput = createAiVisibleOutputGate(safeOnChunk);
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
                        streamError.rawBody = redactActiveModelKey(raw, model.key);
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
                        visibleOutput.push(content);
                    }
                }
            }), identityTask.signal);
            if (!completed) {
                const error = new Error('自备模型连接提前结束，未收到完成标志。');
                error.code = 'AI_STREAM_INCOMPLETE';
                throw error;
            }
            fullContent = visibleOutput.finish();
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
        assertOperationTutorialTransportDisabled();
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
        assertOperationTutorialTransportDisabled();
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
        runModelRequestWithTimeout,
        discoverAvailableModels,
        fetchProviderResponse,
        redactActiveModelKey,
        buildModelDiscoveryUrl,
        buildModelRequestUrl,
        normalizeDiscoveredModels,
        appendChineseOutputGuard,
        createAiReasoningFilter,
        getChineseOutputStats,
        hasEnglishProseRun,
        isChineseVisibleOutput,
        assertChineseVisibleOutput,
        createAiVisibleOutputGate
    };
    window.streamGenerate = streamGenerate;
    window.streamCustomTemplateGenerate = streamCustomTemplateGenerate;
    window.callLLMAPI = callLLMAPI;
    window.runModelRequestWithTimeout = runModelRequestWithTimeout;
    window.runOfficialAiRequestWithTimeout = runModelRequestWithTimeout;
    window.discoverAvailableModels = discoverAvailableModels;
    window.BACKEND_URL = '';
    window.STREAM_URL = '';
})(window);
