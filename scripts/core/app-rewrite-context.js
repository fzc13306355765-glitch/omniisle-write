(function(window) {
    'use strict';

    const AppState = window.ZHIYU_APP_STATE;
    const gB = window.gB;

    function getPrevChapterEnd() {
        const bookName = AppState.chapter.book;
        const vi = AppState.chapter.vi;
        const ci = AppState.chapter.ci;
        if (!bookName || vi < 0 || ci < 0 || typeof gB !== 'function') return '';
        const books = gB();
        const book = books[bookName];
        if (!book) return '';

        let prevCh = null;
        if (ci > 0) {
            prevCh = book.volumes?.[vi]?.chapters?.[ci - 1] || null;
        } else if (vi > 0) {
            const prevVol = book.volumes?.[vi - 1];
            if (prevVol && prevVol.chapters.length > 0) {
                prevCh = prevVol.chapters[prevVol.chapters.length - 1];
            }
        }
        if (!prevCh || !prevCh.content) return '';
        const text = (prevCh.content || '').trim();
        return text.length > 500 ? text.slice(-500) : text;
    }

    function resolveRewriteSelectionSnapshot(rewriteState, currentContent) {
        const fullContent = String(rewriteState?.fullContent ?? '');
        const selectedText = String(rewriteState?.selectedText ?? '');
        const selectionStart = Number(rewriteState?.selectionStart);
        const selectionEnd = Number(rewriteState?.selectionEnd);
        if (!Number.isInteger(selectionStart)
            || !Number.isInteger(selectionEnd)
            || selectionStart < 0
            || selectionEnd <= selectionStart
            || selectionEnd > fullContent.length
            || String(currentContent ?? '') !== fullContent
            || fullContent.slice(selectionStart, selectionEnd) !== selectedText) {
            return null;
        }
        return {
            fullContent,
            selectedText,
            beforeText: fullContent.slice(0, selectionStart),
            afterText: fullContent.slice(selectionEnd),
            selectionStart,
            selectionEnd,
            professionalFrom: rewriteState?.professionalFrom,
            professionalTo: rewriteState?.professionalTo,
            range: rewriteState?.range || null
        };
    }

    function buildRewriteCombinedContent({ beforeText, afterText, finalContent }) {
        const replacement = String(finalContent || '').trim();
        return `${beforeText || ''}${replacement}${afterText || ''}`;
    }

    function releaseOwnedRewriteTask(ctx) {
        const { bookName, vi, ci, rewriteTask } = ctx || {};
        const taskKey = rewriteTask?.taskKey || window.genTaskKey?.(bookName, vi, ci);
        if (!taskKey || !rewriteTask || window.generationTasks?.[taskKey] !== rewriteTask) {
            return false;
        }
        window.markChapterGenerating?.(bookName, vi, ci, false);
        delete window.generationTasks[taskKey];
        return true;
    }

    function finishRewriteSuccess(ctx) {
        const {
            bookName,
            vi,
            ci,
            editor,
            dirLabel,
            beforeText,
            afterText,
            fullContent,
            finalContent,
            rewriteHandle,
            rewriteTask
        } = ctx || {};
        if (!String(finalContent || '').trim()) {
            const emptyError = new Error('局部重写未返回可用内容，本次重写未完成。');
            emptyError.code = 'AI_STREAM_EMPTY';
            finishRewriteError({
                err: emptyError,
                editor,
                fullContent,
                bookName,
                vi,
                ci,
                rewriteHandle,
                rewriteTask
            });
            return false;
        }
        const currentChapter = window.AppState?.chapter || AppState.chapter || {};
        const isCurrentChapter = currentChapter.book === bookName
            && currentChapter.vi === vi
            && currentChapter.ci === ci;
        const applied = window.applyRewriteResult?.({
            handle: rewriteHandle,
            result: finalContent
        }) === true;
        if (!applied) {
            const sourceChanged = window._rewriteSession?.sourceChanged === true;
            const cancelled = window.cancelRewriteSession?.(rewriteHandle) === true;
            window.ZHIYU_UTILS?.appendLog?.(
                null,
                sourceChanged
                    ? '正文已在等待期间发生变化，旧重写结果已丢弃，未覆盖当前内容'
                    : '重写结果未能安全写回原框选位置，旧结果已丢弃',
                'error'
            );
            if (isCurrentChapter && cancelled) {
                window.resetRewriteBusyState?.();
                window.updateGeneratingStatus?.(null);
            }
            releaseOwnedRewriteTask({ bookName, vi, ci, rewriteTask });
            return false;
        }
        if (isCurrentChapter && editor) window.updateChapWordCount?.(editor.textContent || '');
        window.ZHIYU_UTILS?.appendLog?.(null, `✅ 重写完成（${dirLabel || ''}）——请检查内容，确认无误后点击 [确定使用] 保存`, 'success');
        if (isCurrentChapter) {
            window.updateGeneratingStatus?.(null);
            window.resetRewriteBusyState?.();
            const btnCopy = document.getElementById('btnCopy');
            if (btnCopy) btnCopy.disabled = false;
            window.setConfirmUseState?.('ready');
        }
        releaseOwnedRewriteTask({ bookName, vi, ci, rewriteTask });
        return true;
    }

    function finishRewriteError(ctx) {
        const { err, bookName, vi, ci, rewriteHandle, rewriteTask } = ctx || {};
        const msg = (err?.message || err || '');
        const isAbort = typeof window.isAbortLikeError === 'function'
            ? window.isAbortLikeError(err)
            : (err?.name === 'AbortError'
                || String(msg).includes('abort')
                || String(msg).includes('Abort')
                || String(msg).includes('BodyStream')
                || String(msg).includes('取消'));
        if (isAbort) {
            window.ZHIYU_UTILS?.appendLog?.(null, '已停止重写', 'warn');
        } else {
            const errorMessage = typeof window.formatAiErrorForDisplay === 'function'
                ? window.formatAiErrorForDisplay(err, '重写失败')
                : String(msg || '重写失败');
            window.ZHIYU_UTILS?.appendLog?.(null, errorMessage, 'error');
            window.Toast?.error?.(errorMessage);
        }
        const cancelled = window.cancelRewriteSession?.(rewriteHandle) === true;
        const currentChapter = window.AppState?.chapter || AppState.chapter || {};
        if (cancelled
            && currentChapter.book === bookName
            && currentChapter.vi === vi
            && currentChapter.ci === ci) {
            window.updateGeneratingStatus?.(null);
            window.resetRewriteBusyState?.();
        }
        releaseOwnedRewriteTask({ bookName, vi, ci, rewriteTask });
    }

    window.getPrevChapterEnd = getPrevChapterEnd;
    window.resolveRewriteSelectionSnapshot = resolveRewriteSelectionSnapshot;
    window.buildRewriteCombinedContent = buildRewriteCombinedContent;
    window.releaseOwnedRewriteTask = releaseOwnedRewriteTask;
    window.finishRewriteSuccess = finishRewriteSuccess;
    window.finishRewriteError = finishRewriteError;
    window.ZHIYU_REWRITE_CONTEXT_READY = true;
})(window);
