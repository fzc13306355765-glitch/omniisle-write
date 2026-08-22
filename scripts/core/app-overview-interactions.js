// Split project overview interactions module.
// Keeps overview search and tab event bindings out of the legacy main script.
(function(window, document) {
    'use strict';

    const AppState = window.ZHIYU_APP_STATE;
    const Utils = window.ZHIYU_UTILS || window.Utils;
    const CONFIG = window.ZHIYU_CONFIG || window.CONFIG;

    function refreshOverviewIfReady() {
        if (typeof window.refreshOverview === 'function') window.refreshOverview();
    }

    function closeOverviewBookMenus(exceptMenu) {
        document.querySelectorAll('.book-menu').forEach(function(menu) {
            if (menu === exceptMenu) return;
            menu.style.display = 'none';
            menu.closest('.book-card')?.classList.remove('overview-book-menu-open');
        });
    }

    function handleOverviewCardAction(e) {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const card = e.target.closest('.book-card');
        if (!card && action !== 'continue-write') return;
        e.stopPropagation();
        const bookName = btn.dataset.book;
        if (action === 'continue-write') {
            const vi = parseInt(btn.dataset.vi, 10);
            const ci = parseInt(btn.dataset.ci, 10);
            if (!window.selectBook(bookName, { clearEditor: !(vi >= 0 && ci >= 0) })) return;
            Promise.resolve(window.switchPage('write')).then(() => {
                if (vi >= 0 && ci >= 0) window.loadChapter(bookName, vi, ci);
            });
        } else if (action === 'jump') {
            if (!window.selectBook(bookName, { clearEditor: true })) return;
            window.switchPage('write');
        } else if (action === 'import-chapter') {
            if (!window.selectBook(bookName, { clearEditor: true })) return;
            Promise.resolve(window.switchPage('write')).then(() => {
                document.getElementById('chapterFilePicker').click();
            });
        } else if (action === 'upload-cover') {
            AppState.ui.bookForCover = bookName;
            document.getElementById('coverFilePicker')?.click();
        } else if (action === 'book-menu') {
            const menu = card.querySelector('.book-menu');
            if (!menu) return;
            const willOpen = menu.style.display === 'none';
            closeOverviewBookMenus(menu);
            menu.style.display = willOpen ? 'block' : 'none';
            card.classList.toggle('overview-book-menu-open', willOpen);
        } else if (action === 'edit-book-info') {
            window.ZHIYU_CREATE_BOOK?.openEdit?.(bookName);
        } else if (action === 'archive') {
            window.archiveBook(bookName);
        } else if (action === 'trash') {
            window.trashBook(bookName);
        } else if (action === 'restore') {
            window.restoreBook(bookName);
        } else if (action === 'delete') {
            window.permanentlyDeleteBook(bookName);
        }
    }

    function bindOverviewCardActions() {
        document.getElementById('overviewCardsContainer')?.addEventListener('click', handleOverviewCardAction);
        document.getElementById('overviewRecentActions')?.addEventListener('click', handleOverviewCardAction);
        document.getElementById('overviewEditActions')?.addEventListener('click', handleOverviewCardAction);
        document.getElementById('overviewEditBookSelect')?.addEventListener('change', function(e) {
            AppState.ui.overviewEditBook = e.target.value;
            refreshOverviewIfReady();
        });
        document.getElementById('overviewAnnouncementBar')?.addEventListener('click', function() {
            if (window.ZHIYU_COMMUNITY_MODE === true) return;
            if (typeof window.openNotice === 'function') window.openNotice();
        });
        document.getElementById('overviewAnnouncementBar')?.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                if (window.ZHIYU_COMMUNITY_MODE === true) return;
                e.preventDefault();
                if (typeof window.openNotice === 'function') window.openNotice();
            }
        });
        document.getElementById('archiveContainer')?.addEventListener('click', handleOverviewCardAction);
        document.getElementById('trashContainer')?.addEventListener('click', handleOverviewCardAction);
        document.getElementById('overviewCardsContainer')?.addEventListener('change', function(e) {
            if (e.target.classList.contains('batch-check')) {
                window.updateBatchActions();
            }
        });
        document.getElementById('overviewCardsContainer')?.addEventListener('click', function(e) {
            const item = e.target.closest('.book-menu > div[data-action]');
            if (!item) return;
            e.stopPropagation();
            const action = item.dataset.action;
            const bookName = item.dataset.book;
            if (action === 'upload-cover') {
                AppState.ui.bookForCover = bookName;
                document.getElementById('coverFilePicker').click();
            } else if (action === 'archive') {
                window.archiveBook(bookName);
            } else if (action === 'trash') {
                window.trashBook(bookName);
            }
            closeOverviewBookMenus();
        }, true);
    }

    function bindOverviewInteractions() {
        const debouncedSearch = Utils.debounce(function(e) {
            AppState.ui.searchQuery = e.target.value.trim().toLowerCase();
            refreshOverviewIfReady();
        }, CONFIG.SEARCH_DEBOUNCE);
        document.getElementById('searchBooksInput')?.addEventListener('input', debouncedSearch);
        document.querySelectorAll('#overviewTabs .tab-item').forEach(tab => {
            tab.addEventListener('click', async function() {
                document.querySelectorAll('#overviewTabs .tab-item').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                AppState.ui.tab = this.dataset.tab;
                refreshOverviewIfReady();
            });
        });
        bindOverviewCardActions();
    }

    window.bindOverviewInteractions = bindOverviewInteractions;
    window.handleCardAction = handleOverviewCardAction;
})(window, document);
