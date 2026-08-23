import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const configPath = path.join(root, 'config', 'public-boundary-v1.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const ignoredDirectories = new Set(config.ignoredDirectories || []);
const maximumAuditFileSize = 64 * 1024 * 1024;
const textExtensions = new Set([
    '.bat', '.cjs', '.cmd', '.conf', '.config', '.css', '.go', '.gradle', '.graphql', '.html', '.ini',
    '.java', '.js', '.json', '.jsx', '.kt', '.lock', '.md', '.mjs', '.npmrc', '.properties', '.ps1', '.py',
    '.rs', '.sh', '.sql', '.svg', '.toml', '.ts', '.tsx', '.txt', '.xml', '.yml', '.yaml'
]);
const sensitiveFileNamePattern = /(?:^|\/)(?:\.env(?:\.[^/]+)?|id_(?:rsa|dsa|ecdsa|ed25519)|[^/]+\.(?:key|pem|ppk|p12|pfx|jks|keystore))$/i;

function normalize(relativePath) {
    return String(relativePath || '').replaceAll('\\', '/').replace(/^\.\//, '');
}

function exists(relativePath) {
    return fs.existsSync(path.join(root, relativePath));
}

function walk(relativePath, output = []) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) return output;
    const stat = fs.statSync(absolutePath);
    if (stat.isFile()) {
        output.push(normalize(relativePath));
        return output;
    }
    for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
        if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
        walk(path.join(relativePath, entry.name), output);
    }
    return output;
}

function isTextFile(relativePath) {
    const baseName = path.basename(relativePath).toLowerCase();
    return baseName === '.env' || baseName.startsWith('.env.') || textExtensions.has(path.extname(relativePath).toLowerCase());
}

function readText(relativePath) {
    const absolutePath = path.join(root, relativePath);
    const stat = fs.statSync(absolutePath);
    if (stat.size > maximumAuditFileSize) return null;
    return fs.readFileSync(absolutePath, 'utf8');
}

function isUnder(relativePath, parentPath) {
    const normalizedPath = normalize(relativePath);
    const normalizedParent = normalize(parentPath).replace(/\/$/, '');
    return normalizedPath === normalizedParent || normalizedPath.startsWith(normalizedParent + '/');
}

function printCategory(title, findings) {
    if (!findings.length) {
        console.log(`[PASS] ${title}`);
        return;
    }
    console.log(`[FAIL] ${title}：${findings.length} 项`);
    for (const finding of findings.slice(0, 30)) {
        console.log(`  - ${finding}`);
    }
    if (findings.length > 30) console.log(`  - 其余 ${findings.length - 30} 项未展开`);
}

if (config.schemaVersion !== 1) {
    throw new Error('config/public-boundary-v1.json 版本不受支持');
}

const allFiles = walk('');
const forbiddenPathRules = [
    ...(config.forbiddenPaths || []).map(rule => ({
        matches: relativePath => isUnder(relativePath, rule.path),
        displayPath: rule.path,
        reason: rule.reason
    })),
    ...(config.forbiddenPathPatterns || []).map(rule => {
        const matcher = new RegExp(rule.pattern, 'i');
        return {
            matches: relativePath => matcher.test(relativePath),
            displayPath: null,
            reason: rule.reason
        };
    })
];

const blockedPathFindings = [];
const blockedFiles = new Set();
for (const rule of forbiddenPathRules) {
    const matches = allFiles.filter(relativePath => rule.matches(relativePath));
    if (!matches.length) continue;
    for (const relativePath of matches) blockedFiles.add(relativePath);
    const display = rule.displayPath || matches[0];
    blockedPathFindings.push(`${display}（${matches.length} 个文件）：${rule.reason}`);
}

const missingPublicFiles = (config.requiredPublicFiles || [])
    .filter(relativePath => !exists(relativePath));

const codeScanExclusions = new Set((config.codeScanExclusions || []).map(normalize));
const codeFiles = new Set();
for (const scanRoot of config.codeScanRoots || []) {
    for (const relativePath of walk(scanRoot)) {
        if (!isTextFile(relativePath) || blockedFiles.has(relativePath) || codeScanExclusions.has(relativePath)) continue;
        codeFiles.add(relativePath);
    }
}

const forbiddenCodeFindings = [];
for (const rule of config.forbiddenCodePatterns || []) {
    const matcher = new RegExp(rule.pattern, 'i');
    const matchingFiles = [...codeFiles].filter(relativePath => {
        if (rule.label === '商业或后台实现' && relativePath.toLowerCase().endsWith('.css')) {
            // 源样式保留原版共用视觉规则；构建器会从公开运行包中剔除商业功能选择器。
            return false;
        }
        const text = readText(relativePath);
        return text !== null && matcher.test(text);
    });
    for (const relativePath of matchingFiles) {
        forbiddenCodeFindings.push(`${relativePath}：${rule.label}`);
    }
}

const secretMatchers = (config.highConfidenceSecretPatterns || []).map(pattern => new RegExp(pattern));
const secretLikeFiles = [...new Set(allFiles.filter(relativePath => {
    if (sensitiveFileNamePattern.test(relativePath)) return true;
    const text = readText(relativePath);
    if (text === null) return false;
    return secretMatchers.some(matcher => matcher.test(text));
}))];
const unscannedLargeFiles = allFiles.filter(relativePath => fs.statSync(path.join(root, relativePath)).size > maximumAuditFileSize);

