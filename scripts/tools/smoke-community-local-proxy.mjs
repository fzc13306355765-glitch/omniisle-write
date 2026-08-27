import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
    PROVIDER_PROXY_CAPABILITY_PATH,
    PROVIDER_PROXY_REQUEST_PATH,
    createPinnedLookup,
    validateProviderTargetResolution
} from './community-provider-proxy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function listen(server) {
    return new Promise(function(resolve, reject) {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', function() {
            server.removeListener('error', reject);
            resolve(server.address().port);
        });
    });
}

function closeServer(server) {
    return new Promise(function(resolve) { server.close(function() { resolve(); }); });
}

function waitFor(predicate, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    return new Promise(function(resolve, reject) {
        const check = function() {
            if (predicate()) return resolve();
            if (Date.now() >= deadline) return reject(new Error('等待本机转发测试状态超时'));
            setTimeout(check, 20);
        };
        check();
    });
}

const upstreamRequests = [];
let slowResponseClosed = false;
let redirectResponseClosed = false;
const upstream = http.createServer(async function(req, res) {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    upstreamRequests.push({
        url: req.url,
        method: req.method,
        authorization: req.headers.authorization || '',
        anthropicDirectBrowserAccess: req.headers['anthropic-dangerous-direct-browser-access'] || '',
        body: Buffer.concat(chunks).toString('utf8')
    });
    if (req.url === '/redirect') {
        res.writeHead(302, { location: '/should-not-follow' });
        res.flushHeaders();
        res.on('close', function() { redirectResponseClosed = true; });
        return;
    }
    if (req.url === '/slow') {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write('data: {"choices":[{"delta":{"content":"一"}}]}\n\n');
        res.on('close', function() { slowResponseClosed = true; });
        return;
    }
    if (req.url === '/v1/models') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data: [{ id: 'deepseek-test' }, { id: 'gpt-test' }] }));
        return;
    }
    if (req.url === '/v1/chat/completions') {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write('data: {"choices":[{"delta":{"content":"测"}}]}\n\n');
        res.end('data: [DONE]\n\n');
        return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
});

const upstreamPort = await listen(upstream);
const child = spawn(process.execPath, ['scripts/tools/serve-community.mjs'], {
    cwd: root,
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe']
});
let childOutput = '';
child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');
child.stdout.on('data', function(chunk) { childOutput += chunk; });
child.stderr.on('data', function(chunk) { childOutput += chunk; });

