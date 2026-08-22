(function(window, document) {
    'use strict';

    function getDeps() {
        return {
            AppState: window.ZHIYU_APP_STATE || window.AppState,
            Utils: window.ZHIYU_UTILS || window.Utils,
            Toast: window.ZHIYU_TOAST || window.Toast,
            Modal: window.Modal,
            getPrevChapterEnd: window.getPrevChapterEnd,
            gB: window.gB,
            refreshTree: window.refreshTree,
            getRefFileContent: window.getRefFileContent,
            updateChapWordCount: window.updateChapWordCount,
            getSelectedModelConfig: window.getSelectedModelConfig,
            isCustomModel: window.isCustomModel,
            calcMaxTokensFromTemplate: window.calcMaxTokensFromTemplate,
            genTaskKey: window.genTaskKey,
            streamGenerate: window.streamGenerate,
            gA: window.gA,
            getAuthHeaders: window.getAuthHeaders,
            getRequestTier: window.getRequestTier,
            parseBackendErrorMessage: window.parseBackendErrorMessage,
            markChapterGenerating: window.markChapterGenerating
        };
    }

    function bindRewriteActions() {
        if (bindRewriteActions.bound) return;
        bindRewriteActions.bound = true;

        const {
            AppState,
            Utils,
            Toast,
            Modal,
            getPrevChapterEnd,
            gB,
            refreshTree,
            getRefFileContent,
            updateChapWordCount,
            getSelectedModelConfig,
            isCustomModel,
            calcMaxTokensFromTemplate,
            genTaskKey,
            streamGenerate,
            gA,
            getAuthHeaders,
            getRequestTier,
            parseBackendErrorMessage,
            markChapterGenerating
        } = getDeps();

                // ===== 局部重写 =====
                const getRewriteDirection = window.ZHIYU_REWRITE_MODAL_UI?.getRewriteDirection || function() { return 'tail'; };

                // Rewrite modal linked-file count UI is split into scripts/core/app-rewrite-modal-ui.js.

                // Rewrite modal direction UI is split into scripts/core/app-rewrite-modal-ui.js.

        // =================== Rewrite context module entry ===================
                // 局部重写读取上一章结尾上下文逻辑已拆到 scripts/core/app-rewrite-context.js。
                // Rewrite modal opening and linked-file picker entry are split into scripts/core/app-rewrite-modal-ui.js.

                document.getElementById('btnRWStart')?.addEventListener('click', async function() {
                    var rw = AppState.rewrite;
                    if (!rw) { Toast.warn('请先选中要重写的段落'); return; }

                    var bookName = AppState.chapter.book;
                    var vi = AppState.chapter.vi;
                    var ci = AppState.chapter.ci;
                    var editor = document.getElementById('resultBox');
                    var rewriteSnapshot = window.resolveRewriteSelectionSnapshot?.(
                        rw,
                        editor?.textContent || ''
                    );
                    if (!rewriteSnapshot) {
                        AppState.rewrite = null;
                        Toast.warn('正文或框选位置已发生变化，请重新框选要重写的段落');
                        return;
                    }
                    Modal.close('rewriteModal');

                    var fullContent = rewriteSnapshot.fullContent;
                    var beforeText = rewriteSnapshot.beforeText;
                    var afterText = rewriteSnapshot.afterText;
                    var linkedFiles = typeof window.getGenerationLinkedFilesForChapter === 'function'
                        ? window.getGenerationLinkedFilesForChapter(bookName, vi, ci)
                        : [];
                    var targetWords = parseInt(document.getElementById('rwTargetWords').value) || 2000;
                    if (targetWords < 100) targetWords = 2000;
                    var prevEnd = getPrevChapterEnd();
                    var plotDescription = (document.getElementById('rwPlotDescription').value || '').trim();

                    // 构建 prompt（三方向）
                    var dir = getRewriteDirection();
                    var systemPrompt = '';
                    var userMessage = '';

                    if (dir === 'head') {
                        systemPrompt = '## 角色与目标\n你是一名专业起点白金大神小说作家。现在请根据下文提供的"后文段落"，补齐章节前面的部分，要求开头衔接上一章结尾，结尾衔接后文段落开头。\n深度去AI模板化，删除所有空洞华丽辞藻、书面化语句、规整句式、首先其次最后等逻辑词。全部改用网文接地气大白话，短句居多、节奏飞快、通俗易懂。杜绝重复句式、杜绝流水账、杜绝假大空描写。保留所有核心剧情、爽点、人设、伏笔，行文自然流畅，完全达到真人作者手写水准。\n\n## 输出约束\n1. 请从"本章开头"直接开始写，严格保持叙事连贯，不得重复已有内容，也不得与下文出现矛盾。\n2. 文风、句式节奏、氛围基调与"后文段落"完全一致，禁止风格漂移。\n3. 保持人物行为一致，角色反应须符合其在前文中已建立的性格、动机与行为逻辑。\n4. 续写须有实质性情节推进：推进核心冲突、设置新悬念或深化角色关系。\n5. 直接输出续写正文，不要输出推理过程、分析注释或任何形式的说明文字。';
                    } else if (dir === 'mid') {
                        systemPrompt = '## 角色与目标\n你是一名专业起点白金大神小说作家。现在请根据上下文补齐章节中间的过渡部分，要求开头衔接前文，结尾衔接后文。\n深度去AI模板化，删除所有空洞华丽辞藻、书面化语句、规整句式、首先其次最后等逻辑词。全部改用网文接地气大白话，短句居多、节奏飞快、通俗易懂。杜绝重复句式、杜绝流水账、杜绝假大空描写。保留所有核心剧情、爽点、人设、伏笔，行文自然流畅，完全达到真人作者手写水准。\n\n## 输出约束\n1. 开头承接前文段落末尾，结尾自然过渡到后文段落开头。\n2. 文风、句式节奏、氛围基调与前后文完全一致，禁止风格漂移。\n3. 保持人物行为一致，角色反应须符合其在前后文中已建立的性格、动机与行为逻辑。\n4. 过渡须有实质性情节推进：推进核心冲突、设置新悬念或深化角色关系。\n5. 直接输出续写正文，不要输出推理过程、分析注释或任何形式的说明文字。';
                    } else {
                        systemPrompt = '## 角色与目标\n你是一名专业起点白金大神小说作家。现在请根据下文提供的"前文段落"，续写章节的后半部分。\n深度去AI模板化，删除所有空洞华丽辞藻、书面化语句、规整句式、首先其次最后等逻辑词。全部改用网文接地气大白话，短句居多、节奏飞快、通俗易懂。杜绝重复句式、杜绝流水账、杜绝假大空描写。保留所有核心剧情、爽点、人设、伏笔，行文自然流畅，完全达到真人作者手写水准。\n\n## 输出约束\n1. 请从"前文段落"的末尾句直接开始续写，严格保持叙事连贯，不得重复已有内容，也不得与上文出现矛盾。\n2. 文风、句式节奏、氛围基调与"前文段落"完全一致，禁止风格漂移。\n3. 保持人物行为一致，角色反应须符合其在前文中已建立的性格、动机与行为逻辑。\n4. 续写须有实质性情节推进：推进核心冲突、设置新悬念或深化角色关系。\n5. 直接输出续写正文，不要输出推理过程、分析注释或任何形式的说明文字。';
                    }

                    // 剧情描述（第一顺位，最高优先级）
                    if (plotDescription) {
                        userMessage += '## ⚠️ 剧情要求（最高优先级，请严格遵守，不得偏离）\n' + plotDescription + '\n\n';
                    }

                    // 上一章结尾
                    if (prevEnd) {
                        userMessage += '## 上一章结尾\n' + prevEnd + '\n\n';
                    }

                    // 关联文件
                    if (linkedFiles.length > 0) {
                        userMessage += '---\n';
                        try {
                            if (typeof window.buildAiReferenceContext !== 'function') throw new Error('参考文件说明模块未加载，请刷新页面后重试');
                            var referenceContext = window.buildAiReferenceContext(bookName, linkedFiles, 'rewrite');
                            userMessage += '\n' + referenceContext.text + '\n';
                        } catch (referenceError) {
                            Toast.warn(referenceError?.message || '参考文件读取失败，请重新选择后再试');
                            return;
                        }
                        userMessage += '\n';
                    }

                    // 字数
                    userMessage += '需续写约 ' + targetWords + ' 字。\n';

                    // 参考段落
                    var maxCtx = 3000;

                    if (dir === 'head') {
                        var afterChunk = afterText.length > maxCtx ? afterText.slice(0, maxCtx) : afterText;
                        userMessage += '\n## 后文段落\n' + afterChunk + '\n\n以上是本章后续内容，请补写一段开头，能自然过渡到下文开头。';
                    } else if (dir === 'mid') {
                        var beforeChunk = beforeText.length > 1500 ? beforeText.slice(-1500) : beforeText;
                        var afterChunk2 = afterText.length > 1500 ? afterText.slice(0, 1500) : afterText;
                        userMessage += '\n## 前文段落\n' + beforeChunk + '\n\n## 后文段落\n' + afterChunk2 + '\n\n请严格按以上字数补写中间过渡段，开头直接承接前文末尾，结尾自然过渡到后文开头，不要节外生枝。';
                    } else {
                        var beforeChunk2 = beforeText.length > maxCtx ? beforeText.slice(-maxCtx) : beforeText;
                        userMessage += '\n## 前文段落\n' + beforeChunk2 + '\n\n以上是本章已写内容，请从此处接着往下写。';
                    }

                    // UI

                    var dirLabel = dir === 'head' ? '开头改写' : (dir === 'mid' ? '中段改写' : '后段改写');

                    const rewriteHandle = window.prepareRewriteStreamingEditor?.({
                        editor,
                        fullContent,
                        selectionStart: rewriteSnapshot.selectionStart,
                        selectionEnd: rewriteSnapshot.selectionEnd,
                        professionalFrom: rewriteSnapshot.professionalFrom,
                        professionalTo: rewriteSnapshot.professionalTo,
                        range: rewriteSnapshot.range,
                        bookName,
                        vi,
                        ci,
                        updateChapWordCount
                    });
                    if (!rewriteHandle) {
                        Toast.warn('无法安全固定本次重写选区，请重新框选后再试');
                        return;
                    }
                    window.logRewriteStartDetails?.({ bookName, vi, ci, dirLabel, linkedFiles });

                    window.setRewriteBusyState?.();



                    var modelCfg = getSelectedModelConfig();
                    var genContent = '';
                    let rewriteSettled = false;
                    let rewriteTask = null;

                    const ownsRewriteTask = () => {
                        if (!rewriteTask?.taskKey) return false;
                        return window.generationTasks?.[rewriteTask.taskKey] === rewriteTask;
                    };

                    const finishRewrite = (finalContent) => {
                        if (rewriteSettled) return false;
                        rewriteSettled = true;
                        return window.finishRewriteSuccess({
                            bookName,
                            vi,
                            ci,
                            editor,
                            direction: dir,
                            dirLabel,
                            beforeText,
                            afterText,
                            fullContent,
                            finalContent,
                            rewriteHandle,
                            rewriteTask
                        });
                    };

                    const finishRewriteErr = (err) => {
                        if (rewriteSettled) return false;
                        rewriteSettled = true;
                        return window.finishRewriteError({
                            err,
                            editor,
                            fullContent,
                            bookName,
                            vi,
                            ci,
                            rewriteHandle,
                            rewriteTask
                        });
                    };

                    // 生成路径
                    if (modelCfg?.base && modelCfg?.model) {
                        var customApiConfig = { ...modelCfg, maxTokens: calcMaxTokensFromTemplate('', targetWords) };
                        var abortController = new AbortController();
                        var taskKey = genTaskKey(bookName, vi, ci);
                        rewriteTask = {
                            taskKey,
                            kind: 'local_rewrite',
                            book: bookName,
                            vi,
                            ci,
                            abortController,
                            rewriteHandle
                        };
                        window.generationTasks[taskKey] = rewriteTask;
                        try {
                            await streamGenerate(
                                customApiConfig, systemPrompt, userMessage,
                                function(chunk) {
                                    genContent += chunk;
                                    if (ownsRewriteTask()) {
                                        rewriteTask.generatedContent = genContent;
                                        updateChapWordCount(genContent);
                                    }
                                },
                                function(final) {
                                    genContent = final || genContent;
                                    finishRewrite(genContent);
                                },
                                function(err) { finishRewriteErr(err); },
                                abortController.signal
                            );
                        } catch (_e) { finishRewriteErr(_e); }
                        return;
                    }
                    finishRewriteErr(new Error('请先添加并选择自己的工具模型'));
                });
    }

    window.bindRewriteActions = bindRewriteActions;
    window.ZHIYU_REWRITE_ACTIONS_READY = true;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindRewriteActions, { once: true });
    } else {
        bindRewriteActions();
    }
})(window, document);
