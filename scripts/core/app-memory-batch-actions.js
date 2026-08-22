(function(window){
    'use strict';

    const Toast = window.ZHIYU_TOAST || window.Toast;
    const Confirm = window.ZHIYU_CONFIRM || window.Confirm;
    const Prompt = window.ZHIYU_PROMPT || window.Prompt;
    const AppState = window.ZHIYU_APP_STATE || window.AppState || {};

    function getMemBooks(){
        return typeof window.getMemBooks === 'function' ? window.getMemBooks() : {};
    }

    function sMB(memBooks){
        if (typeof window.sMB === 'function') window.sMB(memBooks);
    }

    function refreshMemGrid(){
        if (typeof window.refreshMemGrid === 'function') window.refreshMemGrid();
    }

    function refreshMemTree(){
        if (typeof window.refreshMemTree === 'function') window.refreshMemTree();
    }

    function getMemoryFileImportTarget(memBooks, importMode){
        const isOutlineContinueImport = importMode === 'outline-continue';
        const bookName = String(isOutlineContinueImport
            ? (AppState.chapter?.book || document.getElementById('bookSel')?.value || '')
            : (AppState.memory?.book || '')).trim();
        const book = memBooks?.[bookName];
        if (!book || typeof book !== 'object') return null;
        const selectedFolder = String(AppState.memory?.folder || '').trim();
        const selectedView = String(AppState.memory?.view || 'associated').trim();
        const systemFolder = typeof window.getMemorySystemFolderName === 'function'
            ? String(window.getMemorySystemFolderName(book) || '').trim()
            : '';
        const hasSelectedFolder = selectedFolder && Array.isArray(book[selectedFolder]);
        if (!isOutlineContinueImport && !hasSelectedFolder && selectedView !== 'associated') {
            throw new Error('请先选择一个具体文件夹，再导入文件');
        }
        const folderName = isOutlineContinueImport
            ? (systemFolder || '默认文件夹')
            : (hasSelectedFolder ? selectedFolder : (systemFolder || '默认文件夹'));
        if (!Array.isArray(book[folderName])) book[folderName] = [];
        return { bookName, folderName, book, files: book[folderName], importMode: importMode || 'current-folder' };
    }

    function getMemoryImportOwner(){
        return String(window.AccountDataScope?.getActiveUid?.() || AppState.auth?.uid || AppState.auth?.username || 'guest');
    }

    function readMemoryImportFile(file){
        return new Promise(function(resolve, reject){
            const reader = new FileReader();
            reader.onload = function(ev){
                resolve({
                    name: String(file?.name || '').replace(/\.(md|txt)$/i, ''),
                    content: String(ev?.target?.result || ''),
                    createdAt: new Date().toISOString()
                });
            };
            reader.onerror = function(){
                reject(new Error('文件“' + String(file?.name || '未命名文件') + '”读取失败'));
            };
            reader.readAsText(file);
        });
    }

    async function importMemoryFilesFromPicker(files, importMode){
        const memBooks = getMemBooks();
        const target = getMemoryFileImportTarget(memBooks, importMode);
        if (!target) {
            throw new Error(importMode === 'outline-continue'
                ? '当前写作作品或关联文件夹不可用，请重新选择作品后再试'
                : '当前记忆库或目标文件夹不可用，请重新进入后再试');
        }
        const owner = getMemoryImportOwner();
        const importedFiles = await Promise.all(files.map(readMemoryImportFile));
        const currentMemBooks = getMemBooks();
        const currentBook = currentMemBooks?.[target.bookName];
        const currentView = String(AppState.memory?.view || 'associated').trim();
        const currentSelectedFolder = String(AppState.memory?.folder || '').trim();
        const currentSystemFolder = typeof window.getMemorySystemFolderName === 'function'
            ? String(window.getMemorySystemFolderName(currentBook) || '').trim()
            : '';
        const effectiveCurrentFolder = currentSelectedFolder
            || (currentView === 'associated' ? (currentSystemFolder || '默认文件夹') : '');
        const activeOutlineBook = String(AppState.chapter?.book || document.getElementById('bookSel')?.value || '').trim();
        const selectionStillCurrent = target.importMode === 'outline-continue'
            ? activeOutlineBook === target.bookName
            : (String(AppState.memory?.book || '').trim() === target.bookName
                && effectiveCurrentFolder === target.folderName);
        const targetStillExists = getMemoryImportOwner() === owner
            && selectionStillCurrent
            && currentMemBooks?.[target.bookName] === target.book
            && currentMemBooks[target.bookName]?.[target.folderName] === target.files;
        if (!targetStillExists) {
            throw new Error('导入期间账号、记忆库或目标文件夹已变化，本次文件未保存，请重新导入');
        }
        target.files.push(...importedFiles);
        sMB(memBooks);
        refreshMemTree();
        Toast?.success?.('已导入 ' + importedFiles.length + ' 个文件到“' + target.folderName + '”');
        return { bookName: target.bookName, folderName: target.folderName, count: importedFiles.length };
    }

    function updateFolderCheckbox(folderName){
        const folderDiv = document.querySelector(`.tree-folder input[data-folder="${folderName}"]`)?.closest('.tree-folder');
        if (!folderDiv) return;
        const folderCheckbox = folderDiv.querySelector('input[type="checkbox"]');
        const allFileCheckboxes = folderDiv.querySelectorAll('.tree-children .tree-file input[type="checkbox"]');
        const checkedCount = Array.from(allFileCheckboxes).filter(cb => cb.checked).length;
        if (!folderCheckbox) return;
        folderCheckbox.checked = checkedCount === allFileCheckboxes.length && allFileCheckboxes.length > 0;
        folderCheckbox.indeterminate = checkedCount > 0 && checkedCount < allFileCheckboxes.length;
    }

    function updateMemSelectedCount(){
        const selected = document.querySelectorAll('#memTree .tree-checkbox:checked');
        const countEl = document.getElementById('memSelectedCount');
        if (countEl) countEl.textContent = `已选择: ${selected.length} 项`;
    }

    function updateMemMainBatchUI() {
        const checked = document.querySelectorAll('#memBookGrid .mem-book-checkbox:checked');
        const batchActions = document.getElementById('memMainBatchActions');
        const selectedCount = document.getElementById('memMainSelectedCount');
        const batchDelete = document.getElementById('btnMemMainBatchDelete');
        if (batchActions) batchActions.style.display = AppState.memory?.batchMode ? 'flex' : 'none';
        if (selectedCount) selectedCount.textContent = `已选 ${checked.length} 本`;
        if (batchDelete) batchDelete.disabled = checked.length === 0;
    }

    function exitMemBatchMode() {
        if (AppState.memory) AppState.memory.batchMode = false;
        const manageSub = document.getElementById('btnMemBatchManageSub');
        const deleteBtn = document.getElementById('btnMemBatchDelete');
        const moveBtn = document.getElementById('btnMemBatchMove');
        const tagBtn = document.getElementById('btnMemBatchTag');
        const actions = document.getElementById('memBatchActions');
        const tree = document.getElementById('memTree');
        if (manageSub) manageSub.textContent = '批量管理';
        if (deleteBtn) deleteBtn.style.display = 'none';
        if (moveBtn) moveBtn.style.display = 'none';
        if (tagBtn) tagBtn.style.display = 'none';
        if (actions) actions.style.display = 'none';
        if (tree) tree.classList.remove('mem-tree-batch-mode');
        document.querySelectorAll('#memTree .tree-checkbox').forEach(function(cb) {
            cb.style.display = 'none';
            cb.checked = false;
        });
        document.querySelectorAll('#memFolderSidebar .folder-actions').forEach(function(div) {
            div.style.opacity = '0';
        });
        updateMemSelectedCount();
    }

    document.getElementById('btnMemBatchManageMain')?.addEventListener('click', function() {
        if (!AppState.memory) return;
        AppState.memory.batchMode = !AppState.memory.batchMode;
        document.getElementById('memBookGrid')?.classList.toggle('batch-mode', AppState.memory.batchMode);
        document.querySelectorAll('#memBookGrid .mem-book-checkbox').forEach(cb => {
            cb.style.display = AppState.memory.batchMode ? 'block' : 'none';
            if (!AppState.memory.batchMode) cb.checked = false;
            cb.onchange = updateMemMainBatchUI;
        });
        this.textContent = AppState.memory.batchMode ? '取消管理' : '批量管理';
        updateMemMainBatchUI();
    });

    document.getElementById('btnMemMainBatchDelete')?.addEventListener('click', async function() {
        const checked = document.querySelectorAll('#memBookGrid .mem-book-checkbox:checked');
        if (checked.length === 0) return;
        const names = Array.from(checked).map(cb => cb.dataset.book).join('、');
        const confirmed = await Confirm.show(`确定删除选中的记忆书籍？\n\n${names}\n\n此操作不可恢复！`);
        if (!confirmed) return;
        const memBooks = getMemBooks();
        checked.forEach(cb => { delete memBooks[cb.dataset.book]; });
        sMB(memBooks);
        if (AppState.memory) AppState.memory.batchMode = false;
        const manageMain = document.getElementById('btnMemBatchManageMain');
        if (manageMain) manageMain.textContent = '批量管理';
        refreshMemGrid();
    });

    document.getElementById('btnMemBatchManageSub')?.addEventListener('click', function() {
        if (!AppState.memory) return;
        AppState.memory.batchMode = !AppState.memory.batchMode;
        document.getElementById('memTree')?.classList.toggle('mem-tree-batch-mode', AppState.memory.batchMode);
        const deleteBtn = document.getElementById('btnMemBatchDelete');
        const moveBtn = document.getElementById('btnMemBatchMove');
        const tagBtn = document.getElementById('btnMemBatchTag');
        const actions = document.getElementById('memBatchActions');
        if (deleteBtn) deleteBtn.style.display = AppState.memory.batchMode ? 'inline-flex' : 'none';
        if (moveBtn) moveBtn.style.display = AppState.memory.batchMode ? 'inline-flex' : 'none';
        if (tagBtn) tagBtn.style.display = AppState.memory.batchMode ? 'inline-flex' : 'none';
        if (actions) actions.style.display = AppState.memory.batchMode ? 'flex' : 'none';
        this.textContent = AppState.memory.batchMode ? '取消管理' : '批量管理';
        document.querySelectorAll('#memFolderSidebar .folder-actions').forEach(div => {
            div.style.opacity = AppState.memory.batchMode ? '1' : '0';
        });
        document.querySelectorAll('#memTree .tree-checkbox').forEach(cb => {
            cb.style.display = AppState.memory.batchMode ? 'block' : 'none';
            if (!AppState.memory.batchMode) cb.checked = false;
        });
        if (!AppState.memory.batchMode) updateMemSelectedCount();
    });

    document.getElementById('btnMemSelectAll')?.addEventListener('click', async function(){
        document.querySelectorAll('#memTree input[type="checkbox"]').forEach(cb => cb.checked = true);
        updateMemSelectedCount();
    });

    document.getElementById('btnMemSelectInverse')?.addEventListener('click', async function(){
        document.querySelectorAll('#memTree input[type="checkbox"]').forEach(cb => cb.checked = !cb.checked);
        updateMemSelectedCount();
    });

    document.getElementById('btnMemBatchDelete')?.addEventListener('click', async function(){
        const checked = document.querySelectorAll('#memTree .tree-checkbox:checked');
        if (checked.length === 0) {
            Toast.warn('请选择要删除的文件');
            return;
        }
        const confirmed = await Confirm.show('确定删除选中的 ' + checked.length + ' 个文件？');
        if (!confirmed) return;
        const memBooks = getMemBooks();
        const toDelete = Array.from(checked).map(cb => ({ folder: cb.dataset.folder, idx: parseInt(cb.dataset.idx, 10) }));
        toDelete.sort((a, b) => b.idx - a.idx);
        const deletedFolders = new Set();
        toDelete.forEach(item => {
            if (memBooks[AppState.memory.book][item.folder]) {
                if (typeof window.moveMemFileToTrash === 'function') {
                    window.moveMemFileToTrash(memBooks, AppState.memory.book, item.folder, item.idx);
                } else {
                    memBooks[AppState.memory.book][item.folder].splice(item.idx, 1);
                }
                deletedFolders.add(item.folder);
            }
        });
        deletedFolders.forEach(folder => {
            if (memBooks[AppState.memory.book][folder].length === 0) {
                delete memBooks[AppState.memory.book][folder];
            }
        });
        sMB(memBooks);
        refreshMemTree();
        exitMemBatchMode();
        Toast.success('已删除 ' + toDelete.length + ' 个文件');
    });

    document.getElementById('btnMemBatchMove')?.addEventListener('click', async function(){
        const checked = document.querySelectorAll('#memTree .tree-checkbox:checked');
        if (checked.length === 0) {
            Toast.warn('请选择要移动的文件');
            return;
        }
        const memBooks = getMemBooks();
        const folderNames = Object.keys(memBooks[AppState.memory.book]).filter(k => Array.isArray(memBooks[AppState.memory.book][k]));
        if (folderNames.length <= 1) {
            Toast.warn('只有一个文件夹，无法移动');
            return;
        }
        const currentFolders = Array.from(checked).map(cb => cb.dataset.folder).filter((v, i, a) => a.indexOf(v) === i).join(', ');
        const targetFolder = await Prompt.show('请输入目标文件夹名称：\n\n当前文件夹：' + currentFolders + '\n可用文件夹：' + folderNames.join(', '));
        if (!targetFolder || !targetFolder.trim()) return;
        const target = targetFolder.trim();
        if (!memBooks[AppState.memory.book][target]) {
            Toast.warn('目标文件夹不存在');
            return;
        }
        const srcFiles = Array.from(checked).map(cb => ({ folder: cb.dataset.folder, idx: parseInt(cb.dataset.idx, 10) }));
        srcFiles.sort((a, b) => b.idx - a.idx);
        const srcFolders = new Set();
        srcFiles.forEach(item => {
            const file = memBooks[AppState.memory.book][item.folder].splice(item.idx, 1)[0];
            memBooks[AppState.memory.book][target].push(file);
            srcFolders.add(item.folder);
        });
        srcFolders.forEach(folder => {
            if (memBooks[AppState.memory.book][folder].length === 0) {
                delete memBooks[AppState.memory.book][folder];
            }
        });
        sMB(memBooks);
        refreshMemTree();
        exitMemBatchMode();
        Toast.success('已移动 ' + srcFiles.length + ' 个文件到「' + target + '」');
    });

    document.getElementById('btnMemBatchTag')?.addEventListener('click', async function(){
        const checked = document.querySelectorAll('#memTree .tree-checkbox:checked');
        if (checked.length === 0) {
            Toast.warn('请选择要添加标签的文件');
            return;
        }
        const tag = await Prompt.show('请输入标签内容：');
        if (!tag || !tag.trim()) return;
        const memBooks = getMemBooks();
        checked.forEach(cb => {
            const folder = cb.dataset.folder;
            const idx = parseInt(cb.dataset.idx, 10);
            if (!memBooks[AppState.memory.book][folder][idx].tags) {
                memBooks[AppState.memory.book][folder][idx].tags = [];
            }
            if (!memBooks[AppState.memory.book][folder][idx].tags.includes(tag.trim())) {
                memBooks[AppState.memory.book][folder][idx].tags.push(tag.trim());
            }
        });
        sMB(memBooks);
        refreshMemTree();
        exitMemBatchMode();
        Toast.success('已为 ' + checked.length + ' 个文件添加标签「' + tag.trim() + '」');
    });

    document.getElementById('btnImportMemBook')?.addEventListener('click', async function(){
        document.getElementById('memoryFolderPicker')?.click();
    });

    document.getElementById('memoryFolderPicker')?.addEventListener('change', function(e){
        const files = Array.from(e.target.files);
        if (!files.length) return;
        const dirName = files[0].webkitRelativePath.split('/')[0];
        const memBooks = getMemBooks();
        if (!memBooks[dirName]) memBooks[dirName] = { '默认文件夹': [] };
        files.forEach(f => {
            const reader = new FileReader();
            reader.onload = async function(ev){
                const name = f.name.replace(/\.(md|txt)$/i, '');
                memBooks[dirName]['默认文件夹'].push({ name, content: ev.target.result, createdAt: new Date().toISOString() });
            };
            reader.readAsText(f);
        });
        setTimeout(function(){
            sMB(memBooks);
            refreshMemGrid();
        }, 500);
    });

    document.getElementById('btnNewMemFolder')?.addEventListener('click', async function(){
        if (!AppState.memory?.book) return;
        const name = await Prompt.show('请输入文件夹名称：');
        if (!name) return;
        const memBooks = getMemBooks();
        if (!memBooks[AppState.memory.book][name]) {
            memBooks[AppState.memory.book][name] = [];
            const type = typeof window.getMemFolderType === 'function' ? window.getMemFolderType(name) : 'associated';
            AppState.memory.view = type === 'associated' ? 'custom' : type;
            AppState.memory.folder = type === 'associated' ? name : '';
            sMB(memBooks);
            refreshMemTree();
        } else {
            Toast.warn('文件夹已存在！');
        }
    });

    document.getElementById('btnMemFileImport')?.addEventListener('click', async function(){
        if (!AppState.memory?.book) return;
        const picker = document.getElementById('memoryFilePicker');
        if (!picker) return;
        picker.dataset.memoryImportMode = 'current-folder';
        picker.click();
    });

    document.getElementById('memoryFilePicker')?.addEventListener('change', async function(e){
        const input = e.target;
        const files = Array.from(input.files || []);
        const importMode = input.dataset.memoryImportMode || 'current-folder';
        try {
            if (!files.length) return;
            await importMemoryFilesFromPicker(files, importMode);
        } catch (err) {
            Toast?.warn?.(err?.message || '文件导入失败，请重试');
        } finally {
            input.value = '';
            delete input.dataset.memoryImportMode;
        }
    });

    document.getElementById('btnMemFolderImport')?.addEventListener('click', async function(){
        if (!AppState.memory?.book) return;
        document.getElementById('memoryFolderPicker')?.click();
    });

    window.updateFolderCheckbox = updateFolderCheckbox;
    window.updateMemSelectedCount = updateMemSelectedCount;
    window.updateMemMainBatchUI = updateMemMainBatchUI;
    window.exitMemBatchMode = exitMemBatchMode;
})(window);
