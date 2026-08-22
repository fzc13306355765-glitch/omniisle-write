// 拆分项目执行日志工具模块。
// 只负责控制执行日志显示数量，不改变生成流程和日志内容。
(function(window) {
    'use strict';

const EXECUTION_LOG_MAX = window.ZHIYU_EXECUTION_LOG_MAX || 15;
        function trimExecutionLog(container) {
            if (!container || (container.id !== 'stepLog' && container.id !== 'stepLogBody')) return;
            const entries = Array.from(container.children).filter(function(el) {
                return el.id !== 'streamProgress';
            });
            while (entries.length > EXECUTION_LOG_MAX) {
                const removableIndex = entries.findIndex(function(entry) {
                    return !entry.classList.contains('log-wait-pinned');
                });
                if (removableIndex < 0) break;
                const old = entries.splice(removableIndex, 1)[0];
                if (old && old.parentNode) old.parentNode.removeChild(old);
            }
        }

    window.ZHIYU_EXECUTION_LOG_MAX_VALUE = EXECUTION_LOG_MAX;
    window.trimExecutionLog = trimExecutionLog;
})(window);
