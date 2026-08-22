// ===== Decompose import: local file =====
var decompFileChapters = [];

function decodeDecomposeFileBuffer(buffer) {
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch (err) {
        try {
            return new TextDecoder('gbk').decode(buffer);
        } catch (fallbackError) {
            return new TextDecoder('utf-8').decode(buffer);
        }
    }
}

function cloneDecomposeFileChapter(chapter) {
    return {
        title: chapter.title,
        content: chapter.content,
        wordCount: chapter.wordCount,
        preview: chapter.preview,
        selected: chapter.selected,
        volume: chapter.volume
    };
}

function createDecomposeFileChapter(title, content, volume) {
    var cleanTitle = (title || '').trim();
    var cleanContent = typeof window.normalizeDecomposePlainText === 'function'
        ? window.normalizeDecomposePlainText(content)
        : String(content || '').trim();
    return {
        title: cleanTitle,
        content: cleanContent,
        wordCount: countChineseWords(cleanContent),
        preview: cleanContent.substring(cleanTitle.length, cleanTitle.length + 150).replace(/\n/g, ' ').trim(),
        selected: false,
        volume: volume
    };
}

function findDecomposeFileHeadingMatches(text, headingType) {
    if (typeof window.zhiyuFindStandaloneHeadingMatches === 'function') {
        return window.zhiyuFindStandaloneHeadingMatches(text, headingType);
    }
    var unit = headingType === 'volume' ? '\u5377' : '\u7ae0';
    var inlineSpace = '[\\t \\u3000]*';
    var pattern = new RegExp(
        '^([\\t \\u3000]*(?:#{1,6}[\\t \\u3000]*)?)'
            + '(\\u7b2c' + inlineSpace + '[0-9\uff10-\uff19\u96f6\u3007\u4e24\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343\u4e07]+' + inlineSpace
            + unit + '[^\\r\\n]{0,120}?)(?:[\\t \\u3000]+#{1,6})?[\\t \\u3000]*\\r?$',
        'gm'
    );
    return Array.from(String(text || '').matchAll(pattern)).map(function(match) {
        var rawLine = String(match[0] || '');
        match.rawStart = match.index;
        match.rawEnd = match.index + rawLine.length;
        match.titleStart = match.index + String(match[1] || '').length;
        match[0] = String(match[2] || '').trim();
        return match;
    });
}

function parseDecomposeFileChapters(text) {
    var chapters = [];
    if (typeof window.zhiyuParseReadableExport === 'function') {
        var readableExport = window.zhiyuParseReadableExport(text);
        if (readableExport && Array.isArray(readableExport.records) && readableExport.records.length > 0) {
            return readableExport.records.map(function(record, index) {
                var title = String(record.chapterName || record.title || ('第' + (index + 1) + '章')).trim();
                var body = String(record.content || '').trim();
                var content = title + (body ? '\n' + body : '');
                return createDecomposeFileChapter(title, content, record.volumeName || record.volume || '第一卷');
            });
        }
    }
    var volumeMatches = findDecomposeFileHeadingMatches(text, 'volume').map(function(match) {
        return { title: match[0], index: Number.isInteger(match.rawStart) ? match.rawStart : match.index };
    });

    if (volumeMatches.length > 0) {
        for (var vi = 0; vi < volumeMatches.length; vi++) {
            var volume = volumeMatches[vi];
            var volumeTitle = volume.title.trim();
            var volumeStart = volume.index;
            var volumeEnd = (vi + 1 < volumeMatches.length) ? volumeMatches[vi + 1].index : text.length;
            var volumeContent = text.substring(volumeStart, volumeEnd);
            var chapterMatches = findDecomposeFileHeadingMatches(volumeContent, 'chapter').map(function(match) {
                return {
                    title: match[0],
                    contentStart: Number.isInteger(match.titleStart) ? match.titleStart : match.index,
                    boundaryStart: Number.isInteger(match.rawStart) ? match.rawStart : match.index
                };
            });
            for (var ci = 0; ci < chapterMatches.length; ci++) {
                var current = chapterMatches[ci];
                var chapterStart = current.contentStart;
                var chapterEnd = (ci + 1 < chapterMatches.length) ? chapterMatches[ci + 1].boundaryStart : volumeContent.length;
                chapters.push(createDecomposeFileChapter(current.title, volumeContent.substring(chapterStart, chapterEnd), volumeTitle));
            }
        }
        return chapters;
    }

    var plainMatches = findDecomposeFileHeadingMatches(text, 'chapter').map(function(match) {
        return {
            title: match[0],
            contentStart: Number.isInteger(match.titleStart) ? match.titleStart : match.index,
            boundaryStart: Number.isInteger(match.rawStart) ? match.rawStart : match.index
        };
    });

    for (var i = 0; i < plainMatches.length; i++) {
        var item = plainMatches[i];
        var start = item.contentStart;
        var end = (i + 1 < plainMatches.length) ? plainMatches[i + 1].boundaryStart : text.length;
        chapters.push(createDecomposeFileChapter(item.title, text.substring(start, end)));
    }
    return chapters;
}

