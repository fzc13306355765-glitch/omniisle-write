// Split project import book module.
// Keeps create/import book, file parsing, chapter detection, and import-confirm flow out of the legacy main script.
(function(window, document) {
    'use strict';

    const STATUS = window.ZHIYU_STATUS || {};
    const Toast = window.ZHIYU_TOAST || window.Toast || { show: function(){}, warn: function(){}, success: function(){}, error: function(){} };
    const Modal = window.ZHIYU_MODAL || window.Modal || { open: function(){}, close: function(){} };

    function gB(){ return typeof window.gB === 'function' ? window.gB() : {}; }
    function sB(books){ if (typeof window.sB === 'function') window.sB(books); }
    function unmarkImportBookDeleted(name, book){
        if (typeof window.unmarkBookDeleted === 'function') window.unmarkBookDeleted(name, book);
    }
    function refreshOverviewSafe(){ if (typeof window.refreshOverview === 'function') window.refreshOverview(); }
    function renderImportChapterListSafe(){ if (typeof window.renderImportChapterList === 'function') window.renderImportChapterList(); }
    const countChineseWords = window.countChineseWords || function(text) {
        return String(text || '').replace(/\s/g, '').length;
    };
    const aiDetectChapters = window.aiDetectChapters || async function() {
        throw new Error('AI章节检测模块未加载');
    };

    function normalizeImportChapterHeading(value) {
        return String(value || '')
            .replace(/^[\t \u3000]*#{1,6}[\t \u3000]*/, '')
            .replace(/[\t \u3000]+#{1,6}[\t \u3000]*$/, '')
            .replace(/\s+/g, '')
            .trim();
    }

    function findStandaloneImportHeadingMatches(sourceText, headingType) {
        if (typeof window.zhiyuFindStandaloneHeadingMatches === 'function') {
            return window.zhiyuFindStandaloneHeadingMatches(sourceText, headingType);
        }
        const source = String(sourceText || '');
        const unit = headingType === 'volume' ? '卷' : '章';
        const inlineSpace = '[\\t \\u3000]*';
        const pattern = new RegExp(
            '^([\\t \\u3000]*(?:#{1,6}[\\t \\u3000]*)?)'
                + '(第' + inlineSpace + '[0-9０-９零〇两一二三四五六七八九十百千万]+' + inlineSpace
                + unit + '[^\\r\\n]{0,120}?)(?:[\\t \\u3000]+#{1,6})?[\\t \\u3000]*\\r?$',
            'gm'
        );
        return [...source.matchAll(pattern)].map(function(match) {
            const rawLine = String(match[0] || '');
            match.rawStart = match.index;
            match.rawEnd = match.index + rawLine.length;
            match.titleStart = match.index + String(match[1] || '').length;
            match[0] = String(match[2] || '').trim();
            return match;
        });
    }

    function collapseAdjacentDuplicateChapterMatches(matches, sourceText) {
        const source = String(sourceText || '');
        const collapsed = [];
        let removedCount = 0;
        (Array.isArray(matches) ? matches : []).forEach(function(match) {
            const currentTitle = String(match?.[0] || match?.title || '').trim();
            const previous = collapsed[collapsed.length - 1];
            const previousTitle = String(previous?.[0] || previous?.title || '').trim();
            const previousEnd = Number.isInteger(previous?.rawEnd)
                ? previous.rawEnd
                : Number(previous?.index || 0) + previousTitle.length;
            const currentStart = Number.isInteger(match?.rawStart)
                ? match.rawStart
                : Number(match?.index || 0);
            const onlyWhitespaceBetween = previous
                && currentStart >= previousEnd
                && !source.slice(previousEnd, currentStart).trim();
            if (onlyWhitespaceBetween
                && normalizeImportChapterHeading(previousTitle) === normalizeImportChapterHeading(currentTitle)) {
                removedCount += 1;
                return;
            }
            collapsed.push(match);
        });
        return { matches: collapsed, removedCount };
    }

    function stripRepeatedLeadingChapterHeading(content, title) {
        const lines = String(content || '').split(/\r?\n/);
        const normalizedTitle = normalizeImportChapterHeading(title);
        if (!lines.length || normalizeImportChapterHeading(lines[0]) !== normalizedTitle) {
            return String(content || '').trim();
        }
        let cursor = 1;
        while (cursor < lines.length) {
            let candidate = cursor;
            while (candidate < lines.length && !String(lines[candidate] || '').trim()) candidate += 1;
            if (candidate >= lines.length
                || normalizeImportChapterHeading(lines[candidate]) !== normalizedTitle) break;
            cursor = candidate + 1;
        }
        return [lines[0], ...lines.slice(cursor)].join('\n').trim();
    }

        document.getElementById('importBookCard')?.addEventListener('click',async function(){
            Modal.open('importBookModal');
        });

        // 第1步：确定导入 → 打开文件选择器
        document.getElementById('btnConfirmImport')?.addEventListener('click', function() {
            Modal.close('importBookModal');
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.txt,.md,.docx';
            input.onchange = handleImportFile;
            input.click();
        });

        // 解析导入文件
        let importParsedChapters = [];
        function getImportParsedChapters() {
            return Array.isArray(window.importParsedChapters) ? window.importParsedChapters : importParsedChapters;
        }

        async function handleImportFile(e) {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 20 * 1024 * 1024) { Toast.warn('文件不能超过20MB'); return; }

            const ext = file.name.split('.').pop().toLowerCase();
            let text = '';
            if (ext === 'docx') {
                Toast.warn('DOCX格式暂不支持，请使用txt或md');
                return;
            }
            const buffer = await new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = ev => resolve(new Uint8Array(ev.target.result));
                reader.readAsArrayBuffer(file);
            });
            // 尝试 UTF-8，失败则用 GBK
            try {
                text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
            } catch(e) {
                try { text = new TextDecoder('gbk').decode(buffer); }
                catch(e2) { text = new TextDecoder('utf-8').decode(buffer); }
            }

            // 第1步：检测分卷（第N卷）
            let volMatches = findStandaloneImportHeadingMatches(text, 'volume');

            importParsedChapters = [];
            window._importOriginalOrder = [];
            let duplicateHeadingCount = 0;

            if (volMatches.length > 0) {
                // 有分卷：按卷切分，再在每个卷内按章切分
                const volumes = [];
                for (let i = 0; i < volMatches.length; i++) {
                    const vMatch = volMatches[i];
                    const vTitle = vMatch[0].trim();
                    const vStart = vMatch.index;
                    const vEnd = (i + 1 < volMatches.length) ? volMatches[i + 1].index : text.length;
                    const vContent = text.substring(vStart, vEnd);
                    volumes.push({ title: vTitle, content: vContent, startIdx: vStart });
                }

                // 在每个卷内检测章节
                for (let volumeIndex = 0; volumeIndex < volumes.length; volumeIndex++) {
                    const vol = volumes[volumeIndex];
                    const collapsed = collapseAdjacentDuplicateChapterMatches(
                        findStandaloneImportHeadingMatches(vol.content, 'chapter'),
                        vol.content
                    );
                    const chMatches = collapsed.matches;
                    duplicateHeadingCount += collapsed.removedCount;
                    if (chMatches.length === 0) continue;
                    for (let i = 0; i < chMatches.length; i++) {
                        const match = chMatches[i];
                        const title = match[0].trim();
                        const startIdx = match.index;
                        const endIdx = (i + 1 < chMatches.length) ? chMatches[i + 1].index : vol.content.length;
                        const content = stripRepeatedLeadingChapterHeading(
                            vol.content.substring(startIdx, endIdx),
                            title
                        );
                        const wordCount = countChineseWords(content);
                        const preview = content.substring(title.length, title.length + 150).replace(/\n/g, ' ').trim();
                        importParsedChapters.push({
                            title,
                            content,
                            wordCount,
                            preview,
                            selected: false,
                            volume: vol.title,
                            _importVolumeIndex: volumeIndex,
                            _importOriginalIndex: importParsedChapters.length
                        });
                    }
                }
            } else {
                // 无分卷：直接按章切分
            let matches = findStandaloneImportHeadingMatches(text, 'chapter');
            if (matches.length === 0) {
                // 正则未匹配，用 AI 分析内容提取章节
                Toast.show('正在用 AI 分析章节结构...');
                try {
                    matches = await aiDetectChapters(text);
                } catch(e) {
                    const message = typeof window.formatAiErrorForDisplay === 'function'
                        ? window.formatAiErrorForDisplay(e, 'AI章节分析失败')
                        : String(e?.message || e || 'AI章节分析失败');
                    Toast.error(message);
                    window.Utils?.appendLog?.(null, message, 'error');
                    return;
                }
                if (!matches || matches.length === 0) {
                    Toast.warn('未检测到章节结构，请确保文件中有"第N章"标记');
                    return;
                }
            }
            const collapsed = collapseAdjacentDuplicateChapterMatches(matches, text);
            matches = collapsed.matches;
            duplicateHeadingCount += collapsed.removedCount;

            importParsedChapters = [];
            for (let i = 0; i < matches.length; i++) {
                const match = matches[i];
                const title = match[0].trim();
                const startIdx = match.index;
                const endIdx = (i + 1 < matches.length) ? matches[i + 1].index : text.length;
                const content = stripRepeatedLeadingChapterHeading(
                    text.substring(startIdx, endIdx),
                    title
                );
                const wordCount = countChineseWords(content);
                const preview = content.substring(title.length, title.length + 150).replace(/\n/g, ' ').trim();
                importParsedChapters.push({
                    title,
                    content,
                    wordCount,
                    preview,
                    selected: true,
                    volume: '第一卷',
                    _importVolumeIndex: 0,
                    _importOriginalIndex: importParsedChapters.length
                });
            }
            } // end else (无分卷)

            window.importParsedChapters = importParsedChapters;
            // 保存原始顺序快照
            window._importOriginalOrder = importParsedChapters.map(c => ({ ...c, selected: c.selected }));
            // 显示解析结果
            const bookName = file.name.replace(/\.(txt|md|docx)$/i, '');
            document.getElementById('importBookName').value = bookName;
            document.getElementById('importParseTitle').textContent = file.name;
            document.getElementById('importParseInfo').innerHTML =
                '总字数：' + importParsedChapters.reduce((s,c) => s + c.wordCount, 0).toLocaleString() +
                ' | 总章节：' + importParsedChapters.length;
            if (duplicateHeadingCount > 0) {
                Toast.warn('检测到连续重复章节标题，已自动合并 ' + duplicateHeadingCount + ' 处');
            }
            renderImportChapterListSafe();
            updateImportAnalysisEstimate();
            Modal.open('importParseModal');
        }

        function getImportChaptersInOriginalOrder() {
            const chapters = getImportParsedChapters();
            const orderer = window.ZhiyuFullTextAnalysisCore?.orderImportChapters;
            if (typeof orderer === 'function') {
                return orderer(chapters, 'original').chapters;
            }
            return chapters.slice().sort(function(a, b) {
                return Number(a?._importOriginalIndex || 0) - Number(b?._importOriginalIndex || 0);
            });
        }

        function getSelectedImportPayload() {
            const selected = getImportChaptersInOriginalOrder().filter(function(chapter) { return chapter.selected; });
            if (!selected.length) { Toast.warn('请至少选择一个章节'); return null; }
            const bookName = String(document.getElementById('importBookName')?.value || '').trim();
            if (!bookName) { Toast.warn('请输入作品名称'); return null; }
            return {
                bookName: bookName,
                bookType: document.querySelector('input[name="importType"]:checked')?.value === 'script' ? 'script' : 'novel',
                selected: selected.map(function(chapter) {
                    return {
                        title: chapter.title,
                        content: chapter.content,
                        volumeName: chapter.volume || '第一卷',
                        _importOriginalIndex: chapter._importOriginalIndex,
                        selected: true
                    };
                })
            };
        }

        function updateImportAnalysisEstimate() {
            const estimate = document.getElementById('importAnalysisEstimate');
            if (!estimate) return;
            const selected = getImportChaptersInOriginalOrder().filter(function(chapter) {
                return chapter.selected && String(chapter.content || '').trim();
            });
            const planner = window.ZhiyuImportFullAnalysisPlan;
            if (!selected.length || !planner) {
                estimate.textContent = selected.length ? '全文分析组件未加载，请刷新页面后重试。' : '选择章节后显示预计消耗。';
                return;
            }
            const plan = planner.buildPlan({
                bookName: String(document.getElementById('importBookName')?.value || '待导入作品').trim() || '待导入作品',
                chapters: selected.map(function(chapter) {
                    return {
                        title: chapter.title,
                        volumeName: chapter.volume || '',
                        content: chapter.content,
                        _importOriginalIndex: chapter._importOriginalIndex,
                        selected: true
                    };
                })
            });
            if (window.ZHIYU_COMMUNITY_MODE === true) {
                estimate.textContent = '当前选择 ' + selected.length.toLocaleString() + ' 章，共 '
                    + Number(plan.totalWords || 0).toLocaleString() + ' 个有效字符；预计至少需要 '
                    + Number(plan.segments?.length || plan.requestUnits || 0).toLocaleString()
                    + ' 次正文分析请求，资料汇总和续写卡还会增加少量请求。费用由你的 API 服务商计算。';
            } else {
                estimate.textContent = '当前选择 ' + selected.length.toLocaleString() + ' 章，共 '
                    + Number(plan.totalWords || 0).toLocaleString() + ' 个有效字符；预计消耗 '
                    + Number(plan.requestUnits || 0).toLocaleString() + ' 次自备模型调用。实际次数取决于分段与重试情况。';
            }
        }

        // ===== 导入后全文分析：兼容旧入口，实际交给可恢复的任务模块 =====
        async function analyzeImportedBook(bookName, book) {
            const client = window.ZhiyuFullTextAnalysisClient;
            if (client?.openFromImport) {
                const chapters = [];
                (book?.volumes || []).forEach(function(volume) {
                    (volume?.chapters || []).forEach(function(chapter) {
                        chapters.push({
                            id: chapter.id || chapter._cid || chapter._localId || '',
                            title: chapter.name,
                            content: chapter.content,
                            volumeName: volume.name || '第一卷',
                            _importOriginalIndex: chapters.length,
                            selected: true
                        });
                    });
                });
                return client.openFromImport({
                    bookName: bookName,
                    bookType: book?.type === 'script' ? 'script' : 'novel',
                    sourceWorkId: book?._bid || bookName,
                    chapters: chapters
                });
            }
            Toast.warn('全文分析组件未加载，请刷新页面后重试');
            return null;
        }

        // 确认导入
        document.getElementById('btnImportDone')?.addEventListener('click', async function() {
            const selected = getImportChaptersInOriginalOrder().filter(c => c.selected);
            if (selected.length === 0) { Toast.warn('请至少选择一个章节'); return; }
            const bookName = document.getElementById('importBookName').value.trim();
            if (!bookName) { Toast.warn('请输入作品名称'); return; }

            const books = gB();
            if (books[bookName]) { Toast.warn('作品名已存在'); return; }
            const importType = document.querySelector('input[name="importType"]:checked')?.value || 'novel';

            // 按分卷组织章节
            const volumeMap = {};
            selected.forEach(c => {
                const vName = c.volume || '第一卷';
                if (!volumeMap[vName]) volumeMap[vName] = [];
                volumeMap[vName].push({ name: c.title, content: c.content, createdAt: new Date().toISOString() });
            });
            const volumes = Object.keys(volumeMap).map(vName => ({ name: vName, chapters: volumeMap[vName] }));

            books[bookName] = {
                status: STATUS.ACTIVE,
                createdAt: new Date().toISOString(),
                volumes: volumes,
                currentVol: 0,
                wordCount: selected.reduce((s, c) => s + c.wordCount, 0),
                type: importType
            };
            window.ensureBookStableId?.(books[bookName]);
            sB(books);
            unmarkImportBookDeleted(bookName, books[bookName]);
            Modal.close('importParseModal');
            Toast.success('已导入「' + bookName + '」，共 ' + selected.length + ' 章');
            refreshOverviewSafe();

        });

        document.getElementById('btnImportAnalyze')?.addEventListener('click', async function() {
            const payload = getSelectedImportPayload();
            if (!payload) return;
            const client = window.ZhiyuFullTextAnalysisClient;
            if (!client?.openFromImport) {
                Toast.warn('全文分析组件未加载，请刷新页面后重试');
                return;
            }
            this.disabled = true;
            try {
                await client.openFromImport({
                    bookName: payload.bookName,
                    bookType: payload.bookType,
                    chapters: payload.selected
                });
            } catch(error) {
                Toast.warn(error?.message || '全文分析暂时无法打开');
            } finally {
                this.disabled = false;
            }
        });

    window.importParsedChapters = window.importParsedChapters || importParsedChapters;
    window.ZhiyuImportChapterParser = {
        findStandaloneImportHeadingMatches,
        collapseAdjacentDuplicateChapterMatches,
        stripRepeatedLeadingChapterHeading
    };
    window.handleImportFile = handleImportFile;
    window.analyzeImportedBook = analyzeImportedBook;
    window.getSelectedImportPayload = getSelectedImportPayload;
    window.updateImportAnalysisEstimate = updateImportAnalysisEstimate;
    window.ZHIYU_IMPORT_BOOK_READY = true;
})(window, document);
