// ===== ????????????? =====
        // ===== 细纲操作栏 + 选择大纲弹窗 - 事件绑定 =====
        (function(){
            var renderOGSplitResultList = window.renderOGSplitResultList;
            var updateOGSplitCount = window.updateOGSplitCount;

            function stopOGAiSplit(message) {
                var controller = ACTION_PANEL_APP_STATE.outlineGen?.aiSplitAbortController;
                if (!controller || controller.signal.aborted) return false;
                var cancelError = new Error(message || '智能分析已取消');
                cancelError.name = 'AbortError';
                controller.abort(cancelError);
                return true;
            }
            window.stopOGAiSplit = stopOGAiSplit;

            document.getElementById('outlinePickerModal')?.addEventListener('click', function(event) {
                var control = event.target.closest?.('[data-zhiyu-static-click]');
                var action = control?.getAttribute('data-zhiyu-static-click') || '';
                if (action.includes("Modal.close('outlinePickerModal')")) {
                    stopOGAiSplit('用户关闭了选择大纲窗口');
                }
            }, true);

            // --- 按钮行 ---
            document.getElementById('btnOGTemplate')?.addEventListener('click', openOGTemplateSelector);
            document.getElementById('btnDCTemplate')?.addEventListener('click', function() {
                window.openTemplateSelector?.({ context: 'decompose', subCategory: '拆书' });
            });
            document.getElementById('btnOGTemplateMenu')?.addEventListener('click', function(event) {
                event.preventDefault();
                event.stopPropagation();
                window.openTemplateQuickMenu?.(this, {
                    context: 'fineOutline',
                    getSelectedId: function() { return window.getTemplateContextTemplateId?.('fineOutline') || ''; }
                });
            });
            document.getElementById('btnDCTemplateMenu')?.addEventListener('click', function(event) {
                event.preventDefault();
                event.stopPropagation();
                window.openTemplateQuickMenu?.(this, {
                    context: 'decompose',
                    getSelectedId: function() { return window.getTemplateContextTemplateId?.('decompose') || ''; }
                });
            });
            document.getElementById('btnOGLinkFiles')?.addEventListener('click', function(event) {
                event.preventDefault();
                window.openOGLinkMemorySelector?.();
            });
            document.getElementById('btnOGPickOutline')?.addEventListener('click', function(event) {
                event.preventDefault();
                window.openOutlinePickerModal?.('fineOutline');
            });
            // 保存/操作按钮由 updateActionButtons() 统一绑定 onclick，避免一次点击触发两次保存。

            // --- 选择大纲弹窗：正则快拆 ---
            document.getElementById('btnOGRegexSplit')?.addEventListener('click', function() {
                var og = ACTION_PANEL_APP_STATE.outlineGen;
                var checkedFiles = (window.getOGOutlineSelectionList?.() || []).filter(function(f) { return f.checked; });
                if (!checkedFiles.length) { ACTION_PANEL_TOAST.warn('请先在记忆库中勾选大纲文件'); return; }
                // 从勾选的记忆库文件读取内容
                var text = getCheckedOGOutlineText();
                if (!text) { ACTION_PANEL_TOAST.warn('所选文件无内容'); return; }
                if (window.isAdvancedOGOutlinePickerMode?.()) {
                    var stages = window.extractAdvancedOutlineStages(text);
                    if (!stages.length) {
                        ACTION_PANEL_TOAST.warn('未识别到 S01、S02 这类阶段标题');
                        document.getElementById('ogPickerStatus').textContent = '正则快拆失败：未找到 Sxx 阶段格式';
                        return;
                    }
                    og.pendingStages = stages;
                    document.getElementById('ogPickerStatus').textContent = '正则快拆成功：识别 ' + stages.length + ' 个阶段';
                    renderOGSplitResultList();
                    return;
                }
                var startCh = parseInt(document.getElementById('ogSplitStart')?.value) || 1;
                var endCh = parseInt(document.getElementById('ogSplitEnd')?.value) || 10;
                var chapters = regexSplitChapters(text, startCh, endCh);
                if (!chapters || chapters.length === 0) {
                    ACTION_PANEL_TOAST.warn('正则拆分未找到匹配章节，请尝试"智能拆分"');
                    document.getElementById('ogPickerStatus').textContent = '正则拆分失败：未找到匹配的章节格式';
                    return;
                }
                ACTION_PANEL_APP_STATE.outlineGen.pendingChapters = chapters.map(function(ch) { return Object.assign({}, ch, { checked: true }); });
                document.getElementById('ogPickerStatus').textContent = '正则拆分成功：找到 ' + chapters.length + ' 章';
                renderOGSplitResultList();
            });

            // --- 选择大纲弹窗：智能拆分 ---
            document.getElementById('btnOGAiSplit')?.addEventListener('click', async function() {
                var og = ACTION_PANEL_APP_STATE.outlineGen;
                var checkedFiles = (window.getOGOutlineSelectionList?.() || []).filter(function(f) { return f.checked; });
                if (!checkedFiles.length) { ACTION_PANEL_TOAST.warn('请先在记忆库中勾选大纲文件'); return; }
                var text = getCheckedOGOutlineText();
                if (!text) { ACTION_PANEL_TOAST.warn('所选文件无内容'); return; }

                document.getElementById('ogPickerStatus').textContent = '⏳ AI分析中...';
                this.disabled = true; this.textContent = '分析中...';
                var prompt = '请从以下内容中提取章节列表（最多10章），每章独立输出。\n\n格式要求：\n## 第N章：章节标题\n[章节内容]\n\n' + text;
                var fullResult = '';
                var abortController = new AbortController();
                var requestTimeout = window.setTimeout(function() {
                    var timeoutError = new Error('智能分析等待超时，请重试');
                    timeoutError.name = 'TimeoutError';
                    abortController.abort(timeoutError);
                }, 180000);
                stopOGAiSplit('新的智能分析已经开始');
                og.aiSplitAbortController = abortController;
                ACTION_PANEL_UTILS.appendLog(null, '开始智能分析章节拆分（' + text.length + '字大纲）', 'progress');

                try {
                    var modelCfg = getActionModelConfig();
                    if (!modelCfg?.base || !modelCfg?.model) throw new Error('请先添加并选择自己的工具模型');
                    var cfg = { ...modelCfg, maxTokens: modelCfg.maxTokens || 8192 };
                    fullResult = '';
                    await streamGenerate(
                        cfg,
                        '你是专业的小说结构分析师。',
                        prompt,
                        function(chunk) { fullResult += chunk; },
                        function(final) { fullResult = final || fullResult; },
                        function(err) { throw err; },
                        abortController.signal
                    );

                    fullResult = String(fullResult || '').trim();
                    if (!fullResult) throw new Error('智能分析没有返回有效内容，请重试');
                    var startCh = parseInt(document.getElementById('ogSplitStart')?.value) || 1;
                    var endCh = parseInt(document.getElementById('ogSplitEnd')?.value) || 10;
                    var chapters = regexSplitChapters(fullResult, startCh, endCh);
                    if (chapters && chapters.length > 0) {
                        ACTION_PANEL_APP_STATE.outlineGen.pendingChapters = chapters.map(function(ch) { return Object.assign({}, ch, { checked: true }); });
                        document.getElementById('ogPickerStatus').textContent = '智能分析成功：找到 ' + chapters.length + ' 章';
                        renderOGSplitResultList();
                        ACTION_PANEL_UTILS.appendLog(null, '✅ 智能分析完成：找到 ' + chapters.length + ' 章', 'success');
                    } else {
                        ACTION_PANEL_TOAST.error('AI分析结果无法解析为章节格式');
                        document.getElementById('ogPickerStatus').textContent = '❌ 智能分析完成但无法拆分，请重试或手动处理';
                        ACTION_PANEL_UTILS.appendLog(null, '❌ 智能分析完成但无法解析为章节格式', 'error');
                    }
                } catch(err) {
                    if (abortController.signal.aborted && abortController.signal.reason?.name === 'AbortError') {
                        document.getElementById('ogPickerStatus').textContent = '智能分析已取消';
                        ACTION_PANEL_UTILS.appendLog(null, '智能分析已取消', 'warn');
                        return;
                    }
                    var errorMessage = typeof window.formatAiErrorForDisplay === 'function'
                        ? window.formatAiErrorForDisplay(err, '智能分析失败')
                        : String(err?.message || err || '智能分析失败');
                    document.getElementById('ogPickerStatus').textContent = '❌ ' + errorMessage;
                    ACTION_PANEL_TOAST.error(errorMessage);
                    ACTION_PANEL_UTILS.appendLog(null, '❌ ' + errorMessage, 'error');
                } finally {
                    window.clearTimeout(requestTimeout);
                    if (og.aiSplitAbortController === abortController) og.aiSplitAbortController = null;
                    this.disabled = false; this.textContent = '🤖 智能拆分';
                }
            });

            // --- 确定 ---
            document.getElementById('btnOGConfirm')?.addEventListener('click', function() {
                if (window.isAdvancedOGOutlinePickerMode?.()) {
                    var sourceText = getCheckedOGOutlineText();
                    var checkedFiles = (window.getOGOutlineSelectionList?.() || []).filter(function(file) { return file.checked; });
                    var stages = window.extractAdvancedOutlineStages(sourceText);
                    if (!sourceText || !stages.length) { ACTION_PANEL_TOAST.warn('请先选择包含 Sxx 阶段规划的母纲'); return; }
                    ACTION_PANEL_APP_STATE.outline.outlineAdvancedMasterSnapshot = sourceText;
                    ACTION_PANEL_APP_STATE.outline.outlineAdvancedStages = stages.map(function(stage) {
                        return Object.assign({}, stage);
                    });
                    ACTION_PANEL_APP_STATE.outline.outlineAdvancedSourceName = checkedFiles[0]?.name || '母纲文件';
                    ACTION_PANEL_APP_STATE.outlineGen.pendingStages = stages;
                    window.updateAdvancedOutlineSourceCount?.();
                    window.updateAdvancedOutlineStageOptions?.();
                    ACTION_PANEL_MODAL.close('outlinePickerModal');
                    ACTION_PANEL_TOAST.success('已识别 ' + stages.length + ' 个阶段');
                    return;
                }
                var chapters = ACTION_PANEL_APP_STATE.outlineGen.pendingChapters || [];
                if (!chapters || !chapters.length) { ACTION_PANEL_TOAST.warn('请先执行拆分'); return; }
                // 保存勾选状态
                var cbs = document.querySelectorAll('#ogSplitChapterList input[type="checkbox"]');
                cbs.forEach(function(cb) {
                    var idx = parseInt(cb.dataset.idx);
                    if (!isNaN(idx) && chapters[idx]) chapters[idx].checked = cb.checked;
                });
                var selected = chapters.filter(function(c) { return c.checked !== false; }).map(function(ch) {
                    return { num: ch.num, title: ch.title || '', content: ch.content || '', checked: true };
                });
                var selectedCount = selected.length;
                if (selectedCount === 0) { ACTION_PANEL_TOAST.warn('请至少勾选一个章节'); return; }
                ACTION_PANEL_APP_STATE.outlineGen.chapters = selected;
                ACTION_PANEL_APP_STATE.outlineGen.pendingChapters = [];
                ACTION_PANEL_MODAL.close('outlinePickerModal');
                // 防御性：清除拆分结果区后重新渲染文件堆
                var splitArea = document.getElementById('ogSplitResultArea');
                if (splitArea) splitArea.style.display = 'none';
                var listEl = document.getElementById('ogSplitChapterList');
                if (listEl) listEl.innerHTML = '';
                refreshAllOGFileStacks();
                ACTION_PANEL_TOAST.success('已选择 ' + selectedCount + '/' + chapters.length + ' 章');
            });

            // --- 拆分结果 全选/反选 ---
            document.getElementById('btnOGSplitSelectAll')?.addEventListener('click', function() {
                document.querySelectorAll('#ogSplitChapterList input[type="checkbox"]').forEach(function(cb) { cb.checked = true; });
                updateOGSplitCount();
            });
            document.getElementById('btnOGSplitInvert')?.addEventListener('click', function() {
                document.querySelectorAll('#ogSplitChapterList input[type="checkbox"]').forEach(function(cb) { cb.checked = !cb.checked; });
                updateOGSplitCount();
            });

            // --- 发送按钮 ---
            // 细纲发送按钮：按Tab分发不同操作
            async function doOGSend() {
                var og = ACTION_PANEL_APP_STATE.outlineGen;
                var descText = document.getElementById('ogDescInput')?.value?.trim() || '';
                var hasChapters = (og.chapters || []).length > 0;
                var hasOutlineFiles = (window.getOGOutlineSelectionList?.('fineOutline') || []).filter(function(f) { return f.checked; }).length > 0;
                if (!hasChapters && !hasOutlineFiles && !descText) { ACTION_PANEL_TOAST.warn('请先选择大纲、拆分章节或输入描述'); return; }
                setOGSendWorking(true, '细纲生成');
                try {
                    await doGenerateOutline();
                } finally {
                    setOGSendWorking(false);
                }
            }
            window.doOGSend = doOGSend;
            // 注：btnOGSend 点击事件由 updateActionButtons() 统一绑定 onclick，
            // 此处不再重复绑定 addEventListener，避免一次点击触发两次调用。

            // --- 监听模板选择器关闭 ---
            var tplModal = document.getElementById('templateSelectModal');
            if (tplModal) {
                var tplModalObserver = new MutationObserver(function() {
                    if (tplModal.style.display === 'none' && window._tplSelectContext === 'og') {
                        var hadTemplate = window._ogHadTemplate;
                        var currentTplSelectedId = typeof window.getTemplateSelectorSelectedId === 'function'
                            ? window.getTemplateSelectorSelectedId()
                            : window.tplSelectedId;
                        // 用户没选中任何模板：若此前也无模板 → 清空（兜底）；若此前有模板且本次未主动取消 → 保留
                        if (!currentTplSelectedId) {
                            if (!hadTemplate) {
                                // 从未选过模板，保持清空
                                ACTION_PANEL_APP_STATE.outlineGen.templateId = '';
                                ACTION_PANEL_APP_STATE.outlineGen.templateName = '';
                                if (typeof window.setOGTemplateButtonText === 'function') {
                                    window.setOGTemplateButtonText('提示词模版');
                                } else {
                                    var btn = document.getElementById('btnOGTemplate');
                                    if (btn) btn.textContent = '提示词模版';
                                }
                            }
                            // hadTemplate=true: 用户打开了弹窗但没选新模板也没点应用 → 保留旧模板不清理
                            // （如果用户在弹窗里toggle取消了旧模板后点"应用"，btnApplyTemplate 会通过 _tplSelectContext 分支清空）
                        } else {
                            // 用户选了模板 → btnApplyTemplate 大概率已设置文字，这里兜底
                            var tplName = ACTION_PANEL_APP_STATE.outlineGen.templateName;
                            if (typeof window.setOGTemplateButtonText === 'function') {
                                window.setOGTemplateButtonText(tplName || '提示词模版');
                            } else {
                                var btnFallback = document.getElementById('btnOGTemplate');
                                if (btnFallback && tplName) btnFallback.textContent = tplName;
                                else if (btnFallback) btnFallback.textContent = '提示词模版';
                            }
                        }
                        window._tplSelectContext = null;
                        window._ogHadTemplate = undefined;
                    }
                });
                tplModalObserver.observe(tplModal, { attributes: true, attributeFilter: ['style'] });
            }

            // --- 监听关联文件弹窗关闭 ---
            var memLinkModal = document.getElementById('memoryLinkModal');
            if (memLinkModal) {
                function finishFineOutlineMemorySelection() {
                    if (window._linkMemoryContext === 'og') copyGenLinkedToOG();
                    if (ogFileStacksRow) ogFileStacksRow.style.display = 'flex';
                    refreshAllOGFileStacks();
                    window._linkMemoryContext = null;
                }
                function isFineOutlineMemoryContext() {
                    return window._linkMemoryContext === 'fineOutline' || window._linkMemoryContext === 'og';
                }
                memLinkModal.addEventListener('click', function(e) {
                    if (e.target === memLinkModal && isFineOutlineMemoryContext()) {
                        setTimeout(function() {
                            finishFineOutlineMemorySelection();
                        }, 100);
                    }
                });
                var memObserver = new MutationObserver(function() {
                    if (memLinkModal.style.display === 'none' && isFineOutlineMemoryContext()) {
                        finishFineOutlineMemorySelection();
                    }
                });
                memObserver.observe(memLinkModal, { attributes: true, attributeFilter: ['style'] });
            }
        })();
