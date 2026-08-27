(function(window, document) {
    'use strict';

    function getDeps() {
        return {
            AppState: window.ZHIYU_APP_STATE || window.AppState,
            Utils: window.ZHIYU_UTILS || window.Utils,
            Toast: window.ZHIYU_TOAST || window.Toast,
            Modal: window.Modal,
            Confirm: window.ZHIYU_CONFIRM || window.Confirm || { show: function() { return Promise.resolve(false); } },
            gB: window.gB,
            gTPublic: window.gT,
            getSelectedModelConfig: window.getSelectedModelConfig,
            calculateChapterNumber: window.calculateChapterNumber,
            buildGenerationPrompt: window.buildGenerationPrompt,
            getLastChapterGenerationCallSpec: window.getLastChapterGenerationCallSpec,
            validateChapterGenerationOutput: window.validateChapterGenerationOutput,
            parseChapterWordTargetInput: window.parseChapterWordTargetInput,
            normalizeChapterGenerationFocus: window.normalizeChapterGenerationFocus,
            getChapterGenerationPlan: window.getChapterGenerationPlan,
            executeChapterGenerationPlan: window.executeChapterGenerationPlan,
            countChapterGenerationWords: window.countChapterGenerationWords,
            markChapterGenerating: window.markChapterGenerating,
            genTaskKey: window.genTaskKey,
            updateGeneratingStatus: window.updateGeneratingStatus,
            updateChapWordCount: window.updateChapWordCount,
            updateWordProgress: window.updateWordProgress,
            streamGenerate: window.streamGenerate,
            isAbortLikeError: window.isAbortLikeError,
            setConfirmUseState: window.setConfirmUseState
        };
    }

    function beginChapterGenerationEditorReset(bookName, vi, ci, resultBox) {
        if (resultBox) resultBox.textContent = '';
        return true;
    }

    function appendChapterStreamingChunk(currentContent, incomingChunk, resultBox, isActiveChapter) {
        const current = String(currentContent || '');
        const rawChunk = String(incomingChunk || '');
        // 首次返回若只有空行，不让实时界面被顶下去；保留正文自身的段首缩进。
        const chunk = current ? rawChunk : rawChunk.replace(/^(?:[ \t]*\r?\n)+/, '');
        if (!chunk) return current;
        if (isActiveChapter && resultBox) {
            if (typeof window.ZhiyuEditorAdapter?.appendPlainText === 'function') {
                window.ZhiyuEditorAdapter.appendPlainText(resultBox, chunk);
            } else {
                resultBox.appendChild(document.createTextNode(chunk));
            }
            if (!current) resultBox.scrollTop = 0;
        }
        return current + chunk;
    }

    function calculateChapterNormalCallUnitsForTaskBatches(completedSegmentsByTask, multiplier) {
        const trustedMultiplier = Math.max(1, Number(multiplier || 1));
        return (Array.isArray(completedSegmentsByTask) ? completedSegmentsByTask : [])
            .map(value => Math.max(0, Math.floor(Number(value || 0))))
            .filter(value => value > 0)
            .reduce((total, segmentCount) => total + Math.ceil(segmentCount / 2) * trustedMultiplier, 0);
    }

    function resolveSelectedReferenceChapters(book, selectedRefs, calculateNumber) {
        return (Array.isArray(selectedRefs) ? selectedRefs : [])
            .map(function(ref) {
                const ch = book?.volumes?.[ref?.vi]?.chapters?.[ref?.ci];
                return ch ? {
                    chapterIndex: calculateNumber(book, ref.vi, ref.ci),
                    chapterName: ch.name,
                    content: ch.content || ''
                } : null;
            })
            .filter(Boolean);
    }

    function bindGenerationActions() {
        if (bindGenerationActions.bound) return;
        bindGenerationActions.bound = true;

        const {
            AppState,
            Utils,
            Toast,
            Modal,
            Confirm,
            gB,
            gTPublic,
            getSelectedModelConfig,
            calculateChapterNumber,
            buildGenerationPrompt,
            getLastChapterGenerationCallSpec,
            validateChapterGenerationOutput,
            parseChapterWordTargetInput,
            normalizeChapterGenerationFocus,
            getChapterGenerationPlan,
            executeChapterGenerationPlan,
            countChapterGenerationWords,
            markChapterGenerating,
            genTaskKey,
            updateGeneratingStatus,
            updateChapWordCount,
            updateWordProgress,
            streamGenerate,
            isAbortLikeError,
            setConfirmUseState
        } = getDeps();

                // ===== 真正的生成按钮逻辑 =====
                // 生成本章完成后的通用清理已拆到 scripts/core/app-generation-status.js。
                const finishChapterGen = window.finishChapterGen;

                // =================== Chapter generation UI status module entry ===================
                // 生成按钮和确定使用按钮的恢复/禁用状态已拆到 scripts/core/app-generation-status.js。
                const finalizeChapterGenerationAttempt = window.finalizeChapterGenerationAttempt;
                const disableConfirmUseUntilGenerated = window.disableConfirmUseUntilGenerated;

                function makeGenerationValidationError(message, reasons) {
                    const err = new Error(message || 'AI输出未通过基础校验');
                    err.code = 'GENERATION_OUTPUT_INVALID';
                    err.reasons = reasons || [];
                    return err;
                }

                function preserveCompletedChapterContent(bookName, vi, ci, content, resultBox, regenerationSnapshot, targetWords) {
                    const completedContent = String(content || '').trim();
                    if (!completedContent) return false;
                    const books = gB();
                    const chapter = window.applyChapterRegenerationContent?.(regenerationSnapshot, completedContent)
                        || books[bookName]?.volumes?.[vi]?.chapters?.[ci];
                    if (!chapter) return false;
                    const isActiveChapter = AppState.chapter.book === bookName
                        && AppState.chapter.vi === vi
                        && AppState.chapter.ci === ci;
                    if (!regenerationSnapshot) chapter.content = completedContent;
                    if (isActiveChapter && resultBox) {
                        if (typeof window.ZhiyuEditorAdapter?.replaceContent === 'function') {
                            window.ZhiyuEditorAdapter.replaceContent(resultBox, completedContent);
                        } else {
                            resultBox.textContent = completedContent;
                        }
                        updateChapWordCount(completedContent);
                        updateWordProgress(completedContent.length, targetWords);
                    }
                    window.ZhiyuEditorAdapter?.applyContentMetadata?.(
                        chapter,
                        completedContent,
                        isActiveChapter ? resultBox : null
                    );
                    window.clearChapterContentClearState?.(chapter, completedContent, bookName, vi, ci);
                    const totalWords = (books[bookName]?.volumes || []).reduce(function(total, volume) {
                        return total + (volume.chapters || []).reduce(function(chapterTotal, item) {
                            return chapterTotal + String(item?.content || '').length;
                        }, 0);
                    }, 0);
                    const totalWordCount = document.getElementById('totalWordCount');
                    if (totalWordCount) totalWordCount.textContent = totalWords;
                    window.refreshTree?.();
                    return true;
                }

                async function validateGeneratedChapterWithRetry(content, options) {
                    const initial = typeof validateChapterGenerationOutput === 'function'
                        ? validateChapterGenerationOutput(content, options || {})
                        : { ok: true, content };
                    const preserved = String(initial?.content || content || '').trim();
                    if (!preserved) {
                        throw makeGenerationValidationError('AI没有返回可保留的正文内容', ['正文为空']);
                    }
                    if (initial?.ok === false) {
                        const reason = String(initial?.message || initial?.reasons?.join('；') || '格式需要人工检查');
                        Utils.appendLog(null, '⚠️ 正文已保留，但本地校验提示：' + reason + '。系统不会另调模型修复。', 'warn');
                    }
                    return preserved;
                }

                function logGenerationFailure(error) {
                    if (error && error.code === 'GENERATION_OUTPUT_INVALID') {
                        Utils.appendLog(null, error.message, 'error');
                        return;
                    }
                    const message = typeof window.getChapterGenerationFailureLogMessage === 'function'
                        ? window.getChapterGenerationFailureLogMessage(error)
                        : '正文生成失败，本次未完成。';
                    Utils.appendLog(null, message, 'error');
                }

                function setChapterGenerationPreflight(active) {
                    window.__chapterGenerationPreflightActive = !!active;
                    const resultBox = document.getElementById('resultBox');
                    if (resultBox) {
                        resultBox.classList.toggle('chapter-generation-preflight', !!active);
                        resultBox.setAttribute('aria-busy', active ? 'true' : 'false');
                    }
                    window.updateChapterComposerState?.();
                }

                function stopChapterGenerationBeforeStart(message) {
                    setChapterGenerationPreflight(false);
                    window.setChapterStep?.('', false);
                    if (message) {
                        Utils.appendLog(null, message, 'warn');
                        Toast.warn(message);
                    }
                }

                // =================== Segmented writing plan module entry ===================

                document.getElementById('btnStartGenerate')?.addEventListener('click', async function() {
                    const readiness = typeof window.getChapterComposerReadiness === 'function'
                        ? window.getChapterComposerReadiness()
                        : { ready: false, reasons: ['正文生成条件检查模块未加载'] };
                    if (!readiness.ready) {
                        Toast.warn(readiness.reasons?.[0] || '请先选择正式章节、提示词模版和关联文件');
                        return;
                    }
                    setChapterGenerationPreflight(true);
                    Utils.appendLog(null, '等待生成...', 'info');
                    window.setChapterStep?.('正在确认模型配置...', true);
                    const modelCfg = Object.freeze({ ...getSelectedModelConfig() });
                    const generationFocus = typeof normalizeChapterGenerationFocus === 'function'
                        ? normalizeChapterGenerationFocus(AppState.gen?.chapterGenerationFocus)
                        : 'story';
                    Modal.close('generateModal');
                    const genInfo = { ...AppState.chapter };

                    if (!genInfo.book) {
                        setChapterGenerationPreflight(false);
                        Toast.warn('请先选择或创建一个章节');
                        return;
                    }
                    const regenerationSnapshot = window.createChapterRegenerationSnapshot?.(
                        genInfo.book,
                        genInfo.vi,
                        genInfo.ci
                    ) || null;

                    const customGeneration = Boolean(modelCfg?.base && modelCfg?.model);
                    // 社区版只直连用户自备模型。
                    if (!customGeneration) {
                        setChapterGenerationPreflight(false);
                        Toast.warn('请先在设置页配置 API 或选择模型');
                        return;
                    }

                    // 收集生成参数
                    const bookName = genInfo.book;
                    const vi = genInfo.vi;
                    const ci = genInfo.ci;
                    const plotInput = document.getElementById('plotInput').value;
                    const books = gB();
                    const book = books[bookName];

                    // 获取模板
                    const templates = gTPublic();
                    const selectedTemplateId = AppState.gen.templateId;
                    const template = templates.find(t => t.id === selectedTemplateId);
                    if (!template) {
                        setChapterGenerationPreflight(false);
                        Toast.warn('所选提示词模版已不存在，请重新选择');
                        window.updateChapterComposerState?.();
                        return;
                    }

                    // 获取关联文件（用户在弹窗中勾选，5个系统文件默认勾选可取消）
                    const chapterLinkedFiles = typeof window.getGenerationLinkedFilesForChapter === 'function'
                        ? window.getGenerationLinkedFilesForChapter(bookName, vi, ci)
                        : [];
                    const linkedFiles = chapterLinkedFiles
                        .map(function(item) {
                            if (typeof item === 'string') return { name: item };
                            if (!item || typeof item !== 'object') return null;
                            const name = String(item.name || item.displayName || '').trim();
                            return name ? { ...item, name } : null;
                        })
                        .filter(Boolean);

                    // 只使用用户当前实际勾选的正文；空选择也必须保持为空。
                    const refChapters = resolveSelectedReferenceChapters(
                        book,
                        AppState.gen.refChapters,
                        calculateChapterNumber
                    );

                    // 构建提示词
                    const chapterTargetInput = document.getElementById('chapterTargetWordsInput');
                    const parsedWordTarget = parseChapterWordTargetInput(
                        chapterTargetInput?.value,
                        chapterTargetInput?.validity?.badInput === true
                    );
                    if (!parsedWordTarget.ok) {
                        setChapterGenerationPreflight(false);
                        Toast.warn('本章字数请输入 1—20000 的整数，或留空使用 3000 字');
                        return;
                    }
                    const requestedWordTarget = parsedWordTarget.value;
                    let wordTarget = 0;
                    const extraGenerationContext = {
                        refSummaries: Array.isArray(AppState.gen.refSummaries)
                            ? AppState.gen.refSummaries.filter(item => item && typeof item === 'object')
                            : [],
                        keyEventSummaries: Array.isArray(AppState.gen.keyEventSummaries)
                            ? AppState.gen.keyEventSummaries.filter(item => item && typeof item === 'object')
                            : []
                    };
                    const continuationAssembler = window.ZhiyuFullAnalysisContinuationContext;
                    if (continuationAssembler?.loadForWork) {
                        try {
                            extraGenerationContext.fullAnalysisContext = await continuationAssembler.loadForWork({
                                ownerId: String(window.AccountDataScope?.getActiveUid?.() || 'guest'),
                                targetWorkId: String(book?._bid || ''),
                                task: plotInput,
                                maxChars: 12000
                            });
                            if (extraGenerationContext.fullAnalysisContext.available) {
                                const report = extraGenerationContext.fullAnalysisContext.report || {};
                                Utils.appendLog(
                                    null,
                                    '✅ 已装入结构化续写资料 ' + Number(report.includedFactIds?.length || 0)
                                        + ' 条；省略 ' + Number(report.omitted?.length || 0) + ' 条',
                                    'success'
                                );
                                const includedScope = (report.included || []).map(function(item) {
                                    return '【' + (item.chapterTitle || item.chapterId || '未知章节')
                                        + '/' + (item.collection || '事实') + '】' + (item.statement || item.factId);
                                });
                                Utils.appendLog(
                                    null,
                                    '📚 本次实际装配范围：\n' + (includedScope.join('\n') || '没有可装入的已验证事实'),
                                    'info'
                                );
                                if (report.omitted?.length) {
                                    Utils.appendLog(
                                        null,
                                        'ℹ️ 本次未装入的资料：\n' + report.omitted.map(function(item) {
                                            return '[' + item.factId + '] ' + item.reason;
                                        }).join('\n'),
                                        'info'
                                    );
                                }
                            } else {
                                Utils.appendLog(
                                    null,
                                    'ℹ️ ' + extraGenerationContext.fullAnalysisContext.reason,
                                    'info'
                                );
                            }
                        } catch (contextError) {
                            extraGenerationContext.fullAnalysisContext = {
                                available: false,
                                source: 'legacy_markdown',
                                reason: '结构化资料读取失败，已明确降级到原有资料路径：'
                                    + String(contextError?.message || '未知错误')
                            };
                            Utils.appendLog(null, '⚠️ ' + extraGenerationContext.fullAnalysisContext.reason, 'warn');
                        }
                    }
                    let userMessage;
                    let callSpec;
                    let segmentPlan;
                    try {
                        const promptTemplate = {
                            ...template,
                            title: String(template?.title || ''),
                            // 自备模型需要在本机装入用户选择的模板内容。
                            systemPrompt: String(template?.systemPrompt || '')
                        };
                        segmentPlan = getChapterGenerationPlan(
                            requestedWordTarget,
                            String(template?.systemPrompt || ''),
                            generationFocus
                        );
                        wordTarget = segmentPlan.targetWords;
                        userMessage = buildGenerationPrompt(bookName, vi, ci, plotInput, promptTemplate, linkedFiles, refChapters, wordTarget, extraGenerationContext);
                        callSpec = typeof getLastChapterGenerationCallSpec === 'function' ? getLastChapterGenerationCallSpec() : null;
                        if (segmentPlan.requiresHighRequestConfirmation) {
                            const confirmed = await Confirm.show(
                                '字数模式本章目标为 ' + segmentPlan.targetWords + ' 字，预计最多调用你的模型 API '
                                    + segmentPlan.executionTotal + ' 次。每次都可能由模型供应商计费，确定继续吗？'
                            );
                            if (!confirmed) {
                                setChapterGenerationPreflight(false);
                                window.setChapterStep?.('', false);
                                Utils.appendLog(null, '已取消高次数正文生成，本次没有调用模型 API。', 'info');
                                return;
                            }
                        }
                    } catch (error) {
                        const detail = String(error?.message || error || '未知错误').slice(0, 300);
                        stopChapterGenerationBeforeStart('正文资料组装失败：' + detail);
                        return;
                    }

                    // UI 更新 + 执行日志
                    Utils.appendLog(null, '⏳ 开始生成第' + (calculateChapterNumber(book, vi, ci)) + '章《' + (book.volumes[vi].chapters[ci].name) + '》...');
                    window.setChapterStep?.('正在读取大纲、关联文件和剧情要求...', true);
                    window.logGenerationReferenceSummary?.(window.buildGenerationReferenceSummary?.(bookName, linkedFiles, refChapters));
                    window.logGenerationStartDetails?.({
                        templateTitle: template?.title || '',
                        linkedFiles,
                        refChapters,
                        refSummaries: extraGenerationContext.refSummaries,
                        keyEventSummaries: extraGenerationContext.keyEventSummaries,
                        plotInput,
                        callSpec,
                        segmentPlan
                    });
                    document.getElementById('btnStop').disabled = false;
                    document.getElementById('btnStop').textContent = '停止生成';
                    document.getElementById('btnGen').disabled = true;
                    (document.getElementById('btnRetry')||{"style":{"display":""},"dataset":{"mode":""},"textContent":""}).style.display = 'none';
                    markChapterGenerating(bookName, vi, ci, true);

                    // 设置正在生成的章节信息（支持多章并发）
                    const taskKey = genTaskKey(bookName, vi, ci);
                    window.generationTasks[taskKey] = { book: bookName, vi, ci, regenerationSnapshot };
                    setChapterGenerationPreflight(false);

                    // 更新生成状态显示
                    updateGeneratingStatus(bookName, vi, ci);

                    const resultBox = document.getElementById('resultBox');
                    // 只有正在生成的章节正是当前选中章节，才清空显示框
                    if (AppState.chapter.book === bookName && AppState.chapter.vi === vi && AppState.chapter.ci === ci) {
                        beginChapterGenerationEditorReset(bookName, vi, ci, resultBox);
                        resultBox.style.background = 'var(--chapter-generation-highlight)';
                        resultBox.setAttribute('contenteditable', 'false');
                    }

                    let generatedContent = '';

                    // 创建中止控制器
                    const abortController = new AbortController();
                    window.generationTasks[taskKey].abortController = abortController;

                    // ===== 自定义模型：前端直连 =====
                    if (customGeneration) {
                        const customApiConfig = {
                            ...modelCfg,
                            maxTokens: segmentPlan.focus === 'words' && segmentPlan.longTarget ? 3600 : 16384
                        };
                        let completedSegmentCount = 0;
                        try {
                            const executionResult = await executeChapterGenerationPlan({
                                plan: segmentPlan,
                                basePrompt: userMessage,
                                systemPrompt: '',
                                modelConfig: customApiConfig,
                                streamGenerate,
                                signal: abortController.signal,
                                onExecutionStart: function(info) {
                                    const seg = info.stepIndex;
                                    Utils.appendLog(
                                        null,
                                        segmentPlan.focus === 'story'
                                            ? '✍️ 剧情模式：正在一次生成完整正文...'
                                            : (segmentPlan.executionTotal > 1
                                                ? ('✍️ 字数模式：正在执行第 ' + seg + '/' + segmentPlan.executionTotal + ' 次生成...')
                                                : '✍️ 字数模式：正在生成正文...')
                                    );
                                    if (window.generationTasks[taskKey]) {
                                        window.generationTasks[taskKey].segmentIndex = seg;
                                        window.generationTasks[taskKey].segmentTotal = segmentPlan.executionTotal;
                                    }
                                },
                                onChunk: function(visibleChunk, fullContent) {
                                    generatedContent = appendChapterStreamingChunk(
                                        generatedContent,
                                        visibleChunk,
                                        resultBox,
                                        AppState.chapter.book === bookName && AppState.chapter.vi === vi && AppState.chapter.ci === ci
                                    );
                                    if (generatedContent !== fullContent) generatedContent = fullContent;
                                    if (window.generationTasks[taskKey]) {
                                        window.generationTasks[taskKey].generatedContent = generatedContent;
                                    }
                                    updateChapWordCount(generatedContent);
                                    const creditCost = document.getElementById('chapCreditCost');
                                    if (creditCost) creditCost.textContent = '0（自备 API）';
                                    const generatedWords = countChapterGenerationWords(generatedContent);
                                    const progressBase = Math.max(1, segmentPlan.targetWords || wordTarget || 3000);
                                    const pct = Math.min(95, Math.round((generatedWords / progressBase) * 100));
                                    window.updateGenerationProgressFill?.(pct);
                                },
                                onExecutionComplete: function(info) {
                                    completedSegmentCount = info.completedExecutionCount;
                                    generatedContent = info.generatedContent;
                                    if (window.generationTasks[taskKey]) {
                                        window.generationTasks[taskKey].completedSegmentCount = completedSegmentCount;
                                        window.generationTasks[taskKey].completedContent = generatedContent;
                                    }
                                    if (segmentPlan.focus === 'words'
                                        && !info.reachedTarget
                                        && info.stepIndex < segmentPlan.executionTotal) {
                                        Utils.appendLog(null, '✅ 第 ' + info.stepIndex + ' 次生成完成，正文仍不足目标，继续无缝补写', 'success');
                                    }
                                }
                            });
                            generatedContent = executionResult.content;
                            completedSegmentCount = executionResult.completedExecutionCount;
                            window.setChapterStep?.('正在校验正文完整性...', true);
                            generatedContent = await validateGeneratedChapterWithRetry(generatedContent, { wordTarget: segmentPlan.targetWords, basePrompt: userMessage, modelCfg, customApiConfig, signal: abortController.signal, templateId: selectedTemplateId || '' });
                            const generatedWords = countChapterGenerationWords(generatedContent);
                            if (segmentPlan.focus === 'words' && generatedWords < segmentPlan.targetWords) {
                                Utils.appendLog(
                                    null,
                                    'ℹ️ 字数模式已完成计划内请求，当前约 ' + generatedWords
                                        + ' 字，未继续增加额外 API 请求。',
                                    'info'
                                );
                            }
                            finishChapterGen(bookName, vi, ci, generatedContent, null, resultBox, regenerationSnapshot);
                        } catch (_e) {
                            if (!generatedContent && _e?.generatedContent) {
                                generatedContent = String(_e.generatedContent);
                            }
                            if (isAbortLikeError(_e)) Utils.appendLog(null, '已停止生成', 'warn');
                            else logGenerationFailure(_e);
                            const completedContent = String(generatedContent || '').trim();
                            if (completedContent && preserveCompletedChapterContent(
                                bookName,
                                vi,
                                ci,
                                completedContent,
                                resultBox,
                                regenerationSnapshot,
                                segmentPlan.targetWords
                            )) {
                                generatedContent = completedContent;
                                Utils.appendLog(
                                    null,
                                    _e?.code === 'AI_STORY_INCOMPLETE'
                                        ? '⚠️ 已保留本次未完整收束的剧情草稿，状态仍为失败。'
                                        : '✅ 已保留本次已经生成的正文草稿',
                                    _e?.code === 'AI_STORY_INCOMPLETE' ? 'warn' : 'success'
                                );
                            } else {
                                window.restoreChapterRegenerationSnapshot?.(regenerationSnapshot, resultBox);
                                generatedContent = '';
                            }
                        } finally {
                            finalizeChapterGenerationAttempt(bookName, vi, ci, resultBox);
                            const hasGeneratedContent = (generatedContent || '').trim().length > 0;
                            const copyBtn = document.getElementById('btnCopy');
                            if (copyBtn) copyBtn.disabled = !hasGeneratedContent;
                            if (hasGeneratedContent) setConfirmUseState('ready');
                            else disableConfirmUseUntilGenerated();
                        }
                        return;
                    }

                });
    }

    window.bindGenerationActions = bindGenerationActions;
    window.beginChapterGenerationEditorReset = beginChapterGenerationEditorReset;
    window.appendChapterStreamingChunk = appendChapterStreamingChunk;
    window.calculateChapterNormalCallUnitsForTaskBatches = calculateChapterNormalCallUnitsForTaskBatches;
    window.resolveSelectedReferenceChapters = resolveSelectedReferenceChapters;
    window.ZHIYU_GENERATION_ACTIONS_READY = true;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindGenerationActions, { once: true });
    } else {
        bindGenerationActions();
    }
})(window, document);
