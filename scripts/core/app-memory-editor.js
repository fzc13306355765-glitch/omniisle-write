// Split project memory file editor module.
// Owns the memory file edit/preview modal only. It does not change memory storage,
// folder rendering, import/export, or backend sync behavior.
(function(window) {
    'use strict';

    const Utils = window.ZHIYU_UTILS || {};
    const Toast = window.ZHIYU_TOAST;
    const AppState = window.ZHIYU_APP_STATE || window.AppState || {};

    function getMemBooks() {
        if (typeof window.getMemBooks === 'function') return window.getMemBooks();
        return {};
    }

    function sMB(memBooks) {
        if (typeof window.sMB === 'function') return window.sMB(memBooks);
        return false;
    }

    function closeMemoryEditor() {
        const modal = document.getElementById('editorModal');
        if (modal) modal.style.display = 'none';
    }

    function refreshMemTree() {
        if (typeof window.refreshMemTree === 'function') window.refreshMemTree();
    }

    function openMemFileEditor(folderName, fileIdx) {
        const memBooks = getMemBooks();
        const file = memBooks[AppState.memory.book]?.[folderName]?.[fileIdx];
        if (!file) {
            Toast?.warn?.('未找到要编辑的记忆文件');
            return;
        }

        const title = document.getElementById('edTitle');
        const textarea = document.getElementById('edText');
        const preview = document.getElementById('edPreview');
        const save = document.getElementById('edSave');
        const modal = document.getElementById('editorModal');

        if (!title || !textarea || !preview || !save || !modal) {
            Toast?.error?.('记忆文件编辑器未加载完整');
            return;
        }

        title.textContent = '编辑：' + file.name;
        textarea.value = file.content || '';
        preview.dataset.memoryPreviewThemeScope = folderName === '关联文件夹' ? 'preserve' : 'themed';
        preview.innerHTML = Utils.mdToHtml(String(file.content || ''));
        textarea.oninput = function() {
            preview.innerHTML = Utils.mdToHtml(String(this.value || ''));
        };

        save.onclick = function() {
            const latestMemBooks = getMemBooks();
            const targetFile = latestMemBooks[AppState.memory.book]?.[folderName]?.[fileIdx];
            if (!targetFile) {
                Toast?.warn?.('当前记忆文件已不存在，无法保存');
                return;
            }
            targetFile.content = textarea.value;
            targetFile.updatedAt = new Date().toISOString();
            sMB(latestMemBooks);
            closeMemoryEditor();
            refreshMemTree();
            window.renderMemFileList?.();
            Toast?.success?.('保存成功！');
        };

        modal.style.display = 'flex';
    }

    window.openMemFileEditor = openMemFileEditor;
    window.closeMemoryEditor = closeMemoryEditor;
})(window);
