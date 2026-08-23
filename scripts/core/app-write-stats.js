(function(window) {
    'use strict';

        // [FIX] 写作统计
        function getWriteStats() {
            const books = StorageService.getBooks();
            const today = new Date().toISOString().slice(0,10);
            const weekAgo = new Date(Date.now() - 7*24*60*60*1000).toISOString().slice(0,10);
            const monthStartDate = new Date();
            monthStartDate.setDate(1);
            const monthStart = monthStartDate.toISOString().slice(0,10);
            let todayWords = 0, weekWords = 0, monthWords = 0, totalWords = 0;
            let lastWriteDate = null, streak = 0;
            for (const name in books) {
                const b = books[name];
                const updated = b.updatedAt?.slice(0,10);
                if (updated === today) todayWords += b.wordCount || 0;
                if (updated >= weekAgo) weekWords += b.wordCount || 0;
                if (updated >= monthStart) monthWords += b.wordCount || 0;
                totalWords += b.wordCount || 0;
                if (b.lastWriteDate) {
                    if (!lastWriteDate || b.lastWriteDate > lastWriteDate) lastWriteDate = b.lastWriteDate;
                }
            }
            // 计算连续写作天数
            if (lastWriteDate) {
                let d = new Date(lastWriteDate);
                const yesterday = new Date(Date.now() - 24*60*60*1000).toISOString().slice(0,10);
                if (lastWriteDate === today || lastWriteDate === yesterday) {
                    streak = 1;
                    let prev = new Date(lastWriteDate);
                    while (true) {
                        prev = new Date(prev.getTime() - 24*60*60*1000);
                        const prevStr = prev.toISOString().slice(0,10);
                        let found = false;
                        for (const n in books) {
                            if (books[n].lastWriteDate === prevStr) { streak++; found = true; break; }
                        }
                        if (!found) break;
                    }
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
