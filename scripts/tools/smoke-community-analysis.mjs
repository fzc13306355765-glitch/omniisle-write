import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const store = new Map();
const calls = [];
let activeWriteToken = null;
const localValues = new Map();
let taskTokenSequence = 0;
let failNextModelCall = false;

function copy(value) {
    return value === undefined ? undefined : structuredClone(value);
}

const idb = {
    async get(key) { return copy(store.get(String(key))); },
    async set(key, value) { store.set(String(key), copy(value)); return true; },
    async setMany(entries) {
        for (const [key, value] of entries) store.set(String(key), copy(value));
        return true;
    },
    async remove(key) { store.delete(String(key)); return true; }
};

function segmentReply(prompt) {
    const numbers = Array.from(new Set(Array.from(String(prompt).matchAll(/全书流水章号：第(\d+)章/g)).map(match => Number(match[1]))));
    assert.ok(numbers.length > 0, '正文分段提示词必须包含全书流水章号');
    return [
        '### FILE: 章节梗概',
        ...numbers.flatMap(number => [
            `## 第${number}章 测试章节${number}`,
            `剧情：第${number}章发生了可核实的测试事件。`,
            `章末：第${number}章事件已经结束。`
        ]),
        '### FILE: 资料事实',
        '## 设定事实',
        '测试世界遵守原文规则。',
        '## 信息事实',
        '测试地点持续存在。',
        '## 角色候选与长期关系证据',
        '主角仍然存活。'
    ].join('\n');
}

function modelReply(prompt) {
    const text = String(prompt || '');
    if (text.includes('### FILE: 章节梗概')) return segmentReply(text);
    if (text.includes('### FILE: 资料事实汇总')) {
        return '### FILE: 资料事实汇总\n## 设定事实\n测试世界遵守原文规则。\n## 信息事实\n测试地点持续存在。\n## 角色候选与长期关系证据\n主角仍然存活。';
    }
    if (text.includes('### FILE: 设定集') && text.includes('### FILE: 角色列表')) {
        return [
            '### FILE: 设定集',
            '# 设定集\n\n## 世界观\n测试世界遵守原文规则。',
            '### FILE: 信息表',
            '# 信息表\n\n## 地点\n| 名称 | 状态 | 说明 |\n| --- | --- | --- |\n| 测试地点 | 存在 | 原文确认 |',
            '### FILE: 角色列表',
            '# 角色列表\n\n## 角色资料\n| 角色 | 性别 | 身份/定位 | 所属势力 | 核心目标 | 对话风格 | 当前状态 | 写作提醒 |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n| 主角 | — | 主角 | — | 推进剧情 | 简洁 | 存活 | 保持连续 |\n\n## 角色关系\n暂无'
        ].join('\n');
    }
    if (text.includes('### FILE: 追踪表') && text.includes('### FILE: 承接卡')) {
        return [
            '### FILE: 追踪表',
            '# 追踪表\n\n## 长期未结事项\n暂无\n\n| 章节 | 事项 |\n| --- | --- |\n| 第1章 | 测试事项 |',
            '### FILE: 边界卡',
            '# 边界卡\n\n## 当前有效边界\n遵守原文规则。\n\n| 章节 | 边界 |\n| --- | --- |\n| 第1章 | 不得虚构 |',
            '### FILE: 承接卡',
            '# 承接卡\n\n## 当前承接\n测试事件结束。\n\n| 章节 | 承接 |\n| --- | --- |\n| 第1章 | 继续下一事件 |'
        ].join('\n');
    }
    throw new Error('测试模型收到未知提示词');
}

