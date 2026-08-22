(function(window, document) {
    'use strict';

    function bindResultCopyButton() {
        const button = document.getElementById('btnCopy');
        if (!button || button.dataset.resultCopyBound === '1') return;
        button.dataset.resultCopyBound = '1';

        button.addEventListener('click', async function() {
            const resultBox = document.getElementById('resultBox');
            const text = resultBox ? resultBox.textContent : '';
            if (!text) {
                window.ZHIYU_TOAST?.warn?.('当前没有可复制的内容');
                return;
            }

            try {
                await navigator.clipboard.writeText(text);
                window.ZHIYU_TOAST?.success?.('已复制到剪贴板');
            } catch (err) {
                window.ZHIYU_TOAST?.error?.('复制失败，请手动选择内容复制');
            }
        });
    }

    window.ZHIYU_RESULT_COPY = {
        bindResultCopyButton
    };
    window.bindResultCopyButton = bindResultCopyButton;

    bindResultCopyButton();
})(window, document);
