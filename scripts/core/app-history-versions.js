(function(window, document) {
    'use strict';

    const Core = window.ZHIYU_HISTORY_VERSION_CORE;
    const IDB = window.ZHIYU_IDB;
    const MAX_UNPINNED = 50;
    const state = { target: null, snapshots: [], selectedId: 'current', busy: false };

    function byId(id) { return document.getElementById(id); }
    function modalApi() { return window.ZHIYU_MODAL || window.Modal || { open() {}, close() {} }; }
    function toast(type, message) { (window.ZHIYU_TOAST || window.Toast)?.[type]?.(message); }
    async function confirmAction(message) {
        const api = window.ZHIYU_CONFIRM || window.Confirm;
        return api?.show ? api.show(message) : window.confirm(message);
    }
    function historyKey(target) {
        return 'chapter_history:' + encodeURIComponent(String(target?.uid || ''))
            + ':' + encodeURIComponent(String(target?.localId || ''));
    }
    function assertStorage() {
        if (!IDB?.get || !IDB?.set) throw new Error('当前浏览器无法使用本机历史版本存储');
    }
    function normalizeSnapshots(value) {
        return (Array.isArray(value) ? value : [])
            .filter(item => item && item._id && typeof item.content === 'string')
            .sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0));
    }
    async function readSnapshots(target) {
        assertStorage();
        return normalizeSnapshots(await IDB.get(historyKey(target)).catch(() => []));
    }
    async function writeSnapshots(target, snapshots) {
        assertStorage();
        const pinned = snapshots.filter(item => item.isPinned === true);
        const unpinned = snapshots.filter(item => item.isPinned !== true).slice(0, MAX_UNPINNED);
        const keep = new Set([...pinned, ...unpinned].map(item => item._id));
        const compact = snapshots.filter(item => keep.has(item._id));
        await IDB.set(historyKey(target), compact);
        return compact;
    }
    function snapshotTarget(input) {
        const target = input || Core?.captureTarget?.();
        if (!target?.localId) return null;
        return {
            uid: String(target.uid || Core.getActiveUid()),
            book: String(target.book || ''), vi: Number(target.vi), ci: Number(target.ci),
            localId: String(target.localId), title: String(target.title || '当前章节'),
            content: Core.normalizeContent(target.content || ''), version: Number(target.version || 1),
            wordCount: Number(target.wordCount || 0)
        };
    }
    async function recordChapterHistorySnapshot(input, reason) {
        const target = snapshotTarget(input);
        if (!target || !Core.comparableContent(target.content)) return false;
        const snapshots = await readSnapshots(target);
        const comparable = Core.comparableContent(target.content);
        if (snapshots.some(item => Core.comparableContent(item.content) === comparable)) return false;
        const createdAt = Date.now();
        snapshots.unshift({
            _id: 'local_history_' + createdAt.toString(36) + '_' + Math.random().toString(36).slice(2, 8),
            content: target.content, snapshotTime: new Date(createdAt).toISOString(), createdAt,
            wordCount: target.wordCount || (window.countWords?.(target.content) || 0),
            chapterVersion: target.version, reason: reason || 'manual', isPinned: false
        });
        await writeSnapshots(target, snapshots);
        return true;
    }

    function formatTime(value) {
        const date = new Date(value || 0);
        return Number.isNaN(date.getTime()) ? '时间未知' : date.toLocaleString('zh-CN', { hour12: false });
    }
    function reasonLabel(reason) {
        return ({ auto: '自动保存', restore_backup: '恢复前备份', manual: '手动保存', initial: '初始版本' })[reason]
            || '历史版本';
    }
    function setStatus(message, kind) {
        const element = byId('historyVersionsStatus');
        if (!element) return;
        element.textContent = message;
        element.dataset.kind = kind || '';
    }
    function renderPreview(content, title, meta) {
        const preview = byId('historyVersionPreview');
        if (preview) preview.innerHTML = Core.normalizeContent(content || '');
        if (byId('historyVersionPreviewTitle')) byId('historyVersionPreviewTitle').textContent = title || '内容预览';
        if (byId('historyVersionPreviewMeta')) byId('historyVersionPreviewMeta').textContent = meta || '';
    }
    function createVersionItem(options) {
        const item = document.createElement('div');
        item.className = 'history-version-item' + (options.selected ? ' is-selected' : '') + (options.current ? ' is-current' : '');
        item.tabIndex = 0;
        item.dataset.kind = options.current ? 'current' : 'snapshot';
        item.dataset.id = options.id;
        const main = document.createElement('div');
        main.className = 'history-version-item-main';
        const title = document.createElement('div');
        title.className = 'history-version-item-title';
        title.textContent = options.title;
        const meta = document.createElement('div');
        meta.className = 'history-version-item-meta';
        meta.textContent = options.meta;
        main.append(title, meta);
        item.appendChild(main);
        if (!options.current) {
            const pin = document.createElement('button');
            pin.type = 'button';
            pin.className = 'history-version-pin' + (options.pinned ? ' is-pinned' : '');
            pin.dataset.action = 'pin';
            pin.dataset.id = options.id;
            pin.textContent = options.pinned ? '已固定' : '固定';
            item.appendChild(pin);
        }
        return item;
    }
    function renderVersionList() {
        const list = byId('historyVersionsList');
        if (!list) return;
        list.replaceChildren(createVersionItem({
            id: 'current', current: true, selected: state.selectedId === 'current', title: '当前正文',
            meta: Number(state.target?.wordCount || 0).toLocaleString() + ' 字'
        }));
        state.snapshots.forEach(snapshot => list.appendChild(createVersionItem({
            id: snapshot._id, selected: state.selectedId === snapshot._id,
            title: formatTime(snapshot.snapshotTime),
            meta: Number(snapshot.wordCount || 0).toLocaleString() + ' 字 · ' + reasonLabel(snapshot.reason),
            pinned: snapshot.isPinned === true
        })));
        if (byId('historyVersionCount')) byId('historyVersionCount').textContent = state.snapshots.length + ' 个历史版本';
    }
    function selectCurrentVersion() {
        state.selectedId = 'current';
        state.target = Core.captureTarget() || state.target;
        renderVersionList();
        renderPreview(state.target?.content || '', '当前正文', Number(state.target?.wordCount || 0).toLocaleString() + ' 字');
        if (byId('btnRestoreSnapshot')) byId('btnRestoreSnapshot').disabled = true;
        setStatus('选择旧版本后，可先预览再恢复。');
    }
    function selectSnapshot(snapshotId) {
        const snapshot = state.snapshots.find(item => String(item._id) === String(snapshotId));
        if (!snapshot || state.busy) return;
        state.selectedId = String(snapshot._id);
        renderVersionList();
        renderPreview(snapshot.content, formatTime(snapshot.snapshotTime),
            Number(snapshot.wordCount || 0).toLocaleString() + ' 字 · ' + reasonLabel(snapshot.reason));
        if (byId('btnRestoreSnapshot')) byId('btnRestoreSnapshot').disabled = false;
        setStatus('该版本只保存在当前设备。');
    }
    async function loadSnapshots() {
        const loading = byId('historyVersionsLoading');
        if (loading) loading.style.display = 'block';
        try {
            state.snapshots = await readSnapshots(state.target);
            renderVersionList();
            setStatus(state.snapshots.length ? '历史版本已从本机读取。' : '还没有旧版本；保存改动前会自动保留旧正文。');
        } catch (error) {
            state.snapshots = [];
            renderVersionList();
            setStatus(error.message || '本机历史版本读取失败', 'error');
        } finally {
            if (loading) loading.style.display = 'none';
        }
    }
    async function togglePinned(snapshotId, button) {
        const snapshot = state.snapshots.find(item => String(item._id) === String(snapshotId));
        if (!snapshot || state.busy) return;
        button.disabled = true;
        try {
            snapshot.isPinned = snapshot.isPinned !== true;
            state.snapshots = await writeSnapshots(state.target, state.snapshots);
            renderVersionList();
            toast('success', snapshot.isPinned ? '已固定，该版本不会被自动清理' : '已取消固定');
        } catch (error) {
            toast('error', error.message || '固定版本失败');
        }
    }
    async function syncCurrentHistoryChapter() {
        if (state.busy) return;
        state.busy = true;
        const button = byId('btnSyncHistoryCurrent');
        if (button) { button.disabled = true; button.textContent = '保存中…'; }
        try {
            state.target = Core.captureTarget() || state.target;
            const created = await recordChapterHistorySnapshot(state.target, 'manual');
            await loadSnapshots();
            toast('success', created ? '当前正文已保存为本机历史版本' : '相同内容已经保存过');
        } catch (error) {
            toast('error', error.message || '保存历史版本失败');
        } finally {
            state.busy = false;
            if (button) { button.disabled = false; button.textContent = '保存当前版本'; }
        }
    }
    async function restoreSelectedSnapshot() {
        const snapshot = state.snapshots.find(item => String(item._id) === state.selectedId);
        if (!snapshot || state.busy) return;
        if (!Core.isTargetActive(state.target)) {
            toast('warn', '当前章节已切换，请重新打开历史版本');
            return;
        }
        const confirmed = await confirmAction('确定把“' + state.target.title + '”恢复到 '
            + formatTime(snapshot.snapshotTime) + ' 的版本吗？恢复前会先备份当前正文，其他章节不会变化。');
        if (!confirmed) return;
        state.busy = true;
        const restoreButton = byId('btnRestoreSnapshot');
        if (restoreButton) restoreButton.disabled = true;
        try {
            await recordChapterHistorySnapshot(Core.captureTarget(), 'restore_backup');
            const located = Core.locateTarget(state.target);
            if (!located) throw new Error('章节状态已变化，请重新打开历史版本');
            const restoredContent = Core.normalizeContent(snapshot.content);
            const prepared = window.prepareChapterContentForLocalSave?.(
                state.target.book,
                located.vi,
                located.ci,
                restoredContent,
                { books: located.books }
            );
            if (!prepared) throw new Error('历史正文无法保存，未完成恢复');
            prepared.chapter._version = Number(prepared.chapter._version || 0) + 1;
            window.ZhiyuEditorAdapter?.applyExternalContentMetadata?.(prepared.chapter, restoredContent);
            window.updateWordCount?.(located.book);
            const persisted = typeof window.persistPreparedChapter === 'function'
                ? await window.persistPreparedChapter(prepared)
                : { ok: await Promise.resolve(window.sB?.(located.books, { cloudWrite: 'suppress' })) !== false };
            if (!persisted.ok) throw new Error('本机章节保存失败，未完成恢复');
            const editor = byId('resultBox');
            if (editor && Core.isTargetActive(state.target)) {
                if (window.ZhiyuEditorAdapter?.replaceContent) {
                    window.ZhiyuEditorAdapter.replaceContent(editor, restoredContent);
                } else {
                    editor.innerHTML = restoredContent;
                }
            }
            window.touchBook?.(state.target.book);
            window.refreshTree?.();
            toast('success', '已恢复该章节；恢复前的正文也已保留为历史版本');
            closeHistoryVersions();
        } catch (error) {
            setStatus(error.message || '恢复失败，当前正文没有被修改。', 'error');
            toast('error', error.message || '恢复失败');
        } finally {
            state.busy = false;
            if (restoreButton && state.selectedId !== 'current') restoreButton.disabled = false;
        }
    }
    function closeHistoryVersions() {
        state.busy = false;
        modalApi().close('historyVersionsModal');
    }
    async function openHistoryVersions() {
        const target = Core?.captureTarget?.();
        if (!target?.localId) {
            toast('warn', '请先选择并保存一个正式章节');
            return;
        }
        state.target = target;
        state.snapshots = [];
        state.selectedId = 'current';
        state.busy = false;
        if (byId('historyChapterLabel')) byId('historyChapterLabel').textContent = target.book + ' · ' + target.title;
        if (byId('btnSyncHistoryCurrent')) byId('btnSyncHistoryCurrent').textContent = '保存当前版本';
        const note = byId('historyVersionsModal')?.querySelector('.history-versions-note');
        if (note) note.textContent = '这里只保存和恢复当前章节，全部历史版本都留在当前设备。';
        if (byId('historyVersionsLoading')) byId('historyVersionsLoading').textContent = '正在读取本机版本...';
        modalApi().open('historyVersionsModal');
        selectCurrentVersion();
        await loadSnapshots();
    }
    function handleListClick(event) {
        const actionButton = event.target.closest('[data-action]');
        if (actionButton?.dataset.action === 'pin') {
            event.stopPropagation();
            void togglePinned(actionButton.dataset.id, actionButton);
            return;
        }
        const item = event.target.closest('.history-version-item');
        if (!item) return;
        if (item.dataset.kind === 'current') selectCurrentVersion();
        else selectSnapshot(item.dataset.id);
    }
    function bindHistoryVersionActions() {
        if (bindHistoryVersionActions.bound || !Core) return;
        bindHistoryVersionActions.bound = true;
        byId('btnHistoryVersions')?.addEventListener('click', openHistoryVersions);
        byId('btnCloseHistoryVersionsTop')?.addEventListener('click', closeHistoryVersions);
        byId('btnCloseHistoryVersions')?.addEventListener('click', closeHistoryVersions);
        byId('btnRestoreSnapshot')?.addEventListener('click', restoreSelectedSnapshot);
        byId('btnSyncHistoryCurrent')?.addEventListener('click', syncCurrentHistoryChapter);
        byId('historyVersionsList')?.addEventListener('click', handleListClick);
        byId('historyVersionsList')?.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            const item = event.target.closest('.history-version-item');
            if (!item || event.target.closest('button')) return;
            event.preventDefault();
            if (item.dataset.kind === 'current') selectCurrentVersion();
            else selectSnapshot(item.dataset.id);
        });
        byId('historyVersionsModal')?.addEventListener('click', event => {
            if (event.target === event.currentTarget && !state.busy) closeHistoryVersions();
        });
    }

    bindHistoryVersionActions();
    window.bindHistoryVersionActions = bindHistoryVersionActions;
    window.openHistoryVersions = openHistoryVersions;
    window.closeHistoryVersions = closeHistoryVersions;
    window.recordChapterHistorySnapshot = recordChapterHistorySnapshot;
    window.markHistoryRestoreSynced = function() {};
    window.ZHIYU_HISTORY_VERSIONS_TEST = Object.freeze({
        getState() { return { ...state, snapshots: state.snapshots.map(item => ({ ...item })) }; },
        selectCurrentVersion, selectSnapshot, syncCurrentHistoryChapter,
        restoreSelectedSnapshot, recordChapterHistorySnapshot
    });
    window.ZHIYU_HISTORY_VERSIONS_READY = true;
})(window, document);