const sandbox = {
    console,
    structuredClone,
    TextEncoder,
    TextDecoder,
    Blob,
    URL,
    Date,
    Math,
    JSON,
    Object,
    Array,
    Map,
    Set,
    Promise,
    Error,
    AbortController,
    DOMException,
    navigator: {
        storage: {
            async estimate() { return { quota: 1024 * 1024 * 1024, usage: 0 }; },
            async persisted() { return true; }
        }
    },
    crypto: { randomUUID() { taskTokenSequence += 1; return 'smoke-task-token-' + taskTokenSequence; } },
    localStorage: {
        getItem(key) { return localValues.has(String(key)) ? localValues.get(String(key)) : null; },
        setItem(key, value) { localValues.set(String(key), String(value)); },
        removeItem(key) { localValues.delete(String(key)); }
    },
    ZHIYU_IDB: idb,
    ZHIYU_ACCOUNT_WRITE_LEASE: {
        beginWrite(uid) {
            if (activeWriteToken) return null;
            activeWriteToken = { uid: String(uid), tabId: 'smoke-tab', leaseId: 'smoke-lease' };
            return activeWriteToken;
        },
        isWriteTokenCurrent(token) { return token === activeWriteToken; },
        endWrite(token) { if (token === activeWriteToken) activeWriteToken = null; return true; },
        canWrite() { return activeWriteToken === null; }
    },
    AccountDataScope: { getActiveUid() { return 'community-test-user'; } },
    ZHIYU_COMMUNITY_RUNTIME: { getLocalIdentity() { return { uid: 'community-test-user' }; } },
    getSelectedModelConfig() {
        return {
            name: '测试自备模型',
            base: 'https://model.example.test/v1',
            model: 'test-model',
            protocol: 'openai',
            key: 'test-only-key'
        };
    },
    async callLLMAPI(config, systemPrompt, userPrompt, model, options) {
        assert.ok(options?.signal, '每次模型请求必须带可暂停信号');
        if (options.signal.aborted) throw new DOMException('测试中断', 'AbortError');
        calls.push(String(userPrompt));
        if (failNextModelCall) {
            failNextModelCall = false;
            const error = new Error('测试模拟返回流中断');
            error.code = 'AI_STREAM_INCOMPLETE';
            throw error;
        }
        return { content: [{ text: modelReply(userPrompt) }] };
    },
    async fetch() { throw new Error('社区全文分析执行器不能直接请求知屿或其他后端'); }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const relativePath of [
    'scripts/core/app-full-text-analysis-core.js',
    'scripts/core/app-import-full-analysis-schema.js',
    'scripts/core/app-import-full-analysis-langextract-chunker.js',
    'scripts/core/app-import-full-analysis-plan.js',
    'scripts/core/app-import-full-analysis-checkpoint-store.js',
    'scripts/core/app-full-text-analysis-community-engine.js'
]) {
    vm.runInContext(fs.readFileSync(path.join(root, relativePath), 'utf8'), sandbox, { filename: relativePath });
}

const engine = sandbox.ZhiyuCommunityFullAnalysisEngine;
assert.ok(engine, '社区全文分析执行器必须成功加载');

assert.throws(
    () => engine.parseSegmentResult([
        '### FILE: 章节梗概',
        '## 第1章 正常章节',
        '剧情：正常事实。',
        '章末：正常结束。',
        '## 第999章 虚构章节',
        '剧情：虚构事实。',
        '章末：虚构结束。',
        '### FILE: 资料事实',
        '无'
    ].join('\n'), [1]),
    /未要求的第 999 章/,
    '模型额外虚构的章号必须被拒绝'
);

function chapters(count, prefix) {
    return Array.from({ length: count }, (_, index) => ({
        id: `${prefix}-${index + 1}`,
        title: `第${index + 1}章 测试章节${index + 1}`,
        volumeName: index < 10 ? '第一卷' : '第二卷',
        content: `这是第${index + 1}章的测试正文。主角完成了第${index + 1}件事。`,
        _importOriginalIndex: index,
        selected: true
    }));
}

