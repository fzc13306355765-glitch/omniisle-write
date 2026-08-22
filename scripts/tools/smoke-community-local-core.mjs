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
    'btnImportAnalyze',
    'fullAnalysisStorageNotice',
    'overviewTutorialModal',
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

console.log('[smoke:community-local-core] PASS 本机写作入口、历史版本、模板隐私和自备 API 边界均通过');
