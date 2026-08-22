(function(window) {
    'use strict';

    const Utils = window.ZHIYU_UTILS || {};
    const Toast = window.ZHIYU_TOAST || window.Toast || { warn: function() {} };

    function parseImportChapterNum(title) {
        if (typeof window.parseChapterNum === 'function') return window.parseChapterNum(title);
        const match = String(title || '').match(/\d+/);
        return match ? Number(match[0]) : 0;
    }

    function renderImportChapterList() {
        const list = document.getElementById('importChapterList');
        if (!list) return;
        const importParsedChapters = window.importParsedChapters || [];
        const lineIcon = typeof window.renderLineIcon === 'function' ? window.renderLineIcon : () => '';
        list.innerHTML = importParsedChapters.map((ch, i) => `
            <div class="import-chapter-row${ch.selected ? ' is-selected' : ''}"
                 data-import-chapter-index="${i}" role="checkbox" tabindex="0"
                 aria-checked="${ch.selected ? 'true' : 'false'}">
                <input type="checkbox" ${ch.selected?'checked':''} style="width:auto;margin-top:3px;flex-shrink:0;" aria-label="选择${Utils.escapeHtml(ch.title)}">
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;font-size:13px;">${ch.volume ? lineIcon('folder') + ' ' + Utils.escapeHtml(ch.volume) + ' › ' : ''}${Utils.escapeHtml(ch.title)}</div>
                    <div style="font-size:11px;color:var(--text-muted);">${ch.wordCount.toLocaleString()}字</div>
                    <div style="font-size:11px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${Utils.escapeHtml(ch.preview)}...</div>
                </div>
            </div>
        `).join('');
    }

    function updateChapterSelection(row, selected) {
        const index = Number(row?.dataset?.importChapterIndex);
        const chapters = window.importParsedChapters || [];
        if (!Number.isInteger(index) || !chapters[index]) return;
        chapters[index].selected = !!selected;
        const checkbox = row.querySelector('input[type="checkbox"]');
        if (checkbox) checkbox.checked = chapters[index].selected;
        row.classList.toggle('is-selected', chapters[index].selected);
        row.setAttribute('aria-checked', chapters[index].selected ? 'true' : 'false');
        window.updateImportAnalysisEstimate?.();
    }

    function bindImportChapterListActions() {
        const list = document.getElementById('importChapterList');
        if (list && list.dataset.importChapterListBound !== '1') {
            list.dataset.importChapterListBound = '1';
            list.addEventListener('click', function(event) {
                const row = event.target.closest('[data-import-chapter-index]');
                if (!row || !list.contains(row)) return;
                const checkbox = event.target.closest('input[type="checkbox"]');
                updateChapterSelection(row, checkbox ? checkbox.checked : row.getAttribute('aria-checked') !== 'true');
            });
            list.addEventListener('keydown', function(event) {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                const row = event.target.closest('[data-import-chapter-index]');
                if (!row || !list.contains(row)) return;
                event.preventDefault();
                updateChapterSelection(row, row.getAttribute('aria-checked') !== 'true');
            });
        }

        const selectAllBtn = document.getElementById('btnImportSelectAll');
        if (selectAllBtn && selectAllBtn.dataset.importChapterListBound !== '1') {
            selectAllBtn.dataset.importChapterListBound = '1';
            selectAllBtn.addEventListener('click', function() {
                const importParsedChapters = window.importParsedChapters || [];
                const allSelected = importParsedChapters.every(chapter => chapter.selected);
                importParsedChapters.forEach(chapter => { chapter.selected = !allSelected; });
                this.textContent = allSelected ? '全选章节' : '取消全选';
                renderImportChapterList();
                window.updateImportAnalysisEstimate?.();
            });
        }

        const smartSortBtn = document.getElementById('btnImportSmartSort');
        if (smartSortBtn && smartSortBtn.dataset.importChapterListBound !== '1') {
            smartSortBtn.dataset.importChapterListBound = '1';
            smartSortBtn.addEventListener('click', function() {
                const importParsedChapters = window.importParsedChapters || [];
                const orderer = window.ZhiyuFullTextAnalysisCore?.orderImportChapters;
                if (typeof orderer === 'function') {
                    const result = orderer(importParsedChapters, 'smart');
                    importParsedChapters.splice(0, importParsedChapters.length, ...result.chapters);
                    if (!result.safe && result.message) Toast.warn(result.message);
                } else {
                    importParsedChapters.sort(function(a, b) {
                        const volumeDiff = Number(a?._importVolumeIndex || 0) - Number(b?._importVolumeIndex || 0);
                        if (volumeDiff) return volumeDiff;
                        const chapterDiff = parseImportChapterNum(a.title) - parseImportChapterNum(b.title);
                        if (chapterDiff) return chapterDiff;
                        return Number(a?._importOriginalIndex || 0) - Number(b?._importOriginalIndex || 0);
                    });
                }
                renderImportChapterList();
            });
        }

        const keepOrderBtn = document.getElementById('btnImportKeepOrder');
        if (keepOrderBtn && keepOrderBtn.dataset.importChapterListBound !== '1') {
            keepOrderBtn.dataset.importChapterListBound = '1';
            keepOrderBtn.addEventListener('click', function() {
                const importParsedChapters = window.importParsedChapters || [];
                const orderer = window.ZhiyuFullTextAnalysisCore?.orderImportChapters;
                if (typeof orderer === 'function') {
                    const result = orderer(importParsedChapters, 'original');
                    importParsedChapters.splice(0, importParsedChapters.length, ...result.chapters);
                } else {
                    importParsedChapters.sort(function(a, b) {
                        return Number(a?._importOriginalIndex || 0) - Number(b?._importOriginalIndex || 0);
                    });
                }
                renderImportChapterList();
                window.updateImportAnalysisEstimate?.();
            });
        }
    }

    window.renderImportChapterList = renderImportChapterList;
    window.bindImportChapterListActions = bindImportChapterListActions;
    window.ZHIYU_IMPORT_CHAPTER_LIST_READY = true;
    bindImportChapterListActions();
})(window);