try {
    await waitFor(function() { return /http:\/\/127\.0\.0\.1:\d+\//.test(childOutput); }, 5000);
    const localPort = Number(childOutput.match(/http:\/\/127\.0\.0\.1:(\d+)\//)[1]);
    const localOrigin = `http://127.0.0.1:${localPort}`;
    const capabilityResponse = await fetch(localOrigin + PROVIDER_PROXY_CAPABILITY_PATH, { cache: 'no-store' });
    assert.equal(capabilityResponse.status, 200);
    const capability = await capabilityResponse.json();
    assert.equal(capability.enabled, true);
    assert.equal(capability.version, 1);
    assert.ok(String(capability.token || '').length >= 32, '本机转发缺少随机会话令牌');

    async function proxyRequest(payload, overrides) {
        return fetch(localOrigin + PROVIDER_PROXY_REQUEST_PATH, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Origin: localOrigin,
                'X-Omniisle-Local-Token': capability.token,
                ...(overrides?.headers || {})
            },
            body: JSON.stringify(payload),
            signal: overrides?.signal
        });
    }

    const fakeKey = 'proxy-test-secret-value';
    const listResponse = await proxyRequest({
        targetUrl: `http://localhost:${upstreamPort}/v1/models`,
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: `Bearer ${fakeKey}` },
        body: ''
    });
    assert.equal(listResponse.status, 200);
    assert.equal(listResponse.headers.get('x-omniisle-provider-proxy'), '1');
    assert.deepEqual((await listResponse.json()).data.map(function(item) { return item.id; }), ['deepseek-test', 'gpt-test']);
    assert.equal(upstreamRequests[0].authorization, `Bearer ${fakeKey}`);

    const anthropicListResponse = await proxyRequest({
        targetUrl: `http://localhost:${upstreamPort}/v1/models`,
        method: 'GET',
        headers: {
            Accept: 'application/json',
            'x-api-key': 'anthropic-test-key',
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: ''
    });
    assert.equal(anthropicListResponse.status, 200, '本机转发误拦了 Anthropic 模型检索请求头');
    assert.equal(upstreamRequests.at(-1).anthropicDirectBrowserAccess, 'true');

    const streamResponse = await proxyRequest({
        targetUrl: `http://localhost:${upstreamPort}/v1/chat/completions`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${fakeKey}` },
        body: JSON.stringify({ model: 'deepseek-test', stream: true })
    });
    assert.equal(streamResponse.status, 200);
    assert.match(await streamResponse.text(), /data:[\s\S]*测[\s\S]*\[DONE\]/, '本机转发没有保持 SSE 流内容');
    assert.match(upstreamRequests.find(function(item) {
        return item.url === '/v1/chat/completions';
    })?.body || '', /deepseek-test/, '本机转发没有发送模型请求正文');

    const redirectResponse = await proxyRequest({
        targetUrl: `http://localhost:${upstreamPort}/redirect`,
        method: 'GET',
        headers: {},
        body: ''
    });
    assert.equal(redirectResponse.status, 502, '本机转发不应携带 Key 跟随重定向');
    await waitFor(function() { return redirectResponseClosed; }, 2000);
    assert.equal(upstreamRequests.some(function(item) { return item.url === '/should-not-follow'; }), false);

    const secretUrlResponse = await proxyRequest({
        targetUrl: `http://localhost:${upstreamPort}/v1/models?api_key=forbidden`,
        method: 'GET',
        headers: {},
        body: ''
    });
    assert.equal(secretUrlResponse.status, 400, '本机转发仍允许把 Key 放在网址中');

    for (const targetUrl of [
        'http://example.com/v1/models',
        'https://169.254.169.254/latest/meta-data',
        'https://[::ffff:127.0.0.1]/v1/models',
        'https://[::ffff:c0a8:101]/v1/models',
        'https://omniisle.com/api/models',
        'https://example.tcloudbaseapp.com/api/models'
    ]) {
        const blockedTargetResponse = await proxyRequest({
            targetUrl,
            method: 'GET',
            headers: {},
            body: ''
        });
        assert.equal(blockedTargetResponse.status, 400, `本机转发没有拒绝受保护地址：${targetUrl}`);
    }

    await assert.rejects(
        validateProviderTargetResolution('https://provider.example/v1/models', async function() {
            return [{ address: '192.168.1.9', family: 4 }];
        }),
        /私有或保留网络/,
        '本机转发没有拒绝解析到内网地址的域名'
    );
    const pinnedAddress = await new Promise(function(resolve, reject) {
        createPinnedLookup([{ address: '8.8.8.8', family: 4 }])(
            'provider.example',
            { family: 4 },
            function(error, address, family) {
                if (error) reject(error);
                else resolve({ address, family });
            }
        );
    });
    assert.deepEqual(
        pinnedAddress,
        { address: '8.8.8.8', family: 4 },
        '实际连接没有固定使用已检查过的地址'
    );

    const unsafeHeaderResponse = await proxyRequest({
        targetUrl: `http://localhost:${upstreamPort}/v1/models`,
        method: 'GET',
        headers: { Cookie: 'forbidden=1' },
        body: ''
    });
    assert.equal(unsafeHeaderResponse.status, 400, '本机转发仍允许 Cookie 等额外请求头');

    const wrongOriginResponse = await proxyRequest({
        targetUrl: `http://localhost:${upstreamPort}/v1/models`,
        method: 'GET',
        headers: {},
        body: ''
    }, { headers: { Origin: 'https://attacker.example' } });
    assert.equal(wrongOriginResponse.status, 403, '本机转发没有拒绝其他网页来源');

    const missingTokenResponse = await fetch(localOrigin + PROVIDER_PROXY_REQUEST_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: localOrigin },
        body: JSON.stringify({
            targetUrl: `http://localhost:${upstreamPort}/v1/models`,
            method: 'GET',
            headers: {}
        })
    });
    assert.equal(missingTokenResponse.status, 403, '本机转发没有强制会话令牌');

    const abortController = new AbortController();
    const slowResponse = await proxyRequest({
        targetUrl: `http://localhost:${upstreamPort}/slow`,
        method: 'GET',
        headers: {},
        body: ''
    }, { signal: abortController.signal });
    const slowReader = slowResponse.body.getReader();
    await slowReader.read();
    abortController.abort();
    await waitFor(function() { return slowResponseClosed; }, 2000);

    assert.equal(childOutput.includes(fakeKey), false, '本机服务日志泄露了 API Key');
    console.log('[local-provider-proxy] PASS 本机令牌、同源限制、地址校验、SSE、取消和密钥不落日志均已验证');
} finally {
    child.kill();
    await Promise.race([
        new Promise(function(resolve) { child.once('exit', resolve); }),
        new Promise(function(resolve) { setTimeout(resolve, 1000); })
    ]);
    await closeServer(upstream);
}
