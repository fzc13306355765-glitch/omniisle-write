(function(window, document) {
    'use strict';

    const AppState = window.ZHIYU_APP_STATE;
    const STATUS = window.ZHIYU_STATUS;
    const getBooksByStatus = window.getBooksByStatus;
    const gB = window.gB;
    const updateChapWordCount = window.updateChapWordCount;
    const updateLinkedMemoryCount = window.updateLinkedMemoryCount;
    const Utils = window.ZHIYU_UTILS || window.Utils || {};

    function getCurrentBookKey() {
        return window.AccountDataScope?.key?.('novel_current_book') || 'novel_current_book';
    }

    function getActiveBooks() {
        if (typeof getBooksByStatus === 'function') return getBooksByStatus(STATUS.ACTIVE) || {};
        return typeof gB === 'function' ? (gB() || {}) : {};
    }

    function updateCurrentBookDisplay(name) {
        const label = document.getElementById('currentWritingBookName');
        if (label) {
            label.textContent = name || '未选择作品';
            label.title = name || '未选择作品';
        }
    }

    function closeWritingBookSelect() {
        const modal = document.getElementById('writingBookSelectModal');
        if (modal) modal.style.display = 'none';
    }

    function refreshTreeSafe() {
        if (typeof window.refreshTree === 'function') {
            window.refreshTree();
        }
    }

    function hasAnyChapter(book) {
        return Array.isArray(book?.volumes) && book.volumes.some(function(volume) {
            return Array.isArray(volume?.chapters) && volume.chapters.length > 0;
        });
    }

    function clearChapterEditorForEmptyBook(book, options) {
        const force = options?.force === true;
        if (!force && hasAnyChapter(book)) return false;
        const resultBox = document.getElementById('resultBox');
        window.clearRefFileEditorState?.(resultBox);
        if (resultBox) {
            if (typeof window.ZhiyuEditorAdapter?.replaceContent === 'function') {
                window.ZhiyuEditorAdapter.replaceContent(resultBox, '');
            } else {
                resultBox.textContent = '';
            }
            resultBox.style.background = '';
            resultBox.setAttribute('contenteditable', 'true');
        }
        AppState.gen.linkedFiles = [];
        const editingChapterName = document.getElementById('editingChapterName');
        if (editingChapterName) editingChapterName.textContent = '-';
        window.setLastSavedContent?.('');
        window.updateDirtyIndicator?.();
        if (typeof updateChapWordCount === 'function') updateChapWordCount('');
        window.updateWordProgress?.(0, 0);
        const totalEl = document.getElementById('totalWordCount');
        if (totalEl) totalEl.textContent = '0';
        if (typeof updateLinkedMemoryCount === 'function') updateLinkedMemoryCount();
        Promise.resolve(window.renderNaturalizePanel?.()).catch(function() {});
        return true;
    }

    function persistCurrentBook(name) {
        try {
            if (name) localStorage.setItem(getCurrentBookKey(), name);
            else localStorage.removeItem(getCurrentBookKey());
        } catch (e) {}
    }

    function syncBookScopedReferenceState(nextBookName, previousBookName) {
        const nextBook = String(nextBookName || '');
        const previousBook = String(previousBookName || '');
        const bookChanged = nextBook !== previousBook;
        if (bookChanged) {
            window._linkMemoryContext = null;
            const modal = window.ZHIYU_MODAL || window.Modal;
            modal?.close?.('memoryLinkModal');
            modal?.close?.('outlinePickerModal');
            modal?.close?.('ogOutlineFileModal');
            window._ogOutlineFiles = null;
            window._ogOutlineFileFolder = '';
            window.invalidateMemoryLinkFileReads?.();
            window.resetGenerationRefChapterSelection?.();
        }
        window.ensureGenerationLinkedFilesBook?.(nextBook);
        window.activateOGLinkedMemoryBook?.(nextBook);
        window.activateOGOutlineSelectionBook?.(nextBook);
        if (bookChanged) {
            window.clearZhiyuAssistantReferenceForBookChange?.();
        }
        window.updateLinkedMemoryCount?.();
        return bookChanged;
    }

    function selectBook(name, options) {
        const books = typeof gB === 'function' ? gB() : {};
        const sel = document.getElementById('bookSel');
        if (!books[name]) return false;
        const previousBookName = AppState.chapter.book || '';
        window.resetOutlineBookScopedState?.();
        syncBookScopedReferenceState(name, previousBookName);
        if (sel) sel.value = name;
        persistCurrentBook(name);
        AppState.chapter.book = name;
        AppState.chapter.vi = -1;
        AppState.chapter.ci = -1;
        AppState.ui.selectedVolumeBook = '';
        AppState.ui.selectedVolumeVi = -1;
        window.restoreOutlineBookScopedState?.(name);
        window.updateLinkedMemoryCount?.();
        updateCurrentBookDisplay(name);
        closeWritingBookSelect();
        refreshTreeSafe();
        clearChapterEditorForEmptyBook(books[name], { force: options?.clearEditor === true });
        return true;
    }

    function selectBookForWriting(name) {
        const books = typeof gB === 'function' ? gB() : {};
        if (!selectBook(name)) return false;
        const target = window.getOverviewChapterTarget?.(books[name]);
        if (target && target.vi >= 0 && target.ci >= 0 && typeof window.loadChapter === 'function') {
            window.loadChapter(name, target.vi, target.ci);
        }
        return true;
    }

    function clearCurrentBookSelection() {
        const previousBookName = AppState.chapter.book || '';
        persistCurrentBook('');
        const sel = document.getElementById('bookSel');
        if (sel) sel.value = '';
        window.resetOutlineBookScopedState?.();
        syncBookScopedReferenceState('', previousBookName);
        AppState.chapter = { book: '', vi: -1, ci: -1 };
        AppState.ui.selectedVolumeBook = '';
        AppState.ui.selectedVolumeVi = -1;
        updateCurrentBookDisplay('');
    }

    function refreshBookSelect() {
        const sel = document.getElementById('bookSel');
        if (!sel || typeof getBooksByStatus !== 'function') return;
        const books = getBooksByStatus(STATUS.ACTIVE);
        const previousBookName = AppState.chapter.book || '';
        const currentBookKey = getCurrentBookKey();
        const savedBook = localStorage.getItem(currentBookKey) || '';
        sel.innerHTML = '<option value="">-- 选择书籍 --</option>';
        Object.keys(books).forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            if (name === savedBook) opt.selected = true;
            sel.appendChild(opt);
        });
        sel.onchange = function() {
            const bookName = sel.value;
            if (bookName) selectBook(bookName, { clearEditor: true });
            else clearCurrentBookSelection();
        };
        if (savedBook && books[savedBook]) {
            if (AppState.chapter.book !== savedBook) {
                window.resetOutlineBookScopedState?.();
                AppState.chapter = { book: savedBook, vi: -1, ci: -1 };
                window.restoreOutlineBookScopedState?.(savedBook);
            }
            updateCurrentBookDisplay(savedBook);
        } else {
            if (savedBook) persistCurrentBook('');
            if (!books[AppState.chapter.book]) {
                AppState.chapter = { book: '', vi: -1, ci: -1 };
            }
            updateCurrentBookDisplay(AppState.chapter.book);
        }
        const activeBookName = sel.value || AppState.chapter.book || '';
        syncBookScopedReferenceState(activeBookName, previousBookName);
        return activeBookName;
    }

    function createWritingBookCard(name, book) {
        const card = document.createElement('article');
        card.className = 'writing-book-select-card';

        const cover = document.createElement('div');
        cover.className = 'writing-book-select-cover';
        if (book?.cover && /^data:image\//.test(book.cover)) {
            const image = document.createElement('img');
            image.src = book.cover;
            image.alt = '';
            cover.appendChild(image);
        } else {
            cover.textContent = '📖';
        }

        const info = document.createElement('div');
        info.className = 'writing-book-select-info';
        const title = document.createElement('strong');
        title.textContent = name;
        title.title = name;
        const words = document.createElement('span');
        words.textContent = '字数：' + Number(book?.wordCount || 0).toLocaleString();
        const updated = document.createElement('span');
        const stamp = book?.updatedAt || book?.createdAt || '';
        updated.textContent = '更新：' + (typeof Utils.formatDate === 'function' ? Utils.formatDate(stamp) : (stamp || '-'));
        info.append(title, words, updated);

        const choose = document.createElement('button');
        choose.type = 'button';
        choose.className = 'btn btn-dark btn-sm writing-book-select-button';
        choose.dataset.book = name;
        choose.textContent = '选择';

        card.append(cover, info, choose);
        return card;
    }

    function openWritingBookSelect() {
        const modal = document.getElementById('writingBookSelectModal');
        const list = document.getElementById('writingBookSelectList');
        if (!modal || !list) return false;
        const books = getActiveBooks();
        list.innerHTML = '';
        const names = Object.keys(books).sort(function(a, b) {
            const aStamp = books[a]?.updatedAt || books[a]?.createdAt || '';
            const bStamp = books[b]?.updatedAt || books[b]?.createdAt || '';
            return String(bStamp).localeCompare(String(aStamp));
        });
        if (!names.length) {
            const empty = document.createElement('div');
            empty.className = 'writing-book-select-empty';
            empty.textContent = '暂无可编辑作品，请先在总览页创建或导入作品。';
            list.appendChild(empty);
        } else {
            names.forEach(function(name) {
                list.appendChild(createWritingBookCard(name, books[name]));
            });
        }
        modal.style.display = 'flex';
        return true;
    }

    function ensureWritingBookSelected() {
        const books = getActiveBooks();
        const current = AppState.chapter.book || '';
        if (current && books[current]) {
            updateCurrentBookDisplay(current);
            return true;
        }
        if (current || localStorage.getItem(getCurrentBookKey())) clearCurrentBookSelection();
        openWritingBookSelect();
        return false;
    }

    function bindWritingBookPicker() {
        document.getElementById('btnChooseWritingBook')?.addEventListener('click', openWritingBookSelect);
        document.getElementById('btnCloseWritingBookSelect')?.addEventListener('click', closeWritingBookSelect);
        document.getElementById('writingBookSelectModal')?.addEventListener('click', function(event) {
            if (event.target === this) closeWritingBookSelect();
        });
        document.getElementById('writingBookSelectList')?.addEventListener('click', function(event) {
            const button = event.target.closest('.writing-book-select-button');
            if (button?.dataset.book) selectBookForWriting(button.dataset.book);
        });
    }

    window.selectBook = selectBook;
    window.selectBookForWriting = selectBookForWriting;
    window.refreshBookSelect = refreshBookSelect;
    window.openWritingBookSelect = openWritingBookSelect;
    window.closeWritingBookSelect = closeWritingBookSelect;
    window.ensureWritingBookSelected = ensureWritingBookSelected;
    window.clearCurrentBookSelection = clearCurrentBookSelection;
    window.clearChapterEditorForEmptyBook = clearChapterEditorForEmptyBook;
    window.syncBookScopedReferenceState = syncBookScopedReferenceState;
    window.ZHIYU_BOOK_SELECTION_READY = true;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindWritingBookPicker, { once: true });
    } else {
        bindWritingBookPicker();
    }
})(window, document);
