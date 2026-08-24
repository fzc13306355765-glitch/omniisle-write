(function(window, document) {
    'use strict';

    function getDeps() {
        return {
            AppState: window.ZHIYU_APP_STATE || window.AppState,
            Utils: window.ZHIYU_UTILS || window.Utils,
            Toast: window.ZHIYU_TOAST || window.Toast,
            Confirm: window.ZHIYU_CONFIRM || window.Confirm || {
                show: function() { return Promise.resolve(false); }
            },
            InfoCardRenderer: window.InfoCardRenderer,
            gB: window.gB,
            sB: window.sB,
            getMemBooks: window.getMemBooks,
            sMB: window.sMB,
            touchBook: window.touchBook,
            updateWordCount: window.updateWordCount,
            refreshTree: window.refreshTree,
            clearDraft: window.clearDraft,
            clearAIDetectHighlights: window.clearAIDetectHighlights || function() {},
            logToFloat: window.logToFloat || function() {},
            stepLog: window.stepLog,
            syncOutlineChangesToCards: window.syncOutlineChangesToCards,
            syncSingleFileChange: window.syncSingleFileChange
        };
    }

    function bindSaveActions() {
        if (bindSaveActions.bound) return;
        bindSaveActions.bound = true;

        const {
            AppState,
            Utils,
            Toast,
            Confirm,
            InfoCardRenderer,
            gB,
            sB,
            getMemBooks,
            sMB,
            touchBook,
            updateWordCount,
            refreshTree,
            clearDraft,
            clearAIDetectHighlights,
            logToFloat,
            stepLog
        } = getDeps();

                // ===== 保存章节按钮（新增）=====        
                document.getElementById('btnSaveNewChapter')?.addEventListener('click', async function() {        
                    if (!AppState.chapter.book) return;        
                
                    const books = gB();        
                    const ch = books[AppState.chapter.book].volumes[AppState.chapter.vi].chapters[AppState.chapter.ci];        
                    const resultBox = document.getElementById('resultBox');        
                    clearAIDetectHighlights(true);        
                    const currentContent = resultBox.innerHTML;        
                
                    if (ch.content && ch.content.trim() && currentContent !== ch.content) {        
                        const _cf = await Confirm.show('当前章节已有内容，是否覆盖？'); if (!_cf) {        
                            return;        
                        }        
                    }        
                
                    if (ch.content && ch.content.trim() && currentContent !== ch.content
                        && typeof window.recordChapterHistorySnapshot === 'function') {
                        try {
                            const localId = String(ch._localId || window.ensureChapterLocalId?.(ch) || '');
                            await window.recordChapterHistorySnapshot({
                                uid: window.AccountDataScope?.getActiveUid?.() || AppState.auth?.uid || 'local-community-user',
                                book: AppState.chapter.book,
                                vi: AppState.chapter.vi,
                                ci: AppState.chapter.ci,
                                localId,
                                title: ch.name || ch.title || ('第' + (AppState.chapter.ci + 1) + '章'),
                                content: ch.content,
                                version: Number(ch._version || 1),
                                wordCount: window.countWords?.(ch.content) || Number(ch.wordCount || 0)
                            }, 'manual');
                        } catch (historyError) {
                            Toast.warn?.('旧正文未能写入本机历史版本，本次章节仍会继续保存。');
                            console.warn('本机历史版本保存失败:', historyError);
                        }
                    }

                    const prepared = window.prepareChapterContentForLocalSave?.(
                        AppState.chapter.book,
                        AppState.chapter.vi,
                        AppState.chapter.ci,
                        Utils.sanitizeHTML(currentContent),
                        { books }
                    );
                    if (!prepared) return;
                    ch.plot = document.getElementById('plotInput').value;
                    window.saveDraft?.(
                        AppState.chapter.book,
                        AppState.chapter.vi,
                        AppState.chapter.ci,
                        prepared.content,
                        {
                            cleared: prepared.explicitClear,
                            pendingSync: true,
                            contentClearedAt: prepared.explicitClear ? ch.contentClearedAt : 0,
                            revision: Number(ch._version || 0)
                        }
                    );
                    const persisted = typeof window.persistPreparedChapter === 'function'
                        ? await window.persistPreparedChapter(prepared)
                        : { ok: await Promise.resolve(sB(books)) !== false, draftCleared: false };
                    if (!persisted.ok) {
                        Toast.error?.('章节保存失败，当前内容已保留为草稿，请检查存储空间后重试。');
                        return;
                    }
                    touchBook(AppState.chapter.book);        
                    updateWordCount(books[AppState.chapter.book], AppState.chapter.book);        
                    refreshTree();        
                    Toast.success(persisted.draftCleared === false ? '章节已保存，旧草稿稍后清理' : '章节已保存！');
                    window._scheduleReliableCloudBackup?.('save-chapter');
                });

                // ===== 保存引用文件按钮（双向同步）=====        
                document.getElementById('btnSaveRefFile')?.addEventListener('click', async function() {        
                    const btn = this;        
                    const resultBox = document.getElementById('resultBox');        
                    const fileName = resultBox.dataset.editingRefFile;        
                    const bookName = resultBox.dataset.editingRefBookName;
                    const editingFolder = resultBox.dataset.editingRefFolder || '';
                
                    if (!fileName || !bookName) {        
                        Toast.warn('未检测到编辑的文件');        
                        return;        
                    }        
                
                    btn.textContent = '保存中...';        
                    btn.disabled = true;
                    try {
                
                    const isInfoCard = ['信息卡', '信息表', '角色列表', '角色关系网'].includes(fileName)
                        || /_(?:信息卡|信息表|角色列表|角色关系网)$/.test(fileName);
                    const isRoleList = /(?:^|_)(?:角色列表|角色关系网)$/.test(fileName);
                    const currentContent = (isInfoCard && resultBox.dataset.infoCardOriginalMd)        
                        ? resultBox.dataset.infoCardOriginalMd        
                        : (resultBox.innerText || resultBox.textContent);
                    // 保存到记忆文件
                    const memBooks = getMemBooks();        
                    const bookMem = memBooks[bookName];        
                    if (!bookMem) {        
                        Toast.warn('记忆库不存在');        
                        return;        
                    }        
                
                    const memName = bookName + '_' + fileName;        
                    let found = false;        
                    const folders = editingFolder && Array.isArray(bookMem[editingFolder])
                        ? [editingFolder].concat(Object.keys(bookMem).filter(folder => folder !== editingFolder))
                        : Object.keys(bookMem);
                    for (const folder of folders) {
                        const fileIdx = bookMem[folder].findIndex(function(file) {
                            return file.name === fileName
                                || file.name === fileName + '.md'
                                || file.name === memName
                                || file.name === memName + '.md';
                        });
                        if (fileIdx !== -1) {        
                            bookMem[folder][fileIdx].content = currentContent;        
                            bookMem[folder][fileIdx].updatedAt = new Date().toISOString();        
                            found = true;        
                            break;        
                        }        
                    }        
                
                    if (!found) {        
                        // 文件不存在，创建到默认文件夹        
                        const defaultFolder = editingFolder || Object.keys(bookMem)[0] || '默认文件夹';
                        if (!bookMem[defaultFolder]) bookMem[defaultFolder] = [];        
                        bookMem[defaultFolder].push({        
                            name: memName,        
                            content: currentContent,        
                            createdAt: new Date().toISOString(),        
                            updatedAt: new Date().toISOString()        
                        });        
                    }        
                
                    sMB(memBooks);        
                
                    // 关联文件区域的“保存文件”只保存当前文件，不触发快照检测或关联资料联动。
                    // 同时静默更新当前文件基线，避免之后被误判为尚未处理的新变更。
                    const sysFileNames = ['大纲', '边界卡', '追踪表', '承接卡', '信息表', '角色列表', '关键事件表', '资料索引', '信息卡', '角色关系网', '设定集'];
                    if (sysFileNames.includes(fileName)) {
                        const snapKey = window.AccountDataScope.key('zhiyu_file_snapshot_' + bookName + '_' + fileName);
                        if (window.ZHIYU_LARGE_LOCAL_STORE?.set) {
                            await window.ZHIYU_LARGE_LOCAL_STORE.set(snapKey, currentContent, 'file_snapshot');
                        } else {
                            localStorage.setItem(snapKey, currentContent);
                        }
                    }

                    Toast.success('当前关联文件已保存');
                
                    // 立即重新加载预览        
                    const fName = resultBox.dataset.editingRefFile;        
                    const bName = resultBox.dataset.editingRefBookName;        
                    if (fName && bName) {        
                        const memBooks = getMemBooks();        
                        const memName = bName + '_' + fName;        
                        for (const folder in (memBooks[bName] || {})) {        
                            const f = (memBooks[bName][folder] || []).find(x => x.name === memName || x.name === memName + '.md');        
                            if (f) {        
                                const newMd = String(f.content || '');
                                if (isInfoCard) {        
                                    resultBox.dataset.infoCardOriginalMd = newMd;        
                                    resultBox.innerHTML = InfoCardRenderer.render(newMd, { bookName: bName, forceRelationGraph: isRoleList });
                                    setTimeout(() => InfoCardRenderer.drawCanvas(resultBox), 50);        
                                } else {        
                                    resultBox.innerHTML = Utils.mdToHtml(newMd);        
                                }        
                                resultBox.style.background = '';        
                                break;        
                            }        
                        }        
                    }        
                
                    // 刷新章节树以更新底部引用区域        
                    refreshTree();        
                    window.clearPendingFindReplacements?.(resultBox);
                    } catch (error) {
                        const message = error?.message || String(error || '未知错误');
                        logToFloat('<div>⚠️ 关联文件保存未完成：' + Utils.escapeHtml(message) + '</div>');
                        Toast.error('保存未完成：' + message);
                    } finally {
                    btn.textContent = '💾 保存文件';
                    btn.disabled = false;
                    }
                });
    }

    window.bindSaveActions = bindSaveActions;
    window.ZHIYU_SAVE_ACTIONS_READY = true;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindSaveActions, { once: true });
    } else {
        bindSaveActions();
    }
})(window, document);
