import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { Readable } from 'node:stream';

export const PROVIDER_PROXY_CAPABILITY_PATH = '/__omniisle/provider-proxy/capabilities';
export const PROVIDER_PROXY_REQUEST_PATH = '/__omniisle/provider-proxy/request';
const MAX_PROXY_REQUEST_BYTES = 4 * 1024 * 1024;
const MAX_TARGET_URL_LENGTH = 4096;
const ALLOWED_UPSTREAM_HEADERS = new Set([
    'accept',
    'authorization',
    'content-type',
    'x-api-key',
    'anthropic-version',
    'anthropic-dangerous-direct-browser-access'
]);
const PROVIDER_DNS_TIMEOUT_MS = 5000;

function sendJson(res, status, payload, extraHeaders) {
    if (res.destroyed || res.writableEnded) return;
    const body = JSON.stringify(payload);
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body),
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        ...extraHeaders
    });
    res.end(body);
}

function isLoopbackHostname(hostname) {
    const value = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    return value === 'localhost' || value === '127.0.0.1' || value === '::1';
}

function isLoopbackRemoteAddress(address) {
    const value = String(address || '').toLowerCase();
    return value === '127.0.0.1' || value === '::1' || value === '::ffff:127.0.0.1';
}

function isPrivateOrReservedIp(hostname) {
    const value = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    const version = net.isIP(value);
    if (version === 4) {
        const parts = value.split('.').map(Number);
        const [a, b] = parts;
        return a === 0
            || a === 10
            || a === 127
            || (a === 100 && b >= 64 && b <= 127)
            || (a === 169 && b === 254)
            || (a === 172 && b >= 16 && b <= 31)
            || (a === 192 && (b === 0 || b === 168))
            || (a === 198 && (b === 18 || b === 19))
            || a >= 224;
    }
    if (version === 6) {
        const firstGroup = Number.parseInt(value.split(':', 1)[0], 16);
        return !Number.isFinite(firstGroup)
            || firstGroup < 0x2000
            || firstGroup > 0x3fff
            || value === '2001:db8::'
            || value.startsWith('2001:db8:')
            || value.startsWith('2002:');
    }
    return false;
}

function hasSensitiveQuery(url) {
    for (const name of url.searchParams.keys()) {
        const compact = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (/^(?:key|apikey|token|accesstoken|auth|authorization|secret|password)$/.test(compact)
            || /(?:apikey|token|secret|password)$/.test(compact)) return true;
    }
    return false;
}

export function validateProviderTarget(rawTarget) {
    const value = String(rawTarget || '').trim();
    if (!value || value.length > MAX_TARGET_URL_LENGTH) throw new Error('模型服务地址无效');
    let target;
    try { target = new URL(value); } catch (_error) { throw new Error('模型服务地址格式不正确'); }
    if (target.username || target.password) throw new Error('模型服务地址不能包含用户名或密码');
    if (target.hash) throw new Error('模型服务地址不能包含 # 锚点');
    if (hasSensitiveQuery(target)) throw new Error('API Key 不能放在模型服务网址中');
    const hostname = target.hostname.toLowerCase();
    const loopback = isLoopbackHostname(hostname);
    if (target.protocol !== 'https:' && !(target.protocol === 'http:' && loopback)) {
        throw new Error('模型服务必须使用 HTTPS；本机模型可使用 localhost HTTP');
    }
    if (!loopback && isPrivateOrReservedIp(hostname)) throw new Error('模型服务地址不能指向私有或保留网络');
    if (hostname === 'omniisle.com' || hostname.endsWith('.omniisle.com')) {
        throw new Error('社区版不能连接知屿正式服务');
    }
    if (hostname.endsWith('.tcloudbase.com') || hostname.endsWith('.tcloudbaseapp.com')) {
        throw new Error('社区版不能连接知屿云端服务');
    }
    return target;
}

function createProxyError(message, status) {
    const error = new Error(message);
    error.status = status;
    return error;
}

async function resolveProviderTargetAddresses(targetInput, lookupImpl = dns.lookup) {
    const target = targetInput instanceof URL ? targetInput : validateProviderTarget(targetInput);
    const hostname = target.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (hostname === 'localhost') {
        return [
            { address: '127.0.0.1', family: 4 },
            { address: '::1', family: 6 }
        ];
    }
    if (isLoopbackHostname(hostname) || net.isIP(hostname)) {
        const address = hostname;
        return [{ address, family: net.isIP(address) || 4 }];
    }
    let timer;
    let resolved;
    try {
        resolved = await Promise.race([
            Promise.resolve().then(function() {
                return lookupImpl(hostname, { all: true, verbatim: true });
            }),
            new Promise(function(_resolve, reject) {
                timer = setTimeout(function() {
                    reject(createProxyError('模型服务域名解析超时', 502));
                }, PROVIDER_DNS_TIMEOUT_MS);
                timer.unref?.();
            })
        ]);
    } catch (error) {
        if (error?.status) throw error;
        throw createProxyError('模型服务域名无法解析', 502);
    } finally {
        clearTimeout(timer);
    }
    const addresses = (Array.isArray(resolved) ? resolved : [resolved]).map(function(entry) {
        return { address: String(entry?.address || ''), family: Number(entry?.family || net.isIP(entry?.address) || 0) };
    });
    if (!addresses.length || addresses.some(function(entry) {
        return !entry?.address || isPrivateOrReservedIp(entry.address);
    })) {
        throw createProxyError('模型服务域名解析到了私有或保留网络', 400);
    }
    return addresses;
}

