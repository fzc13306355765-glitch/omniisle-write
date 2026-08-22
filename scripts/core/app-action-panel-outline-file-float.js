// ===== Action panel outline file float =====
(function initActionPanelOutlineFileFloatModule() {
    // === 文件堆浮动窗：文件列表 + 查看/编辑 ===
    var _ogFloatCurFile = null; // { label, content, fileName }
    var _ogFloatFilter = null;       // chapter | linked | decompose | null
    var _ogBatchMode = false;       // 批量移除模式
    var _ogBatchSelected = {};      // { key: true }
    var _ogFloatVisibleKeys = [];   // 当前浮窗里实际展示的文件 key

    function openOGFileFloat(filter) {
        var fl = document.getElementById('ogFileFloat');
        if (!fl) return;
        if (_ogBatchMode) exitOGBatchMode();
        _ogFloatFilter = filter || null;
        fl.classList.add('open');
        refreshOGFileList();
    }

    function refreshOGFileList() {
        var list = document.getElementById('ogFileList');
        if (!list) return;
        list.innerHTML = '';
        _ogFloatVisibleKeys = [];
        var chips = [];
        var activeTab = ACTION_PANEL_APP_STATE.outlineGen.activeTab || '';
        // 章节 — 仅细纲Tab显示
        if (activeTab === 'fineOutline' && (!_ogFloatFilter || _ogFloatFilter === 'chapter')) {
            var chapters = ACTION_PANEL_APP_STATE.outlineGen.chapters || [];
            chapters.forEach(function(ch) {
                chips.push({ label: '第' + ch.num + '章', icon: 'file', content: ch.content || '', fileName: null, type: 'chapter', num: ch.num });
            });
        }
        // 拆书导入章节 — 仅拆书Tab显示
        if (activeTab === 'decompose' && (!_ogFloatFilter || _ogFloatFilter === 'decompose')) {
            var decompChapters = ACTION_PANEL_APP_STATE.outlineGen.decomposeChapters || [];
            decompChapters.forEach(function(dch, idx) {
                chips.push({ label: dch.name || ('第' + (dch.ci + 1) + '章'), icon: 'file', content: dch.content || '', fileName: null, type: 'decompose', vi: dch.vi, ci: dch.ci });
            });
        }
        // 关联文件 — 仅细纲Tab显示
        if (activeTab === 'fineOutline' && (!_ogFloatFilter || _ogFloatFilter === 'linked')) {
            var files = typeof window.getOGLinkedFiles === 'function'
                ? window.getOGLinkedFiles()
                : (Array.isArray(ACTION_PANEL_APP_STATE.outlineGen.linkedFiles)
                    ? ACTION_PANEL_APP_STATE.outlineGen.linkedFiles
                    : []);
            var seen = {};
            files.forEach(function(f) {
                if (seen[f.name]) return; seen[f.name] = true;
                var ref = getRefFileContent(ACTION_PANEL_APP_STATE.chapter.book, f.name);
                chips.push({ label: f.name, icon: 'folder', content: ref?.content || '', fileName: f.name, type: 'linked' });
            });
        }
        if (chips.length === 0) {
            var emptyText = _ogFloatFilter === 'chapter' ? '暂无正则拆分章节' : (_ogFloatFilter === 'linked' ? '暂无关联文件' : '暂无文件');
            list.innerHTML = '<span style="color:#888;font-size:12px;">' + emptyText + '</span>';
            return;
        }
        chips.forEach(function(c) {
            var chipKey = getOGChipKey(c);
            _ogFloatVisibleKeys.push(chipKey);
            var chip = document.createElement('span');
            if (_ogBatchMode) {
                // 批量模式：inline-block + 勾选框绝对定位右上角
                chip.style.cssText = 'display:inline-block;position:relative;padding:6px 22px 6px 12px;background:#ebf5ff;border:1px solid #c8e4f8;border-radius:8px;cursor:pointer;font-size:12px;font-weight:500;color:#1976d2;white-space:nowrap;';
                var cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.style.cssText = 'position:absolute;top:4px;right:4px;width:14px;height:14px;margin:0;cursor:pointer;';
                cb.checked = !!_ogBatchSelected[chipKey];
                cb.addEventListener('change', function() {
                    if (cb.checked) _ogBatchSelected[chipKey] = true;
                    else delete _ogBatchSelected[chipKey];
                    updateOGBatchActionState();
                });
                chip.appendChild(cb);
            } else {
                chip.className = 'og-file-chip';
            }
            var labelSpan = document.createElement('span');
            labelSpan.innerHTML = renderLineIcon(c.icon) + ' ' + ACTION_PANEL_UTILS.escapeHtml(c.label);
            chip.appendChild(labelSpan);
            chip.title = c.label;
            chip.addEventListener('click', function(e) {
                if (_ogBatchMode) {
                    // 点 chip 时切换 checkbox
                    var cbEl = chip.querySelector('input[type="checkbox"]');
                    if (cbEl) { cbEl.checked = !cbEl.checked; cbEl.dispatchEvent(new Event('change')); }
                    return;
                }
                selectOGFileInFloat(c.label, c.content, c.fileName, c.type, c.vi, c.ci);
            });
            list.appendChild(chip);
        });
    }

    function getOGChipKey(c) {
        if (c.type === 'chapter') return 'chapter_' + c.num;
        if (c.type === 'decompose') return 'decompose_' + (c.vi != null ? c.vi : '') + '_' + (c.ci != null ? c.ci : '');
        if (c.type === 'linked') return 'linked_' + (c.fileName || '');
        return c.label || 'unknown';
    }

    function setOGBatchToolsVisible(visible) {
        var btnSelectAll = document.getElementById('btnOGBatchSelectAll');
        var btnInvert = document.getElementById('btnOGBatchInvert');
        if (btnSelectAll) btnSelectAll.style.display = visible ? '' : 'none';
        if (btnInvert) btnInvert.style.display = visible ? '' : 'none';
    }

    function updateOGBatchActionState() {
        var count = Object.keys(_ogBatchSelected).length;
        var btn = document.getElementById('btnRemoveOGFile');
        if (btn) btn.textContent = _ogBatchMode ? ('确定移除' + (count ? '(' + count + ')' : '')) : '移除参考';
    }

    function selectAllOGBatchFiles() {
        if (!_ogBatchMode) return;
        if (!_ogFloatVisibleKeys.length) { ACTION_PANEL_TOAST.warn('当前没有可选择的文件'); return; }
        _ogFloatVisibleKeys.forEach(function(key) { _ogBatchSelected[key] = true; });
        refreshOGFileList();
        updateOGBatchActionState();
    }

    function invertOGBatchFiles() {
        if (!_ogBatchMode) return;
        if (!_ogFloatVisibleKeys.length) { ACTION_PANEL_TOAST.warn('当前没有可选择的文件'); return; }
        _ogFloatVisibleKeys.forEach(function(key) {
            if (_ogBatchSelected[key]) delete _ogBatchSelected[key];
            else _ogBatchSelected[key] = true;
        });
        refreshOGFileList();
        updateOGBatchActionState();
    }

    function selectOGFileInFloat(label, content, fileName, type, vi, ci) {
        if (_ogBatchMode) return; // 批量模式下不打开编辑器
        _ogFloatCurFile = { label: label, content: content, fileName: fileName, type: type, vi: vi, ci: ci };
        // 高亮当前 chip
        document.querySelectorAll('.og-file-chip').forEach(function(c) { c.classList.remove('active'); });
        var chips = document.querySelectorAll('.og-file-chip');
        chips.forEach(function(c) { if (c.textContent && c.textContent.indexOf(label) >= 0) c.classList.add('active'); });
        // 显示编辑器
        var area = document.getElementById('ogFileEditorArea');
        var labelEl = document.getElementById('ogFileEditorLabel');
        var editor = document.getElementById('ogFileEditor');
        var empty = document.getElementById('ogFileEmpty');
        if (area) area.style.display = 'block';
        if (labelEl) labelEl.textContent = '编辑：' + label;
        if (editor) {
            editor.value = content;
            editor.style.display = '';
        }
        if (empty) empty.style.display = 'none';
    }

    function saveOGFileInFloat() {
        if (!_ogFloatCurFile) { ACTION_PANEL_TOAST.warn('请先选择要保存的文件'); return; }
        var editor = document.getElementById('ogFileEditor');
        if (!editor) return;
        var newContent = editor.value;
        _ogFloatCurFile.content = newContent;
        if (_ogFloatCurFile.fileName) {
            // 关联文件 → 写入记忆库
            var ok = saveRefFileContent(ACTION_PANEL_APP_STATE.chapter.book, _ogFloatCurFile.fileName, newContent);
            if (ok) ACTION_PANEL_TOAST.success('「' + _ogFloatCurFile.fileName + '」已保存');
            else ACTION_PANEL_TOAST.error('保存失败');
        } else if (_ogFloatCurFile.type === 'decompose') {
            // 拆书导入章节 → 更新 ACTION_PANEL_APP_STATE.outlineGen.decomposeChapters
            var dc = ACTION_PANEL_APP_STATE.outlineGen.decomposeChapters || [];
            for (var j = 0; j < dc.length; j++) {
                if (dc[j].vi === _ogFloatCurFile.vi && dc[j].ci === _ogFloatCurFile.ci) {
                    dc[j].content = newContent;
                    break;
                }
            }
            ACTION_PANEL_TOAST.success('「' + _ogFloatCurFile.label + '」已保存');
        } else {
            // 章节内容 → 更新 ACTION_PANEL_APP_STATE.outlineGen.chapters
            var chapters = ACTION_PANEL_APP_STATE.outlineGen.chapters || [];
            for (var i = 0; i < chapters.length; i++) {
                if (_ogFloatCurFile.type === 'chapter' && '第' + chapters[i].num + '章' === _ogFloatCurFile.label) {
                    chapters[i].content = newContent;
                    break;
                }
            }
            ACTION_PANEL_TOAST.success('「' + _ogFloatCurFile.label + '」已保存');
        }
    }

    function removeOGFileFromFloat() {
        if (!_ogBatchMode) {
            // 进入批量移除模式
            _ogBatchMode = true;
            _ogBatchSelected = {};
            // 按钮切换：保存隐藏，取消显示，移除→确定移除
            var btnSave = document.getElementById('btnSaveOGFile');
            var btnCancel = document.getElementById('btnOGCancelBatch');
            var btnEditorLabel = document.getElementById('ogFileEditorLabel');
            if (btnSave) btnSave.style.display = 'none';
            if (btnCancel) btnCancel.style.display = '';
            setOGBatchToolsVisible(true);
            updateOGBatchActionState();
            // 编辑器区域显示（按钮在里面），但编辑器隐藏
            var area = document.getElementById('ogFileEditorArea');
            var empty = document.getElementById('ogFileEmpty');
            var editor = document.getElementById('ogFileEditor');
            if (area) area.style.display = 'block';
            if (editor) editor.style.display = 'none';
            if (btnEditorLabel) btnEditorLabel.textContent = '批量移除';
            if (empty) empty.style.display = 'none';
            _ogFloatCurFile = null;
            refreshOGFileList();
            return;
        }
        // 确认移除：执行批量删除
        var keys = Object.keys(_ogBatchSelected);
        if (keys.length === 0) { ACTION_PANEL_TOAST.warn('请先勾选要移除的文件'); return; }
        var og = ACTION_PANEL_APP_STATE.outlineGen;
        var removeChNums = [], removeDcKeys = [], removeLinkedNames = [];
        keys.forEach(function(key) {
            if (key.indexOf('chapter_') === 0) removeChNums.push(Number(key.replace('chapter_', '')));
            else if (key.indexOf('decompose_') === 0) removeDcKeys.push(key.replace('decompose_', ''));
            else if (key.indexOf('linked_') === 0) removeLinkedNames.push(key.replace('linked_', ''));
        });
        if (removeChNums.length > 0) {
            og.chapters = (og.chapters || []).filter(function(ch) { return removeChNums.indexOf(ch.num) === -1; });
        }
        if (removeDcKeys.length > 0) {
            og.decomposeChapters = (og.decomposeChapters || []).filter(function(dch) {
                return removeDcKeys.indexOf(dch.vi + '_' + dch.ci) === -1;
            });
        }
        if (removeLinkedNames.length > 0) {
            og.linkedFiles = (og.linkedFiles || []).filter(function(f) {
                return removeLinkedNames.indexOf((f.name || '').trim()) === -1;
            });
        }
        exitOGBatchMode();
        refreshOGFileList();
        refreshAllOGFileStacks();
        ACTION_PANEL_TOAST.success('已移除 ' + keys.length + ' 个文件');
    }

    function exitOGBatchMode() {
        _ogBatchMode = false;
        _ogBatchSelected = {};
        // 恢复按钮
        var btnSave = document.getElementById('btnSaveOGFile');
        var btnCancel = document.getElementById('btnOGCancelBatch');
        var btnEditorLabel = document.getElementById('ogFileEditorLabel');
        var area = document.getElementById('ogFileEditorArea');
        var editor = document.getElementById('ogFileEditor');
        var empty = document.getElementById('ogFileEmpty');
        if (btnSave) btnSave.style.display = '';
        if (btnCancel) btnCancel.style.display = 'none';
        setOGBatchToolsVisible(false);
        updateOGBatchActionState();
        if (btnEditorLabel) btnEditorLabel.textContent = '编辑文件';
        _ogFloatCurFile = null;
        if (area) area.style.display = 'block';
        if (editor) {
            editor.value = '';
            editor.style.display = 'none';
        }
        if (empty) empty.style.display = 'block';
    }

    // 浮动窗拖拽 + 关闭
    (function initOGFileFloat() {
        var fl = document.getElementById('ogFileFloat');
        var btnClose = document.getElementById('btnCloseOGFile');
        var header = fl ? fl.querySelector('.og-file-float-header') : null;
        var btnSave = document.getElementById('btnSaveOGFile');
        var btnRemove = document.getElementById('btnRemoveOGFile');
        var btnCancelBatch = document.getElementById('btnOGCancelBatch');
        var btnSelectAllBatch = document.getElementById('btnOGBatchSelectAll');
        var btnInvertBatch = document.getElementById('btnOGBatchInvert');
        if (btnClose && fl) btnClose.addEventListener('click', function() { exitOGBatchMode(); _ogFloatFilter = null; fl.classList.remove('open'); });
        if (btnSave) btnSave.addEventListener('click', saveOGFileInFloat);
        if (btnRemove) btnRemove.addEventListener('click', removeOGFileFromFloat);
        if (btnCancelBatch) btnCancelBatch.addEventListener('click', function() { exitOGBatchMode(); refreshOGFileList(); });
        if (btnSelectAllBatch) btnSelectAllBatch.addEventListener('click', selectAllOGBatchFiles);
        if (btnInvertBatch) btnInvertBatch.addEventListener('click', invertOGBatchFiles);
        // 拖拽
        var dragInfo = null;
        if (header) {
            header.addEventListener('pointerdown', function(e) {
                if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
                if (e.target.classList.contains('og-file-float-close')) return;
                e.preventDefault();
                var rect = fl.getBoundingClientRect();
                dragInfo = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, startLeft: rect.left, startTop: rect.top };
                fl.style.right = 'auto';
                fl.style.left = rect.left + 'px';
                fl.style.top = rect.top + 'px';
                fl.style.setProperty('resize', 'none');
                header.setPointerCapture?.(e.pointerId);
                document.body.style.userSelect = 'none';
            });
        }
        document.addEventListener('pointermove', function(e) {
            if (!dragInfo || e.pointerId !== dragInfo.pointerId) return;
            var dx = e.clientX - dragInfo.startX;
            var dy = e.clientY - dragInfo.startY;
            fl.style.left = Math.max(0, Math.min(window.innerWidth - fl.offsetWidth, dragInfo.startLeft + dx)) + 'px';
            fl.style.top = Math.max(0, Math.min(window.innerHeight - 40, dragInfo.startTop + dy)) + 'px';
        });
        function finishOGFloatDrag(e) {
            if (!dragInfo || (e && e.pointerId !== dragInfo.pointerId)) return;
            dragInfo = null;
            fl.style.setProperty('resize', 'both');
            document.body.style.userSelect = '';
        }
        document.addEventListener('pointerup', finishOGFloatDrag);
        document.addEventListener('pointercancel', finishOGFloatDrag);
    })();

    window.openOGFileFloat = openOGFileFloat;
    window.refreshOGFileList = refreshOGFileList;
    window.selectOGFileInFloat = selectOGFileInFloat;
    window.saveOGFileInFloat = saveOGFileInFloat;
    window.removeOGFileFromFloat = removeOGFileFromFloat;
    window.selectAllOGBatchFiles = selectAllOGBatchFiles;
    window.invertOGBatchFiles = invertOGBatchFiles;
    window.updateOGBatchActionState = updateOGBatchActionState;
    window.exitOGBatchMode = exitOGBatchMode;
    window.ZHIYU_OG_OUTLINE_FILE_FLOAT_READY = true;
})();
