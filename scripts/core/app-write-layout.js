// Writing-page layout splitters and panel collapse bindings split from app-main.js.
// This module only binds UI layout interactions; it does not read/write chapter data or call backend APIs.
(function() {
var ResponsiveDevice = window.ZHIYU_RESPONSIVE_DEVICE;
var compactWritingMedia = window.matchMedia('(max-width: 860px)');
var tabletWritingFallbackMedia = window.matchMedia(
    '(min-width: 600px) and (min-height: 600px) '
    + 'and (any-pointer: coarse) and (max-width: 1440px)'
);
function isTabletWritingLayout() {
    return typeof ResponsiveDevice?.isTablet === 'function'
        ? ResponsiveDevice.isTablet()
        : tabletWritingFallbackMedia.matches;
}
function isCompactWritingLayout() {
    if (typeof ResponsiveDevice?.getLayout === 'function') {
        return ResponsiveDevice.getLayout() === 'phone';
    }
    return compactWritingMedia.matches && !isTabletWritingLayout();
}

function cssPixels(value) {
    var parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function verticalBoxSize(element) {
    if (!element) return 0;
    var style = window.getComputedStyle?.(element) || {};
    return cssPixels(style.paddingTop) + cssPixels(style.paddingBottom)
        + cssPixels(style.borderTopWidth) + cssPixels(style.borderBottomWidth)
        + cssPixels(style.marginTop) + cssPixels(style.marginBottom);
}

function verticalMarginSize(element) {
    var style = window.getComputedStyle?.(element) || {};
    return cssPixels(style.marginTop) + cssPixels(style.marginBottom);
}

function getTabletBodyPlotMinimumHeight(plotDiv) {
    if (!isTabletWritingLayout()) return 60;
    var plot = plotDiv || document.querySelector('.write-plot');
    var shell = plot?.querySelector?.('.chapter-compose-shell');
    var top = shell?.querySelector?.('.chapter-compose-top');
    var input = shell?.querySelector?.('textarea');
    var bottom = shell?.querySelector?.('.chapter-compose-bottom');
    if (!plot || !shell || !top || !input || !bottom) return 168;
    var inputStyle = window.getComputedStyle?.(input) || {};
    var shellStyle = window.getComputedStyle?.(shell) || {};
    var inputMinimum = Math.max(72, cssPixels(inputStyle.minHeight));
    var rowGap = cssPixels(shellStyle.rowGap || shellStyle.gap);
    var measured = verticalBoxSize(plot) + verticalBoxSize(shell)
        + top.offsetHeight + bottom.offsetHeight + inputMinimum + rowGap * 2 + 8;
    return Math.max(168, Math.ceil(measured));
}

function getBodyPlotAvailableHeight(resultBox, plotDiv) {
    var parent = resultBox?.parentElement;
    if (!parent || !parent.clientHeight) return resultBox.offsetHeight + plotDiv.offsetHeight;
    var occupied = 0;
    Array.from(parent.children || []).forEach(function(child) {
        if (child === resultBox || child === plotDiv) return;
        occupied += child.offsetHeight + verticalMarginSize(child);
    });
    return Math.max(0, parent.clientHeight - occupied
        - verticalMarginSize(resultBox) - verticalMarginSize(plotDiv));
}

function setBodyPlotHeights(resultBox, plotDiv, bodyHeight, plotHeight) {
    resultBox.style.height = bodyHeight + 'px';
    resultBox.style.flex = 'none';
    if (isTabletWritingLayout()) plotDiv.style.setProperty('height', plotHeight + 'px', 'important');
    else plotDiv.style.height = plotHeight + 'px';
    plotDiv.style.flex = 'none';
}

function clampTabletBodyPlotLayout() {
    if (!isTabletWritingLayout()) return false;
    var resultBox = document.getElementById('resultBox');
    var plotDiv = document.querySelector('.write-plot');
    if (!resultBox || !plotDiv || resultBox.offsetHeight <= 0 || plotDiv.offsetHeight <= 0) return false;
    var available = getBodyPlotAvailableHeight(resultBox, plotDiv);
    if (available <= 100) return false;
    var minimumPlot = Math.min(getTabletBodyPlotMinimumHeight(plotDiv), Math.max(60, available - 100));
    var plotHeight = Math.max(minimumPlot, Math.min(available - 100, plotDiv.offsetHeight));
    var bodyHeight = available - plotHeight;
    setBodyPlotHeights(resultBox, plotDiv, bodyHeight, plotHeight);
    return true;
}

       // ===== 测试版新增：分割线拖拽系统 =====
(function(){
    var dragInfo = null;
    var actionDividerUserAdjusted = false;
    var actionDividerInitialAligned = false;
    function getMainActionMaxWidth() {
        var row = document.querySelector('.write-right');
        var divider = document.querySelector('.divider-v[data-drag="main-action"]');
        if (!row) return 480;
        var dividerWidth = divider ? divider.offsetWidth : 12;
        var maxByHalf = Math.floor((row.clientWidth - dividerWidth) * 0.5);
        return Math.max(300, maxByHalf);
    }
    document.addEventListener('pointerdown', function(e) {
        if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
        if (e.target.closest('.divider-toggle, .og-input-toggle')) return;
        var divider = e.target.closest('.divider-v[data-drag], .divider-h[data-drag]');
        if (!divider) return;
        e.preventDefault();
        var dragKey = divider.dataset.drag;
        var writeCatalog = document.getElementById('writeCatalog');
        var resultBox = document.getElementById('resultBox');
        var plotDiv = document.querySelector('.write-plot');
        if (dragKey === 'catalog-main') {
            dragInfo = { key: dragKey, el: divider, pointerId: e.pointerId, startX: e.clientX, startSize: writeCatalog.offsetWidth };
        } else if (dragKey === 'main-action') {
            var actionPanel = document.querySelector('.write-action-panel');
            dragInfo = { key: dragKey, el: divider, pointerId: e.pointerId, startX: e.clientX, startSize: actionPanel.offsetWidth };
        } else if (dragKey === 'body-plot') {
            dragInfo = { key: dragKey, el: divider, pointerId: e.pointerId, startY: e.clientY, bodyH: resultBox.offsetHeight, plotH: plotDiv.offsetHeight, totalH: isTabletWritingLayout() ? getBodyPlotAvailableHeight(resultBox, plotDiv) : resultBox.offsetHeight + plotDiv.offsetHeight };
        } else if (dragKey === 'og-content-input') {
            var contentBox = getActiveContentBox();
            var inputArea = document.getElementById('ogInputArea');
            dragInfo = { key: dragKey, el: divider, pointerId: e.pointerId, startY: e.clientY, contentH: contentBox.offsetHeight, inputH: inputArea.offsetHeight, totalFlexH: contentBox.offsetHeight + inputArea.offsetHeight };
        }
        if (dragInfo && (dragKey === 'body-plot' || dragKey === 'og-content-input')) {
            actionDividerUserAdjusted = true;
        }
        if (dragInfo) {
            divider.classList.add('dragging');
            divider.setPointerCapture?.(e.pointerId);
            document.body.style.userSelect = 'none';
        }
    });
    document.addEventListener('pointermove', function(e) {
        if (!dragInfo || e.pointerId !== dragInfo.pointerId) return;
        if (dragInfo.key === 'catalog-main') {
            var newW = Math.max(140, Math.min(380, dragInfo.startSize + e.clientX - dragInfo.startX));
            document.getElementById('writeCatalog').style.width = newW + 'px';
        } else if (dragInfo.key === 'main-action') {
            var newW = Math.max(160, Math.min(getMainActionMaxWidth(), dragInfo.startSize + dragInfo.startX - e.clientX));
            var panel = document.querySelector('.write-action-panel');
            if (panel) panel.style.width = newW + 'px';
        } else if (dragInfo.key === 'body-plot') {
            var dy = e.clientY - dragInfo.startY;
            var rb = document.getElementById('resultBox');
            var pd = document.querySelector('.write-plot');
            var minimumPlotH = isTabletWritingLayout()
                ? Math.min(getTabletBodyPlotMinimumHeight(pd), Math.max(60, dragInfo.totalH - 100))
                : 60;
            var newBodyH = Math.max(100, Math.min(dragInfo.totalH - minimumPlotH, dragInfo.bodyH + dy));
            var newPlotH = dragInfo.totalH - newBodyH;
            setBodyPlotHeights(rb, pd, newBodyH, newPlotH);
        } else if (dragInfo.key === 'og-content-input') {
            var dy2 = e.clientY - dragInfo.startY;
            var cb2 = getActiveContentBox();
            var ia2 = document.getElementById('ogInputArea');
            var newContentH = Math.max(40, Math.min(dragInfo.totalFlexH - 60, dragInfo.contentH + dy2));
            var newInputH = dragInfo.totalFlexH - newContentH;
            cb2.style.height = newContentH + 'px'; cb2.style.flex = 'none';
            ia2.style.height = newInputH + 'px'; ia2.style.flex = 'none';
        }
    });
    function finishDividerDrag(e) {
        if (!dragInfo || (e && e.pointerId !== dragInfo.pointerId)) return;
        // body-plot: 保持 px 值，不转 flex 百分比（避免松手跳动）
        if (dragInfo.el) dragInfo.el.classList.remove('dragging');
        document.body.style.userSelect = '';
        dragInfo = null;
    }
    document.addEventListener('pointerup', finishDividerDrag);
    document.addEventListener('pointercancel', finishDividerDrag);
    var rbInit = document.getElementById('resultBox');
    var wpInit = document.querySelector('.write-plot');
    if (rbInit && wpInit) { rbInit.style.flex = '1'; wpInit.style.height = '187px'; wpInit.style.flex = 'none'; }
    // 初始对齐：分割线默认距底部边界190px（输入区=134px，内容区=剩余空间）
    function alignActionDividerWithBody(tries) {
        tries = tries || 0;
        if (actionDividerUserAdjusted || actionDividerInitialAligned) return;
        var bodyDivider = document.querySelector('.divider-h[data-drag="body-plot"]');
        var actionDivider = document.getElementById('ogDragDivider');
        var panel = document.querySelector('.write-action-panel');
        var cb = getActiveContentBox();
        var ia = document.getElementById('ogInputArea');
        if (!bodyDivider || !actionDivider || !panel || !cb || !ia || cb.offsetHeight <= 0 || ia.offsetHeight <= 0) {
            if (tries < 30) setTimeout(function() { alignActionDividerWithBody(tries + 1); }, 50);
            return;
        }
        var actionStyle = window.getComputedStyle(actionDivider);
        if (actionStyle.display === 'none') {
            if (tries < 30) setTimeout(function() { alignActionDividerWithBody(tries + 1); }, 50);
            return;
        }
        var bodyRect = bodyDivider.getBoundingClientRect();
        var actionRect = actionDivider.getBoundingClientRect();
        var targetCenter = bodyRect.top + bodyRect.height / 2;
        var currentCenter = actionRect.top + actionRect.height / 2;
        var delta = targetCenter - currentCenter;
        if (Math.abs(delta) <= 1) {
            actionDividerInitialAligned = true;
            return;
        }
        var totalFlex = cb.offsetHeight + ia.offsetHeight;
        var minContentH = 40;
        var minInputH = 40;
        var newContentH = cb.offsetHeight + delta;
        newContentH = Math.max(minContentH, Math.min(totalFlex - minInputH, newContentH));
        var newInputH = Math.max(minInputH, totalFlex - newContentH);
        cb.style.height = newContentH + 'px'; cb.style.flex = 'none';
        ia.style.height = newInputH + 'px'; ia.style.flex = 'none';
        if (tries < 5) {
            setTimeout(function() { alignActionDividerWithBody(tries + 1); }, 30);
        } else {
            actionDividerInitialAligned = true;
        }
    }
    window.alignActionDividerWithBody = alignActionDividerWithBody;
    setTimeout(function() { alignActionDividerWithBody(0); }, 80);
    setTimeout(function() { alignActionDividerWithBody(0); }, 260);
    setTimeout(function() { alignActionDividerWithBody(0); }, 700);
    setTimeout(clampTabletBodyPlotLayout, 120);
    setTimeout(clampTabletBodyPlotLayout, 720);
    ResponsiveDevice?.subscribe?.(clampTabletBodyPlotLayout);
    window.addEventListener('resize', clampTabletBodyPlotLayout);
    window.addEventListener('orientationchange', clampTabletBodyPlotLayout);
    window.getTabletBodyPlotMinimumHeight = getTabletBodyPlotMinimumHeight;
    window.clampTabletBodyPlotLayout = clampTabletBodyPlotLayout;
})();

// ===== 章节目录收起/展开按钮（新版：右上角独立按钮） =====
(function() {
    var catalogToggleBtn = document.getElementById('catalogToggleBtn');
    var catalogPanel = document.getElementById('writeCatalog');
    if (!catalogToggleBtn || !catalogPanel) return;
    
    catalogToggleBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        delete catalogPanel.dataset.smallScreenAutoCollapsed;
        var prevWidth = catalogPanel.offsetWidth || 220;
        var isCollapsed = catalogPanel.classList.toggle('collapsed');
        catalogPanel.style.transition = 'width 0.25s ease';
        
        if (isCollapsed) {
            catalogToggleBtn.dataset.prevWidth = prevWidth;
            catalogToggleBtn.textContent = '▶';
            catalogToggleBtn.title = '展开章节目录';
        } else {
            catalogPanel.style.width = (parseInt(catalogToggleBtn.dataset.prevWidth, 10) || 220) + 'px';
            catalogToggleBtn.textContent = '◀';
            catalogToggleBtn.title = '收起章节目录';
            if (isCompactWritingLayout()) {
                var actionPanel = document.querySelector('.write-action-panel');
                var actionToggle = document.querySelector('.divider-toggle[data-target="action"]');
                actionPanel?.classList.add('collapsed');
                if (actionToggle) {
                    actionToggle.textContent = '◀';
                    actionToggle.title = '展开操作栏';
                }
            }
        }
        
        setTimeout(function() { catalogPanel.style.transition = ''; }, 300);
    });
})();

// ===== 右侧操作栏收起/展开按钮 =====
document.querySelectorAll('.divider-toggle').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var target = btn.dataset.target;
        if (target === 'catalog') return; // 章节目录已用独立按钮
        
        var panel = document.querySelector('.write-action-panel');
        if (!panel) return;
        delete panel.dataset.smallScreenAutoCollapsed;
        var prevWidth = panel.offsetWidth || 380;
        var isCollapsed = panel.classList.toggle('collapsed');
        panel.style.transition = 'width 0.25s ease';
        if (isCollapsed) {
            btn.dataset.prevWidth = prevWidth;
            btn.textContent = '◀';
            btn.title = '展开操作栏';
        } else {
            panel.style.width = (parseInt(btn.dataset.prevWidth, 10) || 380) + 'px';
            btn.textContent = '▶';
            btn.title = '收起操作栏';
            if (isCompactWritingLayout()) {
                var catalogPanel = document.getElementById('writeCatalog');
                var catalogToggle = document.getElementById('catalogToggleBtn');
                catalogPanel?.classList.add('collapsed');
                if (catalogToggle) {
                    catalogToggle.textContent = '▶';
                    catalogToggle.title = '展开章节目录';
                }
            }
        }
        setTimeout(function() { panel.style.transition = ''; }, 300);
    });
});