const automatic = await engine.createTask({
    bookName: '自动分析测试',
    bookType: 'novel',
    chapters: chapters(2, 'auto')
}, { mode: 'automatic', analysisScope: { mode: 'all' } });
assert.equal(Object.prototype.hasOwnProperty.call(automatic.task.model, 'key'), false, '任务检查点不能保存用户 API Key');
const automaticResult = await engine.runTask(automatic.task.ownerId, automatic.task.taskId, {
    signal: new AbortController().signal,
    shouldPause: () => false,
    shouldSkip: () => false,
    shouldStop: () => false
});
assert.equal(automaticResult.task.status, 'completed_unsaved');
const final = await engine.getFinalResult(automatic.task.ownerId, automatic.task.taskId);
assert.deepEqual(Object.keys(final.files).sort(), [...engine.RESULT_FILE_NAMES].sort());
for (const name of engine.RESULT_FILE_NAMES) assert.ok(String(final.files[name]).trim(), `${name} 不能为空`);
const callsAfterAutomatic = calls.length;
await engine.runTask(automatic.task.ownerId, automatic.task.taskId, {
    signal: new AbortController().signal,
    shouldPause: () => false,
    shouldSkip: () => false,
    shouldStop: () => false
});
assert.equal(calls.length, callsAfterAutomatic, '已完成任务不能重复调用模型');

const staged = await engine.createTask({
    bookName: '分阶段恢复测试',
    bookType: 'novel',
    chapters: chapters(11, 'staged')
}, { mode: 'staged', analysisScope: { mode: 'all' } });
const segmentCallsBefore = calls.filter(prompt => prompt.includes('### FILE: 章节梗概')).length;
const firstStage = await engine.runTask(staged.task.ownerId, staged.task.taskId, {
    signal: new AbortController().signal,
    shouldPause: () => false,
    shouldSkip: () => false,
    shouldStop: () => false
});
assert.equal(firstStage.task.status, 'paused');
assert.equal(firstStage.task.nextSegmentIndex, 1);
const secondStage = await engine.runTask(staged.task.ownerId, staged.task.taskId, {
    signal: new AbortController().signal,
    shouldPause: () => false,
    shouldSkip: () => false,
    shouldStop: () => false
});
assert.equal(secondStage.task.status, 'completed_unsaved');
const stagedSegmentCalls = calls.filter(prompt => prompt.includes('### FILE: 章节梗概')).length - segmentCallsBefore;
assert.equal(stagedSegmentCalls, 2, '恢复分阶段任务时已完成正文段不能重复调用模型');

const allTasks = await engine.listTasks('community-test-user');
assert.equal(allTasks.length, 2);
assert.ok(calls.every(prompt => !prompt.includes('/full-analysis/task/')), '模型提示词不能包含正式全文分析接口');

const ranged = await engine.createTask({
    bookName: '中段范围恢复测试',
    bookType: 'novel',
    chapters: chapters(12, 'range')
}, { mode: 'automatic', analysisScope: { mode: 'chapter', start: 5, end: 7 } });
const rangedResult = await engine.runTask(ranged.task.ownerId, ranged.task.taskId, {
    signal: new AbortController().signal,
    shouldPause: () => false,
    shouldSkip: () => false,
    shouldStop: () => false
});
assert.equal(rangedResult.task.status, 'completed_unsaved', '从中间章节开始的范围必须可以按冻结分段恢复并完成');
assert.equal((await engine.getFinalResult(ranged.task.ownerId, ranged.task.taskId)).sourceChapterCount, 3);

const responseRecovered = await engine.createTask({
    bookName: '响应落盘恢复测试',
    bookType: 'novel',
    chapters: chapters(1, 'response')
}, { mode: 'automatic', analysisScope: { mode: 'all' } });
const schema = sandbox.ZhiyuImportFullAnalysisSchema;
const checkpoint = sandbox.ZhiyuImportFullAnalysisCheckpointStore;
const recoveredStepKey = 'segment_1:attempt:1';
const recoveredRequest = {
    requestId: schema.makeStableId('request', [responseRecovered.task.taskId, recoveredStepKey]),
    stepKey: recoveredStepKey,
    status: 'dispatched',
    attempt: 1,
    model: responseRecovered.task.model,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
};
await checkpoint.saveRequest(responseRecovered.task.ownerId, responseRecovered.task.taskId, recoveredRequest);
await checkpoint.saveResponsePayload(
    responseRecovered.task.ownerId,
    responseRecovered.task.taskId,
    recoveredRequest,
    [
        '### FILE: 章节梗概',
        '## 第1章 测试章节1',
        '剧情：第1章发生了可核实的测试事件。',
        '章末：第1章事件已经结束。',
        '### FILE: 资料事实',
        '## 设定事实',
        '测试世界遵守原文规则。',
        '## 信息事实',
        '测试地点持续存在。',
        '## 角色候选与长期关系证据',
        '主角仍然存活。'
    ].join('\n')
);
const recoveredSegmentCallsBefore = calls.filter(prompt => prompt.includes('### FILE: 章节梗概')).length;
const recoveredTask = await engine.runTask(responseRecovered.task.ownerId, responseRecovered.task.taskId, {
    signal: new AbortController().signal,
    shouldPause: () => false,
    shouldSkip: () => false,
    shouldStop: () => false
});
assert.equal(recoveredTask.task.status, 'completed_unsaved');
assert.equal(
    calls.filter(prompt => prompt.includes('### FILE: 章节梗概')).length,
    recoveredSegmentCallsBefore,
    '模型响应已落盘但结果未提交时，恢复必须先复用响应，不能重复调用正文分析'
);

