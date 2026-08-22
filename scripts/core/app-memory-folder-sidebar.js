// 拆分项目记忆库文件夹侧栏模块。
// 只负责关联、细纲、拆书和自定义文件夹入口的渲染与切换。
(function(window) {
    'use strict';

    const Utils = window.ZHIYU_UTILS || {};
    const AppState = window.ZHIYU_APP_STATE || window.AppState || {};
    const renderLineIcon = window.renderLineIcon || function() { return ''; };
    const getMemFolderType = window.getMemFolderType || function() { return 'associated'; };
    const formatMemoryFolderName = window.formatMemoryFolderName || function(folderName) { return folderName; };
    const getMemorySystemFolderName = window.getMemorySystemFolderName || function() { return ''; };
    const getMemoryVolumeFolders = window.getMemoryVolumeFolders || function() { return []; };

    function renderMemFolderSidebar() {
        const sidebar = document.getElementById('memFolderSidebar');
        if (!sidebar) return;
        const memBooks = typeof window.getMemBooks === 'function' ? window.getMemBooks() : {};
        const book = memBooks[AppState.memory.book];
        if (!book) {
            sidebar.innerHTML = '';
            return;
        }

        const systemFolder = getMemorySystemFolderName(book);
        const fineFolders = getMemoryVolumeFolders(book, 'fineOutline');
        const decomposeFolders = getMemoryVolumeFolders(book, 'decompose');
        const chapterSummaryFolders = getMemoryVolumeFolders(book, 'chapterSummary');
        const customFolders = Object.keys(book).filter(function(folderName) {
            return Array.isArray(book[folderName])
                && getMemFolderType(folderName) === 'associated'
                && folderName !== systemFolder
                && folderName !== window.MEMORY_TRASH_KEY;
        });
        const trashFiles = typeof window.getMemoryTrash === 'function' ? window.getMemoryTrash(book) : [];
        const validViews = ['associated', 'fineOutline', 'decompose', 'chapterSummary', 'trash', 'custom'];
        if (!validViews.includes(AppState.memory.view)) AppState.memory.view = 'associated';
        if (AppState.memory.view === 'associated') AppState.memory.folder = systemFolder;
        else if (AppState.memory.view === 'fineOutline' && AppState.memory.folder && !fineFolders.includes(AppState.memory.folder)) AppState.memory.folder = '';
        else if (AppState.memory.view === 'decompose' && AppState.memory.folder && !decomposeFolders.includes(AppState.memory.folder)) AppState.memory.folder = '';
        else if (AppState.memory.view === 'chapterSummary' && AppState.memory.folder && !chapterSummaryFolders.includes(AppState.memory.folder)) AppState.memory.folder = '';
        else if (AppState.memory.view === 'trash') AppState.memory.folder = '';
        else if (AppState.memory.view === 'custom' && !customFolders.includes(AppState.memory.folder)) {
            AppState.memory.view = 'associated';
            AppState.memory.folder = systemFolder;
        }

        const items = [
            { view: 'associated', name: '关联文件夹', tag: '关联文件夹', count: systemFolder ? book[systemFolder].length : 0 },
            { view: 'fineOutline', name: '细纲文件', tag: '细纲文件夹', count: fineFolders.reduce((sum, name) => sum + book[name].length, 0) },
            { view: 'decompose', name: '拆书文件', tag: '拆书文件夹', count: decomposeFolders.reduce((sum, name) => sum + book[name].length, 0) },
            { view: 'chapterSummary', name: '章节概要', tag: '章节概要文件夹', count: chapterSummaryFolders.reduce((sum, name) => sum + book[name].length, 0) },
            { view: 'trash', name: '回收站', tag: '已删除文件', count: trashFiles.length }
        ].concat(customFolders.map(function(folderName) {
            return { view: 'custom', folder: folderName, name: formatMemoryFolderName(folderName), tag: '自定义文件夹', count: book[folderName].length };
        }));

        sidebar.innerHTML = '';
        items.forEach(function(item) {
            const folderItem = document.createElement('div');
            const isActive = item.view === AppState.memory.view && (item.view !== 'custom' || item.folder === AppState.memory.folder);
            folderItem.className = 'mem-folder-item' + (isActive ? ' active' : '');
            folderItem.dataset.memoryView = item.view;
            if (item.folder) folderItem.dataset.memoryFolder = item.folder;
            folderItem.style.cssText = 'display:flex;flex-direction:column;padding:10px 12px;cursor:pointer;border-radius:8px;margin-bottom:6px;transition:all 0.2s;';
            folderItem.innerHTML = `
                <div style="display:flex;align-items:center;gap:8px;">
                    <span>${renderLineIcon('folder')}</span>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${Utils.escapeHtml(item.name)}">${Utils.escapeHtml(item.name)}</div>
                        <div style="font-size:11px;color:#888;">${item.count} 个文件</div>
                    </div>
                    <span class="memory-folder-tag">${item.tag}</span>
                </div>
                ${item.view === 'custom' ? '<div style="display:flex;gap:3px;margin-top:6px;opacity:' + (AppState.memory.batchMode ? '1' : '0') + ';" class="folder-actions"><span class="folder-rename-btn" style="width:28px;height:22px;display:flex;align-items:center;justify-content:center;border-radius:4px;background:rgba(33,150,243,0.1);color:#1976d2;cursor:pointer;font-size:12px;" title="重命名">✎</span><span class="folder-delete-btn" style="width:28px;height:22px;display:flex;align-items:center;justify-content:center;border-radius:4px;background:rgba(244,67,54,0.1);color:#e74c3c;cursor:pointer;font-size:12px;" title="删除">✕</span></div>' : ''}
            `;
            if (isActive && !AppState.memory.batchMode) {
                folderItem.style.background = 'var(--bg-input)';
                folderItem.style.borderLeft = '3px solid #2BA36B';
                folderItem.style.paddingLeft = '9px';
            } else {
                folderItem.style.background = 'transparent';
                folderItem.style.borderLeft = '3px solid transparent';
                folderItem.style.paddingLeft = '12px';
                folderItem.onmouseenter = function() { folderItem.style.background = 'var(--memory-folder-hover, #f0f7ff)'; };
                folderItem.onmouseleave = function() { folderItem.style.background = 'transparent'; };
            }
            folderItem.addEventListener('click', function(e) {
                if (item.view === 'custom' && (e.target.closest('.folder-rename-btn') || e.target.closest('.folder-delete-btn'))) {
                    e.stopPropagation();
                    if (e.target.closest('.folder-rename-btn')) window.renameMemFolder?.(item.folder);
                    else window.deleteMemFolder?.(item.folder);
                    return;
                }
                if (AppState.memory.batchMode) return;
                AppState.memory.view = item.view;
                AppState.memory.folder = item.view === 'associated' ? systemFolder : (item.view === 'custom' ? item.folder : '');
                AppState.memory.backupVolume = '';
                renderMemFolderSidebar();
                window.renderMemFileList?.();
            });
            if (item.view === 'custom') {
                folderItem.addEventListener('contextmenu', function(e) {
                    e.preventDefault();
                    window.showFolderContextMenu?.(e.clientX, e.clientY, item.folder);
                });
                folderItem.addEventListener('dblclick', function(e) {
                    e.stopPropagation();
                    window.renameMemFolder?.(item.folder);
                });
            }
            sidebar.appendChild(folderItem);
        });
    }

    window.renderMemFolderSidebar = renderMemFolderSidebar;
    window.ZHIYU_MEMORY_FOLDER_SIDEBAR_READY = true;
})(window);
