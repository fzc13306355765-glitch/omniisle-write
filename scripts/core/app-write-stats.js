(function(window) {
    'use strict';

        const Utils = window.ZHIYU_UTILS || window.Utils || {};
        const WRITE_STATS_STORAGE_KEY = 'zhiyu_write_word_days_v2';
        const recordedSequenceByChapter = new Map();

        // [FIX] 写作统计
        function getWriteStats() {
            const books = StorageService.getBooks();
            const now = new Date();
            const today = getLocalDateKey(now);
            const weekAgoDate = new Date(now.getTime());
            weekAgoDate.setDate(weekAgoDate.getDate() - 6);
            const weekAgo = getLocalDateKey(weekAgoDate);
            const monthStartDate = new Date(now.getTime());
            monthStartDate.setDate(1);
            const monthStart = getLocalDateKey(monthStartDate);
            let todayWords = 0, weekWords = 0, monthWords = 0, totalWords = 0;
            let streak = 0;
            const activeDays = new Set();
            const recordedDays = getWritingWordDays();
            Object.keys(recordedDays).forEach(function(day) {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > today) return;
                const record = recordedDays[day];
                const words = typeof record === 'object' ? Number(record?.words || 0) : Number(record || 0);
                const safeWords = Number.isFinite(words) ? Math.max(0, words) : 0;
                if (day === today) todayWords += safeWords;
                if (day >= weekAgo) weekWords += safeWords;
                if (day >= monthStart) monthWords += safeWords;
                if (typeof record === 'object' ? record?.active !== false : safeWords > 0) activeDays.add(day);
            });
            for (const name in books) {
                const b = books[name];
                totalWords += countBookTextWords(b);
                const writeDate = normalizeLocalDateKey(b.lastWriteDate);
                if (writeDate && writeDate <= today) activeDays.add(writeDate);
            }
            // 计算连续写作天数
            let streakDay = activeDays.has(today) ? today : shiftLocalDateKey(today, -1);
            if (activeDays.has(streakDay)) {
                while (activeDays.has(streakDay)) {
                    streak++;
                    streakDay = shiftLocalDateKey(streakDay, -1);
                }
            }
            return { todayWords, weekWords, monthWords, totalWords, streak };
        }

        // 打开设置页面时刷新统计显示
        function refreshWriteStats() {
            const stats = getWriteStats();
            const values = {
                statTodayWords: stats.todayWords.toLocaleString(),
                statWeekWords: stats.weekWords.toLocaleString(),
                statStreak: stats.streak + ' 天',
                statTotalWords: stats.totalWords.toLocaleString()
            };
            Object.entries(values).forEach(([id, value]) => {
                const element = document.getElementById(id);
                if (element) element.textContent = value;
            });
        }

        const TODAY_WRITING_TIME_STORAGE_PREFIX = 'zhiyu_today_writing_time_v1';
        const TODAY_WRITING_TIME_IDLE_LIMIT = 5 * 60 * 1000;
        const TODAY_WRITING_TIME_TICK_MS = 15000;
        let todayWritingTimeStarted = false;
        let todayWritingTimeLastTick = Date.now();
        let todayWritingTimeLastActivity = 0;

        function isOperationTutorialActive(){
            return document.body?.classList.contains('zhiyu-outline-tutorial-active') === true;
        }

        function getLocalDateKey(date){
            const d = date || new Date();
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return y + '-' + m + '-' + day;
        }

        function normalizeLocalDateKey(value){
            if (!value) return '';
            const raw = String(value).trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
            const date = typeof Utils.parseDateValue === 'function'
                ? Utils.parseDateValue(value)
                : new Date(value);
            return date && Number.isFinite(date.getTime()) ? getLocalDateKey(date) : '';
        }

        function shiftLocalDateKey(key, amount){
            const parts = String(key || '').split('-').map(Number);
            if (parts.length !== 3 || parts.some(function(part) { return !Number.isFinite(part); })) return '';
            const date = new Date(parts[0], parts[1] - 1, parts[2]);
            date.setDate(date.getDate() + Number(amount || 0));
            return getLocalDateKey(date);
        }

        function getWriteStatsStorageKey(){
            const uid = getWritingTimeUserId();
            return window.AccountDataScope?.key
                ? window.AccountDataScope.key(WRITE_STATS_STORAGE_KEY, uid)
                : WRITE_STATS_STORAGE_KEY + ':' + uid;
        }

        function readWriteStatsLedger(){
            try {
                const parsed = JSON.parse(localStorage.getItem(getWriteStatsStorageKey()) || 'null');
                if (parsed && parsed.version === 2 && parsed.days && typeof parsed.days === 'object') {
                    if (!parsed.chapters || typeof parsed.chapters !== 'object') parsed.chapters = {};
                    return parsed;
                }
            } catch(e) {}
            return { version: 2, days: {}, chapters: {} };
        }

        function getWritingWordDays(){
            const ledger = readWriteStatsLedger();
            return { ...ledger.days };
        }

        function countContentWords(content){
            if (typeof window.countWords === 'function') return Number(window.countWords(content || '')) || 0;
            const plain = String(content || '').replace(/<[^>]+>/g, '');
            return (plain.match(/[\u3400-\u4dbf\u4e00-\u9fff\u3005-\u3007A-Za-z0-9]/g) || []).length;
        }

        function countBookTextWords(book){
            if (typeof window.countWords !== 'function') return Math.max(0, Number(book?.wordCount || 0));
            let total = 0;
            (Array.isArray(book?.volumes) ? book.volumes : []).forEach(function(volume) {
                if (!volume || volume.title === '参考文件' || !Array.isArray(volume.chapters)) return;
                volume.chapters.forEach(function(chapter) {
                    if (chapter && typeof chapter === 'object') total += countContentWords(chapter.content || '');
                });
            });
            return total;
        }

        function recordChapterWritingChange(previousContent, nextContent, updatedAt, options){
            if (isOperationTutorialActive()) return false;
            const day = normalizeLocalDateKey(updatedAt || new Date());
            if (!day) return false;
            const chapterKey = String(options?.chapterKey || 'unscoped');
            const sequence = Number(options?.sequence);
            const hasSequence = Number.isFinite(sequence) && sequence > 0;
            const recordedSequence = Number(recordedSequenceByChapter.get(chapterKey) || 0);
            if (hasSequence && sequence <= recordedSequence) {
                return { day, delta: 0, ignored: true };
            }
            const ledger = readWriteStatsLedger();
            const current = ledger.days[day];
            const currentWords = typeof current === 'object' ? Number(current?.words || 0) : Number(current || 0);
            const savedChapter = ledger.chapters[chapterKey];
            const savedCount = Number(savedChapter?.count);
            const previousCount = Number.isFinite(savedCount) ? savedCount : countContentWords(previousContent);
            const nextCount = countContentWords(nextContent);
            const delta = nextCount - previousCount;
            ledger.days[day] = {
                words: (Number.isFinite(currentWords) ? currentWords : 0) + delta,
                active: true,
                updatedAt: Date.now()
            };
            ledger.chapters[chapterKey] = { count: nextCount, updatedAt: Date.now() };
            try {
                localStorage.setItem(getWriteStatsStorageKey(), JSON.stringify(ledger));
                if (hasSequence) recordedSequenceByChapter.set(chapterKey, sequence);
                return { day, delta, words: ledger.days[day].words };
            } catch(e) {
                return false;
            }
        }

        function getWritingTimeUserId(){
            try {
                if (typeof getCurrentUserId === 'function') return getCurrentUserId() || 'guest';
            } catch(e) {}
            try {
                return localStorage.getItem('novel_user_id') || 'guest';
            } catch(e) {
                return 'guest';
            }
        }

        function getTodayWritingTimeKey(){
            return TODAY_WRITING_TIME_STORAGE_PREFIX + ':' + getWritingTimeUserId() + ':' + getLocalDateKey(new Date());
        }

        function getTodayWritingDurationMs(){
            if (isOperationTutorialActive()) return 0;
            try {
                const value = Number(localStorage.getItem(getTodayWritingTimeKey()) || 0);
                return Number.isFinite(value) && value > 0 ? value : 0;
            } catch(e) {
                return 0;
            }
        }

        function setTodayWritingDurationMs(durationMs){
            if (isOperationTutorialActive()) return;
            try {
                localStorage.setItem(getTodayWritingTimeKey(), String(Math.max(0, Math.floor(Number(durationMs) || 0))));
            } catch(e) {}
        }

        function isWritePageActive(){
            try {
                if (AppState?.ui?.page === 'write') return true;
            } catch(e) {}
            const writePage = document.getElementById('page-write');
            return !!(writePage && writePage.classList.contains('active'));
        }

        function resetWritingTimeTick(countAsActive){
            todayWritingTimeLastTick = Date.now();
            if (countAsActive) todayWritingTimeLastActivity = todayWritingTimeLastTick;
        }

        function markWritingActivity(){
            if (isOperationTutorialActive() || !isWritePageActive()) return;
            todayWritingTimeLastActivity = Date.now();
            if (!todayWritingTimeLastTick) todayWritingTimeLastTick = todayWritingTimeLastActivity;
        }

        function refreshOverviewWritingTimeDisplay(){
            const writingTimeEl = document.getElementById('overviewWritingTime');
            if (writingTimeEl && typeof formatOverviewWritingTime === 'function') {
                writingTimeEl.textContent = formatOverviewWritingTime(getTodayWritingDurationMs());
            }
        }

        function flushTodayWritingTime(){
            const now = Date.now();
            if (isOperationTutorialActive()) {
                todayWritingTimeLastTick = now;
                todayWritingTimeLastActivity = 0;
                return;
            }
            if (!todayWritingTimeLastTick) {
                todayWritingTimeLastTick = now;
                return;
            }
            const elapsed = now - todayWritingTimeLastTick;
            const active = isWritePageActive()
                && !document.hidden
                && todayWritingTimeLastActivity
                && (now - todayWritingTimeLastActivity <= TODAY_WRITING_TIME_IDLE_LIMIT);
            todayWritingTimeLastTick = now;
            if (!active || elapsed <= 0) return;
            const cappedElapsed = Math.min(elapsed, TODAY_WRITING_TIME_TICK_MS * 2);
            if (cappedElapsed < 1000) return;
            setTodayWritingDurationMs(getTodayWritingDurationMs() + cappedElapsed);
            refreshOverviewWritingTimeDisplay();
        }

        function markFromEvent(event){
            if (isOperationTutorialActive() || !isWritePageActive()) return;
            const writePage = document.getElementById('page-write');
            if (writePage && event && event.target && !writePage.contains(event.target)) return;
            markWritingActivity();
        }

        function startWritingTimeTracker(){
            if (todayWritingTimeStarted) return;
            todayWritingTimeStarted = true;
            resetWritingTimeTick(false);
            ['input','keydown','click','pointerdown','scroll','wheel','touchstart'].forEach(function(eventName){
                document.addEventListener(eventName, markFromEvent, { passive: true, capture: true });
            });
            document.addEventListener('visibilitychange', function(){
                flushTodayWritingTime();
                resetWritingTimeTick(!document.hidden && isWritePageActive());
            });
            window.addEventListener('focus', function(){ resetWritingTimeTick(isWritePageActive()); });
            window.addEventListener('blur', flushTodayWritingTime);
            setInterval(flushTodayWritingTime, TODAY_WRITING_TIME_TICK_MS);
        }

        startWritingTimeTracker();

    window.getWriteStats = getWriteStats;
    window.refreshWriteStats = refreshWriteStats;
    window.getLocalDateKey = getLocalDateKey;
    window.normalizeLocalDateKey = normalizeLocalDateKey;
    window.getWriteStatsStorageKey = getWriteStatsStorageKey;
    window.getWritingWordDays = getWritingWordDays;
    window.recordChapterWritingChange = recordChapterWritingChange;
    window.getWritingTimeUserId = getWritingTimeUserId;
    window.getTodayWritingTimeKey = getTodayWritingTimeKey;
    window.getTodayWritingDurationMs = getTodayWritingDurationMs;
    window.setTodayWritingDurationMs = setTodayWritingDurationMs;
    window.isWritePageActive = isWritePageActive;
    window.resetWritingTimeTick = resetWritingTimeTick;
    window.markWritingActivity = markWritingActivity;
    window.markFromEvent = markFromEvent;
    window.refreshOverviewWritingTimeDisplay = refreshOverviewWritingTimeDisplay;
    window.flushTodayWritingTime = flushTodayWritingTime;
    window.startWritingTimeTracker = startWritingTimeTracker;
    window.ZHIYU_WRITE_STATS_READY = true;
})(window);
