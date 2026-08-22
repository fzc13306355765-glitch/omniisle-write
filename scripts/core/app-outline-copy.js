(function(window, document) {
    'use strict';

    function bindOutlineCopyButton() {
        const btn = document.getElementById('btnOutlineCopy');
        if (!btn || btn.dataset.outlineCopyBound === '1') return;
        btn.dataset.outlineCopyBound = '1';

        btn.addEventListener('click', function() {
            const copyBtn = document.getElementById('btnOutlineCopy');
            copyBtn.textContent = '⏳ 复制中...';
            if (typeof window.syncOutlineResultToState === 'function') window.syncOutlineResultToState();
            const AppState = window.ZHIYU_APP_STATE || window.AppState;
            const isFunctionMode = typeof window.getOutlineMode === 'function' && window.getOutlineMode() === 'function';
            const copyText = isFunctionMode ? (AppState.outline.functionalContent || '') : (AppState.outline.content || '');
            if (!copyText.trim()) {
                copyBtn.textContent = '复制内容';
                window.Toast.warn('暂无可复制内容');
                return;
            }
            navigator.clipboard.writeText(copyText).then(() => {
                copyBtn.textContent = '✅ 已复制';
                window.Toast.success('内容已复制到剪贴板');
                setTimeout(() => {
                    copyBtn.textContent = '复制内容';
                }, 1500);
            });
        });
    }

    window.ZHIYU_OUTLINE_COPY = {
        bindOutlineCopyButton
    };
    window.bindOutlineCopyButton = bindOutlineCopyButton;

    bindOutlineCopyButton();
})(window, document);