const unknownResponse = await engine.createTask({
    bookName: '结果未知确认测试',
    bookType: 'novel',
    chapters: chapters(1, 'unknown-response')
}, { mode: 'automatic', analysisScope: { mode: 'all' } });
const unknownStepKey = 'segment_1:attempt:1';
const unknownRequest = {
    requestId: schema.makeStableId('request', [unknownResponse.task.taskId, unknownStepKey]),
    stepKey: unknownStepKey,
    status: 'dispatched',
    attempt: 1,
    model: unknownResponse.task.model,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
};
await checkpoint.saveRequest(unknownResponse.task.ownerId, unknownResponse.task.taskId, unknownRequest);
const unknownCallsBefore = calls.length;
await assert.rejects(
    engine.runTask(unknownResponse.task.ownerId, unknownResponse.task.taskId, {
        signal: new AbortController().signal,
        shouldPause: () => false,
        shouldSkip: () => false,
        shouldStop: () => false
    }),
    error => error?.code === 'FULL_ANALYSIS_RESPONSE_UNKNOWN',
    '结果未知的请求未经用户确认时必须停住'
);
assert.equal(calls.length, unknownCallsBefore, '结果未知且未确认时不能重新调用模型');
assert.equal((await engine.runTask(unknownResponse.task.ownerId, unknownResponse.task.taskId, {
    signal: new AbortController().signal,
    shouldPause: () => false,
    shouldSkip: () => false,
    shouldStop: () => false,
    approveUnknownResponseRetry: () => true
})).task.status, 'completed_unsaved');

const streamInterrupted = await engine.createTask({
    bookName: '断流确认测试',
    bookType: 'novel',
    chapters: chapters(1, 'stream-interrupted')
}, { mode: 'automatic', analysisScope: { mode: 'all' } });
failNextModelCall = true;
await assert.rejects(
    engine.runTask(streamInterrupted.task.ownerId, streamInterrupted.task.taskId, {
        signal: new AbortController().signal,
        shouldPause: () => false,
        shouldSkip: () => false,
        shouldStop: () => false
    }),
    error => error?.code === 'FULL_ANALYSIS_RESPONSE_UNKNOWN',
    '模型返回流中断后必须转为结果未知状态'
);
const callsAfterStreamFailure = calls.length;
await assert.rejects(
    engine.runTask(streamInterrupted.task.ownerId, streamInterrupted.task.taskId, {
        signal: new AbortController().signal,
        shouldPause: () => false,
        shouldSkip: () => false,
        shouldStop: () => false
    }),
    error => error?.code === 'FULL_ANALYSIS_RESPONSE_UNKNOWN',
    '断流后的请求未经确认不能自动重试'
);
assert.equal(calls.length, callsAfterStreamFailure, '断流后未确认时不能再次调用模型');
assert.equal((await engine.runTask(streamInterrupted.task.ownerId, streamInterrupted.task.taskId, {
    signal: new AbortController().signal,
    shouldPause: () => false,
    shouldSkip: () => false,
    shouldStop: () => false,
    approveUnknownResponseRetry: () => true
})).task.status, 'completed_unsaved');

