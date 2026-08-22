(function(window) {
    'use strict';

    function openEditor(bookName, vi, ci) {
        const books = window.gB();
        const ch = books[bookName].volumes[vi].chapters[ci];
        document.getElementById('edTitle').textContent = '编辑：' + ch.name;
        document.getElementById('edText').value = ch.content;
        document.getElementById('edSave').onclick = function() { saveEditor(bookName, vi, ci); };
        window.Modal.open('editorModal');
    }

    function saveEditor(bookName, vi, ci) {
        const books = window.gB();
        books[bookName].volumes[vi].chapters[ci].content = document.getElementById('edText').value;
        window.sB(books);
        closeEditor();
        window.refreshTree();
        const chapter = window.ZHIYU_APP_STATE.chapter;
        if (chapter.book === bookName && chapter.vi === vi && chapter.ci === ci) {
            document.getElementById('resultBox').textContent = books[bookName].volumes[vi].chapters[ci].content;
        }
    }

    function closeEditor() {
        window.Modal.close('editorModal');
    }

    function renameChapter(bookName, vi, ci, newName) {
        const books = window.gB();
        books[bookName].volumes[vi].chapters[ci].name = newName;
        window.sB(books);
        window.refreshTree();
        const chapter = window.ZHIYU_APP_STATE.chapter;
        if (chapter.book === bookName && chapter.vi === vi && chapter.ci === ci) {
            document.getElementById('editingChapterName').textContent = newName;
            window.updateChapterTitleBar();
        }
    }

    function deleteChapter(bookName, vi, ci) {
        const books = window.gB();
        books[bookName].volumes[vi].chapters.splice(ci, 1);
        window.sB(books);
        window.updateWordCount(books[bookName], bookName);
        window.refreshTree();
        document.getElementById('resultBox').textContent = '点击左侧章节查看内容，或生成新章节...';
        window.ZHIYU_APP_STATE.chapter = {};
    }

    function moveChapter(srcBook, srcVi, srcCi, dstBook, dstVi, dstCi) {
        const books = window.gB();
        const ch = books[srcBook].volumes[srcVi].chapters.splice(srcCi, 1)[0];
        books[dstBook].volumes[dstVi].chapters.splice(dstCi, 0, ch);
        window.sB(books);
        window.refreshTree();
    }

    window.openEditor = openEditor;
    window.saveEditor = saveEditor;
    window.closeEditor = closeEditor;
    window.renameChapter = renameChapter;
    window.deleteChapter = deleteChapter;
    window.moveChapter = moveChapter;
    window.ZHIYU_CHAPTER_EDITOR_READY = true;
})(window);
