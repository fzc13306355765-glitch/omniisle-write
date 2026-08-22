// ===== ????????????? =====
        function normalizeOGOutlinePickerMode(mode) {
            return mode === 'advanced' ? 'advanced' : 'fineOutline';
        }

        function getOGOutlinePickerMode() {
            var modalMode = document.getElementById('outlinePickerModal')?.dataset?.pickerMode;
            var stateMode = ACTION_PANEL_APP_STATE.outlineGen?.outlinePickerMode;
            return normalizeOGOutlinePickerMode(modalMode || stateMode);
        }

        function isAdvancedOGOutlinePickerMode() {
            return getOGOutlinePickerMode() === 'advanced';
        }

        function openOutlinePickerModal(mode) {
            var bookName = ACTION_PANEL_APP_STATE.chapter?.book || document.getElementById('bookSel')?.value || '';
            if (!bookName) { ACTION_PANEL_TOAST.warn('请先选择书籍'); return; }
            var og = ACTION_PANEL_APP_STATE.outlineGen;
            var pickerMode = normalizeOGOutlinePickerMode(mode);
            var pickerModal = document.getElementById('outlinePickerModal');
            og.outlinePickerMode = pickerMode;
            if (pickerModal) pickerModal.dataset.pickerMode = pickerMode;
            window.activateOGOutlineSelectionBook?.(bookName);
            var advancedMode = pickerMode === 'advanced';
            og.pendingChapters = [];
            og.pendingStages = [];
            var rangeRow = document.getElementById('ogSplitRangeRow');
            if (rangeRow) rangeRow.style.display = advancedMode ? 'none' : 'flex';
            var aiButton = document.getElementById('btnOGAiSplit');
            if (aiButton) aiButton.style.display = advancedMode ? 'none' : '';
            var resultTools = document.getElementById('ogSplitResultTools');
            if (resultTools) resultTools.style.display = advancedMode ? 'none' : 'flex';
            // 更新已加载文件状态显示
            updateOGPickerMemStatus();
            updateOGSplitButtonState();
            var statusEl = document.getElementById('ogPickerStatus');
            if (statusEl) statusEl.textContent = '';
            // 隐藏旧的拆分结果区
            var splitArea = document.getElementById('ogSplitResultArea');
            if (splitArea) splitArea.style.display = 'none';
            var listEl = document.getElementById('ogSplitChapterList');
            if (listEl) listEl.innerHTML = '';
            ACTION_PANEL_MODAL.open('outlinePickerModal');
        }

        // 2. 打开模板选择器（细纲上下文）
        function openOGTemplateSelector() {
            var tab = ACTION_PANEL_APP_STATE.outlineGen.activeTab || 'fineOutline';
            var context = tab === 'decompose' ? 'decompose' : (tab === 'aiPolish' ? 'aiPolish' : 'fineOutline');
            var subCategory = context === 'decompose' ? '拆书' : (context === 'aiPolish' ? 'AI消痕' : '细纲');
            window.openTemplateSelector?.({ context: context, subCategory: subCategory });
        }

        // =================== Outline chapter parser module entry ===================

        // 6. 渲染章节文件图标堆叠
        function renderOGChapterFileStack() {
            var iconsEl = document.getElementById('ogStackChaptersIcons');
            var stackEl = document.getElementById('ogStackChapters');
            if (!iconsEl || !stackEl) return;
            iconsEl.innerHTML = '';
            var chapters = ACTION_PANEL_APP_STATE.outlineGen.chapters || [];
            // 按 num 去重
            var seen = {}; chapters = chapters.filter(function(c) { var k = c.num; if (seen[k]) return false; seen[k] = true; return true; });
            if (!chapters.length) {
                iconsEl.classList.remove('single');
                stackEl.style.display = 'none';
                return;
            }
            stackEl.style.display = 'flex';
            iconsEl.classList.add('single');
            var icon = document.createElement('div');
            icon.className = 'og-stack-icon';
            icon.innerHTML = renderLineIcon('file') + '<span class="og-icon-label">' + chapters.length + '章</span>';
            icon.title = '已拆出 ' + chapters.length + ' 个章节，点击查看';
            icon.addEventListener('click', function(e) {
                e.stopPropagation();
                window.openOGFileFloat?.('chapter');
            });
            iconsEl.appendChild(icon);
        }

        function renderOGLinkedFileStack() {
            var iconsEl = document.getElementById('ogStackLinkedIcons');
            var stackEl = document.getElementById('ogStackLinked');
            if (!iconsEl || !stackEl) return;
            iconsEl.innerHTML = '';
            var files = typeof window.getOGLinkedFiles === 'function'
                ? window.getOGLinkedFiles()
                : (Array.isArray(ACTION_PANEL_APP_STATE.outlineGen.linkedFiles)
                    ? ACTION_PANEL_APP_STATE.outlineGen.linkedFiles
                    : []);
            // 按 name 去重
            var seen = {}; files = files.filter(function(f) { var k = f.name; if (seen[k]) return false; seen[k] = true; return true; });
            if (!files.length) {
                iconsEl.classList.remove('single');
                stackEl.style.display = 'none';
                return;
            }
            stackEl.style.display = 'flex';
            iconsEl.classList.add('single');
            var icon = document.createElement('div');
            icon.className = 'og-stack-icon';
            icon.innerHTML = renderLineIcon('folder') + '<span class="og-icon-label">' + files.length + '个</span>';
            icon.title = '已关联 ' + files.length + ' 个文件，点击查看';
            icon.addEventListener('click', function(e) {
                e.stopPropagation();
                window.openOGFileFloat?.('linked');
            });
            iconsEl.appendChild(icon);
        }

        function renderOGTemplateFileStack() {
            // 不再渲染模板文件图标堆叠，模板选中后按钮文字直接变更
        }

        function copyGenLinkedToOG() {
            var seen = {};
            var genLinkedFiles = Array.isArray(ACTION_PANEL_APP_STATE.gen.linkedFiles)
                ? ACTION_PANEL_APP_STATE.gen.linkedFiles
                : [];
            ACTION_PANEL_APP_STATE.outlineGen.linkedFiles = genLinkedFiles.filter(function(f) {
                var key = [f.memFolder || f.folder || '', f.memIdx ?? f.idx ?? -1, f.name || ''].join('|');
                if (seen[key]) return false;
                seen[key] = true;
                return true;
            }).map(function(f) { return Object.assign({}, f); });
        }

        function refreshAllOGFileStacks() {
            renderOGChapterFileStack();
            renderOGLinkedFileStack();
            // 文件堆有内容时才显示包装器（否则全宽空行会把按钮挤下去）
            var cs = document.getElementById('ogStackChapters');
            var ls = document.getElementById('ogStackLinked');
            var wrap = document.querySelector('#ogFileStacksRow .og-stacks-wrap');
            if (wrap) {
                var hasVisible = (cs && cs.style.display !== 'none') || (ls && ls.style.display !== 'none');
                wrap.style.display = hasVisible ? 'flex' : 'none';
            }
        }

        // ???????????? app-action-panel-outline-file-float.js

        // 7. 旧的章节卡片渲染（已废弃，保留占位兼容）

window.getOGOutlinePickerMode = getOGOutlinePickerMode;
window.isAdvancedOGOutlinePickerMode = isAdvancedOGOutlinePickerMode;
window.refreshAllOGFileStacks = refreshAllOGFileStacks;
