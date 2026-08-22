// Script generation handlers split from app-main.js.
// Loaded after the legacy main script because it depends on main generation helpers.
(function(window) {
    const document = window.document;

        document.getElementById('btnScript')?.addEventListener('click', function() {
            if (!AppState.chapter.book) { Toast.warn('请先在左侧章节目录中选择一个章节'); return; }
            if (AppState.chapter.vi < 0) { Toast.warn('参考文件条目不能生成剧本，请选择一个正式章节'); return; }
            const scriptTemplate = gT().find(function(template) {
                return template.id === AppState.script?.templateId;
            });
            const scriptTemplateName = document.getElementById('scriptSelectedTplName');
            if (scriptTemplateName && typeof window.renderTemplateSelectionButton === 'function') {
                window.renderTemplateSelectionButton(scriptTemplateName.closest('button'), scriptTemplate, {
                    labelElement: scriptTemplateName,
                    placeholder: '未选择'
                });
            } else if (scriptTemplateName) {
                scriptTemplateName.textContent = scriptTemplate?.title || '未选择';
            }
            updateScriptLinkedCount();
            const scriptCI = document.getElementById('scriptGenCreditInfo');
            if (scriptCI) {
                scriptCI.textContent = '使用当前选择的自备模型；费用由模型供应商结算';
                scriptCI.style.color = '#8b8d98';
            }
            Modal.open('scriptGenerateModal');
        });

        function updateScriptLinkedCount() {
            document.getElementById('scriptLinkedFileCount').textContent = AppState.gen.linkedFiles.length > 0 ? `已选择 ${AppState.gen.linkedFiles.length} 项` : '未选择';
        }

        function appendScriptGenerationError(error) {
            if (typeof window.isAbortLikeError === 'function' && window.isAbortLikeError(error)) {
                Utils.appendLog(null, '已停止生成', 'warn');
                return;
            }
            const reason = typeof window.formatAiErrorForDisplay === 'function'
                ? window.formatAiErrorForDisplay(error, '剧本生成失败')
                : String(error?.message || error || '剧本生成失败');
            const message = reason.indexOf('剧本生成失败') === 0
                ? reason
                : ('剧本生成失败：' + reason);
            Utils.appendLog(null, message, 'error');
        }

        function createScriptEmptyOutputError() {
            const error = new Error('剧本生成未返回可用内容，本次生成未完成。');
            error.code = 'AI_STREAM_EMPTY';
            return error;
        }

        // ===== 模型选择模块入口 =====
        // 模型配置、模型选择弹窗和自定义模型保存已拆到 scripts/core/app-model-picker.js。

        // ===== 开始生成剧本 =====
        document.getElementById('btnStartScriptGenerate')?.addEventListener('click', async function() {
            const modelCfg = getSelectedModelConfig();
            Modal.close('scriptGenerateModal');
            if (!AppState.chapter.book) return;

            const bookName = document.getElementById('bookSel')?.value || AppState.chapter.book;
            const plotInput = document.getElementById('plotInput').value.trim();
            const templates = gT();
            const template = templates.find(t => t.id === AppState.script?.templateId)
                || templates.find(t => t.id === AppState.gen.templateId)
                || templates[0];

            // 仅使用用户手动选择的关联文件（不自动读取记忆库，避免跨作品污染）
            const linkedFiles = typeof window.getGenerationLinkedFilesForChapter === 'function'
                ? window.getGenerationLinkedFilesForChapter(bookName, AppState.chapter.vi, AppState.chapter.ci)
                : [];

            // 构建极简提示词（仅模板 + 关联文件 + 剧情描述）
            let userMessage = '';
            if (modelCfg.custom && template?.systemPrompt) {
                userMessage += template.systemPrompt + '\n\n';
            }
            if (linkedFiles.length > 0) {
                try {
                    if (typeof window.buildAiReferenceContext !== 'function') throw new Error('参考文件说明模块未加载，请刷新页面后重试');
                    userMessage += window.buildAiReferenceContext(bookName, linkedFiles, 'script').text + '\n';
                } catch (referenceError) {
                    Toast.warn(referenceError?.message || '参考文件读取失败，请重新选择后再试');
                    return;
                }
                userMessage += '\n';
            }
            if (plotInput) {
                userMessage += plotInput + '\n\n';
            }
            userMessage += '请根据以上信息输出剧本。';

            Utils.appendLog(null, '⏳ 开始生成剧本...');
            if (template?.title) logToFloat('<div>📦 提示词模板：' + Utils.escapeHtml(template.title) + '</div>');
            if (linkedFiles.length > 0) logToFloat('<div>📎 关联文件：' + linkedFiles.map(f => Utils.escapeHtml(f.name)).join('、') + '</div>');
            if (plotInput) logToFloat('<div>📝 剧情描述：' + Utils.escapeHtml(plotInput.substring(0, 80)) + '</div>');

            const resultBox = document.getElementById('resultBox');
            resultBox.textContent = '';
            resultBox.style.background = '#e3f2fd';
            resultBox.setAttribute('contenteditable', 'false');
            document.getElementById('btnStop').disabled = false;
            document.getElementById('btnGen').disabled = true;
            (document.getElementById('btnRetry')||{"style":{"display":""},"dataset":{"mode":""},"textContent":""}).style.display = 'none';

            const abortController = new AbortController();
            window._scriptAbort = abortController;
            const _sid = template?.id || AppState.script?.templateId || AppState.gen.templateId || "";

            if (modelCfg?.base && modelCfg?.model) {
                // 用户自备模型：前端直连
                const customApiConfig = { ...modelCfg };
                try {
                    await streamGenerate(
                        customApiConfig,
                        '你是一位专业的小说写作助手。',
                        userMessage,
                    (chunk) => { resultBox.appendChild(document.createTextNode(chunk)); },
                    (final) => {
                        const completedText = String(final || resultBox.textContent || '');
                        resultBox.style.background = '';
                        resultBox.setAttribute('contenteditable', 'true');
                        document.getElementById('btnStop').disabled = true;
                        document.getElementById('btnGen').disabled = false;
                        if (!completedText.trim()) {
                            appendScriptGenerationError(createScriptEmptyOutputError());
                            return;
                        }
                        resultBox.textContent = completedText;
                        const copyBtn = document.getElementById('btnCopy');
                        if (copyBtn) copyBtn.disabled = false;
                        Utils.appendLog(null, '✅ 剧本生成完成', 'success');
                    },
                    (err) => {
                        resultBox.style.background = '';
                        resultBox.setAttribute('contenteditable', 'true');
                        document.getElementById('btnStop').disabled = true;
                        document.getElementById('btnGen').disabled = false;
                        if (abortController.signal.aborted) Utils.appendLog(null, '已停止生成', 'warn');
                        else appendScriptGenerationError(err);
                    },
                    abortController.signal
                );
            } catch (err) {
                resultBox.style.background = '';
                resultBox.setAttribute('contenteditable', 'true');
                if (err?.name === 'AbortError') Utils.appendLog(null, '已停止生成', 'warn');
                else appendScriptGenerationError(err);
            }
            } else {
                appendScriptGenerationError(new Error('请先添加并选择自己的正文模型'));
                resultBox.style.background = '';
                resultBox.setAttribute('contenteditable', 'true');
                document.getElementById('btnStop').disabled = true;
                document.getElementById('btnGen').disabled = false;
            }
        });

        // 大纲模版选择器

    window.ZHIYU_SCRIPT_GENERATION_READY = true;
})(window);
