import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCommunityProviderProxy } from './community-provider-proxy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const port = Number(process.env.PORT || 8081);
const entryPath = path.join(root, 'index.html');
const providerProxy = createCommunityProviderProxy();
const allowedRootFiles = new Set([
    'index.html',
    'app-version.json',
    'LOGO.png',
    'LOGO-256.png',
    'UI背景.jpg',
    'UI背景-optimized.jpg'
]);
const allowedDirectoryPrefixes = [
    'assets/',
    'styles/',
    'scripts/boot/',
    'scripts/core/',
    'scripts/dist/',
    'scripts/editor/',
    'scripts/vendor/'
];
const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

function resolveStaticFile(requestUrl) {
    const url = new URL(requestUrl, `http://127.0.0.1:${port}`);
    let pathname = '';
    try {
        pathname = decodeURIComponent(url.pathname);
    } catch (error) {
        return null;
    }
    if (pathname === '/' || pathname === '/index.html') return entryPath;
    if (pathname.includes('\\') || pathname.includes('\0') || pathname.includes(':')) return null;
    const segments = pathname.split('/').filter(Boolean);
    if (!segments.length || segments.some(segment => segment === '.' || segment === '..')) return null;
    const rootName = segments[0];
    if (segments.length === 1 && !allowedRootFiles.has(rootName)) return null;
    const normalizedRelative = segments.join('/');
    if (segments.length > 1 && !allowedDirectoryPrefixes.some(prefix => normalizedRelative.startsWith(prefix))) return null;
    const filePath = path.resolve(root, '.' + pathname);
    const relative = path.relative(root, filePath);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
    return filePath;
}

const server = http.createServer(async function(req, res) {
    const requestUrl = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    if (await providerProxy.handle(req, res, requestUrl)) return;
    if (!['GET', 'HEAD'].includes(String(req.method || 'GET').toUpperCase())) {
        res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8', allow: 'GET, HEAD' });
        res.end('Method not allowed');
        return;
    }
    const filePath = resolveStaticFile(req.url || '/');
    if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
    }
    const headers = {
        'content-type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store, no-cache, must-revalidate',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer'
    };
    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
        res.end();
        return;
    }
    fs.createReadStream(filePath).pipe(res);
});

server.listen(port, '127.0.0.1', function() {
    const address = server.address();
    const activePort = typeof address === 'object' && address ? address.port : port;
    console.log(`Omniisle Write Community: http://127.0.0.1:${activePort}/`);
    console.log('Local provider proxy: enabled (loopback only)');
});
