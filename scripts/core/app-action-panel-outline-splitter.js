// ===== Action Panel Outline Splitter =====
function splitFineOutlineByChapter(generatedText) {
    var chapterRegex = /##\s*第[一二三四五六七八九十百千\d]+章[：:\s]*[^\n]*/g;
    var allMatches = [];
    var match;
    while ((match = chapterRegex.exec(generatedText)) !== null) { allMatches.push({ txt: match[0], idx: match.index }); }
    if (allMatches.length === 0) return;

    var ogChapters = ACTION_PANEL_APP_STATE.outlineGen.chapters || [];
    var seenNums = {};
    for (var i = 0; i < ogChapters.length; i++) { seenNums[ogChapters[i].num] = i; }

    for (var j = 0; j < allMatches.length; j++) {
        var startIdx = allMatches[j].idx;
        var endIdx = (j + 1 < allMatches.length) ? allMatches[j + 1].idx : generatedText.length;
        var title = allMatches[j].txt.trim();
        var content = generatedText.substring(startIdx, endIdx).trim();
        var num = extractChapterNum(title);
        var cleanTitle = title.replace(/^##\s*第[一二三四五六七八九十百千\d]+章[：:\s]*/, '').trim();

        if (seenNums[num] !== undefined) {
            ogChapters[seenNums[num]].content = content;
            ogChapters[seenNums[num]].title = cleanTitle || ogChapters[seenNums[num]].title;
            ogChapters[seenNums[num]].checked = true;
        } else {
            ogChapters.push({ num: num, title: cleanTitle || ('第' + num + '章'), content: content, checked: true });
            seenNums[num] = ogChapters.length - 1;
        }
    }
    ACTION_PANEL_APP_STATE.outlineGen.chapters = ogChapters;
    refreshAllOGFileStacks();
}

window.splitFineOutlineByChapter = splitFineOutlineByChapter;
window.ZHIYU_OG_OUTLINE_SPLITTER_READY = true;
