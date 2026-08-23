import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const index = read('index.html');

for (const requiredId of [
    'createBookCard',
    'btnGen',
    'btnStartGenerate',
    'btnHistoryVersions',
    'btnGenerateBookCover',
    'btnChatModelSelect',
    'btnAIPolishMode1',
    'btnAIPolishMode2',
    'btnAIDetect',
    'btnAPLock',
    'btnAIPolish',
    'btnNaturalize',
    'btnAPSave',
    'btnCopyDetachedPolish',
    'btnImportAnalyze',
    'fullAnalysisStorageNotice',
    'btnOperationTutorialSidebar',
    'btnExportAll'
]) {
    assert.match(index, new RegExp(`id=["']${requiredId}["']`), `缺少社区核心入口：${requiredId}`);
}

for (const forbiddenId of [
    'btnLogin',
    'btnRecharge',
    'btnPayment',
    'overviewBillingTrigger',
    'btnHotListSearch',
    'btnOverviewGroup'
]) {
    assert.doesNotMatch(index, new RegExp(`id=["']${forbiddenId}["']`), `仍包含线上商业入口：${forbiddenId}`);
}

for (const retiredTutorialMarker of [
    'btnOverviewTutorial',
    'overviewTutorialModal',
    'bilibili.com',
    'player.bilibili.com'
]) {
    assert.doesNotMatch(index, new RegExp(retiredTutorialMarker, 'i'), `仍包含旧视频教程内容：${retiredTutorialMarker}`);
}

