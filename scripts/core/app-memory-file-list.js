// 拆分项目记忆库内部文件模块。
// 只负责关联资料分区、卷文件夹和文件卡片渲染；文件增删改仍由各自模块负责。
(function(window) {
    'use strict';

    const Utils = window.ZHIYU_UTILS || {};
    const AppState = window.ZHIYU_APP_STATE || window.AppState || {};
    const renderLineIcon = window.renderLineIcon || function() { return ''; };
    const formatMemoryFileDisplayName = window.formatMemoryFileDisplayName || function(fileName) { return String(fileName || '').replace(/\.md$/i, ''); };
    const getMemoryFileKey = window.getMemoryFileKey || function(fileName) { return String(fileName || '').replace(/\.md$/i, ''); };
    const getAssociatedMemorySections = window.getAssociatedMemorySections || function(files) { return { foundation: [], planning: (files || []).map((file, idx) => ({ file, idx })), stage: [] }; };
    const getMemoryVolumeFolders = window.getMemoryVolumeFolders || function() { return []; };
    const getMemoryVolumeLabel = window.getMemoryVolumeLabel || function(folderName) { return folderName; };

    function getMemBooks() {
        return typeof window.getMemBooks === 'function' ? window.getMemBooks() : {};
    }

    function createMemoryFileCard(file, idx, folderName) {
        const card = document.createElement('div');
        card.className = 'memory-file-card';
        card.dataset.memoryFileKey = getMemoryFileKey(file?.name, AppState.memory.book);
        card.style.cssText = 'cursor:pointer;transition:transform 0.2s,box-shadow 0.2s,border-color 0.2s;display:flex;flex-direction:column;gap:8px;position:relative;';
        const modDate = file.updatedAt ? new Date(file.updatedAt).toLocaleDateString() : (file.createdAt ? new Date(file.createdAt).toLocaleDateString() : '-');
        const displayName = formatMemoryFileDisplayName(file.name, folderName);
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'tree-checkbox';
        checkbox.dataset.folder = folderName;
        checkbox.dataset.idx = idx;
        checkbox.style.cssText = 'position:absolute;right:10px;bottom:10px;width:18px;height:18px;cursor:pointer;display:none;z-index:2;';
        function setMemoryFileChecked(checked) {
            checkbox.checked = checked;
            card.classList.toggle('selected', checked);
            window.updateMemSelectedCount?.();
        }
        checkbox.addEventListener('change', function(e) {
            e.stopPropagation();
            setMemoryFileChecked(checkbox.checked);
        });
        card.appendChild(checkbox);
        card.insertAdjacentHTML('beforeend', `
            <div style="display:flex;align-items:center;gap:10px;">
                <span class="memory-file-card-icon" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:transparent;flex-shrink:0;">${renderLineIcon('file')}</span>
                <div style="min-width:0;flex:1;">
                    <div class="memory-file-name" title="${Utils.escapeHtml(displayName)}">${Utils.escapeHtml(displayName)}</div>
                    <div style="font-size:11px;color:#999;margin-top:3px;">${modDate}</div>
                </div>
            </div>
            <div style="font-size:11px;color:#8b8f98;margin-top:2px;">原文件：${Utils.escapeHtml(file.name || '')}</div>
            <div style="display:flex;gap:4px;justify-content:center;margin-top:auto;opacity:0;transition:opacity 0.15s;" class="file-card-actions">
                <span class="file-rename-btn" style="width:26px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:6px;background:rgba(33,150,243,0.08);color:#1976d2;cursor:pointer;font-size:12px;" title="重命名">✎</span>
                <span class="file-delete-btn" style="width:26px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:6px;background:rgba(244,67,54,0.08);color:#e74c3c;cursor:pointer;font-size:12px;" title="删除">✕</span>
            </div>`);
        card.addEventListener('mouseenter', function() { card.querySelector('.file-card-actions').style.opacity = '1'; });
        card.addEventListener('mouseleave', function() { card.querySelector('.file-card-actions').style.opacity = '0'; });
        card.querySelector('.file-rename-btn').addEventListener('click', function(e) {
            e.stopPropagation();
            window.renameMemFile?.(file.name, idx);
        });
        card.querySelector('.file-delete-btn').addEventListener('click', function(e) {
            e.stopPropagation();
            window.deleteMemFile?.(folderName, idx);
        });
        card.addEventListener('click', function(e) {
            if (e.target === checkbox || e.target.closest('.file-rename-btn') || e.target.closest('.file-delete-btn')) return;
            if (AppState.memory.batchMode) setMemoryFileChecked(!checkbox.checked);
        });
        card.addEventListener('dblclick', function(e) {
            e.stopPropagation();
            if (!AppState.memory.batchMode) window.openMemFileEditor?.(folderName, idx);
        });
        if (AppState.memory.batchMode) checkbox.style.display = 'block';
        return card;
    }

    function appendMemoryFileCards(container, entries, folderName) {
        (entries || []).forEach(function(entry) {
            container.appendChild(createMemoryFileCard(entry.file, entry.idx, folderName));
        });
    }

    function renderAssociatedMemoryFiles(tree, files, folderName) {
        const sections = getAssociatedMemorySections(files, AppState.memory.book);
        [
            { key: 'foundation', title: '基础关联资料' },
            { key: 'planning', title: '大纲与索引' },
            { key: 'stage', title: '阶段粗纲' }
        ].forEach(function(config) {
            const section = document.createElement('section');
            section.className = 'memory-file-section';
            section.dataset.memorySection = config.key;
            const title = document.createElement('div');
            title.className = 'memory-file-section-title';
            title.dataset.memorySectionTitle = config.key;
            title.textContent = config.title;
            section.appendChild(title);
            const grid = document.createElement('div');
            grid.className = 'memory-file-card-grid';
            if (sections[config.key].length) appendMemoryFileCards(grid, sections[config.key], folderName);
            else grid.innerHTML = '<div class="memory-section-empty">暂无文件</div>';
            section.appendChild(grid);
            tree.appendChild(section);
        });
    }

    function renderMemoryVolumeBrowser(tree, book, type) {
        const folders = getMemoryVolumeFolders(book, type);
        if (!AppState.memory.folder) {
            const grid = document.createElement('div');
            grid.className = 'memory-volume-grid';
            if (!folders.length) {
                grid.innerHTML = '<div class="memory-section-empty">暂无卷文件夹</div>';
            } else {
                folders.forEach(function(folderName) {
                    const card = document.createElement('div');
                    card.className = 'memory-volume-card';
                    card.dataset.memoryVolumeFolder = folderName;
                    card.innerHTML = `<div style="display:flex;align-items:center;gap:10px;"><span>${renderLineIcon('folder')}</span><span class="memory-volume-card-name">${Utils.escapeHtml(getMemoryVolumeLabel(folderName))}</span></div><div class="memory-volume-card-meta">${book[folderName].length} 个文件</div>`;
                    card.addEventListener('click', function() {
                        if (AppState.memory.batchMode) return;
                        AppState.memory.folder = folderName;
                        renderMemFileList();
                    });
                    card.addEventListener('contextmenu', function(e) {
                        e.preventDefault();
                        window.showFolderContextMenu?.(e.clientX, e.clientY, folderName);
                    });
                    grid.appendChild(card);
                });
            }
            tree.appendChild(grid);
            return;
        }
        const toolbar = document.createElement('div');
        toolbar.className = 'memory-volume-toolbar';
        toolbar.innerHTML = `<button type="button" class="memory-volume-back" data-memory-volume-back>← 返回卷列表</button><strong>${Utils.escapeHtml(getMemoryVolumeLabel(AppState.memory.folder))}</strong>`;
        toolbar.querySelector('[data-memory-volume-back]').addEventListener('click', function() {
            AppState.memory.folder = '';
            renderMemFileList();
        });
        tree.appendChild(toolbar);
        const grid = document.createElement('div');
        grid.className = 'memory-file-card-grid';
        const files = Array.isArray(book[AppState.memory.folder]) ? book[AppState.memory.folder] : [];
        if (files.length) appendMemoryFileCards(grid, files.map((file, idx) => ({ file, idx })), AppState.memory.folder);
        else grid.innerHTML = '<div class="memory-section-empty">此卷暂无文件</div>';
        tree.appendChild(grid);
    }

    function renderFullAnalysisBackup(tree, files, folderName) {
        const entries = (files || []).map(function(file, idx) { return { file, idx }; });
        const volumeNames = Array.from(new Set(entries.map(function(entry) {
            return String(entry.file?.volumeName || '').trim();
        }).filter(Boolean)));
        if (!volumeNames.length) {
            const grid = document.createElement('div');
            grid.className = 'memory-file-card-grid';
            if (entries.length) appendMemoryFileCards(grid, entries, folderName);
            else grid.innerHTML = '<div class="memory-section-empty">暂无全文分析备份</div>';
            tree.appendChild(grid);
            return;
        }
        const selectedVolume = String(AppState.memory.backupVolume || '');
        if (!selectedVolume || !volumeNames.includes(selectedVolume)) {
            AppState.memory.backupVolume = '';
            const grid = document.createElement('div');
            grid.className = 'memory-volume-grid';
            volumeNames.forEach(function(volumeName) {
                const count = entries.filter(function(entry) { return entry.file?.volumeName === volumeName; }).length;
                const card = document.createElement('div');
                card.className = 'memory-volume-card';
                card.dataset.fullAnalysisBackupVolume = volumeName;
                card.innerHTML = `<div style="display:flex;align-items:center;gap:10px;"><span>${renderLineIcon('folder')}</span><span class="memory-volume-card-name">${Utils.escapeHtml(volumeName)}</span></div><div class="memory-volume-card-meta">${count} 个章节文件</div>`;
                card.addEventListener('click', function() {
                    if (AppState.memory.batchMode) return;
                    AppState.memory.backupVolume = volumeName;
                    renderMemFileList();
                });
                grid.appendChild(card);
            });
            tree.appendChild(grid);
            return;
        }
        const toolbar = document.createElement('div');
        toolbar.className = 'memory-volume-toolbar';
        toolbar.innerHTML = `<button type="button" class="memory-volume-back" data-full-analysis-backup-back>← 返回卷列表</button><strong>${Utils.escapeHtml(selectedVolume)}</strong>`;
        toolbar.querySelector('[data-full-analysis-backup-back]').addEventListener('click', function() {
            AppState.memory.backupVolume = '';
            renderMemFileList();
        });
        tree.appendChild(toolbar);
        const grid = document.createElement('div');
        grid.className = 'memory-file-card-grid';
        appendMemoryFileCards(grid, entries.filter(function(entry) {
            return entry.file?.volumeName === selectedVolume;
        }), folderName);
        tree.appendChild(grid);
    }

    function renderMemoryTrash(tree, book) {
        const trash = typeof window.getMemoryTrash === 'function' ? window.getMemoryTrash(book) : [];
        const toolbar = document.createElement('div');
        toolbar.className = 'memory-volume-toolbar';
        toolbar.innerHTML = `<strong>回收站</strong><button type="button" class="memory-volume-back" data-memory-trash-clear>清空回收站</button>`;
        toolbar.querySelector('[data-memory-trash-clear]').addEventListener('click', function() {
            window.clearMemoryTrash?.();
        });
        tree.appendChild(toolbar);
        if (!trash.length) {
            const empty = document.createElement('div');
            empty.className = 'memory-section-empty';
            empty.textContent = '回收站为空';
            tree.appendChild(empty);
            return;
        }
        const grid = document.createElement('div');
        grid.className = 'memory-file-card-grid';
        trash.forEach(function(item, idx) {
            const card = document.createElement('div');
            card.className = 'memory-file-card memory-trash-card';
            const deletedDate = item.deletedAt ? new Date(item.deletedAt).toLocaleString() : '-';
            card.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;">
                    <span class="memory-file-card-icon" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:transparent;flex-shrink:0;">${renderLineIcon('file')}</span>
                    <div style="min-width:0;flex:1;">
                        <div class="memory-file-name" title="${Utils.escapeHtml(item.name || '')}">${Utils.escapeHtml(item.name || '未命名文件')}</div>
                        <div style="font-size:11px;color:#999;margin-top:3px;">删除时间：${Utils.escapeHtml(deletedDate)}</div>
                    </div>
                </div>
                <div style="font-size:11px;color:#8b8f98;margin-top:2px;">原文件夹：${Utils.escapeHtml(item.originalFolder || '默认文件夹')}</div>
                <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:auto;">
                    <button type="button" class="btn btn-outline btn-sm" data-memory-trash-restore="${idx}">恢复</button>
                    <button type="button" class="btn btn-outline btn-sm" data-memory-trash-delete="${idx}" style="color:#e74c3c;">彻底删除</button>
                </div>`;
            card.querySelector('[data-memory-trash-restore]').addEventListener('click', function(e) {
                e.stopPropagation();
                window.restoreMemoryTrashItem?.(idx);
            });
            card.querySelector('[data-memory-trash-delete]').addEventListener('click', function(e) {
                e.stopPropagation();
                window.permanentlyDeleteMemoryTrashItem?.(idx);
            });
            grid.appendChild(card);
        });
        tree.appendChild(grid);
    }

    function renderMemFileList() {
        const tree = document.getElementById('memTree');
        if (!tree) return;
        tree.innerHTML = '';
        tree.style.display = 'block';
        tree.style.flexWrap = '';
        tree.style.gap = '';
        tree.style.alignContent = '';
        if (!AppState.memory.book) return;
        const book = getMemBooks()[AppState.memory.book];
        if (!book) return;
        if (AppState.memory.view === 'fineOutline' || AppState.memory.view === 'decompose' || AppState.memory.view === 'chapterSummary') {
            renderMemoryVolumeBrowser(tree, book, AppState.memory.view);
            return;
        }
        if (AppState.memory.view === 'trash') {
            renderMemoryTrash(tree, book);
            return;
        }
        const folderName = AppState.memory.folder;
        const files = folderName && Array.isArray(book[folderName]) ? book[folderName] : [];
        if (AppState.memory.view === 'custom' && folderName === '全文分析备份') {
            renderFullAnalysisBackup(tree, files, folderName);
            return;
        }
        if (AppState.memory.view === 'associated') {
            renderAssociatedMemoryFiles(tree, files, folderName);
            return;
        }
        if (!files.length) {
            tree.innerHTML = '<div style="width:100%;color:#888;text-align:center;padding:40px;">此文件夹暂无文件</div>';
            return;
        }
        const grid = document.createElement('div');
        grid.className = 'memory-file-card-grid';
        appendMemoryFileCards(grid, files.map((file, idx) => ({ file, idx })), folderName);
        tree.appendChild(grid);
    }

    window.renderMemFileList = renderMemFileList;
    window.ZHIYU_MEMORY_FILE_LIST_READY = true;
})(window);
