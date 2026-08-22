// Word count and editor text conversion helpers split from app-main.js.
// This module keeps the original counting behavior and does not change generation or save flows.
(function(window) {
  'use strict';

  const AppState = window.ZHIYU_APP_STATE || {};
  const StorageService = window.ZHIYU_STORAGE_SERVICE;
  const Utils = window.ZHIYU_UTILS || {
    escapeHtml(text) {
      return String(text || '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[ch]));
    },
    debounce(fn) {
      return fn;
    }
  };
  const Toast = window.ZHIYU_TOAST || { success() {} };
  const gB = window.gB || function() { return StorageService ? StorageService.getBooks() : {}; };
  const sB = window.sB || function(books) { if (StorageService) StorageService.saveBooks(books); };

function updateWordCount(book,name){
    if (!book || typeof book !== 'object') return 0;
    let wc=0;
    (Array.isArray(book.volumes) ? book.volumes : []).forEach(function(volume) {
        if (!volume || !Array.isArray(volume.chapters)) return;
        volume.chapters.forEach(function(chapter) {
            if (!chapter || typeof chapter !== 'object') return;
            wc += countWords(chapter.content || '');
        });
    });
    book.wordCount=wc;
    if(name){
        let b=StorageService.getBooks();
        if(b[name]){
            b[name].wordCount=wc;
            StorageService.saveBooks(b);
        }
    }
    return wc;
}

// 字数目标进度条
let _wordTargetReached = false;
// ===== 字数统计（支持切换：纯字 / 含标点）=====
let _wordCountIncludePunctuation = false;
try { _wordCountIncludePunctuation = localStorage.getItem('zhiyu_word_count_mode') === 'punct'; } catch(e) {}

function _isWordCharacterCode(code) {
    return (code >= 0x4e00 && code <= 0x9fff)
        || (code >= 0x3400 && code <= 0x4dbf)
        || code === 0x3005
        || code === 0x3006
        || code === 0x3007
        || (code >= 0x30 && code <= 0x39)
        || (code >= 0x41 && code <= 0x5a)
        || (code >= 0x61 && code <= 0x7a);
}

function _isWhitespaceCode(code) {
    return (code >= 0x09 && code <= 0x0d)
        || code === 0x20
        || code === 0xa0
        || code === 0x1680
        || (code >= 0x2000 && code <= 0x200a)
        || code === 0x2028
        || code === 0x2029
        || code === 0x202f
        || code === 0x205f
        || code === 0x3000
        || code === 0xfeff;
}

function countWords(text) {
    if (!text) return 0;
    const value = String(text);
    let count = 0;
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index);
        if (code === 0x3c) {
            const closeIndex = value.indexOf('>', index + 1);
            if (closeIndex > index + 1) {
                index = closeIndex;
                continue;
            }
        }
        if (code === 0x26 && value.startsWith('&nbsp;', index)) {
            index += 5;
            continue;
        }
        if (_wordCountIncludePunctuation) {
            if (!_isWhitespaceCode(code)) count += 1;
        } else if (_isWordCharacterCode(code)) {
            count += 1;
        }
    }
    return count;
}

function countChineseWords(text) {
    const value = String(text || '');
    const chinese = (value.match(/[一-鿿]/g) || []).length;
    const english = (value.match(/[a-zA-Z]+/g) || []).reduce((sum, word) => sum + word.length, 0);
    return chinese + english;
}

function isChapterPlaceholderContent(content) {
    const text = String(content || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    return text === '[正在生成中，请稍候...]' || text === '点击左侧章节查看内容，或生成新章节...';
}

function getChapterContentPlainText(content) {
    return String(content || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(?:p|div|h[1-6]|li|tr)>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function isBlankChapterContent(content) {
    return !getChapterContentPlainText(content);
}

function wouldBlankOverwriteExisting(nextContent, savedContent, allowBlank) {
    return !allowBlank && isBlankChapterContent(nextContent) && !isBlankChapterContent(savedContent || '');
}

function updateCurrentChapterListWordCount(content) {
    const s = AppState.chapter;
    if (!s || s.vi < 0 || s.ci < 0) return;
    const item = document.querySelector('#treeContent .chapter-item[data-vi="' + s.vi + '"][data-ci="' + s.ci + '"]');
    const el = item?.querySelector('.chapter-word-count');
    if (!el) return;
    const count = countWords(content || '');
    el.textContent = count > 0 ? count.toLocaleString() : '';
}

function getResultBoxPlainText(editor) {
    if (!editor) editor = document.getElementById('resultBox');
    if (!editor) return '';
    const editorAdapter = window.ZhiyuEditorAdapter;
    if (editorAdapter?.getState?.(editor)) {
        return editorAdapter.getPayload(editor).plainText;
    }
    function walk(node) {
        if (!node) return '';
        if (node.nodeType === 3) return node.textContent || '';
        if (node.nodeType !== 1) return '';
        const tag = node.tagName.toLowerCase();
        if (tag === 'br') return '\n';
        const content = Array.from(node.childNodes).map(walk).join('');
        if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'li', 'tr'].includes(tag)) {
            return content + '\n';
        }
        return content;
    }
    return walk(editor)
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n');
}

function plainTextToEditorHTML(text) {
    const normalized = String(text || '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\u2028|\u2029/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/^\n+|\n+$/g, '');
    if (!normalized) return '';
    return normalized.split('\n').map(function(line) {
        return line ? '<div>' + Utils.escapeHtml(line) + '</div>' : '<div><br></div>';
    }).join('');
}

function updateChapWordCount(text) {
    const el = document.getElementById('chapWordCount');
    const modeEl = document.getElementById('wordCountMode');
    const count = countWords(text);
    if (el) el.textContent = count;
    if (modeEl) modeEl.textContent = _wordCountIncludePunctuation ? '含标点' : '纯字';
}

function _toggleWordCountMode() {
    _wordCountIncludePunctuation = !_wordCountIncludePunctuation;
    localStorage.setItem('zhiyu_word_count_mode', _wordCountIncludePunctuation ? 'punct' : 'text');
    // 重新计算当前编辑器内容
    const resultBox = document.getElementById('resultBox');
    const text = resultBox ? (resultBox.innerHTML || '') : '';
    updateChapWordCount(text);
}

(function _bindWordCountToggle() {
    const el = document.getElementById('chapWordCount');
    if (el) el.addEventListener('click', _toggleWordCountMode);
})();

function updateWordProgress(current, target) {
    const bar = document.getElementById('wordProgressBar');
    const fill = document.getElementById('wordProgressFill');
    if (target > 0) {
        bar.style.display = 'block';
        const pct = Math.min(100, Math.round((current / target) * 100));
        fill.style.width = pct + '%';
        fill.style.background = pct >= 100 ? '#4caf50' : pct >= 70 ? '#2196f3' : '#ff9800';
        if (pct >= 100 && !_wordTargetReached && current > 0) {
            _wordTargetReached = true;
            Toast.success('🎯 已达到字数目标 ' + target + ' 字！');
        }
        if (pct < 100) _wordTargetReached = false;
    } else {
        bar.style.display = 'none';
        _wordTargetReached = false;
    }
}

  window.updateWordCount = updateWordCount;
  window.countWords = countWords;
  window.countChineseWords = countChineseWords;
  window.isChapterPlaceholderContent = isChapterPlaceholderContent;
  window.getChapterContentPlainText = getChapterContentPlainText;
  window.isBlankChapterContent = isBlankChapterContent;
  window.wouldBlankOverwriteExisting = wouldBlankOverwriteExisting;
  window.updateCurrentChapterListWordCount = updateCurrentChapterListWordCount;
  window.getResultBoxPlainText = getResultBoxPlainText;
  window.plainTextToEditorHTML = plainTextToEditorHTML;
  window.updateChapWordCount = updateChapWordCount;
  window.updateWordProgress = updateWordProgress;
  window.ZHIYU_WORD_COUNT_READY = true;
})(window);