const duplicateVolumeNumbers = await engine.createTask({
    bookName: '分卷重复章号测试',
    bookType: 'novel',
    chapters: [
        { id: 'dup-1', title: '第一章 卷一开篇', volumeName: '第一卷', content: '卷一正文。', _importOriginalIndex: 0, selected: true },
        { id: 'dup-2', title: '第一章 卷二开篇', volumeName: '第二卷', content: '卷二正文。', _importOriginalIndex: 1, selected: true }
    ]
}, { mode: 'automatic', analysisScope: { mode: 'all' } });
const duplicateVolumeResult = await engine.runTask(duplicateVolumeNumbers.task.ownerId, duplicateVolumeNumbers.task.taskId, {
    signal: new AbortController().signal,
    shouldPause: () => false,
    shouldSkip: () => false,
    shouldStop: () => false
});
assert.equal(duplicateVolumeResult.task.status, 'completed_unsaved');
assert.deepEqual(
    Array.from((await engine.getFinalResult(duplicateVolumeNumbers.task.ownerId, duplicateVolumeNumbers.task.taskId)).analyzedChapterNumbers),
    [1, 2],
    '不同分卷都从第一章开始时，全文分析仍必须使用不重复的全书流水章号'
);

const paused = await engine.createTask({
    bookName: '暂停恢复测试',
    bookType: 'novel',
    chapters: chapters(2, 'paused')
}, { mode: 'automatic', analysisScope: { mode: 'all' } });
const pausedCallsBefore = calls.length;
const pausedBundle = await engine.runTask(paused.task.ownerId, paused.task.taskId, {
    signal: new AbortController().signal,
    shouldPause: () => true,
    shouldSkip: () => false,
    shouldStop: () => false
});
assert.equal(pausedBundle.task.status, 'paused');
assert.equal(calls.length, pausedCallsBefore, '调用模型前暂停时不能产生 API 请求');
assert.equal((await engine.runTask(paused.task.ownerId, paused.task.taskId, {
    signal: new AbortController().signal,
    shouldPause: () => false,
    shouldSkip: () => false,
    shouldStop: () => false
})).task.status, 'completed_unsaved');

let skipPending = true;
const skipped = await engine.createTask({
    bookName: '跳过正文段测试',
    bookType: 'novel',
    chapters: chapters(11, 'skip')
}, { mode: 'automatic', analysisScope: { mode: 'all' } });
const skippedBundle = await engine.runTask(skipped.task.ownerId, skipped.task.taskId, {
    signal: new AbortController().signal,
    shouldPause: () => false,
    shouldSkip: () => skipPending,
    consumeSkip: () => { skipPending = false; },
    shouldStop: () => false
});
assert.equal(skippedBundle.task.status, 'completed_unsaved');
assert.deepEqual(Array.from(skippedBundle.task.skippedSegmentIndices), [0]);
assert.equal((await engine.getFinalResult(skipped.task.ownerId, skipped.task.taskId)).partial, true);

const stopped = await engine.createTask({
    bookName: '立即停止总结测试',
    bookType: 'novel',
    chapters: chapters(11, 'stop')
}, { mode: 'staged', analysisScope: { mode: 'all' } });
assert.equal((await engine.runTask(stopped.task.ownerId, stopped.task.taskId, {
    signal: new AbortController().signal,
    shouldPause: () => false,
    shouldSkip: () => false,
    shouldStop: () => false
})).task.status, 'paused');
const stopSegmentCallsBefore = calls.filter(prompt => prompt.includes('### FILE: 章节梗概')).length;
const stoppedBundle = await engine.runTask(stopped.task.ownerId, stopped.task.taskId, {
    signal: new AbortController().signal,
    shouldPause: () => false,
    shouldSkip: () => false,
    shouldStop: () => true
});
assert.equal(stoppedBundle.task.status, 'completed_unsaved');
assert.equal(calls.filter(prompt => prompt.includes('### FILE: 章节梗概')).length, stopSegmentCallsBefore);
assert.equal((await engine.getFinalResult(stopped.task.ownerId, stopped.task.taskId)).partial, true);

