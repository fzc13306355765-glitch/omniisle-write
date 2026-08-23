// Page close/refresh emergency save split from app-main.js.
// Keeps the original beforeunload behavior while reducing the legacy entry file.
(function(window) {
    const document = window.document;
    const AppState = window.ZHIYU_APP_STATE || window.AppState || {};

        function captureEmergencyDraft() {
            if (AppState.chapter.book && AppState.chapter.vi >= 0 && AppState.chapter.ci >= 0) {
                const resultBox = document.getElementById('resultBox');
                if (resultBox?.dataset?.editingRefFile) return false;
                window.finalizeLocalEditSessionsBeforeSave?.();
                const content = typeof window.getResultBoxHTMLForChapterSave === 'function'
                    ? window.getResultBoxHTMLForChapterSave()
                    : resultBox?.innerHTML;
                if (content == null) return false;
                const clearRecord = window.getExplicitChapterClearDraft?.(
                    AppState.chapter.book,
                    AppState.chapter.vi,
                    AppState.chapter.ci
                );
                return window.captureChapterEmergencyDraft?.(
                    AppState.chapter.book,
                    AppState.chapter.vi,
                    AppState.chapter.ci,
                    content,
                    clearRecord ? {
                        cleared: true,
                        contentClearedAt: clearRecord.contentClearedAt,
                        baseRevision: clearRecord.baseRevision,
                        targetRevision: clearRecord.targetRevision
                    } : {}
                ) === true;
            }
            return false;
        }

        window.addEventListener('beforeunload', function() {
            if (window.ZHIYU_OPERATION_TUTORIAL?.isActive?.() === true
                || window.ZHIYU_BOOK_PREVIEW_CONTEXT?.active === true
                || document.body?.classList.contains('zhiyu-outline-tutorial-active')) return;
            const activeUid = String(window.AccountDataScope?.getActiveUid?.() || 'guest');
            const lease = window.ZHIYU_ACCOUNT_WRITE_LEASE;
            if (lease && lease.assertCanWrite(activeUid, { silent: true }) !== true) return;
            captureEmergencyDraft();
            if (AppState.chapter.book && AppState.chapter.vi >= 0 && AppState.chapter.ci >= 0) {
                const resultBox = document.getElementById('resultBox');
                window.finalizeLocalEditSessionsBeforeSave?.();
                const content = resultBox?.innerHTML;
                if (content != null && content !== '[正在生成中，请稍候...]' && content !== '点击左侧章节查看内容，或生成新章节...') {
                    try {
                        const books = gB();
                        const prepared = window.prepareChapterContentForLocalSave?.(
                            AppState.chapter.book,
                            AppState.chapter.vi,
                            AppState.chapter.ci,
                            content,
                            { books, preserveDraft: true }
                        );
                        if (!prepared) return;
                        const ch = prepared.chapter;
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
                        window.ZHIYU_STORAGE_SERVICE.saveBooks(books);
                        // 页面关闭后无法可靠撤销 keepalive 请求，也无法继续验证单写者令牌。
                        // 这里只保存 pending 草稿与紧急记录；下次由正常章节同步链安全上传。
                    } catch(e) {
                        console.warn('关闭页面保存失败', e);
                    }
                }
            }
        });

        window.addEventListener('pagehide', function(event) {
            const activeUid = String(window.AccountDataScope?.getActiveUid?.() || 'guest');
            const lease = window.ZHIYU_ACCOUNT_WRITE_LEASE;
            if (!event?.persisted && (!lease || lease.assertCanWrite(activeUid, { silent: true }) === true)) {
                captureEmergencyDraft();
            }
        });


    window.captureCurrentChapterEmergencyDraft = captureEmergencyDraft;
    window.ZHIYU_BEFOREUNLOAD_SAVE_READY = true;
})(window);
