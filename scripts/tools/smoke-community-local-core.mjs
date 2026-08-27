import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const index = read('index.html');

for (const requiredId of [
    'createBookCard',
    'btnGen',
    'btnStartGenerate',
    'chapterGenerationFocusToggle',
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
    'btnExportAll',
    'btnDiscoverCustomModels',
    'customModelSelect',
    'customModelDiscoveryStatus',
    'btnToggleManualModelId',
    'btnCancelCustomModel',
    'customModelManualField',
    'customModelName'
]) {
    assert.match(index, new RegExp(`id=["']${requiredId}["']`), `缺少社区核心入口：${requiredId}`);
}

assert.match(index, /<option value="minimax">MiniMax（国内）<\/option>/, 'MiniMax 缺少国内站选项');
assert.match(index, /<option value="minimax_global">MiniMax（国际）<\/option>/, 'MiniMax 缺少国际站选项');
assert.match(index, /<option value="opencode">OpenCode Zen（正文兼容）<\/option>/, '添加模型缺少 OpenCode Zen 正文兼容选项');

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
assert.match(
    index,
    /connect-src[^;]*https:[^;]*http:\/\/localhost:\*[^;]*http:\/\/127\.0\.0\.1:\*[^;]*http:\/\/\[::1\]:\*/,
    '页面安全规则未允许经过社区白名单确认的本机 HTTP 模型'
);

