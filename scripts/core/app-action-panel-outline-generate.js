// ===== ????????? =====
        function normalizeFineOutlineFormatting(value) {
            return String(value || '')
                .replace(/\r\n/g, '\n')
                .replace(/```(?:markdown|md|text)?\s*/gi, '')
                .replace(/```/g, '')
                .replace(/([^\n])(?=#{1,6}\s*)/g, '$1\n\n')
                .replace(/(^|\n)[ \t]*(#{1,6}\s*第\s*[0-9０-９一二三四五六七八九十百千万零〇两]+\s*[章节回][^\n]*)/g, '$1\n\n$2\n')
                .replace(/(^|\n)[ \t]*(第\s*[0-9０-９一二三四五六七八九十百千万零〇两]+\s*[章节回][^\n]*)/g, '$1\n\n$2\n')
                .replace(/(^|\n)[ \t]*(#{2,6}\s*[^\n]+)/g, '$1\n\n$2\n')
                .replace(/\n{3,}/g, '\n\n')
                .trim();
        }

        function renderOGChapterCards() { renderOGChapterFileStack(); }

        function showChapterCardPreview(ch) {
            openOGFileFloat();
            selectOGFileInFloat(ch.title || ('第' + ch.num + '章'), ch.content || '暂无内容', null);
        }

        // 8. 生成细纲
        async function doGenerateOutline() {
            var og = ACTION_PANEL_APP_STATE.outlineGen;
            var contentBox = document.getElementById('ogContentBox');
            try {
            window.activateOGLinkedMemoryBook?.(ACTION_PANEL_APP_STATE.chapter?.book || '');

            // 获取选中大纲文件的内容
            var outlineText = document.getElementById('ogDescInput')?.value?.trim() || '';
            var checkedOutlineText = getCheckedOGOutlineText('fineOutline');
            if (checkedOutlineText === null) return;
            if (checkedOutlineText) outlineText += (outlineText ? '\n\n' : '') + checkedOutlineText;

            var templateId = window.getTemplateContextTemplateId?.('fineOutline') || og.templateId || '';
            var template = null;
            if (templateId) {
                var allTemplates = gT();
                template = allTemplates.find(function(t) { return t.id === templateId; });
            }
            var systemPrompt = template?.systemPrompt || '你是一位专业的小说细纲策划师。请根据大纲内容，为指定章节生成详细细纲。';
            var userMessage = '';
            var detailSourceText = '';
            var detailSourceUnits = [];
            var detailHeadingPattern = /^[ \t]*(?:#{1,6}[ \t]*)?(?:第\s*[0-9０-９一二三四五六七八九十百千万零〇两]+\s*[章节回][^\n]{0,30}|chapter\s+[0-9０-９]+[^\n]{0,30})/im;
            var splitDetailSourceUnits = function(source) {
                var text = String(source || '').replace(/\r\n/g, '\n').trim();
                if (!text) return [];
                var pattern = /^[ \t]*(?:#{1,6}[ \t]*)?(?:第\s*[0-9０-９一二三四五六七八九十百千万零〇两]+\s*[章节回][^\n]{0,30}|chapter\s+[0-9０-９]+[^\n]{0,30})/gim;
                var matches = Array.from(text.matchAll(pattern));
                if (!matches.length) return [text];
                return matches.map(function(match, index) {
                    var start = Number(match.index || 0);
                    var end = index + 1 < matches.length ? Number(matches[index + 1].index || text.length) : text.length;
                    return text.slice(start, end).trim();
                }).filter(Boolean);
            };

            // 拼入选中的章节内容
            var selectedChapters = (og.chapters || []).filter(function(c) { return c.checked !== false; });
            if (selectedChapters.length > 0) {
                selectedChapters.forEach(function(ch, index) {
                    var chapterContent = String(ch.content || '').trim();
                    if (!detailHeadingPattern.test(chapterContent)) {
                        var rawTitle = String(ch.title || '').trim();
                        var chapterTitle = detailHeadingPattern.test(rawTitle)
                            ? rawTitle
                            : ('第' + (Number(ch.num) || index + 1) + '章' + (rawTitle ? ' ' + rawTitle : ''));
                        chapterContent = chapterTitle + (chapterContent ? '\n' + chapterContent : '');
                    }
                    detailSourceUnits = detailSourceUnits.concat(splitDetailSourceUnits(chapterContent));
                });
                detailSourceText = detailSourceUnits.join('\n\n');
                userMessage += '请为以下章节生成详细细纲：\n\n';
                detailSourceUnits.forEach(function(sourceUnit, index) {
                    if (typeof window.buildTrustedGenerationUnit !== 'function') {
                        throw new Error('细纲输入合同模块未加载，请刷新页面后重试');
                    }
                    userMessage += window.buildTrustedGenerationUnit(
                        'detail_outline',
                        index + 1,
                        detailSourceUnits.length,
                        sourceUnit
                    ) + '\n\n';
                });
            } else if (outlineText) {
                detailSourceUnits = splitDetailSourceUnits(outlineText);
                detailSourceText = detailSourceUnits.join('\n\n');
                if (typeof window.buildTrustedGenerationUnit !== 'function') {
                    throw new Error('细纲输入合同模块未加载，请刷新页面后重试');
                }
                detailSourceUnits.forEach(function(sourceUnit, index) {
                    userMessage += window.buildTrustedGenerationUnit(
                        'detail_outline',
                        index + 1,
                        detailSourceUnits.length,
                        sourceUnit
                    ) + '\n\n';
                });
            } else {
                ACTION_PANEL_TOAST.warn('请提供大纲内容');
                return;
            }

            // 追加关联文件内容
            og.linkedFiles = getSelectedOGLinkedFilesData();
            if (Array.isArray(og.linkedFiles) && og.linkedFiles.length > 0) {
                try {
                    if (typeof window.buildAiReferenceContext !== 'function') throw new Error('参考文件说明模块未加载，请刷新页面后重试');
                    var referenceContext = window.buildAiReferenceContext(ACTION_PANEL_APP_STATE.chapter.book, og.linkedFiles, 'detail_outline');
                    userMessage += '\n\n---\n' + referenceContext.text + '\n';
                } catch (referenceError) {
                    ACTION_PANEL_TOAST.warn(referenceError?.message || '参考文件读取失败，请重新选择后再试');
                    return;
                }
            }

            // 追加格式约束
      userMessage += ACTION_PANEL_FORMAT_CONSTRAINTS.FINE_OUTLINE;

            // 蓝背景 + 清空
            contentBox.classList.add('generating');
            contentBox.textContent = '';
            var generatedText = '';
            // 细纲在准备请求、调用模型、流式输出之间会产生多条子日志；
            // 固定首条运行日志，避免后续说明挤掉运行高亮和三点动效。
            var fineOutlineWaitToken = typeof ACTION_PANEL_UTILS.beginExecutionLogWait === 'function'
                ? ACTION_PANEL_UTILS.beginExecutionLogWait('开始生成细纲...', 'progress')
                : '';
            if (!fineOutlineWaitToken) {
                ACTION_PANEL_UTILS.appendLog(null, '开始生成细纲...', 'progress');
            }
            var abortController = new AbortController();
            ACTION_PANEL_APP_STATE.outlineGen.ogAbortController = abortController;
            var modelCfg = getActionModelConfig();

                if (!modelCfg?.base || !modelCfg?.model) throw new Error('请先添加并选择自己的工具模型');
                var cfg = { ...modelCfg, maxTokens: calcOutlineMaxTokens('medium') };
                generatedText = '';
                await streamGenerate(
                    cfg,
                    systemPrompt,
                    userMessage,
                    function(chunk) { generatedText += chunk; contentBox.innerText += chunk; },
                    function(final) {
                        generatedText = final || generatedText;
                        if (generatedText) contentBox.innerText = generatedText;
                    },
                    function(err) { throw err; },
                    abortController.signal
                );
                if (!String(generatedText || '').trim()) {
                    var emptyDetailError = new Error('细纲未返回可用内容，本次生成未完成。');
                    emptyDetailError.code = 'AI_STREAM_EMPTY';
                    throw emptyDetailError;
                }
                generatedText = normalizeFineOutlineFormatting(generatedText);
                contentBox.innerText = generatedText;
                og.ogContent = generatedText;

                // 只拆分预览；用户检查无误后再手动点击“保存细纲”。
                splitFineOutlineByChapter(generatedText);

                ACTION_PANEL_UTILS.appendLog(null, '✅ 细纲生成完成（' + generatedText.length + '字），请检查后点击保存细纲', 'success');
                ACTION_PANEL_TOAST.success('细纲生成完成，请检查后手动保存');
            } catch(err) {
                if (isAbortLikeError(err)) {
                    ACTION_PANEL_UTILS.appendLog(null, '已停止细纲生成', 'warn');
                } else {
                    var detailError = typeof window.formatAiErrorForDisplay === 'function'
                        ? window.formatAiErrorForDisplay(err, '细纲生成失败')
                        : String(err?.message || err || '细纲生成失败');
                    var detailLog = detailError.indexOf('细纲生成失败') === 0
                        ? detailError
                        : ('细纲生成失败：' + detailError);
                    ACTION_PANEL_UTILS.appendLog(null, detailLog, 'error');
                    ACTION_PANEL_TOAST.error(detailError);
                }
            } finally {
                if (fineOutlineWaitToken && typeof ACTION_PANEL_UTILS.endExecutionLogWait === 'function') {
                    ACTION_PANEL_UTILS.endExecutionLogWait(fineOutlineWaitToken);
                }
                contentBox.classList.remove('generating');
                ACTION_PANEL_APP_STATE.outlineGen.ogAbortController = null;
            }
        }
