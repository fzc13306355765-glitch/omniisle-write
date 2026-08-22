(function(window, document) {
    'use strict';

    const AppState = window.ZHIYU_APP_STATE || window.AppState || {};
    const Toast = window.ZHIYU_TOAST || window.Toast || { warn() {}, success() {}, error() {} };
    const Modal = window.ZHIYU_MODAL || window.Modal || { open() {}, close() {} };
    const Utils = window.ZHIYU_UTILS || window.Utils || {};

    let summaryContext = null;
    let quickTitleContext = null;
    let selectedQuickTitle = '';
    let quickTitleCandidates = [];
    let quickTitlePage = 0;
    const QUICK_TITLE_PAGE_SIZE = 8;

    function getBooks() {
        return typeof window.gB === 'function' ? window.gB() : {};
    }

    function saveBooks(books) {
        if (typeof window.sB === 'function') window.sB(books);
    }

    function getMemBooks() {
        return typeof window.getMemBooks === 'function' ? window.getMemBooks() : {};
    }

    function saveMemBooks(memBooks) {
        if (typeof window.sMB === 'function') window.sMB(memBooks);
    }

    function getChapterPlainText(chapter) {
        const raw = chapter?.content || '';
        if (typeof window.htmlToAIPolishPlainText === 'function') return window.htmlToAIPolishPlainText(raw).trim();
        if (typeof window.getChapterContentPlainText === 'function') return window.getChapterContentPlainText(raw).trim();
        const div = document.createElement('div');
        div.innerHTML = raw;
        return (div.innerText || div.textContent || raw || '').trim();
    }

    function getCurrentChapterContext() {
        const state = AppState.chapter || {};
        const books = getBooks();
        const book = books[state.book];
        const chapter = book?.volumes?.[state.vi]?.chapters?.[state.ci];
        if (!book || !chapter || state.vi < 0 || state.ci < 0) return null;
        const localId = window.ensureChapterLocalId?.(chapter) || chapter._localId || '';
        if (localId && !window.isChapterLocalIdPersisted?.(localId)) saveBooks(books);
        return {
            bookName: state.book,
            vi: state.vi,
            ci: state.ci,
            localId,
            chapterNum: typeof window.calculateChapterNumber === 'function' ? window.calculateChapterNumber(book, state.vi, state.ci) : state.ci + 1,
            chapterName: chapter.name || ('第' + (state.ci + 1) + '章')
        };
    }

    function findChapterByContext(context) {
        if (!context) return null;
        const books = getBooks();
        if (context.localId && typeof window.findChapterLocationByLocalId === 'function') {
            const found = window.findChapterLocationByLocalId(books, context.localId, context.bookName);
            if (found?.chapter) {
                return {
                    books,
                    book: books[found.book || context.bookName],
                    chapter: found.chapter,
                    bookName: found.book || context.bookName,
                    vi: found.vi,
                    ci: found.ci
                };
            }
        }
        const book = books[context.bookName];
        const chapter = book?.volumes?.[context.vi]?.chapters?.[context.ci];
        if (!book || !chapter) return null;
        return { books, book, chapter, bookName: context.bookName, vi: context.vi, ci: context.ci };
    }

    function getNormalModelCandidates() {
        const selected = window.getSelectedModelConfig?.();
        return selected?.base && selected?.model ? [selected] : [];
    }

    function getNormalModelConfig() {
        return getNormalModelCandidates()[0];
    }

    async function callNormalAi(systemPrompt, userMessage, feature) {
        if (typeof window.callLLMAPI !== 'function') throw new Error('AI调用模块未加载');
        const candidates = getNormalModelCandidates();
        let lastError = null;
        for (let index = 0; index < candidates.length; index += 1) {
            const modelCfg = candidates[index];
            try {
                const resp = await window.callLLMAPI(
                    { key: '', base: '', model: '' },
                    systemPrompt,
                    userMessage,
                    modelCfg,
                    { feature }
                );
                const text = resp?.content?.[0]?.text || '';
                if (String(text).trim()) return text;
                const emptyError = new Error('AI 未返回内容');
                emptyError.code = 'EMPTY_RESPONSE';
                throw emptyError;
            } catch (error) {
                if (window.isAbortLikeError?.(error) || window.isAuthExpiredError?.(error)) throw error;
                lastError = error;
                const retryable = typeof window.shouldRetryMemoryAnalysis === 'function'
                    && window.shouldRetryMemoryAnalysis(error);
                if (!retryable || index >= candidates.length - 1) throw error;
            }
        }
        throw lastError || new Error('普通模型调用失败');
    }

    function getChapterSummaryFolderName(vi) {
        return '章节概要-第' + (Number(vi) + 1) + '卷';
    }

    function getChapterSummaryFileName(context) {
        return '第' + (Number(context.vi) + 1) + '卷_第' + context.chapterNum + '章_章节概要';
    }

    function findSavedChapterSummary(context) {
        const memBooks = getMemBooks();
        const folderName = getChapterSummaryFolderName(context.vi);
        const files = memBooks?.[context.bookName]?.[folderName] || [];
        const fileName = getChapterSummaryFileName(context);
        return files.find(function(file) {
            return file?.chapterLocalId && context.localId
                ? file.chapterLocalId === context.localId
                : file?.name === fileName;
        }) || null;
    }

    function saveChapterSummary(context, content) {
        const located = findChapterByContext(context);
        if (!located) throw new Error('原章节不存在，无法保存概要');
        const memBooks = getMemBooks();
        if (!memBooks[context.bookName]) window.ensureMemBook?.(context.bookName);
        const latestMemBooks = getMemBooks();
        if (!latestMemBooks[context.bookName]) latestMemBooks[context.bookName] = { '默认文件夹': [] };
        const folderName = getChapterSummaryFolderName(located.vi);
        if (!Array.isArray(latestMemBooks[context.bookName][folderName])) latestMemBooks[context.bookName][folderName] = [];
        const files = latestMemBooks[context.bookName][folderName];
        const nextContext = Object.assign({}, context, {
            vi: located.vi,
            ci: located.ci,
            chapterName: located.chapter.name,
            chapterNum: typeof window.calculateChapterNumber === 'function'
                ? window.calculateChapterNumber(located.book, located.vi, located.ci)
                : located.ci + 1
        });
        const fileName = getChapterSummaryFileName(nextContext);
        const now = new Date().toISOString();
        const existing = files.find(function(file) {
            return file?.chapterLocalId && nextContext.localId
                ? file.chapterLocalId === nextContext.localId
                : file?.name === fileName;
        });
        const payload = {
            name: fileName,
            content: content,
            type: 'chapterSummary',
            chapterLocalId: nextContext.localId || '',
            vi: nextContext.vi,
            ci: nextContext.ci,
            chapterNum: nextContext.chapterNum,
            chapterName: nextContext.chapterName,
            updatedAt: now
        };
        if (existing) Object.assign(existing, payload);
        else files.push(Object.assign({ createdAt: now }, payload));
        saveMemBooks(latestMemBooks);
        window.renderMemFolderSidebar?.();
        window.renderMemFileList?.();
        window.refreshTree?.();
        return payload;
    }

    function openChapterSummaryModal(context) {
        const ctx = context || getCurrentChapterContext();
        if (!ctx) { Toast.warn('请先选择一个正式章节'); return; }
        summaryContext = ctx;
        const textarea = document.getElementById('chapterSummaryText');
        const saved = findSavedChapterSummary(ctx);
        if (textarea) {
            textarea.value = saved?.content || '';
            textarea.classList.remove('is-generating');
        }
        Modal.open('chapterSummaryModal');
    }

    async function analyzeChapterSummary() {
        if (!summaryContext) return;
        const located = findChapterByContext(summaryContext);
        if (!located) { Toast.warn('原章节不存在'); return; }
        const chapterText = getChapterPlainText(located.chapter);
        if (chapterText.length < 100) { Toast.warn('当前章节正文不足，无法生成概要'); return; }
        const textarea = document.getElementById('chapterSummaryText');
        const btn = document.getElementById('btnAnalyzeChapterSummary');
        if (textarea) {
            textarea.value = '正在分析章节概要...';
            textarea.classList.add('is-generating');
        }
        if (btn) btn.disabled = true;
        Utils.appendLog?.(null, '正在分析章节概要...', 'progress');
        try {
            const prompt = [
                '当前作品：' + summaryContext.bookName,
                '当前章节：' + summaryContext.chapterName,
                '',
                '【章节正文】',
                chapterText.slice(0, 120000)
            ].join('\n');
            const result = await callNormalAi(
                '请阅读当前章节正文，生成约500字章节概要。重点记录：本章发生的关键剧情、人物行动与关系变化、冲突结果、重要线索、伏笔推进、未解决问题。不要评价文笔，不要扩写，不要改写剧情，只做可供后续创作参考的剧情记录。',
                prompt,
                'chapter_summary'
            );
            const summary = String(result || '').trim();
            if (!summary) {
                const emptyError = new Error('AI 没有返回章节概要，本次生成未完成。');
                emptyError.code = 'AI_EMPTY_RESPONSE';
                throw emptyError;
            }
            if (textarea) textarea.value = summary;
            Utils.appendLog?.(null, '章节概要分析完成', 'success');
        } catch (error) {
            const message = typeof window.formatAiErrorForDisplay === 'function'
                ? window.formatAiErrorForDisplay(error, '章节概要分析失败')
                : String(error?.message || error || '章节概要分析失败');
            Toast.error(message);
            window.Utils?.appendLog?.(null, message, 'error');
            if (textarea) textarea.value = '';
        } finally {
            if (textarea) textarea.classList.remove('is-generating');
            if (btn) btn.disabled = false;
        }
    }

    function confirmSaveChapterSummary() {
        if (!summaryContext) return;
        const text = (document.getElementById('chapterSummaryText')?.value || '').trim();
        if (!text) { Toast.warn('请先生成或填写章节概要'); return; }
        try {
            saveChapterSummary(summaryContext, text);
            Toast.success('章节概要已保存');
            Modal.close('chapterSummaryModal');
        } catch (error) {
            Toast.warn(error?.message || '章节概要保存失败');
        }
    }

    function parseTitleCandidates(raw) {
        return String(raw || '')
            .split(/\n+/)
            .map(function(line) {
                return line.replace(/^\s*[-*•\d.、）)]+/, '').replace(/^《|》$/g, '').trim();
            })
            .filter(Boolean)
            .map(function(title) {
                return title
                    .replace(/[《》]/g, '')
                    .replace(/^第\s*[一二三四五六七八九十百千万\d]+\s*章\s*[:：、.\-—]?\s*/, '')
                    .slice(0, 24)
                    .trim();
            })
            .filter(function(title, index, arr) { return title && arr.indexOf(title) === index; })
            .slice(0, 24);
    }

    function getQuickTitleBodyValidation(text) {
        const source = String(text || '').replace(/\s+/g, ' ').trim();
        const effective = source.match(/[A-Za-z0-9\u3400-\u9fff]/g) || [];
        if (effective.length < 200) {
            return { ok: false, reason: '当前正文不足200个有效文字，无法分析章节名称', effectiveCount: effective.length, sentenceCount: 0 };
        }
        const languageChars = source.match(/[A-Za-z\u3400-\u9fff]/g) || [];
        if (languageChars.length < 120 || languageChars.length / effective.length < 0.55) {
            return { ok: false, reason: '当前内容以数字或无意义字符为主，无法分析章节名称', effectiveCount: effective.length, sentenceCount: 0 };
        }
        const meaningfulSentences = source.split(/[。！？!?]+/).filter(function(sentence) {
            return ((sentence.match(/[A-Za-z0-9\u3400-\u9fff]/g) || []).length >= 8);
        });
        if (meaningfulSentences.length < 3) {
            return { ok: false, reason: '当前正文不足3个完整句子，无法分析章节名称', effectiveCount: effective.length, sentenceCount: meaningfulSentences.length };
        }
        const frequencies = new Map();
        languageChars.forEach(function(char) { frequencies.set(char, (frequencies.get(char) || 0) + 1); });
        const maxRepeat = Math.max.apply(null, Array.from(frequencies.values()));
        if (maxRepeat / languageChars.length > 0.35) {
            return { ok: false, reason: '当前正文重复字符过多，无法可靠分析章节名称', effectiveCount: effective.length, sentenceCount: meaningfulSentences.length };
        }
        return { ok: true, reason: '', effectiveCount: effective.length, sentenceCount: meaningfulSentences.length };
    }

    function getPreviousChapterTitles(located, limit) {
        const result = [];
        for (let vi = located.vi; vi >= 0 && result.length < limit; vi--) {
            const chapters = located.book?.volumes?.[vi]?.chapters || [];
            const start = vi === located.vi ? located.ci - 1 : chapters.length - 1;
            for (let ci = start; ci >= 0 && result.length < limit; ci--) {
                const name = String(chapters[ci]?.name || '').trim();
                if (name) result.push(name);
            }
        }
        return result.reverse();
    }

    function renderQuickTitlePage() {
        const grid = document.getElementById('quickTitleCandidates');
        if (!grid) return;
        grid.innerHTML = '';
        const pagination = document.getElementById('quickTitlePagination');
        if (!quickTitleCandidates.length) {
            grid.innerHTML = '<div class="quick-title-empty">未生成可用名称，请重新生成。</div>';
            if (pagination) pagination.hidden = true;
            return;
        }
        const totalPages = Math.ceil(quickTitleCandidates.length / QUICK_TITLE_PAGE_SIZE);
        quickTitlePage = Math.max(0, Math.min(quickTitlePage, totalPages - 1));
        const start = quickTitlePage * QUICK_TITLE_PAGE_SIZE;
        quickTitleCandidates.slice(start, start + QUICK_TITLE_PAGE_SIZE).forEach(function(title) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'quick-title-option' + (selectedQuickTitle === title ? ' selected' : '');
            btn.title = '选择“' + title + '”作为章节标题';
            btn.textContent = title;
            btn.addEventListener('click', function() {
                selectedQuickTitle = title;
                grid.querySelectorAll('.quick-title-option').forEach(function(item) { item.classList.remove('selected'); });
                btn.classList.add('selected');
            });
            grid.appendChild(btn);
        });
        if (pagination) pagination.hidden = false;
        const pageText = document.getElementById('quickTitlePageText');
        if (pageText) pageText.textContent = '第 ' + (quickTitlePage + 1) + ' / ' + totalPages + ' 页';
        const prev = document.getElementById('btnQuickTitlePrev');
        const next = document.getElementById('btnQuickTitleNext');
        if (prev) prev.disabled = quickTitlePage === 0;
        if (next) next.disabled = quickTitlePage >= totalPages - 1;
    }

    function setQuickTitleCandidates(list) {
        quickTitleCandidates = Array.isArray(list) ? list.slice(0, 24) : [];
        quickTitlePage = 0;
        selectedQuickTitle = '';
        renderQuickTitlePage();
    }

    async function callQuickTitleAi(systemPrompt, userMessage) {
        if (typeof window.callLLMAPI !== 'function') throw new Error('AI调用模块未加载');
        const candidates = getNormalModelCandidates();
        let lastError = null;
        for (let index = 0; index < candidates.length; index += 1) {
            const modelCfg = candidates[index];
            try {
                const response = await window.callLLMAPI(
                    { key: '', base: '', model: '' },
                    systemPrompt,
                    userMessage,
                    modelCfg,
                    { feature: 'quick_title' }
                );
                const text = response?.content?.[0]?.text || '';
                if (String(text).trim()) return { text, modelCfg };
                const emptyError = new Error('AI 未返回内容');
                emptyError.code = 'EMPTY_RESPONSE';
                throw emptyError;
            } catch (error) {
                if (window.isAbortLikeError?.(error) || window.isAuthExpiredError?.(error)) throw error;
                lastError = error;
                const retryable = typeof window.shouldRetryMemoryAnalysis === 'function'
                    && window.shouldRetryMemoryAnalysis(error);
                if (!retryable || index >= candidates.length - 1) throw error;
            }
        }
        throw lastError || new Error('快速取名失败');
    }

    async function generateQuickTitles() {
        if (!quickTitleContext) return;
        const located = findChapterByContext(quickTitleContext);
        if (!located) { Toast.warn('原章节不存在'); return; }
        const chapterText = getChapterPlainText(located.chapter);
        const validation = getQuickTitleBodyValidation(chapterText);
        if (!validation.ok) { Toast.warn(validation.reason); return; }
        const grid = document.getElementById('quickTitleCandidates');
        const btn = document.getElementById('btnRegenerateQuickTitle');
        if (grid) grid.innerHTML = '<div class="quick-title-empty">正在生成候选名称...</div>';
        if (btn) btn.disabled = true;
        Utils.appendLog?.(null, '正在生成章节标题候选...', 'progress');
        try {
            const previousTitles = getPreviousChapterTitles(located, 5);
            const prompt = [
                '当前章节名：' + quickTitleContext.chapterName,
                '前面最多5章标题：' + (previousTitles.length ? previousTitles.join('｜') : '无'),
                '',
                '【章节正文】',
                chapterText.slice(0, 80000)
            ].join('\n');
            const call = await callQuickTitleAi(
                '请严格参考前面最多5章的标题风格和当前章节正文，一次给出24个中文章节标题候选。标题必须贴地气、直白、像常见网文章节名，不要文艺、华丽、抽象，不要剧透后续。不要编号，不要解释，每行一个标题。',
                prompt
            );
            const candidates = parseTitleCandidates(call.text);
            if (!candidates.length) {
                const emptyError = new Error('AI 没有返回有效章节标题，本次生成未完成且不会按成功结果结算。');
                emptyError.code = 'QUICK_TITLE_EMPTY_RESPONSE';
                throw emptyError;
            }
            Utils.appendLog?.(null, '快速取名完成：共 ' + candidates.length + ' 个有效标题。', 'success');
            setQuickTitleCandidates(candidates);
        } catch (error) {
            const message = typeof window.formatAiErrorForDisplay === 'function'
                ? window.formatAiErrorForDisplay(error, '快速取名失败')
                : String(error?.message || error || '快速取名失败');
            Toast.error(message);
            window.Utils?.appendLog?.(null, message, 'error');
            setQuickTitleCandidates([]);
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    function openQuickTitleModal() {
        const ctx = getCurrentChapterContext();
        if (!ctx) { Toast.warn('请先选择一个正式章节'); return; }
        quickTitleContext = ctx;
        selectedQuickTitle = '';
        quickTitleCandidates = [];
        quickTitlePage = 0;
        const grid = document.getElementById('quickTitleCandidates');
        const generateBtn = document.getElementById('btnRegenerateQuickTitle');
        if (grid) grid.innerHTML = '<div class="quick-title-empty">点击“生成”后获取章节标题候选。</div>';
        const pagination = document.getElementById('quickTitlePagination');
        if (pagination) pagination.hidden = true;
        if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.textContent = '生成';
        }
        Modal.open('quickTitleModal');
    }

    function confirmQuickTitle() {
        if (!quickTitleContext) return;
        if (!selectedQuickTitle) { Toast.warn('请先选择一个标题'); return; }
        const located = findChapterByContext(quickTitleContext);
        if (!located) { Toast.warn('原章节不存在，无法重命名'); return; }
        const chapterNum = typeof window.calculateChapterNumber === 'function'
            ? window.calculateChapterNumber(located.book, located.vi, located.ci)
            : located.ci + 1;
        located.chapter.name = '第' + chapterNum + '章 ' + selectedQuickTitle;
        saveBooks(located.books);
        Toast.success('章节已重命名');
        Modal.close('quickTitleModal');
        window.refreshTree?.({ scrollToChapterVi: located.vi, scrollToChapterCi: located.ci });
        if (AppState.chapter?.book === located.bookName && AppState.chapter?.vi === located.vi && AppState.chapter?.ci === located.ci) {
            document.getElementById('editingChapterName').textContent = located.chapter.name;
            window.updateChapterTitleBar?.();
        }
    }

    function ensureChapterMain(item) {
        if (!item || item.querySelector(':scope > .chapter-item-main')) return;
        const main = document.createElement('div');
        main.className = 'chapter-item-main';
        while (item.firstChild) main.appendChild(item.firstChild);
        item.appendChild(main);
    }

    function renderSelectedChapterActions() {
        document.querySelectorAll('#treeContent .chapter-card-actions').forEach(function(node) { node.remove(); });
        document.querySelectorAll('#treeContent .chapter-item.has-card-actions').forEach(function(node) { node.classList.remove('has-card-actions'); });
        let selected = document.querySelector('#treeContent .chapter-item.selected[data-vi][data-ci]');
        if (!selected && AppState.chapter?.book && Number(AppState.chapter.vi) >= 0 && Number(AppState.chapter.ci) >= 0) {
            selected = document.querySelector('#treeContent .chapter-item[data-vi="' + AppState.chapter.vi + '"][data-ci="' + AppState.chapter.ci + '"]');
            if (selected) selected.classList.add('selected');
        }
        if (!selected) return;
        if (Number(selected.dataset.vi) < 0 || Number(selected.dataset.ci) < 0) return;
        const isGenerating = typeof window.isCurrentlyGeneratingChapter === 'function'
            && window.isCurrentlyGeneratingChapter(AppState.chapter?.book, Number(selected.dataset.vi), Number(selected.dataset.ci));
        selected.classList.toggle('generation-target', !!isGenerating);
        ensureChapterMain(selected);
        selected.classList.add('has-card-actions');
        const actions = document.createElement('div');
        actions.className = 'chapter-card-actions';
        const summaryBtn = document.createElement('button');
        summaryBtn.type = 'button';
        summaryBtn.textContent = '总结概要';
        summaryBtn.title = '分析当前章节，生成可供后续参考的章节概要';
        summaryBtn.addEventListener('click', function(event) {
            event.stopPropagation();
            openChapterSummaryModal();
        });
        const titleBtn = document.createElement('button');
        titleBtn.type = 'button';
        titleBtn.textContent = '快速取名';
        titleBtn.title = '根据当前章节正文生成章节标题候选';
        titleBtn.addEventListener('click', function(event) {
            event.stopPropagation();
            openQuickTitleModal();
        });
        actions.append(summaryBtn, titleBtn);
        selected.appendChild(actions);
    }

    function bindChapterSummaryTitleUi() {
        document.getElementById('btnCloseChapterSummary')?.addEventListener('click', function() { Modal.close('chapterSummaryModal'); });
        document.getElementById('btnAnalyzeChapterSummary')?.addEventListener('click', analyzeChapterSummary);
        document.getElementById('btnSaveChapterSummary')?.addEventListener('click', confirmSaveChapterSummary);
        document.getElementById('btnCloseQuickTitle')?.addEventListener('click', function() { Modal.close('quickTitleModal'); });
        document.getElementById('btnRegenerateQuickTitle')?.addEventListener('click', generateQuickTitles);
        document.getElementById('btnQuickTitlePrev')?.addEventListener('click', function() {
            if (quickTitlePage > 0) { quickTitlePage -= 1; renderQuickTitlePage(); }
        });
        document.getElementById('btnQuickTitleNext')?.addEventListener('click', function() {
            if ((quickTitlePage + 1) * QUICK_TITLE_PAGE_SIZE < quickTitleCandidates.length) { quickTitlePage += 1; renderQuickTitlePage(); }
        });
        document.getElementById('btnConfirmQuickTitle')?.addEventListener('click', confirmQuickTitle);
        document.getElementById('treeContent')?.addEventListener('click', function(event) {
            if (event.target.closest('.chapter-item')) setTimeout(renderSelectedChapterActions, 0);
        });
        setTimeout(renderSelectedChapterActions, 0);
    }

    window.openChapterSummaryModal = openChapterSummaryModal;
    window.saveChapterSummary = saveChapterSummary;
    window.findSavedChapterSummary = findSavedChapterSummary;
    window.openQuickTitleModal = openQuickTitleModal;
    window.generateQuickTitles = generateQuickTitles;
    window.getQuickTitleBodyValidation = getQuickTitleBodyValidation;
    window.parseQuickTitleCandidates = parseTitleCandidates;
    window.setQuickTitleCandidates = setQuickTitleCandidates;
    window.renderSelectedChapterActions = renderSelectedChapterActions;
    window.ZHIYU_CHAPTER_SUMMARY_TITLE_READY = true;
    bindChapterSummaryTitleUi();
})(window, document);
