(function(window) {
    'use strict';

        let chapterResponseTimerId = null;

        function genTaskKey(book,vi,ci){ return `${book}_$${vi}_$${ci}`; }

        function clearChapterResponseTimer() {
            if (chapterResponseTimerId) {
                clearTimeout(chapterResponseTimerId);
                chapterResponseTimerId = null;
            }
        }

        function startChapterResponseTimer(timeoutMs, onTimeout) {
            clearChapterResponseTimer();
            chapterResponseTimerId = setTimeout(function() {
                chapterResponseTimerId = null;
                if (typeof onTimeout === 'function') onTimeout();
            }, timeoutMs);
        }

        function isCurrentlyGeneratingChapter(bookName, vi, ci) {
            return !!window.generationTasks?.[genTaskKey(bookName, vi, ci)];
        }

        function updateGeneratingStatus(bookName, vi, ci) {
            const statusEl = document.getElementById('generatingStatus');
            const chapterNameEl = document.getElementById('generatingChapterName');

            if (bookName && vi !== undefined && ci !== undefined) {
                const books = gB();
                const book = books[bookName];
                if (book && book.volumes[vi] && book.volumes[vi].chapters[ci]) {
                    const ch = book.volumes[vi].chapters[ci];
                    if (chapterNameEl) chapterNameEl.textContent = ch.name;
                    if (statusEl) statusEl.style.display = 'inline';
                }
            } else {
                if (statusEl) statusEl.style.display = 'none';
                if (chapterNameEl) chapterNameEl.textContent = '-';
            }
        }

        function isSameChapterLocation(bookName, vi, ci) {
            const current = window.AppState?.chapter;
            return current?.book === bookName
                && String(current?.vi) === String(vi)
                && String(current?.ci) === String(ci);
        }

        function resetChapterGenerationEditor(resultBox) {
            if (!resultBox) return;
            resultBox.classList?.remove('chapter-generation-preflight');
            resultBox.setAttribute('aria-busy', 'false');
            resultBox.style.background = '';
            resultBox.setAttribute('contenteditable', 'true');
        }

        function restoreChapterGenerationUI(bookName, vi, ci, resultBox) {
            const isCurrentChapter = isSameChapterLocation(bookName, vi, ci);
            if (isCurrentChapter && resultBox) {
                resetChapterGenerationEditor(resultBox);
            }
            updateGeneratingStatus(null);
            const btnStop = document.getElementById('btnStop');
            if (btnStop) {
                btnStop.disabled = true;
                btnStop.textContent = '暂未生成';
            }
            const btnGen = document.getElementById('btnGen');
            if (btnGen) btnGen.disabled = false;
            window.updateChapterComposerState?.();
        }

        function finalizeChapterGenerationAttempt(bookName, vi, ci, resultBox) {
            const taskKey = genTaskKey(bookName, vi, ci);
            clearChapterResponseTimer();
            try {
                markChapterGenerating(bookName, vi, ci, false);
            } catch (error) {
                console.warn('正文生成章节标记清理失败。', error);
            }
            try {
                window.setChapterStep?.('', false);
            } catch (error) {
                console.warn('正文生成步骤状态清理失败。', error);
            }
            if (window.generationTasks?.[taskKey]) delete window.generationTasks[taskKey];
            try {
                restoreChapterGenerationUI(bookName, vi, ci, resultBox);
            } catch (error) {
                console.warn('正文生成界面恢复失败，已执行兜底清理。', error);
                const isCurrentChapter = isSameChapterLocation(bookName, vi, ci);
                if (isCurrentChapter && resultBox) {
                    resetChapterGenerationEditor(resultBox);
                }
                const btnStop = document.getElementById('btnStop');
                if (btnStop) {
                    btnStop.disabled = true;
                    btnStop.textContent = '暂未生成';
                }
                const btnGen = document.getElementById('btnGen');
                if (btnGen) btnGen.disabled = false;
            }
        }

        function disableConfirmUseUntilGenerated() {
            const btn = document.getElementById('btnConfirm');
            if (!btn) return;
            if (typeof window.resetConfirmUseVisual === 'function') {
                window.resetConfirmUseVisual(btn);
            }
            btn.textContent = '确定使用';
            btn.disabled = true;
            btn.title = '正文生成成功后才能确定使用';
            btn.dataset.confirmUseState = 'idle';
        }


        function markChapterGenerating(bookName,vi,ci,isGenerating){
            const tree=document.getElementById('treeContent');
            if (!tree) return;
            const items=tree.querySelectorAll('.chapter-item');
            let index=0;
            const books=gB();
            if(!books[bookName])return;
            for(let v=0;v<vi;v++) index+=books[bookName].volumes[v].chapters.length;
            index+=ci;
            if(items[index]){
                if(isGenerating){
                    items[index].style.background='var(--chapter-generation-highlight)';
                    const dot = items[index].querySelector('.ch-status-dot');
                    if(dot){ dot.style.display='inline'; dot.style.color='#2196f3'; dot.textContent='●'; }
                }else{
                    items[index].style.background='';
                    const dot = items[index].querySelector('.ch-status-dot');
                    if(dot) {
                        const hasWords = !!items[index].querySelector('.chapter-word-count')?.textContent.trim();
                        dot.style.display = hasWords ? 'inline' : 'none';
                        dot.style.color = '#27ae60';
                    }
                }
            }
        }

        function finishChapterGen(bookName, vi, ci, content, stepLog, resultBox, regenerationSnapshot) {
            let cleanContent = content;
            cleanContent = cleanContent.replace(/^#?\s*第[一二三四五六七八九十百千\d]+章[^\n]*\n*/, '');
            cleanContent = cleanContent.replace(/\n?---+\s*\n?\(?（?本章完\)?）?\s*$/g, '');
            cleanContent = cleanContent.trim();
            const bks = gB();
            const genCh = window.applyChapterRegenerationContent?.(regenerationSnapshot, cleanContent)
                || bks[bookName]?.volumes[vi]?.chapters[ci];
            const isActiveChapter = AppState.chapter.book === bookName
                && AppState.chapter.vi === vi
                && AppState.chapter.ci === ci;
            if (isActiveChapter && resultBox) {
                if (typeof window.ZhiyuEditorAdapter?.replaceContent === 'function') {
                    window.ZhiyuEditorAdapter.replaceContent(resultBox, cleanContent);
                } else {
                    resultBox.textContent = cleanContent;
                }
            }
            if (genCh) {
                if (!regenerationSnapshot) genCh.content = cleanContent;
                window.ZhiyuEditorAdapter?.applyContentMetadata?.(genCh, cleanContent, isActiveChapter ? resultBox : null);
                window.clearChapterContentClearState?.(genCh, cleanContent, bookName, vi, ci);
            }

            if (isActiveChapter && resultBox) {
                resultBox.style.background = '';
                resultBox.setAttribute('contenteditable', 'true');
            }
            let ttl = 0; bks[bookName].volumes.forEach(v => v.chapters.forEach(c => ttl += (c.content || '').length));
            document.getElementById('totalWordCount').textContent = ttl;
            const resolvedTarget = Number(window.getLastChapterGenerationCallSpec?.()?.currentInput?.wordTarget || 0);
            updateWordProgress(content.length, resolvedTarget);
            const fillDone = document.getElementById('streamProgressFill'); if (fillDone) fillDone.style.width = '100%';
            Utils.appendLog(null, '✅ 生成完成（前端直连）', 'success');
            updateGeneratingStatus(null);
            document.getElementById('btnStop').disabled = true;
            document.getElementById('btnStop').textContent = '暂未生成';
            document.getElementById('btnGen').disabled = false;
            window.updateChapterComposerState?.();
            const copyBtn = document.getElementById('btnCopy');
            if (copyBtn) copyBtn.disabled = false;
            setConfirmUseState('ready');
            markChapterGenerating(bookName, vi, ci, false);
            const taskKey = genTaskKey(bookName, vi, ci);
            if (window.generationTasks[taskKey]) delete window.generationTasks[taskKey];
        }


    window.genTaskKey = genTaskKey;
    window.clearChapterResponseTimer = clearChapterResponseTimer;
    window.startChapterResponseTimer = startChapterResponseTimer;
    window.clearResponseTimer = clearChapterResponseTimer;
    window.startResponseTimer = startChapterResponseTimer;
    window.isCurrentlyGeneratingChapter = isCurrentlyGeneratingChapter;
    window.updateGeneratingStatus = updateGeneratingStatus;
    window.restoreChapterGenerationUI = restoreChapterGenerationUI;
    window.finalizeChapterGenerationAttempt = finalizeChapterGenerationAttempt;
    window.disableConfirmUseUntilGenerated = disableConfirmUseUntilGenerated;
    window.markChapterGenerating = markChapterGenerating;
    window.finishChapterGen = finishChapterGen;
    window.ZHIYU_GENERATION_STATUS_READY = true;
})(window);
