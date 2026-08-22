(function(window) {
    'use strict';

        const SELECTION_FORMAT_TARGETS = '#resultBox,#outlineResultBox,#ogContentBox,#dcContentBox,#apContentBox';

        function getSelectionFormatTarget(node) {
            const el = node && (node.nodeType === 1 ? node : node.parentElement);
            return el ? el.closest(SELECTION_FORMAT_TARGETS) : null;
        }

        function showSelectionToolbarForTarget(target) {
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed) { hideSelectionToolbar(); return; }
            const text = sel.toString().trim();
            if (!text) { hideSelectionToolbar(); return; }
            const range = sel.getRangeAt(0);
            const startTarget = getSelectionFormatTarget(range.startContainer);
            const endTarget = getSelectionFormatTarget(range.endContainer);
            if (!target || startTarget !== target || endTarget !== target) { hideSelectionToolbar(); return; }
            AppState.selection.text = text;
            AppState.selection.range = range;
            AppState.selection.sourceId = target.id || '';
            const rect = range.getBoundingClientRect();
            const toolbar = document.getElementById('selectionToolbar');
            toolbar.style.left = Math.max(8, rect.left + rect.width / 2 - 100) + 'px';
            toolbar.style.top = Math.max(8, rect.top - 50) + 'px';
            toolbar.classList.add('visible');
            document.getElementById('selectionWordCount').textContent = `已选择 ${text.length} 字`;
            const polishBtn = document.getElementById('toolbarPolish');
            if (polishBtn) polishBtn.style.display = target.id === 'resultBox' ? '' : 'none';
            resetToolbarButtons();
        }

        document.querySelectorAll(SELECTION_FORMAT_TARGETS).forEach(function(target) {
            target.addEventListener('mouseup', function() {
                setTimeout(function() { showSelectionToolbarForTarget(target); }, 0);
            });
            target.addEventListener('keyup', function() {
                showSelectionToolbarForTarget(target);
            });
        });

        // 大纲框聚焦时清除占位文字
        document.getElementById('outlineResultBox')?.addEventListener('focus', function() {
            if (this.textContent.trim() === '点击「开始生成大纲」后内容将在此区域显示...') {
                this.textContent = '';
                this.style.color = '';
            }
        });

        document.addEventListener('mousedown',function(e){
            if(!e.target.closest('.selection-toolbar') && !e.target.closest(SELECTION_FORMAT_TARGETS)){ hideSelectionToolbar(); }
        });

        function hideSelectionToolbar(){
            document.getElementById('selectionToolbar').classList.remove('visible');
            const polishBtn = document.getElementById('toolbarPolish');
            if (polishBtn) polishBtn.style.display = '';
            resetToolbarButtons();
        }

        function resetToolbarButtons(){
            document.getElementById('toolbarBold').classList.remove('active');
            document.getElementById('toolbarItalic').classList.remove('active');
            document.getElementById('toolbarUnderline').classList.remove('active');
        }


        // 辅助：移除选中区域内指定类名的格式标签
        function removeFormatFromSelection(className) {
            if (!AppState.selection.range) return;
            const ancestor = AppState.selection.range.commonAncestorContainer;
            const root = ancestor.nodeType === 1 ? ancestor : ancestor.parentElement;
            if (!root) return;
            // 查找选区范围内所有匹配的格式标签并解包
            const formatEls = root.querySelectorAll('.' + className);
            formatEls.forEach(el => {
                // 检查元素是否与选区相交
                if (AppState.selection.range.intersectsNode) {
                    try {
                        if (AppState.selection.range.intersectsNode(el)) {
                            const parent = el.parentNode;
                            while (el.firstChild) parent.insertBefore(el.firstChild, el);
                            parent.removeChild(el);
                        }
                    } catch(e) {}
                } else {
                    // 降级：如果选区在元素内部
                    const parent = el.parentNode;
                    while (el.firstChild) parent.insertBefore(el.firstChild, el);
                    parent.removeChild(el);
                }
            });
        }

        document.getElementById('toolbarBold')?.addEventListener('click',async function(){
            if(!AppState.selection.range)return;
            AppState.toolbar.bold=!AppState.toolbar.bold;
            this.classList.toggle('active',AppState.toolbar.bold);
            if(AppState.toolbar.bold){
                const span=document.createElement('span');
                span.style.fontWeight='bold';
                span.className='format-bold';
                try{ AppState.selection.range.surroundContents(span); }catch(e){}
            } else {
                removeFormatFromSelection('format-bold');
            }
        });

        document.getElementById('toolbarItalic')?.addEventListener('click',async function(){
            if(!AppState.selection.range)return;
            AppState.toolbar.italic=!AppState.toolbar.italic;
            this.classList.toggle('active',AppState.toolbar.italic);
            if(AppState.toolbar.italic){
                const span=document.createElement('span');
                span.style.fontStyle='italic';
                span.className='format-italic';
                try{ AppState.selection.range.surroundContents(span); }catch(e){}
            } else {
                removeFormatFromSelection('format-italic');
            }
        });

        document.getElementById('toolbarUnderline')?.addEventListener('click',async function(){
            if(!AppState.selection.range)return;
            AppState.toolbar.underline=!AppState.toolbar.underline;
            this.classList.toggle('active',AppState.toolbar.underline);
            if(AppState.toolbar.underline){
                const span=document.createElement('span');
                span.style.textDecoration='underline';
                span.className='format-underline';
                try{ AppState.selection.range.surroundContents(span); }catch(e){}
            } else {
                removeFormatFromSelection('format-underline');
            }
        });

        document.getElementById('toolbarColor')?.addEventListener('input',function(e){
            if(!AppState.selection.range)return;
            const span=document.createElement('span');
            span.style.color=e.target.value;
            span.className='format-color';
            try{ AppState.selection.range.surroundContents(span); }catch(ex){ console.log('无法改色'); }
            this.value='#000000';
        });


    window.getSelectionFormatTarget = getSelectionFormatTarget;
    window.showSelectionToolbarForTarget = showSelectionToolbarForTarget;
    window.hideSelectionToolbar = hideSelectionToolbar;
    window.resetToolbarButtons = resetToolbarButtons;
    window.removeFormatFromSelection = removeFormatFromSelection;
    window.ZHIYU_SELECTION_FORMATTING_READY = true;
})(window);
