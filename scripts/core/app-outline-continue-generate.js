(function(){
    'use strict';

    function joinOutlineContinueContent(baseContent, additionContent) {
        const base = String(baseContent || '');
        const addition = String(additionContent || '').trim();
        if (!addition) return base;
        if (!base) return addition;
        const separator = base.endsWith('\n\n') ? '' : (base.endsWith('\n') ? '\n' : '\n\n');
        return base + separator + addition;
    }

    function isCurrentOutlineContinueSession(session) {
        if (!session?.active || AppState?.outline?.continueSession !== session) return false;
        const activeUid = String(window.AccountDataScope?.getActiveUid?.() || AppState.auth?.uid || '');
        if (session.accountUid && activeUid !== String(session.accountUid)) return false;
        return String(AppState.chapter?.book || '') === String(session.bookName || '');
    }

    function finishOutlineContinueState(baseContent, generatedContent, expectedSession) {
        const session = expectedSession || AppState?.outline?.continueSession;
        if (!isCurrentOutlineContinueSession(session)) return null;
        const mergedContent = joinOutlineContinueContent(baseContent, generatedContent);
        AppState.outline.content = mergedContent;
        AppState.outline.continueResult = generatedContent;
        session.ready = true;
        session.saved = false;
        session.generatedContent = generatedContent;
        session.completedAt = Date.now();
        return mergedContent;
    }

    function clearOutlineContinueSession() {
        if (!AppState?.outline) return false;
        const session = AppState.outline.continueSession;
        if (session?.active) session.active = false;
        if (session?.abortController && !session.abortController.signal?.aborted) {
            session.abortController.abort();
        }
        if (window.outlineAbortController === session?.abortController) {
            delete window.outlineAbortController;
        }
        AppState.outline.continueSession = null;
        AppState.outline.continueBase = '';
        AppState.outline.continueResult = '';
        AppState.outline.continueRef = '';
        return true;
    }

    function isOutlineContinueAbort(error) {
        if (typeof window.isAbortLikeError === 'function') return window.isAbortLikeError(error);
        const message = String(error?.message || error || '');
        return error?.name === 'AbortError' || /abort|BodyStream|取消/i.test(message);
    }

    function formatOutlineContinueError(error) {
        return typeof window.formatAiErrorForDisplay === 'function'
            ? window.formatAiErrorForDisplay(error, '大纲续写失败')
            : String(error?.message || error || '大纲续写失败');
    }

    function appendOutlineContinueLog(message, type) {
        const Utils = window.ZHIYU_UTILS || window.Utils;
        if (typeof Utils?.appendLog === 'function') Utils.appendLog(null, message, type || 'error');
    }

    function ensureOutlineContinueOutput(content) {
        if (String(content || '').trim()) return true;
        const error = new Error('大纲续写未返回可用内容，本次生成未完成。');
        error.code = 'AI_STREAM_EMPTY';
        throw error;
    }

    async function startOutlineContinueGenerate(expectedSession) {
        const continueSession = expectedSession || AppState.outline.continueSession;
        if (!isCurrentOutlineContinueSession(continueSession)) {
            Toast.warn('本次大纲续写任务已经失效，请重新选择要续写的大纲');
            return;
        }
        if (continueSession.abortController && !continueSession.abortController.signal?.aborted) {
            Toast.warn('大纲续写正在生成，请勿重复启动');
            return;
        }
        const modelCfg = getOutlineModelConfig();
        const apiConfig = gA();
        if (modelCfg.custom && !apiConfig.key) { Toast.warn('使用自定义模型请先在设置页配置 API Key'); return; }

        const btn = document.getElementById('btnStartOutline');
        const resultBox = document.getElementById('outlineResultBox');
        const baseContent = String(continueSession.baseContent || '');
        const linkedFiles = Array.isArray(continueSession.linkedFiles)
            ? continueSession.linkedFiles
            : [];
        const userRef = String(continueSession.userRef || '');
        continueSession.ready = false;
        continueSession.saved = false;
        continueSession.generatedContent = '';

        const systemPrompt = '';

        let userMessage = baseContent + '\n\n';

        if (linkedFiles.length > 0) {
            userMessage += '---\n';
            const _bookName = AppState.chapter.book || document.getElementById('bookSel')?.value;
            try {
                if (typeof window.buildAiReferenceContext !== 'function') throw new Error('参考文件说明模块未加载，请刷新页面后重试');
                const referenceContext = window.buildAiReferenceContext(_bookName, linkedFiles, 'outline_continue');
                userMessage += '\n' + referenceContext.text + '\n';
            } catch (referenceError) {
                Toast.warn(referenceError?.message || '参考文件读取失败，请重新选择后再试');
                return;
            }
        }

        if (userRef) {
            userMessage += '\n' + userRef + '\n';
        }

        userMessage += '\n请从上述大纲末尾接着续写，保持相同格式（分卷、分章结构），补充后续剧情发展。';

        // 参考资料组装成功后才进入生成态，避免文件失效时按钮卡住。
        resultBox.style.background = '#e3f2fd';
        btn.textContent = '停止生成';
        btn.dataset.generating = 'true';
        btn.disabled = false;

        // 大纲原文已在 btnOCConfirm 中粘贴到 resultBox
        const streamState = { started: !!String(resultBox.textContent || '').trim() };
        window.appendOutlineStreamText?.(resultBox, '\n\n--- 正在生成续写内容 ---\n\n', streamState);

        const abortController = new AbortController();
        window.outlineAbortController = abortController;
        continueSession.abortController = abortController;
        continueSession.generationStartedAt = Date.now();
        let fullContent = '';
        appendOutlineContinueLog('正在生成大纲续写...', 'progress');

        const finishCurrentUi = function() {
            if (!isCurrentOutlineContinueSession(continueSession)) return false;
            resultBox.style.background = '';
            btn.textContent = '生成大纲';
            btn.disabled = false;
            delete btn.dataset.generating;
            if (window.outlineAbortController === abortController) delete window.outlineAbortController;
            if (continueSession.abortController === abortController) delete continueSession.abortController;
            return true;
        };

        if (modelCfg?.base && modelCfg?.model) {
            const customApiConfig = { ...modelCfg, maxTokens: 16384 };
            let failureLogged = false;
            try {
                await streamGenerate(
                    customApiConfig, systemPrompt, userMessage,
                    (chunk) => {
                        if (!isCurrentOutlineContinueSession(continueSession)) {
                            abortController.abort();
                            return;
                        }
                        fullContent += chunk;
                        window.appendOutlineStreamText?.(resultBox, chunk, streamState);
                    },
                    (final) => {
                        if (!isCurrentOutlineContinueSession(continueSession)) return;
                        fullContent = final || fullContent;
                    },
                    (err) => {
                        if (!isCurrentOutlineContinueSession(continueSession)) {
                            failureLogged = true;
                            return;
                        }
                        if (isOutlineContinueAbort(err)) {
                            window.appendOutlineStreamText?.(resultBox, '\n\n[已停止生成]', streamState);
                            appendOutlineContinueLog('已停止大纲续写', 'warn');
                        } else {
                            const errorMessage = formatOutlineContinueError(err);
                            window.appendOutlineStreamText?.(resultBox, '\n\n[' + errorMessage + ']', streamState);
                            appendOutlineContinueLog(errorMessage);
                        }
                        failureLogged = true;
                        finishCurrentUi();
                    },
                    abortController.signal
                );
                if (failureLogged) return;
                if (!isCurrentOutlineContinueSession(continueSession)) return;
                ensureOutlineContinueOutput(fullContent);
                finishOutlineContinueState(baseContent, fullContent, continueSession);
                finishCurrentUi();
                appendOutlineContinueLog('大纲续写完成', 'success');
            } catch (e) {
                if (!isCurrentOutlineContinueSession(continueSession)) return;
                if (!failureLogged) {
                    const errorMessage = isOutlineContinueAbort(e) ? '已停止大纲续写' : formatOutlineContinueError(e);
                    appendOutlineContinueLog(errorMessage, isOutlineContinueAbort(e) ? 'warn' : 'error');
                    if (!isOutlineContinueAbort(e)) {
                        window.appendOutlineStreamText?.(resultBox, '\n\n[' + errorMessage + ']', streamState);
                    }
                }
                finishCurrentUi();
            }
        } else {
            appendOutlineContinueLog('请先添加并选择自己的大纲模型', 'error');
            finishCurrentUi();
        }
    }

    window.ZHIYU_OUTLINE_CONTINUE_GENERATE = {
        startOutlineContinueGenerate,
        ensureOutlineContinueOutput,
        joinOutlineContinueContent,
        isCurrentOutlineContinueSession,
        finishOutlineContinueState,
        clearOutlineContinueSession
    };
    window.startOutlineContinueGenerate = startOutlineContinueGenerate;
    window.clearOutlineContinueSession = clearOutlineContinueSession;
})();
