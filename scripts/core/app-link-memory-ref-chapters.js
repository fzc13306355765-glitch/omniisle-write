(function(window) {
    'use strict';

    const noop = function() {};

    function getUtils() {
        return window.ZHIYU_UTILS || window.Utils || { escapeHtml: function(v) { return String(v || ''); } };
    }

    function getToast() {
        return window.ZHIYU_TOAST || window.Toast || { warn: noop };
    }

    function getAppState() {
        const state = window.ZHIYU_APP_STATE || window.AppState || {};
        if (!state.gen) state.gen = { templateId: '', refChapters: [], linkedFiles: [], plotInput: '' };
        if (!Array.isArray(state.gen.refChapters)) state.gen.refChapters = [];
        if (!Array.isArray(state.gen.refSummaries)) state.gen.refSummaries = [];
        if (!Array.isArray(state.gen.refSummaryCandidates)) state.gen.refSummaryCandidates = [];
        if (!Array.isArray(state.gen.keyEventSummaries)) state.gen.keyEventSummaries = [];
        if (!Array.isArray(state.gen.keyEventSummaryCandidates)) state.gen.keyEventSummaryCandidates = [];
        return state;
    }

    function getCurrentBook(bookName) {
        if (!bookName || typeof window.gB !== 'function') return null;
        const books = window.gB();
        return books ? books[bookName] : null;
    }

    function renderRefChapterListLegacy(bookName) {
        const state = getAppState();
        const book = getCurrentBook(bookName);
        if (!book) return;

        const list = document.getElementById('refChapterList');
        if (!list) return;
        const utils = getUtils();
        list.innerHTML = '';
        let totalCount = 0;
        book.volumes.forEach((vol, vi) => {
            vol.chapters.forEach((ch, ci) => {
                totalCount++;
                const row = document.createElement('div');
                row.className = 'ref-chapter-row';
                row.innerHTML = `<input type="checkbox" data-vi="${vi}" data-ci="${ci}"><span>${utils.escapeHtml(vol.name)} / ${utils.escapeHtml(ch.name)}</span>`;
                list.appendChild(row);
            });
        });

        const topText = document.getElementById('refTopText');
        if (topText) topText.textContent = `已选择: 章节 ${state.gen.refChapters.length} 项 (共 ${totalCount} 项)  最多同时选择 6 项`;

        list.querySelectorAll('input').forEach(cb => {
            const vi = parseInt(cb.dataset.vi, 10);
            const ci = parseInt(cb.dataset.ci, 10);
            if (state.gen.refChapters.some(c => c.vi === vi && c.ci === ci)) {
                cb.checked = true;
            }
            cb.addEventListener('change', function() {
                const checked = list.querySelectorAll('input:checked');
                if (checked.length > 6) {
                    this.checked = false;
                    getToast().warn('最多选择6项');
                    return;
                }
                if (topText) topText.textContent = `已选择: 章节 ${checked.length} 项 (共 ${totalCount} 项)  最多同时选择 6 项`;
                state.gen.refChapters = Array.from(checked).map(c => ({
                    vi: parseInt(c.dataset.vi, 10),
                    ci: parseInt(c.dataset.ci, 10)
                }));
            });
        });

        if (state.gen.refChapters.length > 0) {
            const firstChecked = list.querySelector('input:checked');
            if (firstChecked) firstChecked.closest('.ref-chapter-row')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    }

    function resetGenerationRefChapterSelection() {
        const state = getAppState();
        state.gen.refChapters = [];
        state.gen.refSummaries = [];
        const refCount = document.getElementById('refChapterCount');
        if (refCount) refCount.textContent = '未选择';
        const topText = document.getElementById('refTopText');
        if (topText) topText.textContent = topText.textContent.replace(/已选择:\s*章节\s*\d+\s*项/, '已选择: 章节 0 项');
        document.querySelectorAll('#refChapterList input[type="checkbox"]').forEach(function(cb) {
            cb.checked = false;
        });
    }

    function getRefKey(item) {
        return String(item?.vi) + ':' + String(item?.ci);
    }

    function getChapterIndex(book, vi, ci) {
        return typeof window.calculateChapterNumber === 'function' ? window.calculateChapterNumber(book, vi, ci) : ci + 1;
    }

    function updateRefTopText(topText, state, totalCount) {
        const bodyCount = Array.isArray(state.gen.refChapters) ? state.gen.refChapters.length : 0;
        const summaryCount = Array.isArray(state.gen.refSummaries) ? state.gen.refSummaries.length : 0;
        const keyCount = Array.isArray(state.gen.keyEventSummaries) ? state.gen.keyEventSummaries.length : 0;
        const refCount = document.getElementById('refChapterCount');
        if (refCount) refCount.textContent = `已选择 ${bodyCount + summaryCount + keyCount}`;
        const composerRefCount = document.getElementById('composerRefChapterCount');
        if (composerRefCount) composerRefCount.textContent = `已选择 ${bodyCount + summaryCount + keyCount}`;
        if (topText) {
            topText.textContent = `已选择: 正文 ${bodyCount} 项，概要 ${summaryCount} 项，关键事件概要 ${keyCount} 项 (共 ${totalCount} 章)  正文最多 6 项，关键事件概要最多 5 项`;
        }
    }

    function renderRefChapterListV2(bookName) {
        const state = getAppState();
        const book = getCurrentBook(bookName);
        if (!book) return;
        if (!Array.isArray(state.gen.refSummaries)) state.gen.refSummaries = [];

        const list = document.getElementById('refChapterList');
        if (!list) return;
        const utils = getUtils();
        list.innerHTML = '';
        let totalCount = 0;

        const bodyTitle = document.createElement('div');
        bodyTitle.className = 'ref-section-title';
        bodyTitle.textContent = '参考正文';
        list.appendChild(bodyTitle);

        book.volumes.forEach((vol, vi) => {
            vol.chapters.forEach((ch, ci) => {
                totalCount++;
                const row = document.createElement('div');
                row.className = 'ref-chapter-row';
                row.innerHTML = `<input type="checkbox" class="ref-body-cb" data-vi="${vi}" data-ci="${ci}"><span>${utils.escapeHtml(vol.name)} / ${utils.escapeHtml(ch.name)}</span>`;
                list.appendChild(row);
            });
        });

        const summaryTitle = document.createElement('div');
        summaryTitle.className = 'ref-section-title';
        summaryTitle.textContent = '章节概要参考';
        list.appendChild(summaryTitle);

        const availableSummaries = state.gen.refSummaryCandidates.slice();
        const selectedSummarySet = new Set(state.gen.refSummaries.map(getRefKey));
        if (availableSummaries.length) {
            availableSummaries.forEach(function(ref) {
                const row = document.createElement('div');
                row.className = 'ref-chapter-row ref-summary-row';
                const key = getRefKey(ref);
                row.innerHTML = `<input type="checkbox" class="ref-summary-cb" data-key="${utils.escapeHtml(key)}" ${selectedSummarySet.has(key) ? 'checked' : ''}><span>第${ref.chapterIndex || getChapterIndex(book, ref.vi, ref.ci)}章 / ${utils.escapeHtml(ref.chapterName || '')} 概要</span>`;
                list.appendChild(row);
            });
        } else {
            const empty = document.createElement('div');
            empty.className = 'ref-summary-empty';
            empty.textContent = '暂无可用章节概要；已保存的概要才会作为概要参考。';
            list.appendChild(empty);
        }

        const keyInfo = state.gen.keyEventInfo || {};
        const keyEventIds = Array.isArray(keyInfo.eventIds) ? keyInfo.eventIds : [];
        const keyCandidates = Array.isArray(state.gen.keyEventSummaryCandidates) ? state.gen.keyEventSummaryCandidates : [];
        if (keyEventIds.length || keyCandidates.length) {
            const keyTitle = document.createElement('div');
            keyTitle.className = 'ref-section-title';
            keyTitle.textContent = keyEventIds.length
                ? '关键事件概要：' + keyEventIds.join('、')
                : '关键事件概要';
            list.appendChild(keyTitle);

            if (keyCandidates.length) {
                const selectedKeySet = new Set((state.gen.keyEventSummaries || []).map(getRefKey));
                keyCandidates.forEach(function(ref) {
                    const row = document.createElement('div');
                    const key = getRefKey(ref);
                    const hasSummary = !!String(ref.content || '').trim() && !ref.missingSummary;
                    row.className = 'ref-chapter-row ref-summary-row ref-key-event-row' + (hasSummary ? '' : ' is-missing-summary');
                    row.innerHTML = `
                        <input type="checkbox" class="ref-key-event-cb" data-key="${utils.escapeHtml(key)}" ${hasSummary ? '' : 'disabled'} ${hasSummary && selectedKeySet.has(key) ? 'checked' : ''}>
                        <span>第${ref.chapterIndex || getChapterIndex(book, ref.vi, ref.ci)}章 / ${utils.escapeHtml(ref.chapterName || '')}（${utils.escapeHtml(ref.eventId || '')}）${hasSummary ? '' : ' · 暂无概要'}</span>
                        ${hasSummary ? '' : '<button type="button" class="ref-generate-summary-btn" data-key="' + utils.escapeHtml(key) + '" title="为该章节生成概要">生成概要</button>'}
                    `;
                    list.appendChild(row);
                });
            } else {
                const empty = document.createElement('div');
                empty.className = 'ref-summary-empty';
                empty.textContent = '已检测到关键事件 ID，但没有找到同 ID 的前文章节概要。';
                list.appendChild(empty);
            }
        }

        const topText = document.getElementById('refTopText');

        list.querySelectorAll('.ref-body-cb').forEach(cb => {
            const vi = parseInt(cb.dataset.vi, 10);
            const ci = parseInt(cb.dataset.ci, 10);
            if (state.gen.refChapters.some(c => c.vi === vi && c.ci === ci)) {
                cb.checked = true;
            }
            cb.addEventListener('change', function() {
                const checked = list.querySelectorAll('.ref-body-cb:checked');
                if (checked.length > 6) {
                    this.checked = false;
                    getToast().warn('最多选择 6 项正文参考');
                    return;
                }
                state.gen.refChapters = Array.from(checked).map(c => ({
                    vi: parseInt(c.dataset.vi, 10),
                    ci: parseInt(c.dataset.ci, 10)
                }));
                updateRefTopText(topText, state, totalCount);
            });
        });

        list.querySelectorAll('.ref-summary-cb').forEach(cb => {
            cb.addEventListener('change', function() {
                const keys = new Set(Array.from(list.querySelectorAll('.ref-summary-cb:checked')).map(function(item) {
                    return item.dataset.key;
                }));
                state.gen.refSummaries = availableSummaries.filter(function(ref) {
                    return keys.has(getRefKey(ref));
                });
                updateRefTopText(topText, state, totalCount);
            });
        });

        list.querySelectorAll('.ref-key-event-cb').forEach(cb => {
            cb.addEventListener('change', function() {
                const checked = Array.from(list.querySelectorAll('.ref-key-event-cb:checked'));
                if (checked.length > 5) {
                    this.checked = false;
                    getToast().warn('最多选择 5 个关键事件概要');
                    return;
                }
                const keys = new Set(checked.map(function(item) { return item.dataset.key; }));
                state.gen.keyEventSummaries = keyCandidates.filter(function(ref) {
                    return keys.has(getRefKey(ref)) && String(ref.content || '').trim() && !ref.missingSummary;
                });
                updateRefTopText(topText, state, totalCount);
            });
        });

        list.querySelectorAll('.ref-generate-summary-btn').forEach(function(btn) {
            btn.addEventListener('click', function(event) {
                event.preventDefault();
                event.stopPropagation();
                const target = keyCandidates.find(function(ref) { return getRefKey(ref) === btn.dataset.key; });
                if (!target || typeof window.openChapterSummaryModal !== 'function') return;
                const modal = document.getElementById('refChapterModal');
                if (modal) modal.style.display = 'none';
                window.openChapterSummaryModal({
                    bookName,
                    vi: target.vi,
                    ci: target.ci,
                    localId: target.localId || '',
                    chapterNum: target.chapterIndex,
                    chapterName: target.chapterName
                });
            });
        });

        updateRefTopText(topText, state, totalCount);

        const firstChecked = list.querySelector('input:checked');
        if (firstChecked) firstChecked.closest('.ref-chapter-row')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    function resetGenerationRefChapterSelectionV2() {
        const state = getAppState();
        state.gen.refChapters = [];
        state.gen.refSummaries = [];
        state.gen.refSummaryCandidates = [];
        state.gen.keyEventSummaries = [];
        state.gen.keyEventSummaryCandidates = [];
        state.gen.keyEventInfo = { eventIds: [] };
        state.gen.refSelectionScopeKey = '';
        const refCount = document.getElementById('refChapterCount');
        if (refCount) refCount.textContent = '已选择 0';
        const composerRefCount = document.getElementById('composerRefChapterCount');
        if (composerRefCount) composerRefCount.textContent = '已选择 0';
        const topText = document.getElementById('refTopText');
        if (topText) topText.textContent = '已选择: 正文 0 项，概要 0 项，关键事件概要 0 项';
        document.querySelectorAll('#refChapterList input[type="checkbox"]').forEach(function(cb) {
            cb.checked = false;
        });
    }

    function renderRefChapterList(bookName) {
        return renderRefChapterListV2(bookName);
    }

    window.renderRefChapterList = renderRefChapterList;
    window.resetGenerationRefChapterSelection = resetGenerationRefChapterSelectionV2;
    window.ZHIYU_LINK_MEMORY_REF_CHAPTERS_READY = true;
})(window);
