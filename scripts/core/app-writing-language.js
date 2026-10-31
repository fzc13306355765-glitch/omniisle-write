// Local text rules. Never translate, normalize or rewrite the author's stored text.
(function(window) {
    'use strict';
    const digits = '0-9０-９٠-٩۰-۹๐-๙';
    const chinese = '零〇两一二三四五六七八九十百千万';
    const spaces = '[\\t \\u3000]';
    const prefix = {
        chapter: '(?:Chapter|Ch\\.|Bab|Chương|บทที่|الفصل)',
        volume: '(?:Volume|Vol\\.|Jilid|Bagian|Bahagian|Quyển|Tập|ภาค|เล่ม|الجزء|المجلد)'
    };
    const roman = '(?:M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3}))';
    const arabicOrdinal = '(?:الأول|الاول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر)';
    function normalizeDigits(value) {
        return String(value || '').replace(/[０-９٠-٩۰-۹๐-๙]/g, ch => {
            const code = ch.charCodeAt(0);
            const start = code >= 0xff10 ? 0xff10 : code >= 0x0e50 ? 0x0e50 : code >= 0x06f0 ? 0x06f0 : 0x0660;
            return String(code - start);
        });
    }
    function internationalHeadingMatch(title, type) {
        const key = type === 'volume' ? 'volume' : 'chapter';
        // Numbered prefixes may join digits (e.g. Chapter1 or Thai "บทที่๑").
        const head = new RegExp('^' + prefix[key] + '(?:' + spaces + '+|(?=[' + digits + ']))([' + digits + ']+|[IVXLCDM]+|' + arabicOrdinal + ')(?=$|[\\t \\u3000:：.．)\\-–—])', 'iu');
        const match = String(title || '').match(head);
        if (!match) return null;
        if (new RegExp('^[.．][' + digits + ']').test(String(title).slice(match[0].length))) return null;
        return match;
    }
    function internationalNumber(title, type) {
        const match = internationalHeadingMatch(title, type);
        if (!match) return null;
        const value = normalizeDigits(match[1]);
        if (/^\d+$/.test(value)) return Number(value);
        const ordinals = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر'];
        if (value === 'الاول') return 1;
        if (ordinals.includes(value)) return ordinals.indexOf(value) + 1;
        if (!value || !new RegExp('^' + roman + '$', 'i').test(value)) return null;
        const amounts = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
        const upper = value.toUpperCase();
        return [...upper].reduce((sum, ch, index) => sum + (amounts[ch] < (amounts[upper[index + 1]] || 0) ? -amounts[ch] : amounts[ch]), 0);
    }
    function internationalTitle(title, type) {
        if (internationalNumber(title, type) === null) return String(title || '');
        return String(title).slice(internationalHeadingMatch(title, type)[0].length).replace(/^[\t \u3000:：.．)\-–—]+/u, '').trim();
    }
    // Ranges describe planning, not an individual chapter. Never split them as chapters.
    function chapterRange(value) {
        const source = normalizeDigits(value).trim().replace(/^(?:[-*+]\s+|\d{1,9}[.)、]\s+)/, '').replace(/^(?:#{1,6}\s*|\*\*|__)+/, '');
        const unit = '(?:Chapters?|Ch\\.|Bab|Chương|บทที่|บท|الفصل|الفصول)';
        const separator = '(?:[-－–—~～]|to|through|hingga|sampai|đến|ถึง|إلى)';
        const number = '(\\d+|[IVXLCDM]+|' + arabicOrdinal + ')';
        const match = source.match(new RegExp('^' + unit + '\\s*' + number + '\\s*' + separator + '\\s*(?:' + unit + '\\s*)?' + number + '(?=$|[\\s:：.،)\\-*])', 'iu'))
            || source.match(new RegExp('^' + number + '\\s*' + separator + '\\s*' + number + '\\s*' + unit + '(?=$|[\\s:：])', 'iu'));
        if (!match) return null;
        const start = internationalNumber('Chapter ' + match[1], 'chapter'), end = internationalNumber('Chapter ' + match[2], 'chapter');
        return start > 0 && end >= start ? { start, end } : null;
    }
    function findHeadings(sourceText, headingType) {
        const source = String(sourceText || '');
        const units = headingType === 'volume' ? '卷' : headingType === 'chapter-any' ? '章节回' : '章';
        const chineseHeading = new RegExp('^第' + spaces + '*[' + digits + chinese + ']+' + spaces + '*[' + units + ']');
        const headingLine = new RegExp('^([\\uFEFF\\t \\u3000]*(?:(?:[-*+]|[' + digits + ']{1,9}[.)、])' + spaces + '+)?(?:#{1,6}' + spaces + '*)?)(.*?)(?:' + spaces + '+#{1,6})?' + spaces + '*$', 'u');
        const matches = [];
        // Offsets are in the original UTF-16 string, including CRLF/BOM/Markdown prefix.
        for (const line of source.matchAll(/[^\r\n]+/g)) {
            const raw = line[0];
            if (raw.length > 200) continue;
            const parts = raw.match(headingLine);
            let title = parts?.[2] || '';
            let titleOffset = parts?.[1].length || 0;
            // Only strip a paired whole-heading wrapper; the original source and offsets remain intact.
            const strong = title.match(/^(\*\*|__)([\t \u3000]*)(.+?)\1$/u);
            if (strong) {
                titleOffset += strong[1].length + strong[2].length;
                title = strong[3].trimEnd();
            }
            const cn = chineseHeading.exec(title);
            if (!cn && internationalNumber(title, headingType) === null) continue;
            if (headingType !== 'volume' && chapterRange(title)) continue;
            if (title.length > (cn ? cn[0].length + 120 : 150)) continue;
            const match = [title, raw.slice(0, titleOffset), title];
            match.index = line.index;
            match.rawStart = line.index;
            match.rawEnd = line.index + raw.length;
            match.titleStart = line.index + titleOffset;
            matches.push(match);
        }
        return matches;
    }
    // Apply the existing sequential-number correction to every supported heading language.
    // Work backwards so original offsets, prose, Markdown and line endings stay intact.
    function renumberChapters(sourceText, firstNumber = 1) {
        const source = String(sourceText || '');
        const range = new RegExp('^第' + spaces + '*[' + digits + chinese + ']+' + spaces + '*[章节回]' + spaces + '*(?:[-—–~～]|至|到)' + spaces + '*(?:第' + spaces + '*)?[' + digits + chinese + ']+');
        const headings = findHeadings(source, 'chapter-any').filter(heading => !range.test(heading[0]));
        let content = source;
        for (let index = headings.length - 1; index >= 0; index--) {
            const heading = headings[index], title = heading[0];
            const international = internationalHeadingMatch(title, 'chapter');
            const chineseMatch = title.match(new RegExp('^第' + spaces + '*([' + digits + chinese + ']+)' + spaces + '*[章节回]'));
            const number = international?.[1] || chineseMatch?.[1];
            if (!number) continue;
            const match = international || chineseMatch;
            const relative = match[0].indexOf(number);
            const start = heading.titleStart + relative;
            content = content.slice(0, start) + String(Number(firstNumber) + index) + content.slice(start + number.length);
        }
        return { content, changed: content !== source, chapterCount: headings.length };
    }
    const grapheme = typeof Intl?.Segmenter === 'function' ? new Intl.Segmenter('und', { granularity: 'grapheme' }) : null;
    const wordSegmenters = new Map();
    function plainText(text) {
        return String(text || '')
            .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
            .replace(/<(?:br\b[^>]*|\/(?:p|div|li|h[1-6]|tr))>/gi, ' ')
            .replace(/<\/?[a-z][^>]*>/gi, '')
            .replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/gi, (_, name) => ({ nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" }[name.toLowerCase()]))
            .replace(/&#(x[0-9a-f]+|\d+);/gi, (all, value) => {
                const code = value[0].toLowerCase() === 'x' ? parseInt(value.slice(1), 16) : Number(value);
                return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : all;
            });
    }
    function countCharacters(text, options) {
        const opts = options || {};
        const value = opts.html === false ? String(text || '') : plainText(text);
        const include = opts.punctuation ? /[^\s\p{Cf}\p{M}]/u : opts.digits === false ? /[\p{L}々〆〇]/u : /[\p{L}\p{N}々〆〇]/u;
        let count = 0;
        // Combining marks and joiners are not independent characters, even in fallback.
        const segments = grapheme ? grapheme.segment(value) : Array.from(value.normalize('NFC'));
        for (const item of segments) if (include.test(typeof item === 'string' ? item : item.segment)) count += 1;
        return count;
    }
    function countReadingWords(text, options) {
        const value = options?.html === false ? String(text || '') : plainText(text);
        // Text-driven, never UI-language driven. Vietnamese results are word-like units,
        // not a claim of linguistically perfect compound-word segmentation.
        const locale = /\p{Script=Thai}/u.test(value) ? 'th' : /\p{Script=Arabic}/u.test(value) ? 'ar' : 'en';
        if (!grapheme) return { count: null, available: false };
        if (!wordSegmenters.has(locale)) wordSegmenters.set(locale, new Intl.Segmenter(locale, { granularity: 'word' }));
        let count = 0;
        for (const item of wordSegmenters.get(locale).segment(value)) if (item.isWordLike) count += 1;
        return { count, available: true };
    }
    window.ZHIYU_WRITING_LANGUAGE = Object.freeze({ findHeadings, renumberChapters, internationalNumber, internationalTitle, chapterRange, normalizeDigits, countCharacters, countReadingWords });
})(window);
