(function(window, document) {
    'use strict';

    function getDeps() {
        return {
            AppState: window.ZHIYU_APP_STATE || window.AppState,
            Utils: window.ZHIYU_UTILS || window.Utils,
            Toast: window.ZHIYU_TOAST || window.Toast,
            Modal: window.Modal,
            getSelectedModelConfig: window.getSelectedModelConfig,
            streamGenerate: window.streamGenerate,
            callLLMAPI: window.callLLMAPI,
            makeRequestId: window.makeRequestId,
            setConfirmUseState: window.setConfirmUseState,
            ensureAuthSessionForAction: window.ensureAuthSessionForAction,
            isAuthExpiredError: window.isAuthExpiredError,
            handleAuthExpired: window.handleAuthExpired,
            gB: window.gB,
            sB: window.sB,
            touchBook: window.touchBook,
            updateWordCount: window.updateWordCount,
            clearDraft: window.clearDraft,
            clearAIDetectHighlights: window.clearAIDetectHighlights || function() {},
            generateAllMemoryFiles: window.generateAllMemoryFiles,
            calculateChapterNumber: window.calculateChapterNumber,
            refreshTree: window.refreshTree
        };
    }

    function bindPolishActions() {
        if (bindPolishActions.bound) return;
        bindPolishActions.bound = true;

        const {
            AppState,
            Utils,
            Toast,
            Modal,
            getSelectedModelConfig,
            streamGenerate,
            callLLMAPI,
            makeRequestId,
            setConfirmUseState,
            ensureAuthSessionForAction,
            isAuthExpiredError,
            handleAuthExpired,
            gB,
            sB,
            touchBook,
            updateWordCount,
            clearDraft,
            clearAIDetectHighlights,
            generateAllMemoryFiles,
            calculateChapterNumber,
            refreshTree
        } = getDeps();

                // Polish modal open/reset UI is split into scripts/core/app-polish-modal-ui.js.
                const PolishModalUi = window.ZHIYU_POLISH_MODAL_UI || {};
                const resetPolishButtons = PolishModalUi.resetPolishButtons || function() {};
                const cancelPolish = PolishModalUi.cancelPolish || function() { return false; };
                const openRepolishModal = PolishModalUi.openRepolishModal || function() { return false; };
                const confirmPolish = PolishModalUi.confirmPolish || function() { return false; };
                const restorePolishOriginal = PolishModalUi.restorePolishOriginal || function() { return false; };
        
                document.getElementById('btnStartPolish')?.addEventListener('click',async function(){
                    if (window._polishSession?.running) {
                        Toast.warn('局部润色正在进行中，请等待当前任务完成');
                        return;
                    }
                    const instruction=document.getElementById('polishInstruction').value.trim();
                    if(!instruction){ Toast.warn('请描述您的修改想法'); return; }
                    const editor = document.getElementById('resultBox');
                    const polishSnapshot = PolishModalUi.resolvePolishSelectionSnapshot?.(
                        AppState.selection,
                        editor
                    );
                    if (!polishSnapshot) {
                        AppState.selection = {};
                        Toast.warn('正文或框选位置已发生变化，请重新框选要润色的段落');
                        return;
                    }
                    const selectedText = polishSnapshot.selectedText;
                    const polishHandle = window.preparePolishSelection?.({
                        editor,
                        selectedText,
                        fullContent: polishSnapshot.fullContent,
                        beforeText: polishSnapshot.beforeText,
                        afterText: polishSnapshot.afterText,
                        selectionStart: polishSnapshot.selectionStart,
                        selectionEnd: polishSnapshot.selectionEnd,
                        professionalFrom: polishSnapshot.professionalFrom,
                        professionalTo: polishSnapshot.professionalTo,
                        range: polishSnapshot.range,
                        bookName: AppState.chapter.book,
                        vi: AppState.chapter.vi,
                        ci: AppState.chapter.ci
                    });
                    if (!polishHandle) {
                        Toast.warn('无法固定本次润色选区，请重新框选后再试');
                        return;
                    }
                    Modal.close('polishModal');
        
                    const modelCfg = getSelectedModelConfig();
                    const prompt = `请对以下文本进行优化。
        
        【用户要求】${instruction}
        
        【原文】
        ${selectedText}
        
                    请直接输出优化后的文本，保持原意不变。不要解释、不要加引号。`;
        
                    let result = '';
                    const requestController = new AbortController();
                    const requestTimeout = window.setTimeout(function() {
                        const timeoutError = new Error('局部润色等待超时，请重试');
                        timeoutError.name = 'TimeoutError';
                        requestController.abort(timeoutError);
                    }, 120000);
                    const polishWaitLogToken = typeof Utils.beginExecutionLogWait === 'function'
                        ? Utils.beginExecutionLogWait('局部润色优化中', 'progress')
                        : '';
                    if (!polishWaitLogToken) {
                        Utils.appendLog(null, '局部润色优化中', 'progress');
                    }
                    try {
                        if (modelCfg.custom) {
                            const cfg = { ...modelCfg };
                            await streamGenerate(cfg, '你是专业的文字编辑。', prompt,
                                (c) => { result += c; },
                                (f) => { result = f; },
                                (error) => { throw error instanceof Error ? error : new Error(String(error || '优化失败')); },
                                requestController.signal
                            );
                        } else {
                            const resp = await callLLMAPI({ key: '', base: '', model: '' }, '你是专业的文字编辑。', prompt, modelCfg, {
                                requestFeature: 'local_polish',
                                requestUnits: 1,
                                requestId: makeRequestId('local_polish'),
                                signal: requestController.signal
                            });
                            result = resp?.content?.[0]?.text || '';
                        }

                        const polishCheck = window.validateAIPolishFinalText(result, selectedText);
                        if (!polishCheck.ok) {
                            Utils.appendLog(null, '优化失败：' + polishCheck.message, 'error');
                            restorePolishOriginal(polishHandle);
                            return;
                        }
                        result = polishCheck.content;

                        const applied = window.applyPolishResult?.({ selectedText, result, handle: polishHandle });
                        if (!applied) {
                            const sourceChanged = window._polishSession?.sourceChanged === true;
                            restorePolishOriginal(polishHandle);
                            Utils.appendLog(
                                null,
                                sourceChanged
                                    ? '正文已在等待期间发生变化，旧润色结果已丢弃，未覆盖当前内容'
                                    : '优化结果未能安全写回框选位置，原文已恢复，请重新框选后再试',
                                'error'
                            );
                            Toast.warn(sourceChanged
                                ? '正文已发生变化，旧润色结果未写入'
                                : '润色结果未能安全写回，原文已恢复');
                            return;
                        }

                        window.showPolishResultActions?.();
                        Utils.appendLog(null, '✅ 局部润色完成', 'success');
                    } catch(e) {
                        const errorMessage = typeof window.formatAiErrorForDisplay === 'function'
                            ? window.formatAiErrorForDisplay(e, '优化失败')
                            : String(e?.message || e || '优化失败');
                        Utils.appendLog(null, errorMessage, 'error');
                        Toast.error(errorMessage);
                        restorePolishOriginal(polishHandle);
                        return;
                    } finally {
                        window.clearTimeout(requestTimeout);
                        if (polishWaitLogToken && typeof Utils.endExecutionLogWait === 'function') {
                            Utils.endExecutionLogWait(polishWaitLogToken);
                        }
                    }
                });
        
        
                document.getElementById('btnRetry')?.addEventListener('click',async function(){
                    if (this.dataset.mode === 'cancelPolish') {
                        cancelPolish(this);
                        return;
                    }
                    this.style.display='none';
                    document.getElementById('btnComposerGenerate')?.click();
                });
        
                // 保存章节（新增交互）
        
                document.getElementById('btnRegen')?.addEventListener('click',async function(){
                    // 此入口只保留局部润色后的“重新润色”，正文重新生成统一走“生成本章”。
                    if (this.dataset.mode !== 'repolish') return;
                    openRepolishModal();
                });
        
                // Result copy handler is split into scripts/core/app-result-copy.js.
        
                let pendingMemoryRetry = null;
                document.getElementById('btnConfirm')?.addEventListener('click', async function(){
                    // 润色确定：接受优化结果
                    if (window._polishSession) {
                        confirmPolish();
                        return;
                    }
        
                    if(!AppState.chapter.book)return;
                    const confirmBtn = document.getElementById('btnConfirm');
                    if (confirmBtn?.dataset.confirmUseState === 'using') return;
                    try {
                        await ensureAuthSessionForAction();
                    } catch (err) {
                        if (isAuthExpiredError(err)) {
                            if (!err.handled) handleAuthExpired(err.message);
                            setConfirmUseState('ready');
                            return;
                        }
                        Toast.warn(err?.message || '登录状态检查失败，请稍后重试');
                        return;
                    }
                    setConfirmUseState('using');
                    let memoryWaitLogToken = '';
                    try {
                        const books=gB();
                        const ch=books[AppState.chapter.book].volumes[AppState.chapter.vi].chapters[AppState.chapter.ci];
                        clearAIDetectHighlights(true);
                        const content = document.getElementById('resultBox').innerHTML;
                        if (!content || !content.trim()) throw new Error('正文为空，无法确定使用');
                        ch.content = content;
                        window.ZhiyuEditorAdapter?.applyContentMetadata?.(ch, content, document.getElementById('resultBox'));
                        sB(books);
                        touchBook(AppState.chapter.book);
                        updateWordCount(books[AppState.chapter.book], AppState.chapter.book);
                        clearDraft(AppState.chapter.book, AppState.chapter.vi, AppState.chapter.ci);
                        if (typeof Utils.beginExecutionLogWait === 'function') {
                            memoryWaitLogToken = Utils.beginExecutionLogWait('✅ 本章正文已保存，开始AI分析记忆文件...', 'progress');
                        }
                        if (!memoryWaitLogToken) {
                            Utils.appendLog(null, '✅ 本章正文已保存，开始AI分析记忆文件...', 'progress');
                        }
        
                        const book = books[AppState.chapter.book];
                        const chNum = calculateChapterNumber(book, AppState.chapter.vi, AppState.chapter.ci);
                        const retryKey = [AppState.chapter.book, AppState.chapter.vi, AppState.chapter.ci].join(':');
                        const retryFailedCards = pendingMemoryRetry?.key === retryKey
                            && pendingMemoryRetry.content === content
                            ? pendingMemoryRetry.failedCards
                            : [];
                        Utils.appendLog(
                            null,
                            retryFailedCards.length
                                ? ('📝 正在仅重试：' + retryFailedCards.join('、'))
                                : ('📝 正在分析第' + chNum + '章《' + ch.name + '》并更新记忆库...')
                        );
                        const memoryResult = await generateAllMemoryFiles(
                            AppState.chapter.book,
                            null,
                            ch.content,
                            null,
                            'chapter',
                            { chapterName: ch.name, chapterNum: chNum, retryFailedCards }
                        );
                        const failedCards = Array.isArray(memoryResult?.failedCards) ? memoryResult.failedCards : [];
                        pendingMemoryRetry = failedCards.length > 0
                            ? { key: retryKey, content, failedCards: failedCards.slice() }
                            : null;
                        if (failedCards.length > 0) {
                            Utils.appendLog(null, '⚠️ 正文已保存；' + failedCards.join('、') + '未更新，可重新点击“重试使用”。', 'warn');
                        } else {
                            Utils.appendLog(null, '✅ 信息卡 · 追踪表 · 边界卡 · 承接卡 已更新（设定集按需更新）', 'success');
                        }
                        refreshTree();
                        setConfirmUseState(failedCards.length > 0 ? 'error' : 'success');
                        if (failedCards.length > 0) Toast.warn('正文已保存，部分记忆卡可点击“重试使用”继续更新');
                        else Toast.success('使用成功，记忆库已更新');
                        window._scheduleReliableCloudBackup?.('confirm-use');
                    } catch (err) {
                        console.error('[confirm use failed]', err);
                        if (isAuthExpiredError(err)) {
                            if (!err.handled) handleAuthExpired(err.message);
                            setConfirmUseState('ready');
                            return;
                        }
                        const message = typeof window.formatAiErrorForDisplay === 'function'
                            ? window.formatAiErrorForDisplay(err, '记忆库同步失败')
                            : String(err?.message || err || '记忆库同步失败，请稍后重试');
                        Utils.appendLog(null, '❌ 使用失败：' + message, 'error');
                        Toast.warn('正文已保留，但记忆库同步失败：' + message);
                        setConfirmUseState('error');
                    } finally {
                        if (memoryWaitLogToken && typeof Utils.endExecutionLogWait === 'function') {
                            Utils.endExecutionLogWait(memoryWaitLogToken);
                        }
                    }
                });
    }

    window.bindPolishActions = bindPolishActions;
    window.ZHIYU_POLISH_ACTIONS_READY = true;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindPolishActions, { once: true });
    } else {
        bindPolishActions();
    }
})(window, document);