assert.match(index, /data-chapter-generation-focus=["']story["']/, '正文生成缺少剧情模式按钮');
assert.match(index, /data-chapter-generation-focus=["']words["']/, '正文生成缺少字数模式按钮');
assert.match(index, /data-flow-help=["']chapter-generation-focus["']/, '正文生成缺少双模式教程说明');
assert.match(index, /id=["']chapterTargetWordsInput["'][^>]*max=["']20000["']/, '正文生成字数输入缺少单章安全上限');

const appState = read('scripts/core/app-state.js');
assert.match(appState, /chapterGenerationFocus:\s*["']story["']/, '正文生成默认模式不是剧情模式');

const generationPlanWindow = {};
vm.runInNewContext(read('scripts/core/app-generation-plan.js'), {
    window: generationPlanWindow,
    console
});
const storyPlan = generationPlanWindow.getChapterGenerationPlan(0, '', 'story');
const wordPlan = generationPlanWindow.getChapterGenerationPlan(3000, '', 'words');
const longWordPlan = generationPlanWindow.getChapterGenerationPlan(6000, '', 'words');
const highRequestWordPlan = generationPlanWindow.getChapterGenerationPlan(8000, '', 'words');
assert.equal(storyPlan.targetWords, 3000, '剧情模式留空时没有使用 3000 字目标');
assert.equal(storyPlan.focus, 'story', '剧情模式计划类型错误');
assert.equal(storyPlan.operation, 'chapter_story', '剧情模式操作标识错误');
assert.equal(storyPlan.executionTotal, 1, '剧情模式不应自动发起补写请求');
assert.equal(wordPlan.operation, 'chapter_words', '字数模式操作标识错误');
assert.equal(wordPlan.executionTotal, 2, '普通字数模式缺少计划内续写机会');
assert.equal(longWordPlan.longTarget, true, '长字数目标没有进入分次生成计划');
assert.ok(longWordPlan.executionTotal > 2, '长字数目标生成次数不足');
assert.equal(longWordPlan.requiresHighRequestConfirmation, false, '常规字数计划不应弹出高次数确认');
assert.equal(highRequestWordPlan.requiresHighRequestConfirmation, true, '高次数字数计划缺少二次确认标记');
assert.equal(generationPlanWindow.parseChapterWordTargetInput('20000', false).ok, true, '单章安全上限被错误拒绝');
assert.equal(generationPlanWindow.parseChapterWordTargetInput('20001', false).ok, false, '超过单章安全上限的字数仍被接受');
assert.match(
    generationPlanWindow.buildChapterGenerationPrompt('基础提示', storyPlan, 1, ''),
    new RegExp(generationPlanWindow.CHAPTER_STORY_COMPLETION_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    '剧情模式提示词缺少完整收束标记'
);
assert.match(
    generationPlanWindow.buildChapterGenerationPrompt('基础提示', wordPlan, 2, '前文结尾。'),
    /已写正文末尾/,
    '字数模式第二次生成没有携带已写正文末尾'
);
const completionFilter = generationPlanWindow.createChapterStoryCompletionFilter(true);
assert.equal(completionFilter.push('正文结束。[[ZHIYU_STORY_'), '正文结束。', '剧情完成标记前缀被写入正文');
assert.equal(completionFilter.push('COMPLETE_6F4C]]'), '', '剧情完成标记后缀被写入正文');
const completionResult = completionFilter.finish();
assert.equal(completionResult.complete, true, '跨分片剧情完成标记没有被识别');
assert.equal(completionResult.markerFound, true, '剧情完成标记识别状态错误');
const incompleteFilter = generationPlanWindow.createChapterStoryCompletionFilter(true);
incompleteFilter.push('尚未收束的正文');
assert.equal(incompleteFilter.finish().complete, false, '没有完成标记的剧情被误判为完成');

const selectedModel = { base: 'https://model.example/v1', model: 'writer-model', key: 'test-only-key' };
let storyRequestCount = 0;
let receivedFrozenModel = false;
const storyExecution = await generationPlanWindow.executeChapterGenerationPlan({
    plan: storyPlan,
    basePrompt: '生成正文',
    modelConfig: selectedModel,
    streamGenerate: async (config, _system, _prompt, onChunk, onDone) => {
        storyRequestCount += 1;
        receivedFrozenModel = Object.isFrozen(config) && config.base === selectedModel.base && config.model === selectedModel.model;
        onChunk('正文结束。[[ZHIYU_STORY_');
        onChunk('COMPLETE_6F4C]]');
        onDone('ok');
    }
});
assert.equal(storyRequestCount, 1, '剧情模式没有严格限制为一次用户 API 请求');
assert.equal(receivedFrozenModel, true, '正文生成没有冻结并固定使用用户开始时选择的模型');
assert.equal(storyExecution.content, '正文结束。', '剧情完成标记进入了最终正文');

let wordRequestCount = 0;
const wordPrompts = [];
const wordExecution = await generationPlanWindow.executeChapterGenerationPlan({
    plan: wordPlan,
    basePrompt: '生成正文',
    modelConfig: selectedModel,
    streamGenerate: async (_config, _system, prompt, onChunk, onDone) => {
        wordRequestCount += 1;
        wordPrompts.push(prompt);
        onChunk(wordRequestCount === 1 ? '短' : '潮'.repeat(3000));
        onDone('ok');
    }
});
assert.equal(wordRequestCount, 2, '字数模式没有在不足目标时按计划续写');
assert.match(wordPrompts[1], /已写正文末尾/, '字数模式续写请求没有带入已写正文末尾');
assert.ok(wordExecution.generatedWords >= 3000, '字数模式续写后仍未达到测试目标');

let earlyStopRequestCount = 0;
await generationPlanWindow.executeChapterGenerationPlan({
    plan: wordPlan,
    basePrompt: '生成正文',
    modelConfig: selectedModel,
    streamGenerate: async (_config, _system, _prompt, onChunk, onDone) => {
        earlyStopRequestCount += 1;
        onChunk('潮'.repeat(3000));
        onDone('ok');
    }
});
assert.equal(earlyStopRequestCount, 1, '字数模式达到目标后仍继续调用用户 API');

let incompleteStoryError = null;
try {
    await generationPlanWindow.executeChapterGenerationPlan({
        plan: storyPlan,
        basePrompt: '生成正文',
        modelConfig: selectedModel,
        streamGenerate: async (_config, _system, _prompt, onChunk, onDone) => {
            onChunk('尚未完整收束的剧情');
            onDone('ok');
        }
    });
} catch (error) {
    incompleteStoryError = error;
}
assert.equal(incompleteStoryError?.code, 'AI_STORY_INCOMPLETE', '未完整收束的剧情没有保持失败状态');
assert.equal(incompleteStoryError?.generatedContent, '尚未完整收束的剧情', '未完整剧情草稿没有随错误保留');

let unauthorizedExecutionError = null;
try {
    await generationPlanWindow.executeChapterGenerationPlan({
        plan: wordPlan,
        basePrompt: '生成正文',
        modelConfig: selectedModel,
        streamGenerate: async (_config, _system, _prompt, _onChunk, _onDone, onError) => {
            const error = new Error('unauthorized');
            error.status = 401;
            onError(error);
        }
    });
} catch (error) {
    unauthorizedExecutionError = error;
}
assert.equal(unauthorizedExecutionError?.status, 401, '用户模型的 401 状态在生成循环中丢失');

let emptyExecutionError = null;
try {
    await generationPlanWindow.executeChapterGenerationPlan({
        plan: wordPlan,
        basePrompt: '生成正文',
        modelConfig: selectedModel,
        streamGenerate: async (_config, _system, _prompt, _onChunk, onDone) => onDone('')
    });
} catch (error) {
    emptyExecutionError = error;
}
assert.equal(emptyExecutionError?.code, 'AI_STREAM_EMPTY', '空响应没有被正文生成循环识别为失败');

const generationActions = read('scripts/core/app-generation-actions.js');
assert.match(generationActions, /getChapterGenerationPlan/, '正文生成没有使用双模式生成计划');
assert.match(generationActions, /executeChapterGenerationPlan/, '正文按钮没有调用已自动测试的双模式执行器');
assert.match(generationActions, /streamGenerate,/, '正文生成没有把用户自备 API 传入双模式执行器');
assert.match(generationActions, /Confirm\.show/, '高次数字数模式缺少开始前二次确认');
assert.doesNotMatch(
    generationActions,
    /STREAM_URL|getAuthHeaders|getBillingTier|ensureAuthSessionForGeneration|createBilling|callLLMAPI|\bcredits\b/,
    '正文双模式仍依赖知屿后端、登录、计费或隐藏模型重试'
);

const requestErrorWindow = {};
vm.runInNewContext(read('scripts/core/app-request-error-utils.js'), {
    window: requestErrorWindow,
    setTimeout,
    console
});
assert.equal(
    requestErrorWindow.formatExecutionLogMessage('等待生成...', '执行提示'),
    '等待生成...',
    '普通执行提示仍被替换成笼统文案'
);
assert.equal(
    requestErrorWindow.formatExecutionLogMessage('执行失败 api_key=super-secret-token', '执行失败'),
    '执行失败 api_key=[已隐藏]',
    '执行日志没有在保留真实错误时隐藏密钥'
);
const unauthorizedError = new Error('request failed');
unauthorizedError.status = 401;
assert.equal(
    requestErrorWindow.formatExecutionLogMessage(unauthorizedError, '执行失败'),
    '自备模型 API Key 无效，请检查模型设置。',
    '带状态码的真实模型错误没有转换成可操作提示'
);

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
assert.match(modelPicker, /requestProviderApproval\?\.\(base\)/, '模型列表检索前缺少地址许可确认');
assert.match(modelPicker, /discoverAvailableModels/, '模型选择器未接入模型列表检索');
assert.match(modelPicker, /你仍可手动填写模型 ID/, '普通模型列表检索失败后缺少手动 ID 回退入口');
assert.match(modelPicker, /btnCancelCustomModel[\s\S]*clearCustomModelForm/, '取消添加模型时没有中止检索并清理表单');
assert.match(modelPicker, /upsertCustomModelEntry/, '同名模型保存没有使用覆盖更新逻辑');
assert.match(modelPicker, /getCustomModelDiscoveryErrorMessage\(error, \{ provider, base \}\)/, 'MiniMax 401 提示没有获得当前站点信息');
assert.match(modelPicker, /手动填写模型 ID 也不能绕过此限制/, 'OpenCode 浏览器跨域提示仍会误导用户手动填写 ID');
assert.match(modelPicker, /setCustomModelManualFieldVisible\(!browserBlockedOpenCode/, 'OpenCode 浏览器跨域失败后仍会自动展开无效的手动 ID');
assert.match(modelPicker, /if \(baseInput\) baseInput\.value = base;/, '检索前没有把完整模型列表地址整理回基础 URL');

function createModelDiscoveryHarness(fetchImpl, options) {
    let approvedUrl = '';
    const windowObject = {
        ...(options || {}),
        ZHIYU_COMMUNITY_RUNTIME: {
            network: {
                assertProviderRequest(url) { approvedUrl = String(url || ''); }
            }
        }
    };
    const context = vm.createContext({
        window: windowObject,
        document: { body: { classList: { contains() { return false; } } } },
        fetch: fetchImpl,
        AbortController,
        setTimeout,
        clearTimeout,
        console,
        Promise,
        Object,
        Array,
        String,
        Number,
        Boolean,
        Math,
        Date,
        RegExp,
        Error,
        TypeError,
        JSON,
        Set,
        URL,
        TextEncoder,
        TextDecoder,
        Uint8Array
    });
    vm.runInContext(read('scripts/core/app-ai-transport.js'), context, { filename: 'scripts/core/app-ai-transport.js' });
    return {
        transport: windowObject.ZHIYU_AI_TRANSPORT,
        windowObject,
        getApprovedUrl() { return approvedUrl; }
    };
}

{
    const harness = createModelDiscoveryHarness(async function() {
        throw new Error('本测试不应发起请求');
    });
    assert.equal(
        harness.transport.buildModelDiscoveryUrl('https://api.example.test/v1?region=cn'),
        'https://api.example.test/v1/models?region=cn',
        '带普通查询参数的 Base URL 没有把 /models 加到路径部分'
    );
    assert.throws(
        () => harness.transport.buildModelDiscoveryUrl('https://api.example.test/v1?api_key=secret'),
        error => error?.code === 'MODEL_DISCOVERY_SECRET_IN_URL',
        '模型列表网址仍允许携带 API Key'
    );
    assert.throws(
        () => harness.transport.buildModelDiscoveryUrl('https://api.example.test/v1#models'),
        error => error?.code === 'MODEL_DISCOVERY_URL_HASH',
        '模型列表 Base URL 仍允许无意义的锚点'
    );
    assert.equal(
        harness.transport.buildModelRequestUrl('https://api.example.test/v1?region=cn', '/chat/completions'),
        'https://api.example.test/v1/chat/completions?region=cn',
        '正文请求没有把普通查询参数保留在生成端点之后'
    );
    assert.equal(
        harness.transport.buildModelRequestUrl('https://opencode.ai/zen/v1/models', '/chat/completions'),
        'https://opencode.ai/zen/v1/chat/completions',
        '误填 /models 的旧配置仍会拼成 /models/chat/completions'
    );
    assert.throws(
        () => harness.transport.buildModelRequestUrl('https://api.example.test/v1?access_token=secret', '/chat/completions'),
        error => error?.code === 'MODEL_SECRET_IN_URL',
        '正文请求仍允许旧配置把访问令牌放进网址'
    );

    const guardedPrompt = harness.transport.appendChineseOutputGuard('你是小说细纲策划师。');
    assert.match(guardedPrompt, /社区版统一输出语言/, 'AI请求缺少统一中文输出标记');
    assert.match(guardedPrompt, /全部面向用户的可见内容必须使用简体中文/, 'AI请求缺少简体中文硬约束');
    assert.equal(
        guardedPrompt.match(/社区版统一输出语言/g)?.length,
        1,
        '同一个AI请求重复追加了中文输出约束'
    );
    assert.equal(
        harness.transport.appendChineseOutputGuard(guardedPrompt),
        guardedPrompt,
        '已有中文输出约束仍被重复追加'
    );

    const reasoningFilter = harness.transport.createAiReasoningFilter();
    const visibleReasoningChunks = [
        '<thi',
        'nk>The user wants a detailed outline.</th',
        'ink>## 第1章：匿名来信\n主角收到来信。',
        '<analysis>More English reasoning.</analysis>\n## 第2章：追查'
    ].map(chunk => reasoningFilter.push(chunk)).join('') + reasoningFilter.finish();
    assert.equal(
        visibleReasoningChunks,
        '## 第1章：匿名来信\n主角收到来信。\n## 第2章：追查',
        '跨分片英文思考过程仍会进入细纲或其他AI内容'
    );
    assert.equal(
        harness.transport.isChineseVisibleOutput('### FILE: 角色列表\n{"name":"张三","role":"主角"}'),
        true,
        '中文保护错误拒绝了带固定英文标记或JSON字段名的中文结果'
    );
    assert.throws(
        () => harness.transport.assertChineseVisibleOutput('The model returned a detailed outline entirely in English for the user.'),
        error => error?.code === 'AI_OUTPUT_NOT_CHINESE',
        '英文占主导的AI结果仍会被当作可保存内容'
    );
    assert.throws(
        () => harness.transport.assertChineseVisibleOutput('这是中文开头。The model then switches to an English explanation for the user. 这是中文结尾。'),
        error => error?.code === 'AI_OUTPUT_NOT_CHINESE',
        '夹在中文内容中的连续英文说明仍会被当作可保存内容'
    );
    const shortPreambleChunks = [];
    const shortPreambleGate = harness.transport.createAiVisibleOutputGate(chunk => shortPreambleChunks.push(chunk));
    shortPreambleGate.push('Here is the requested detailed outline.\n细纲第一章：匿名来信');
    assert.equal(shortPreambleGate.finish(), '细纲第一章：匿名来信', '短英文开场白没有被统一清理');
    assert.equal(shortPreambleChunks.join(''), '细纲第一章：匿名来信', '短英文开场白仍被送到了功能界面');
}

function createAiStreamResponse(events) {
    return {
        ok: true,
        status: 200,
        headers: { get() { return null; } },
        events: events.slice()
    };
}

{
    const requests = [];
    const chunks = [];
    let streamError = null;
    const harness = createModelDiscoveryHarness(async function(url, options) {
        requests.push({ url: String(url), options });
        return createAiStreamResponse([
            JSON.stringify({ choices: [{ delta: { content: '<thi' } }] }),
            JSON.stringify({ choices: [{ delta: { content: 'nk>The user wants a detailed outline.</th' } }] }),
            JSON.stringify({ choices: [{ delta: { content: 'ink>Here is the requested detailed outline.\n## 第1章：匿名来信\n主角收到一封来信。' } }] }),
            '[DONE]'
        ]);
    }, {
        ZhiyuSseContract: {
            async readSseData(response, handlers) {
                for (const event of response.events) handlers.onData(event);
            }
        }
    });
    const result = await harness.transport.streamGenerate(
        { base: 'https://api.example.test/v1', model: 'writer-model', key: 'test-key', protocol: 'openai' },
        '你是小说细纲策划师。',
        '请生成详细细纲。',
        chunk => chunks.push(chunk),
        function() {},
        error => { streamError = error; }
    );
    assert.equal(streamError, null, '中文细纲被统一输出保护错误拒绝');
    assert.equal(result, '## 第1章：匿名来信\n主角收到一封来信。', '统一AI出口没有清理英文思考过程');
    assert.equal(chunks.join(''), result, '清理后的中文结果没有正确送到原功能界面');
    const requestBody = JSON.parse(requests[0].options.body);
    assert.match(requestBody.messages[0].content, /社区版统一输出语言/, '系统提示词没有经过统一中文保护');
    assert.match(requestBody.messages[1].content, /社区版统一输出语言/, '用户提示词末尾没有重复声明中文要求');
}

{
    const chunks = [];
    let streamError = null;
    const harness = createModelDiscoveryHarness(async function() {
        return createAiStreamResponse([
            JSON.stringify({ choices: [{ delta: { content: '这是已经通过检查的中文开头。' } }] }),
            JSON.stringify({ choices: [{ delta: { content: 'The model now switches to an English explanation ' } }] }),
            JSON.stringify({ choices: [{ delta: { content: 'that must never appear in the writing interface.' } }] }),
            '[DONE]'
        ]);
    }, {
        ZhiyuSseContract: {
            async readSseData(response, handlers) {
                for (const event of response.events) handlers.onData(event);
            }
        }
    });
    const result = await harness.transport.streamGenerate(
        { base: 'https://api.example.test/v1', model: 'writer-model', key: 'test-key', protocol: 'openai' },
        '你是小说助手。',
        '请生成内容。',
        chunk => chunks.push(chunk),
        function() {},
        error => { streamError = error; }
    );
    assert.equal(result, '', '先中文后英文的AI结果仍被当作完整结果返回');
    assert.equal(streamError?.code, 'AI_OUTPUT_NOT_CHINESE', '后续英文说明没有返回明确中文错误');
    assert.equal(chunks.join(''), '这是已经通过检查的中文开头。', '后续英文说明在检查前已经显示到页面');
}

{
    const chunks = [];
    let streamError = null;
    const englishOutput = Array.from({ length: 40 }, function() {
        return 'The model is explaining its reasoning and will provide an English answer. ';
    }).join('');
    const harness = createModelDiscoveryHarness(async function() {
        return createAiStreamResponse([
            JSON.stringify({ choices: [{ delta: { content: englishOutput } }] }),
            '[DONE]'
        ]);
    }, {
        ZhiyuSseContract: {
            async readSseData(response, handlers) {
                for (const event of response.events) handlers.onData(event);
            }
        }
    });
    const result = await harness.transport.streamGenerate(
        { base: 'https://api.example.test/v1', model: 'writer-model', key: 'test-key', protocol: 'openai' },
        '你是小说助手。',
        '请生成内容。',
        chunk => chunks.push(chunk),
        function() {},
        error => { streamError = error; }
    );
    assert.equal(result, '', '英文占主导的AI结果仍被返回给功能模块');
    assert.equal(streamError?.code, 'AI_OUTPUT_NOT_CHINESE', '英文占主导的AI结果没有返回明确中文错误');
    assert.deepEqual(chunks, [], '英文占主导的AI结果在检查前已经显示到页面');
}

{
    let requestBody = null;
    const harness = createModelDiscoveryHarness(async function(_url, options) {
        requestBody = JSON.parse(options.body);
        return createAiStreamResponse([
            JSON.stringify({ type: 'content_block_delta', delta: { text: '这是角色关系分析结果。' } }),
            JSON.stringify({ type: 'message_stop' })
        ]);
    }, {
        ZhiyuSseContract: {
            async readSseData(response, handlers) {
                for (const event of response.events) handlers.onData(event);
            }
        }
    });
    const result = await harness.transport.streamGenerate(
        { base: 'https://api.anthropic.test/v1', model: 'claude-test', key: 'test-key', protocol: 'anthropic' },
        '你是角色关系分析助手。',
        '请整理人物关系。'
    );
    assert.equal(result, '这是角色关系分析结果。', 'Anthropic协议的中文结果未正常返回');
    assert.match(requestBody.system, /社区版统一输出语言/, 'Anthropic系统提示词没有经过统一中文保护');
    assert.match(requestBody.messages[0].content, /社区版统一输出语言/, 'Anthropic用户提示词没有经过统一中文保护');
}

{
    const calls = [];
    const harness = createModelDiscoveryHarness(async function(url, options) {
        calls.push({ url: String(url), options });
        if (String(url) === '/__omniisle/provider-proxy/capabilities') {
            return {
                ok: true,
                status: 200,
                async json() { return { enabled: true, version: 1, token: 'local-proxy-test-token' }; }
            };
        }
        if (String(url) === '/__omniisle/provider-proxy/request') {
            return {
                ok: true,
                status: 200,
                headers: { get() { return null; } },
                async text() {
                    return JSON.stringify({ data: [
                        { id: 'deepseek-v4-flash-free' },
                        { id: 'minimax-m3' },
                        { id: 'gpt-5.6-sol' },
                        { id: 'claude-sonnet-5' },
                        { id: 'gemini-3.7-flash' },
                        { id: 'x-preview-f-free' },
                        { id: 'laguna-s-2.1-free' }
                    ] });
                }
            };
        }
        throw new Error('本机转发测试出现意外请求：' + url);
    }, {
        location: { protocol: 'http:', hostname: '127.0.0.1' }
    });
    const models = await harness.transport.discoverAvailableModels({
        base: 'https://opencode.ai/zen/v1/models',
        key: 'opencode-test-key',
        provider: 'opencode',
        protocol: 'openai'
    });
    assert.deepEqual(
        Array.from(models),
        ['deepseek-v4-flash-free', 'minimax-m3', 'x-preview-f-free'],
        'OpenCode 列表没有按官方接口过滤为正文兼容模型'
    );
    assert.equal(calls.length, 2, '本机环境没有先探测能力再走本机转发');
    assert.equal(calls[1].options.headers['X-Omniisle-Local-Token'], 'local-proxy-test-token');
    const envelope = JSON.parse(calls[1].options.body);
    assert.equal(envelope.targetUrl, 'https://opencode.ai/zen/v1/models');
    assert.equal(envelope.headers.Authorization, 'Bearer opencode-test-key');
    assert.equal(calls[1].url.includes('opencode-test-key'), false, 'OpenCode Key 进入了本机转发网址');
    assert.equal(harness.getApprovedUrl(), envelope.targetUrl, 'OpenCode 目标地址没有先经过社区联网许可检查');
    assert.equal(
        harness.transport.redactActiveModelKey('invalid credential opencode-test-key', 'opencode-test-key'),
        'invalid credential [模型密钥已隐藏]',
        '非标准格式的当前 API Key 仍可能进入执行日志'
    );
}

{
    const calls = [];
    const harness = createModelDiscoveryHarness(async function(url, options) {
        calls.push({ url: String(url), options });
        return {
            ok: true,
            status: 200,
            headers: { get() { return null; } },
            async text() {
                return JSON.stringify({ data: [
                    { id: 'gpt-4.1' },
                    { id: 'gpt-4o' },
                    { id: 'gpt-4.1' },
                    { id: 'bad\nmodel' }
                ] });
            }
        };
    });
    const models = await harness.transport.discoverAvailableModels({
        base: 'https://api.example.test/v1/',
        key: 'secret-key-value',
        protocol: 'openai'
    });
    assert.deepEqual(Array.from(models), ['gpt-4.1', 'gpt-4o'], '模型列表必须去重并过滤控制字符');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.example.test/v1/models');
    assert.equal(calls[0].options.method, 'GET');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer secret-key-value');
    assert.equal(calls[0].options.credentials, 'omit', '模型检索不得携带站点 Cookie');
    assert.equal(calls[0].url.includes('secret-key-value'), false, 'API Key 不得进入模型列表网址');
    assert.equal(harness.getApprovedUrl(), calls[0].url, '模型检索网址必须经过社区网络边界检查');
}

{
    let requestOptions = null;
    const harness = createModelDiscoveryHarness(async function(_url, options) {
        requestOptions = options;
        return {
            ok: true,
            status: 200,
            headers: { get() { return null; } },
            async text() { return JSON.stringify({ data: [{ id: 'claude-sonnet-model' }] }); }
        };
    });
    const models = await harness.transport.discoverAvailableModels({
        base: 'https://api.anthropic.test/v1',
        key: 'anthropic-secret',
        protocol: 'anthropic'
    });
    assert.deepEqual(Array.from(models), ['claude-sonnet-model']);
    assert.equal(requestOptions.headers['x-api-key'], 'anthropic-secret');
    assert.equal(requestOptions.headers.Authorization, undefined);
    assert.equal(requestOptions.headers['anthropic-version'], '2023-06-01');
}

{
    const harness = createModelDiscoveryHarness(async function() {
        throw new TypeError('Failed to fetch');
    });
    await assert.rejects(
        harness.transport.discoverAvailableModels({ base: 'https://cors-blocked.test/v1', key: '', protocol: 'openai' }),
        error => error?.code === 'MODEL_DISCOVERY_NETWORK' && !String(error?.message || '').includes('Failed to fetch'),
        '浏览器跨域失败必须转换为不泄露内部细节的可操作提示'
    );
}

{
    let readCount = 0;
    let cancelled = false;
    const harness = createModelDiscoveryHarness(async function() {
        const reader = {
            async read() {
                readCount += 1;
                if (readCount <= 2) return { done: false, value: new Uint8Array(1100000) };
                return { done: true, value: undefined };
            },
            async cancel() { cancelled = true; },
            releaseLock() {}
        };
        return {
            ok: true,
            status: 200,
            headers: { get() { return null; } },
            body: { getReader() { return reader; } }
        };
    });
    await assert.rejects(
        harness.transport.discoverAvailableModels({ base: 'https://large-list.test/v1', key: '', protocol: 'openai' }),
        error => error?.code === 'MODEL_DISCOVERY_RESPONSE_TOO_LARGE',
        '无 Content-Length 的超大流式模型列表没有在读取中途停止'
    );
    assert.equal(readCount, 2, '超大模型列表没有在超过 2 MiB 后立即停止读取');
    assert.equal(cancelled, true, '超大模型列表没有取消底层响应流');
}
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

const RealDate = Date;
const fixedNow = RealDate.parse('2026-08-23T17:10:44Z');
const shanghaiOffsetMs = 8 * 60 * 60 * 1000;
class FixedShanghaiDate extends RealDate {
    constructor(...args) {
        if (!args.length) {
            super(fixedNow);
        } else if (args.length >= 2) {
            const [year, month, day = 1, hour = 0, minute = 0, second = 0, millisecond = 0] = args;
            super(RealDate.UTC(year, month, day, hour, minute, second, millisecond) - shanghaiOffsetMs);
        } else {
            super(args[0]);
        }
    }

    static now() {
        return fixedNow;
    }

    shifted() {
        return new RealDate(this.getTime() + shanghaiOffsetMs);
    }

    getFullYear() { return this.shifted().getUTCFullYear(); }
    getMonth() { return this.shifted().getUTCMonth(); }
    getDate() { return this.shifted().getUTCDate(); }
    getDay() { return this.shifted().getUTCDay(); }
    setDate(value) {
        const shifted = this.shifted();
        shifted.setUTCDate(value);
        return this.setTime(shifted.getTime() - shanghaiOffsetMs);
    }
}

const createFakeDocument = () => ({
    readyState: 'loading',
    body: { classList: { contains: () => false } },
    documentElement: { clientWidth: 1600, clientHeight: 1000, dataset: {} },
    addEventListener() {},
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; }
});

const outlineUiDocument = createFakeDocument();
const outlineUiWindow = {
    document: outlineUiDocument,
    ZHIYU_APP_STATE: {
        outline: { mode: 'outline', genres: [], functionalLinkedFiles: [] },
        chapter: { book: '' },
        auth: {}
    },
    addEventListener() {},
    console
};
vm.runInNewContext(read('scripts/core/app-outline-ui.js'), {
    window: outlineUiWindow,
    document: outlineUiDocument,
    setTimeout,
    clearTimeout,
    console
});
const outlineReasoningState = {};
const outlineVisibleChunks = [
    '<thi',
    'nk>The user wants an outline.',
    '</th',
    'ink>\n\n## 作品基础信息\n中文大纲',
    '\n\n<think>More English reasoning.</think>## 第1章：开端'
].map(chunk => outlineUiWindow.normalizeOutlineStreamText(chunk, outlineReasoningState)).join('');
assert.equal(
    outlineVisibleChunks,
    '## 作品基础信息\n中文大纲\n\n## 第1章：开端',
    '跨分片 <think> 思考过程仍进入大纲显示内容'
);
assert.equal(
    outlineUiWindow.stripOutlineReasoningText('<think>English analysis</think>\n## 作品基础信息\n中文'),
    '\n## 作品基础信息\n中文',
    '最终大纲保存前没有清理完整 <think> 内容'
);
const unfinishedFirstRequestState = {};
assert.equal(
    outlineUiWindow.normalizeOutlineStreamText('## 作品基础信息\n中文设定\n<think>unfinished reasoning', unfinishedFirstRequestState),
    '## 作品基础信息\n中文设定\n',
    '第一阶段未闭合的 <think> 前正常基础设定被误删'
);
const independentSecondRequestState = {};
assert.equal(
    outlineUiWindow.normalizeOutlineStreamText('## 第1章：开端\n中文章节粗纲', independentSecondRequestState),
    '## 第1章：开端\n中文章节粗纲',
    '第二次独立大纲请求错误继承了上一请求的 reasoning 状态'
);

const outlineActionsSource = read('scripts/core/app-outline-actions.js');
const outlineSegmentLoopIndex = outlineActionsSource.indexOf('for (let seg = 1; seg <= outlinePlan.total; seg++)');
const outlineSegmentStateIndex = outlineActionsSource.indexOf('const outlineStreamState = { started: false };', outlineSegmentLoopIndex);
assert.ok(
    outlineSegmentLoopIndex >= 0 && outlineSegmentStateIndex > outlineSegmentLoopIndex,
    '普通大纲没有为每次独立分段请求重建 reasoning 过滤状态'
);

const outlinePromptWindow = {
    getOutlineGenreList: () => ['玄幻'],
    getGenrePreferenceTags: () => [],
    stripLeadingPreferenceTags: value => value,
    buildGenreContextPrompt: () => ''
};
vm.runInNewContext(read('scripts/core/app-outline-prompt-builder.js'), {
    window: outlinePromptWindow,
    console
});
const outlinePromptGuard = outlinePromptWindow.buildOutlineGenerationPrompt({
    AppState: { outline: { genres: ['玄幻'], templateId: 'outline-template', importedWorkSummary: '' } },
    OUTLINE_WORDCOUNT: { short: '短篇 15万字' },
    FORMAT_CONSTRAINTS: { OUTLINE_DIRECT: '\n格式约束' },
    gTPublic: () => [{ id: 'outline-template', systemPrompt: '你是大纲助手。' }],
    wcKey: 'short',
    coreSummary: '',
    mode: 'direct'
});
assert.match(outlinePromptGuard.systemPrompt, /全部可见内容必须使用简体中文/, '大纲系统提示缺少简体中文约束');
assert.match(outlinePromptGuard.userMessage, /不要输出 <think> 标签/, '大纲用户提示缺少思考过程禁止规则');
assert.match(
    generationPlanWindow.buildSegmentedOutlinePrompt('基础提示', 'short', '短篇 15万字', generationPlanWindow.getOutlineSegmentPlan('short'), 1, ''),
    /全部可见内容必须使用简体中文/,
    '大纲分段提示没有重复声明简体中文输出规则'
);

vm.runInNewContext(read('scripts/core/app-outline-save-actions.js'), {
    window: outlineUiWindow,
    document: outlineUiDocument,
    console
});
const historicalOutline = '<think>old English reasoning</think>\n# 测试书大纲';
const outlineFile = { name: '测试书_大纲.md', content: historicalOutline };
const outlineFolderFiles = [outlineFile];
const outlineContinueSession = {
    active: true,
    ready: true,
    saved: false,
    bookName: '测试书',
    folder: '大纲',
    name: outlineFile.name,
    index: 0,
    baseContent: historicalOutline,
    targetSnapshot: JSON.stringify(outlineFile),
    folderSnapshot: JSON.stringify(outlineFolderFiles),
    mirrorsBookOutline: true
};
const preparedOutlineContinue = outlineUiWindow.ZHIYU_OUTLINE_CONTINUE_SAVE.prepareOutlineContinueAppend(
    { 测试书: { outline: { content: historicalOutline } } },
    { 测试书: { 大纲: outlineFolderFiles } },
    outlineContinueSession,
    '# 测试书大纲\n\n--- 正在生成续写内容 ---\n\n## 第1章：新内容',
    '2026-08-25T00:00:00.000Z'
);
assert.doesNotMatch(preparedOutlineContinue.mergedContent, /<think>|English reasoning/, '历史大纲 reasoning 被续写保存链重新写回');
assert.match(preparedOutlineContinue.mergedContent, /# 测试书大纲[\s\S]*## 第1章：新内容/, '清理历史 reasoning 后续写内容没有正确追加');

const continueRuntimeSession = { active: true, accountUid: 'guest', bookName: '测试书' };
const continueRuntimeState = {
    outline: { continueSession: continueRuntimeSession },
    chapter: { book: '测试书' },
    auth: { uid: 'guest' }
};
const continueRuntimeWindow = {
    stripOutlineReasoningText: outlineUiWindow.stripOutlineReasoningText,
    AccountDataScope: { getActiveUid: () => 'guest' }
};
vm.runInNewContext(read('scripts/core/app-outline-continue-generate.js'), {
    window: continueRuntimeWindow,
    document: createFakeDocument(),
    AppState: continueRuntimeState,
    console,
    Date,
    AbortController,
    DOMException
});
const continuedOutline = continueRuntimeWindow.ZHIYU_OUTLINE_CONTINUE_GENERATE.finishOutlineContinueState(
    historicalOutline,
    '<think>new English reasoning</think>\n## 第1章：新内容',
    continueRuntimeSession
);
assert.doesNotMatch(continuedOutline, /<think>|English reasoning/, '续写完成态仍保留新旧 reasoning');
assert.equal(continueRuntimeSession.generatedContent, '\n## 第1章：新内容', '续写会话仍保存未清理的模型输出');

const utilsDocument = createFakeDocument();
const utilsWindow = {
    document: utilsDocument,
    navigator: { maxTouchPoints: 0 },
    screen: { width: 1600, height: 1000 },
    innerWidth: 1600,
    innerHeight: 1000,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener() {},
    requestAnimationFrame: () => 1,
    console
};
vm.runInNewContext(read('scripts/core/app-utils.js'), {
    window: utilsWindow,
    document: utilsDocument,
    Date: FixedShanghaiDate,
    console
});
assert.equal(
    utilsWindow.ZHIYU_UTILS.formatDate('2026-08-23T17:10:44Z'),
    '2026-08-24',
    '日期显示仍使用 UTC，东八区凌晨会显示成前一天'
);
assert.equal(utilsWindow.ZHIYU_UTILS.formatDate('2026-08-23'), '2026-08-23', '纯日期值不应再次做时区换算');
for (const timestamp of [fixedNow, String(fixedNow), Math.floor(fixedNow / 1000), String(Math.floor(fixedNow / 1000))]) {
    assert.equal(utilsWindow.ZHIYU_UTILS.formatDate(timestamp), '2026-08-24', `时间戳格式未按本地日期显示：${timestamp}`);
}

const wordCountStorage = new Map();
const wordCountDocument = createFakeDocument();
const wordCountWindow = {
    document: wordCountDocument,
    ZHIYU_APP_STATE: { chapter: {} },
    ZHIYU_UTILS: utilsWindow.ZHIYU_UTILS
};
vm.runInNewContext(read('scripts/core/app-word-count.js'), {
    window: wordCountWindow,
    document: wordCountDocument,
    localStorage: {
        getItem: key => wordCountStorage.get(key) ?? null,
        setItem: (key, value) => wordCountStorage.set(key, value)
    },
    console
});
assert.equal(wordCountWindow.countWords('<p>&amp;&lt;&#39;&quot;潮雾</p>'), 2, 'HTML 转义符仍被当成英文字母计数');
assert.equal(wordCountWindow.countWords('<p>&amp;lt;潮雾</p>'), 4, '二次转义的可见实体文本被重复解码');

const overviewContent = '<p>潮雾</p><p><br></p><p>归潮巷。</p>';
const overviewBook = {
    updatedAt: '2026-08-23T17:10:44Z',
    volumes: [
        {
            title: '第一卷',
            chapters: [
                { name: '旧章节', content: '<p>旧章</p>', updatedAt: '2026-08-23T20:00:00+08:00' },
                { name: '第一章', content: overviewContent, updatedAt: String(Math.floor(fixedNow / 1000)) }
            ]
        },
        { title: '参考文件', chapters: [{ name: '设定', content: '<p>不应计入正文统计的参考文字</p>', updatedAt: '2026-08-23T17:10:44Z' }] }
    ]
};
const overviewDocument = createFakeDocument();
const overviewWindow = {
    ZHIYU_APP_STATE: { ui: {} },
    ZHIYU_UTILS: utilsWindow.ZHIYU_UTILS,
    ZHIYU_STORAGE_SERVICE: { getBooks: () => ({ 雾港夜巡: overviewBook }) },
    countWords: wordCountWindow.countWords
};
vm.runInNewContext(read('scripts/core/app-overview-summary.js'), {
    window: overviewWindow,
    document: overviewDocument,
    Date: FixedShanghaiDate,
    console
});
assert.equal(overviewWindow.getOverviewChapterTarget(overviewBook).words, 5, '总览最近章节仍把 HTML 标签计入字数');
assert.equal(overviewWindow.getOverviewChapterTarget(overviewBook).name, '第一章', '混合时间格式导致最近章节排序错误');
assert.equal(overviewWindow.getOverviewBookEditRows('雾港夜巡', overviewBook)[0].words, 5, '总览编辑表与正文使用了不同字数算法');
assert.equal(overviewWindow.getOverviewBookEditRows('雾港夜巡', overviewBook)[0].chapterName, '第一章', '编辑表混合时间格式排序错误');
const overviewDays = overviewWindow.getOverviewSixDayData();
assert.equal(overviewDays.at(-1).key, '2026-08-24', '近六日图表最后一天不是用户本地日期');
assert.equal(overviewDays.at(-1).words, 5, '近六日图表没有使用正文有效字数');
assert.equal(wordCountWindow.updateWordCount(overviewBook), 7, '作品总字数没有排除参考文件');

const statsBooks = {
    今天: { lastWriteDate: '2026-08-23T17:05:00Z', volumes: [{ title: '正文', chapters: [{ content: overviewContent }] }] },
    昨天: { lastWriteDate: '2026-08-22T17:05:00Z', volumes: [] }
};
const statsDocument = createFakeDocument();
const statsStorage = new Map();
const statsWindow = {
    document: statsDocument,
    addEventListener() {},
    ZHIYU_UTILS: utilsWindow.ZHIYU_UTILS,
    countWords: wordCountWindow.countWords,
    AccountDataScope: {
        getActiveUid: () => 'guest',
        key: (base, uid = 'guest') => `${base}:${uid}`
    }
};
vm.runInNewContext(read('scripts/core/app-write-stats.js'), {
    window: statsWindow,
    document: statsDocument,
    Date: FixedShanghaiDate,
    StorageService: { getBooks: () => statsBooks },
    localStorage: {
        getItem: key => statsStorage.get(key) ?? null,
        setItem: (key, value) => statsStorage.set(key, value)
    },
    setInterval() {},
    console
});
statsWindow.recordChapterWritingChange('', overviewContent, '2026-08-23T17:05:00Z', { chapterKey: 'today' });
statsWindow.recordChapterWritingChange('', '<p>旧章文</p>', '2026-08-22T17:05:00Z', { chapterKey: 'yesterday' });
const localStats = statsWindow.getWriteStats();
assert.equal(localStats.todayWords, 5, '今日字数仍按 UTC 日期归档');
assert.equal(localStats.streak, 2, '连续写作天数没有按本地日期计算');
assert.equal(localStats.totalWords, 5, '全部字数没有按真实正文重新统计');

statsStorage.clear();
const saveFlowBooks = {
    测试作品: { volumes: [{ title: '第一卷', chapters: [{ name: '第一章', content: '' }] }] }
};
let saveBooksHandler = async () => true;
const saveFlowDocument = createFakeDocument();
const saveFlowWindow = {
    document: saveFlowDocument,
    ZHIYU_APP_STATE: { chapter: { book: '测试作品', vi: 0, ci: 0 } },
    ZHIYU_STORAGE_SERVICE: { saveBooks: (...args) => saveBooksHandler(...args) },
    AccountDataScope: { getActiveUid: () => 'guest' },
    gB: () => saveFlowBooks,
    isBlankChapterContent: value => !wordCountWindow.getChapterContentPlainText(value),
    wouldBlankOverwriteExisting: wordCountWindow.wouldBlankOverwriteExisting,
    countWords: wordCountWindow.countWords,
    recordChapterWritingChange: statsWindow.recordChapterWritingChange,
    clearDraftDurably: async () => true,
    updateWordCount: wordCountWindow.updateWordCount
};
vm.runInNewContext(read('scripts/core/app-editor-content.js'), {
    window: saveFlowWindow,
    document: saveFlowDocument,
    Date: FixedShanghaiDate,
    console
});
let preparedSave = saveFlowWindow.prepareChapterContentForLocalSave('测试作品', 0, 0, '<p>潮雾</p>', { books: saveFlowBooks });
assert.equal((await saveFlowWindow.persistPreparedChapter(preparedSave)).ok, true, '正文保存链路失败');
assert.equal(statsWindow.getWriteStats().todayWords, 2, '成功保存没有记录真实新增字数');
preparedSave = saveFlowWindow.prepareChapterContentForLocalSave('测试作品', 0, 0, '<p>潮雾港</p>', { books: saveFlowBooks });
assert.equal((await saveFlowWindow.persistPreparedChapter(preparedSave)).ok, true, '正文增量保存失败');
assert.equal(statsWindow.getWriteStats().todayWords, 3, '重复保存按整章累计而不是按净增量累计');
const savedTimestamp = saveFlowBooks.测试作品.updatedAt;
saveBooksHandler = async () => false;
preparedSave = saveFlowWindow.prepareChapterContentForLocalSave('测试作品', 0, 0, '<p>潮雾港灯</p>', { books: saveFlowBooks });
assert.equal((await saveFlowWindow.persistPreparedChapter(preparedSave)).ok, false, '失败保存被误报成功');
assert.equal(saveFlowBooks.测试作品.volumes[0].chapters[0].content, '<p>潮雾港</p>', '失败保存没有恢复原正文');
assert.equal(saveFlowBooks.测试作品.updatedAt, savedTimestamp, '失败保存没有恢复作品时间');
assert.equal(statsWindow.getWriteStats().todayWords, 3, '失败保存仍然增加了今日字数');

statsStorage.clear();
statsWindow.recordChapterWritingChange('<p>潮雾港灯</p>', '<p>潮雾</p>', '2026-08-23T17:05:00Z', { chapterKey: 'delete-restore' });
assert.equal(statsWindow.getWriteStats().todayWords, 0, '当日删减正文不应显示负数');
statsWindow.recordChapterWritingChange('<p>潮雾</p>', '<p>潮雾港灯</p>', '2026-08-23T17:05:00Z', { chapterKey: 'delete-restore' });
assert.equal(statsWindow.getWriteStats().todayWords, 0, '先删后恢复被错误统计为正向新增');

statsStorage.clear();
const concurrentBooks = {
    并发作品: { volumes: [{ title: '第一卷', chapters: [{ name: '第一章', content: '' }] }] }
};
const pendingSaves = [];
saveBooksHandler = () => new Promise(resolve => pendingSaves.push(resolve));
const preparedA = saveFlowWindow.prepareChapterContentForLocalSave('并发作品', 0, 0, '<p>潮雾</p>', { books: concurrentBooks });
const savingA = saveFlowWindow.persistPreparedChapter(preparedA);
const preparedB = saveFlowWindow.prepareChapterContentForLocalSave('并发作品', 0, 0, '<p>潮雾港</p>', { books: concurrentBooks });
const savingB = saveFlowWindow.persistPreparedChapter(preparedB);
assert.equal(pendingSaves.length, 2, '并发保存测试没有进入两个独立持久化任务');
pendingSaves[1](true);
assert.equal((await savingB).ok, true, '后发保存失败');
pendingSaves[0](true);
assert.equal((await savingA).superseded, true, '先发保存没有被标记为已取代');
assert.equal(statsWindow.getWriteStats().todayWords, 3, '自动保存与手动保存重叠时丢失前一段增量');

statsStorage.clear();
const draftCleanupBooks = {
    草稿作品: { volumes: [{ title: '第一卷', chapters: [{ name: '第一章', content: '' }] }] }
};
saveBooksHandler = async () => true;
saveFlowWindow.clearDraftDurably = async () => { throw new Error('模拟草稿清理失败'); };
const preparedDraftCleanup = saveFlowWindow.prepareChapterContentForLocalSave('草稿作品', 0, 0, '<p>潮雾</p>', { books: draftCleanupBooks });
const draftCleanupResult = await saveFlowWindow.persistPreparedChapter(preparedDraftCleanup);
assert.equal(draftCleanupResult.ok, true, '草稿清理失败不应推翻已成功的正文保存');
assert.equal(draftCleanupResult.draftCleared, false, '草稿清理失败没有返回警告状态');
assert.equal(statsWindow.getWriteStats().todayWords, 2, '正文成功但草稿清理失败时漏记今日字数');

const polishActions = read('scripts/core/app-polish-actions.js');
const historyVersions = read('scripts/core/app-history-versions.js');
const saveActions = read('scripts/core/app-save-actions.js');
assert.match(polishActions, /prepareChapterContentForLocalSave[\s\S]*persistPreparedChapter/, '确定使用入口没有走统一正文保存链路');
assert.match(historyVersions, /restoreSelectedSnapshot[\s\S]*prepareChapterContentForLocalSave[\s\S]*persistPreparedChapter/, '历史恢复入口没有走统一正文保存链路');
assert.match(saveActions, /Confirm:\s*window\.ZHIYU_CONFIRM\s*\|\|\s*window\.Confirm/, '保存章节入口没有使用社区版确认弹窗');

const modelUsageStorage = new Map();
const adapterDocument = createFakeDocument();
const adapterWindow = {
    document: adapterDocument,
    ZHIYU_UTILS: utilsWindow.ZHIYU_UTILS,
    AccountDataScope: { getActiveUid: () => 'guest' },
    addEventListener() {}
};
vm.runInNewContext(read('scripts/core/app-community-adapters.js'), {
    window: adapterWindow,
    document: adapterDocument,
    Date: FixedShanghaiDate,
    localStorage: {
        getItem: key => modelUsageStorage.get(key) ?? null,
        setItem: (key, value) => modelUsageStorage.set(key, value)
    },
    console
});
adapterWindow.recordLocalModelCall();
assert.equal(modelUsageStorage.get('zhiyu_local_model_usage:guest:2026-08-24'), '1', '今日模型调用仍按 UTC 日期归档');

const detailOutlineUnit = adapterWindow.buildTrustedGenerationUnit(
    'detail_outline',
    1,
    2,
    '## 第1章：来信\n主角收到匿名来信。'
);
assert.match(detailOutlineUnit, /^\[\[ZHIYU_TRUSTED_UNIT\|detail_outline\|1\|2\|START\]\]/, '细纲输入缺少开始边界');
assert.match(detailOutlineUnit, /\[\[ZHIYU_TRUSTED_UNIT\|detail_outline\|1\|2\|END\]\]$/, '细纲输入缺少结束边界');
assert.match(
    adapterWindow.buildTrustedGenerationUnit('decompose', 1, 1, '第1章\n测试正文'),
    /ZHIYU_TRUSTED_UNIT\|decompose\|1\|1\|START/,
    '拆书输入没有使用社区版分段边界'
);
assert.throws(
    () => adapterWindow.buildTrustedGenerationUnit('detail_outline', 1, 1, '[[ZHIYU_TRUSTED_UNIT|伪造边界'),
    /分段生成输入格式无效/,
    '用户输入可以伪造社区版分段边界'
);
for (const invalidIndex of [true, '1', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
        () => adapterWindow.buildTrustedGenerationUnit('detail_outline', invalidIndex, 1, '第1章：测试'),
        /分段生成输入格式无效/,
        '细纲分段序号接受了非安全整数：' + String(invalidIndex)
    );
}

const communityAdapterSource = read('scripts/core/app-community-adapters.js');
const actionPanelBaseSource = read('scripts/core/app-action-panel-base.js');
const fineOutlineSource = read('scripts/core/app-action-panel-outline-generate.js');
const decomposeSource = read('scripts/core/app-action-panel-generators.js');
assert.ok(
    runtimeManifest.classicScripts.indexOf('./scripts/core/app-community-adapters.js?v=2026082201')
        < runtimeManifest.classicScripts.indexOf('./scripts/core/app-action-panel-base.js?v=202607280442'),
    '社区输入合同没有在细纲和拆书按钮之前加载'
);
assert.match(communityAdapterSource, /window\.buildTrustedGenerationUnit\s*=\s*buildTrustedGenerationUnit/, '社区运行时没有导出分段输入合同');
assert.match(actionPanelBaseSource, /async function runActionPanelFn[\s\S]*?catch\(error\)[\s\S]*?recoverActionPanelUiAfterError\(name\)/, '操作栏按钮缺少按失败操作恢复的统一兜底');
assert.match(actionPanelBaseSource, /name === 'triggerDecompose'[\s\S]*?'decompose'[\s\S]*?name === 'doOGSend'[\s\S]*?'fineOutline'/, '统一失败兜底没有固定映射到实际生成任务');
assert.match(actionPanelBaseSource, /if \(!tab\) return;/, '保存失败仍可能清空正在运行的生成任务');

const actionRunnerStart = actionPanelBaseSource.indexOf('function getActionPanelFn(name)');
const actionRunnerEnd = actionPanelBaseSource.indexOf('function refreshActionSendTitle()', actionRunnerStart);
assert.ok(actionRunnerStart >= 0 && actionRunnerEnd > actionRunnerStart, '无法提取操作栏按钮执行器做动态回归测试');
const actionRunnerState = {
    outlineGen: {
        activeTab: 'fineOutline',
        ogAbortController: null,
        dcAbortController: null,
        apAbortController: null
    }
};
function createActionRunnerBox() {
    const classes = new Set(['generating']);
    return {
        classes,
        classList: {
            add(name) { classes.add(name); },
            remove(name) { classes.delete(name); }
        }
    };
}
const actionRunnerBoxes = {
    ogContentBox: createActionRunnerBox(),
    dcContentBox: createActionRunnerBox(),
    apContentBox: createActionRunnerBox()
};
const actionRunnerLogs = [];
const actionRunnerToasts = [];
const actionRunnerWorkingCalls = [];
const actionRunnerWindow = {
    setOGSendWorking(value) { actionRunnerWorkingCalls.push(value); },
    isAbortLikeError(error) { return error?.name === 'AbortError'; },
    formatAiErrorForDisplay(error, label) { return label + '：' + error.message; }
};
const actionRunnerContext = vm.createContext({
    window: actionRunnerWindow,
    document: {
        getElementById(id) { return actionRunnerBoxes[id] || null; }
    },
    ACTION_PANEL_APP_STATE: actionRunnerState,
    ACTION_PANEL_UTILS: {
        appendLog(_id, message, level) { actionRunnerLogs.push({ message, level }); }
    },
    ACTION_PANEL_TOAST: {
        warn(message) { actionRunnerToasts.push({ type: 'warn', message }); },
        error(message) { actionRunnerToasts.push({ type: 'error', message }); }
    },
    console
});
vm.runInContext(
    actionPanelBaseSource.slice(actionRunnerStart, actionRunnerEnd),
    actionRunnerContext,
    { filename: 'app-action-panel-runner-test.js' }
);
function resetActionRunnerObservations() {
    actionRunnerLogs.length = 0;
    actionRunnerToasts.length = 0;
    actionRunnerWorkingCalls.length = 0;
}

// 真实执行按钮绑定和失败兜底：保存失败不能伤及仍在生成的任务。
{
    resetActionRunnerObservations();
    const liveFineController = { id: 'fine-live' };
    actionRunnerState.outlineGen.activeTab = 'fineOutline';
    actionRunnerState.outlineGen.ogAbortController = liveFineController;
    actionRunnerWindow.saveOGToMemory = function() { throw new Error('模拟本地保存失败'); };
    const saveButton = {};
    actionRunnerContext.bindActionPanelButton(saveButton, 'saveOGToMemory');
    await saveButton.onclick();
    assert.strictEqual(actionRunnerState.outlineGen.ogAbortController, liveFineController, '保存失败清掉了正在运行的细纲任务');
    assert.deepEqual(actionRunnerWorkingCalls, [], '保存失败错误恢复了生成按钮');
    assert.equal(actionRunnerToasts.filter(item => item.type === 'error').length, 1, '保存失败没有且仅显示一次错误');
    assert.equal(actionRunnerLogs.filter(item => item.level === 'error').length, 1, '保存失败没有且仅记录一次错误');
}

// 拆书迟到失败时即使切到细纲，也只能清理拆书，不能清理新启动的细纲。
{
    resetActionRunnerObservations();
    const liveFineController = { id: 'fine-live-after-switch' };
    actionRunnerState.outlineGen.activeTab = 'decompose';
    actionRunnerState.outlineGen.dcAbortController = { id: 'decompose-failed' };
    actionRunnerBoxes.dcContentBox.classList.add('generating');
    actionRunnerBoxes.ogContentBox.classList.add('generating');
    actionRunnerWindow.triggerDecompose = async function() {
        actionRunnerState.outlineGen.activeTab = 'fineOutline';
        actionRunnerState.outlineGen.ogAbortController = liveFineController;
        throw new Error('模拟拆书迟到失败');
    };
    const decomposeButton = {};
    actionRunnerContext.bindActionPanelButton(decomposeButton, 'triggerDecompose');
    await decomposeButton.onclick();
    assert.equal(actionRunnerState.outlineGen.dcAbortController, null, '拆书迟到失败后没有清理拆书控制器');
    assert.strictEqual(actionRunnerState.outlineGen.ogAbortController, liveFineController, '拆书迟到失败清掉了细纲控制器');
    assert.equal(actionRunnerBoxes.dcContentBox.classes.has('generating'), false, '拆书迟到失败后仍保持忙碌样式');
    assert.equal(actionRunnerBoxes.ogContentBox.classes.has('generating'), true, '拆书迟到失败清掉了细纲忙碌样式');
    assert.deepEqual(actionRunnerWorkingCalls, [], '隐藏的拆书失败错误恢复了当前细纲按钮');
    assert.equal(actionRunnerToasts.filter(item => item.type === 'error').length, 1, '拆书迟到失败没有且仅显示一次错误');
    assert.equal(actionRunnerLogs.filter(item => item.level === 'error').length, 1, '拆书迟到失败没有且仅记录一次错误');
}

// 当前标签与失败任务一致时，按钮、控制器和忙碌样式必须一起恢复。
for (const failureCase of [
    { name: 'doOGSend', tab: 'fineOutline', controllerKey: 'ogAbortController', boxId: 'ogContentBox' },
    { name: 'triggerDecompose', tab: 'decompose', controllerKey: 'dcAbortController', boxId: 'dcContentBox' },
    { name: 'startNaturalize', tab: 'aiPolish', controllerKey: 'apAbortController', boxId: 'apContentBox' }
]) {
    resetActionRunnerObservations();
    actionRunnerState.outlineGen.activeTab = failureCase.tab;
    actionRunnerState.outlineGen[failureCase.controllerKey] = { id: failureCase.name + '-failed' };
    actionRunnerBoxes[failureCase.boxId].classList.add('generating');
    actionRunnerWindow[failureCase.name] = async function() { throw new Error('模拟生成失败'); };
    const actionButton = {};
    actionRunnerContext.bindActionPanelButton(actionButton, failureCase.name);
    await actionButton.onclick();
    assert.equal(actionRunnerState.outlineGen[failureCase.controllerKey], null, failureCase.name + ' 失败后控制器未清理');
    assert.equal(actionRunnerBoxes[failureCase.boxId].classes.has('generating'), false, failureCase.name + ' 失败后仍保持忙碌样式');
    assert.deepEqual(actionRunnerWorkingCalls, [false], failureCase.name + ' 失败后按钮没有恢复');
    assert.equal(actionRunnerToasts.filter(item => item.type === 'error').length, 1, failureCase.name + ' 没有且仅显示一次错误');
    assert.equal(actionRunnerLogs.filter(item => item.level === 'error').length, 1, failureCase.name + ' 没有且仅记录一次错误');
}

const fineOutlineTryIndex = fineOutlineSource.indexOf('try {', fineOutlineSource.indexOf('async function doGenerateOutline'));
const fineOutlineContractIndex = fineOutlineSource.indexOf('buildTrustedGenerationUnit', fineOutlineSource.indexOf('async function doGenerateOutline'));
assert.ok(fineOutlineTryIndex >= 0 && fineOutlineTryIndex < fineOutlineContractIndex, '细纲准备过程没有进入错误处理');
const decomposeTryIndex = decomposeSource.indexOf('try {', decomposeSource.indexOf('async function triggerDecompose'));
const decomposeContractIndex = decomposeSource.indexOf('buildTrustedGenerationUnit', decomposeSource.indexOf('async function triggerDecompose'));
assert.ok(decomposeTryIndex >= 0 && decomposeTryIndex < decomposeContractIndex, '拆书准备过程没有进入错误处理');

const githubSetup = read('GITHUB-SETUP.md');
const securityPolicy = read('SECURITY.md');
const prePublicSetup = githubSetup.match(/## 公开前\s*([\s\S]*?)(?=\n## )/)?.[1] || '';
assert.doesNotMatch(prePublicSetup, /Private vulnerability reporting/, '公开清单仍要求在 Private 仓库开启仅限 Public 的漏洞报告入口');
assert.match(githubSetup, /改为 Public 后立即完成[\s\S]*Private vulnerability reporting/, '公开后缺少立即开启私密漏洞报告的步骤');
assert.doesNotMatch(securityPolicy, /设为 Public 前启用 GitHub Private vulnerability reporting/, '安全政策仍包含无法执行的设置顺序');

console.log('[smoke:community-local-core] PASS 本机写作入口、新版操作引导、原版响应式样式、历史版本、模板隐私和自备 API 边界均通过');
