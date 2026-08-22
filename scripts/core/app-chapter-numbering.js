(function(window) {
    'use strict';

        function parseChapterNum(chapterName) {
            const normalizedName = String(chapterName || '').replace(/[０-９]/g, function(char) {
                return String.fromCharCode(char.charCodeAt(0) - 65248);
            });
            const match = normalizedName.match(/第\s*([\d零〇两一二三四五六七八九十百千]+)\s*(?:章|节|回)/);
            if (!match) return Infinity;
            const numStr = match[1];
            const cnNums = { '零':0,'〇':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,'百':100,'千':1000 };
            if (/^\d+$/.test(numStr)) return parseInt(numStr);
            // 中文数字转阿拉伯
            let result = 0, temp = 0;
            for (const ch of numStr) {
                if (ch === '百') { temp *= 100; result += temp; temp = 0; }
                else if (ch === '千') { temp *= 1000; result += temp; temp = 0; }
                else if (ch === '十') { temp = temp === 0 ? 10 : temp * 10; }
                else if (cnNums[ch] !== undefined) { temp += cnNums[ch]; }
            }
            return result + temp;
        }

        function sortChapters(book) {
            if (!book || !book.volumes) return;
            for (const vol of book.volumes) {
                vol.chapters.sort((a, b) => parseChapterNum(a.name) - parseChapterNum(b.name));
            }
        }


        function countTotalChapters(book) {
            if (!book?.volumes) return 0;
            let count = 0;
            book.volumes.forEach(v => count += v.chapters?.length || 0);
            return count;
        }

        // 确保记忆库中存在该书籍的卡片（不存在则自动创建）

        function calculateChapterNumber(book, vi, ci) {
            let num = 1;
            for (let v = 0; v < vi; v++) {
                num += book.volumes[v].chapters.length;
            }
            num += ci;
            return num;
        }

        // 数字转中文（1-9999 章）
        function toChineseChapter(n) {
            const digits = ['零','一','二','三','四','五','六','七','八','九'];
            const units = ['','十','百','千'];
            const bigUnits = ['','万','亿'];
            if (n <= 0) return '零';
            if (n <= 10) return n === 10 ? '十' : digits[n];
            let result = '';
            let unitIndex = 0;
            let num = n;
            while (num > 0) {
                const part = num % 10000;
                if (part > 0) {
                    let partStr = '';
                    const thousands = Math.floor(part / 1000);
                    const hundreds = Math.floor((part % 1000) / 100);
                    const tens = Math.floor((part % 100) / 10);
                    const ones = part % 10;
                    if (thousands > 0) partStr += digits[thousands] + '千';
                    if (hundreds > 0) partStr += digits[hundreds] + '百';
                    if (tens > 0) {
                        partStr += (part >= 20 && tens > 0 ? (tens === 1 ? '' : digits[tens]) : (part >= 20 ? digits[tens] : '')) + '十';
                    } else if (ones > 0 && (thousands > 0 || hundreds > 0)) {
                        partStr += '零';
                    }
                    if (ones > 0) partStr += digits[ones];
                    result = partStr + bigUnits[unitIndex] + result;
                }
                num = Math.floor(num / 10000);
                unitIndex++;
            }
            // 修正"一十" → "十"
            result = result.replace(/^一十/, '十');
            return result;
        }

        // ===== 自动读取记忆库上下文文件（边界卡/追踪卡/大纲/设定集）=====

    window.parseChapterNum = parseChapterNum;
    window.sortChapters = sortChapters;
    window.countTotalChapters = countTotalChapters;
    window.calculateChapterNumber = calculateChapterNumber;
    window.toChineseChapter = toChineseChapter;
    window.ZHIYU_CHAPTER_NUMBERING_READY = true;
})(window);
