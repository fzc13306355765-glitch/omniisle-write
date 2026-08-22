(function(window, document) {
    'use strict';

    function getDeps() {
        return {
            Utils: window.ZHIYU_UTILS || window.Utils || {},
            logToFloat: window.logToFloat || function() {}
        };
    }

    function escapeHtml(text) {
        var Utils = getDeps().Utils;
        if (Utils && typeof Utils.escapeHtml === 'function') return Utils.escapeHtml(text || '');
        return String(text || '').replace(/[&<>"']/g, function(ch) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] || ch;
        });
    }

    function createGenerationProgressBar() {
        var logBody = document.getElementById('stepLogBody');
        if (!logBody) return;

        var progDiv = document.createElement('div');
        progDiv.id = 'streamProgress';
        progDiv.style.cssText = 'margin-top:4px;height:4px;background:#e2e5ea;border-radius:2px;overflow:hidden;';
        progDiv.innerHTML = '<div id="streamProgressFill" style="height:100%;background:#2196f3;width:0;transition:width 0.3s;"></div>';
        logBody.appendChild(progDiv);
        logBody.scrollTop = logBody.scrollHeight;
    }

    function logGenerationStartDetails(options) {
        var logToFloat = getDeps().logToFloat;
        var data = options || {};
        var templateTitle = data.templateTitle || '';
        var refChapters = Array.isArray(data.refChapters) ? data.refChapters : [];
        var segmentPlan = data.segmentPlan || {};

        createGenerationProgressBar();

        if (templateTitle) logToFloat('<div>📦 提示词模板：' + escapeHtml(templateTitle) + '</div>');
        if (refChapters.length > 0) {
            logToFloat('<div>📑 参考上文：' + refChapters.length + ' 章</div>');
        }
        if (segmentPlan.total > 1) {
            logToFloat('<div>✍️ 分段写：' + segmentPlan.total + ' 段</div>');
        }
    }

    function updateGenerationProgressFill(percent) {
        var fill = document.getElementById('streamProgressFill');
        if (fill) fill.style.width = Math.max(0, Math.min(100, Number(percent) || 0)) + '%';
    }

    function completeGenerationProgress() {
        updateGenerationProgressFill(100);
    }

    window.createGenerationProgressBar = createGenerationProgressBar;
    window.logGenerationStartDetails = logGenerationStartDetails;
    window.updateGenerationProgressFill = updateGenerationProgressFill;
    window.completeGenerationProgress = completeGenerationProgress;
    window.ZHIYU_GENERATION_PROGRESS_LOG_READY = true;
})(window, document);
