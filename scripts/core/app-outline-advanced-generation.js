(function(window) {
    'use strict';
    const AppState = window.ZHIYU_APP_STATE || window.AppState;
    const state = AppState.outline;
    const Toast = window.ZHIYU_TOAST || window.Toast || { warn() {}, success() {} };

    function getAdvancedOutlineModelId() { return typeof window.getModelIdForScope === 'function' ? window.getModelIdForScope('outline') : ''; }
    function getAdvancedOutlineModelConfig() {
        if (typeof window.getAdvancedOutlineExecutionModelConfig === 'function') {
            return window.getAdvancedOutlineExecutionModelConfig();
        }
        const config = typeof window.getOutlineModelConfig === 'function' ? window.getOutlineModelConfig() : window.getSelectedModelConfig?.();
        return config?.base && config?.model ? config : null;
    }
    function getAdvancedOutlineRequestUnits(wcKey) { return window.getAdvancedOutlineRequestRule?.(wcKey)?.normalCalls || 1; }
    function getAdvancedOutlineLinkedFilesText() {
        const bookName = typeof window.getMemoryLinkBookName === 'function'
            ? window.getMemoryLinkBookName('outlineAdvanced')
            : (document.getElementById('bookSel')?.value || AppState.chapter?.book || '');
        const files = state.outlineAdvancedLinkedFiles || [];
        if (!files.length) return '';
        if (typeof window.buildAiReferenceContext !== 'function') throw new Error('参考文件说明模块未加载，请刷新页面后重试');
        return window.buildAiReferenceContext(bookName, files, 'advanced_outline').text;
    }
    function getAdvancedOutlineUserInputs() {
        const genreList = (typeof window.getOutlineGenresForMode === 'function'
            ? window.getOutlineGenresForMode('advanced')
            : (state.outlineAdvancedGenres || state.genres || [])).slice();
        const customGenre = document.getElementById('outlineAdvancedCustomGenre')?.value.trim() || '';
        if (customGenre && !genreList.includes(customGenre)) genreList.push(customGenre);
        const summary = document.getElementById('outlineAdvancedCoreSummary')?.value.trim() || '';
        const preferenceTags = typeof window.getGenrePreferenceTags === 'function'
            ? window.getGenrePreferenceTags({ key: 'advanced', genres: genreList }, summary)
            : [];
        return {
            genres: genreList.join('、'),
            genreList,
            preferenceTags,
            scale: window.getOutlineScaleProfile(window.getAdvancedOutlineWcKey()),
            summary,
            genreContextPrompt: typeof window.buildGenreContextPrompt === 'function' ? window.buildGenreContextPrompt(genreList, preferenceTags) : '',
            linkedFilesText: getAdvancedOutlineLinkedFilesText(),
        };
    }
    async function readSseResponse(response, onText) {
        if (!response.ok) {
            const raw = await response.text();
            const message = typeof window.parseBackendErrorMessage === 'function'
                ? window.parseBackendErrorMessage(response.status, raw, '高级大纲生成失败')
                : (raw || '高级大纲生成失败');
            const error = new Error(message);
            error.status = response.status;
            error.rawBody = raw;
            throw error;
        }
        const result = await window.ZhiyuSseContract.collectZhiyuSseText(response, { onText });
        return window.cleanAdvancedOutlineText(result.content);
    }
    async function runAdvancedOutlineStream(prompt, context) {
        const model = getAdvancedOutlineModelConfig();
        if (!model) throw new Error('请先添加并选择一个可用的自备模型。');
        const ctx = context || {};
        let output = '';
        let streamError = null;
        await window.streamGenerate(
            { ...model, maxTokens: ctx.maxTokens || 8192 },
            '你是专业小说大纲规划助手。全部可见内容必须使用简体中文；严格按系统内置格式输出，不输出 <think> 标签、推理过程或解释。',
            prompt,
            chunk => { output += chunk; ctx.onText?.(chunk); },
            final => { output = final || output; },
            err => { streamError = err instanceof Error ? err : new Error(String(err || '高级大纲生成失败')); },
            ctx.signal || new AbortController().signal
        );
        if (streamError) throw streamError;
        if (!String(output || '').trim()) throw new Error('自备模型没有返回高级大纲内容');
        return window.cleanAdvancedOutlineText(output);
    }
    function buildAdvancedMasterOutlinePrompt(input, segment, previous) {
        const prompts = window.ZHIYU_ADVANCED_OUTLINE_PROMPTS || {};
        const base = segment.part === 3 ? prompts.masterPart3 : (segment.part === 2 ? prompts.masterPart2 : prompts.master);
        return [
            base || '请生成可继续拆分的小说母大纲。',
            window.buildAdvancedPromptHeader(input),
            previous ? '【前文已生成母纲，必须承接且不得重复】\n' + previous.slice(-10000) : ''
        ].filter(Boolean).join('\n\n');
    }

    function setAdvancedOutlineTextPreservingScroll(target, text) {
        if (!target) return;
        const scrollTop = target.scrollTop;
        target.textContent = text;
        target.scrollTop = scrollTop;
    }
    function appendAdvancedStreamText(target, text, streamState) {
        if (!target) return;
        const scrollTop = target.scrollTop;
        window.appendOutlineStreamText?.(target, text, streamState, { normalized: true });
        target.scrollTop = scrollTop;
    }
    function getAdvancedStageGenerationProgressBase(beforeContent, partialContent, action) {
        return action === 'complete'
            ? window.cleanAdvancedOutlineText([beforeContent, partialContent].filter(Boolean).join('\n\n'))
            : String(beforeContent || '');
    }
    function buildAdvancedSegmentCompletionPrompt(basePrompt, currentContent, segment) {
        return basePrompt + '\n\n【当前未完成内容】\n' + String(currentContent || '').slice(-8000)
            + '\n\n【补全要求】只继续补全“' + (segment?.label || '当前段') + '”缺少的内容，不要重复、重写或推翻已经生成的内容。';
    }
    function selectAdvancedOutlineRecoveryAction(recovery) {
        if (recovery?.mode === 'repair') return 'repair';
        return recovery?.mode === 'retry' ? 'retry' : (recovery?.mode === 'complete' ? 'complete' : 'fresh');
    }
    function rememberAdvancedOutlineRecovery(recovery) {
        state.outlineAdvancedRecoveryState = recovery || null;
        const retryButton = document.getElementById('btnRetryAdvancedSegment');
        const completeButton = document.getElementById('btnCompleteAdvancedSegment');
        const repairingPlanning = recovery?.mode === 'repair';
        if (retryButton) retryButton.style.display = recovery && !repairingPlanning ? '' : 'none';
        if (completeButton) {
            completeButton.style.display = recovery ? '' : 'none';
            completeButton.textContent = repairingPlanning ? '修复阶段规划' : '从中断处补全';
        }
    }
    function reportAdvancedStageGenerationCompleted(completeness) {
        window.ZHIYU_UTILS?.appendLog?.(null, '✅ 阶段粗纲生成完成', 'success');
        if (completeness?.warning) {
            window.ZHIYU_UTILS?.appendLog?.(null, '⚠️ ' + completeness.warning, 'warn');
            Toast.warn('阶段粗纲已生成。' + completeness.warning);
        } else {
            Toast.success('阶段粗纲生成完成');
        }
        return true;
    }
    async function startAdvancedOutlineGenerate(button, resultBox, resumeState) {
        let input;
        try {
            input = getAdvancedOutlineUserInputs();
        } catch (referenceError) {
            Toast.warn(referenceError?.message || '参考文件读取失败，请重新选择后再试');
            return false;
        }
        const action = selectAdvancedOutlineRecoveryAction(resumeState);
        const repairingPlanning = action === 'repair';
        if (!repairingPlanning && !input.genres) { Toast.warn('请至少选择或输入一个题材'); return; }
        const schedule = repairingPlanning
            ? [{ index: 1, total: 1, part: 1, label: '阶段与卷规划修复', missingStages: resumeState?.missingStages || [] }]
            : window.getAdvancedOutlineSegmentSchedule(window.getAdvancedOutlineWcKey());
        const startIndex = action === 'fresh' ? 0 : Math.max(0, Math.min(schedule.length - 1, Number(resumeState?.failedIndex ?? resumeState?.nextIndex ?? 0)));
        let output = repairingPlanning
            ? String(resumeState?.content || '')
            : action === 'retry'
            ? String(resumeState?.beforeContent || resumeState?.content || '')
            : String(resumeState?.content || '');
        if (window.hasActiveOutlineGenerationRuntime?.()) {
            Toast.warn('已有大纲或功能内容正在生成，请等待完成或先停止当前任务');
            return false;
        }
        const generationRuntime = window.startOutlineGenerationRuntime?.({
            mode: 'outline',
            subMode: 'advanced',
            outputKind: 'master',
            content: output
        });
        if (!generationRuntime) {
            Toast.warn('已有大纲或功能内容正在生成，请等待完成或先停止当前任务');
            return false;
        }
        const controller = new AbortController();
        window.outlineAbortController = controller;
        button.dataset.generating = 'true'; button.textContent = '停止生成';
        setAdvancedOutlineTextPreservingScroll(resultBox, output);
        resultBox.style.background = '#e3f2fd';
        window.setOutlineStep('正在整理题材、篇幅、剧情梗概和参考资料...', true);
        window.ZHIYU_UTILS?.appendLog?.(null, '开始生成高级大纲...', '');
        if (schedule.length > 1) {
            window.ZHIYU_UTILS?.appendLog?.(null, '✍️ 高级大纲分段生成：' + schedule.length + ' 段，避免长母纲被截断', '');
        }
        const generationBookName = generationRuntime.bookName;
        const isGenerationBookCurrent = function() {
            const uid = String(window.AccountDataScope?.getActiveUid?.() || AppState.auth?.uid || 'guest');
            return uid === generationRuntime.accountUid && String(AppState.chapter.book || '') === generationBookName;
        };
        const isGenerationViewCurrent = function() {
            return window.doesOutlineGenerationRuntimeMatchCurrent?.(generationRuntime, 'outline') !== false;
        };
        rememberAdvancedOutlineRecovery(null);
        let activeIndex = startIndex;
        let beforeSegmentContent = output;
        let partialContent = action === 'complete' ? String(resumeState?.partialContent || '') : '';
        const requiredBaseInput = window.buildAdvancedPromptHeader(input);
        try {
            const model = getAdvancedOutlineModelConfig();
            if (!model) throw new Error('当前高级大纲模型不可用，请重新选择。');
            for (let index = startIndex; index < schedule.length; index += 1) {
                activeIndex = index;
                const segment = schedule[index];
                beforeSegmentContent = output;
                let streamedContent = '';
                const streamState = { started: false };
                window.setOutlineStep(`正在生成${segment.label}...`, true);
                window.ZHIYU_UTILS?.appendLog?.(
                    null,
                    schedule.length > 1
                        ? ('✍️ 正在生成高级大纲第 ' + (index + 1) + '/' + schedule.length + ' 段（' + segment.label + '）...')
                        : '✍️ 正在生成高级大纲...',
                    ''
                );
                let prompt = repairingPlanning
                    ? window.buildAdvancedMasterPlanningRepairPrompt(output, segment.missingStages)
                    : buildAdvancedMasterOutlinePrompt(input, segment, output);
                if (!prompt.includes(requiredBaseInput)) {
                    prompt += '\n\n' + requiredBaseInput;
                }
                if (action === 'complete' && index === startIndex) prompt = buildAdvancedSegmentCompletionPrompt(prompt, partialContent || output, segment);
                const part = await runAdvancedOutlineStream(prompt, {
                    signal: controller.signal,
                    onText: function(text) {
                        const cleanText = window.normalizeOutlineStreamText?.(text, streamState) ?? text;
                        if (!cleanText) return;
                        streamedContent += cleanText;
                        if (!repairingPlanning) {
                            const runtimeContent = output + (output && streamedContent ? '\n\n' : '') + streamedContent;
                            const visible = window.updateOutlineGenerationRuntime?.(runtimeContent, generationRuntime) !== false;
                            if (visible) appendAdvancedStreamText(resultBox, cleanText, streamState);
                        }
                    }
                });
                const completedPart = (action === 'complete' && index === startIndex ? partialContent : '') + part;
                if (!completedPart.trim()) throw new Error(segment.label + '没有收到有效正文内容，本次已停止。');
                if (repairingPlanning) {
                    output = window.cleanAdvancedOutlineText(window.mergeAdvancedMasterPlanningRepair(output, completedPart));
                    if (isGenerationViewCurrent()) setAdvancedOutlineTextPreservingScroll(resultBox, output);
                } else {
                    output += (output && completedPart ? '\n\n' : '') + completedPart;
                }
                window.updateOutlineGenerationRuntime?.(output, generationRuntime);
                if (schedule.length > 1) {
                    window.ZHIYU_UTILS?.appendLog?.(
                        null,
                        '✅ 高级大纲第 ' + (index + 1) + '/' + schedule.length + ' 段完成'
                            + (index < schedule.length - 1 ? '，继续下一段' : ''),
                        'success'
                    );
                }
                partialContent = '';
                if (!repairingPlanning && isGenerationBookCurrent()) {
                    rememberAdvancedOutlineRecovery({ type: 'master', mode: 'retry', failedIndex: index + 1, nextIndex: index + 1, content: output, beforeContent: output, partialContent: '' });
                }
            }
            const planningValidation = window.validateAdvancedMasterStagePlanning(output);
            if (!planningValidation.ok) {
                const keptContent = window.cleanAdvancedOutlineText(output);
                window.saveAdvancedOutlineDraft?.(generationBookName, keptContent);
                if (isGenerationBookCurrent()) {
                    state.advancedContent = keptContent;
                    state.advancedOutputKind = 'master';
                    rememberAdvancedOutlineRecovery({ type: 'master', mode: 'repair', failedIndex: 0, nextIndex: 0, content: output, beforeContent: output, partialContent: '', missingStages: planningValidation.missingStages, reason: planningValidation.reason });
                }
                if (isGenerationViewCurrent()) setAdvancedOutlineTextPreservingScroll(resultBox, keptContent);
                window.ZHIYU_UTILS?.appendLog?.(null, '高级大纲阶段规划待补全：' + planningValidation.reason, 'warn');
                Toast.warn(planningValidation.reason + ' 已保留当前内容，可点击“修复阶段规划”。');
                return false;
            }
            const finalContent = window.cleanAdvancedOutlineText(output);
            window.saveAdvancedOutlineDraft?.(generationBookName, finalContent);
            if (isGenerationBookCurrent()) {
                state.advancedContent = finalContent;
                state.advancedOutputKind = 'master';
                state.advancedStageContent = '';
                state.advancedStageIdentity = null;
                rememberAdvancedOutlineRecovery(null);
                window.updateAdvancedOutlineStageOptions();
            }
            if (isGenerationViewCurrent()) setAdvancedOutlineTextPreservingScroll(resultBox, finalContent);
            window.ZHIYU_UTILS?.appendLog?.(null, '✅ 高级大纲生成完成', 'success');
            Toast.success('高级大纲生成完成');
            return true;
        } catch(error) {
            const visibleText = isGenerationViewCurrent()
                ? (resultBox.textContent || '')
                : (generationRuntime.content || output || '');
            const baseText = beforeSegmentContent || '';
            const capturedPartial = visibleText.startsWith(baseText) ? visibleText.slice(baseText.length).trim() : visibleText.trim();
            const keptContent = window.cleanAdvancedOutlineText(visibleText || baseText);
            const reason = typeof window.formatAiErrorForDisplay === 'function'
                ? window.formatAiErrorForDisplay(error, '高级大纲生成失败')
                : (error?.message || String(error) || '未知原因');
            window.saveAdvancedOutlineDraft?.(generationBookName, keptContent);
            if (isGenerationBookCurrent()) {
                state.advancedContent = keptContent;
                state.advancedOutputKind = 'master';
                rememberAdvancedOutlineRecovery({ type: 'master', mode: repairingPlanning ? 'repair' : 'retry', failedIndex: activeIndex, nextIndex: activeIndex, content: repairingPlanning ? keptContent : beforeSegmentContent, beforeContent: repairingPlanning ? keptContent : beforeSegmentContent, partialContent: repairingPlanning ? '' : capturedPartial, missingStages: resumeState?.missingStages || [], reason });
            }
            if (window.isAbortLikeError?.(error)) {
                window.ZHIYU_UTILS?.appendLog?.(null, '已停止高级大纲生成，当前内容已保留', 'warn');
                Toast.warn('已停止生成，当前内容已保留。');
            } else {
                window.ZHIYU_UTILS?.appendLog?.(null, '高级大纲生成中断：' + reason, 'error');
                Toast.error('当前段生成未完成：' + reason + '；已保留成功内容，可重试或补全。');
            }
            return false;
        } finally {
            const visible = isGenerationViewCurrent();
            window.finishOutlineGenerationRuntime?.(visible ? (resultBox.textContent || output) : (generationRuntime.content || output), generationRuntime);
            if (visible) resultBox.style.background = '';
            button.disabled = false;
            delete button.dataset.generating; button.textContent = '生成大纲'; window.setOutlineStep('', false); delete window.outlineAbortController;
        }
    }
    function stopAdvancedOutlineStageGenerate(button) {
        if (button?.dataset?.generating !== 'true') return false;
        const controller = window.outlineAbortController;
        if (controller && !controller.signal.aborted) {
            controller.abort(new DOMException('user_cancelled', 'AbortError'));
        }
        button.textContent = '正在停止...';
        button.disabled = true;
        return true;
    }
    async function startAdvancedOutlineStageGenerate(button, resumeState) {
        const action = selectAdvancedOutlineRecoveryAction(resumeState);
        const key = resumeState?.stageKey || document.getElementById('outlineAdvancedStageSelect')?.value;
        const stageBookName = String(AppState.chapter.book || '');
        const stageBookIdentity = window.getAdvancedOutlineBookIdentity?.(stageBookName) || stageBookName;
        const master = window.getAdvancedOutlineMasterSource();
        const masterValidation = window.validateAdvancedMasterStagePlanning(master);
        if (!masterValidation.ok) {
            rememberAdvancedOutlineRecovery({
                type: 'master',
                mode: 'repair',
                failedIndex: 0,
                nextIndex: 0,
                content: master,
                beforeContent: master,
                partialContent: '',
                missingStages: masterValidation.missingStages || [],
                reason: masterValidation.reason,
            });
            Toast.warn(masterValidation.reason + ' 请先点击“修复阶段规划”。');
            return false;
        }
        const plannedStages = Array.isArray(state.outlineAdvancedStages) && state.outlineAdvancedStages.length
            ? state.outlineAdvancedStages
            : window.extractAdvancedOutlineStages(master);
        const stage = plannedStages.find(item => item.key === key);
        if (!stage) { Toast.warn('请先选择阶段'); return; }
        window.initializeAdvancedOutlineLinkDefaults?.(
            window.getMemBooks?.()?.[stageBookName],
            stageBookName,
            state
        );
        window.updateLinkedMemoryCount?.();
        const stageNo = Number(String(key || '').replace(/^S/i, ''));
        let previousStageSnapshot = null;
        if (Number.isFinite(stageNo) && stageNo > 1) {
            const previousStageKey = 'S' + String(stageNo - 1).padStart(2, '0');
            const resolvedHandoff = await window.resolveAdvancedStageHandoffSnapshot(
                stageBookName,
                previousStageKey,
                master
            );
            const currentBookIdentity = window.getAdvancedOutlineBookIdentity?.(String(AppState.chapter.book || ''))
                || String(AppState.chapter.book || '');
            if (currentBookIdentity !== stageBookIdentity) {
                Toast.warn('账号或书籍已经切换，本次阶段生成已停止，请重新选择后再试。');
                return false;
            }
            if (!resolvedHandoff.ok) {
                Toast.warn(resolvedHandoff.reason);
                return false;
            }
            previousStageSnapshot = resolvedHandoff.snapshot;
        }
        const expected = window.getAdvancedStageExpectedStart(master, key, previousStageSnapshot);
        if (!expected.ok) { Toast.warn(expected.message); return false; }
        const actualStageStart = expected.nextChapter;
        const schedule = window.getAdvancedStageSegmentSchedule(
            window.getAdvancedOutlineWcKey(),
            stage,
            actualStageStart
        );
        const startIndex = action === 'fresh'
            ? 0
            : Math.max(0, Math.min(schedule.length - 1, Number(resumeState?.failedIndex ?? resumeState?.nextIndex ?? 0)));
        let output = action === 'fresh' ? '' : String(resumeState?.beforeContent || resumeState?.content || '');
        let partialContent = action === 'complete' ? String(resumeState?.partialContent || '') : '';
        const recoveredNumbers = window.getAdvancedStageChapterNumbers(
            window.cleanAdvancedOutlineText([output, partialContent].filter(Boolean).join('\n\n'))
        );
        if (recoveredNumbers.length) {
            if (recoveredNumbers[0] !== actualStageStart) {
                Toast.warn('上一阶段实际边界已经变化，当前恢复稿不是从第' + actualStageStart + '章开始。请重新生成本阶段。');
                return false;
            }
            for (let index = 1; index < recoveredNumbers.length; index += 1) {
                if (recoveredNumbers[index] !== recoveredNumbers[index - 1] + 1) {
                    Toast.warn('当前阶段恢复稿章号不连续，请检查后重新生成本阶段。');
                    return false;
                }
            }
        }
        if (window.hasActiveOutlineGenerationRuntime?.()) {
            Toast.warn('已有大纲或功能内容正在生成，请等待完成或先停止当前任务');
            return false;
        }
        const generationRuntime = window.startOutlineGenerationRuntime?.({
            mode: 'outline',
            subMode: 'advanced',
            outputKind: 'stage',
            stageKey: key,
            content: window.cleanAdvancedOutlineText([output, partialContent].filter(Boolean).join('\n\n'))
        });
        if (!generationRuntime) {
            Toast.warn('已有大纲或功能内容正在生成，请等待完成或先停止当前任务');
            return false;
        }
        const box = document.getElementById('outlineResultBox');
        const controller = new AbortController();
        window.outlineAbortController = controller;
        button.disabled = false;
        button.dataset.generating = 'true';
        button.textContent = '停止生成';
        window.setOutlineStep('正在生成阶段粗纲...', true);
        setAdvancedOutlineTextPreservingScroll(
            box,
            window.cleanAdvancedOutlineText([output, partialContent].filter(Boolean).join('\n\n'))
        );
        box.style.background = '#e3f2fd';
        state.advancedOutputKind = 'stage';
        state.advancedStageIdentity = { key: stage.key, title: stage.title, startChapter: stage.startChapter, endChapter: stage.endChapter };
        window.ZHIYU_UTILS?.appendLog?.(null, '开始根据所选母纲生成阶段粗纲...', '');
        if (schedule.length > 1) {
            window.ZHIYU_UTILS?.appendLog?.(
                null,
                '✍️ 长篇阶段粗纲分2段连续生成：前半段完成后自动承接后半段',
                ''
            );
        }
        const generationBookName = generationRuntime.bookName;
        const isGenerationBookCurrent = function() {
            const uid = String(window.AccountDataScope?.getActiveUid?.() || AppState.auth?.uid || 'guest');
            return uid === generationRuntime.accountUid && String(AppState.chapter.book || '') === generationBookName;
        };
        const isGenerationViewCurrent = function() {
            return window.doesOutlineGenerationRuntimeMatchCurrent?.(generationRuntime, 'outline') !== false;
        };
        let activeIndex = startIndex;
        let beforeSegmentContent = output;
        let activePartialContent = partialContent;
        let streamedContent = '';
        const requiredStageIdentity = [
            '【阶段粗纲任务身份】',
            '书籍：' + stageBookIdentity,
            '阶段：' + stage.key,
            '实际起始章：' + actualStageStart,
            '目标章数：' + (stage.chapterTarget || ''),
        ].join('\n');
        try {
            const model = getAdvancedOutlineModelConfig();
            if (!model) throw new Error('当前高级大纲模型不可用，请重新选择。');
            for (let index = startIndex; index < schedule.length; index += 1) {
                activeIndex = index;
                const segment = schedule[index];
                beforeSegmentContent = output;
                activePartialContent = action === 'complete' && index === startIndex ? partialContent : '';
                streamedContent = '';
                const streamState = { started: false };
                const progressBaseContent = window.cleanAdvancedOutlineText(
                    [output, activePartialContent].filter(Boolean).join('\n\n')
                );
                const progress = window.getAdvancedStageChapterProgress(progressBaseContent);
                const expectedStart = progress.chapterCount ? progress.nextChapter : expected.nextChapter;
                window.setOutlineStep(
                    schedule.length > 1
                        ? ('正在生成阶段粗纲第' + (index + 1) + '/' + schedule.length + '段...')
                        : '正在生成阶段粗纲...',
                    true
                );
                window.ZHIYU_UTILS?.appendLog?.(
                    null,
                    schedule.length > 1
                        ? ('✍️ 正在生成阶段粗纲第 ' + (index + 1) + '/' + schedule.length + ' 段（' + segment.label + '）...')
                        : '✍️ 正在生成阶段粗纲...',
                    ''
                );
                let prompt = window.buildAdvancedStageOutlinePrompt(master, {
                    stageKey: key,
                    chapterProgress: { nextChapter: expectedStart },
                    actualStageStart,
                    useActualBoundary: !!previousStageSnapshot,
                });
                const handoffContext = window.formatAdvancedStageHandoffContext?.(previousStageSnapshot);
                if (handoffContext) prompt += '\n\n' + handoffContext;
                prompt = window.buildAdvancedStageSegmentPrompt(prompt, {
                    stageKey: key,
                    stage,
                    segment,
                    actualStageStart,
                    expectedStart,
                    completedContent: progressBaseContent,
                });
                if (!prompt.includes(requiredStageIdentity)) prompt += '\n\n' + requiredStageIdentity;
                if (activePartialContent) {
                    prompt = buildAdvancedSegmentCompletionPrompt(
                        prompt,
                        activePartialContent,
                        segment
                    );
                }
                const part = await runAdvancedOutlineStream(prompt, {
                    signal: controller.signal,
                    onText: function(text) {
                        const cleanText = window.normalizeOutlineStreamText?.(text, streamState) ?? text;
                        if (!cleanText) return;
                        streamedContent += cleanText;
                        const runtimeContent = window.cleanAdvancedOutlineText(
                            [output, activePartialContent, streamedContent].filter(Boolean).join('\n\n')
                        );
                        const visible = window.updateOutlineGenerationRuntime?.(runtimeContent, generationRuntime) !== false;
                        if (visible) appendAdvancedStreamText(box, cleanText, streamState);
                    },
                    maxTokens: 32768
                });
                const completedPart = activePartialContent + part;
                if (!completedPart.trim()) throw new Error(segment.label + '没有收到有效章节粗纲，本次已停止。');
                const completedOutput = window.cleanAdvancedOutlineText(
                    [output, completedPart].filter(Boolean).join('\n\n')
                );
                const progressValidation = window.validateAdvancedStageSegmentProgress(
                    progressBaseContent,
                    completedOutput,
                    expectedStart,
                    segment
                );
                if (!progressValidation.ok) throw new Error(progressValidation.reason);
                output = completedOutput;
                partialContent = '';
                activePartialContent = '';
                window.updateOutlineGenerationRuntime?.(output, generationRuntime);
                if (isGenerationViewCurrent()) setAdvancedOutlineTextPreservingScroll(box, output);
                if (schedule.length > 1) {
                    window.ZHIYU_UTILS?.appendLog?.(
                        null,
                        '✅ 阶段粗纲第 ' + (index + 1) + '/' + schedule.length + ' 段完成'
                            + (index < schedule.length - 1 ? '，继续生成后半段' : ''),
                        'success'
                    );
                }
                if (isGenerationBookCurrent() && index < schedule.length - 1) {
                    rememberAdvancedOutlineRecovery({
                        type: 'stage',
                        stageKey: key,
                        mode: 'retry',
                        failedIndex: index + 1,
                        nextIndex: index + 1,
                        content: output,
                        beforeContent: output,
                        partialContent: '',
                    });
                }
            }
            const completeness = window.validateAdvancedStageCompleteness(output, stage, actualStageStart);
            if (!completeness.ok) throw new Error(completeness.reason);
            if (isGenerationBookCurrent()) {
                state.advancedOutputKind = 'stage';
                state.advancedStageContent = output;
                state.advancedStageIdentity = { key: stage.key, title: stage.title, startChapter: stage.startChapter, endChapter: stage.endChapter };
                rememberAdvancedOutlineRecovery(null);
            }
            if (isGenerationViewCurrent()) setAdvancedOutlineTextPreservingScroll(box, output);
            window.updateAdvancedOutlineStageOptions?.();
            return reportAdvancedStageGenerationCompleted(completeness);
        } catch(error) {
            const capturedPartial = activePartialContent + streamedContent;
            const keptContent = window.cleanAdvancedOutlineText(
                [beforeSegmentContent, capturedPartial].filter(Boolean).join('\n\n')
            );
            const reason = typeof window.formatAiErrorForDisplay === 'function'
                ? window.formatAiErrorForDisplay(error, '阶段粗纲生成失败')
                : (error?.message || String(error) || '未知原因');
            if (isGenerationBookCurrent()) {
                state.advancedOutputKind = 'stage';
                state.advancedStageContent = keptContent;
                state.advancedStageIdentity = { key: stage.key, title: stage.title, startChapter: stage.startChapter, endChapter: stage.endChapter };
                rememberAdvancedOutlineRecovery({
                    type: 'stage',
                    stageKey: key,
                    mode: 'retry',
                    failedIndex: activeIndex,
                    nextIndex: activeIndex,
                    content: beforeSegmentContent,
                    beforeContent: beforeSegmentContent,
                    partialContent: capturedPartial,
                    reason,
                });
            }
            if (window.isAbortLikeError?.(error)) {
                window.ZHIYU_UTILS?.appendLog?.(null, '已停止阶段粗纲生成，当前内容已保留', 'warn');
                Toast.warn('已停止生成，当前内容已保留。');
            } else {
                window.ZHIYU_UTILS?.appendLog?.(null, '阶段粗纲生成中断：' + reason, 'error');
                Toast.error('阶段粗纲当前段未完成：' + reason + '；已保留成功内容，可重试或补全。');
            }
            return false;
        } finally {
            const visible = isGenerationViewCurrent();
            window.finishOutlineGenerationRuntime?.(
                visible ? (box.textContent || output) : (generationRuntime.content || output),
                generationRuntime
            );
            if (visible) box.style.background = '';
            button.disabled = false;
            delete button.dataset.generating;
            button.textContent = '生成阶段粗纲';
            window.setOutlineStep('', false);
            if (window.outlineAbortController === controller) delete window.outlineAbortController;
        }
    }
    async function recoverAdvancedOutlineSegment(mode, button) {
        const recovery = state.outlineAdvancedRecoveryState;
        if (!recovery) { Toast.warn('暂无可恢复的高级大纲任务'); return; }
        const resume = Object.assign({}, recovery, { mode: recovery.mode === 'repair' ? 'repair' : (mode === 'retry' ? 'retry' : 'complete') });
        if (resume.stageKey) return startAdvancedOutlineStageGenerate(button || document.getElementById('btnStartAdvancedStageOutlineBottom'), resume);
        return startAdvancedOutlineGenerate(button || document.getElementById('btnStartOutline'), document.getElementById('outlineResultBox'), resume);
    }
    document.getElementById('btnStartAdvancedStageOutlineBottom')?.addEventListener('click', function() {
        if (stopAdvancedOutlineStageGenerate(this)) return;
        startAdvancedOutlineStageGenerate(this);
    });
    document.getElementById('btnRetryAdvancedSegment')?.addEventListener('click', function() { recoverAdvancedOutlineSegment('retry', this); });
    document.getElementById('btnCompleteAdvancedSegment')?.addEventListener('click', function() { recoverAdvancedOutlineSegment('complete', this); });
    Object.assign(window, { getAdvancedOutlineModelId, getAdvancedOutlineModelConfig, getAdvancedOutlineRequestUnits, getAdvancedOutlineLinkedFilesText, getAdvancedOutlineUserInputs, readAdvancedOutlineSseResponse: readSseResponse, runAdvancedOutlineStream, buildAdvancedMasterOutlinePrompt, buildAdvancedSegmentCompletionPrompt, getAdvancedStageGenerationProgressBase, selectAdvancedOutlineRecoveryAction, rememberAdvancedOutlineRecovery, reportAdvancedStageGenerationCompleted, stopAdvancedOutlineStageGenerate, startAdvancedOutlineGenerate, startAdvancedOutlineStageGenerate, recoverAdvancedOutlineSegment });
})(window);