assert.match(
    index,
    /id=["']overviewAnnouncementBar["'][\s\S]*?class=["']overview-announcement-text["'][^>]*><\/span>/,
    '滚动公告栏必须保留原版结构并保持空内容'
);

const runtimeManifest = JSON.parse(read('config/community-runtime-bundles-v1.json'));
for (const aiPolishModule of [
    './scripts/core/app-ai-detect-engine-community.js?v=2026082302',
    './scripts/core/app-ai-polish-v1-community.js?v=2026082302',
    './scripts/core/app-ai-detect-community.js?v=2026082302',
    './scripts/core/app-ai-polish-community.js?v=2026082302'
]) {
    assert.ok(runtimeManifest.classicScripts.includes(aiPolishModule), `运行清单缺少开源优化模块：${aiPolishModule}`);
}
const aiDetectEngine = read('scripts/core/app-ai-detect-engine-community.js');
const aiDetect = read('scripts/core/app-ai-detect-community.js');
const aiPolishV1 = read('scripts/core/app-ai-polish-v1-community.js');
const aiPolishV2 = read('scripts/core/app-ai-polish-community.js');
assert.match(aiDetectEngine, /collectAIDetectHits/, '消痕 I 缺少本地 AI 痕迹规则引擎');
assert.match(aiDetect, /async function triggerAIDetect/, '消痕 I 缺少 AI检测调用');
assert.match(aiPolishV1, /async function triggerAPPlotLock/, '消痕 I 缺少剧情锁定调用');
assert.match(aiPolishV1, /async function startAIPolishWithConfig/, '消痕 I 缺少 AI优化调用');
assert.match(aiPolishV1, /【AI检测报告（必须参考，优先处理其中的标记和建议）】/, 'AI优化没有带入 AI检测报告');
assert.match(aiPolishV1, /【剧情锁定内容】/, 'AI优化没有带入剧情锁定内容');
assert.match(aiPolishV1, /window\.streamGenerate/, '消痕 I 没有接入用户自备 API');
assert.match(aiPolishV1, /outlineGen\(\)\.apAbortController \|\| window\.isNaturalizeV2Running/, '消痕 I 缺少统一任务互斥');
assert.match(aiDetect, /outlineGen\.apAbortController \|\| window\.isNaturalizeV2Running/, 'AI检测缺少统一任务互斥');
assert.match(aiPolishV1, /isCurrentAIPolishSource\(state\.apPolishSourceChapterKey, state\.apPolishSourceText\)/, '消痕 I 应用结果前没有核对来源章节和正文');
assert.doesNotMatch([aiDetect, aiPolishV1].join('\n'), /\bfetch\s*\(|getAuthHeaders|STREAM_URL|getBillingTier|makeBillingRequestId/, '消痕 I 仍包含私有后端调用');
assert.match(aiPolishV2, /function setAIPolishMode/, '优化页缺少消痕 I / 消痕 II 切换');
assert.match(aiPolishV2, /async function startNaturalizeV2/, '消痕 II 原有直接优化流程未保留');
assert.match(aiPolishV2, /function isV2SourceCurrent/, '消痕 II 缺少结果来源校验');
assert.match(aiPolishV2, /if \(!isV2SourceCurrent\(\)\)/, '消痕 II 应用结果前没有核对来源章节和正文');
for (const tutorialModule of [
    './scripts/core/app-operation-tutorial-mainline-stages.js?v=202608222342',
    './scripts/core/app-operation-tutorial-extra-stages.js?v=202608222342',
    './scripts/core/app-operation-tutorial-state.js?v=202608222342',
    './scripts/core/app-operation-tutorial-menu.js?v=202608222342',
    './scripts/core/app-outline-tutorial-positioning.js?v=202608222342',
    './scripts/core/app-outline-tutorial.js?v=202608222342'
]) {
    assert.ok(runtimeManifest.classicScripts.includes(tutorialModule), `运行清单缺少新版操作引导模块：${tutorialModule}`);
}
assert.ok(
    runtimeManifest.styles.includes('./styles/app/85-outline-tutorial.css?v=202608222342'),
    '运行清单缺少新版操作引导样式'
);

const bootIndex = index.indexOf('./scripts/boot/community-mode.js');
const runtimeIndex = index.indexOf('./scripts/dist/community-runtime.js');
assert.ok(bootIndex >= 0 && runtimeIndex > bootIndex, '社区网络边界必须在运行包之前加载');

const auth = read('scripts/core/app-auth.js');
assert.doesNotMatch(auth, /\bfetch\s*\(/, '本机身份模块不得联网');
assert.match(auth, /local/i, '本机身份模块缺少本地身份实现');

const inquiry = read('scripts/core/app-outline-inquiry.js');
assert.match(inquiry, /streamGenerate\s*\(/, '大纲问询未接入用户模型');
assert.doesNotMatch(inquiry, /\bfetch\s*\(|createOutlineBillingTask|sendClientBilling/, '大纲问询仍依赖服务端任务');

const history = read('scripts/core/app-history-versions.js');
assert.match(history, /ZHIYU_IDB/, '历史版本未接入本机数据库封装');
assert.match(history, /\bIDB\.(?:get|set)\s*\(/, '历史版本缺少本机数据库读写');
assert.match(history, /recordChapterHistorySnapshot/, '章节覆盖前缺少历史快照能力');
assert.doesNotMatch(history, /\bfetch\s*\(/, '历史版本不得联网');

const modelConfig = read('scripts/core/app-model-config.js');
assert.match(modelConfig, /BUILTIN_MODELS:\s*\[\]/, '社区版不应内置知屿模型');

const modelPicker = read('scripts/core/app-model-picker.js');
assert.doesNotMatch(modelPicker, /ZHIYU_COMMUNITY_MODE === true && k/, '空 Key 的本地模型也必须登记模型地址许可');
assert.match(modelPicker, /requestProviderApproval\?\.\(b\)/, '模型选择器缺少地址许可确认');
const settings = read('scripts/core/app-settings-page.js');
assert.doesNotMatch(settings, /ZHIYU_COMMUNITY_MODE === true && api\.key/, '设置页不应只在有 Key 时登记地址许可');
assert.match(settings, /requestProviderApproval\?\.\(api\.base\)/, '设置页缺少地址许可确认');

const coverRenderers = [
    read('scripts/core/app-overview.js'),
    read('scripts/core/app-book-selection.js'),
    read('scripts/core/app-create-book.js')
].join('\n');
assert.doesNotMatch(coverRenderers, /\^\(https\?:\\\/\\\/\|data:image/, '作品封面仍允许直接加载远程地址');

const templates = [
    'scripts/core/app-template-create-form.js',
    'scripts/core/app-template-page.js',
    'scripts/core/app-template-management.js',
    'scripts/core/app-template-selector.js'
].map(read).join('\n');
assert.doesNotMatch(templates, /\bfetch\s*\(/, '用户提示词模板不得上传到服务端');

const coreFiles = fs.readdirSync(path.join(root, 'scripts', 'core'))
    .filter(name => name.endsWith('.js'));
const unexpectedFetch = coreFiles.filter(name => name !== 'app-ai-transport.js' && /\bfetch\s*\(/.test(read(`scripts/core/${name}`)));
assert.deepEqual(unexpectedFetch, [], `发现额外网络请求文件：${unexpectedFetch.join(', ')}`);

const communityRuntimeCss = read('styles/community-runtime.css');
assert.doesNotMatch(communityRuntimeCss, /\.overview-recharge-entry/, '构建后的社区样式仍包含充值入口');
assert.match(
    communityRuntimeCss,
    /#page-overview\s+\.workbench-tabs\s*\{[^}]*width:\s*100%/,
    '移除商业选择器时误删了同组的原版总览页响应式样式'
);

console.log('[smoke:community-local-core] PASS 本机写作入口、新版操作引导、原版响应式样式、历史版本、模板隐私和自备 API 边界均通过');