const assetReviewFindings = [];
if (!exists('ASSETS-LICENSES.md')) {
    for (const relativePath of config.assetReviewPaths || []) {
        if (exists(relativePath)) assetReviewFindings.push(`${relativePath}：缺少公开再分发记录`);
    }
} else {
    const assetLicenseText = readText('ASSETS-LICENSES.md') || '';
    if (assetLicenseText.includes('当前候选不得公开再分发')) {
        assetReviewFindings.push('ASSETS-LICENSES.md：仍有素材权属或公开再分发授权未确认');
    }
}

const missingLocalAssetFindings = [];
if (exists('index.html')) {
    const indexText = readText('index.html') || '';
    const localReferencePattern = /(?:src|href)=["']\.\/([^"'#?]+)(?:[?#][^"']*)?["']/gi;
    for (const match of indexText.matchAll(localReferencePattern)) {
        const relativePath = normalize(match[1]);
        if (!relativePath || relativePath.startsWith('../') || exists(relativePath)) continue;
        missingLocalAssetFindings.push(`index.html -> ${relativePath}`);
    }
}

const runtimeJavaScriptFiles = [
    ...walk('scripts/boot'),
    ...walk('scripts/core')
].filter(relativePath => relativePath.endsWith('.js'));
const directNetworkFindings = [];
const allowedFetchFiles = new Set(['scripts/core/app-ai-transport.js']);
const allowedNetworkConstructorFiles = new Set(['scripts/boot/community-mode.js']);
const forbiddenBusinessRoutePattern = /\/(?:user\/data|chapters|templates|heartbeat|images\/book-cover|health\/models|ai-(?:stream|proxy))(?:\/|\b)/i;
for (const relativePath of runtimeJavaScriptFiles) {
    const text = readText(relativePath) || '';
    if (/\bfetch\s*\(/.test(text) && !allowedFetchFiles.has(relativePath)) {
        directNetworkFindings.push(`${relativePath}：出现未授权 fetch 调用`);
    }
    if (/\b(?:XMLHttpRequest|EventSource|WebSocket)\s*\(/.test(text) && !allowedNetworkConstructorFiles.has(relativePath)) {
        directNetworkFindings.push(`${relativePath}：出现未授权网络构造器`);
    }
    if (forbiddenBusinessRoutePattern.test(text)) {
        directNetworkFindings.push(`${relativePath}：仍包含知屿业务服务路径`);
    }
    if (/(?:BACKEND_URL|STREAM_URL)\s*(?:\+|\})/.test(text)) {
        directNetworkFindings.push(`${relativePath}：仍拼接旧后端地址`);
    }
}

const dynamicLocalAssetFindings = [];
const runtimeAssetSourceFiles = ['index.html', ...walk('scripts/boot'), ...walk('scripts/core')]
    .filter(relativePath => /\.(?:html|js)$/.test(relativePath));
const dynamicAssetPattern = /["'`]((?:\.\/)?(?:assets\/[A-Za-z0-9_./-]+\.(?:png|jpe?g|svg|webp|gif|ico)|LOGO-256\.png))["'`]/gi;
for (const relativePath of runtimeAssetSourceFiles) {
    const text = readText(relativePath) || '';
    for (const match of text.matchAll(dynamicAssetPattern)) {
        const assetPath = normalize(match[1]).replace(/^\.\//, '');
        if (!exists(assetPath)) dynamicLocalAssetFindings.push(`${relativePath} -> ${assetPath}`);
    }
}
if (exists('styles/community-runtime.css')) {
    const runtimeCss = readText('styles/community-runtime.css') || '';
    const cssAssetPattern = /url\(\s*["']?([^"')?#]+)["']?\s*\)/gi;
    for (const match of runtimeCss.matchAll(cssAssetPattern)) {
        const rawPath = String(match[1] || '').trim();
        if (!rawPath || /^(?:data:|https?:|\/\/)/i.test(rawPath)) continue;
        const resolved = normalize(path.relative(root, path.resolve(root, 'styles', rawPath)));
        if (!exists(resolved)) dynamicLocalAssetFindings.push(`styles/community-runtime.css -> ${resolved}`);
    }
}

printCategory('禁止公开的路径', blockedPathFindings);
printCategory('必须补齐的公共治理文件', missingPublicFiles);
printCategory('社区源码中的正式服务或商业实现', [...new Set(forbiddenCodeFindings)].sort());
printCategory('高可信疑似密钥文件（仅报告路径）', secretLikeFiles.sort());
printCategory('超过 64 MiB、必须人工复核的文件', unscannedLargeFiles.sort());
printCategory('待确认权属的素材', assetReviewFindings);
printCategory('首页引用但未随包发布的本地文件', [...new Set(missingLocalAssetFindings)].sort());
printCategory('运行代码中的旧后端或额外网络调用', [...new Set(directNetworkFindings)].sort());
printCategory('运行代码引用但未随包发布的素材', [...new Set(dynamicLocalAssetFindings)].sort());

const failureCount = blockedPathFindings.length
    + missingPublicFiles.length
    + forbiddenCodeFindings.length
    + secretLikeFiles.length
    + unscannedLargeFiles.length
    + assetReviewFindings.length
    + missingLocalAssetFindings.length
    + directNetworkFindings.length
    + dynamicLocalAssetFindings.length;

if (failureCount > 0) {
    console.error(`[audit:public] NO-GO，共 ${failureCount} 项公开阻断。未输出任何匹配内容或密钥值。`);
    process.exitCode = 1;
} else {
    console.log('[audit:public] PASS：公开边界检查通过。');
}
