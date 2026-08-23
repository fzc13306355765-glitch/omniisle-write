// 拆分项目记忆库书籍卡片列表模块。
// 只负责记忆库首页书籍卡片渲染，不直接改写记忆文件内容。
(function(window) {
    'use strict';

    const Utils = window.ZHIYU_UTILS || {};
    const AppState = window.ZHIYU_APP_STATE || window.AppState || {};
    const gB = window.gB || function() { return {}; };
    const renderLineIcon = window.renderLineIcon || function() { return ''; };
    const countMemFiles = window.countMemFiles || function() { return 0; };
    const getMemBookGroupStats = window.getMemBookGroupStats || function() { return { associated: 0, fineOutline: 0, decompose: 0 }; };

    function refreshMemGrid() {
        const grid = document.getElementById('memBookGrid');
        if (!grid) return;
        const previewBooks = window.ZHIYU_MEMORY_PREVIEW_CONTEXT?.active
            ? window.ZHIYU_MEMORY_PREVIEW_CONTEXT.books
            : null;
        const memBooks = previewBooks || (typeof window.getMemBooks === 'function' ? window.getMemBooks() : {});
        const books = gB();
        const visibleBookNames = Object.keys(memBooks).filter(function(bookName) {
            if (previewBooks) return true;
            return !!books[bookName];
        });
        grid.innerHTML = '';
        if (visibleBookNames.length === 0) {
            grid.innerHTML = '<div class="overview-empty">暂无记忆书籍，点击"导入记忆书籍"添加</div>';
            return;
        }
        visibleBookNames.forEach(function(bookName) {
            const book = memBooks[bookName];
            const card = document.createElement('div');
            const stats = getMemBookGroupStats(book);
            card.className = 'book-card memory-book-card';
            card.dataset.book = bookName;
            card.style.position = 'relative';
            card.innerHTML = `<input type="checkbox" class="mem-book-checkbox" data-book="${Utils.escapeHtml(bookName)}" style="position:absolute;top:10px;right:10px;width:18px;height:18px;cursor:pointer;display:none;z-index:5;" onclick="event.stopPropagation();" onchange="updateMemMainBatchUI()">
                <div class="memory-book-top">
                    <div class="memory-book-icon">${renderLineIcon('folder')}</div>
                    <div style="min-width:0;flex:1;">
                        <div class="memory-book-name" title="${Utils.escapeHtml(bookName)}">${Utils.escapeHtml(bookName)}</div>
                        <div class="memory-book-meta">文件：${countMemFiles(book)}</div>
                    </div>
                </div>
                <div class="memory-folder-stats">
                    <span class="memory-chip">关联 ${stats.associated}</span>
                    <span class="memory-chip">细纲 ${stats.fineOutline}</span>
                    <span class="memory-chip">拆书 ${stats.decompose}</span>
                </div>`;
            card.addEventListener('click', async function() {
                if (!AppState.memory.batchMode && typeof window.openMemBook === 'function') window.openMemBook(bookName);
            });
            grid.appendChild(card);
        });
    }

    window.refreshMemGrid = refreshMemGrid;
    window.ZHIYU_MEMORY_BOOK_GRID_READY = true;
})(window);
