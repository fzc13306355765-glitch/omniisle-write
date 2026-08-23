(function(window) {
    'use strict';
    const chapterPersistTokens = new Map();

    function getAppState() {
        return window.ZHIYU_APP_STATE || {};
    }

    function getBooks() {
        return typeof window.gB === 'function' ? window.gB() : {};
    }

    function saveBooks(books) {
        if (window.ZHIYU_STORAGE_SERVICE?.saveBooks) return window.ZHIYU_STORAGE_SERVICE.saveBooks(books);
        if (typeof window.sB === 'function') return window.sB(books);
        return Promise.resolve(false);
    }

    function cloneChapterState(chapter) {
        try {
            if (typeof structuredClone === 'function') return structuredClone(chapter);
        } catch (e) {}
        return JSON.parse(JSON.stringify(chapter || {}));
    }

    function restoreChapterState(chapter, snapshot) {
        if (!chapter || !snapshot) return false;
        Object.keys(chapter).forEach(function(key) { delete chapter[key]; });
        Object.assign(chapter, cloneChapterState(snapshot));
        return true;
    }

    function normalizeBrTags(html) {
        return String(html || '').replace(/<br(\s[^>]*)?><\/br>/gi, '<br$1>');
    }

    function normalizeEditorHTML(html) {
        return normalizeBrTags(html);
    }

    function normalizeChapterEditorHTML(html) {
        const Utils = window.ZHIYU_UTILS || window.Utils || {};
        const sanitized = typeof Utils.sanitizeHTML === 'function' ? Utils.sanitizeHTML(html || '') : (html || '');
        if (window.ZhiyuEditorAdapter?.getState?.('resultBox')) {
            return normalizeBrTags(sanitized);
        }
        const holder = document.createElement('div');
        holder.innerHTML = normalizeBrTags(sanitized);
        let text = '';
        if (typeof window.getResultBoxPlainText === 'function') {
            text = window.getResultBoxPlainText(holder);
        } else {
            text = holder.textContent || '';
        }
        text = String(text || '').replace(/^\n+/, '').replace(/\n+$/, '');
        if (!text.trim()) return '';
        if (typeof window.plainTextToEditorHTML === 'function') return window.plainTextToEditorHTML(text);
        return String(text).replace(/\n/g, '<br>');
    }

    function getChapterContentContext(bookName, vi, ci, suppliedBooks) {
        const books = suppliedBooks || getBooks();
        const book = books?.[bookName];
        const chapter = book?.volumes?.[vi]?.chapters?.[ci];
        return chapter ? { books, book, chapter } : null;
    }

    function nextDraftRevision(record) {
        return Math.max(Date.now(), Number(record?.updatedAt || 0) + 1);
    }

    function markExplicitChapterClear(bookName, vi, ci) {
        const existing = window.getExplicitChapterClearDraft?.(bookName, vi, ci);
        const contentClearedAt = Number(existing?.contentClearedAt || Date.now());
        return window.saveDraft?.(bookName, vi, ci, '', {
            cleared: true,
            pendingSync: true,
            contentClearedAt,
            updatedAt: nextDraftRevision(existing)
        }) || null;
    }

    function handleChapterEditorUserInput(event) {
        if (event?.isTrusted !== true) return false;
        const state = getAppState();
        const s = state.chapter;
        if (!s?.book || s.vi < 0 || s.ci < 0) return false;
        const content = event.currentTarget?.innerHTML ?? '';
        const isBlank = window.isBlankChapterContent?.(content) ?? !String(content).trim();
        if (isBlank) return !!markExplicitChapterClear(s.book, s.vi, s.ci);

        const existing = window.getExplicitChapterClearDraft?.(s.book, s.vi, s.ci);
        if (!existing) return false;
        window.saveDraft?.(s.book, s.vi, s.ci, content, {
            pendingSync: true,
            updatedAt: nextDraftRevision(existing)
        });
        return true;
    }

    function prepareChapterContentForLocalSave(bookName, vi, ci, nextContent, options) {
        const context = getChapterContentContext(bookName, vi, ci, options?.books);
        if (!context) return null;
        const sourceContent = String(nextContent ?? '');
        const isBlank = window.isBlankChapterContent?.(sourceContent) ?? !sourceContent.trim();
        const content = isBlank ? '' : sourceContent;
        let clearRecord = window.getExplicitChapterClearDraft?.(bookName, vi, ci) || null;
        if (isBlank && options?.explicitClear === true && !clearRecord) {
            clearRecord = markExplicitChapterClear(bookName, vi, ci);
        }
        const explicitClear = isBlank && !!clearRecord;
        if (isBlank && !explicitClear) return null;
        if (window.wouldBlankOverwriteExisting?.(content, context.chapter.content, explicitClear)) return null;

        const previousChapter = cloneChapterState(context.chapter);
        context.chapter.content = content;
        window.ZhiyuEditorAdapter?.applyContentMetadata?.(
            context.chapter,
            content,
            document.getElementById('resultBox')
        );
        if (explicitClear) {
            context.chapter.contentClearedAt = Number(clearRecord.contentClearedAt || Date.now());
            window.saveDraft?.(bookName, vi, ci, '', {
                cleared: true,
                pendingSync: true,
                contentClearedAt: context.chapter.contentClearedAt,
                updatedAt: Number(clearRecord.updatedAt || Date.now())
            });
        } else {
            delete context.chapter.contentClearedAt;
        }
        const persistKey = String(window.AccountDataScope?.getActiveUid?.() || 'guest')
            + '\n' + String(context.chapter._localId || bookName + ':' + vi + ':' + ci);
        const persistToken = Number(chapterPersistTokens.get(persistKey) || 0) + 1;
        chapterPersistTokens.set(persistKey, persistToken);
        return {
            ...context,
            content,
            explicitClear,
            clearRecord,
            previousChapter,
            bookName,
            volumeIndex: vi,
            chapterIndex: ci,
            persistKey,
            persistToken
        };
    }

    function rollbackPreparedChapter(prepared) {
        return restoreChapterState(prepared?.chapter, prepared?.previousChapter);
    }

    async function persistPreparedChapter(prepared, options) {
        if (!prepared?.books || !prepared.chapter) return { ok: false, draftCleared: false };
        if (window.ZHIYU_OPERATION_TUTORIAL?.isActive?.() === true
            || window.ZHIYU_BOOK_PREVIEW_CONTEXT?.active === true
            || window.document?.body?.classList.contains('zhiyu-outline-tutorial-active')) {
            rollbackPreparedChapter(prepared);
            return { ok: false, draftCleared: false, tutorialBlocked: true };
        }
        if (chapterPersistTokens.get(prepared.persistKey) !== prepared.persistToken) {
            return { ok: true, draftCleared: false, superseded: true };
        }
        let saved = false;
        try {
            saved = await saveBooks(prepared.books);
        } catch (error) {
            saved = false;
        }
        if (saved === false) {
            if (chapterPersistTokens.get(prepared.persistKey) !== prepared.persistToken) {
                return { ok: true, draftCleared: false, superseded: true };
            }
            window.saveDraft?.(
                prepared.bookName,
                prepared.volumeIndex,
                prepared.chapterIndex,
                prepared.content,
                {
                    cleared: prepared.explicitClear,
                    pendingSync: true,
                    contentClearedAt: prepared.explicitClear ? prepared.chapter.contentClearedAt : 0,
                    revision: Number(prepared.chapter._version || 0)
                }
            );
            rollbackPreparedChapter(prepared);
            window.setDraftPersistenceStatus?.('error', '正文保存失败，当前编辑内容仍保留在草稿中，请重试。');
            return { ok: false, draftCleared: false };
        }
        if (chapterPersistTokens.get(prepared.persistKey) !== prepared.persistToken) {
            return { ok: true, draftCleared: false, superseded: true };
        }
        let draftCleared = true;
        if (options?.keepDraft !== true) {
            const clearOperation = typeof window.clearDraftDurably === 'function'
                ? window.clearDraftDurably(
                    prepared.bookName,
                    prepared.volumeIndex,
                    prepared.chapterIndex
                )
                : window.clearDraft?.(
                    prepared.bookName,
                    prepared.volumeIndex,
                    prepared.chapterIndex
                );
            draftCleared = (await Promise.resolve(clearOperation)) !== false;
        }
        if (draftCleared) {
            window.clearDraftPersistenceFailure?.();
            window.setDraftPersistenceStatus?.('', '');
        } else {
            window.setDraftPersistenceStatus?.(
                'warning',
                '正文已保存；旧草稿暂未清理，不影响正文，可稍后重试。'
            );
        }
        return { ok: true, draftCleared };
    }

    function clearChapterContentClearState(chapter, content, bookName, vi, ci, options) {
        const isBlank = window.isBlankChapterContent?.(content) ?? !String(content || '').trim();
        if (!chapter || (isBlank && options?.force !== true)) return false;
        const previousClear = bookName
            ? window.getExplicitChapterClearDraft?.(bookName, vi, ci)
            : null;
        delete chapter.contentClearedAt;
        if (bookName && options?.clearDraftAfterPersist === true) {
            void (window.clearDraftDurably?.(bookName, vi, ci) || window.clearDraft?.(bookName, vi, ci));
        } else if (bookName && !isBlank && previousClear) {
            window.saveDraft?.(bookName, vi, ci, content, {
                pendingSync: true,
                baseRevision: Number(chapter._version || previousClear.baseRevision || 0),
                updatedAt: nextDraftRevision(previousClear)
            });
        }
        return true;
    }

    function saveResultBoxHTMLToCurrentChapter(html) {
        const state = getAppState();
        const s = state.chapter;
        if (!s || !s.book || s.vi < 0 || s.ci < 0) return;
        const books = getBooks();
        const prepared = prepareChapterContentForLocalSave(
            s.book,
            s.vi,
            s.ci,
            normalizeChapterEditorHTML(html),
            { books }
        );
        if (!prepared) return;
        const { book, chapter: ch } = prepared;
        const editor = document.getElementById('resultBox');
        if (editor && editor.innerHTML !== ch.content) {
            editor.innerHTML = ch.content;
        }
        if (typeof window.attachCurrentAIDetectStateToChapter === 'function') {
            window.attachCurrentAIDetectStateToChapter(ch);
        }
        if (typeof window.updateWordCount === 'function') window.updateWordCount(book, s.book);
        if (typeof window.updateCurrentChapterListWordCount === 'function') {
            window.updateCurrentChapterListWordCount(ch.content);
        }
        const totalEl = document.getElementById('totalWordCount');
        if (totalEl) totalEl.textContent = book.wordCount || 0;
        void persistPreparedChapter(prepared).then(function(result) {
            if (!result.ok) return;
            if (typeof window.touchBook === 'function') window.touchBook(s.book);
            if (typeof window.setLastSavedContent === 'function') window.setLastSavedContent(ch.content);
            if (typeof window.updateDirtyIndicator === 'function') window.updateDirtyIndicator();
        });
        return ch.content;
    }

    function bindChapterClearIntent() {
        const editor = document.getElementById('resultBox');
        if (!editor || editor.dataset.chapterClearIntentBound === '1') return;
        editor.dataset.chapterClearIntentBound = '1';
        editor.addEventListener('input', handleChapterEditorUserInput);
    }

    function writePlainTextToResultBox(text, options) {
        const editor = document.getElementById('resultBox');
        if (!editor) return '';
        const html = typeof window.ZhiyuEditorAdapter?.plainTextToHtml === 'function'
            ? window.ZhiyuEditorAdapter.plainTextToHtml(text)
            : typeof window.plainTextToEditorHTML === 'function'
            ? window.plainTextToEditorHTML(text)
            : String(text || '').replace(/\n/g, '<br>');
        editor.innerHTML = html;
        if (typeof window.updateChapWordCount === 'function') window.updateChapWordCount(html);
        const count = typeof window.countWords === 'function' ? window.countWords(html) : String(text || '').length;
        if (typeof window.updateWordProgress === 'function') window.updateWordProgress(count, 0);
        const stableHTML = editor.innerHTML || html;
        const savedHTML = options?.saveChapter ? saveResultBoxHTMLToCurrentChapter(stableHTML) : null;
        if (options?.dispatchInput) editor.dispatchEvent(new Event('input', { bubbles: true }));
        return savedHTML || stableHTML;
    }

    window.saveResultBoxHTMLToCurrentChapter = saveResultBoxHTMLToCurrentChapter;
    window.writePlainTextToResultBox = writePlainTextToResultBox;
    window.normalizeChapterEditorHTML = normalizeChapterEditorHTML;
    window.rollbackPreparedChapter = rollbackPreparedChapter;
    window.persistPreparedChapter = persistPreparedChapter;
    window.markExplicitChapterClear = markExplicitChapterClear;
    window.handleChapterEditorUserInput = handleChapterEditorUserInput;
    window.prepareChapterContentForLocalSave = prepareChapterContentForLocalSave;
    window.clearChapterContentClearState = clearChapterContentClearState;
    window.ZHIYU_EDITOR_CONTENT_READY = true;
    bindChapterClearIntent();
})(window);
