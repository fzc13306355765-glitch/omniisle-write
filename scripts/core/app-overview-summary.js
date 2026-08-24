// 拆分项目总览页：最近编辑与统计摘要辅助函数。
// 只承接 app-overview.js 中的纯前端展示逻辑，不改数据结构和后端接口。
(function(window) {
    'use strict';

    var AppState = window.ZHIYU_APP_STATE || window.AppState || {};
    var Utils = window.ZHIYU_UTILS || window.Utils || {};
    var StorageService = window.ZHIYU_STORAGE_SERVICE || window.StorageService || { getBooks: function() { return {}; } };

    function countOverviewWords(content) {
        if (typeof window.countWords === 'function') return window.countWords(content || '');
        const plain = String(content || '')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>');
        return (plain.match(/[\u3400-\u4dbf\u4e00-\u9fff\u3005-\u3007A-Za-z0-9]/g) || []).length;
    }

    function formatOverviewLocalDate(date) {
        if (!date || !Number.isFinite(date.getTime())) return '';
        if (typeof Utils.formatDate === 'function') {
            const formatted = Utils.formatDate(date);
            return formatted === '-' ? '' : formatted;
        }
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return year + '-' + month + '-' + day;
    }

    function getOverviewTime(value) {
        const date = typeof Utils.parseDateValue === 'function'
            ? Utils.parseDateValue(value)
            : new Date(value);
        return date && Number.isFinite(date.getTime()) ? date.getTime() : 0;
    }

    function getOverviewChapterTarget(book) {
        const fallback = { vi: -1, ci: -1, name: '暂无章节', words: 0, updatedAt: book?.updatedAt || book?.createdAt || '' };
        if (!book || !Array.isArray(book.volumes)) return fallback;
        let best = null;
        book.volumes.forEach(function(vol, vi) {
            if (!vol || vol.title === '参考文件' || !Array.isArray(vol.chapters)) return;
            vol.chapters.forEach(function(ch, ci) {
                if (!ch || typeof ch !== 'object') return;
                const stamp = ch.updatedAt || book.updatedAt || book.createdAt || '';
                const words = countOverviewWords(ch.content || '');
                const item = { vi, ci, name: ch.name || ('第' + (ci + 1) + '章'), words, updatedAt: stamp };
                if (!best) best = item;
                else if (getOverviewTime(item.updatedAt) > getOverviewTime(best.updatedAt)) best = item;
                else if (getOverviewTime(item.updatedAt) === getOverviewTime(best.updatedAt) && item.words > best.words) best = item;
            });
        });
        return best || fallback;
    }

    function getOverviewRecentBook(activeBooks) {
        let recent = null;
        Object.keys(activeBooks || {}).forEach(function(name) {
            const book = activeBooks[name];
            const target = getOverviewChapterTarget(book);
            const stamp = target.updatedAt || book.updatedAt || book.createdAt || '';
            if (!recent || getOverviewTime(stamp) > getOverviewTime(recent.stamp)) {
                recent = { name, book, target, stamp };
            }
        });
        return recent;
    }

    function formatOverviewWritingTime(durationMs) {
        const ms = Math.max(0, Number(durationMs || 0));
        const minutes = Math.floor(ms / 60000);
        if (ms > 0 && minutes < 1) return '<1m';
        if (minutes < 60) return minutes + 'm';
        const hours = Math.floor(minutes / 60);
        const restMinutes = minutes % 60;
        return restMinutes ? (hours + 'h ' + restMinutes + 'm') : (hours + 'h');
    }

    function getOverviewDateKey(value) {
        const raw = String(value ?? '').trim();
        if (!raw) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
        const date = typeof Utils.parseDateValue === 'function'
            ? Utils.parseDateValue(value)
            : new Date(raw);
        return formatOverviewLocalDate(date);
    }

    function renderOverviewTable(containerId, headers, rows, emptyText) {
        const box = document.getElementById(containerId);
        if (!box) return;
        const head = '<thead><tr>' + headers.map(h => '<th>' + h + '</th>').join('') + '</tr></thead>';
        if (!rows.length) {
            box.innerHTML = '<table class="overview-table">' + head + '<tbody><tr><td class="overview-empty-cell" colspan="' + headers.length + '" style="height:128px;color:#98a2b3;text-align:center;">' + emptyText + '</td></tr></tbody></table>';
            return;
        }
        box.innerHTML = '<table class="overview-table">' + head + '<tbody>' + rows.map(row => '<tr>' + row.map(cell => '<td title="' + String(cell.text || cell).replace(/"/g, '&quot;') + '">' + (cell.html || cell.text || cell) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
    }

    function getOverviewSelectedEditBook(activeBooks) {
        const names = Object.keys(activeBooks || {});
        if (!names.length) {
            AppState.ui.overviewEditBook = '';
            return '';
        }
        if (AppState.ui.overviewEditBook && activeBooks[AppState.ui.overviewEditBook]) {
            return AppState.ui.overviewEditBook;
        }
        const recent = getOverviewRecentBook(activeBooks);
        const selected = recent?.name || names[0];
        AppState.ui.overviewEditBook = selected;
        return selected;
    }

    function renderOverviewEditBookSelect(activeBooks, selectedName) {
        const select = document.getElementById('overviewEditBookSelect');
        if (!select) return;
        const names = Object.keys(activeBooks || {}).sort(function(a, b) {
            const aTarget = getOverviewChapterTarget(activeBooks[a]);
            const bTarget = getOverviewChapterTarget(activeBooks[b]);
            const aStamp = aTarget.updatedAt || activeBooks[a]?.updatedAt || activeBooks[a]?.createdAt || '';
            const bStamp = bTarget.updatedAt || activeBooks[b]?.updatedAt || activeBooks[b]?.createdAt || '';
            return getOverviewTime(bStamp) - getOverviewTime(aStamp);
        });
        if (!names.length) {
            select.innerHTML = '<option value="">暂无作品可选</option>';
            select.disabled = true;
            return;
        }
        select.disabled = false;
        select.innerHTML = names.map(function(name) {
            const selected = name === selectedName ? ' selected' : '';
            return '<option value="' + Utils.escapeHtml(name) + '"' + selected + '>' + Utils.escapeHtml(name) + '</option>';
        }).join('');
    }

    function getOverviewBookEditRows(bookName, book) {
        const rows = [];
        if (!book) return rows;
        (Array.isArray(book.volumes) ? book.volumes : []).forEach(function(vol, vi) {
            if (!vol || vol.title === '参考文件' || !Array.isArray(vol.chapters)) return;
            (vol.chapters || []).forEach(function(ch, ci) {
                if (!ch || typeof ch !== 'object') return;
                const stamp = ch.updatedAt || book.updatedAt || book.createdAt || '';
                rows.push({ chapterName: ch.name || ('第' + (ci + 1) + '章'), words: countOverviewWords(ch.content || ''), stamp });
            });
        });
        rows.sort(function(a, b) { return getOverviewTime(b.stamp) - getOverviewTime(a.stamp); });
        return rows;
    }

    function getOverviewEditRowLimit() {
        const card = document.getElementById('overviewEditCard');
        const height = card?.clientHeight || 0;
        if (!height) return 8;
        return Math.max(5, Math.min(12, Math.floor((height - 88) / 35)));
    }

    function renderOverviewSelectedEdits(activeBooks) {
        const selectedName = getOverviewSelectedEditBook(activeBooks);
        renderOverviewEditBookSelect(activeBooks, selectedName);
        if (!selectedName) {
            renderOverviewTable('overviewEditList', ['章节名称', '字数', '编辑时间'], [], '暂无作品');
            return;
        }
        const editRows = getOverviewBookEditRows(selectedName, activeBooks[selectedName]);
        const limit = getOverviewEditRowLimit();
        editRows.sort(function(a, b) { return getOverviewTime(b.stamp) - getOverviewTime(a.stamp); });
        renderOverviewTable(
            'overviewEditList',
            ['章节名称', '字数', '编辑时间'],
            editRows.slice(0, limit).map(function(item) {
                return [
                    { text: item.chapterName, html: Utils.escapeHtml(item.chapterName) },
                    item.words.toLocaleString(),
                    Utils.formatDate(item.stamp)
                ];
            }),
            '暂无最近编辑'
        );
    }

    function renderOverviewSnapshot(activeBooks, writeStats) {
        renderOverviewSelectedEdits(activeBooks);

        const syncTitle = document.getElementById('overviewSyncSummary');
        const creditMeta = document.getElementById('overviewCreditSummary');
        if (syncTitle) {
            syncTitle.textContent = '本机保存';
        }
        if (creditMeta) {
            creditMeta.textContent = '本机数据 · 今日字数：' + ((writeStats?.todayWords || 0).toLocaleString());
        }
    }

    function getOverviewSixDayData() {
        const books = StorageService.getBooks();
        const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六'];
        const days = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = formatOverviewLocalDate(d);
            days.push({ key, label: weekdayLabels[d.getDay()], words: 0 });
        }
        const dayMap = days.reduce(function(map, item) {
            map[item.key] = item;
            return map;
        }, {});
        const recordedDays = typeof window.getWritingWordDays === 'function'
            ? window.getWritingWordDays()
            : null;
        if (recordedDays && typeof recordedDays === 'object') {
            days.forEach(function(item) {
                const record = recordedDays[item.key];
                const words = typeof record === 'object' ? Number(record?.words || 0) : Number(record || 0);
                item.words = Number.isFinite(words) ? Math.max(0, words) : 0;
            });
            return days;
        }
        Object.keys(books || {}).forEach(function(name) {
            const book = books[name] || {};
            let chapterMatched = false;
            (Array.isArray(book.volumes) ? book.volumes : []).forEach(function(vol) {
                if (!vol || vol.title === '参考文件' || !Array.isArray(vol.chapters)) return;
                vol.chapters.forEach(function(ch) {
                    if (!ch || typeof ch !== 'object') return;
                    const stamp = getOverviewDateKey(ch.updatedAt);
                    if (dayMap[stamp]) {
                        dayMap[stamp].words += countOverviewWords(ch.content || '');
                        chapterMatched = true;
                    }
                });
            });
            if (!chapterMatched) {
                const stamp = getOverviewDateKey(book.lastWriteDate || book.updatedAt || book.createdAt);
                if (dayMap[stamp]) dayMap[stamp].words += Number(book.wordCount || 0);
            }
        });
        return days;
    }

    function renderOverviewSixDayData() {
        const chart = document.getElementById('overviewSixDayChart');
        if (!chart) return;
        const data = getOverviewSixDayData();
        const rawMax = Math.max.apply(null, data.map(function(item) { return item.words || 0; }).concat([0]));
        const magnitude = rawMax > 0 ? Math.pow(10, Math.max(0, String(Math.floor(rawMax)).length - 1)) : 1;
        const max = rawMax > 0 ? Math.ceil(rawMax / magnitude) * magnitude : 0;
        const scaleMax = max || 1;
        const hasData = data.some(function(item) { return item.words > 0; });
        const formatAxis = function(value) {
            const n = Math.max(0, Math.round(value || 0));
            return n >= 10000 ? (Number((n / 10000).toFixed(1)) + '万') : n.toLocaleString();
        };
        chart.innerHTML = [
            '<div class="overview-sixday-axis" aria-hidden="true"><span>' + formatAxis(max) + '字</span><span>' + formatAxis(max / 2) + '字</span><span>0字</span></div>',
            '<div class="overview-sixday-lines" aria-hidden="true"><span></span><span></span><span></span></div>',
            hasData ? '' : '<div class="overview-sixday-empty">暂无写作增量时保持低位展示</div>',
            '<div class="overview-sixday-bars">',
            data.map(function(item) {
                const height = item.words ? Math.max(20, Math.round((item.words / scaleMax) * 118)) : 20;
                const wordsText = (item.words || 0).toLocaleString();
                const tip = Utils.escapeHtml(item.label + ' ' + item.key + '：' + wordsText + '字');
                return '<div class="overview-sixday-bar-wrap" aria-label="' + tip + '"><span class="overview-sixday-tooltip">' + tip + '</span><span class="overview-sixday-bar" style="height:' + height + 'px"></span><span class="overview-sixday-label">' + Utils.escapeHtml(item.label) + '</span></div>';
            }).join(''),
            '</div>'
        ].join('');
    }

    function updateOverviewAnnouncementBar() {
        const textEl = document.querySelector('#overviewAnnouncementBar .overview-announcement-text');
        const progressEl = document.querySelector('#overviewAnnouncementBar .overview-announcement-progress');
        if (!textEl) return;
        if (window.ZHIYU_COMMUNITY_MODE === true) {
            const text = '';
            textEl.textContent = text;
            textEl.title = text;
            textEl.style.animation = 'none';
            if (progressEl) progressEl.style.display = 'none';
            return;
        }
        const source = typeof window.getOfficialNotices === 'function'
            ? window.getOfficialNotices()
            : (window.OFFICIAL_NOTICES && window.OFFICIAL_NOTICES.length ? window.OFFICIAL_NOTICES : window.OFFICIAL_NOTICES_DEFAULT);
        const latest = typeof window.getLatestOfficialNotice === 'function'
            ? window.getLatestOfficialNotice(source)
            : ((source && source.length) ? source[0] : null);
        const text = typeof window.formatLatestOfficialNotice === 'function'
            ? window.formatLatestOfficialNotice(latest)
            : (latest ? String(latest.title || '官方公告') : '暂无官方公告');
        textEl.textContent = text;
        textEl.title = text;
        textEl.style.animation = 'none';
        if (progressEl) progressEl.style.setProperty('--overview-announcement-progress-animation', 'none');
        void textEl.offsetWidth;
        if (progressEl) void progressEl.offsetWidth;
        textEl.style.animation = '';
        if (progressEl) progressEl.style.removeProperty('--overview-announcement-progress-animation');
    }

    window.getOverviewChapterTarget = getOverviewChapterTarget;
    window.getOverviewRecentBook = getOverviewRecentBook;
    window.formatOverviewWritingTime = formatOverviewWritingTime;
    window.renderOverviewTable = renderOverviewTable;
    window.getOverviewSelectedEditBook = getOverviewSelectedEditBook;
    window.renderOverviewEditBookSelect = renderOverviewEditBookSelect;
    window.getOverviewBookEditRows = getOverviewBookEditRows;
    window.getOverviewEditRowLimit = getOverviewEditRowLimit;
    window.renderOverviewSelectedEdits = renderOverviewSelectedEdits;
    window.renderOverviewSnapshot = renderOverviewSnapshot;
    window.getOverviewSixDayData = getOverviewSixDayData;
    window.renderOverviewSixDayData = renderOverviewSixDayData;
    window.updateOverviewAnnouncementBar = updateOverviewAnnouncementBar;
    window.ZHIYU_OVERVIEW_SUMMARY_READY = true;
})(window);