// 平板细纲/拆书区：横向分割线中央按钮收起或展开剧情描述输入区。
(function initTabletActionInputToggle() {
    var divider = document.getElementById('ogDragDivider');
    var inputArea = document.getElementById('ogInputArea');
    var toggle = document.getElementById('ogInputToggleBtn');
    if (!divider || !inputArea || !toggle) return;

    function isAiPolishTab() {
        return document.querySelector('.action-tab-btn.active')?.dataset.tab === 'aiPolish';
    }

    function updateToggle(collapsed) {
        toggle.textContent = collapsed ? '▲' : '▼';
        toggle.title = collapsed ? '展开剧情描述输入区' : '收起剧情描述输入区';
        toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        divider.classList.toggle('tablet-input-collapsed', collapsed);
    }

    function setCollapsed(collapsed) {
        if (!isTabletWritingLayout()) return;
        if (collapsed) {
            if (inputArea.contains(document.activeElement)) document.activeElement.blur();
            inputArea.dataset.tabletCollapsed = 'true';
        } else {
            delete inputArea.dataset.tabletCollapsed;
            if (!isAiPolishTab()) inputArea.style.display = 'flex';
        }
        updateToggle(collapsed);
    }

    function syncTabletMode() {
        if (isTabletWritingLayout()) {
            updateToggle(inputArea.dataset.tabletCollapsed === 'true');
            return;
        }
        delete inputArea.dataset.tabletCollapsed;
        divider.classList.remove('tablet-input-collapsed');
        inputArea.style.display = isAiPolishTab() ? 'none' : 'flex';
        inputArea.style.flex = '1 1 0%';
        inputArea.style.height = '';
        inputArea.style.minHeight = '0';
        updateToggle(false);
    }

    toggle.addEventListener('click', function(event) {
        if (!isTabletWritingLayout()) return;
        event.preventDefault();
        event.stopPropagation();
        setCollapsed(inputArea.dataset.tabletCollapsed !== 'true');
    });
    if (typeof ResponsiveDevice?.subscribe === 'function') {
        ResponsiveDevice.subscribe(syncTabletMode);
    } else if (typeof tabletWritingFallbackMedia.addEventListener === 'function') {
        tabletWritingFallbackMedia.addEventListener('change', syncTabletMode);
    } else {
        tabletWritingFallbackMedia.addListener?.(syncTabletMode);
    }
    window.addEventListener('resize', syncTabletMode);
    syncTabletMode();
})();

