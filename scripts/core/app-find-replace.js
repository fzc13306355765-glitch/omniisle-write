(function(window) {
    'use strict';

        function pendingFindReplaceTarget(editor) {
            return String(editor?.dataset?.editingRefBookName || '') + '\n' + String(editor?.dataset?.editingRefFile || '');
        }

        function getPendingFindReplacements(editor) {
            try {
                const data = JSON.parse(editor?.dataset?.pendingFindReplacements || '{}');
                if (data.target !== pendingFindReplaceTarget(editor) || !Array.isArray(data.items)) return [];
                return data.items.filter(item => item?.from && item.from !== item.to);
            } catch (error) {
                return [];
            }
        }

        function recordPendingFindReplacement(editor, from, to) {
            if (!editor?.dataset?.editingRefFile || !from || from === to) return;
            const items = getPendingFindReplacements(editor);
            if (!items.some(item => item.from === from && item.to === to)) items.push({ from, to });
            editor.dataset.pendingFindReplacements = JSON.stringify({
                target: pendingFindReplaceTarget(editor),
                items: items.slice(-20)
            });
        }

        function clearPendingFindReplacements(editor) {
            if (editor?.dataset) editor.dataset.pendingFindReplacements = '';
        }

        function getTextNodes(root) {
            const nodes = [];
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) nodes.push(walker.currentNode);
            return nodes;
        }

        function stripFindMarks(root) {
            root.querySelectorAll('mark[data-fr]').forEach(mark => {
                const parent = mark.parentNode;
                mark.replaceWith(document.createTextNode(mark.textContent));
                parent?.normalize?.();
            });
        }

        function highlightTextMatches(root, regex) {
            getTextNodes(root).forEach(function(node) {
                const value = node.nodeValue || '';
                regex.lastIndex = 0;
                let match;
                let cursor = 0;
                const fragment = document.createDocumentFragment();
                while ((match = regex.exec(value)) !== null) {
                    if (match.index > cursor) fragment.appendChild(document.createTextNode(value.slice(cursor, match.index)));
                    const mark = document.createElement('mark');
                    mark.dataset.fr = '1';
                    mark.style.cssText = 'background:#ffeb3b;color:#000;padding:0 2px;';
                    mark.textContent = match[0];
                    fragment.appendChild(mark);
                    cursor = match.index + match[0].length;
                    if (!match[0].length) break;
                }
                if (!cursor) return;
                if (cursor < value.length) fragment.appendChild(document.createTextNode(value.slice(cursor)));
                node.replaceWith(fragment);
            });
        }

        function replaceInTextNodes(root, regex, replacement) {
            let count = 0;
            getTextNodes(root).forEach(function(node) {
                regex.lastIndex = 0;
                node.nodeValue = String(node.nodeValue || '').replace(regex, function() {
                    count += 1;
                    return replacement;
                });
            });
            return count;
        }

        // ===== 查询替换工具栏 =====
        // Ctrl+H 弹出工具栏
        document.addEventListener('keydown', function(e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
                e.preventDefault();
                toggleFindReplaceBar();
            }
        });

        function toggleFindReplaceBar() {
            let bar = document.getElementById('findReplaceBar');
            if (bar) {
                bar.style.display = bar.style.display === 'none' ? 'flex' : 'none';
                if (bar.style.display === 'flex') document.getElementById('frFindInput').focus();
                return;
            }
            bar = document.createElement('div');
            bar.id = 'findReplaceBar';
            bar.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:999;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:12px 16px;display:flex;flex-direction:column;gap:6px;box-shadow:0 4px 24px rgba(0,0,0,0.2);min-width:360px;';
            bar.innerHTML = `
                <div style="display:flex;align-items:center;gap:8px;">
                    <input id="frFindInput" placeholder="查找内容..." style="flex:1;padding:6px 10px;font-size:13px;">
                    <span style="font-size:12px;color:var(--text-muted);white-space:nowrap;min-width:30px;" id="frMatchCount"></span>
                    <button class="btn btn-outline btn-sm" id="frPrev" style="padding:2px 8px;font-size:12px;" title="上一个">▲</button>
                    <button class="btn btn-outline btn-sm" id="frNext" style="padding:2px 8px;font-size:12px;" title="下一个">▼</button>
                    <span style="font-size:14px;cursor:pointer;color:var(--text-muted);" id="frClose" title="关闭">✕</span>
                </div>
                <div id="frReplaceRow" style="display:flex;align-items:center;gap:8px;">
                    <input id="frReplaceInput" placeholder="替换为..." style="flex:1;padding:6px 10px;font-size:13px;">
                    <button class="btn btn-outline btn-sm" id="frReplaceOne" style="padding:4px 10px;font-size:12px;">替换</button>
                    <button class="btn btn-dark btn-sm" id="frReplaceAll" style="padding:4px 10px;font-size:12px;">全部替换</button>
                </div>`;
            document.body.appendChild(bar);

            let matches = [], currentIdx = -1;

            function doFind() {
                const resultBox = document.getElementById('resultBox');
                const find = document.getElementById('frFindInput').value;
                // 先清理旧 mark 标签
                stripFindMarks(resultBox);

                if (!find) {
                    matches = []; currentIdx = -1; updateCount(); return;
                }

                const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(escaped, 'gi');
                highlightTextMatches(resultBox, regex);
                matches = Array.from(resultBox.querySelectorAll('mark[data-fr]'));
                currentIdx = matches.length > 0 ? 0 : -1;
                updateCount();

                if (matches.length > 0) scrollToCurrent();
            }

            function scrollToCurrent() {
                if (currentIdx < 0) return;
                const marks = document.querySelectorAll('#resultBox mark[data-fr]');
                marks.forEach((mk, i) => {
                    mk.style.background = i === currentIdx ? '#ff9800' : '#ffeb3b';
                    mk.style.color = i === currentIdx ? '#fff' : '#000';
                });
                if (marks[currentIdx]) {
                    marks[currentIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }

            function updateCount() {
                document.getElementById('frMatchCount').textContent = matches.length > 0 ? matches.length + '个' : '';
            }

            document.getElementById('frNext')?.addEventListener('click', function() {
                if (matches.length === 0) return;
                currentIdx = (currentIdx + 1) % matches.length;
                scrollToCurrent();
            });
            document.getElementById('frPrev')?.addEventListener('click', function() {
                if (matches.length === 0) return;
                currentIdx = (currentIdx - 1 + matches.length) % matches.length;
                scrollToCurrent();
            });
            document.getElementById('frReplaceOne')?.addEventListener('click', function() {
                if (currentIdx < 0 || matches.length === 0) return;
                const replace = document.getElementById('frReplaceInput').value;
                if (!replace.trim()) { Toast.warn('替换内容不能为空，防止误删无法恢复'); return; }
                const marks = document.querySelectorAll('#resultBox mark[data-fr]');
                if (marks[currentIdx]) {
                    const find = document.getElementById('frFindInput').value;
                    marks[currentIdx].replaceWith(document.createTextNode(replace));
                    recordPendingFindReplacement(document.getElementById('resultBox'), find, replace);
                    document.getElementById('resultBox').dispatchEvent(new Event('input', { bubbles: true }));
                    stripFindMarks(document.getElementById('resultBox'));
                    doFind();
                }
            });
            document.getElementById('frReplaceAll')?.addEventListener('click', function() {
                if (matches.length === 0) return;
                const replace = document.getElementById('frReplaceInput').value;
                if (!replace.trim()) { Toast.warn('替换内容不能为空，防止误删无法恢复'); return; }
                const resultBox = document.getElementById('resultBox');
                const find = document.getElementById('frFindInput').value;
                const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                stripFindMarks(resultBox);
                const replacedCount = replaceInTextNodes(resultBox, new RegExp(escaped, 'gi'), replace);
                if (replacedCount > 0) {
                    recordPendingFindReplacement(resultBox, find, replace);
                    resultBox.dispatchEvent(new Event('input', { bubbles: true }));
                }
                Toast.show('已替换 ' + replacedCount + ' 处');
                document.getElementById('frFindInput').value = '';
                document.getElementById('frReplaceInput').value = '';
                matches = []; currentIdx = -1; updateCount();
            });
            document.getElementById('frClose')?.addEventListener('click', function() {
                const resultBox = document.getElementById('resultBox');
                stripFindMarks(resultBox);
                bar.style.display = 'none';
            });

            document.getElementById('frFindInput')?.addEventListener('input', doFind);
            document.getElementById('frFindInput').focus();
        }

        // 查询替换按钮打开工具栏

        // 查询替换按钮（Ctrl+H 快捷键）
        // 查询替换按钮打开工具栏
        document.getElementById('btnFindReplace')?.addEventListener('click', function() {
            toggleFindReplaceBar();
        });


    window.toggleFindReplaceBar = toggleFindReplaceBar;
    window.getPendingFindReplacements = getPendingFindReplacements;
    window.clearPendingFindReplacements = clearPendingFindReplacements;
    window.ZHIYU_FIND_REPLACE_READY = true;
})(window);
