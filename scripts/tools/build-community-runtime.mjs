import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import esbuild from 'esbuild';

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const manifestPath = path.join(root, 'config', 'community-runtime-bundles-v1.json');
const entryPath = path.join(root, 'index.html');
const scriptOutputPath = path.join(root, 'scripts', 'dist', 'community-runtime.js');
const styleOutputPath = path.join(root, 'styles', 'community-runtime.css');
const realRoot = fs.realpathSync(root);
const forbiddenCommercialStylePattern = /(?:billing|payment|membership|redeem|recharge|naturalize|member-feature|hotlist)/i;
const approvedCommunityAnalysisSources = new Set([
    './scripts/core/app-full-text-analysis-core.js',
    './scripts/core/app-full-text-analysis-community-engine.js',
    './scripts/core/app-full-text-analysis-community.js',
    './styles/app/57-full-text-analysis.css'
]);

function resolveLocalSource(source, kind) {
    const rawSource = String(source || '');
    if (!rawSource || rawSource.includes('#') || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(rawSource)) {
        throw new Error(`${kind}源路径必须是项目内相对路径：${rawSource}`);
    }
    const relativePath = rawSource.split('?')[0].replaceAll('\\', '/').replace(/^\.\//, '');
    const segments = relativePath.split('/');
    const expectedExtension = kind === '脚本' ? '.js' : '.css';
    if (!relativePath || segments.includes('') || segments.includes('..') || path.extname(relativePath).toLowerCase() !== expectedExtension) {
        throw new Error(`${kind}源路径格式不正确：${rawSource}`);
    }
    const filePath = path.resolve(root, ...segments);
    const rootPrefix = path.resolve(root).toLowerCase() + path.sep;
    if (!filePath.toLowerCase().startsWith(rootPrefix)) {
        throw new Error(`${kind}源路径越出项目目录：${rawSource}`);
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        throw new Error(`${kind}源文件不存在：${rawSource}`);
    }
    const realFilePath = fs.realpathSync(filePath);
    const realRootPrefix = realRoot.toLowerCase() + path.sep;
    if (!realFilePath.toLowerCase().startsWith(realRootPrefix)) {
        throw new Error(`${kind}源文件通过目录联接或符号链接越出项目目录：${rawSource}`);
    }
    return realFilePath;
}

function readOrderedSources(sources, kind) {
    return sources.map(source => {
        const filePath = resolveLocalSource(source, kind);
        return {
            source,
            code: fs.readFileSync(filePath, 'utf8').replace(/\r\n?/g, '\n')
        };
    });
}

async function buildJavascript(sources) {
    const joined = readOrderedSources(sources, '脚本')
        .map(item => `\n/* source: ${item.source} */\n${item.code}\n`)
        .join('');
    const transformed = await esbuild.transform(joined, {
        loader: 'js',
        target: 'es2019',
        minify: true,
        legalComments: 'none',
        charset: 'utf8'
    });
    return `/* 知屿写作社区版运行包；由 scripts/tools/build-community-runtime.mjs 生成。 */\n${transformed.code}`
        .replace(/[ \t]+$/gm, '')
        .replace(/\n+$/, '\n');
}

function findCssControl(source, startIndex) {
    let quote = '';
    let parentheses = 0;
    for (let index = startIndex; index < source.length; index += 1) {
        const character = source[index];
        const nextCharacter = source[index + 1];
        if (!quote && character === '/' && nextCharacter === '*') {
            const commentEnd = source.indexOf('*/', index + 2);
            return commentEnd < 0 ? null : findCssControl(source, commentEnd + 2);
        }
        if (quote) {
            if (character === '\\') index += 1;
            else if (character === quote) quote = '';
            continue;
        }
        if (character === '"' || character === "'") {
            quote = character;
            continue;
        }
        if (character === '(') parentheses += 1;
        else if (character === ')' && parentheses > 0) parentheses -= 1;
        else if (parentheses === 0 && (character === '{' || character === ';')) return { character, index };
    }
    return null;
}

function findCssBlockEnd(source, openIndex) {
    let depth = 1;
    let quote = '';
    for (let index = openIndex + 1; index < source.length; index += 1) {
        const character = source[index];
        const nextCharacter = source[index + 1];
        if (!quote && character === '/' && nextCharacter === '*') {
            const commentEnd = source.indexOf('*/', index + 2);
            if (commentEnd < 0) throw new Error('社区样式包含未闭合注释。');
            index = commentEnd + 1;
            continue;
        }
        if (quote) {
            if (character === '\\') index += 1;
            else if (character === quote) quote = '';
            continue;
        }
        if (character === '"' || character === "'") quote = character;
        else if (character === '{') depth += 1;
        else if (character === '}') {
            depth -= 1;
            if (depth === 0) return index;
        }
    }
    throw new Error('社区样式包含未闭合代码块。');
}

function sanitizeCommunityCss(source) {
    let output = '';
    let cursor = 0;
    while (cursor < source.length) {
        const control = findCssControl(source, cursor);
        if (!control) {
            output += source.slice(cursor);
            break;
        }
        if (control.character === ';') {
            output += source.slice(cursor, control.index + 1);
            cursor = control.index + 1;
            continue;
        }
        const blockEnd = findCssBlockEnd(source, control.index);
        const prelude = source.slice(cursor, control.index);
        const significantPrelude = prelude.replace(/\/\*[\s\S]*?\*\//g, '').trim();
        const blockBody = source.slice(control.index + 1, blockEnd);
        if (forbiddenCommercialStylePattern.test(significantPrelude)) {
            // 商业功能样式不进入社区产物；原共享源码保持不变。
        } else if (/^@(?:media|supports|container|layer|document)\b/i.test(significantPrelude)) {
            const sanitizedBody = sanitizeCommunityCss(blockBody);
            if (sanitizedBody.trim()) output += `${prelude}{${sanitizedBody}}`;
        } else {
            output += source.slice(cursor, blockEnd + 1);
        }
        cursor = blockEnd + 1;
    }
    return output;
}

function buildStyles(sources) {
    const joined = readOrderedSources(sources, '样式')
        .map(item => `\n/* source: ${item.source} */\n${sanitizeCommunityCss(item.code)}\n`)
        .join('');
    const output = ('/* 知屿写作社区版样式包；按社区清单原顺序合并。 */\n' + joined)
        .replaceAll('../../UI背景.jpg', '../UI背景-optimized.jpg')
        .replaceAll('../../assets/wallpapers/shanshui-sunrise.png', '../assets/wallpapers/shanshui-sunrise-optimized.jpg')
        .replaceAll('../../assets/wallpapers/shanshui-sunrise-optimized.jpg', '../assets/wallpapers/shanshui-sunrise-optimized.jpg')
        .replace(/[ \t]+$/gm, '')
        .replace(/\n+$/, '\n');
    if (forbiddenCommercialStylePattern.test(output)) {
        const remainingToken = output.match(forbiddenCommercialStylePattern)?.[0] || 'unknown';
        throw new Error(`社区样式包仍包含商业功能选择器：${remainingToken}`);
    }
    return output;
}

function assertOrWrite(filePath, content) {
    const normalizedContent = content.replace(/\r\n?/g, '\n');
    if (args.has('--check')) {
        const actual = fs.existsSync(filePath)
            ? fs.readFileSync(filePath, 'utf8').replace(/\r\n?/g, '\n')
            : '';
        if (actual !== normalizedContent) {
            throw new Error(`社区运行包不是最新：${path.relative(root, filePath)}`);
        }
        return;
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporaryPath = filePath + '.tmp';
    fs.writeFileSync(temporaryPath, normalizedContent, 'utf8');
    fs.renameSync(temporaryPath, filePath);
}

function rewriteEntry(bundleVersion) {
    const expectedScript = `<script src="./scripts/dist/community-runtime.js?v=${bundleVersion}"></script>`;
    const expectedStyle = `<link rel="stylesheet" href="./styles/community-runtime.css?v=${bundleVersion}">`;
    const scriptTagPattern = /<script\b[^>]*>\s*<\/script>/gi;
    const linkTagPattern = /<link\b[^>]*>/gi;
    const readAttribute = (tag, name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1] || '';
    const isRuntimeScript = tag => /^\.\/scripts\/dist\/(?:app-runtime-test|community-runtime)\.js(?:\?[^"']*)?$/i.test(readAttribute(tag, 'src'));
    const isRuntimeStyle = tag => {
        const rel = readAttribute(tag, 'rel').toLowerCase().split(/\s+/);
        const href = readAttribute(tag, 'href');
        return rel.includes('stylesheet') && /^\.\/styles\/(?:app\/app-runtime-test|community-runtime)\.css(?:\?[^"']*)?$/i.test(href);
    };
    let html = fs.readFileSync(entryPath, 'utf8');
    const scriptReferences = (html.match(scriptTagPattern) || []).filter(isRuntimeScript);
    const styleReferences = (html.match(linkTagPattern) || []).filter(isRuntimeStyle);
    if (scriptReferences.length !== 1 || styleReferences.length !== 1) {
        throw new Error('社区入口必须且只能引用一份运行脚本和一份运行样式。');
    }
    if (args.has('--check')) {
        const exactScriptCount = html.split(expectedScript).length - 1;
        const exactStyleCount = html.split(expectedStyle).length - 1;
        if (exactScriptCount !== 1 || exactStyleCount !== 1) {
            throw new Error('社区入口引用的独立运行包不是当前内容指纹。');
        }
        return;
    }
    html = html
        .replace(scriptReferences[0], expectedScript)
        .replace(styleReferences[0], expectedStyle);
    fs.writeFileSync(entryPath, html, 'utf8');
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.schemaVersion !== 1 || manifest.entry !== 'index.html') {
    throw new Error('社区运行包清单格式不正确。');
}
if (!Array.isArray(manifest.classicScripts) || !manifest.classicScripts.length) {
    throw new Error('社区运行包清单缺少脚本。');
}
if (!Array.isArray(manifest.styles) || !manifest.styles.length) {
    throw new Error('社区运行包清单缺少样式。');
}

const forbiddenSourcePattern = /(?:cloud-backup|cloud-sync|billing|payment|membership|redeem|recharge|official-notices|login-notice|hotlist|full-text-analysis|full-analysis-continuation|naturalize|admin)/i;
const forbiddenSources = [...manifest.classicScripts, ...manifest.styles]
    .filter(source => forbiddenSourcePattern.test(source)
        && !approvedCommunityAnalysisSources.has(String(source).split('?')[0]));
if (forbiddenSources.length) {
    throw new Error(`社区运行清单混入私有模块：${forbiddenSources.join(', ')}`);
}

const [javascript, styles] = await Promise.all([
    buildJavascript(manifest.classicScripts),
    Promise.resolve(buildStyles(manifest.styles))
]);
const bundleVersion = crypto
    .createHash('sha256')
    .update(javascript)
    .update('\0')
    .update(styles)
    .digest('hex')
    .slice(0, 12);

assertOrWrite(scriptOutputPath, javascript);
assertOrWrite(styleOutputPath, styles);
rewriteEntry(bundleVersion);

console.log(`[build:community-runtime] ${args.has('--check') ? '已校验' : '已生成'} ${manifest.classicScripts.length} 个社区脚本`);
console.log(`[build:community-runtime] ${args.has('--check') ? '已校验' : '已生成'} ${manifest.styles.length} 个社区样式`);
console.log(`[build:community-runtime] 版本 ${bundleVersion}`);
