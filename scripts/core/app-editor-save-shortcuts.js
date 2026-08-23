// Editor autosave and keyboard shortcuts split from app-main.js.
// Keeps the original save behavior while moving event binding out of the legacy entry file.
(function(window, document) {
    'use strict';

    function getAppState() {
        return window.ZHIYU_APP_STATE || window.AppState;
    }

    async function saveCurrentEditorContent(showToast) {
        const AppState = getAppState();
        const saveToken = window.ZHIYU_SAVE_STATUS?.begin?.('manual');
        if (window.ZHIYU_OPERATION_TUTORIAL?.isActive?.() === true
            || window.ZHIYU_BOOK_PREVIEW_CONTEXT?.active === true
            || document.body?.classList.contains('zhiyu-outline-tutorial-active')) {
            window.ZHIYU_SAVE_STATUS?.finish?.(saveToken, false, '教程演示不会保存到正式作品');
            return false;
        }
        if (!AppState?.chapter?.book) {
            window.ZHIYU_SAVE_STATUS?.finish?.(
                saveToken,
                false,
                '没有可保存的当前章节'
            );
            return false;
        }

        const books = window.gB();
        const resultBox = document.getElementById('resultBox');
        if (!resultBox) {
            window.ZHIYU_SAVE_STATUS?.finish?.(
                saveToken,
                false,
                '编辑器尚未准备完成'
            );
            return false;
        }

        try {
            window.finalizeLocalEditSessionsBeforeSave?.();
            const newContent = resultBox.innerHTML;
            const prepared = window.prepareChapterContentForLocalSave?.(
                AppState.chapter.book,
                AppState.chapter.vi,
                AppState.chapter.ci,
                newContent,
                { books }
            );
            if (!prepared) {
                window.ZHIYU_SAVE_STATUS?.finish?.(
                    saveToken,
                    false,
                    '当前章节无法保存'
                );
                return false;
            }
            const ch = prepared.chapter;
            window.updateWordCount(books[AppState.chapter.book]);
            window.updateCurrentChapterListWordCount(ch.content);

            const totalWordCount = document.getElementById('totalWordCount');
            if (totalWordCount) {
                totalWordCount.textContent = books[AppState.chapter.book].wordCount || 0;
            }

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
                : {
                    ok: await Promise.resolve(window.sB(books)) !== false,
                    draftCleared: false
                };
            if (!persisted.ok) {
                window.ZHIYU_SAVE_STATUS?.finish?.(
                    saveToken,
                    false,
                    '保存失败，当前内容已保留为草稿'
                );
                if (showToast) {
                    window.ZHIYU_TOAST?.error?.('保存失败，当前内容已保留为草稿');
                }
                return false;
            }
            if (!persisted.superseded) {
                window.setLastSavedContent?.(ch.content);
                window.updateDirtyIndicator?.();
                window.touchBook?.(AppState.chapter.book);
                window._scheduleReliableCloudBackup?.('editor-save');
            }
            window.ZHIYU_SAVE_STATUS?.finish?.(saveToken, true, '保存成功');
            if (showToast) {
                window.ZHIYU_TOAST?.success?.(
                    persisted.draftCleared === false
                        ? '正文已保存，旧草稿稍后清理'
                        : '已保存'
                );
            }
            return true;
        } catch(error) {
            window.ZHIYU_SAVE_STATUS?.finish?.(
                saveToken,
                false,
                String(error?.message || '保存失败，当前内容仍保留在编辑器中')
            );
            if (showToast) {
                window.ZHIYU_TOAST?.error?.('保存失败，当前内容仍保留在编辑器中');
            }
            return false;
        }
    }

    function bindEditorSaveShortcuts() {
        const AppState = getAppState();
        const CONFIG = window.ZHIYU_CONFIG || {};
        const Utils = window.ZHIYU_UTILS || {};
        const resultBox = document.getElementById('resultBox');

        if (resultBox && resultBox.dataset.editorAutosaveBound !== '1') {
            const debounce = Utils.debounce || function(fn) { return fn; };
            const autoSave = debounce(async function() {
                if (!AppState?.chapter?.book) return;
                const books = window.gB();
                const ch = books[AppState.chapter.book]?.volumes?.[AppState.chapter.vi]?.chapters?.[AppState.chapter.ci];
                if (!ch) return;
                const newContent = resultBox.innerHTML;
                if (newContent === ch.content) return;
                const prepared = window.prepareChapterContentForLocalSave?.(
                    AppState.chapter.book,
                    AppState.chapter.vi,
                    AppState.chapter.ci,
                    newContent,
                    { books }
                );
                if (!prepared) return;
                const saveToken = window.ZHIYU_SAVE_STATUS?.begin?.('auto');
                window.updateWordCount(books[AppState.chapter.book]);
                window.updateCurrentChapterListWordCount(newContent);

                const totalWordCount = document.getElementById('totalWordCount');
                if (totalWordCount) totalWordCount.textContent = books[AppState.chapter.book].wordCount || 0;

                window.saveDraft?.(
                    AppState.chapter.book,
                    AppState.chapter.vi,
                    AppState.chapter.ci,
                    prepared.content,
                    {
                        cleared: prepared.explicitClear,
                        pendingSync: true,
                        contentClearedAt: prepared.explicitClear ? prepared.chapter.contentClearedAt : 0,
                        revision: Number(prepared.chapter._version || 0)
                    }
                );
                try {
                    const persisted = typeof window.persistPreparedChapter === 'function'
                        ? await window.persistPreparedChapter(prepared)
                        : { ok: await Promise.resolve(window.sB(books)) !== false };
                    if (!persisted.ok) {
                        window.ZHIYU_SAVE_STATUS?.finish?.(
                            saveToken,
                            false,
                            '自动保存失败，当前内容已保留为草稿'
                        );
                        return;
                    }
                    if (!persisted.superseded) {
                        window.setLastSavedContent?.(prepared.chapter.content);
                        window.updateDirtyIndicator?.();
                        window.touchBook?.(AppState.chapter.book);
                    }
                    window.ZHIYU_SAVE_STATUS?.finish?.(
                        saveToken,
                        true,
                        '自动保存成功'
                    );
                } catch(error) {
                    window.ZHIYU_SAVE_STATUS?.finish?.(
                        saveToken,
                        false,
                        String(error?.message || '自动保存失败，当前内容仍保留在编辑器中')
                    );
                }
            }, CONFIG.AUTO_SAVE_INTERVAL);

            resultBox.dataset.editorAutosaveBound = '1';
            resultBox.addEventListener('input', autoSave);
        }

        if (window.__zhiyuEditorShortcutsBound) return;
        window.__zhiyuEditorShortcutsBound = true;

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                window.ZHIYU_MODAL?.closeAll?.();
            }

            if (!e.ctrlKey && !e.metaKey) return;

            if (e.key === 's') {
                e.preventDefault();
                void saveCurrentEditorContent(true);
                return;
            }

            if (e.key === 'z' && !e.shiftKey) {
                setTimeout(function() {
                    const state = getAppState();
                    if (state?.chapter?.book) window.updateDirtyIndicator?.();
                }, 50);
                return;
            }

            if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
                setTimeout(function() {
                    const state = getAppState();
                    if (state?.chapter?.book) window.updateDirtyIndicator?.();
                }, 50);
                return;
            }

            const generateModal = document.getElementById('generateModal');
            if (e.key === 'Enter' && generateModal && generateModal.style.display !== 'none') {
                e.preventDefault();
                document.getElementById('btnStartGenerate')?.click();
            }
        });
    }

    window.ZHIYU_EDITOR_SAVE_SHORTCUTS = {
        bindEditorSaveShortcuts,
        saveCurrentEditorContent
    };
    window.bindEditorSaveShortcuts = bindEditorSaveShortcuts;
    window.saveCurrentEditorContent = saveCurrentEditorContent;
})(window, document);
