(function(window) {
    'use strict';

    function getSelectedBookName() {
        return document.getElementById('bookSel')?.value || '';
    }

    function getBookContext(options = {}) {
        const bookName = getSelectedBookName();
        if (!bookName) {
            if (options.warn !== false) window.Toast?.warn?.('请先选择书籍');
            return null;
        }

        const books = window.gB();
        const book = books[bookName];
        if (!book) {
            if (options.warn !== false) window.Toast?.warn?.('未找到当前书籍');
            return null;
        }

        if (!Array.isArray(book.volumes)) book.volumes = [];
        if (!book.volumes.length) {
            book.volumes.push({ name: '第一卷', chapters: [] });
        }

        return { bookName, books, book };
    }

    function getLastVolumeIndex(book) {
        return Math.max(0, book.volumes.length - 1);
    }

    function getNewChapterVolumeIndex(bookName, book) {
        if (!book || !Array.isArray(book.volumes) || book.volumes.length === 0) return -1;
        const state = window.ZHIYU_APP_STATE || window.AppState || {};
        const selectedVi = state.ui && state.ui.selectedVolumeBook === bookName ? state.ui.selectedVolumeVi : -1;
        if (Number.isInteger(selectedVi) && selectedVi >= 0 && book.volumes[selectedVi]) return selectedVi;
        if (state.chapter && state.chapter.book === bookName && Number.isInteger(state.chapter.vi) && state.chapter.vi >= 0 && book.volumes[state.chapter.vi]) {
            return state.chapter.vi;
        }
        return getLastVolumeIndex(book);
    }

    function readFileAsText(file) {
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = ev => resolve(ev.target.result || '');
            reader.readAsText(file);
        });
    }

    async function createNewVolume() {
        const ctx = getBookContext();
        if (!ctx) return;

        const volCount = ctx.book.volumes.length;
        const name = '第' + window.toChineseChapter(volCount + 1) + '卷';
        ctx.book.volumes.push({ name, chapters: [] });
        const state = window.ZHIYU_APP_STATE || window.AppState || {};
        if (state.ui) {
            state.ui.selectedVolumeBook = ctx.bookName;
            state.ui.selectedVolumeVi = volCount;
        }
        window.sB(ctx.books);
        window.refreshTree({ selectVolumeIndex: volCount });
    }

    async function createNewChapter() {
        const ctx = getBookContext();
        if (!ctx) return;

        const volIndex = getNewChapterVolumeIndex(ctx.bookName, ctx.book);
        if (volIndex < 0) return;
        const chapters = ctx.book.volumes[volIndex].chapters;
        const chCount = chapters.length + 1;
        const chineseNum = window.toChineseChapter(chCount);
        let name = '第' + chineseNum + '章';

        if (chapters.some(c => c.name === name)) {
            let suffix = 2;
            while (chapters.some(c => c.name === name + '（' + suffix + '）')) suffix++;
            name = name + '（' + suffix + '）';
        }

        chapters.push({ name, content: '', createdAt: new Date().toISOString() });
        window.sortChapters(ctx.book);
        window.sB(ctx.books);
        window.refreshTree({ expandVolumeIndex: volIndex });

        const ci = chapters.findIndex(c => c.name === name);
        setTimeout(() => {
            if (typeof window.loadChapter === 'function') {
                window.loadChapter(ctx.bookName, volIndex, ci);
            }
            const item = document.querySelector('#treeContent .chapter-item[data-vi="' + volIndex + '"][data-ci="' + ci + '"]');
            if (item) item.scrollIntoView({ block: 'center' });
        }, 100);
    }

    function openChapterImportPicker() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.txt,.md,.docx';
        input.onchange = handleChapterImport;
        input.click();
    }

    async function handleChapterImport(e) {
        const file = e.target.files[0];
        if (!file) return;

        const ctx = getBookContext();
        if (!ctx) return;

        const text = await readFileAsText(file);
        if (text.length > 10000) {
            window.Toast?.warn?.('单次导入不能超过10000字，请拆分文件或使用总览页的导入作品功能');
            return;
        }

        const defaultName = file.name.replace(/\.(txt|md|docx)$/i, '');
        const chName = await window.Prompt.show('请输入章节名：', defaultName);
        if (!chName) return;

        const volIndex = getLastVolumeIndex(ctx.book);
        ctx.book.volumes[volIndex].chapters.push({
            name: chName,
            content: text,
            createdAt: new Date().toISOString()
        });
        window.sortChapters(ctx.book);
        window.sB(ctx.books);
        window.refreshTree();
        window.Toast?.success?.('已导入「' + chName + '」，' + text.length + ' 字');
    }

    async function toggleChapterOrder() {
        const ctx = getBookContext({ warn: false });
        if (!ctx) return;

        ctx.book.volumes.forEach(v => v.chapters.reverse());
        window.sB(ctx.books);
        window.refreshTree();
    }

    function setCatalogOrder(direction) {
        const ctx = getBookContext();
        if (!ctx) return;

        ctx.book.volumes.forEach(function(v) {
            v.chapters.sort(function(a, b) {
                const an = typeof window.parseChapterNum === 'function' ? window.parseChapterNum(a?.name || '') : Number.POSITIVE_INFINITY;
                const bn = typeof window.parseChapterNum === 'function' ? window.parseChapterNum(b?.name || '') : Number.POSITIVE_INFINITY;
                const aFinite = Number.isFinite(an);
                const bFinite = Number.isFinite(bn);
                if (aFinite && bFinite && an !== bn) return an - bn;
                if (aFinite !== bFinite) return aFinite ? -1 : 1;
                return String(a?.name || '').localeCompare(String(b?.name || ''), 'zh-Hans');
            });
            if (direction === 'desc') v.chapters.reverse();
        });
        window.sB(ctx.books);
        window.refreshTree();
        window.Toast?.success?.(direction === 'desc' ? '已按倒序排列' : '已按正序排列');
    }

    async function handleChapterFilePickerChange(e) {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;

        const ctx = getBookContext({ warn: false });
        if (!ctx) return;

        const volIndex = getLastVolumeIndex(ctx.book);
        for (const f of files) {
            const ext = f.name.split('.').pop().toLowerCase();
            if (ext === 'docx') {
                window.Toast?.warn?.('DOCX 格式暂不支持，请使用 .txt 或 .md');
                continue;
            }

            const content = await readFileAsText(f);
            const defaultName = f.name.replace(/\.(md|txt|docx)$/i, '');
            const chName = await window.Prompt.show('导入「' + f.name + '」，请输入章节名（如"第一章 初入江湖"）：', defaultName);
            if (!chName) continue;

            ctx.book.volumes[volIndex].chapters.push({
                name: chName,
                content,
                createdAt: new Date().toISOString()
            });
        }

        window.sortChapters(ctx.book);
        window.sB(ctx.books);
        window.refreshTree();
    }

    function bindOnce(id, type, handler) {
        const el = document.getElementById(id);
        if (!el || el.dataset.chapterActionsBound === '1') return;
        el.dataset.chapterActionsBound = '1';
        el.addEventListener(type, handler);
    }

    function bindChapterActions() {
        bindOnce('btnNewVolume', 'click', createNewVolume);
        bindOnce('btnNewChapter', 'click', createNewChapter);
        bindOnce('btnImportChapter', 'click', openChapterImportPicker);
        bindOnce('btnToggleOrder', 'click', toggleChapterOrder);
        bindOnce('btnCatalogTransfer', 'click', function() {
            if (typeof window.openCatalogTransferModal === 'function') window.openCatalogTransferModal();
            else window.Toast?.warn?.('文件管理模块未加载');
        });
        bindOnce('btnSortAsc', 'click', function() { setCatalogOrder('asc'); });
        bindOnce('btnSortDesc', 'click', function() { setCatalogOrder('desc'); });
        bindOnce('chapterFilePicker', 'change', handleChapterFilePickerChange);
    }

    window.createNewVolume = createNewVolume;
    window.createNewChapter = createNewChapter;
    window.openChapterImportPicker = openChapterImportPicker;
    window.handleChapterImport = handleChapterImport;
    window.toggleChapterOrder = toggleChapterOrder;
    window.setCatalogOrder = setCatalogOrder;
    window.handleChapterFilePickerChange = handleChapterFilePickerChange;
    window.bindChapterActions = bindChapterActions;
    window.ZHIYU_CHAPTER_ACTIONS_READY = true;

    bindChapterActions();
})(window);