async function handleDecompFile(e) {
    var file = e && e.target && e.target.files ? e.target.files[0] : null;
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
        ACTION_PANEL_TOAST.warn('\u6587\u4ef6\u4e0d\u80fd\u8d85\u8fc720MB');
        return;
    }

    var buffer = await new Promise(function(resolve) {
        var reader = new FileReader();
        reader.onload = function(ev) { resolve(new Uint8Array(ev.target.result)); };
        reader.readAsArrayBuffer(file);
    });
    var text = decodeDecomposeFileBuffer(buffer);
    if (typeof window.normalizeDecomposePlainText === 'function') {
        text = window.normalizeDecomposePlainText(text);
    }
    var parsedChapters = parseDecomposeFileChapters(text);

    if (parsedChapters.length === 0) {
        ACTION_PANEL_TOAST.warn('\u672a\u68c0\u6d4b\u5230\u201c\u7b2cX\u7ae0\u201d\u683c\u5f0f\u7684\u7ae0\u8282\uff0c\u8bf7\u786e\u8ba4\u6587\u4ef6\u683c\u5f0f');
        return;
    }

    decompFileChapters = parsedChapters;
    window._decompFileChapters = decompFileChapters;
    window._decompFileOriginalOrder = decompFileChapters.map(cloneDecomposeFileChapter);

    document.getElementById('decompFileInfoName').textContent = file.name;
    document.getElementById('decompFileInfoStats').textContent =
        '\u603b\u5b57\u6570\uff1a' +
        decompFileChapters.reduce(function(sum, chapter) { return sum + chapter.wordCount; }, 0).toLocaleString() +
        ' | \u603b\u7ae0\u8282\uff1a' +
        decompFileChapters.length;
    document.getElementById('decompFileInfo').style.display = 'flex';
    document.getElementById('decompFileActions').style.display = 'flex';
    document.getElementById('decompFileCount').style.display = '';
    document.getElementById('decompFileDropZone').style.display = 'none';

    renderDecompFileList();
}

function clearDecomposeFileImport() {
    decompFileChapters = [];
    window._decompFileChapters = [];
    window._decompFileOriginalOrder = [];
    document.getElementById('decompFileInput').value = '';
    document.getElementById('decompFileInfo').style.display = 'none';
    document.getElementById('decompFileActions').style.display = 'none';
    document.getElementById('decompFileCount').style.display = 'none';
    document.getElementById('decompFileDropZone').style.display = '';
    document.getElementById('decompFileList').innerHTML = '';
}

function getDecomposeFileImportLimit() {
    return Number(window.ZHIYU_DECOMPOSE_IMPORT_CHAPTER_LIMIT) || 10;
}

function setDecompFileChapterSelection(index, nextSelected, checkbox) {
    var chapter = decompFileChapters[index];
    if (!chapter) return false;
    var selectedCount = decompFileChapters.filter(function(item) { return item.selected; }).length;
    if (nextSelected && !chapter.selected && selectedCount >= getDecomposeFileImportLimit()) {
        if (checkbox) checkbox.checked = false;
        ACTION_PANEL_TOAST.warn('\u6700\u591a\u9009\u62e9' + getDecomposeFileImportLimit() + '\u7ae0');
        updateDecomposeChapterCount('decompFileList', 'decompFileCount');
        return false;
    }
    chapter.selected = Boolean(nextSelected);
    if (checkbox) checkbox.checked = chapter.selected;
    updateDecomposeChapterCount('decompFileList', 'decompFileCount');
    return true;
}

