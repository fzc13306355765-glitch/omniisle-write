(function(window) {
    'use strict';

    const AppState = window.ZHIYU_APP_STATE || window.AppState || {};
    let plotSaveTimer;

    function bindPlotInputPersistence() {
        const input = document.getElementById('plotInput');
        if (!input || input.dataset.zhiyuPlotBound === '1') return;
        input.dataset.zhiyuPlotBound = '1';
        input.addEventListener('input', function() {
            clearTimeout(plotSaveTimer);
            if (document.body?.classList.contains('zhiyu-outline-tutorial-active')) return;
            plotSaveTimer = setTimeout(() => {
                if (document.body?.classList.contains('zhiyu-outline-tutorial-active')) return;
                const { book, vi, ci } = AppState.chapter || {};
                if (book && vi >= 0 && ci >= 0) {
                    const plotKey = window.AccountDataScope.key(`plot_${book}_${vi}_${ci}`);
                    localStorage.setItem(plotKey, this.value);
                }
            }, 500);
        });
    }

    bindPlotInputPersistence();

    window.bindPlotInputPersistence = bindPlotInputPersistence;
    window.ZHIYU_PLOT_INPUT_READY = true;
})(window);
