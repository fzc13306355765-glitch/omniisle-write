// ===== 细纲大纲拆分结果显示辅助 =====
(function(){
    function renderAdvancedStageSplitResultList() {
        var area = document.getElementById('ogSplitResultArea');
        var listEl = document.getElementById('ogSplitChapterList');
        var countEl = document.getElementById('ogSplitCount');
        var fileNameEl = document.getElementById('ogSplitFileName');
        var tools = document.getElementById('ogSplitResultTools');
        var stages = ACTION_PANEL_APP_STATE.outlineGen.pendingStages || [];
        if (!area || !listEl) return;
        if (tools) tools.style.display = 'none';
        if (!stages.length) { area.style.display = 'none'; return; }
        area.style.display = 'block';
        var checkedFiles = (window.getOGOutlineSelectionList?.() || []).filter(function(file) { return file.checked; });
        if (fileNameEl) fileNameEl.textContent = '《' + (checkedFiles[0]?.name || '母纲文件') + '》';
        if (countEl) countEl.textContent = '已识别 ' + stages.length + ' 个阶段';
        listEl.innerHTML = '';
        stages.forEach(function(stage) {
            var row = document.createElement('div');
            row.className = 'outline-advanced-stage-preview-row';
            var title = document.createElement('strong');
            title.textContent = stage.key + '：' + (stage.title || '未命名阶段');
            var preview = document.createElement('span');
            preview.textContent = String(stage.block || '').replace(/^[^\n\r]*(?:\r?\n)?/, '').replace(/\s+/g, ' ').slice(0, 100) || '已识别阶段标题';
            row.append(title, preview);
            listEl.appendChild(row);
        });
    }

    function renderOGSplitResultList() {
        if (window.isAdvancedOGOutlinePickerMode?.()) {
            renderAdvancedStageSplitResultList();
            return;
        }
        var area = document.getElementById('ogSplitResultArea');
        var listEl = document.getElementById('ogSplitChapterList');
        var countEl = document.getElementById('ogSplitCount');
        var fileNameEl = document.getElementById('ogSplitFileName');
        if (!area || !listEl) return;
        var chapters = ACTION_PANEL_APP_STATE.outlineGen.pendingChapters || [];
        if (!chapters.length) { area.style.display = 'none'; return; }
        area.style.display = 'block';
        var checkedFiles = (window.getOGOutlineSelectionList?.() || []).filter(function(f) { return f.checked; });
        if (fileNameEl) fileNameEl.textContent = '《' + (checkedFiles[0]?.name || '大纲文件') + '》';
        listEl.innerHTML = '';
        chapters.forEach(function(ch, idx) {
            var wordCount = (ch.content || '').replace(/\s/g, '').length;
            var preview = (ch.content || '').replace(/\s/g, '').slice(0, 80);
            var div = document.createElement('div');
            div.style.cssText = 'display:flex;align-items:flex-start;gap:8px;padding:8px 10px;cursor:pointer;border-radius:6px;border-bottom:1px solid #f0f0f0;';
            div.onmouseenter = function() { this.style.background = '#f5f8ff'; };
            div.onmouseleave = function() { this.style.background = ''; };
            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.style.cssText = 'width:15px;height:15px;cursor:pointer;flex-shrink:0;margin-top:2px;';
            cb.checked = ch.checked !== false;
            cb.dataset.idx = idx;
            div.appendChild(cb);
            var info = document.createElement('div');
            info.style.cssText = 'flex:1;min-width:0;';
            var titleLine = document.createElement('div');
            titleLine.style.cssText = 'font-size:13px;font-weight:600;';
            titleLine.innerHTML = renderLineIcon('folder') + ' 第' + ch.num + '章' + (ch.title ? ' ' + ACTION_PANEL_UTILS.escapeHtml(ch.title) : '');
            info.appendChild(titleLine);
            var wordCountLine = document.createElement('div');
            wordCountLine.style.cssText = 'font-size:11px;color:#999;margin-top:2px;';
            wordCountLine.textContent = wordCount.toLocaleString() + ' 字';
            info.appendChild(wordCountLine);
            var previewDiv = document.createElement('div');
            previewDiv.style.cssText = 'font-size:11px;color:#999;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            previewDiv.textContent = preview + (preview.length >= 80 ? '…' : '');
            info.appendChild(previewDiv);
            div.appendChild(info);
            div.addEventListener('click', function(e) {
                if (e.target === cb) return;
                cb.checked = !cb.checked;
                updateOGSplitCount();
            });
            cb.addEventListener('change', function() { updateOGSplitCount(); });
            listEl.appendChild(div);
        });
        updateOGSplitCount();
    }

    function updateOGSplitCount() {
        var countEl = document.getElementById('ogSplitCount');
        var total = (ACTION_PANEL_APP_STATE.outlineGen.pendingChapters || []).length;
        var cbs = document.querySelectorAll('#ogSplitChapterList input[type="checkbox"]');
        var checked = 0;
        cbs.forEach(function(cb) { if (cb.checked) checked++; });
        if (countEl) countEl.textContent = '已选: ' + checked + '/' + total;
    }

    function showChapterPreviewInModal(ch) {
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);z-index:99999;display:flex;align-items:center;justify-content:center;';
        var box = document.createElement('div');
        box.style.cssText = 'background:var(--bg-card);border-radius:12px;padding:16px;width:500px;max-width:90vw;max-height:70vh;overflow-y:auto;box-shadow:0 8px 30px rgba(0,0,0,0.2);';
        var header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;';
        var title = document.createElement('strong');
        title.textContent = '第' + String(ch.num || '') + '章' + (ch.title ? '：' + ch.title : '');
        var close = document.createElement('button');
        close.type = 'button';
        close.style.cssText = 'cursor:pointer;font-size:20px;border:0;background:transparent;';
        close.setAttribute('aria-label', '关闭章节预览');
        close.textContent = '×';
        header.append(title, close);
        var content = document.createElement('div');
        content.style.cssText = 'white-space:pre-wrap;font-size:13px;line-height:1.7;max-height:50vh;overflow-y:auto;';
        content.textContent = ch.content || '暂无内容';
        box.append(header, content);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
        close.addEventListener('click', function() { overlay.remove(); });
    }

    window.renderOGSplitResultList = renderOGSplitResultList;
    window.renderAdvancedStageSplitResultList = renderAdvancedStageSplitResultList;
    window.updateOGSplitCount = updateOGSplitCount;
    window.showChapterPreviewInModal = showChapterPreviewInModal;
    window.ZHIYU_OG_SPLIT_RESULT_READY = true;
})();
