// ===== 细纲章节保存/读取 =====
(function() {
    'use strict';

    // 自动保存细纲到章节
    function saveOutlineToChapters() {
        var og = ACTION_PANEL_APP_STATE.outlineGen;
        var bookName = ACTION_PANEL_APP_STATE.chapter.book;
        if (!bookName) return;

        var selectedChapters = (og.chapters || []).filter(function(c) { return c.checked !== false; });
        if (!selectedChapters.length) return;

        var books = gB();
        var book = books[bookName];
        if (!book) return;

        var savedCount = 0;
        selectedChapters.forEach(function(ch) {
            for (var vi = 0; vi < (book.volumes || []).length; vi++) {
                var vol = book.volumes[vi];
                if (!vol || vol.title === '参考文件') continue;
                for (var ci = 0; ci < (vol.chapters || []).length; ci++) {
                    var bch = vol.chapters[ci];
                    var bchNum = extractChapterNumberFromName(bch.name);
                    if (bchNum === ch.num) {
                        if (!bch.outline) bch.outline = '';
                        bch.outline = ch.content;
                        savedCount++;
                    }
                }
            }
            // 同步 localStorage
            OutlineManager.save(bookName, String(ch.num), ch.content);
        });

        sB(books);
        if (savedCount > 0) {
            ACTION_PANEL_UTILS.appendLog(null, '已自动保存 ' + savedCount + ' 章细纲到章节', 'success');
        }
    }

    // 获取章节关联细纲
    function getChapterOutlineContent(chapterNum) {
        var bookName = ACTION_PANEL_APP_STATE.chapter.book;
        if (!bookName) return '';

        var books = gB();
        var book = books[bookName];
        if (book) {
            for (var vi = 0; vi < (book.volumes || []).length; vi++) {
                var vol = book.volumes[vi];
                if (!vol || vol.title === '参考文件') continue;
                for (var ci = 0; ci < (vol.chapters || []).length; ci++) {
                    var bch = vol.chapters[ci];
                    var bchNum = extractChapterNumberFromName(bch.name);
                    if (bchNum === chapterNum && bch.outline) { return bch.outline; }
                }
            }
        }
        return OutlineManager.load(bookName, String(chapterNum));
    }

    window.saveOutlineToChapters = saveOutlineToChapters;
    window.getChapterOutlineContent = getChapterOutlineContent;
    window.ZHIYU_ACTION_PANEL_OUTLINE_CHAPTER_SAVE_READY = true;
})();
