(function(window, document) {
    'use strict';

    function getAppState() {
        return window.AppState;
    }

    function bindGenerationStopButton() {
        const btnStop = document.getElementById('btnStop');
        if (!btnStop || btnStop.dataset.generationStopBound === '1') return;
        btnStop.dataset.generationStopBound = '1';

        btnStop.addEventListener('click', function() {
            const AppState = getAppState();
            const btnStopEl = document.getElementById('btnStop');
            btnStopEl.textContent = '已停止';
            btnStopEl.disabled = true;

            setTimeout(() => {
                btnStopEl.textContent = '暂未生成';
            }, 5000);

            if (window._scriptAbort) {
                window._scriptAbort.abort(new DOMException('user_cancelled', 'AbortError'));
                window._scriptAbort = null;
            }

            if (!AppState.chapter.book) return;

            const taskKey = window.genTaskKey(AppState.chapter.book, AppState.chapter.vi, AppState.chapter.ci);
            const task = window.generationTasks[taskKey];
            if (task && task.abortController) {
                task.userStopped = true;
                task.abortController.abort(new DOMException('user_cancelled', 'AbortError'));
            }
            if (window._rewriteSession?.running) {
                const rewriteCancelled = window.cancelRewriteSession?.(window._rewriteSession.handle) === true;
                if (rewriteCancelled) window.resetRewriteBusyState?.();
            }

            if (window.currentGenerationInterval) {
                clearInterval(window.currentGenerationInterval);
            }

            if (task) {
                window.ZHIYU_UTILS.appendLog(null, '⏹️ 用户停止生成，正在保留已完成内容并结算', 'warn');
                return;
            }

            document.getElementById('btnGen').disabled = false;
            window.ZHIYU_UTILS.appendLog(null, '⏹️ 用户停止生成', 'warn');
            const resultBox = document.getElementById('resultBox');
            resultBox.style.background = '';
            resultBox.setAttribute('contenteditable', 'true');
        });
    }

    window.ZHIYU_GENERATION_STOP = {
        bindGenerationStopButton
    };
    window.bindGenerationStopButton = bindGenerationStopButton;

    bindGenerationStopButton();
})(window, document);
