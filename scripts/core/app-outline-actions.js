(function(window, document) {
    'use strict';

    function getDeps() {
        return {
            AppState: window.ZHIYU_APP_STATE || window.AppState,
            Utils: window.ZHIYU_UTILS || window.Utils,
            Toast: window.ZHIYU_TOAST || window.Toast,
            OUTLINE_WORDCOUNT: window.OUTLINE_WORDCOUNT,
            FORMAT_CONSTRAINTS: window.ZHIYU_FORMAT_CONSTRAINTS || window.FORMAT_CONSTRAINTS || {},
            gA: window.gA,
            gTPublic: window.gT || window.gTPublic,
            getOutlineModelConfig: window.getOutlineModelConfig,
            getOutlineSegmentPlan: window.getOutlineSegmentPlan,
            getOutlineSegmentLabel: window.getOutlineSegmentLabel,
            buildOutlineGenerationPrompt: window.buildOutlineGenerationPrompt,
            buildSegmentedOutlinePrompt: window.buildSegmentedOutlinePrompt,
            normalizeOutlineFoundationSegment: window.normalizeOutlineFoundationSegment,
            normalizeOutlineChapterStageSegment: window.normalizeOutlineChapterStageSegment,
            normalizeSegmentedOutlineChapterOrder: window.normalizeSegmentedOutlineChapterOrder,
            streamGenerate: window.streamGenerate,
            getAuthHeaders: window.getAuthHeaders,
            makeRequestId: window.makeRequestId,
            getRequestTier: window.getRequestTier,
            parseBackendErrorMessage: window.parseBackendErrorMessage,
            getRefFileContent: window.getRefFileContent,
            getMemoryLinkBookName: window.getMemoryLinkBookName,
            getSelectedOutlineFunctionType: window.getSelectedOutlineFunctionType,
            getTemplateContextTemplateId: window.getTemplateContextTemplateId,
            getOutlineMode: window.getOutlineMode,
            getOutlineStartLabel: window.getOutlineStartLabel,
            getFriendlyBackendError: window.getFriendlyBackendError,
            formatAiErrorForDisplay: window.formatAiErrorForDisplay,
            isAbortLikeError: window.isAbortLikeError
        };
    }

    function ensureOutlineSegmentCompleted(completed, abortSignal) {
        if (abortSignal?.aborted) throw new DOMException('已停止生成', 'AbortError');
        if (completed) return true;
        const streamError = new Error('大纲分段连接提前中断，未收到完成确认');
        streamError.code = 'OUTLINE_SEGMENT_STREAM_INCOMPLETE';
        throw streamError;
    }

    function ensureOutlineSegmentOutput(content, startLength, segmentIndex, abortSignal) {
        if (abortSignal?.aborted) throw new DOMException('已停止生成', 'AbortError');
        if (String(content || '').slice(Math.max(0, Number(startLength) || 0)).trim()) return true;
        const emptyError = new Error('大纲第 ' + segmentIndex + ' 段未返回可用内容，本次生成未完成。');
        emptyError.code = 'AI_STREAM_EMPTY';
        throw emptyError;
    }

    function normalizeDirectOutlineFoundationContent(content, startLength, normalizer) {
        const source = String(content || '');
        const offset = Math.max(0, Math.min(source.length, Number(startLength) || 0));
        const normalize = typeof normalizer === 'function'
            ? normalizer
            : window.normalizeOutlineFoundationSegment;
        if (typeof normalize !== 'function') {
            const dependencyError = new Error('基础设定范围校验尚未加载，请刷新页面后重试。');
            dependencyError.code = 'OUTLINE_FOUNDATION_NORMALIZER_MISSING';
            throw dependencyError;
        }
        const result = normalize(source.slice(offset));
        const foundation = String(result?.content || '').trim();
        if (!foundation) {
            const emptyError = new Error('普通大纲第一阶段没有返回可保留的基础设定，请重试第一阶段。');
            emptyError.code = 'OUTLINE_FOUNDATION_EMPTY';
            throw emptyError;
        }
        const normalizedContent = source.slice(0, offset) + foundation;
        return {
            content: normalizedContent,
            changed: normalizedContent !== source,
            removedChapterCount: Math.max(0, Number(result?.removedChapterCount) || 0)
        };
    }

    function normalizeDirectOutlineChapterStageContent(content, startLength, normalizer) {
        const source = String(content || '');
        const offset = Math.max(0, Math.min(source.length, Number(startLength) || 0));
        const normalize = typeof normalizer === 'function'
            ? normalizer
            : window.normalizeOutlineChapterStageSegment;
        if (typeof normalize !== 'function') {
            const dependencyError = new Error('章节粗纲范围校验尚未加载，请刷新页面后重试。');
            dependencyError.code = 'OUTLINE_CHAPTER_STAGE_NORMALIZER_MISSING';
            throw dependencyError;
        }
        const result = normalize(source.slice(offset));
        const chapterContent = String(result?.content || '').trim();
        if (!chapterContent) {
            const emptyError = new Error('普通大纲章节阶段没有返回可识别的章节粗纲，请重试当前阶段。');
            emptyError.code = 'OUTLINE_CHAPTER_STAGE_EMPTY';
            throw emptyError;
        }
        const normalizedContent = source.slice(0, offset) + chapterContent;
        return {
            content: normalizedContent,
            changed: normalizedContent !== source,
            removedPrefix: String(result?.removedPrefix || '').trim()
        };
    }

    const OUTLINE_RATE_LIMIT_RETRY_DELAYS_MS = Object.freeze([15000, 30000, 60000]);
    const FUNCTIONAL_TASK_START_TIMEOUT_MS = 30000;

    function getOutlineErrorStatus(error) {
        const direct = Number(error?.upstreamStatus || error?.status || 0);
        if (Number.isFinite(direct) && direct > 0) return direct;
        const raw = String([error?.rawBody, error?.message, error?.code].filter(Boolean).join(' '));
        const match = raw.match(/\b(?:AI|HTTP)\s*[:=]?\s*(\d{3})\b/i)
            || raw.match(/["']?(?:upstreamStatus|status)["']?\s*[:=]\s*(\d{3})/i);
        return match ? Number(match[1]) : 0;
    }

    function isRetryableOutlineRateLimitError(error) {
        const raw = String([error?.rawBody, error?.message, error?.code].filter(Boolean).join(' '));
        return getOutlineErrorStatus(error) === 429
            || /AI_PROVIDER_(?:QUOTA_EXHAUSTED|RATE_LIMITED|TOKEN_RATE_LIMITED)|insufficient_quota|too many requests|rate[_\s-]*limit/i.test(raw);
    }

    function waitForOutlineRetry(delayMs, signal) {
        if (signal?.aborted) return Promise.reject(new DOMException('已停止生成', 'AbortError'));
        return new Promise((resolve, reject) => {
            const timer = window.setTimeout(done, delayMs);
            function done() {
                signal?.removeEventListener?.('abort', onAbort);
                resolve();
            }
            function onAbort() {
                window.clearTimeout(timer);
                signal?.removeEventListener?.('abort', onAbort);
                reject(new DOMException('已停止生成', 'AbortError'));
            }
            signal?.addEventListener?.('abort', onAbort, { once: true });
        });
    }

    function bindOutlineActions() {
        if (bindOutlineActions.bound) return;
        bindOutlineActions.bound = true;

        const {
            AppState,
            Utils,
            Toast,
            OUTLINE_WORDCOUNT,
            FORMAT_CONSTRAINTS,
            gA,
            gTPublic,
            getOutlineModelConfig,
            getOutlineSegmentPlan,
            getOutlineSegmentLabel,
            buildOutlineGenerationPrompt,
            buildSegmentedOutlinePrompt,
            normalizeOutlineFoundationSegment,
            normalizeOutlineChapterStageSegment,
            normalizeSegmentedOutlineChapterOrder,
            streamGenerate,
            getAuthHeaders,
            makeRequestId,
            getRequestTier,
            parseBackendErrorMessage,
            getRefFileContent,
            getMemoryLinkBookName,
            getSelectedOutlineFunctionType,
            getTemplateContextTemplateId,
            getOutlineMode,
            getOutlineStartLabel,
            getFriendlyBackendError,
            formatAiErrorForDisplay,
            isAbortLikeError
        } = getDeps();

        function getStartButtonLabel() {
            return typeof getOutlineStartLabel === 'function' ? getOutlineStartLabel() : '生成大纲';
        }

        function getFunctionalLinkedFileBlocks() {
            const files = Array.isArray(AppState.outline.functionalLinkedFiles) ? AppState.outline.functionalLinkedFiles : [];
            return files.map(function(file) {
                return Object.assign({}, file, { name: file.name || '未命名文件' });
            });
        }

        function sanitizeFunctionalPromptText(text, type) {
            const raw = String(text || '');
            if (type !== 'imitate') return raw;
            return raw
                .replace(/仿写/g, '结构参考')
                .replace(/模仿/g, '参考结构')
                .replace(/拆书/g, '结构分析')
                .replace(/抄袭/g, '照搬')
                .replace(/搬运/g, '照搬')
                .replace(/洗稿/g, '重写');
        }

        function buildFunctionalGeneratePayload(template) {
            const type = typeof getSelectedOutlineFunctionType === 'function' ? getSelectedOutlineFunctionType() : '';
            const typeName = type === 'script' ? '剧本' : '大纲设定';
            const promptTypeName = type === 'script' ? '剧本' : '结构参考生成';
            const subjectInput = document.getElementById('outlineFunctionSubject');
            const directionInput = document.getElementById('outlineCoreSummary');
            const subject = (subjectInput?.value || '').trim();
            const direction = (directionInput?.value || '').trim();
            AppState.outline.functionSubject = subject;
            AppState.outline.functionalDirection = direction;
            const selectedGenres = Array.isArray(AppState.outline.functionalGenres) ? AppState.outline.functionalGenres.filter(Boolean) : [];
            const linkedBlocks = getFunctionalLinkedFileBlocks();
            const linkedBookName = typeof getMemoryLinkBookName === 'function'
                ? getMemoryLinkBookName('outlineFunction')
                : (AppState.chapter?.book || document.getElementById('bookSel')?.value || '');

            const defaultSystem = type === 'script'
                ? '你是一位专业剧本策划和小说转剧本助手。'
                : '你是一位专业网文结构参考和原创改写助手。';
            const systemPrompt = sanitizeFunctionalPromptText(template?.systemPrompt || defaultSystem, type);
            let userMessage = '请完成一次【' + promptTypeName + '】功能性生成。\n\n';
            if (selectedGenres.length > 0) userMessage += '【题材标签】\n' + selectedGenres.join('、') + '\n\n';
            if (subject) userMessage += '【题材补充】\n' + subject + '\n\n';
            if (linkedBlocks.length > 0) {
                if (typeof window.buildAiReferenceContext !== 'function') throw new Error('参考文件说明模块未加载，请刷新页面后重试');
                const referenceFeature = type === 'script' ? 'functional_script' : 'functional_outline';
                userMessage += '【关联文件】\n' + window.buildAiReferenceContext(linkedBookName, linkedBlocks, referenceFeature).text + '\n\n';
            }
            if (direction) userMessage += '【功能方向描述】\n' + direction + '\n\n';
            if (type === 'script') {
                userMessage += [
                    '【输出要求】',
                    '1. 输出可直接使用的剧本内容，重点包含场景、人物行动、对白、冲突推进。',
                    '2. 保持故事逻辑清楚，场景切换明确。',
                    '3. 不要解释提示词，不要输出创作说明。'
                ].join('\n');
            } else {
                userMessage += [
                    '【输出要求】',
                    '1. 输出可直接使用的原创内容，参考关联文件的结构、节奏、爽点和叙述方式。',
                    '2. 禁止保留原作章节标题，每章标题必须改写为功能型标题，只概括本章结构作用。',
                    '3. 不要带有原文任何相关名词，包括人名、地名、势力名、功法名、物品名、世界观专有名词和标志性称呼。',
                    '4. 不要照搬原文句子、角色名、地名和专有设定。',
                    '5. 不要解释提示词，不要输出创作说明。'
                ].join('\n');
            }
            return {
                type,
                typeName,
                direction,
                systemPrompt,
                userMessage,
                safeTemplateTitle: sanitizeFunctionalPromptText(template?.title || typeName, type)
            };
        }

        function formatFunctionalError(err) {
            const raw = err?.message || err || '';
            if (typeof formatAiErrorForDisplay === 'function') {
                return formatAiErrorForDisplay(err, '内容生成失败');
            }
            if (typeof getFriendlyBackendError === 'function') {
                const friendly = getFriendlyBackendError('', raw, '', '内容生成失败');
                if (friendly) return friendly;
            }
            return raw || '内容生成失败';
        }

        async function startFunctionalGenerate(btn, resultBox) {
            const modelCfg = getOutlineModelConfig();
            const apiConfig = gA();
            if (!modelCfg?.base || !modelCfg?.model) { Toast.warn('请先添加并选择自己的模型'); return; }
            if (typeof getSelectedOutlineFunctionType !== 'function' || !getSelectedOutlineFunctionType()) { Toast.warn('请先选择大纲设定或剧本'); return; }
            const functionalTemplateContext = getSelectedOutlineFunctionType() === 'script' ? 'functionalScript' : 'functionalOutline';
            const functionalTemplateId = typeof getTemplateContextTemplateId === 'function'
                ? getTemplateContextTemplateId(functionalTemplateContext)
                : AppState.outline.templateId;
            if (!functionalTemplateId) { Toast.warn('请选择一个提示词模版'); return; }

            const templates = gTPublic();
            const template = templates.find(t => t.id === functionalTemplateId);
            let payload;
            try {
                payload = buildFunctionalGeneratePayload(template);
            } catch (referenceError) {
                Toast.warn(referenceError?.message || '参考文件读取失败，请重新选择后再试');
                return;
            }
            if (!payload.direction && getFunctionalLinkedFileBlocks().length === 0) {
                Toast.warn('请填写功能方向描述，或先选择关联文件');
                return;
            }
            if (window.hasActiveOutlineGenerationRuntime?.()) {
                Toast.warn('已有大纲或功能内容正在生成，请等待完成或先停止当前任务');
                return;
            }
            const generationRuntime = window.startOutlineGenerationRuntime?.({
                mode: 'function',
                subMode: 'normal',
                outputKind: 'master',
                content: ''
            });
            if (!generationRuntime) {
                Toast.warn('已有大纲或功能内容正在生成，请等待完成或先停止当前任务');
                return;
            }

            btn.disabled = false;
            btn.textContent = '停止生成';
            btn.dataset.generating = 'true';
            resultBox.style.display = 'block';
            resultBox.textContent = '';
            resultBox.style.background = '#e3f2fd';
            Utils.appendLog(null, '开始生成' + payload.typeName + '内容...');

            const abortController = new AbortController();
            window.outlineAbortController = abortController;
            let fullContent = '';
            const streamState = { started: false };

            function finishFunctionalSuccess(finalContent) {
                const runtime = generationRuntime;
                const visible = runtime
                    ? window.doesOutlineGenerationRuntimeMatchCurrent?.(runtime, 'function') !== false
                    : true;
                if (visible) {
                    resultBox.style.background = '';
                    resultBox.textContent = finalContent;
                }
                window.finishOutlineGenerationRuntime?.(finalContent, generationRuntime);
                if (visible) AppState.outline.functionalContent = finalContent;
                btn.disabled = false;
                btn.textContent = getStartButtonLabel();
                delete btn.dataset.generating;
                delete window.outlineAbortController;
                Utils.appendLog(null, '✅ ' + payload.typeName + '内容生成完成', 'success');
            }

            function finishFunctionalError(err) {
                const msg = formatFunctionalError(err);
                const aborted = typeof isAbortLikeError === 'function' ? isAbortLikeError(err) : String(msg).includes('AbortError');
                const runtime = generationRuntime;
                const visible = runtime
                    ? window.doesOutlineGenerationRuntimeMatchCurrent?.(runtime, 'function') !== false
                    : true;
                if (!visible) {
                    Utils.appendLog(null, aborted ? '已停止原作品的内容生成' : '原作品内容生成失败：' + msg, aborted ? 'warn' : 'error');
                } else if (aborted) {
                    window.appendOutlineStreamText?.(resultBox, '\n\n[已停止生成]', streamState);
                    Utils.appendLog(null, '已停止内容生成', 'warn');
                } else {
                    resultBox.textContent = '❌ 生成失败：' + msg;
                    Utils.appendLog(null, '内容生成失败：' + msg, 'error');
                }
                window.finishOutlineGenerationRuntime?.(visible ? (resultBox.textContent || fullContent) : (runtime?.content || fullContent), generationRuntime);
                if (visible) resultBox.style.background = '';
                btn.disabled = false;
                btn.textContent = getStartButtonLabel();
                delete btn.dataset.generating;
                delete window.outlineAbortController;
            }

            try {
                if (modelCfg?.base && modelCfg?.model) {
                    let generationError = '';
                    await streamGenerate(
                        { ...modelCfg, maxTokens: 16384 },
                        payload.systemPrompt,
                        payload.userMessage,
                        function(chunk) {
                            const cleanChunk = window.normalizeOutlineStreamText?.(chunk, streamState) ?? chunk;
                            if (!cleanChunk) return;
                            fullContent += cleanChunk;
                            const visible = window.updateOutlineGenerationRuntime?.(fullContent, generationRuntime) !== false;
                            if (visible) window.appendOutlineStreamText?.(resultBox, cleanChunk, streamState, { normalized: true });
                        },
                        function(final) {
                            if (final) {
                                fullContent = window.normalizeOutlineStreamText?.(final, { started: false }) ?? final;
                                window.updateOutlineGenerationRuntime?.(fullContent, generationRuntime);
                            }
                        },
                        function(err) { generationError = err?.message || err || '内容生成失败'; },
                        abortController.signal
                    );
                    if (generationError) throw new Error(generationError);
                    if (abortController.signal.aborted) throw new DOMException('已停止生成', 'AbortError');
                    finishFunctionalSuccess(fullContent);
                    return;
                }

            } catch (err) {
                finishFunctionalError(err);
            }
        }

                // 开始生成大纲
                document.getElementById('btnStartOutline')?.addEventListener('click', async function() {
                    const btn = document.getElementById('btnStartOutline');
                    const resultBox = document.getElementById('outlineResultBox');

                    if (typeof window.maybeHandleOutlineInquiryAction === 'function'
                        && await window.maybeHandleOutlineInquiryAction(btn, resultBox)) {
                        return;
                    }

                    // 如果正在生成，点击停止
                    if (btn.dataset.generating === 'true') {
                        if (window.outlineAbortController) {
                            window.outlineAbortController.abort(new DOMException('user_cancelled', 'AbortError'));
                        }
                        btn.textContent = getStartButtonLabel();
                        btn.disabled = false;
                        delete btn.dataset.generating;
                        resultBox.style.background = '';
                        return;
                    }

                    if (typeof getOutlineMode === 'function' && getOutlineMode() === 'function') {
                        await startFunctionalGenerate(btn, resultBox);
                        return;
                    }

                    if (typeof window.isAdvancedOutlineMode === 'function' && window.isAdvancedOutlineMode()) {
                        await window.startAdvancedOutlineGenerate(btn, resultBox);
                        return;
                    }

                    if (!AppState.outline.genres.length) { Toast.warn('请选择至少一个题材'); return; }
                    const modelCfg = getOutlineModelConfig();
                    const apiConfig = gA();
                    // 自备模型必须包含可用的 API 地址和模型名称。
                    if (!modelCfg?.base || !modelCfg?.model) { Toast.warn('请先添加并选择自己的模型'); return; }
                    const selectedOutlineTemplateId = typeof getTemplateContextTemplateId === 'function'
                        ? getTemplateContextTemplateId('outline')
                        : AppState.outline.templateId;
                    if (!selectedOutlineTemplateId) { Toast.warn('请选择一个提示词模版'); return; }
                    if (window.hasActiveOutlineGenerationRuntime?.()) {
                        Toast.warn('已有大纲或功能内容正在生成，请等待完成或先停止当前任务');
                        return;
                    }

                    btn.disabled = false;
                    btn.textContent = '停止生成';
                    btn.dataset.generating = 'true';
                    resultBox.style.display = 'block';
                    resultBox.textContent = '';
                    resultBox.style.background = '#e3f2fd';
                    Utils.appendLog(null, '开始生成大纲...');
                    window.setOutlineStep?.('正在整理题材、篇幅和提示词...', true);

                    let generationRuntime = null;
                    const finishOutlineError = (err) => window.finishOutlineError({ err, resultBox, btn, runtime: generationRuntime });
                    // outlineActions always visible

                    const wcEl = document.querySelector('#outlineModal .wordcount-option.selected');
                    const wcKey = wcEl ? wcEl.dataset.wc : 'medium';
                    let outlinePrompt;
                    let outlinePlan;
                    try {
                        outlinePrompt = buildOutlineGenerationPrompt({
                            AppState,
                            OUTLINE_WORDCOUNT,
                            FORMAT_CONSTRAINTS,
                            gTPublic,
                            wcKey,
                            coreSummary: document.getElementById('outlineCoreSummary')?.value.trim() || '',
                            mode: 'direct'
                        });
                        outlinePlan = getOutlineSegmentPlan(wcKey);
                    } catch (error) {
                        finishOutlineError(error);
                        window.setOutlineStep?.('', false);
                        return;
                    }
                    const wcLabel = outlinePrompt.wcLabel;
                    const template = outlinePrompt.template;
                    const systemPrompt = outlinePrompt.systemPrompt;
                    const userMessage = outlinePrompt.userMessage;

                    const abortController = new AbortController();
                    window.outlineAbortController = abortController;
                    let fullContent = '';
                    generationRuntime = window.startOutlineGenerationRuntime?.({
                        mode: 'outline',
                        subMode: 'normal',
                        outputKind: 'master',
                        content: ''
                    });
                    if (!generationRuntime) {
                        finishOutlineError(new Error('已有大纲或功能内容正在生成，请等待完成或先停止当前任务'));
                        window.setOutlineStep?.('', false);
                        return;
                    }
                    const _oid = outlinePrompt.templateId || selectedOutlineTemplateId || "";
                    const finishOutlineSuccess = (finalContent, successLog) => window.finishOutlineSuccess({ resultBox, btn, finalContent, successLog, runtime: generationRuntime });
                    const finishSegmentedOutlineSuccess = () => {
                        finishOutlineSuccess(
                            fullContent,
                            outlinePlan.total > 1 ? '✅ 大纲分段生成完成' : '✅ 大纲生成完成'
                        );
                    };
                    const enforceFoundationScope = (segmentStartLength) => {
                        const normalized = normalizeDirectOutlineFoundationContent(
                            fullContent,
                            segmentStartLength,
                            normalizeOutlineFoundationSegment
                        );
                        if (!normalized.changed) return;
                        fullContent = normalized.content;
                        const visible = window.updateOutlineGenerationRuntime?.(fullContent, generationRuntime) !== false;
                        if (visible) {
                            if (typeof window.ZhiyuEditorAdapter?.replaceContent === 'function') {
                                window.ZhiyuEditorAdapter.replaceContent(resultBox, fullContent);
                            } else {
                                resultBox.textContent = fullContent;
                            }
                        }
                        if (normalized.removedChapterCount > 0) {
                            Utils.appendLog(null, '已自动移除第一阶段误生成的章节粗纲，只保留基础设定', 'warn');
                        }
                    };
                    const enforceChapterStageScope = (segmentStartLength) => {
                        const normalized = normalizeDirectOutlineChapterStageContent(
                            fullContent,
                            segmentStartLength,
                            normalizeOutlineChapterStageSegment
                        );
                        if (!normalized.changed) return;
                        fullContent = normalized.content;
                        const visible = window.updateOutlineGenerationRuntime?.(fullContent, generationRuntime) !== false;
                        if (visible) {
                            if (typeof window.ZhiyuEditorAdapter?.replaceContent === 'function') {
                                window.ZhiyuEditorAdapter.replaceContent(resultBox, fullContent);
                            } else {
                                resultBox.textContent = fullContent;
                            }
                        }
                        if (normalized.removedPrefix) {
                            Utils.appendLog(null, '已自动移除章节阶段在首个章节标题前的说明文字', 'warn');
                        }
                    };

                    try {
                        if (modelCfg?.base && modelCfg?.model) {
                            const customApiConfig = { ...modelCfg, maxTokens: outlinePlan.segmentMaxTokens };
                            if (outlinePlan.total > 1) {
                                Utils.appendLog(null, '✍️ 大纲分段生成：' + outlinePlan.total + '段，避免长大纲被截断', '');
                            }
                            for (let seg = 1; seg <= outlinePlan.total; seg++) {
                                // 每一段都是独立 API 请求；思考标签状态不能跨请求继承，
                                // 否则上一段未闭合的 <think> 会吞掉下一段的全部章节粗纲。
                                const outlineStreamState = { started: false };
                                const segmentPrompt = buildSegmentedOutlinePrompt(userMessage, wcKey, wcLabel, outlinePlan, seg, fullContent);
                                const segmentStartLength = fullContent.length;
                                let segmentError = null;
                                const segmentLabel = '大纲第 ' + seg + '/' + outlinePlan.total + ' 段';
                                Utils.appendLog(null, outlinePlan.total > 1 ? ('✍️ 正在生成' + segmentLabel + '...') : '✍️ 正在生成大纲...');
                                window.setOutlineStep?.(outlinePlan.total > 1 ? ('正在生成' + segmentLabel + '...') : '正在生成大纲...', true);
                                await window.streamGenerate(
                                    customApiConfig,
                                    systemPrompt,
                                    segmentPrompt,
                                    (chunk) => {
                                        const cleanChunk = window.normalizeOutlineStreamText?.(chunk, outlineStreamState) ?? chunk;
                                        if (!cleanChunk) return;
                                        fullContent += cleanChunk;
                                        const visible = window.updateOutlineGenerationRuntime?.(fullContent, generationRuntime) !== false;
                                        if (visible) window.appendOutlineStreamText?.(resultBox, cleanChunk, outlineStreamState, { normalized: true });
                                    },
                                    (final) => {
                                        if (fullContent.length !== segmentStartLength || !String(final || '').trim()) return;
                                        const cleanFinal = window.normalizeOutlineStreamText?.(final, outlineStreamState) ?? final;
                                        if (!cleanFinal) return;
                                        fullContent += cleanFinal;
                                        const visible = window.updateOutlineGenerationRuntime?.(fullContent, generationRuntime) !== false;
                                        if (visible) window.appendOutlineStreamText?.(resultBox, cleanFinal, outlineStreamState, { normalized: true });
                                    },
                                    (err) => {
                                        segmentError = err instanceof Error
                                            ? err
                                            : new Error(String(err || '大纲生成失败'));
                                    },
                                    abortController.signal,
                                    { outlineStageKind: seg === 1 ? 'foundation' : 'chapters' }
                                );
                                if (segmentError) throw segmentError;
                                if (abortController.signal.aborted) throw new DOMException('已停止生成', 'AbortError');
                                ensureOutlineSegmentOutput(fullContent, segmentStartLength, seg, abortController.signal);
                                if (seg === 1) enforceFoundationScope(segmentStartLength);
                                else enforceChapterStageScope(segmentStartLength);
                                if (outlinePlan.total > 1 && seg < outlinePlan.total) {
                                    fullContent += '\n\n';
                                    const visible = window.updateOutlineGenerationRuntime?.(fullContent, generationRuntime) !== false;
                                    if (visible) window.appendOutlineStreamText?.(resultBox, '\n\n', outlineStreamState);
                                    Utils.appendLog(null, '✅ ' + segmentLabel + '完成，继续下一阶段', 'success');
                                }
                            }
                            finishSegmentedOutlineSuccess();
                        }
                    } catch (err) {
                        finishOutlineError(err);
                    } finally {
                        window.setOutlineStep?.('', false);
                    }
                });

    }

    window.bindOutlineActions = bindOutlineActions;
    window.ensureOutlineSegmentCompleted = ensureOutlineSegmentCompleted;
    window.ensureOutlineSegmentOutput = ensureOutlineSegmentOutput;
    window.normalizeDirectOutlineFoundationContent = normalizeDirectOutlineFoundationContent;
    window.normalizeDirectOutlineChapterStageContent = normalizeDirectOutlineChapterStageContent;
    window.getFunctionalLinkedFileBlocks = function() {
        const AppState = window.ZHIYU_APP_STATE || window.AppState;
        const files = Array.isArray(AppState?.outline?.functionalLinkedFiles) ? AppState.outline.functionalLinkedFiles : [];
        return files.map(function(file) {
            return Object.assign({}, file, { name: file.name || '未命名文件' });
        });
    };
    window.ZHIYU_OUTLINE_ACTIONS_READY = true;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindOutlineActions, { once: true });
    } else {
        bindOutlineActions();
    }
})(window, document);
