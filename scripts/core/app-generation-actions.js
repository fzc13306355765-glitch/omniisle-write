(function(window, document) {
    'use strict';

    function getDeps() {
        return {
            AppState: window.ZHIYU_APP_STATE || window.AppState,
            Utils: window.ZHIYU_UTILS || window.Utils,
            Toast: window.ZHIYU_TOAST || window.Toast,
            Modal: window.Modal,
            gA: window.gA,
            gB: window.gB,
            gTPublic: window.gT,
            getSelectedModelConfig: window.getSelectedModelConfig,
            getRequestTier: window.getRequestTier,
            calculateChapterNumber: window.calculateChapterNumber,
            buildGenerationPrompt: window.buildGenerationPrompt,
            getLastChapterGenerationCallSpec: window.getLastChapterGenerationCallSpec,
            validateChapterGenerationOutput: window.validateChapterGenerationOutput,
            parseChapterWordTargetInput: window.parseChapterWordTargetInput,
            getSegmentedWritingPlan: window.getSegmentedWritingPlan,
            getSegmentedWritingBudget: window.getSegmentedWritingBudget,
            getChapterSegmentDisplayPlan: window.getChapterSegmentDisplayPlan,
            getChapterSupplementalWritingPlan: window.getChapterSupplementalWritingPlan,
            buildSegmentedWritingPrompt: window.buildSegmentedWritingPrompt,
            getSegmentedWritingInputBudget: window.getSegmentedWritingInputBudget,
            calcChapterSegmentMaxTokens: window.calcChapterSegmentMaxTokens,
            markChapterGenerating: window.markChapterGenerating,
            genTaskKey: window.genTaskKey,
            updateGeneratingStatus: window.updateGeneratingStatus,
            updateChapWordCount: window.updateChapWordCount,
            updateWordProgress: window.updateWordProgress,
            streamGenerate: window.streamGenerate,
            isAbortLikeError: window.isAbortLikeError,
            isAuthExpiredError: window.isAuthExpiredError,
            setConfirmUseState: window.setConfirmUseState,
            getAuthHeaders: window.getAuthHeaders,
            parseBackendErrorMessage: window.parseBackendErrorMessage,
            getChapterResponseTimeoutMs: window.getChapterResponseTimeoutMs,
            isDisplayableChapterText: window.isDisplayableChapterText,
            trimIncompleteChapterTail: window.trimIncompleteChapterTail,
            createChapterResponseGuard: window.createChapterResponseGuard,
            resolveChapterGenerationFailureContent: window.resolveChapterGenerationFailureContent,
            CHAPTER_RESPONSE_TIMEOUT_MS: window.CHAPTER_RESPONSE_TIMEOUT_MS,
            CHAPTER_SUPPLEMENTAL_SEGMENT_LIMIT: window.CHAPTER_SUPPLEMENTAL_SEGMENT_LIMIT
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
            gA,
            gB,
            gTPublic,
            getSelectedModelConfig,
            getRequestTier,
            calculateChapterNumber,
            buildGenerationPrompt,
            getLastChapterGenerationCallSpec,
            validateChapterGenerationOutput,
            parseChapterWordTargetInput,
            getSegmentedWritingPlan,
            getSegmentedWritingBudget,
            getChapterSegmentDisplayPlan,
            getChapterSupplementalWritingPlan,
            buildSegmentedWritingPrompt,
            getSegmentedWritingInputBudget,
            calcChapterSegmentMaxTokens,
            markChapterGenerating,
            genTaskKey,
            updateGeneratingStatus,
            updateChapWordCount,
            updateWordProgress,
            streamGenerate,
            isAbortLikeError,
            isAuthExpiredError,
            setConfirmUseState,
            getAuthHeaders,
            parseBackendErrorMessage,
            getChapterResponseTimeoutMs,
            isDisplayableChapterText,
            trimIncompleteChapterTail,
            createChapterResponseGuard,
            resolveChapterGenerationFailureContent,
            CHAPTER_RESPONSE_TIMEOUT_MS,
            CHAPTER_SUPPLEMENTAL_SEGMENT_LIMIT
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

                function replaceChapterDraft(resultBox, content, isActiveChapter) {
                    if (!isActiveChapter || !resultBox) return;
                    if (typeof window.ZhiyuEditorAdapter?.replaceContent === 'function') {
                        window.ZhiyuEditorAdapter.replaceContent(resultBox, content);
                    } else {
                        resultBox.textContent = content;
                    }
                }

                function preserveCompletedChapterContent(bookName, vi, ci, content, resultBox, regenerationSnapshot, targetWords) {
                    const completedContent = typeof trimIncompleteChapterTail === 'function'
                        ? trimIncompleteChapterTail(content).content
                        : String(content || '').trim();
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

                function validateGeneratedChapterOrThrow(content, options) {
                    if (typeof validateChapterGenerationOutput !== 'function') return;
                    const result = validateChapterGenerationOutput(content, options || {});
                    if (!result || result.ok) return;
                    throw makeGenerationValidationError('AI输出未通过基础校验：' + result.reasons.join('；'), result.reasons);
                }

                async function requestGeneratedChapterFormatRetry(basePrompt, badContent, reason, signal, modelCfg) {
                    const retryPrompt = [
                        basePrompt,
                        '',
                        '【上一次输出未通过校验】',
                        reason || '输出不符合正文要求',
                        '',
                        '【上一次输出】',
                        String(badContent || '').slice(0, 12000),
                        '',
                        '【本次重试要求】',
                        '请重新输出小说正文。只输出正文，不要标题、说明、分析、总结、道歉、推理过程或<think>标签。',
                        '如果上一次输出为空或过短，请根据上方完整任务重新生成本章正文。'
                    ].join('\n');
                    const model = modelCfg?.base && modelCfg?.model
                        ? modelCfg
                        : window.getSelectedModelConfig?.();
                    if (!model?.base || !model?.model) throw new Error('请先添加并选择一个自备模型');
                    const response = await window.callLLMAPI(
                            { key: '', base: '', model: '' },
                            '你是小说正文生成助手，只输出合格正文。',
                            retryPrompt,
                            model,
                            {
                                label: '正文格式重试',
                                aiAction: 'chapter_format_retry',
                                signal: signal || undefined
                            }
                        );
                    const retryContent = response?.content?.[0]?.text || '';
                    if (String(retryContent).trim()) return retryContent;
                    throw new Error('自备模型未返回正文修复内容');
                }

                async function validateGeneratedChapterWithRetry(content, options) {
                    const initial = typeof validateChapterGenerationOutput === 'function'
                        ? validateChapterGenerationOutput(content, options || {})
                        : { ok: true, content };
                    if (initial?.ok !== false) return initial?.content || content;
                    Utils.appendLog(null, '⚠️ AI输出未通过校验，正在自动修复一次...', 'progress');
                    try {
                        return await window.ensureGeneratedChapterOutputValidOnce(
                            content,
                            async result => {
                                const failureReason = String(result.message || result.reasons?.join('；') || '').slice(0, 1000);
                                return requestGeneratedChapterFormatRetry(
                                    options.basePrompt,
                                    content,
                                    failureReason,
                                    options.signal,
                                    options.modelCfg
                                );
                            },
                            Object.assign({}, options, { validator: validateChapterGenerationOutput })
                        );
                    } catch (error) {
                        throw makeGenerationValidationError('AI输出自动修复后仍未通过校验：' + (error.message || '格式不正确'), [error.message || '格式不正确']);
                    }
                }

                function clearGeneratedDraftOnValidationFailure(resultBox, taskKey) {
                    if (resultBox) resultBox.textContent = '';
                    if (window.generationTasks && window.generationTasks[taskKey]) {
                        window.generationTasks[taskKey].generatedContent = '';
                    }
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

                function makeChapterGenerationPreflightTimeout(timeoutMs) {
                    const err = new Error('生成准备超时，请重试');
                    err.code = 'CHAPTER_PREFLIGHT_TIMEOUT';
                    err.timeoutMs = timeoutMs;
                    return err;
                }

                async function ensureAuthSessionForGeneration() {
                    if (typeof window.ensureAuthSessionForAction !== 'function') return;
                    const timeoutMs = Math.max(1000, Number(window.CHAPTER_AUTH_PREFLIGHT_TIMEOUT_MS || 12000) || 12000);
                    let timeoutId = null;
                    try {
                        await Promise.race([
                            Promise.resolve().then(function() { return window.ensureAuthSessionForAction(); }),
                            new Promise(function(_resolve, reject) {
                                timeoutId = setTimeout(function() {
                                    reject(makeChapterGenerationPreflightTimeout(timeoutMs));
                                }, timeoutMs);
                            })
                        ]);
                    } finally {
                        if (timeoutId) clearTimeout(timeoutId);
                    }
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
                    try {
                        await ensureAuthSessionForGeneration();
                    } catch (error) {
                        if (error?.code === 'CHAPTER_PREFLIGHT_TIMEOUT') {
                            stopChapterGenerationBeforeStart(error.message);
                            return;
                        }
                        if (!error?.handled && typeof window.handleAuthExpired === 'function') {
                            window.handleAuthExpired(error?.message, error?.code);
                        }
                        setChapterGenerationPreflight(false);
                        window.setChapterStep?.('', false);
                        return;
                    }
                    const startModelCfg = getSelectedModelConfig();
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

                    const apiConfig = gA();
                    // 合并选中模型的配置（base/model 优先使用模型选择器中的值）
                    const modelCfg = getSelectedModelConfig();
                    const customGeneration = Boolean(modelCfg?.base && modelCfg?.model);
                    apiConfig.base = modelCfg.base || apiConfig.base;
                    apiConfig.model = modelCfg.model || apiConfig.model;
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
                    const systemPrompt = ``;
                    const chapterTargetInput = document.getElementById('chapterTargetWordsInput');
                    const parsedWordTarget = parseChapterWordTargetInput(
                        chapterTargetInput?.value,
                        chapterTargetInput?.validity?.badInput === true
                    );
                    if (!parsedWordTarget.ok) {
                        setChapterGenerationPreflight(false);
                        Toast.warn('本章字数请输入大于 0 的整数，或留空使用模版字数');
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
                        segmentPlan = getSegmentedWritingPlan(requestedWordTarget, String(template?.systemPrompt || ''));
                        wordTarget = segmentPlan.targetWords;
                        userMessage = buildGenerationPrompt(bookName, vi, ci, plotInput, promptTemplate, linkedFiles, refChapters, wordTarget, extraGenerationContext);
                        callSpec = typeof getLastChapterGenerationCallSpec === 'function' ? getLastChapterGenerationCallSpec() : null;
                        if (!customGeneration && typeof getSegmentedWritingInputBudget === 'function') {
                            const inputBudget = getSegmentedWritingInputBudget(
                                userMessage,
                                segmentPlan,
                                window.CHAPTER_GENERATION_INPUT_LIMIT || 50000
                            );
                            if (!inputBudget.ok) {
                                throw new Error(
                                    '本次正文全部资料加上分段续写说明后需要约 '
                                    + inputBudget.requiredCharacters + ' 个字符，超过最多 '
                                    + inputBudget.inputLimit + ' 个字符；请减少关联文件或参考章节后再试，本次尚未调用 AI'
                                );
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
                        const modelCfg = getSelectedModelConfig();
                        const customApiConfig = { ...modelCfg, maxTokens: calcChapterSegmentMaxTokens() };
                        let completedSegmentCount = 0;
                        try {
                            const systemPrompt = ``;
                            const maxChapterSegmentCount = segmentPlan.total
                                + Math.max(1, Number(CHAPTER_SUPPLEMENTAL_SEGMENT_LIMIT || 3));
                            for (let seg = 1; seg <= maxChapterSegmentCount; seg++) {
                                if (!shouldStartChapterSegment(segmentPlan, seg, generatedContent)) break;
                                const displayPlan = typeof getChapterSegmentDisplayPlan === 'function'
                                    ? getChapterSegmentDisplayPlan(segmentPlan, seg)
                                    : { ...segmentPlan, total: Math.max(segmentPlan.total, seg) };
                                const segmentStartContent = generatedContent;
                                const segmentPrompt = buildSegmentedWritingPrompt(userMessage, displayPlan, seg, generatedContent);
                                let segmentError = '';
                                Utils.appendLog(null, displayPlan.total > 1 ? ('✍️ 正在生成第 ' + seg + '/' + displayPlan.total + ' 段...') : '✍️ 正在生成正文...');
                                if (window.generationTasks[taskKey]) {
                                    window.generationTasks[taskKey].segmentIndex = seg;
                                    window.generationTasks[taskKey].segmentTotal = displayPlan.total;
                                }
                                await streamGenerate(
                                    customApiConfig, systemPrompt, segmentPrompt,
                                    (chunk) => {
                                        generatedContent = appendChapterStreamingChunk(
                                            generatedContent,
                                            chunk,
                                            resultBox,
                                            AppState.chapter.book === bookName && AppState.chapter.vi === vi && AppState.chapter.ci === ci
                                        );
                                        // 缓存到 task 中，切换章节后回来也能看到
                                        if (window.generationTasks[taskKey]) {
                                            window.generationTasks[taskKey].generatedContent = generatedContent;
                                        }
                                        updateChapWordCount(generatedContent);
                                        document.getElementById('chapCreditCost').textContent = '0 (自定义)';
                                        const progressBase = Math.max(segmentPlan.targetWords || wordTarget || 3000, segmentPlan.segmentTarget * segmentPlan.total);
                                        const pct = Math.min(95, Math.round((generatedContent.length / progressBase) * 100));
                                        window.updateGenerationProgressFill?.(pct);
                                    },
                                    () => {},
                                    (err) => { segmentError = err?.message || err || '正文生成失败'; },
                                    abortController.signal
                                );
                                if (segmentError) throw new Error(segmentError);
                                if (abortController.signal.aborted) throw new DOMException('已停止生成', 'AbortError');
                                const segmentResult = typeof trimIncompleteChapterTail === 'function'
                                    ? trimIncompleteChapterTail(generatedContent.slice(segmentStartContent.length))
                                    : { content: generatedContent.slice(segmentStartContent.length).trim(), complete: true };
                                if (!segmentResult.complete || !segmentResult.content) {
                                    generatedContent = segmentStartContent;
                                    replaceChapterDraft(
                                        resultBox,
                                        generatedContent,
                                        AppState.chapter.book === bookName && AppState.chapter.vi === vi && AppState.chapter.ci === ci
                                    );
                                    const incompleteError = new Error('本段没有形成完整自然段，已丢弃未完成尾段。');
                                    incompleteError.code = 'CHAPTER_SEGMENT_INCOMPLETE';
                                    throw incompleteError;
                                }
                                generatedContent = segmentStartContent + segmentResult.content;
                                replaceChapterDraft(
                                    resultBox,
                                    generatedContent,
                                    AppState.chapter.book === bookName && AppState.chapter.vi === vi && AppState.chapter.ci === ci
                                );
                                completedSegmentCount += 1;
                                if (window.generationTasks[taskKey]) {
                                    window.generationTasks[taskKey].completedSegmentCount = completedSegmentCount;
                                    window.generationTasks[taskKey].completedContent = generatedContent;
                                }
                                if (hasReachedChapterAcceptedLength(segmentPlan, generatedContent)) break;
                                Utils.appendLog(null, '✅ 第 ' + seg + ' 段完成，正文仍不足目标，继续自然补写', 'success');
                            }
                            if (!hasReachedChapterAcceptedLength(segmentPlan, generatedContent)) {
                                const targetError = new Error('模型连续补写后仍未达到本章目标字数，已保留完整草稿，但不会按完成状态保存。');
                                targetError.code = 'CHAPTER_TARGET_NOT_REACHED';
                                throw targetError;
                            }
                            window.setChapterStep?.('正在校验正文完整性...', true);
                            generatedContent = await validateGeneratedChapterWithRetry(generatedContent, { wordTarget: segmentPlan.targetWords, basePrompt: userMessage, modelCfg, customApiConfig, signal: abortController.signal, templateId: selectedTemplateId || '' });
                            const validatedResult = typeof trimIncompleteChapterTail === 'function'
                                ? trimIncompleteChapterTail(generatedContent)
                                : { content: String(generatedContent || '').trim(), complete: true };
                            if (!validatedResult.complete || !validatedResult.content) {
                                throw makeGenerationValidationError('AI输出没有形成完整自然段', ['没有完整自然段']);
                            }
                            generatedContent = validatedResult.content;
                            if (!hasReachedChapterAcceptedLength(segmentPlan, generatedContent)) {
                                const targetError = new Error('正文清理后仍未达到本章目标字数，已保留完整草稿，但不会按完成状态保存。');
                                targetError.code = 'CHAPTER_TARGET_NOT_REACHED';
                                throw targetError;
                            }
                            finishChapterGen(bookName, vi, ci, generatedContent, null, resultBox, regenerationSnapshot);
                        } catch (_e) {
                            if (_e && _e.code === 'GENERATION_OUTPUT_INVALID') {
                                generatedContent = '';
                                clearGeneratedDraftOnValidationFailure(resultBox, taskKey);
                                logGenerationFailure(_e);
                            }
                            else if (isAbortLikeError(_e)) { Utils.appendLog(null, '已停止生成', 'warn'); }
                            else { logGenerationFailure(_e); }
                            const stoppedTask = window.generationTasks[taskKey];
                            const completedContent = _e?.code !== 'GENERATION_OUTPUT_INVALID'
                                && Number(stoppedTask?.completedSegmentCount || 0) > 0
                                ? String(stoppedTask.completedContent || '')
                                : '';
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
                                Utils.appendLog(null, '✅ 已保留已经完成的 ' + completedSegmentCount + ' 段正文', 'success');
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
