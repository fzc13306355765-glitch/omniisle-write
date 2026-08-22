(function(window) {
    'use strict';

    const AppState = window.ZHIYU_APP_STATE || {};

    let lastSavedContent = '';

    function getResultBox() {
        return document.getElementById('resultBox');
    }

    function setLastSavedContent(content) {
        lastSavedContent = content || '';
    }

    function getLastSavedContent() {
        return lastSavedContent;
    }

    function updateDirtyIndicator() {
        if (!AppState.chapter || !AppState.chapter.book) return;
        const resultBox = getResultBox();
        if (!resultBox) return;
        const current = resultBox.innerHTML;
        const dirty = current !== lastSavedContent && current !== '';
        const marker = document.getElementById('dirtyMarker');
        if (marker) marker.style.display = dirty ? 'inline' : 'none';
    }

    function bindEditorDirtyState() {
        const resultBox = getResultBox();
        if (!resultBox || resultBox.dataset.dirtyStateBound === '1') return;
        resultBox.dataset.dirtyStateBound = '1';
        resultBox.addEventListener('input', function() {
            updateDirtyIndicator();
            const text = this.textContent || '';
            if (typeof window.updateChapWordCount === 'function') {
                window.updateChapWordCount(text);
            }
            if (this.dataset.editingRefFile) return;
            if (typeof window.updateCurrentChapterListWordCount === 'function') {
                window.updateCurrentChapterListWordCount(this.innerHTML || '');
            }
            if (typeof window.updateWordProgress === 'function') {
                window.updateWordProgress(text.length, 0);
            }
        });
    }

    bindEditorDirtyState();

    window.setLastSavedContent = setLastSavedContent;
    window.getLastSavedContent = getLastSavedContent;
    window.updateDirtyIndicator = updateDirtyIndicator;
    window.bindEditorDirtyState = bindEditorDirtyState;
    window.ZHIYU_EDITOR_DIRTY_STATE_READY = true;
})(window);
