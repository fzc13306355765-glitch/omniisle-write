// ===== ????????????? =====
            function normalizeGeneratedDecomposeChapter(value, targetIndex) {
                var chapterNumber = targetIndex + 1;
                var text = String(value || '')
                    .replace(/\r\n/g, '\n')
                    .replace(/```(?:markdown|md|text)?\s*/gi, '')
                    .replace(/```/g, '')
                    .replace(/([^\n])(?=#{2,3}\s*)/g, '$1\n\n')
                    .trim();
                var chapterHeadingPattern = /^[ \t]*(?:#{1,6}[ \t]*)?第\s*[0-9０-９一二三四五六七八九十百千万零〇两]+\s*[章节回]([^\n]*)/im;
                var heading = text.match(chapterHeadingPattern);
                if (heading) {
                    var suffix = String(heading[1] || '').replace(/^[ \t:：\-—]+/, '').trim();
                    text = text.replace(
                        chapterHeadingPattern,
                        '## 第' + chapterNumber + '章' + (suffix ? '：' + suffix : '：功能拆解')
                    );
                } else {
                    text = '## 第' + chapterNumber + '章：功能拆解\n\n' + text;
                }
                text = text
                    .replace(/(^|\n)[ \t]*(#{2,3}\s*[^\n]+)/g, '$1\n\n$2\n')
                    .replace(/\n{3,}/g, '\n\n')
                    .trim();
                return text;
            }

            // --- 拆书 ---
            async function triggerDecompose() {
                var contentBox = document.getElementById('dcContentBox');
                try {
                var dcChapters = (ACTION_PANEL_APP_STATE.outlineGen.decomposeChapters || []).map(function(ch, index) {
                    return {
                        title: ch.title || ch.name || ('第' + (index + 1) + '章'),
                        content: typeof window.normalizeDecomposePlainText === 'function'
                            ? window.normalizeDecomposePlainText(ch.content || '')
                            : (ch.content || '').trim()
                    };
                }).filter(function(ch) { return ch.content; });
                var editorText = (document.getElementById('resultBox')?.innerText || '').trim();
                var isFromImport = false;
                var isChapterBatch = false;
                var decomposeTargets = [];
                if (dcChapters.length) {
                    decomposeTargets = dcChapters;
                    isFromImport = true;
                    isChapterBatch = true;
                }
                if (!decomposeTargets.length && editorText) {
                    var parsedEditorChapters = typeof parseDecomposeFileChapters === 'function'
                        ? parseDecomposeFileChapters(editorText)
                        : [];
                    if (parsedEditorChapters.length > 1) {
                        decomposeTargets = parsedEditorChapters;
                        isChapterBatch = true;
                    } else {
                        decomposeTargets = [{ title: '当前正文', content: editorText }];
                    }
                }
                if (!decomposeTargets.length) { ACTION_PANEL_TOAST.warn('请先粘贴正文或导入章节后再拆解'); return; }
                setOGSendWorking(true, '拆书分析');
                contentBox.classList.add('generating');
                contentBox.textContent = '';
                var extra = (document.getElementById('ogDescInput')?.value?.trim() || '');
                // 导入章节为主拆解对象时，编辑器正文反转为参考上下文
                var refContext = '';
                if (isFromImport && editorText) {
                    refContext = '\n\n【当前正文参考】\n' + editorText.substring(0, 3000) + '\n';
                }
                var og = ACTION_PANEL_APP_STATE.outlineGen;
                var templateSysPrompt = '';
                var templateId = window.getTemplateContextTemplateId?.('decompose') || og.templateId || '';
                if (templateId) {
                    var templates = gT();
                    var tpl = templates.find(function(t) { return t.id === templateId; });
                    if (tpl && tpl.systemPrompt) templateSysPrompt = tpl.systemPrompt;
                }
                var defaultSystemPrompt = isChapterBatch
                    ? (extra ? '请按照补充指令对以下导入的小说内容进行拆解分析，并严格按章节格式输出。' : '你是一位专业的小说拆书师。请对以下导入的小说内容逐章拆解分析，提取：1.情节结构 2.人物关系 3.关键场景 4.写作技巧 5.可优化之处，并严格按章节格式输出。')
                    : (extra ? '请按照补充指令对以下小说内容进行拆解分析，并严格按章节格式输出。' : '你是一位专业的小说拆书师。请对以下小说内容逐章拆解分析，提取：1.情节结构 2.人物关系 3.关键场景 4.写作技巧 5.可优化之处，并严格按章节格式输出。');
                var systemPrompt = templateSysPrompt || defaultSystemPrompt;
                var totalLength = decomposeTargets.reduce(function(sum, ch) { return sum + ch.content.length; }, 0);
                var chapterSourceLabel = isFromImport ? '导入' : '识别';
                var decomposeMainLog = '开始拆书（原文' + totalLength + '字' + (isChapterBatch ? '，' + chapterSourceLabel + decomposeTargets.length + '章' : '') + '）' + (templateSysPrompt ? ' [使用模板]' : '');
                var decomposeWaitLogToken = typeof ACTION_PANEL_UTILS.beginExecutionLogWait === 'function'
                    ? ACTION_PANEL_UTILS.beginExecutionLogWait(decomposeMainLog, 'progress')
                    : '';
                if (!decomposeWaitLogToken) ACTION_PANEL_UTILS.appendLog(null, decomposeMainLog, 'progress');
                var abortController = new AbortController();
                ACTION_PANEL_APP_STATE.outlineGen.dcAbortController = abortController;
                var modelCfg = typeof getActionModelConfig === 'function'
                    ? getActionModelConfig()
                    : window.getSelectedModelConfig?.();
                if (!modelCfg?.base || !modelCfg?.model) throw new Error('请先添加并选择自己的工具模型');
                var decomposeHeadingPattern = /^[ \t]*(?:#{1,6}[ \t]*)?(?:第\s*[0-9０-９一二三四五六七八九十百千万零〇两]+\s*[章节回][^\n]{0,30}|chapter\s+[0-9０-９]+[^\n]{0,30})/im;
                var decomposeSourceUnits = decomposeTargets.map(function(target, index) {
                    var sourceContent = String(target.content || '').trim();
                    if (decomposeHeadingPattern.test(sourceContent)) return sourceContent;
                    var rawTitle = String(target.title || '').trim();
                    var sourceTitle = decomposeHeadingPattern.test(rawTitle)
                        ? rawTitle
                        : ('第' + (index + 1) + '章' + (rawTitle ? ' ' + rawTitle : ''));
                    return sourceTitle + (sourceContent ? '\n' + sourceContent : '');
                });

                function buildDecomposeUserMessage(target, targetIndex, targetTotal) {
                    var chapterRule = isChapterBatch
                        ? '\n\n【本次拆书范围】\n- 本次只拆第 ' + (targetIndex + 1) + '/' + targetTotal + ' 个导入章节。\n- 只输出一个章节块，标题请写成「## 第' + (targetIndex + 1) + '章：章节标题」，标题内容按模板或补充指令处理。\n- 不要输出其他章节，不要写“以下是”。'
                        : '';
                    var title = target.title ? '【章节标题】\n' + target.title + '\n\n' : '';
                    if (typeof window.buildTrustedGenerationUnit !== 'function') {
                        throw new Error('拆书输入合同模块未加载，请刷新页面后重试');
                    }
                    var trustedUnit = window.buildTrustedGenerationUnit(
                        'decompose',
                        targetIndex + 1,
                        targetTotal,
                        title + '待拆解内容：\n' + decomposeSourceUnits[targetIndex]
                    );
                    return (extra ? '补充指令：' + extra + '\n\n' : '') + refContext + trustedUnit + ACTION_PANEL_FORMAT_CONSTRAINTS.DECOMPOSE + chapterRule;
                }
                var decomposeSegmentInputs = decomposeTargets.map(function(target, index) {
                    return buildDecomposeUserMessage(target, index, decomposeTargets.length);
                });
                async function requestDecomposeChunk(chunkUserMsg, maxTokens) {
                    var chunkResult = '';
                    var cfg = { ...modelCfg, maxTokens: maxTokens || modelCfg.maxTokens || 8192 };
                    await streamGenerate(
                        cfg,
                        systemPrompt,
                        chunkUserMsg,
                        function(part) { chunkResult += part; contentBox.textContent += part; },
                        function(final) { chunkResult = final || chunkResult; },
                        function(err) { throw err; },
                        abortController.signal
                    );
                    return chunkResult;
                }

                    var decomposeOutputs = [];
                    var activeDecomposeIndex = -1;
                    for (var ti = 0; ti < decomposeTargets.length; ti++) {
                        activeDecomposeIndex = ti;
                        if (abortController.signal.aborted) throw new DOMException('用户已停止拆书', 'AbortError');
                        if (ti > 0 && contentBox.textContent.trim()) contentBox.textContent += '\n\n';
                        ACTION_PANEL_UTILS.appendLog(null, isChapterBatch ? ('正在拆书 ' + (ti + 1) + '/' + decomposeTargets.length) : '正在拆书当前正文', 'progress');
                        var chunkText = await requestDecomposeChunk(
                            decomposeSegmentInputs[ti],
                            isFromImport ? 8192 : 16384
                        );
                        if (!String(chunkText || '').trim()) throw new Error('第' + (ti + 1) + '章未返回拆书内容，请稍后重试');
                        decomposeOutputs.push(normalizeGeneratedDecomposeChapter(chunkText, ti));
                        contentBox.textContent = decomposeOutputs.join('\n\n');
                    }
                    activeDecomposeIndex = -1;
                    ACTION_PANEL_APP_STATE.outlineGen.dcContent = contentBox.textContent || '';
                    if (typeof saveActionContentDraft === 'function') saveActionContentDraft('decompose');
                    if (isChapterBatch && typeof splitGeneratedChapterSections === 'function') {
                        var parsedSections = splitGeneratedChapterSections(contentBox.textContent || '');
                        if (parsedSections.length < decomposeTargets.length) {
                            ACTION_PANEL_UTILS.appendLog(null, '拆书已完成，但检测到章节块少于导入章节，请检查输出格式', 'warn');
                        }
                    }
                    ACTION_PANEL_UTILS.appendLog(null, '拆书完成', 'success');
                } catch(err) {
                    var completedCount = Array.isArray(decomposeOutputs) ? decomposeOutputs.length : 0;
                    contentBox.textContent = completedCount ? decomposeOutputs.join('\n\n') : '';
                    ACTION_PANEL_APP_STATE.outlineGen.dcContent = contentBox.textContent || '';
                    if (completedCount && typeof saveActionContentDraft === 'function') saveActionContentDraft('decompose');
                    if (isAbortLikeError(err)) {
                        ACTION_PANEL_UTILS.appendLog(
                            null,
                            completedCount ? ('已停止拆书，前' + completedCount + '章结果已保留') : '已停止拆书',
                            'warn'
                        );
                    }
                    else {
                        var msg = typeof window.formatAiErrorForDisplay === 'function'
                            ? window.formatAiErrorForDisplay(err, '拆书失败')
                            : String(err?.message || err || '拆书失败');
                        if (activeDecomposeIndex >= 0 && activeDecomposeIndex < decomposeTargets.length) {
                            var failedTitle = String(decomposeTargets[activeDecomposeIndex]?.title || '').trim();
                            msg = '拆书在第' + (activeDecomposeIndex + 1) + '/' + decomposeTargets.length
                                + '章' + (failedTitle ? '《' + failedTitle + '》' : '') + '停止：' + msg
                                + (completedCount ? '；前' + completedCount + '章结果已保留' : '');
                        }
                        ACTION_PANEL_UTILS.appendLog(null, msg, 'error');
                        ACTION_PANEL_TOAST.error(msg);
                    }
                }
                finally {
                    if (decomposeWaitLogToken && typeof ACTION_PANEL_UTILS.endExecutionLogWait === 'function') {
                        ACTION_PANEL_UTILS.endExecutionLogWait(decomposeWaitLogToken);
                    }
                    contentBox.classList.remove('generating');
                    ACTION_PANEL_APP_STATE.outlineGen.dcAbortController = null;
                    setOGSendWorking(false);
                }
            }

            // --- 初始化 ---
            updateActionButtons();
            // 共用元素初始显示
            var ogDiv = document.getElementById('ogDragDivider');
            var ogBtn = document.getElementById('ogBtnRow');
            var ogInp = document.getElementById('ogInputArea');
            var ogAct = document.getElementById('actionBtnsBottom');
            if (ogDiv) ogDiv.style.display = 'flex';
            if (ogBtn) ogBtn.style.display = 'flex';
            if (ogInp) ogInp.style.display = 'flex';
            if (ogAct) ogAct.style.display = 'none';
            // 初始：细纲Tab默认激活，显示细纲文件堆，隐藏拆书/AI消痕文件堆
            ACTION_PANEL_APP_STATE.outlineGen.activeTab = 'fineOutline';
            if (ogFileStacksRow) ogFileStacksRow.style.display = 'flex';
            var dcFS = document.getElementById('dcFileStacksRow');
            if (dcFS) dcFS.style.display = 'none';
            var apFS = document.getElementById('apFileStacksRow');
            if (apFS) apFS.style.display = 'none';
            // 初始默认：输入框自适应填充剩余空间
            var ogInpArea = document.getElementById('ogInputArea');
            if (ogInpArea) { ogInpArea.style.flex = '1 1 0%'; ogInpArea.style.height = ''; ogInpArea.style.minHeight = '0'; }
            var ogSendBtn = document.getElementById('btnOGSend');
            if (ogSendBtn) ogSendBtn.style.display = '';
            var actionModelBtn = document.getElementById('btnActionModelSelect');
            if (actionModelBtn) actionModelBtn.style.display = '';
        // ===== 停止生成（三个Tab独立） =====
        function stopOGGeneration() {
            var ctrl = ACTION_PANEL_APP_STATE.outlineGen.ogAbortController;
            if (ctrl) { ctrl.abort(new DOMException('user_cancelled', 'AbortError')); ACTION_PANEL_APP_STATE.outlineGen.ogAbortController = null; }
            var box = document.getElementById('ogContentBox');
            if (box) box.classList.remove('generating');
            setOGSendWorking(false);
            ACTION_PANEL_UTILS.appendLog(null, '已停止细纲生成', 'warn');
        }
        function stopDCGeneration() {
            var ctrl = ACTION_PANEL_APP_STATE.outlineGen.dcAbortController;
            if (ctrl) { ctrl.abort(new DOMException('user_cancelled', 'AbortError')); ACTION_PANEL_APP_STATE.outlineGen.dcAbortController = null; }
            var box = document.getElementById('dcContentBox');
            if (box) box.classList.remove('generating');
            setOGSendWorking(false);
            ACTION_PANEL_UTILS.appendLog(null, '已停止拆书', 'warn');
        }
        function stopAPGeneration() {
            if (typeof window.cancelNaturalize === 'function') {
                return window.cancelNaturalize();
            }
            ACTION_PANEL_TOAST.warn('AI消痕功能尚未初始化完成，请刷新页面后重试');
        }

        // ===== 细纲操作栏 - 核心函数 =====
