(function(window) {
    'use strict';

        function chineseToNumber(s) {
            if (/^\d+$/.test(s)) return parseInt(s);
            var map = { '零':0,'〇':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,'百':100,'千':1000,'万':10000 };
            if (s.length === 1) return map[s] || 0;
            if (s === '十') return 10;
            if (s.startsWith('十')) return 10 + (map[s[1]] || 0);
            if (s.endsWith('十')) return (map[s[0]] || 0) * 10;
            if (s.indexOf('十') > 0) { var parts = s.split('十'); return (map[parts[0]] || 0) * 10 + (map[parts[1]] || 0); }
            if (s.length === 3 && s[0] in map && s[1] === '百') return map[s[0]] * 100;
            return 0;
        }

        function extractChapterNum(rawStr) {
            var match = rawStr.match(/第\s*([零〇两一二三四五六七八九十百千万\d]+)\s*(?:章|回|节)/);
            if (!match) return 0;
            return chineseToNumber(match[1]);
        }

        function extractChapterNumberFromName(name) {
            if (!name) return 0;
            var m = name.match(/第\s*(\d+)\s*(?:章|回|节)/);
            if (m) return parseInt(m[1]);
            m = name.match(/第\s*([零〇两一二三四五六七八九十百千万\d]+)\s*(?:章|回|节)/);
            if (m) return chineseToNumber(m[1]);
            return 0;
        }

        // 5. 逐章拆分（正则）
        function regexSplitChapters(text, startChap, endChap) {
            text = String(text || '').replace(/\r\n/g, '\n');
            var chapterNumChars = '零〇两一二三四五六七八九十百千万\\d';
            var headingRegex = new RegExp(
                '(?:^|\\n)[\\t ]*(?:[-*+][\\t ]+)?(?:\\d+[\\.、][\\t ]*)?(?:#{1,6}[\\t ]*)?[《【\\[]?[\\t ]*'
                + '(?:(?:\\*\\*|__)[\\t ]*(第\\s*[' + chapterNumChars + ']+\\s*(?:章|回|节)[^\\n]{0,76}?)[\\t ]*(?:\\*\\*|__)'
                + '|(第\\s*[' + chapterNumChars + ']+\\s*(?:章|回|节)[^\\n]{0,80}))',
                'g'
            );
            var fallbackRegex = new RegExp('第\\s*[' + chapterNumChars + ']+\\s*(?:章|回|节)[^\\n]{0,80}', 'g');
            var allMatches = [];
            var match;
            while ((match = headingRegex.exec(text)) !== null) {
                var matchedTitle = match[1] || match[2];
                var headingOffset = match[0].search(/[^\s]/);
                allMatches.push({ txt: matchedTitle, idx: match.index + Math.max(0, headingOffset) });
            }
            if (allMatches.length === 0) {
                while ((match = fallbackRegex.exec(text)) !== null) { allMatches.push({ txt: match[0], idx: match.index }); }
            }
            if (allMatches.length === 0) return null;

            var chapters = [];
            for (var i = 0; i < allMatches.length; i++) {
                var startIdx = allMatches[i].idx;
                var endIdx = (i + 1 < allMatches.length) ? allMatches[i + 1].idx : text.length;
                var title = allMatches[i].txt.trim();
                var content = text.substring(startIdx, endIdx).trim();
                var num = extractChapterNum(title);
                chapters.push({ num: num, title: title, content: content });
            }

            // 筛选范围（如果不指定则取前10章）
            if (!startChap) startChap = chapters[0]?.num || 1;
            if (!endChap) endChap = Math.min(startChap + 9, chapters[chapters.length - 1]?.num || startChap + 9);

            var result = [];
            for (var j = 0; j < chapters.length; j++) {
                if (chapters[j].num >= startChap && chapters[j].num <= endChap) {
                    result.push({ num: chapters[j].num, title: chapters[j].title.replace(/^第\s*[零两一二三四五六七八九十百千\d]+\s*(?:章|回|节)[】》\]]?[：:\s、.-]*/, '').trim() || ('第' + chapters[j].num + '章'), content: chapters[j].content, checked: true });
                }
            }
            // 限制最多10章
            return result.slice(0, 10).length > 0 ? result.slice(0, 10) : null;
        }

        function splitGeneratedChapterSections(content) {
            var text = String(content || '').replace(/\r\n/g, '\n');
            var chapterNumChars = '零〇两一二三四五六七八九十百千万\\d';
            var headingRegex = new RegExp(
                '(?:^|\\n)[\\t ]*(?:[-*+][\\t ]+)?(?:#{1,6}[\\t ]*)?[《【\\[]?[\\t ]*'
                + '(?:(?:\\*\\*|__)[\\t ]*(第\\s*[' + chapterNumChars + ']+\\s*(?:章|回|节)[^\\n]{0,76}?)[\\t ]*(?:\\*\\*|__)'
                + '|(第\\s*[' + chapterNumChars + ']+\\s*(?:章|回|节)[^\\n]{0,80}))',
                'g'
            );
            var matches = [];
            var match;
            while ((match = headingRegex.exec(text)) !== null) {
                var matchedTitle = match[1] || match[2];
                var title = matchedTitle.trim().replace(/[】》\]]\s*$/, '').trim();
                var headingOffset = match[0].search(/[^\s]/);
                var idx = match.index + Math.max(0, headingOffset);
                matches.push({ txt: title, idx: idx });
            }
            if (matches.length === 0) return [];
            return matches.map(function(item, index) {
                var endIdx = (index + 1 < matches.length) ? matches[index + 1].idx : text.length;
                var raw = text.substring(item.idx, endIdx).trim();
                var num = extractChapterNum(item.txt);
                var cleanTitle = item.txt
                    .replace(new RegExp('^第\\s*[' + chapterNumChars + ']+\\s*(?:章|回|节)[】》\\]]?[：:\\s、.-]*'), '')
                    .trim();
                return { title: item.txt, cleanTitle: cleanTitle, num: num, content: raw };
            }).filter(function(ch) {
                return ch.num && ch.content;
            });
        }

        function getChapterFormatHelpText() {
            return '支持格式示例：# 第五章：聚气散、## 第5章 聚气散、### 第五回 聚气散';
        }


    window.chineseToNumber = chineseToNumber;
    window.extractChapterNum = extractChapterNum;
    window.extractChapterNumberFromName = extractChapterNumberFromName;
    window.regexSplitChapters = regexSplitChapters;
    window.splitGeneratedChapterSections = splitGeneratedChapterSections;
    window.getChapterFormatHelpText = getChapterFormatHelpText;
    window.ZHIYU_OUTLINE_CHAPTER_PARSER_READY = true;
})(window);