function renderDecompFileList() {
    var list = document.getElementById('decompFileList');
    if (!list) return;
    list.innerHTML = decompFileChapters.map(function(chapter, index) {
        var volumeLabel = chapter.volume
            ? renderLineIcon('folder') + ' ' + ACTION_PANEL_UTILS.escapeHtml(chapter.volume) + ' - '
            : '';
        return '<div class="decomp-file-chapter-row" data-chapter-index="' + index + '" style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border-bottom:1px solid var(--border);cursor:pointer;">' +
            '<input class="decomp-file-chapter-checkbox" type="checkbox" ' + (chapter.selected ? 'checked' : '') + ' style="width:auto;margin-top:3px;flex-shrink:0;">' +
            '<div style="flex:1;min-width:0;">' +
            '<div style="font-weight:600;font-size:13px;">' + volumeLabel + ACTION_PANEL_UTILS.escapeHtml(chapter.title) + '</div>' +
            '<div style="font-size:11px;color:var(--text-muted);">' + chapter.wordCount.toLocaleString() + '\u5b57</div>' +
            '<div style="font-size:11px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + ACTION_PANEL_UTILS.escapeHtml(chapter.preview) + '...</div>' +
            '</div></div>';
    }).join('');
    list.querySelectorAll('.decomp-file-chapter-row').forEach(function(row) {
        var index = parseInt(row.dataset.chapterIndex, 10);
        var checkbox = row.querySelector('.decomp-file-chapter-checkbox');
        row.addEventListener('click', function(event) {
            if (event.target === checkbox) return;
            setDecompFileChapterSelection(index, !decompFileChapters[index].selected, checkbox);
        });
        checkbox.addEventListener('change', function(event) {
            event.stopPropagation();
            setDecompFileChapterSelection(index, checkbox.checked, checkbox);
        });
    });
    updateDecomposeChapterCount('decompFileList', 'decompFileCount');
}

document.getElementById('decompFileInput')?.addEventListener('change', handleDecompFile);

(function bindDecomposeFileDropZone() {
    var dropZone = document.getElementById('decompFileDropZone');
    if (!dropZone) return;
    dropZone.addEventListener('dragover', function(e) {
        e.preventDefault();
        dropZone.style.borderColor = '#1976d2';
        dropZone.style.background = '#f0f7ff';
    });
    dropZone.addEventListener('dragleave', function() {
        dropZone.style.borderColor = '#d4d0c8';
        dropZone.style.background = '';
    });
    dropZone.addEventListener('drop', function(e) {
        e.preventDefault();
        dropZone.style.borderColor = '#d4d0c8';
        dropZone.style.background = '';
        var file = e.dataTransfer.files[0];
        if (!file) return;
        var dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        document.getElementById('decompFileInput').files = dataTransfer.files;
        handleDecompFile({ target: { files: dataTransfer.files } });
    });
})();

document.getElementById('btnDecompFileRemove')?.addEventListener('click', clearDecomposeFileImport);

document.getElementById('btnDecompFileSelectAll')?.addEventListener('click', function() {
    var limit = getDecomposeFileImportLimit();
    var selectableCount = Math.min(decompFileChapters.length, limit);
    var shouldClear = selectableCount > 0 && decompFileChapters.every(function(chapter, index) {
        return index < selectableCount ? chapter.selected : !chapter.selected;
    });
    decompFileChapters.forEach(function(chapter, index) {
        chapter.selected = shouldClear ? false : index < limit;
    });
    this.textContent = shouldClear ? '\u5168\u9009\u7ae0\u8282' : '\u53d6\u6d88\u5168\u9009';
    if (!shouldClear && decompFileChapters.length > limit) {
        ACTION_PANEL_TOAST.warn('\u6700\u591a\u9009\u62e9' + limit + '\u7ae0\uff0c\u5df2\u5168\u9009\u524d' + limit + '\u7ae0');
    }
    renderDecompFileList();
});

document.getElementById('btnDecompFileSmartSort')?.addEventListener('click', function() {
    decompFileChapters.sort(function(a, b) { return parseChapterNum(a.title) - parseChapterNum(b.title); });
    renderDecompFileList();
});

document.getElementById('btnDecompFileKeepOrder')?.addEventListener('click', function() {
    if (window._decompFileOriginalOrder && window._decompFileOriginalOrder.length > 0) {
        decompFileChapters.length = 0;
        Array.prototype.push.apply(decompFileChapters, window._decompFileOriginalOrder.map(cloneDecomposeFileChapter));
    }
    renderDecompFileList();
});

window.handleDecompFile = handleDecompFile;
window.renderDecompFileList = renderDecompFileList;
window.clearDecomposeFileImport = clearDecomposeFileImport;
window.parseDecomposeFileChapters = parseDecomposeFileChapters;
window.setDecompFileChapterSelection = setDecompFileChapterSelection;
window.ZHIYU_DECOMPOSE_FILE_IMPORT_READY = true;
