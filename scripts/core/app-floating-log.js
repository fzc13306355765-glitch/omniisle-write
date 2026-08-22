// Floating execution log window split from app-main.js.
// This module only binds the log popup UI and routes log messages into it.
// It does not change generation, save, or model request logic.
(function(window) {
  'use strict';

  const Utils = window.ZHIYU_UTILS || {};
  const trimExecutionLog = window.trimExecutionLog || function() {};

// ===== 测试版新增：浮动执行日志（可拖拽+缩放） =====
(function(){
    var logFloat = document.getElementById('stepLogFloat');
    var logBody = document.getElementById('stepLogBody');
    var btnToggleLog = document.getElementById('btnToggleLog');
    var btnCloseLog = document.getElementById('btnCloseLog');
    var logHeader = logFloat ? logFloat.querySelector('.log-header') : null;
    var ResponsiveDevice = window.ZHIYU_RESPONSIVE_DEVICE;
    var tabletLogFallbackMedia = window.matchMedia(
        '(min-width: 600px) and (min-height: 600px) '
        + 'and (any-pointer: coarse) and (max-width: 1440px)'
    );
    var pinnedWaitEntries = new Map();
    var waitSequence = 0;
    var btnCollapseLog = null;
    var logStatusDot = null;
    var userCollapsed = false;
    var expandedPosition = null;

    function isTabletLogLayout() {
        return typeof ResponsiveDevice?.isTablet === 'function'
            ? ResponsiveDevice.isTablet()
            : tabletLogFallbackMedia.matches;
    }

    function ensureGlobalLogLayer() {
        if (logFloat && document.body && logFloat.parentElement !== document.body) {
            document.body.appendChild(logFloat);
        }
    }

    function ensureLogHeaderControls() {
        if (!logHeader) return;
        Array.from(logHeader.childNodes).forEach(function(node) {
            if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) node.remove();
        });
        btnCollapseLog = logHeader.querySelector('.log-collapse');
        if (!btnCollapseLog) {
            btnCollapseLog = document.createElement('button');
            btnCollapseLog.type = 'button';
            btnCollapseLog.className = 'log-collapse';
            btnCollapseLog.textContent = '▶';
            btnCollapseLog.title = '收起执行日志';
            btnCollapseLog.setAttribute('aria-label', '收起执行日志');
            logHeader.insertBefore(btnCollapseLog, logHeader.firstChild);
        }
        if (!logHeader.querySelector('.log-title')) {
            var title = document.createElement('span');
            title.className = 'log-title';
            title.textContent = '📋 执行日志';
            logHeader.insertBefore(title, btnCloseLog || null);
        }
        if (!logHeader.querySelector('.log-header-spacer')) {
            var spacer = document.createElement('span');
            spacer.className = 'log-header-spacer';
            spacer.setAttribute('aria-hidden', 'true');
            logHeader.insertBefore(spacer, btnCloseLog || null);
        }
        logStatusDot = logHeader.querySelector('.log-status-dot');
        if (!logStatusDot) {
            logStatusDot = document.createElement('span');
            logStatusDot.className = 'log-status-dot';
            logStatusDot.setAttribute('aria-hidden', 'true');
            logHeader.appendChild(logStatusDot);
        }
    }

    function setLogStatus(status) {
        if (!logFloat) return;
        var allowed = new Set(['idle', 'running', 'success', 'warning', 'error']);
        logFloat.dataset.logStatus = allowed.has(status) ? status : 'idle';
    }

    function clearRunningLogEntry(includePinned) {
        if (!logBody) return;
        logBody.querySelectorAll('.log-current').forEach(function(entry) {
            if (!includePinned && entry.classList.contains('log-wait-pinned')) return;
            entry.classList.remove('log-current');
            entry.classList.remove('log-wait-pinned');
            entry.querySelector('.log-running-dots')?.remove();
        });
        if (includePinned) pinnedWaitEntries.clear();
    }
    function appendRunningDots(entry) {
        if (!entry) return;
        var dots = document.createElement('span');
        dots.className = 'log-running-dots';
        dots.setAttribute('aria-hidden', 'true');
        for (var index = 0; index < 3; index += 1) {
            var dot = document.createElement('span');
            dot.className = 'log-running-dot';
            dot.textContent = '·';
            dots.appendChild(dot);
        }
        entry.appendChild(dots);
    }
    function formatLogMessage(message, type) {
        var fallbackTitle = type === 'error'
            ? '执行失败'
            : (type === 'warn' ? '执行警告' : '执行提示');
        return typeof window.formatExecutionLogMessage === 'function'
            ? window.formatExecutionLogMessage(message, fallbackTitle)
            : String(message || '');
    }
    function appendLogEntry(message, type) {
        if (!logBody) return null;
        showLogForUpdate(message, type);
        var toneStyle = type === 'error'
            ? 'color:#e74c3c;'
            : (type === 'warn' ? 'color:#d97706;' : '');
        var div = document.createElement('div');
        div.style.cssText = 'margin-bottom:4px;font-size:12px;' + toneStyle;
        div.textContent = message;
        logBody.appendChild(div);
        trimExecutionLog(logBody);
        logBody.scrollTop = logBody.scrollHeight;
        return div;
    }
    function beginExecutionLogWait(message, type) {
        clearRunningLogEntry(false);
        var safeMessage = formatLogMessage(message, type || 'progress');
        var entry = appendLogEntry(safeMessage, type || 'progress');
        if (!entry) return '';
        var token = 'wait_' + Date.now().toString(36) + '_' + (++waitSequence).toString(36);
        entry.dataset.executionWaitToken = token;
        entry.classList.add('log-current', 'log-wait-pinned');
        appendRunningDots(entry);
        pinnedWaitEntries.set(token, entry);
        return token;
    }
    function endExecutionLogWait(token) {
        var key = String(token || '');
        var entry = pinnedWaitEntries.get(key);
        if (!entry) return false;
        entry.classList.remove('log-current', 'log-wait-pinned');
        entry.querySelector('.log-running-dots')?.remove();
        pinnedWaitEntries.delete(key);
        trimExecutionLog(logBody);
        return true;
    }
    function isRunningLogMessage(message, type) {
        var cls = String(type || '').toLowerCase();
        var text = String(message || '');
        if (!text) return false;
        if (cls === 'progress') return true;
        if (cls === 'success' || cls === 'error' || cls === 'warn') return false;
        var hasActiveWord = /(正在|开始|等待|排队|准备|重试|恢复|处理中|执行中|生成中|分析中|总结中|同步中|消痕中|拆书中|读取中|加载中|即将|稍候|后自动)/.test(text);
        var isTerminal = /(已停止|已取消|取消成功|最终失败|无法继续|未完成且不再重试|完成但|成功结束)/.test(text);
        return hasActiveWord && !isTerminal;
    }

    function inferLogStatus(message, type) {
        var cls = String(type || '').toLowerCase();
        var text = String(message || '');
        if (cls === 'error' || /(报错|错误|异常|最终失败|无法继续)/.test(text)) return 'error';
        if (cls === 'warn' || cls === 'warning' || /(不符合|警告|未通过|需注意|完成但)/.test(text)) return 'warning';
        if (cls === 'success' || /(生成完成|保存完成|执行完成|成功结束|处理成功)/.test(text)) return 'success';
        if (isRunningLogMessage(text, cls) || pinnedWaitEntries.size > 0) return 'running';
        return 'idle';
    }

    function showLogForUpdate(message, type) {
        setLogStatus(inferLogStatus(message, type));
        if (logFloat && !userCollapsed) logFloat.classList.add('open');
    }

    function getLogDragBounds() {
        var viewport = isTabletLogLayout() ? window.visualViewport : null;
        return {
            left: viewport ? viewport.offsetLeft : 0,
            top: viewport ? viewport.offsetTop : 0,
            width: viewport ? viewport.width : window.innerWidth,
            height: viewport ? viewport.height : window.innerHeight
        };
    }

    function clampExpandedPosition(position) {
        var bounds = getLogDragBounds();
        var width = logFloat?.offsetWidth || 340;
        var maxLeft = Math.max(bounds.left, bounds.left + bounds.width - width);
        var maxTop = Math.max(bounds.top, bounds.top + bounds.height - 40);
        return {
            left: Math.max(bounds.left, Math.min(maxLeft, Number(position?.left) || bounds.left)),
            top: Math.max(bounds.top, Math.min(maxTop, Number(position?.top) || bounds.top))
        };
    }

    function setCollapsedTop(top) {
        if (!logFloat) return;
        var bounds = getLogDragBounds();
        var height = Math.max(48, logFloat.offsetHeight || 52);
        var maxTop = Math.max(bounds.top, bounds.top + bounds.height - height);
        var nextTop = Math.max(bounds.top, Math.min(maxTop, Number(top) || bounds.top));
        logFloat.style.setProperty('--zhiyu-tablet-log-collapsed-top', Math.round(nextTop) + 'px');
    }

    function updateCollapsedAccessibility(collapsed) {
        if (!logFloat) return;
        if (collapsed) {
            logFloat.setAttribute('role', 'button');
            logFloat.setAttribute('tabindex', '0');
            logFloat.setAttribute('aria-label', '展开执行日志');
        } else {
            logFloat.removeAttribute('role');
            logFloat.removeAttribute('tabindex');
            logFloat.removeAttribute('aria-label');
        }
    }

    function collapseLog() {
        if (!logFloat) return;
        var rect = logFloat.getBoundingClientRect();
        expandedPosition = { left: rect.left, top: rect.top };
        userCollapsed = true;
        logFloat.classList.add('open', 'is-collapsed');
        logFloat.style.setProperty('resize', 'none');
        setCollapsedTop(rect.top);
        updateCollapsedAccessibility(true);
    }

    function expandCollapsedLog(resetStatus) {
        if (!logFloat) return;
        userCollapsed = false;
        logFloat.classList.remove('is-collapsed');
        updateCollapsedAccessibility(false);
        if (expandedPosition) {
            var restored = clampExpandedPosition(expandedPosition);
            setLogPosition(restored.left, restored.top);
        }
        logFloat.style.setProperty('resize', 'both');
        logFloat.classList.add('open');
        if (resetStatus !== false) setLogStatus('idle');
    }

    function closeLog() {
        if (!logFloat) return;
        userCollapsed = false;
        logFloat.classList.remove('open', 'is-collapsed');
        updateCollapsedAccessibility(false);
    }

    function syncTabletLogMode() {
        if (!logFloat) return;
        var tablet = isTabletLogLayout();
        logFloat.dataset.tabletLog = tablet ? 'true' : 'false';
        if (userCollapsed) setCollapsedTop(logFloat.getBoundingClientRect().top);
        if (tablet) return;
        if (logFloat.dataset.tabletPositioned === 'true') {
            var current = clampExpandedPosition({
                left: logFloat.getBoundingClientRect().left,
                top: logFloat.getBoundingClientRect().top
            });
            delete logFloat.dataset.tabletPositioned;
            logFloat.style.removeProperty('--zhiyu-tablet-log-left');
            logFloat.style.removeProperty('--zhiyu-tablet-log-top');
            logFloat.style.right = 'auto';
            logFloat.style.left = current.left + 'px';
            logFloat.style.top = current.top + 'px';
        }
    }

    ensureGlobalLogLayer();
    ensureLogHeaderControls();
    setLogStatus('idle');
    syncTabletLogMode();

    if (btnToggleLog && logFloat) btnToggleLog.addEventListener('click', function() {
        if (userCollapsed) {
            expandCollapsedLog(true);
            return;
        }
        logFloat.classList.toggle('open');
    });
    if (btnCloseLog && logFloat) btnCloseLog.addEventListener('click', closeLog);
    if (btnCollapseLog) btnCollapseLog.addEventListener('click', function(event) {
        event.preventDefault();
        event.stopPropagation();
        collapseLog();
    });
    if (typeof ResponsiveDevice?.subscribe === 'function') {
        ResponsiveDevice.subscribe(syncTabletLogMode);
    } else if (typeof tabletLogFallbackMedia.addEventListener === 'function') {
        tabletLogFallbackMedia.addEventListener('change', syncTabletLogMode);
    } else {
        tabletLogFallbackMedia.addListener?.(syncTabletLogMode);
    }
    window.addEventListener('resize', syncTabletLogMode);

    // === 拖拽移动 ===
    var dragInfo = null;
    function setLogPosition(left, top) {
        var next = clampExpandedPosition({ left: left, top: top });
        expandedPosition = next;
        if (isTabletLogLayout()) {
            logFloat.dataset.tabletPositioned = 'true';
            logFloat.style.setProperty('--zhiyu-tablet-log-left', Math.round(next.left) + 'px');
            logFloat.style.setProperty('--zhiyu-tablet-log-top', Math.round(next.top) + 'px');
            return;
        }
        logFloat.style.right = 'auto';
        logFloat.style.left = next.left + 'px';
        logFloat.style.top = next.top + 'px';
    }
    if (logHeader) {
        logHeader.addEventListener('pointerdown', function(e) {
            if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
            if (e.target.closest('.log-close, .log-collapse')) return;
            e.preventDefault();
            var rect = logFloat.getBoundingClientRect();
            dragInfo = {
                pointerId: e.pointerId,
                mode: userCollapsed ? 'collapsed' : 'expanded',
                startX: e.clientX,
                startY: e.clientY,
                startLeft: rect.left,
                startTop: rect.top,
                moved: false
            };
            if (!userCollapsed) setLogPosition(rect.left, rect.top);
            logFloat.style.setProperty('resize', 'none');
            logHeader.setPointerCapture?.(e.pointerId);
            document.body.style.userSelect = 'none';
        });
    }
    document.addEventListener('pointermove', function(e) {
        if (!dragInfo || e.pointerId !== dragInfo.pointerId) return;
        var dx = e.clientX - dragInfo.startX;
        var dy = e.clientY - dragInfo.startY;
        if (Math.abs(dx) >= 6 || Math.abs(dy) >= 6) dragInfo.moved = true;
        if (dragInfo.mode === 'collapsed') {
            setCollapsedTop(dragInfo.startTop + dy);
            return;
        }
        var bounds = getLogDragBounds();
        var maxLeft = Math.max(bounds.left, bounds.left + bounds.width - logFloat.offsetWidth);
        var maxTop = Math.max(bounds.top, bounds.top + bounds.height - 40);
        setLogPosition(
            Math.max(bounds.left, Math.min(maxLeft, dragInfo.startLeft + dx)),
            Math.max(bounds.top, Math.min(maxTop, dragInfo.startTop + dy))
        );
    });
    function finishLogDrag(e, allowCollapsedActivation) {
        if (!dragInfo || (e && e.pointerId !== dragInfo.pointerId)) return;
        var activateCollapsed = allowCollapsedActivation
            && dragInfo.mode === 'collapsed'
            && !dragInfo.moved;
        dragInfo = null;
        logFloat.style.setProperty('resize', userCollapsed ? 'none' : 'both');
        document.body.style.userSelect = '';
        if (activateCollapsed) expandCollapsedLog(true);
    }
    document.addEventListener('pointerup', function(event) { finishLogDrag(event, true); });
    document.addEventListener('pointercancel', function(event) { finishLogDrag(event, false); });
    logFloat?.addEventListener('keydown', function(event) {
        if (!userCollapsed || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        expandCollapsedLog(true);
    });

    // === 日志内容路由 ===
    // 辅助函数：清空+写入浮窗日志（替代 stepLog.innerHTML = / += 在测试版中 stepLog 不存在的问题）
    window.logToFloat = function(html, clear) {
        if (!logBody) return;
        if (clear) {
            clearRunningLogEntry(true);
            logBody.replaceChildren();
        }
        showLogForUpdate(html, '');
        var div = document.createElement('div');
        div.style.cssText = 'margin-bottom:4px;font-size:12px;';
        if (typeof Utils.sanitizeHTML === 'function') div.innerHTML = Utils.sanitizeHTML(String(html || ''));
        else div.textContent = String(html || '');
        // 普通详情只结束自动识别的等待行；显式主任务由调用方结束。
        clearRunningLogEntry(false);
            logBody.appendChild(div);
            trimExecutionLog(logBody);
            logBody.scrollTop = logBody.scrollHeight;
    };
    var origAppendLog = Utils.appendLog;
    Utils.appendLog = function(el, msg, cls) {
        var safeMessage = formatLogMessage(msg, cls);
        if (logBody && (!el || (el.id && el.id === 'stepLog'))) {
            var hasPinnedWait = pinnedWaitEntries.size > 0;
            // 显式主任务存在时，新消息都是子日志，不抢走主日志的等待动效。
            if (!hasPinnedWait) clearRunningLogEntry(false);
            var div = appendLogEntry(safeMessage, cls);
            if (!hasPinnedWait && isRunningLogMessage(safeMessage, cls)) {
                div.classList.add('log-current');
                appendRunningDots(div);
            }
            return;
        }
        origAppendLog(el, safeMessage, cls);
    };
    Utils.beginExecutionLogWait = beginExecutionLogWait;
    Utils.endExecutionLogWait = endExecutionLogWait;
    window.beginExecutionLogWait = beginExecutionLogWait;
    window.endExecutionLogWait = endExecutionLogWait;
})();

  window.ZHIYU_FLOATING_LOG_READY = true;
})(window);
