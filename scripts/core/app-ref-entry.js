(function(window) {
    'use strict';

    const AppState = window.ZHIYU_APP_STATE || window.AppState;
    const Utils = window.ZHIYU_UTILS || {};

    function getResultBox() {
        return document.getElementById('resultBox');
    }

    function getRefSelectionKey(bookName, rf) {
        return [String(bookName || ''), String(rf?.folder || ''), String(rf?.name || '')].join('::');
    }

    function getRefDisplayName(rf, bookName) {
        const explicitName = String(rf?.displayName || '').trim();
        if (explicitName) return explicitName;
        const prefix = String(bookName || '').trim() + '_';
        let name = String(rf?.name || '').trim();
        if (prefix !== '_' && name.startsWith(prefix)) name = name.slice(prefix.length);
        return name.replace(/\.(?:md|txt)$/i, '') || '关联文件';
    }

    function createRefPreviewShell(resultBox, displayName) {
        const escapeHtml = typeof Utils.escapeHtml === 'function' ? Utils.escapeHtml : (value => String(value || ''));
        resultBox.classList.add('ref-file-preview');
        resultBox.setAttribute('contenteditable', 'false');
        resultBox.innerHTML = [
            '<article class="ref-file-preview-card">',
            '<header class="ref-file-preview-title">', escapeHtml(displayName), '</header>',
            '<section class="ref-file-preview-content"></section>',
            '</article>'
        ].join('');
        return resultBox.querySelector('.ref-file-preview-content');
    }

    function clearRefFileEditorState(resultBox) {
        const editor = resultBox || getResultBox();
        if (!editor) return false;
        const wasViewingRefFile = !!editor.dataset.editingRefFile
            || !!editor.dataset.infoCardOriginalMd
            || !!editor.dataset.roleRelationOriginalMd;
        editor.querySelectorAll?.('canvas').forEach(canvas => canvas._graphCleanup?.());
        [
            'editingRefFile',
            'editingRefBookName',
            'editingRefFolder',
            'editingRefType',
            'infoCardOriginalMd',
            'infoCardFolder',
            'roleRelationOriginalMd',
            'pendingFindReplacements'
        ].forEach(key => delete editor.dataset[key]);
        editor.classList.remove('ref-file-preview');
        window._pendingChapterSaveBeforeRef = null;
        if (AppState?.ui) AppState.ui.activeRefFileKey = '';
        document.querySelectorAll('#treeRefs .ref-file-item.active').forEach(item => item.classList.remove('active'));
        return wasViewingRefFile;
    }

    function showRefFileInEditor({ rf, idx, bookName, book, entryEl }) {
        if (!rf || !bookName || !book) return;

        const currentChapterGenerating = typeof window.isCurrentlyGeneratingChapter === 'function'
            && window.isCurrentlyGeneratingChapter(
                AppState?.chapter?.book,
                AppState?.chapter?.vi,
                AppState?.chapter?.ci
            );
        if (!currentChapterGenerating
            && AppState?.chapter?.book && AppState.chapter.vi >= 0 && AppState.chapter.ci >= 0
            && typeof window.flushCurrentAccountEditorState === 'function') {
            const pendingSave = Promise.resolve(window.flushCurrentAccountEditorState());
            window._pendingChapterSaveBeforeRef = pendingSave;
            pendingSave.catch(function() {});
        }

        if (AppState) {
            window.syncBookScopedReferenceState?.(bookName, AppState.chapter?.book || '');
            AppState.chapter = { book: bookName, vi: -2, ci: idx };
            AppState.ui = AppState.ui || {};
            AppState.ui.activeRefFileKey = getRefSelectionKey(bookName, rf);
        }
    localStorage.setItem(AccountDataScope.key('novel_current_book'), bookName);
    localStorage.removeItem(AccountDataScope.key('novel_current_chapter'));

        const resultBox = getResultBox();
        if (!resultBox) return;

        const rawContent = rf.content || '';
        const displayContent = String(rawContent);
        const refName = String(rf.name || '');
        const refDisplayName = getRefDisplayName(rf, bookName);
        const isInfoCard = ['信息卡', '信息表'].includes(refName) || /_(?:信息卡|信息表)$/.test(refName);
        const isRoleList = refName === '角色列表' || /_角色列表$/.test(refName);
        const roleViewportHeight = isRoleList ? Math.max(360, Math.round(resultBox.clientHeight || 520)) : 0;
        const previewContent = createRefPreviewShell(resultBox, refDisplayName);

        if ((isInfoCard || isRoleList) && window.InfoCardRenderer) {
            resultBox.dataset.infoCardOriginalMd = displayContent;
            resultBox.dataset.infoCardFolder = rf.folder || '';
            if (isRoleList) resultBox.dataset.roleRelationOriginalMd = displayContent;
            else delete resultBox.dataset.roleRelationOriginalMd;
            previewContent.innerHTML = window.InfoCardRenderer.render(displayContent, { bookName, forceRelationGraph: isRoleList, viewportHeight: roleViewportHeight });
            resultBox.style.background = '';
            if (isRoleList) resultBox.scrollTop = 0;
            setTimeout(() => window.InfoCardRenderer.drawCanvas(resultBox), 50);
        } else {
            delete resultBox.dataset.infoCardOriginalMd;
            delete resultBox.dataset.infoCardFolder;
            delete resultBox.dataset.roleRelationOriginalMd;
            previewContent.innerHTML = typeof Utils.mdToHtml === 'function' ? Utils.mdToHtml(displayContent) : displayContent;
            resultBox.style.background = '';
        }

        resultBox.dataset.editingRefFile = rf.name;
        resultBox.dataset.editingRefBookName = bookName;
        resultBox.dataset.editingRefFolder = rf.folder || '';
        resultBox.dataset.pendingFindReplacements = '';

        const sysFileNames = ['大纲', '边界卡', '追踪表', '承接卡', '信息表', '角色列表', '关键事件表', '资料索引', '信息卡', '角色关系网', '设定集'];
        if (sysFileNames.includes(rf.name)) {
            const snapKey = window.AccountDataScope.key('zhiyu_file_snapshot_' + bookName + '_' + rf.name);
            const largeStore = window.ZHIYU_LARGE_LOCAL_STORE;
            const savedSnapshot = largeStore?.get?.(snapKey) ?? localStorage.getItem(snapKey);
            if (!savedSnapshot) {
                if (largeStore?.set) {
                    largeStore.set(snapKey, rawContent, 'file_snapshot').catch(function(error) {
                        console.error('关联文件快照保存失败：', error);
                    });
                } else {
                    localStorage.setItem(snapKey, rawContent);
                }
            }
        }

        const editingNameEl = document.getElementById('editingChapterName');
        if (editingNameEl) editingNameEl.textContent = refDisplayName;

        if (typeof window.updateChapWordCount === 'function') window.updateChapWordCount(rawContent);
        if (typeof window.updateWordProgress === 'function') window.updateWordProgress(rawContent.length, 0);

        let total = 0;
        (book.volumes || []).forEach(v => (v.chapters || []).forEach(c => {
            total += (c.content || '').length;
        }));
        const totalEl = document.getElementById('totalWordCount');
        if (totalEl) totalEl.textContent = total;
        const wordStats = document.getElementById('wordStats');
        if (wordStats) wordStats.style.display = 'flex';

        document.querySelectorAll('#treeContent .chapter-item.selected').forEach(item => item.classList.remove('selected'));
        document.querySelectorAll('#treeRefs .ref-file-item.active').forEach(item => item.classList.remove('active'));
        if (entryEl) entryEl.classList.add('active');

        // 关联文件不是正文章节，避免显示点开后无法定位章节的历史版本入口。
        ['btnSaveNewChapter', 'btnHistoryVersions', 'btnRegen', 'btnCopy', 'btnConfirm'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.style.display = 'none';
        });

        const saveRefBtn = document.getElementById('btnSaveRefFile');
        if (saveRefBtn) {
            saveRefBtn.style.display = 'none';
            saveRefBtn.disabled = false;
        }
        const findBtn = document.getElementById('btnFindReplace');
        if (findBtn) findBtn.style.display = 'none';
    }

    function renderRefEntry({ rf, idx, bookName, book }) {
        const div = document.createElement('div');
        div.className = 'chapter-item ref-file-item';
        div.dataset.refFileKey = getRefSelectionKey(bookName, rf);
        if (AppState?.ui?.activeRefFileKey === div.dataset.refFileKey) div.classList.add('active');
        div.style.cssText = 'color:#888;font-style:italic;font-size:12px;';

        const iconHtml = typeof window.renderLineIcon === 'function' ? window.renderLineIcon(rf.icon) : '';
        const escapeHtml = typeof Utils.escapeHtml === 'function' ? Utils.escapeHtml : (value => String(value || ''));
        const displayName = getRefDisplayName(rf, bookName);
        div.innerHTML = '<span>' + iconHtml + ' ' + escapeHtml(displayName) + '</span><span style="color:#aaa;font-size:10px;">' + (rf.content?.length || 0) + '字</span>';

        div.addEventListener('click', function() {
            showRefFileInEditor({ rf, idx, bookName, book, entryEl: div });
        });

        return div;
    }

    window.showRefFileInEditor = showRefFileInEditor;
    window.clearRefFileEditorState = clearRefFileEditorState;
    window.renderRefEntry = renderRefEntry;
    window.getRefSelectionKey = getRefSelectionKey;
    window.getRefDisplayName = getRefDisplayName;
})(window);