export async function validateProviderTargetResolution(targetInput, lookupImpl = dns.lookup) {
    const target = targetInput instanceof URL ? targetInput : validateProviderTarget(targetInput);
    await resolveProviderTargetAddresses(target, lookupImpl);
    return target;
}

function isSameLocalOrigin(req) {
    const origin = String(req.headers.origin || '');
    const host = String(req.headers.host || '');
    if (!origin || !host) return false;
    try {
        const originUrl = new URL(origin);
        const hostUrl = new URL('http://' + host);
        return originUrl.protocol === 'http:'
            && isLoopbackHostname(originUrl.hostname)
            && isLoopbackHostname(hostUrl.hostname)
            && originUrl.port === hostUrl.port;
    } catch (_error) {
        return false;
    }
}

async function readJsonBody(req) {
    const declaredLength = Number(req.headers['content-length'] || 0);
    if (declaredLength > MAX_PROXY_REQUEST_BYTES) {
        const error = new Error('本机转发请求过大');
        error.status = 413;
        throw error;
    }
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buffer.length;
        if (total > MAX_PROXY_REQUEST_BYTES) {
            const error = new Error('本机转发请求过大');
            error.status = 413;
            throw error;
        }
        chunks.push(buffer);
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    } catch (_error) {
        const error = new Error('本机转发请求格式不正确');
        error.status = 400;
        throw error;
    }
}

function normalizeUpstreamHeaders(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    const headers = {};
    const entries = Object.entries(input);
    if (entries.length > 16) throw new Error('模型请求头数量过多');
    for (const [rawName, rawValue] of entries) {
        const name = String(rawName || '').trim().toLowerCase();
        if (!ALLOWED_UPSTREAM_HEADERS.has(name)) throw new Error('模型请求包含不允许的请求头');
        const value = String(rawValue ?? '');
        if (value.length > 16384 || /[\r\n]/.test(value)) throw new Error('模型请求头格式不正确');
        headers[name] = value;
    }
    return headers;
}

function normalizeProxyEnvelope(payload) {
    const method = String(payload?.method || 'GET').toUpperCase();
    if (!['GET', 'POST'].includes(method)) throw new Error('本机转发仅允许 GET 和 POST');
    const target = validateProviderTarget(payload?.targetUrl);
    const headers = normalizeUpstreamHeaders(payload?.headers);
    const body = method === 'POST' ? String(payload?.body || '') : undefined;
    if (body && Buffer.byteLength(body) > MAX_PROXY_REQUEST_BYTES) throw new Error('模型请求正文过大');
    return { method, target, headers, body };
}

function waitForWritableDrain(res, signal) {
    if (signal.aborted || res.destroyed || res.writableEnded) {
        return Promise.reject(createProxyError('浏览器已取消接收模型响应', 499));
    }
    return new Promise(function(resolve, reject) {
        let settled = false;
        const finish = function(callback, value) {
            if (settled) return;
            settled = true;
            res.removeListener('drain', onDrain);
            res.removeListener('close', onClose);
            signal.removeEventListener('abort', onAbort);
            callback(value);
        };
        const onDrain = function() { finish(resolve); };
        const onClose = function() { finish(reject, createProxyError('浏览器已关闭模型响应', 499)); };
        const onAbort = function() { finish(reject, createProxyError('浏览器已取消接收模型响应', 499)); };
        res.once('drain', onDrain);
        res.once('close', onClose);
        signal.addEventListener('abort', onAbort, { once: true });
    });
}

export function createPinnedLookup(addresses) {
    const approved = addresses.slice().sort(function(left, right) {
        return (left.family === 4 ? 0 : 1) - (right.family === 4 ? 0 : 1);
    });
    return function(_hostname, options, callback) {
        let lookupOptions = options;
        let done = callback;
        if (typeof lookupOptions === 'function') {
            done = lookupOptions;
            lookupOptions = {};
        }
        const requestedFamily = Number(lookupOptions?.family || 0);
        const candidates = requestedFamily
            ? approved.filter(function(entry) { return entry.family === requestedFamily; })
            : approved;
        const selected = candidates[0] || approved[0];
        if (!selected) {
            done(createProxyError('模型服务没有可用的安全地址', 502));
            return;
        }
        if (lookupOptions?.all === true) {
            done(null, candidates.length ? candidates : approved);
            return;
        }
        done(null, selected.address, selected.family);
    };
}

