// ===== ???????? =====
        function normalizeDecomposePlainText(value) {
            var source = String(value || '');
            if (!source) return '';
            if (typeof DOMParser === 'function' && /<\/?[a-z][\s\S]*>/i.test(source)) {
                var documentNode = new DOMParser().parseFromString(source, 'text/html');
                documentNode.querySelectorAll('script,style,noscript').forEach(function(node) { node.remove(); });
                documentNode.querySelectorAll('br').forEach(function(node) {
                    node.replaceWith(documentNode.createTextNode('\n'));
                });
                documentNode.querySelectorAll('p,div,h1,h2,h3,h4,h5,h6,li,blockquote,section,article').forEach(function(node) {
                    node.appendChild(documentNode.createTextNode('\n'));
                });
                source = documentNode.body?.textContent || '';
            } else if (typeof document !== 'undefined') {
                var decoder = document.createElement('textarea');
                decoder.innerHTML = source;
                source = decoder.value;
            }
            return source
                .replace(/\u00a0/g, ' ')
                .replace(/[ \t]+\n/g, '\n')
                .replace(/\n[ \t]+/g, '\n')
                .replace(/[ \t]{2,}/g, ' ')
                .replace(/\n{3,}/g, '\n\n')
                .trim();
        }
        window.normalizeDecomposePlainText = normalizeDecomposePlainText;
        var DECOMPOSE_IMPORT_CHAPTER_LIMIT = 10;
        window.ZHIYU_DECOMPOSE_IMPORT_CHAPTER_LIMIT = DECOMPOSE_IMPORT_CHAPTER_LIMIT;

        function setDecomposeCheckboxState(checkbox, nextChecked, listId, countId) {
            var list = document.getElementById(listId || 'decomposeChapterList');
            if (!checkbox || !list) return false;
            var checkedWithoutCurrent = list.querySelectorAll('input:checked').length - (checkbox.checked ? 1 : 0);
            if (nextChecked && checkedWithoutCurrent >= DECOMPOSE_IMPORT_CHAPTER_LIMIT) {
                checkbox.checked = false;
                ACTION_PANEL_TOAST.warn('最多选择' + DECOMPOSE_IMPORT_CHAPTER_LIMIT + '章');
                updateDecomposeChapterCount(listId, countId);
                return false;
            }
            checkbox.checked = nextChecked;
            updateDecomposeChapterCount(listId, countId);
            return true;
        }

        function openDecomposeImportModal() {
            var bookName = ACTION_PANEL_APP_STATE.chapter.book;
            var book = null;
            if (bookName) {
                var books = gB();
                book = books[bookName];
            }
            // 收集所有章节（无书时为空）
            var allChapters = [];
            if (book) {
                book.volumes.forEach(function(vol, vi) {
                    if (vol.title === '参考文件') return;
                    (vol.chapters || []).forEach(function(ch, ci) {
                        allChapters.push({
                            vi: vi,
                            ci: ci,
                            volName: vol.name || vol.title,
                            chName: ch.name,
                            content: normalizeDecomposePlainText(ch.content || '')
                        });
                    });
                });
            }
            // 存储临时列表
            window._decomposeAllChapters = allChapters;
            renderDecomposeChapterList();
            ACTION_PANEL_MODAL.open('decomposeImportModal');
        }

        function renderDecomposeChapterList() {
            var all = window._decomposeAllChapters || [];
            var selected = ACTION_PANEL_APP_STATE.outlineGen.decomposeChapters || [];
            var list = document.getElementById('decomposeChapterList');
            if (!list) return;
            // 显示书籍名
            var bookNameEl = document.getElementById('decomposeBookName');
            if (bookNameEl) bookNameEl.textContent = '《' + (ACTION_PANEL_APP_STATE.chapter.book || '') + '》';
            list.innerHTML = '';
            all.forEach(function(ch) {
                var isChecked = selected.some(function(s) { return s.vi === ch.vi && s.ci === ch.ci; });
                var wordCount = (ch.content || '').replace(/\s/g, '').length;
                var preview = (ch.content || '').replace(/\s+/g, ' ').trim().slice(0, 80);
                var div = document.createElement('div');
                div.style.cssText = 'display:flex;align-items:flex-start;gap:8px;padding:8px 10px;cursor:pointer;border-radius:6px;border-bottom:1px solid #f0f0f0;';
                div.onmouseenter = function() { this.style.background = '#f5f8ff'; };
                div.onmouseleave = function() { this.style.background = ''; };
                var cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.style.cssText = 'width:15px;height:15px;cursor:pointer;flex-shrink:0;margin-top:2px;';
                cb.checked = isChecked;
                cb.dataset.vi = ch.vi;
                cb.dataset.ci = ch.ci;
                div.appendChild(cb);
                var info = document.createElement('div');
                info.style.cssText = 'flex:1;min-width:0;';
                var titleLine = document.createElement('div');
                titleLine.style.cssText = 'font-size:13px;font-weight:600;';
                titleLine.innerHTML = renderLineIcon('folder') + ' ' + ACTION_PANEL_UTILS.escapeHtml(ch.volName) + ' <span style="color:#999;">›</span> ' + ACTION_PANEL_UTILS.escapeHtml(ch.chName);
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
                    setDecomposeCheckboxState(cb, !cb.checked);
                });
                cb.addEventListener('change', function() {
                    setDecomposeCheckboxState(cb, cb.checked);
                });
                list.appendChild(div);
            });
            updateDecomposeChapterCount();
        }

        function updateDecomposeChapterCount(listId, countId) {
            listId = listId || 'decomposeChapterList';
            countId = countId || 'decomposeChapterCount';
            var list = document.getElementById(listId);
            var countEl = document.getElementById(countId);
            if (!list || !countEl) return;
            var checked = list.querySelectorAll('input:checked');
            countEl.textContent = '已选: ' + checked.length + '/' + DECOMPOSE_IMPORT_CHAPTER_LIMIT;
            if (checked.length > DECOMPOSE_IMPORT_CHAPTER_LIMIT) countEl.style.color = '#e74c3c';
            else countEl.style.color = '#888';
        }

        // 拆书导入弹窗事件绑定
        document.getElementById('btnDCImportBook')?.addEventListener('click', function() {
            openDecomposeImportModal();
        });

        function doDecomposeSelectAll(listId, countId) {
            var list = document.getElementById(listId || 'decomposeChapterList');
            if (!list) return;
            var cbs = list.querySelectorAll('input[type="checkbox"]');
            cbs.forEach(function(cb, index) { cb.checked = index < DECOMPOSE_IMPORT_CHAPTER_LIMIT; });
            if (cbs.length > DECOMPOSE_IMPORT_CHAPTER_LIMIT) {
                ACTION_PANEL_TOAST.warn('最多选择' + DECOMPOSE_IMPORT_CHAPTER_LIMIT + '章，已全选前' + DECOMPOSE_IMPORT_CHAPTER_LIMIT + '章');
            }
            updateDecomposeChapterCount(listId, countId);
        }

        document.getElementById('btnDecomposeSelectAll')?.addEventListener('click', function() {
            doDecomposeSelectAll();
        });

        function doDecomposeInvert(listId, countId) {
            var list = document.getElementById(listId || 'decomposeChapterList');
            if (!list) return;
            var cbs = list.querySelectorAll('input[type="checkbox"]');
            cbs.forEach(function(cb) { cb.checked = !cb.checked; });
            // 反选后若超过上限，保留反选结果中的前 N 章。
            var checked = list.querySelectorAll('input:checked');
            if (checked.length > DECOMPOSE_IMPORT_CHAPTER_LIMIT) {
                var keep = 0;
                cbs.forEach(function(cb) {
                    if (!cb.checked) return;
                    if (keep < DECOMPOSE_IMPORT_CHAPTER_LIMIT) keep++;
                    else cb.checked = false;
                });
                ACTION_PANEL_TOAST.warn('反选后超过' + DECOMPOSE_IMPORT_CHAPTER_LIMIT + '章，已保留前' + DECOMPOSE_IMPORT_CHAPTER_LIMIT + '章');
            }
            updateDecomposeChapterCount(listId, countId);
        }

        document.getElementById('btnDecomposeInvert')?.addEventListener('click', function() {
            doDecomposeInvert();
        });

        document.getElementById('btnDecomposeConfirm')?.addEventListener('click', function() {
            var activeTab = document.getElementById('decompTabWorks').classList.contains('active') ? 'works' : 'file';
            var selected = [];
            if (activeTab === 'works') {
                var list = document.getElementById('decomposeChapterList');
                if (!list) return;
                var all = window._decomposeAllChapters || [];
                var cbs = list.querySelectorAll('input:checked');
                if (cbs.length === 0) { ACTION_PANEL_TOAST.warn('请至少选择一个章节'); return; }
                if (cbs.length > DECOMPOSE_IMPORT_CHAPTER_LIMIT) {
                    ACTION_PANEL_TOAST.warn('最多选择' + DECOMPOSE_IMPORT_CHAPTER_LIMIT + '章');
                    return;
                }
                cbs.forEach(function(cb) {
                    var vi = parseInt(cb.dataset.vi), ci = parseInt(cb.dataset.ci);
                    var ch = all.find(function(c) { return c.vi === vi && c.ci === ci; });
                    if (ch) selected.push({ vi: vi, ci: ci, name: ch.chName, content: ch.content });
                });
            } else {
                var selChapters = decompFileChapters.filter(function(c) { return c.selected; });
                if (selChapters.length === 0) { ACTION_PANEL_TOAST.warn('请至少选择一个章节'); return; }
                if (selChapters.length > DECOMPOSE_IMPORT_CHAPTER_LIMIT) {
                    ACTION_PANEL_TOAST.warn('最多选择' + DECOMPOSE_IMPORT_CHAPTER_LIMIT + '章');
                    return;
                }
                selChapters.forEach(function(fch, idx) {
                    selected.push({ vi: -1, ci: idx, name: fch.title, content: fch.content });
                });
            }
            ACTION_PANEL_APP_STATE.outlineGen.decomposeChapters = selected;
            ACTION_PANEL_MODAL.close('decomposeImportModal');
            refreshDecomposeFileStack();
            ACTION_PANEL_TOAST.success('已导入 ' + selected.length + ' 个章节');
        });


        // ===== 拆书导入 - Tab 切换 =====
        document.getElementById('decompTabWorks')?.addEventListener('click', function() {
            document.getElementById('decompTabWorks').classList.add('active');
            document.getElementById('decompTabFile').classList.remove('active');
            document.getElementById('decompPanelWorks').style.display = '';
            document.getElementById('decompPanelFile').style.display = 'none';
        });
        document.getElementById('decompTabFile')?.addEventListener('click', function() {
            document.getElementById('decompTabFile').classList.add('active');
            document.getElementById('decompTabWorks').classList.remove('active');
            document.getElementById('decompPanelFile').style.display = '';
            document.getElementById('decompPanelWorks').style.display = 'none';
        });

        function refreshDecomposeFileStack() {
            var stackEl = document.getElementById('dcStackChapters');
            var iconsEl = document.getElementById('dcStackChaptersIcons');
            var labelEl = stackEl ? stackEl.querySelector('.og-stack-label') : null;
            if (!stackEl || !iconsEl) return;
            var chapters = ACTION_PANEL_APP_STATE.outlineGen.decomposeChapters || [];
            if (chapters.length === 0) {
                stackEl.style.display = 'none';
                return;
            }
            stackEl.style.display = '';
            if (labelEl) labelEl.textContent = '导入';
            iconsEl.innerHTML = '';
            iconsEl.classList.add('single');
            iconsEl.classList.remove('fanned');
            var firstChapter = chapters[0] || {};
            var icon = document.createElement('span');
            icon.className = 'og-stack-icon';
            icon.style.cssText = 'line-height:1;cursor:pointer;';
            icon.innerHTML = renderLineIcon('file-stack');
            icon.title = '已导入 ' + chapters.length + ' 章，点击查看';
            icon.addEventListener('click', function(e) {
                e.stopPropagation();
                openOGFileFloat('decompose');
                if (firstChapter) {
                    selectOGFileInFloat(firstChapter.name || ('第' + ((firstChapter.ci || 0) + 1) + '章'), firstChapter.content || '暂无内容', null, 'decompose', firstChapter.vi, firstChapter.ci);
                }
            });
            iconsEl.appendChild(icon);
            // 文件堆有内容时才显示包装器
            var wrap = document.querySelector('#dcFileStacksRow .og-stacks-wrap');
            if (wrap) {
                wrap.style.display = (chapters.length > 0) ? 'flex' : 'none';
            }
        }
