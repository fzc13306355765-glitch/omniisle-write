import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(root, 'config/public-boundary-v1.json'), 'utf8'));
const ignoredDirectories = new Set(['.git', '.codegraph', 'node_modules', ...(config.ignoredDirectories || [])]);
const maximumTextSize = 16 * 1024 * 1024;
const sensitiveFilePattern = /(?:^|\/)(?:\.env(?:\.(?!example$)[^/]+)?|id_(?:rsa|dsa|ecdsa|ed25519)|[^/]+\.(?:key|pem|ppk|p12|pfx|jks|keystore))$/i;
const secretPatterns = (config.highConfidenceSecretPatterns || []).map(function(pattern) {
    return new RegExp(pattern);
});
const textExtensions = new Set([
    '.bat', '.cjs', '.cmd', '.conf', '.config', '.css', '.go', '.gradle', '.graphql', '.html', '.ini',
    '.java', '.js', '.json', '.jsx', '.kt', '.lock', '.md', '.mjs', '.npmrc', '.properties', '.ps1', '.py',
    '.pem', '.ppk', '.rs', '.sh', '.sql', '.svg', '.toml', '.ts', '.tsx', '.txt', '.xml', '.yml', '.yaml'
]);

function normalize(relativePath) {
    return String(relativePath || '').replaceAll('\\', '/').replace(/^\.\//, '');
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

function runGit(args, allowNoMatches = false) {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (result.status === 0) return result.stdout || '';
    if (allowNoMatches && result.status === 1) return '';
    throw new Error((result.stderr || result.stdout || `git ${args[0]} 执行失败`).trim());
}

const worktreeFindings = new Set();
for (const relativePath of walk('')) {
    if (sensitiveFilePattern.test(relativePath)) {
        worktreeFindings.add(relativePath);
        continue;
    }
    if (!isTextFile(relativePath)) continue;
    const absolutePath = path.join(root, relativePath);
    if (fs.statSync(absolutePath).size > maximumTextSize) continue;
    const text = fs.readFileSync(absolutePath, 'utf8');
    if (secretPatterns.some(function(pattern) { return pattern.test(text); })) worktreeFindings.add(relativePath);
}

const historyFindings = new Set();
const historyPaths = runGit(['log', '--all', '--format=', '--name-only'], true)
    .split(/\r?\n/)
    .map(normalize)
    .filter(Boolean);
for (const relativePath of historyPaths) {
    if (sensitiveFilePattern.test(relativePath)) historyFindings.add(relativePath);
}

const revisions = runGit(['rev-list', '--all'], true).split(/\r?\n/).filter(Boolean);
if (revisions.length) {
    const historyPatterns = [
        '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----',
        'AKID[A-Za-z0-9]{13,}',
        'sk-[A-Za-z0-9_-]{16,}',
        'gh[pousr]_[A-Za-z0-9]{20,}',
        'AIza[A-Za-z0-9_-]{30,}',
        'xox[baprs]-[A-Za-z0-9-]{10,}',
        'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'
    ];
    for (const pattern of historyPatterns) {
        const matches = runGit(['grep', '-I', '-l', '-E', '-e', pattern, ...revisions, '--'], true);
        for (const line of matches.split(/\r?\n/).filter(Boolean)) historyFindings.add(line);
    }
}

if (worktreeFindings.size || historyFindings.size) {
    console.error(`[secrets] NO-GO：当前文件 ${worktreeFindings.size} 项，Git 历史 ${historyFindings.size} 项。仅显示路径，不显示密钥内容。`);
    for (const finding of [...worktreeFindings].sort()) console.error(`  - 当前文件：${finding}`);
    for (const finding of [...historyFindings].sort()) console.error(`  - Git 历史：${finding}`);
    process.exitCode = 1;
} else {
    console.log('[secrets] PASS 当前文件和 Git 历史均未发现高可信密钥');
}
