(function(window) {
    'use strict';

        // ===== 智能排版 =====
        function updateChapterTitleBar() {
            // 用户要求去掉不可选取的"XX卷XX章"标题
            const bar = document.getElementById('chapterTitleBar');
            if (bar) bar.style.display = 'none';
        }

        function splitNovelSentences(text) {
            const source = String(text || '').replace(/\s+/g, ' ').trim();
            if (!source) return [];
            const sentences = [];
            let buf = '';
            const closingQuotes = '”"’」』';
            for (let i = 0; i < source.length; i++) {
                const ch = source[i];
                const next = source[i + 1] || '';
                buf += ch;
                const isSentenceEnd = /[。！？!?；;]/.test(ch) || (ch === '…' && next !== '…');
                if (isSentenceEnd) {
                    if (closingQuotes.includes(next)) {
                        buf += next;
                        i += 1;
                    }
                    sentences.push(buf.trim());
                    buf = '';
                }
            }
            if (buf.trim()) sentences.push(buf.trim());
            return sentences.length ? sentences : [source];
        }

        function isDialogueSentence(text) {
            const s = String(text || '').trim();
            return /^[“"「『]/.test(s) || /[”"」』]$/.test(s) || /[“"「『].*[”"」』]/.test(s);
        }

        function splitDenseNovelParagraph(paragraph) {
            const source = String(paragraph || '').replace(/\s+/g, ' ').trim();
            if (!source) return [];
            if (source.length <= 180) return [source];
            const sentences = splitNovelSentences(source);
            if (sentences.length <= 1) return [source];
            const paragraphs = [];
            let buf = '';
            function pushBuf() {
                if (buf.trim()) paragraphs.push(buf.trim());
                buf = '';
            }
            sentences.forEach(function(sentence) {
                const s = sentence.trim();
                if (!s) return;
                const isDialogue = isDialogueSentence(s);
                const nextLen = buf ? buf.length + s.length : s.length;
                if (buf && (nextLen > 180 || (isDialogue && buf.length >= 60))) pushBuf();
                buf = buf ? (buf + s) : s;
                if (isDialogue || buf.length >= 130) pushBuf();
            });
            pushBuf();
            const merged = [];
            paragraphs.forEach(function(p) {
                const last = merged[merged.length - 1];
                if (last && p.length < 35 && !isDialogueSentence(p) && last.length < 150) {
                    merged[merged.length - 1] = last + p;
                } else {
                    merged.push(p);
                }
            });
            return merged.length ? merged : [source];
        }

        function applyParagraphIndent(text, indentSpaces, normalizeParagraphs) {
            const indent = '　'.repeat(Math.max(0, parseInt(indentSpaces, 10) || 0));
            let source = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\u2028|\u2029/g, '\n');
            source = source.replace(/^\n+|\n+$/g, '');
            if (!source.trim()) return '';
            const output = [];
            // 每个手动换行都是段落边界；用户已有空行原样保留，不再为每段额外插入空段落。
            source.split('\n').forEach(function(line) {
                const paragraph = line.replace(/^[　\t ]+/, '').replace(/[\t ]+$/, '');
                if (!paragraph) {
                    if (!normalizeParagraphs) output.push('');
                    return;
                }
                const parts = normalizeParagraphs ? splitDenseNovelParagraph(paragraph) : [paragraph];
                parts.forEach(function(part) { output.push(indent + part); });
            });
            return output.join('\n');
        }

        function runSmartFormat() {
            const editor = document.getElementById('resultBox');
            // 获取纯文本
            let text = getResultBoxPlainText(editor).trim();
            if (!text) { Toast.warn('正文内容为空，无需排版'); return; }

            const formatted = applyParagraphIndent(text, 2, true);
            writePlainTextToResultBox(formatted, { saveChapter: true, dispatchInput: true });

            Toast.success('排版完成');
        }

        function openManualFormatModal() {
            const editor = document.getElementById('resultBox');
            if (!editor) return;
            document.getElementById('manualFontSize').value = editor.style.fontSize || '16px';
            document.getElementById('manualTextColor').value = rgbToHex(editor.style.color || getComputedStyle(editor).color || '#1e1e28');
            document.getElementById('manualLineHeight').value = editor.style.lineHeight || '1.8';
            document.getElementById('manualIndentSpaces').value = '0';
            document.getElementById('manualNormalizeParagraphs').checked = false;
            Modal.open('manualFormatModal');
        }

        function rgbToHex(value) {
            if (!value) return '#1e1e28';
            if (value[0] === '#') return value;
            const m = String(value).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
            if (!m) return '#1e1e28';
            return '#' + [m[1], m[2], m[3]].map(function(n) {
                return Number(n).toString(16).padStart(2, '0');
            }).join('');
        }

        function applyManualFormat(reset) {
            const editor = document.getElementById('resultBox');
            if (!editor) return;
            if (reset) {
                editor.style.fontSize = '';
                editor.style.color = '';
                editor.style.lineHeight = '';
                Toast.success('已恢复默认排版');
                Modal.close('manualFormatModal');
                return;
            }
            editor.style.fontSize = document.getElementById('manualFontSize').value || '16px';
            editor.style.color = document.getElementById('manualTextColor').value || '#1e1e28';
            editor.style.lineHeight = document.getElementById('manualLineHeight').value || '1.8';
            const indentSpaces = parseInt(document.getElementById('manualIndentSpaces').value, 10) || 0;
            const normalizeParagraphs = !!document.getElementById('manualNormalizeParagraphs').checked;
            if (indentSpaces > 0 || normalizeParagraphs) {
                const formatted = applyParagraphIndent(getResultBoxPlainText(editor), indentSpaces, normalizeParagraphs);
                if (formatted) {
                    writePlainTextToResultBox(formatted, { saveChapter: true, dispatchInput: true });
                }
            }
            Toast.success('手动排版已应用');
            Modal.close('manualFormatModal');
        }

        document.getElementById('btnAutoFormatSmart')?.addEventListener('click', runSmartFormat);
        document.getElementById('btnManualFormatOpen')?.addEventListener('click', openManualFormatModal);
        document.getElementById('btnManualFormatApply')?.addEventListener('click', function() { applyManualFormat(false); });
        document.getElementById('btnManualFormatReset')?.addEventListener('click', function() { applyManualFormat(true); });


    window.updateChapterTitleBar = updateChapterTitleBar;
    window.splitNovelSentences = splitNovelSentences;
    window.isDialogueSentence = isDialogueSentence;
    window.splitDenseNovelParagraph = splitDenseNovelParagraph;
    window.applyParagraphIndent = applyParagraphIndent;
    window.runSmartFormat = runSmartFormat;
    window.openManualFormatModal = openManualFormatModal;
    window.rgbToHex = rgbToHex;
    window.applyManualFormat = applyManualFormat;
    window.ZHIYU_TEXT_FORMATTING_READY = true;
})(window);