function requestProviderUpstream(envelope, signal, addresses) {
    const transport = envelope.target.protocol === 'https:' ? https : http;
    return new Promise(function(resolve, reject) {
        const request = transport.request(envelope.target, {
            method: envelope.method,
            headers: envelope.headers,
            signal,
            lookup: createPinnedLookup(addresses),
            autoSelectFamily: addresses.length > 1,
            autoSelectFamilyAttemptTimeout: 250
        }, function(response) {
            resolve({
                status: Number(response.statusCode || 0),
                headers: {
                    get(name) {
                        const value = response.headers[String(name || '').toLowerCase()];
                        return Array.isArray(value) ? value.join(', ') : value == null ? null : String(value);
                    }
                },
                body: Readable.toWeb(response),
                destroy() { response.destroy(); }
            });
        });
        request.once('error', reject);
        request.end(envelope.body);
    });
}

export function createCommunityProviderProxy(options) {
    const lookupImpl = options?.lookupImpl || dns.lookup;
    const sessionToken = options?.sessionToken || crypto.randomBytes(32).toString('base64url');

    async function forward(req, res, envelope) {
        const controller = new AbortController();
        const abortUpstream = function() {
            if (!res.writableEnded && !controller.signal.aborted) controller.abort();
        };
        req.once('aborted', abortUpstream);
        res.once('close', abortUpstream);
        try {
            const approvedAddresses = await resolveProviderTargetAddresses(envelope.target, lookupImpl);
            const upstream = await requestProviderUpstream(envelope, controller.signal, approvedAddresses);
            if (upstream.status >= 300 && upstream.status < 400) {
                try { await upstream.body?.cancel?.(); } catch (_error) {}
                try { upstream.destroy?.(); } catch (_error) {}
                if (!controller.signal.aborted) controller.abort();
                sendJson(res, 502, { error: { message: '模型服务返回了重定向，本机转发已为保护 API Key 拒绝继续' } });
                return;
            }
            const responseHeaders = {
                'content-type': upstream.headers.get('content-type') || 'application/octet-stream',
                'cache-control': 'no-store',
                'x-content-type-options': 'nosniff',
                'x-omniisle-provider-proxy': '1'
            };
            res.writeHead(upstream.status, responseHeaders);
            if (!upstream.body) {
                res.end();
                return;
            }
            const reader = upstream.body.getReader();
            try {
                while (true) {
                    const chunk = await reader.read();
                    if (chunk.done) break;
                    if (!res.write(Buffer.from(chunk.value))) await waitForWritableDrain(res, controller.signal);
                }
                res.end();
            } finally {
                try { reader.releaseLock(); } catch (_error) {}
            }
        } catch (error) {
            if (controller.signal.aborted || res.destroyed) return;
            if (!res.headersSent) {
                const status = Number(error?.status || 502);
                const message = status === 400
                    ? String(error?.message || '本机转发拒绝了不安全的模型地址')
                    : '本机转发无法连接模型服务，请检查地址和网络';
                sendJson(res, status, { error: { message } });
            } else {
                res.destroy();
            }
        } finally {
            req.removeListener('aborted', abortUpstream);
            res.removeListener('close', abortUpstream);
        }
    }

    return Object.freeze({
        sessionToken,
        async handle(req, res, requestUrl) {
            const pathname = requestUrl.pathname;
            if (pathname === PROVIDER_PROXY_CAPABILITY_PATH) {
                if (!isLoopbackRemoteAddress(req.socket.remoteAddress)) {
                    sendJson(res, 403, { error: { message: '本机转发只允许当前电脑访问' } });
                    return true;
                }
                if (!['GET', 'HEAD'].includes(String(req.method || '').toUpperCase())) {
                    sendJson(res, 405, { error: { message: 'Method not allowed' } }, { allow: 'GET, HEAD' });
                    return true;
                }
                sendJson(res, 200, { enabled: true, version: 1, token: sessionToken });
                return true;
            }
            if (pathname !== PROVIDER_PROXY_REQUEST_PATH) return false;
            if (String(req.method || '').toUpperCase() !== 'POST') {
                sendJson(res, 405, { error: { message: 'Method not allowed' } }, { allow: 'POST' });
                return true;
            }
            if (!isLoopbackRemoteAddress(req.socket.remoteAddress) || !isSameLocalOrigin(req)) {
                sendJson(res, 403, { error: { message: '本机转发拒绝了非本页面请求' } });
                return true;
            }
            if (String(req.headers['x-omniisle-local-token'] || '') !== sessionToken) {
                sendJson(
                    res,
                    403,
                    { error: { message: '本机转发会话已失效，请刷新页面' } },
                    { 'x-omniisle-local-proxy-error': 'invalid-token' }
                );
                return true;
            }
            if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
                sendJson(res, 415, { error: { message: '本机转发仅接受 JSON 请求' } });
                return true;
            }
            try {
                const payload = await readJsonBody(req);
                const envelope = normalizeProxyEnvelope(payload);
                await forward(req, res, envelope);
            } catch (error) {
                sendJson(res, Number(error?.status || 400), { error: { message: String(error?.message || '本机转发请求无效') } });
            }
            return true;
        }
    });
}
