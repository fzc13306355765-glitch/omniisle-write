(function(window) {
    'use strict';

    const MODE = 'community';
    const WORKSPACE_ID_KEY = 'zhiyu_community_workspace_id_v1';
    const SESSION_WORKSPACE_ID_KEY = 'zhiyu_community_session_workspace_id_v1';
    const AUTHOR_NAME_KEY = 'zhiyu_community_author_name_v1';
    const PROVIDER_ORIGINS_KEY = 'zhiyu_community_provider_origins_v1';
    const nativeFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
    const NativeXMLHttpRequest = window.XMLHttpRequest;
    const NativeEventSource = window.EventSource;
    const NativeWebSocket = window.WebSocket;
    let runtimeWorkspaceId = '';
    let identityPersistence = 'memory';

    function readStorageValue(storage, key) {
        try {
            return String(storage?.getItem?.(key) || '').trim();
        } catch (error) {
            return '';
        }
    }

    function writeStorageValue(storage, key, value) {
        try {
            storage?.setItem?.(key, value);
            return readStorageValue(storage, key) === value;
        } catch (error) {
            return false;
        }
    }

    function readJsonArray(key) {
        try {
            const parsed = JSON.parse(window.localStorage.getItem(key) || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            return [];
        }
    }

    function writeJsonArray(key, value) {
        try {
            window.localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            return false;
        }
    }

    function createWorkspaceId() {
        if (typeof window.crypto?.randomUUID === 'function') {
            return 'local_' + window.crypto.randomUUID();
        }
        return 'local_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12);
    }

    function getLocalIdentity() {
        let uid = runtimeWorkspaceId;
        let displayName = '';
        if (!uid) {
            uid = readStorageValue(window.localStorage, WORKSPACE_ID_KEY);
            if (uid) identityPersistence = 'local';
        }
        if (!uid) {
            uid = readStorageValue(window.sessionStorage, SESSION_WORKSPACE_ID_KEY);
            if (uid) identityPersistence = 'session';
        }
        if (!uid) {
            uid = createWorkspaceId();
            runtimeWorkspaceId = uid;
            if (writeStorageValue(window.localStorage, WORKSPACE_ID_KEY, uid)) {
                identityPersistence = 'local';
            } else if (writeStorageValue(window.sessionStorage, SESSION_WORKSPACE_ID_KEY, uid)) {
                identityPersistence = 'session';
            } else {
                identityPersistence = 'memory';
            }
        }
        displayName = readStorageValue(window.localStorage, AUTHOR_NAME_KEY)
            || readStorageValue(window.sessionStorage, AUTHOR_NAME_KEY);
        runtimeWorkspaceId = uid;
        return Object.freeze({
            uid,
            username: 'local-author',
            displayName: displayName || '本地作者',
            persistence: identityPersistence,
            temporary: identityPersistence === 'memory'
        });
    }

    function getRequestUrl(input) {
        const raw = typeof input === 'string'
            ? input
            : (input && typeof input.url === 'string' ? input.url : '');
        if (!raw) throw new TypeError('社区版无法识别本次网络请求地址');
        return new URL(raw, window.location.href);
    }

    function isSafeProviderUrl(url) {
        if (!url || url.username || url.password) return false;
        const hostname = String(url.hostname || '').toLowerCase();
        const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
        if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalhost)) return false;
        if (hostname === 'omniisle.com' || hostname.endsWith('.omniisle.com')) return false;
        if (hostname.endsWith('.tcloudbase.com') || hostname.endsWith('.tcloudbaseapp.com')) return false;
        return true;
    }

    function getAllowedProviderOrigins() {
        return new Set(readJsonArray(PROVIDER_ORIGINS_KEY).map(function(origin) {
            return String(origin || '').trim();
        }).filter(Boolean));
    }

    function isProviderOriginAllowed(input) {
        try {
            const url = input instanceof URL ? input : getRequestUrl(input);
            return isSafeProviderUrl(url) && getAllowedProviderOrigins().has(url.origin);
        } catch (error) {
            return false;
        }
    }

    function allowProviderOrigin(input) {
        const url = input instanceof URL ? input : getRequestUrl(input);
        if (!isSafeProviderUrl(url)) throw new Error('模型地址必须使用 HTTPS；本机模型可使用 localhost HTTP');
        const origins = getAllowedProviderOrigins();
        origins.add(url.origin);
        if (!writeJsonArray(PROVIDER_ORIGINS_KEY, Array.from(origins).sort())) {
            throw new Error('浏览器未能保存模型联网许可');
        }
        return url.origin;
    }

    function requestProviderApproval(input) {
        const url = input instanceof URL ? input : getRequestUrl(input);
        if (!isSafeProviderUrl(url)) throw new Error('模型地址必须使用 HTTPS；本机模型可使用 localhost HTTP');
        if (isProviderOriginAllowed(url)) return true;
        if (typeof window.confirm !== 'function') return false;
        const approved = window.confirm(
            '社区版默认不联网。\n\n仅允许把本次 AI 请求发送到：\n' + url.origin
            + '\n\nAPI Key 和写作内容也会发送到这个地址。确认允许吗？'
        );
        if (!approved) return false;
        allowProviderOrigin(url);
        return true;
    }

    function isSafeLocalStaticRequest(url, method) {
        if (url.origin !== window.location.origin) return false;
        if (!['GET', 'HEAD'].includes(method)) return false;
        const pathname = url.pathname;
        if (pathname === '/' || pathname === '/index.html') return true;
        if (/^\/(?:scripts|styles|assets)\//.test(pathname)) return true;
        return /^\/(?:LOGO(?:-256)?\.png|UI背景(?:-optimized)?\.jpg|app-version\.json)$/.test(pathname);
    }

    function isSafeLocalProviderProxyRequest(url, method) {
        if (url.origin !== window.location.origin) return false;
        if (url.pathname === '/__omniisle/provider-proxy/capabilities') {
            return method === 'GET' || method === 'HEAD';
        }
        return url.pathname === '/__omniisle/provider-proxy/request' && method === 'POST';
    }

    function createBlockedRequestError(url) {
        const error = new Error('社区版已阻止未授权网络请求：' + url.origin);
        error.name = 'CommunityNetworkBlockedError';
        error.code = 'COMMUNITY_NETWORK_BLOCKED';
        error.origin = url.origin;
        return error;
    }

    function guardedFetch(input, init) {
        if (!nativeFetch) return Promise.reject(new Error('当前浏览器不支持网络请求'));
        let url;
        try {
            url = getRequestUrl(input);
        } catch (error) {
            return Promise.reject(error);
        }
        const method = String(init?.method || input?.method || 'GET').toUpperCase();
        if (url.protocol === 'data:' || url.protocol === 'blob:') return nativeFetch(input, init);
        if (isSafeLocalStaticRequest(url, method)
            || isSafeLocalProviderProxyRequest(url, method)
            || isProviderOriginAllowed(url)) {
            return nativeFetch(input, init);
        }
        return Promise.reject(createBlockedRequestError(url));
    }

    function installConstructorGuard(name, NativeConstructor, allowRequest) {
        if (typeof NativeConstructor !== 'function') return;
        function GuardedConstructor(input, options) {
            const url = getRequestUrl(input);
            if (!allowRequest(url)) throw createBlockedRequestError(url);
            return new NativeConstructor(input, options);
        }
        GuardedConstructor.prototype = NativeConstructor.prototype;
        Object.setPrototypeOf(GuardedConstructor, NativeConstructor);
        window[name] = GuardedConstructor;
    }

    function installLegacyNetworkGuards() {
        if (typeof NativeXMLHttpRequest === 'function') {
            function CommunityXMLHttpRequest() {
                const request = new NativeXMLHttpRequest();
                const nativeOpen = request.open;
                request.open = function(method, input) {
                    const url = getRequestUrl(input);
                    const normalizedMethod = String(method || 'GET').toUpperCase();
                    if (!isSafeLocalStaticRequest(url, normalizedMethod) && !isProviderOriginAllowed(url)) {
                        throw createBlockedRequestError(url);
                    }
                    return nativeOpen.apply(this, arguments);
                };
                return request;
            }
            CommunityXMLHttpRequest.prototype = NativeXMLHttpRequest.prototype;
            Object.setPrototypeOf(CommunityXMLHttpRequest, NativeXMLHttpRequest);
            window.XMLHttpRequest = CommunityXMLHttpRequest;
        }
        installConstructorGuard('EventSource', NativeEventSource, isProviderOriginAllowed);
        installConstructorGuard('WebSocket', NativeWebSocket, function() { return false; });
        if (window.navigator && typeof window.navigator.sendBeacon === 'function') {
            try {
                Object.defineProperty(window.navigator, 'sendBeacon', {
                    value: function() { return false; },
                    configurable: false,
                    writable: false
                });
            } catch (error) {}
        }
    }

    const network = Object.freeze({
        getAllowedProviderOrigins: function() { return Array.from(getAllowedProviderOrigins()).sort(); },
        isProviderOriginAllowed,
        requestProviderApproval,
        assertProviderRequest: function(input) {
            const url = getRequestUrl(input);
            if (!isProviderOriginAllowed(url)) throw createBlockedRequestError(url);
            return url;
        }
    });

    const runtime = Object.freeze({
        mode: MODE,
        isCommunity: true,
        getLocalIdentity,
        network
    });

    Object.defineProperty(window, 'ZHIYU_COMMUNITY_MODE', {
        value: true,
        configurable: false,
        enumerable: true,
        writable: false
    });
    Object.defineProperty(window, 'ZHIYU_COMMUNITY_RUNTIME', {
        value: runtime,
        configurable: false,
        enumerable: true,
        writable: false
    });
    if (nativeFetch) window.fetch = guardedFetch;
    installLegacyNetworkGuards();
})(window);