const interruptedStop = await engine.createTask({
    bookName: '中断后直接总结测试',
    bookType: 'novel',
    chapters: chapters(11, 'stop-abort')
}, { mode: 'staged', analysisScope: { mode: 'all' } });
assert.equal((await engine.runTask(interruptedStop.task.ownerId, interruptedStop.task.taskId, {
    signal: new AbortController().signal,
    shouldPause: () => false,
    shouldSkip: () => false,
    shouldStop: () => false
})).task.status, 'paused');
const interruptedSegmentCalls = calls.filter(prompt => prompt.includes('### FILE: 章节梗概')).length;
const abortedController = new AbortController();
abortedController.abort();
await assert.rejects(engine.runTask(interruptedStop.task.ownerId, interruptedStop.task.taskId, {
    signal: abortedController.signal,
    shouldPause: () => false,
    shouldSkip: () => false,
    shouldStop: () => true
}), error => error?.code === 'FULL_ANALYSIS_RESPONSE_UNKNOWN');
const interruptedCheckpoint = await engine.loadTask(interruptedStop.task.ownerId, interruptedStop.task.taskId);
assert.equal(interruptedCheckpoint.task.finalizeRequested, true, '立即停止意图必须写入检查点');
const interruptedCompleted = await engine.runTask(interruptedStop.task.ownerId, interruptedStop.task.taskId, {
    signal: new AbortController().signal,
    shouldPause: () => false,
    shouldSkip: () => false,
    shouldStop: () => false,
    approveUnknownResponseRetry: () => true
});
assert.equal(interruptedCompleted.task.status, 'completed_unsaved');
assert.equal(
    calls.filter(prompt => prompt.includes('### FILE: 章节梗概')).length,
    interruptedSegmentCalls,
    '立即停止后的恢复只能继续汇总，不能再次处理后续正文段'
);

const concurrent = await engine.createTask({
    bookName: '跨标签页互斥测试',
    bookType: 'novel',
    chapters: chapters(1, 'concurrent')
}, { mode: 'automatic', analysisScope: { mode: 'all' } });
const persistentLeaseKey = 'zhiyu:community-full-analysis:execution:'
    + encodeURIComponent(concurrent.task.ownerId) + ':' + encodeURIComponent(concurrent.task.taskId);
localValues.set(persistentLeaseKey, JSON.stringify({
    tokenId: 'other-tab-task-token',
    ownerId: concurrent.task.ownerId,
    taskId: concurrent.task.taskId,
    expiresAt: Date.now() + 60_000
}));
assert.equal(engine.isTaskExecutionActive(concurrent.task.ownerId, concurrent.task.taskId), true);
await assert.rejects(
    engine.runTask(concurrent.task.ownerId, concurrent.task.taskId, {
        signal: new AbortController().signal,
        shouldPause: () => false,
        shouldSkip: () => false,
        shouldStop: () => false
    }),
    error => error?.code === 'FULL_ANALYSIS_ANOTHER_TAB_ACTIVE',
    '账号写入权已恢复时，仍不能越过另一个标签页尚未过期的持久任务锁'
);
localValues.delete(persistentLeaseKey);
const firstRunner = engine.runTask(concurrent.task.ownerId, concurrent.task.taskId, {
    signal: new AbortController().signal,
    shouldPause: () => false,
    shouldSkip: () => false,
    shouldStop: () => false
});
await assert.rejects(
    engine.runTask(concurrent.task.ownerId, concurrent.task.taskId, {
        signal: new AbortController().signal,
        shouldPause: () => false,
        shouldSkip: () => false,
        shouldStop: () => false
    }),
    error => error?.code === 'FULL_ANALYSIS_ANOTHER_TAB_ACTIVE',
    '同一时间只能有一个全文分析执行者'
);
assert.equal((await firstRunner).task.status, 'completed_unsaved');

console.log('[smoke:community-full-analysis] PASS 自备模型、本机检查点、八文件生成和分阶段恢复均通过');