// 小屏首次进入写作页时先保留正文空间；目录和操作栏仍可由两侧按钮打开。
(function initSmallScreenWritingPanels() {
    function applySmallScreenDefaults() {
        var catalogPanel = document.getElementById('writeCatalog');
        var catalogToggle = document.getElementById('catalogToggleBtn');
        var actionPanel = document.querySelector('.write-action-panel');
        var actionToggle = document.querySelector('.divider-toggle[data-target="action"]');
        if (!isCompactWritingLayout()) {
            if (catalogPanel?.dataset.smallScreenAutoCollapsed === '1') {
                catalogPanel.classList.remove('collapsed');
                catalogPanel.style.width = '';
                catalogToggle.textContent = '◀';
                catalogToggle.title = '收起章节目录';
            }
            if (actionPanel?.dataset.smallScreenAutoCollapsed === '1') {
                actionPanel.classList.remove('collapsed');
                actionPanel.style.width = '';
                actionToggle.textContent = '▶';
                actionToggle.title = '收起操作栏';
            }
            if (catalogPanel) {
                delete catalogPanel.dataset.smallScreenInitialized;
                delete catalogPanel.dataset.smallScreenAutoCollapsed;
            }
            if (actionPanel) {
                delete actionPanel.dataset.smallScreenInitialized;
                delete actionPanel.dataset.smallScreenAutoCollapsed;
            }
            return;
        }
        if (catalogPanel && catalogPanel.dataset.smallScreenInitialized !== '1') {
            catalogPanel.dataset.smallScreenInitialized = '1';
            if (!catalogPanel.classList.contains('collapsed')) {
                catalogPanel.classList.add('collapsed');
                catalogPanel.dataset.smallScreenAutoCollapsed = '1';
            }
            if (catalogToggle) {
                catalogToggle.textContent = '▶';
                catalogToggle.title = '展开章节目录';
            }
        }
        if (actionPanel && actionPanel.dataset.smallScreenInitialized !== '1') {
            actionPanel.dataset.smallScreenInitialized = '1';
            if (!actionPanel.classList.contains('collapsed')) {
                actionPanel.classList.add('collapsed');
                actionPanel.dataset.smallScreenAutoCollapsed = '1';
            }
            if (actionToggle) {
                actionToggle.textContent = '◀';
                actionToggle.title = '展开操作栏';
            }
        }
    }
    applySmallScreenDefaults();
    function handleCompactWritingChange(event) {
        if (!event.matches && !isCompactWritingLayout()) {
            var catalogPanel = document.getElementById('writeCatalog');
            var actionPanel = document.querySelector('.write-action-panel');
            if (catalogPanel) catalogPanel.style.width = '';
            if (actionPanel) actionPanel.style.width = '';
        }
        applySmallScreenDefaults();
    }
    compactWritingMedia.addEventListener?.('change', handleCompactWritingChange);
    ResponsiveDevice?.subscribe?.(applySmallScreenDefaults);
    window.addEventListener('orientationchange', applySmallScreenDefaults);
    window.applySmallScreenWritingPanels = applySmallScreenDefaults;
})();

window.ZHIYU_WRITE_LAYOUT_READY = true;
})();
