(function(window) {
    'use strict';

    const AppState = window.ZHIYU_APP_STATE || window.AppState;
    const Utils = window.ZHIYU_UTILS || window.Utils || { sanitizeHTML(value) { return String(value || ''); } };

        window.generationTasks = window.generationTasks || {};

        let chapterHydrationSequence = 0;
        const latestChapterHydration = new Map();
        let chapterDraftResolutionSequence = 0;
        const chapterDraftResolutionPending = new Map();
        const chapterDraftResolutionRetryTimers = new Map();

        function _activeHydrationUid() {
            return String(window.AccountDataScope?.getActiveUid?.() || AppState.auth?.uid || '');
        }

        function _activeHydrationEpoch() {
            if (typeof window.getAccountScopeEpoch !== 'function') return null;
            const value = window.getAccountScopeEpoch();
            return value == null ? null : Number(value);
        }

        function _chapterHydrationBlockedByDraft(bookName, vi, ci) {
            const draft = typeof window.loadDraftRecord === 'function'
                ? window.loadDraftRecord(bookName, vi, ci)
                : null;
            return draft?.cleared === true || draft?.pendingSync === true;
        }

        function normalizeChapterContentForDisplay(content) {
            if (typeof window.normalizeChapterEditorHTML === 'function') {
                return window.normalizeChapterEditorHTML(content || '');
            }
            return Utils.sanitizeHTML(content || '') || '';
        }

        function _currentHydrationTarget(context, token, expectedContent) {
            if (latestChapterHydration.get(context.key) !== token) return null;
            if (!AppState.auth?.isLoggedIn) return null;
            if (_activeHydrationUid() !== context.uid || _activeHydrationEpoch() !== context.accountEpoch) return null;
            const current = AppState.chapter || {};
            if (current.book !== context.bookName || current.vi !== context.vi || current.ci !== context.ci) return null;
            if (current.localId && String(current.localId) !== context.localId) return null;
            const books = gB();
            const chapter = books?.[context.bookName]?.volumes?.[context.vi]?.chapters?.[context.ci];
            if (!chapter || String(chapter._localId || '') !== context.localId) return null;
            if (String(chapter.content || '') !== expectedContent) return null;
            if (chapter.contentClearedAt || _chapterHydrationBlockedByDraft(context.bookName, context.vi, context.ci)) return null;
            return { books, chapter };
        }

        async function _hydrateChapterContentFromCloud() {
            return false;
        }

        function _draftResolutionLocationCurrent(context, resolutionToken) {
            if (!context || _activeHydrationUid() !== context.uid
                || _activeHydrationEpoch() !== context.accountEpoch) return null;
            if (resolutionToken
                && chapterDraftResolutionPending.get(resolutionToken.key) !== resolutionToken) return null;
            const current = AppState.chapter || {};
            if (current.book !== context.bookName || current.vi !== context.vi || current.ci !== context.ci) return null;
            const books = gB();
            const chapter = books?.[context.bookName]?.volumes?.[context.vi]?.chapters?.[context.ci];
            if (!chapter || String(chapter._localId || '') !== context.localId) return null;
            return { books, chapter };
        }

        function _draftResolutionContextCurrent(context, draftUpdatedAt, resolutionToken) {
            const location = _draftResolutionLocationCurrent(context, resolutionToken);
            if (!location) return null;
            const draft = window.loadDraftRecord?.(context.bookName, context.vi, context.ci);
            if (!draft || Number(draft.updatedAt || 0) !== Number(draftUpdatedAt || 0)) return null;
            return { ...location, draft };
        }

        async function _resolveChapterDraftAgainstCloud(bookName, vi, ci) {
            const books = gB();
            const chapter = books?.[bookName]?.volumes?.[vi]?.chapters?.[ci];
            const draft = window.loadDraftRecord?.(bookName, vi, ci);
            const localId = String(chapter?._localId || '');
            if (!chapter || !draft || !localId) return false;
            const context = {
                uid: _activeHydrationUid(),
                accountEpoch: _activeHydrationEpoch(),
                bookName,
                vi,
                ci,
                localId
            };
            const draftUpdatedAt = Number(draft.updatedAt || 0);
            const resolutionToken = _beginChapterDraftResolution(context, draftUpdatedAt);
            if (!resolutionToken) return false;
            const previousChapter = JSON.parse(JSON.stringify(chapter));
            try {
                const current = _draftResolutionContextCurrent(context, draftUpdatedAt, resolutionToken);
                if (!current) return false;
                const draftContent = normalizeChapterContentForDisplay(current.draft.content || '');
                current.chapter.content = draftContent;
                if (current.draft.cleared === true) {
                    current.chapter.contentClearedAt = Number(current.draft.contentClearedAt || Date.now());
                } else {
                    delete current.chapter.contentClearedAt;
                }
                const resultBox = document.getElementById('resultBox');
                if (resultBox) {
                    window.ZhiyuEditorAdapter?.setFromRecord?.(resultBox, current.chapter, draftContent)
                        || (resultBox.innerHTML = draftContent);
                    window.ZhiyuEditorAdapter?.applyContentMetadata?.(current.chapter, draftContent, resultBox);
                }
                const saved = await window.ZHIYU_STORAGE_SERVICE?.saveBooks?.(
                    current.books,
                    { cloudWrite: 'suppress', source: 'draft-local-authority' }
                );
                if (saved === false) throw new Error('本机章节草稿保存失败');
                if (typeof window.clearDraftDurably === 'function') {
                    await window.clearDraftDurably(bookName, vi, ci, { expectedUpdatedAt: draftUpdatedAt });
                } else {
                    await window.clearDraft?.(bookName, vi, ci);
                }
                window.setChapterDirty?.(false);
                window.updateDirtyIndicator?.();
                return true;
            } catch (error) {
                Object.keys(chapter).forEach(key => delete chapter[key]);
                Object.assign(chapter, previousChapter);
                console.warn('本机章节草稿恢复失败：', error);
                return false;
            } finally {
                _finishChapterDraftResolution(resolutionToken);
            }
        }

        function _chapterDraftResolutionKey(uid, localId) {
            return String(uid || '') + '\n' + String(localId || '');
        }

        function isChapterDraftResolutionPending(uid, localId) {
            return chapterDraftResolutionPending.has(_chapterDraftResolutionKey(uid, localId));
        }

        function _beginChapterDraftResolution(context, draftUpdatedAt) {
            const key = _chapterDraftResolutionKey(context?.uid, context?.localId);
            const existingToken = chapterDraftResolutionPending.get(key);
            if (existingToken?.active === true) return null;
            const existingTimer = chapterDraftResolutionRetryTimers.get(key);
            if (existingTimer != null) window.clearTimeout?.(existingTimer);
            chapterDraftResolutionRetryTimers.delete(key);
            const token = {
                id: ++chapterDraftResolutionSequence,
                key,
                draftUpdatedAt: Number(draftUpdatedAt || 0),
                active: true
            };
            chapterDraftResolutionPending.set(key, token);
            return token;
        }

        function _finishChapterDraftResolution(token) {
            if (!token || chapterDraftResolutionPending.get(token.key) !== token) return false;
            chapterDraftResolutionPending.delete(token.key);
            const timer = chapterDraftResolutionRetryTimers.get(token.key);
            if (timer != null) window.clearTimeout?.(timer);
            chapterDraftResolutionRetryTimers.delete(token.key);
            return true;
        }

        function _scheduleChapterDraftResolutionRetry(context, draftUpdatedAt, token) {
            if (typeof window.setTimeout !== 'function' || !token
                || chapterDraftResolutionPending.get(token.key) !== token) return false;
            const timer = window.setTimeout(function() {
                chapterDraftResolutionRetryTimers.delete(token.key);
                if (chapterDraftResolutionPending.get(token.key) !== token) return;
                const retryLocationCurrent = !!_draftResolutionLocationCurrent(context, token);
                _finishChapterDraftResolution(token);
                if (!retryLocationCurrent) return;
                void _resolveChapterDraftAgainstCloud(context.bookName, context.vi, context.ci);
            }, 15000);
            chapterDraftResolutionRetryTimers.set(token.key, timer);
            return true;
        }

        function clearChapterDraftResolutionState() {
            chapterDraftResolutionRetryTimers.forEach(function(timer) {
                window.clearTimeout?.(timer);
            });
            chapterDraftResolutionRetryTimers.clear();
            chapterDraftResolutionPending.clear();
        }

        function loadChapter(bookName,vi,ci,options){
            const currentBooks = gB();
            const targetBook = currentBooks?.[bookName];
            const targetChapter = targetBook?.volumes?.[vi]?.chapters?.[ci];
            if (!targetBook || !targetChapter) return;
            const tutorialPreviewActive = window.ZHIYU_OPERATION_TUTORIAL?.isActive?.() === true
                || window.ZHIYU_BOOK_PREVIEW_CONTEXT?.active === true
                || document.body?.classList.contains('zhiyu-outline-tutorial-active');
            const resultBox = document.getElementById('resultBox');
            if (!tutorialPreviewActive) window.finalizeLocalEditSessionsBeforeSave?.();
            const wasViewingRefFile = typeof window.clearRefFileEditorState === 'function'
                ? window.clearRefFileEditorState(resultBox)
                : !!resultBox?.dataset?.editingRefFile;
            const currentLocation = tutorialPreviewActive ? null : window.syncCurrentChapterLocation?.(currentBooks);
            const genTaskKeys = Object.keys(window.generationTasks);

            if (!tutorialPreviewActive && !wasViewingRefFile && !options?.skipCurrentSave && currentLocation && AppState.chapter.book && AppState.chapter.vi >= 0 && AppState.chapter.ci >= 0) {
                const isCurrentChapterGenerating = isCurrentlyGeneratingChapter(AppState.chapter.book, AppState.chapter.vi, AppState.chapter.ci);
                if (!isCurrentChapterGenerating) {
                    const books = gB();
                    const currentBook = books[AppState.chapter.book];
                    if (currentBook && currentBook.volumes[AppState.chapter.vi]?.chapters[AppState.chapter.ci]) {
                        const resultBox = document.getElementById('resultBox');
                        const currentContent = resultBox.innerHTML;
                        const currentChapter = currentBook.volumes[AppState.chapter.vi].chapters[AppState.chapter.ci];
                        if (!isChapterPlaceholderContent(currentContent) && currentContent !== (currentChapter.content || '')) {
                            const prepared = window.prepareChapterContentForLocalSave?.(
                                AppState.chapter.book,
                                AppState.chapter.vi,
                                AppState.chapter.ci,
                                currentContent,
                                { books }
                            );
                            if (prepared) {
                                if (typeof window.attachCurrentAIDetectStateToChapter === 'function') {
                                    window.attachCurrentAIDetectStateToChapter(currentChapter);
                                }
                                updateWordCount(currentBook);
                                updateCurrentChapterListWordCount(currentContent);
                                sB(books);
                            } else if (wouldBlankOverwriteExisting(currentContent, currentChapter.content)) {
                                clearDraft(AppState.chapter.book, AppState.chapter.vi, AppState.chapter.ci);
                            }
                        }
                    }
                }
            }

            const books=currentBooks;
            const book=targetBook;
            const ch=targetChapter;
            const isThisChapterGenerating = isCurrentlyGeneratingChapter(bookName, vi, ci);
            const localId = tutorialPreviewActive ? String(ch.localId || '') : (window.ensureChapterLocalId?.(ch) || '');
            if (!tutorialPreviewActive && localId && !window.isChapterLocalIdPersisted?.(localId)) {
                window.ZHIYU_STORAGE_SERVICE?.saveBooks(books);
            }

            const previousBookName = AppState.chapter?.book || '';
            const previousChapterVi = Number(AppState.chapter?.vi);
            const previousChapterCi = Number(AppState.chapter?.ci);
            window.syncBookScopedReferenceState?.(bookName, previousBookName)
                ?? window.ensureGenerationLinkedFilesBook?.(bookName);
            AppState.chapter={book:bookName,vi,ci,localId};
            window.activateGenerationLinkedFilesChapter?.(bookName, vi, ci, {
                bookName: previousBookName,
                vi: previousChapterVi,
                ci: previousChapterCi
            });
            if (previousBookName !== bookName || previousChapterVi !== vi || previousChapterCi !== ci) {
                window.resetGenerationRefChapterSelection?.();
            }
            AppState.ui.selectedVolumeBook = '';
            AppState.ui.selectedVolumeVi = -1;
            if (!tutorialPreviewActive) {
                localStorage.setItem(AccountDataScope.key('novel_current_book'),bookName);
                localStorage.setItem(AccountDataScope.key('novel_current_chapter'),JSON.stringify({vi,ci,localId}));
            }

            // 更新当前编辑章节名称
            const editingChapterName = document.getElementById('editingChapterName');
            editingChapterName.textContent = ch.name;
            updateChapterTitleBar();

            // 如果是正在生成的章节，显示已生成的内容（如果有）或提示
            // 如果是其他章节，显示静态内容
            if (isThisChapterGenerating) {
                const task = window.generationTasks[genTaskKey(bookName, vi, ci)];
                const generatedContent = task?.generatedContent;
                if (generatedContent && generatedContent.length > 0) {
                    resultBox.textContent = generatedContent;
                } else {
                    resultBox.textContent = '[正在生成中，请稍候...]';
                }
            } else {
                // 正文统一按编辑器段落格式展示，避免刷新/切章后浏览器默认 p/div 间距撑大。
                const displayContent = normalizeChapterContentForDisplay(ch.content);
                window.ZhiyuEditorAdapter?.setFromRecord?.(resultBox, ch, displayContent)
                    || (resultBox.innerHTML = displayContent);
                setLastSavedContent(resultBox.innerHTML);
                updateDirtyIndicator();
                if (!tutorialPreviewActive) {
                    void _hydrateChapterContentFromCloud(bookName, vi, ci);
                    if (!options?.skipDraftRestore) void _resolveChapterDraftAgainstCloud(bookName, vi, ci);
                }
            }

            // 剧情描述持久化：按章节 ID 加载
            const plotKey = window.AccountDataScope.key(`plot_${bookName}_${vi}_${ci}`);
            const savedPlot = tutorialPreviewActive ? (ch.plot || '') : (localStorage.getItem(plotKey) || ch.plot || '');
            document.getElementById('plotInput').value = savedPlot;
            // 更新字数统计：如果是正在生成的章节，显示生成内容的字数
            const task = window.generationTasks[genTaskKey(bookName, vi, ci)];
            const displayContent = isThisChapterGenerating ? (task?.generatedContent || '') : (ch.content || '');
            updateChapWordCount(displayContent);
            let total=0;
            book.volumes.forEach(v=>v.chapters.forEach(c=>total+=countWords(c.content||'')));
            document.getElementById('totalWordCount').textContent=total;
            document.getElementById('wordStats').style.display='flex';
            updateWordProgress(countWords(displayContent), 0);
            // 高亮当前章节（data-vi/ci 精确匹配）
            document.querySelectorAll('#treeContent .chapter-item.selected, #treeContent .vol-item.selected').forEach(i => i.classList.remove('selected'));
            document.querySelectorAll('#treeContent .chapter-item.generation-target').forEach(i => i.classList.remove('generation-target'));
            document.querySelectorAll('#treeRefs .ref-file-item.active').forEach(i => i.classList.remove('active'));
            if (AppState.ui) AppState.ui.activeRefFileKey = '';
            const targetItem = document.querySelector('#treeContent .chapter-item[data-vi="' + vi + '"][data-ci="' + ci + '"]');
            if (targetItem) {
                targetItem.classList.add('selected');
                targetItem.classList.toggle('generation-target', isThisChapterGenerating);
            }
            // 恢复章节按钮显示
            document.getElementById('btnSaveNewChapter').style.display = 'inline-block';
            document.getElementById('btnHistoryVersions').style.display = 'inline-block';
            document.getElementById('btnCopy').style.display = 'inline-block';
            const repolishBtn = document.getElementById('btnRegen');
            if (repolishBtn) {
                repolishBtn.style.display = 'none';
                repolishBtn.textContent = '🔄 重新润色';
                repolishBtn.dataset.mode = '';
            }
            document.getElementById('btnConfirm').style.display = 'inline-block';
            setConfirmUseState(isThisChapterGenerating ? 'generating' : 'ready');
            document.getElementById('btnSaveNewChapter').disabled = isThisChapterGenerating;
            // 隐藏保存文件按钮（仅在编辑引用文件时显示）
            const saveRefBtn = document.getElementById('btnSaveRefFile');
            if (saveRefBtn) saveRefBtn.style.display = 'none';
            const findBtn = document.getElementById('btnFindReplace');
            if (findBtn) findBtn.style.display = 'none';
            // 背景色：仅正在生成的章节变蓝
            if (isThisChapterGenerating) {
                resultBox.style.background = 'var(--chapter-generation-highlight)';
                resultBox.setAttribute('contenteditable', 'false');
            } else {
                resultBox.style.background = '';
                resultBox.setAttribute('contenteditable', 'true');
                if (typeof window.clearAIDetectHighlights === 'function') window.clearAIDetectHighlights(false);
                const restoredAIDetect = typeof window.restoreAIDetectHighlightsForChapter === 'function'
                    ? window.restoreAIDetectHighlightsForChapter(ch)
                    : false;
                if (!restoredAIDetect && window.AppState?.outlineGen) {
                    window.AppState.outlineGen.apDetectReportText = '';
                    window.AppState.outlineGen.apDetectReportHtml = '';
                    window.AppState.outlineGen.apDetectText = '';
                    window.AppState.outlineGen.apDetectHits = [];
                    window.renderAPSidePanel?.();
                }
            }
            window.updateLinkedMemoryCount?.();
            window.updateChapterComposerState?.();
            window.renderSelectedChapterActions?.();
        }

    window._hydrateChapterContentFromCloud = _hydrateChapterContentFromCloud;
    window._resolveChapterDraftAgainstCloud = _resolveChapterDraftAgainstCloud;
    window.isChapterDraftResolutionPending = isChapterDraftResolutionPending;
    window.clearChapterDraftResolutionState = clearChapterDraftResolutionState;
    window.loadChapter = loadChapter;
    window.ZHIYU_CHAPTER_LOADER_READY = true;
})(window);
