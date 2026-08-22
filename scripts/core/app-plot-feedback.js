// ===== 测试版新增：剧情描述框 AI 反馈 =====
        (function(){
            var aiFloat = document.getElementById('aiFeedbackFloat');
            var aiBody = document.getElementById('aiFeedbackBody');
            var btnToggle = document.getElementById('btnToggleAIFeedback');
            var btnClose = document.getElementById('btnCloseAIFeedback');
            var btnClear = document.getElementById('btnClearAIFeedback');
            var btnSend = document.getElementById('btnPlotSend');
            var btnUpload = document.getElementById('btnPlotUpload');
            var btnChooseMemory = document.getElementById('btnPlotChooseMemory');
            var btnUploadFile = document.getElementById('btnPlotUploadFile');
            var btnUploadFolder = document.getElementById('btnPlotUploadFolder');
            var fileInput = document.getElementById('plotRefFileInput');
            var folderInput = document.getElementById('plotRefFolderInput');
            var fileChip = document.getElementById('plotFileChip');
            var uploadMenu = document.getElementById('plotUploadMenu');
            var plotInput = document.getElementById('aiFeedbackInput');
            var header = aiFloat ? aiFloat.querySelector('.log-header') : null;
            var Toast = window.ZHIYU_TOAST || window.Toast || { warn: function(){} };
            var Modal = window.ZHIYU_MODAL || window.Modal || { open: function(){} };
            var AppState = window.ZHIYU_APP_STATE || window.AppState || {};
            var getRefFileContent = window.getRefFileContent || function() { return null; };
            var ensureMemBook = window.ensureMemBook || function() {};
            var createPlotFeedbackRefController = window.createPlotFeedbackRefController || function() {
                return { getRefFile: function() { return null; } };
            };
            var refController = null;
            var sending = false;
            var plotAbortController = null;
            var ASSISTANT_PROTECTED_PROMPT_MESSAGE = '抱歉，这涉及知屿助手的内部设置，我不能提供。您可以告诉我想解决的文学写作问题，我会尽力帮您。';
            var ASSISTANT_IDENTITY_MESSAGE = '我是您的知屿写作助手。有什么文学写作问题需要我帮忙吗？';

            function getAiChatDayKey() {
                return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
            }
            function getAiChatUsageStorageKey() {
                var uid = (AppState.auth && (AppState.auth.uid || AppState.auth.username)) || 'guest';
                return 'zhiyu_ai_chat_usage_' + String(uid || 'guest').replace(/[^\w.-]/g, '_');
            }
            function readLocalAiChatUsage() {
                var day = getAiChatDayKey();
                try {
                    var raw = localStorage.getItem(getAiChatUsageStorageKey());
                    var data = raw ? JSON.parse(raw) : null;
                    if (!data || data.date !== day) return { date: day, count: 0 };
                    return { date: day, count: Math.max(0, Number(data.count || 0) || 0) };
                } catch(e) {
                    return { date: day, count: 0 };
                }
            }
            function writeLocalAiChatUsage(count) {
                var day = getAiChatDayKey();
                try {
                    localStorage.setItem(getAiChatUsageStorageKey(), JSON.stringify({ date: day, count: Math.max(0, Number(count || 0) || 0) }));
                } catch(e) {}
            }
            function getServerAiChatDialogCount(day) {
                var usage = (AppState.auth && AppState.auth.dailyUsage) || null;
                if (!usage) return 0;
                if (usage.date && usage.date !== day) return 0;
                return Math.max(0, Number(usage.aiChatDialogs || usage.aiChatDialogCount || 0) || 0);
            }
            function getTodayAiChatDialogCount() {
                var day = getAiChatDayKey();
                var local = readLocalAiChatUsage();
                return Math.max(getServerAiChatDialogCount(day), local.count || 0);
            }
            function renderAiChatDialogCount() {
                var countEl = document.getElementById('aiFeedbackDailyCount');
                if (countEl) countEl.textContent = '当日对话：' + getTodayAiChatDialogCount() + ' 次';
            }
            function incrementAiChatDialogCount() {
                var day = getAiChatDayKey();
                var next = getTodayAiChatDialogCount() + 1;
                writeLocalAiChatUsage(next);
                if (AppState.auth && AppState.auth.dailyUsage && (!AppState.auth.dailyUsage.date || AppState.auth.dailyUsage.date === day)) {
                    AppState.auth.dailyUsage.date = day;
                    AppState.auth.dailyUsage.aiChatDialogs = Math.max(Number(AppState.auth.dailyUsage.aiChatDialogs || AppState.auth.dailyUsage.aiChatDialogCount || 0) || 0, next);
                    AppState.auth.dailyUsage.aiChatDialogCount = AppState.auth.dailyUsage.aiChatDialogs;
                }
                renderAiChatDialogCount();
                return next;
            }

            function setUnread(on) {
                if (!btnToggle) return;
                btnToggle.classList.toggle('has-unread', !!on);
            }
            function openFloat() {
                if (aiFloat) aiFloat.classList.add('open');
                setUnread(false);
            }
            function markUnreadIfClosed() {
                if (aiFloat && !aiFloat.classList.contains('open')) setUnread(true);
            }
            if (btnToggle && aiFloat) btnToggle.addEventListener('click', function() {
                aiFloat.classList.toggle('open');
                if (aiFloat.classList.contains('open')) setUnread(false);
            });
            if (btnToggle) btnToggle.addEventListener('mousedown', function(e) { e.stopPropagation(); });
            if (btnClose && aiFloat) btnClose.addEventListener('click', function() { aiFloat.classList.remove('open'); });

            var dragInfo = null;
            if (header && aiFloat) {
                header.addEventListener('pointerdown', function(e) {
                    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
                    if (e.target.closest('button, .log-close')) return;
                    e.preventDefault();
                    var rect = aiFloat.getBoundingClientRect();
                    dragInfo = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, startLeft: rect.left, startTop: rect.top };
                    aiFloat.style.right = 'auto';
                    aiFloat.style.left = rect.left + 'px';
                    aiFloat.style.top = rect.top + 'px';
                    aiFloat.style.setProperty('resize', 'none');
                    header.setPointerCapture?.(e.pointerId);
                    document.body.style.userSelect = 'none';
                });
            }
            document.addEventListener('pointermove', function(e) {
                if (!dragInfo || !aiFloat || e.pointerId !== dragInfo.pointerId) return;
                var dx = e.clientX - dragInfo.startX;
                var dy = e.clientY - dragInfo.startY;
                aiFloat.style.left = Math.max(0, Math.min(window.innerWidth - aiFloat.offsetWidth, dragInfo.startLeft + dx)) + 'px';
                aiFloat.style.top = Math.max(0, Math.min(window.innerHeight - 40, dragInfo.startTop + dy)) + 'px';
            });
            function finishAiFloatDrag(e) {
                if (!dragInfo || !aiFloat || (e && e.pointerId !== dragInfo.pointerId)) return;
                dragInfo = null;
                aiFloat.style.setProperty('resize', 'both');
                document.body.style.userSelect = '';
            }
            document.addEventListener('pointerup', finishAiFloatDrag);
            document.addEventListener('pointercancel', finishAiFloatDrag);

            function clearEmpty() {
                if (!aiBody) return;
                var empty = aiBody.querySelector('.ai-feedback-empty');
                if (empty) empty.remove();
            }
            function createChatAvatar(role) {
                var avatar = document.createElement('div');
                avatar.className = 'ai-feedback-avatar ' + (role === 'user' ? 'is-user' : 'is-assistant');
                if (role === 'assistant') {
                    var logo = document.createElement('img');
                    logo.src = './LOGO-256.png';
                    logo.alt = '知屿助手';
                    avatar.appendChild(logo);
                    return avatar;
                }
                var userAvatar = AppState.auth && AppState.auth.avatar;
                if (userAvatar) {
                    var image = document.createElement('img');
                    image.src = userAvatar;
                    image.alt = '用户头像';
                    avatar.appendChild(image);
                } else {
                    avatar.classList.add('is-placeholder');
                    avatar.setAttribute('aria-label', '默认用户头像');
                    avatar.textContent = '';
                }
                return avatar;
            }

            function addFeedbackItem(title, role, initialText) {
                if (!aiBody) return null;
                clearEmpty();
                var item = document.createElement('div');
                role = role === 'user' ? 'user' : 'assistant';
                item.className = 'ai-feedback-item is-' + role;
                var bubble = document.createElement('div');
                bubble.className = 'ai-feedback-bubble';
                var head = document.createElement('div');
                head.className = 'ai-feedback-title';
                var titleEl = document.createElement('span');
                titleEl.textContent = title || (role === 'user' ? '您' : '知屿助手');
                var timeEl = document.createElement('span');
                timeEl.className = 'ai-feedback-time';
                timeEl.textContent = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                head.appendChild(titleEl);
                head.appendChild(timeEl);
                var content = document.createElement('div');
                content.className = 'ai-feedback-content' + (role === 'assistant' ? ' thinking' : '');
                content.textContent = typeof initialText === 'string' ? initialText : (role === 'assistant' ? '思考中...' : '');
                bubble.appendChild(head);
                bubble.appendChild(content);
                item.appendChild(createChatAvatar(role));
                item.appendChild(bubble);
                aiBody.appendChild(item);
                aiBody.scrollTop = aiBody.scrollHeight;
                return content;
            }

            function clearZhiyuAssistantChat() {
                if (sending) {
                    Toast.warn('请先停止或等待当前对话完成');
                    return false;
                }
                if (!aiBody) return false;
                aiBody.innerHTML = '<div class="ai-feedback-empty">还没有消息。你可以在下方输入内容与知屿助手对话。</div>';
                setUnread(false);
                return true;
            }
            if (btnClear) btnClear.addEventListener('click', clearZhiyuAssistantChat);
            refController = createPlotFeedbackRefController({
                btnUpload: btnUpload,
                btnChooseMemory: btnChooseMemory,
                btnUploadFile: btnUploadFile,
                btnUploadFolder: btnUploadFolder,
                fileInput: fileInput,
                folderInput: folderInput,
                fileChip: fileChip,
                uploadMenu: uploadMenu,
                Toast: Toast,
                Modal: Modal,
                AppState: AppState,
                getRefFileContent: getRefFileContent,
                ensureMemBook: ensureMemBook,
                updateLinkedMemoryCount: window.updateLinkedMemoryCount,
                refreshMemoryLinkTree: window.refreshMemoryLinkTree
            });
            window.clearZhiyuAssistantReferenceForBookChange = function() {
                return refController?.clearRefFileForBookChange?.() || false;
            };

            async function streamBackend(systemPrompt, userMessage, contentEl, signal, modelCfg) {
                modelCfg = modelCfg || getPlotFeedbackModelCandidates()[0];
                if (!modelCfg?.base || !modelCfg?.model) throw new Error('请先添加并选择自己的对话模型');
                var receivedText = false;
                await streamGenerate(
                    { ...modelCfg, maxTokens: modelCfg.maxTokens || 4096 },
                    systemPrompt,
                    userMessage,
                    function(text) {
                        receivedText = true;
                        contentEl.textContent += text;
                        markUnreadIfClosed();
                        if (aiBody) aiBody.scrollTop = aiBody.scrollHeight;
                    },
                    function() {},
                    function(error) { throw error; },
                    signal
                );
                if (!receivedText && !String(contentEl.textContent || '').trim()) {
                    var emptyError = new Error('知屿助手未返回内容');
                    emptyError.code = 'EMPTY_RESPONSE';
                    throw emptyError;
                }
            }

            function shouldRetryPlotFeedbackModel(err) {
                var raw = String(err?.message || err || '');
                return (typeof shouldRetryMemoryAnalysis === 'function' && shouldRetryMemoryAnalysis(err))
                    || /429|请求过于频繁|限流|模型响应超时|网络连接到模型服务失败|AI反馈未返回内容|AI对话未返回内容|知屿助手未返回内容|AI未返回内容|fetch failed|network|timeout/i.test(raw);
            }

            function getPlotFeedbackModelCandidates() {
                var selected = window.getSelectedModelConfig?.();
                return selected?.base && selected?.model ? [selected] : [];
            }

            function getPlotFeedbackFailureMessage(err) {
                if (typeof window.formatAiErrorForDisplay === 'function') {
                    return window.formatAiErrorForDisplay(err, '知屿助手请求失败');
                }
                return String(err?.message || err || '知屿助手请求失败');
            }

            async function streamPlotFeedbackWithFallback(systemPrompt, userMessage, contentEl, signal) {
                var candidates = getPlotFeedbackModelCandidates();
                if (!candidates.length) throw new Error('请先添加并选择自己的对话模型');
                var lastErr = null;
                for (var i = 0; i < candidates.length; i++) {
                    var cfg = candidates[i];
                    var beforeText = contentEl.textContent || '';
                    try {
                        await streamBackend(systemPrompt, userMessage, contentEl, signal, cfg);
                        return;
                    } catch(err) {
                        if (typeof isAbortLikeError === 'function' && isAbortLikeError(err)) throw err;
                        if (typeof isAuthExpiredError === 'function' && isAuthExpiredError(err)) throw err;
                        lastErr = err;
                        var hasPartial = String(contentEl.textContent || '').trim() && contentEl.textContent !== beforeText;
                        if (hasPartial || i >= candidates.length - 1 || !shouldRetryPlotFeedbackModel(err)) throw err;
                    if (window.Utils && typeof Utils.appendLog === 'function') Utils.appendLog(null, '知屿助手普通模型暂时不可用，正在自动切换...', 'progress');
                        contentEl.textContent = beforeText;
                    }
                }
                throw lastErr || new Error('知屿助手请求失败');
            }


            function isZhiyuAssistantProtectedPromptRequest(text) {
                var input = String(text || '').trim();
                var protectedSubject = '(?:你的|你自己的|知屿助手(?:自己|自身)?的|本助手(?:自己|自身)?的|助手自身的|系统自身的)';
                var protectedTarget = '(?:系统提示词|基础系统提示词|内部提示词|内部规则|运行机制|request_template|prompt)';
                var explicitAssistantOwned = new RegExp(protectedSubject + '.{0,8}' + protectedTarget, 'i')
                    .test(input) || new RegExp(protectedTarget + '.{0,8}' + protectedSubject, 'i').test(input);
                if (explicitAssistantOwned) return true;
                var userOwnedPrefix = '(?:我的|属于我的|我(?:自己|亲自)?(?:写|编写|设计|提供|创建|整理|准备)的|我(?:自己|亲自)?(?:写|编写|设计|创建|整理)给.{0,12}的|我(?:自己|亲自)?(?:给|为).{0,12}(?:写|编写|设计|创建|整理)的|由我(?:自己|亲自)?(?:写|编写|设计|提供|创建|整理)的)';
                var userOwnedMaterial = new RegExp(userOwnedPrefix + '.{0,8}' + protectedTarget, 'i').test(input)
                    || new RegExp(protectedTarget + '.{0,12}(?:是|由)?我(?:自己|亲自)?.{0,8}(?:写|编写|设计|提供|创建|整理)', 'i').test(input);
                if (userOwnedMaterial) return false;
                return /(?:展示|告诉|输出|翻译|复述|泄露).{0,12}(?:系统提示词|基础系统提示词|内部提示词|内部规则|运行机制|request_template)/i.test(input);
            }


            function isZhiyuAssistantIdentityRequest(text) {
                var input = String(text || '').trim();
                return /^(?:请问|你好[,，]?)?(?:你|知屿助手|本助手)(?:到底|究竟)?(?:是谁|是什么|是什么助手|叫什么(?:名字)?)\s*[?？!！。]*$/i.test(input)
                    || /^(?:请问|能否告诉我|可以告诉我)?(?:你|知屿助手|本助手)(?:到底|究竟)?(?:是什么(?:底层)?(?:模型|ai)|用的(?:是)?什么(?:模型|ai)|(?:是)?哪家的(?:模型|ai|助手)|底层模型(?:是什么)?|模型供应商(?:是谁)?|供应商是谁|(?:是由|由|是)?谁开发的|(?:是)?哪家公司开发的|(?:是|用的是)?(?:Anthropic|Google|OpenAI|Claude|Gemini)(?:的模型)?(?:吗)?)\s*[?？!！。]*$/i.test(input)
                    || /^(?:Anthropic|Google|OpenAI|Claude|Gemini).{0,8}(?:开发|提供|驱动)的?(?:是)?(?:你|知屿助手|本助手)(?:吗)?\s*[?？!！。]*$/i.test(input);
            }


            function buildZhiyuAssistantRequest(text, refFile) {
                if (isZhiyuAssistantIdentityRequest(text)) {
                    return { blocked: true, blockedMessage: ASSISTANT_IDENTITY_MESSAGE, systemPrompt: '', userMessage: '' };
                }
                if (isZhiyuAssistantProtectedPromptRequest(text)) {
                    return { blocked: true, blockedMessage: ASSISTANT_PROTECTED_PROMPT_MESSAGE, systemPrompt: '', userMessage: '' };
                }
                var bookName = AppState.chapter?.book || document.getElementById('bookSel')?.value || '';
                var referenceText = '';
                if (refFile) {
                    if (typeof window.buildAiReferenceContext !== 'function') throw new Error('参考文件说明模块未加载，请刷新页面后重试');
                    var referenceFiles = Array.isArray(refFile.files) && refFile.files.length ? refFile.files : [refFile];
                    referenceText = window.buildAiReferenceContext(bookName, referenceFiles, 'assistant').text;
                }
                var userMessage = [
                    '<user_request>',
                    String(text || '请根据所选参考文件回答我的文学写作问题。'),
                    '</user_request>',
                    referenceText ? ('\n<file_snippets>\n' + referenceText + '\n</file_snippets>') : ''
                ].filter(Boolean).join('\n');
                return {
                    blocked: false,
                    blockedMessage: '',
                    systemPrompt: '',
                    userMessage: userMessage
                };
            }

            async function sendPlotFeedback() {
                if (sending) {
                    if (plotAbortController) plotAbortController.abort(new DOMException('user_cancelled', 'AbortError'));
                    Toast.warn('正在停止知屿助手对话...');
                    return;
                }
                var text = (plotInput && plotInput.value || '').trim();
                var refFile = refController && refController.getRefFile ? refController.getRefFile() : null;
                if (!text && !refFile) { Toast.warn('请先输入内容或上传参考文件'); return; }
                var request;
                try {
                    request = buildZhiyuAssistantRequest(text, refFile);
                } catch (requestError) {
                    Toast.warn(requestError?.message || '参考文件读取失败，请重新选择后再试');
                    return;
                }
                var userVisibleText = text || '（仅发送参考文件）';
                if (refFile) userVisibleText += '\n附件：' + refFile.name;
                addFeedbackItem('您', 'user', userVisibleText);
                var contentEl = addFeedbackItem('知屿助手', 'assistant', request.blocked ? request.blockedMessage : '');
                if (!contentEl) return;
                openFloat();
                if (request.blocked) {
                    contentEl.classList.remove('thinking');
                    markUnreadIfClosed();
                    return;
                }
                contentEl.textContent = '';
                sending = true;
                setPlotSendWorking(true);
                if (plotInput) plotInput.value = '';
                if (refController && refController.clearRefFile) refController.clearRefFile();
                var abortController = new AbortController();
                plotAbortController = abortController;
                try {
                    await streamPlotFeedbackWithFallback(request.systemPrompt, request.userMessage, contentEl, abortController.signal);
                    if (!contentEl.textContent.trim()) contentEl.textContent = 'AI没有返回内容，请稍后重试。';
                    incrementAiChatDialogCount();
                } catch (err) {
                    if (isAbortLikeError(err)) {
                        contentEl.textContent += (contentEl.textContent ? '\n\n' : '') + '知屿助手对话已停止。';
                        Utils.appendLog(null, '已停止知屿助手对话', 'warn');
                    } else {
                        var failureMsg = getPlotFeedbackFailureMessage(err);
                        contentEl.textContent += (contentEl.textContent ? '\n\n' : '') + failureMsg;
                        Utils.appendLog(null, failureMsg, 'error');
                        Toast.error(failureMsg);
                    }
                } finally {
                    contentEl.classList.remove('thinking');
                    sending = false;
                    plotAbortController = null;
                    setPlotSendWorking(false);
                    markUnreadIfClosed();
                }
            }
            if (btnSend) btnSend.addEventListener('click', sendPlotFeedback);
            function shouldSendZhiyuAssistantOnEnter(event, assistantOpen, assistantSending) {
                if (!event || event.key !== 'Enter') return false;
                if (!assistantOpen || assistantSending) return false;
                if (event.shiftKey || event.altKey) return false;
                if (event.isComposing || event.keyCode === 229) return false;
                return true;
            }
            if (plotInput) {
                plotInput.addEventListener('keydown', function(e) {
                    var assistantOpen = !!(aiFloat && aiFloat.classList.contains('open'));
                    if (!shouldSendZhiyuAssistantOnEnter(e, assistantOpen, sending)) return;
                    e.preventDefault();
                    sendPlotFeedback();
                });
            }
            window.getAiChatDayKey = getAiChatDayKey;
            window.getAiChatUsageStorageKey = getAiChatUsageStorageKey;
            window.readLocalAiChatUsage = readLocalAiChatUsage;
            window.writeLocalAiChatUsage = writeLocalAiChatUsage;
            window.getServerAiChatDialogCount = getServerAiChatDialogCount;
            window.getTodayAiChatDialogCount = getTodayAiChatDialogCount;
            window.incrementAiChatDialogCount = incrementAiChatDialogCount;
            window.renderAiChatDialogCount = renderAiChatDialogCount;
            window.shouldRetryPlotFeedbackModel = shouldRetryPlotFeedbackModel;
            window.getPlotFeedbackModelCandidates = getPlotFeedbackModelCandidates;
            window.getPlotFeedbackFailureMessage = getPlotFeedbackFailureMessage;
            window.streamPlotFeedbackWithFallback = streamPlotFeedbackWithFallback;
            window.shouldSendZhiyuAssistantOnEnter = shouldSendZhiyuAssistantOnEnter;
            window.isZhiyuAssistantProtectedPromptRequest = isZhiyuAssistantProtectedPromptRequest;
            window.isZhiyuAssistantIdentityRequest = isZhiyuAssistantIdentityRequest;
            window.buildZhiyuAssistantRequest = buildZhiyuAssistantRequest;
            window.clearZhiyuAssistantChat = clearZhiyuAssistantChat;
            renderAiChatDialogCount();
        })();
