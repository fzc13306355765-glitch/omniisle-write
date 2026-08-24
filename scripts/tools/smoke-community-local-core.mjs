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
    querySelector() { return null; }
});

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
assert.match(polishActions, /prepareChapterContentForLocalSave[\s\S]*persistPreparedChapter/, '确定使用入口没有走统一正文保存链路');
assert.match(historyVersions, /restoreSelectedSnapshot[\s\S]*prepareChapterContentForLocalSave[\s\S]*persistPreparedChapter/, '历史恢复入口没有走统一正文保存链路');

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

const githubSetup = read('GITHUB-SETUP.md');
const securityPolicy = read('SECURITY.md');
const prePublicSetup = githubSetup.match(/## 公开前\s*([\s\S]*?)(?=\n## )/)?.[1] || '';
assert.doesNotMatch(prePublicSetup, /Private vulnerability reporting/, '公开清单仍要求在 Private 仓库开启仅限 Public 的漏洞报告入口');
assert.match(githubSetup, /改为 Public 后立即完成[\s\S]*Private vulnerability reporting/, '公开后缺少立即开启私密漏洞报告的步骤');
assert.doesNotMatch(securityPolicy, /设为 Public 前启用 GitHub Private vulnerability reporting/, '安全政策仍包含无法执行的设置顺序');

console.log('[smoke:community-local-core] PASS 本机写作入口、新版操作引导、原版响应式样式、历史版本、模板隐私和自备 API 边界均通过');
