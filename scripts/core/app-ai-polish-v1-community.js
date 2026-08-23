(function(window, document) {
    'use strict';

    var AppState = window.ZHIYU_APP_STATE || window.AppState || {};
    var Toast = window.ZHIYU_TOAST || window.Toast || { warn: function(){}, success: function(){}, error: function(){} };
    var Confirm = window.ZHIYU_CONFIRM || window.Confirm || { show: function(){ return Promise.resolve(false); } };
    var Modal = window.ZHIYU_MODAL || window.Modal || { open: function(){}, close: function(){} };
    var Utils = window.ZHIYU_UTILS || window.Utils || {};
    var DEFAULT_AP_FOCUS_TEMPLATES = [
        { id: 'language', label: '语言', options: [
            { id: 'plain', title: '减少AI腔', content: '减少套路承接词、空泛评价和总结式表达。' },
            { id: 'webnovel', title: '网文节奏', content: '强化动作、对话和即时冲突，减少解释。' }
        ] },
        { id: 'emotion', label: '情绪', options: [
            { id: 'show', title: '少解释', content: '用动作和细节表现情绪，不直接说明心理。' },
            { id: 'dialogue', title: '对话自然', content: '减少标签化语气和机械问答。' }
        ] },
        { id: 'plot', label: '剧情', options: [
            { id: 'keep', title: '保留信息', content: '保留人物、地点、因果、伏笔和冲突结果。' },
            { id: 'tighten', title: '压缩拖沓', content: '压缩重复解释，保留推进句。' }
        ] }
    ];
    var AP_TEMPLATE_PRESETS = [
        { id: 'preset:general', title: '通用网文', prompt: '按通用网文阅读体验进行AI优化，减少模板句、解释腔、机械转折和章尾升华。' },
        { id: 'preset:male', title: '男频爽文', prompt: '按男频爽文节奏优化，强化动作推进、爽点落差和短促有力的表达，避免空泛燃点。' },
        { id: 'preset:female', title: '女频情感', prompt: '按女频情感表达优化，保留情绪层次，减少机械心理告知，增加具体动作和细节承接。' },
        { id: 'preset:suspense', title: '悬疑', prompt: '按悬疑叙事优化，强化信息递进、疑点埋设和克制表达，避免提前解释答案。' },
        { id: 'preset:guyan', title: '古言', prompt: '按古言语感优化，保持人物身份和时代氛围，减少现代解释腔和模板化情绪词。' }
    ];
    var AP_INTENSITY_TEXT = {
        light: '轻度：只处理明显 AI 词、模板句、章尾升华，尽量保留原句。适合怕改剧情、只想去掉明显痕迹的章节。',
        medium: '中度：处理词句、段落节奏、心理告知、解释腔、对话机械。允许拆句、合段、调整语序，是常用档。',
        heavy: '重度：允许段落级重写表达，但必须保留所有剧情信息点。适合 AI 味很重的章节，必须经过剧情复核。'
    };
    var AP_FOCUS_TEMPLATES = Array.isArray(window.ZHIYU_AP_FOCUS_TEMPLATES)
        ? window.ZHIYU_AP_FOCUS_TEMPLATES
        : DEFAULT_AP_FOCUS_TEMPLATES;

    function outlineGen() {
        AppState.outlineGen = AppState.outlineGen || {};
        AppState.outlineGen.apConfig = AppState.outlineGen.apConfig || {};
        return AppState.outlineGen;
    }

    function isV1Active() {
        return typeof window.getAIPolishMode !== 'function' || window.getAIPolishMode() === 'v1';
    }

    function getCurrentBodyPlainText() {
        var resultBox = document.getElementById('resultBox');
        return (resultBox?.innerText || resultBox?.textContent || '').trim();
    }

    function getCurrentAIPolishChapterKey() {
        var state = window.ZHIYU_APP_STATE || window.AppState || {};
        var chapterState = state.chapter || {};
        var book = String(chapterState.book || '');
        var volumeIndex = Number(chapterState.vi);
        var chapterIndex = Number(chapterState.ci);
        var chapter = null;
        try {
            var books = typeof window.gB === 'function' ? window.gB() : {};
            chapter = books?.[book]?.volumes?.[volumeIndex]?.chapters?.[chapterIndex] || null;
        } catch (_error) {}
        var accountUid = String(window.AccountDataScope?.getActiveUid?.() || state.auth?.uid || 'local');
        var localId = String(chapter?._localId || '');
        return [accountUid, book, volumeIndex, chapterIndex, localId].join('|');
    }

    function isCurrentAIPolishSource(chapterKey, sourceText) {
        return !!chapterKey
            && chapterKey === getCurrentAIPolishChapterKey()
            && String(sourceText || '').trim() === getCurrentBodyPlainText();
    }

    function getConfiguredActionModel() {
        var model = typeof window.getActionModelConfig === 'function' ? window.getActionModelConfig() : null;
        return model?.base && model?.model ? model : null;
    }

    function escapeHtml(value) {
        if (Utils.escapeHtml) return Utils.escapeHtml(value);
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function setAPStatus(text, active) {
        var strip = document.getElementById('apStatusStrip');
        var label = document.getElementById('apStatusText');
        if (label) label.textContent = text || '';
        if (strip) {
            strip.classList.toggle('active', !!active && !!text);
            strip.style.display = active && text ? 'flex' : 'none';
        }
    }

    function clearAPStatusTimers() {
        var state = outlineGen();
        (state.apStatusTimers || []).forEach(function(timer) { clearTimeout(timer); });
        state.apStatusTimers = [];
    }

    function setAPApplyEnabled(enabled) {
        var button = document.getElementById('btnAPSave');
        if (button && isV1Active()) button.disabled = !enabled;
    }

    function setAIPolishV1ButtonsWorking(working) {
        ['btnAIDetect', 'btnAPLock', 'btnAIPolish'].forEach(function(id) {
            var button = document.getElementById(id);
            if (button) button.disabled = !!working;
        });
    }

    function setAPLockButton(state) {
        var button = document.getElementById('btnAPLock');
        if (!button) return;
        button.classList.remove('ap-lock-done');
        button.disabled = false;
        if (state === 'working') {
            button.textContent = '锁定中...';
            button.disabled = true;
        } else if (state === 'done') {
            button.textContent = '已锁定';
            button.classList.add('ap-lock-done');
        } else {
            button.textContent = '剧情锁定';
        }
    }

    function getAPReportBodyHtml(reportHtml) {
        var fallback = '<div style="font-size:12px;color:#6b7280;">请先点击 AI检测。</div>';
        if (!reportHtml) return fallback;
        try {
            var temporary = document.createElement('div');
            temporary.innerHTML = String(reportHtml || '').replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
            var body = temporary.querySelector('.ap-detect-body');
            if (body) return body.innerHTML || fallback;
            var card = temporary.querySelector('.ap-report-card');
            if (card) {
                var firstTitle = card.querySelector('.ap-report-title');
                if (firstTitle && /AI检测报告/.test(firstTitle.textContent || '')) firstTitle.remove();
                return card.innerHTML || fallback;
            }
            return temporary.innerHTML || fallback;
        } catch (_error) {
            return fallback;
        }
    }

    function renderAPDetectPanel(reportHtml) {
        var expanded = outlineGen().apReportExpanded !== false;
        return '<div class="ap-detect-panel' + (expanded ? ' active' : '') + '"><div class="ap-detect-header" contenteditable="false" role="button" tabindex="0"><div class="ap-report-title">AI检测报告</div><button type="button" class="ap-detect-toggle">' + (expanded ? '收起' : '展开') + '</button></div><div class="ap-detect-body">' + getAPReportBodyHtml(reportHtml) + '</div></div>';
    }

    function buildAIPolishLineMatches(originalLines, finalLines) {
        var positions = new Map();
        originalLines.forEach(function(line, index) {
            if (!String(line || '').trim()) return;
            if (!positions.has(line)) positions.set(line, { indexes: [], cursor: 0 });
            positions.get(line).indexes.push(index);
        });
        var matches = [];
        var lastOriginal = -1;
        finalLines.forEach(function(line, finalIndex) {
            if (!String(line || '').trim() || !positions.has(line)) return;
            var entry = positions.get(line);
            while (entry.cursor < entry.indexes.length && entry.indexes[entry.cursor] <= lastOriginal) entry.cursor++;
            if (entry.cursor >= entry.indexes.length) return;
            var originalIndex = entry.indexes[entry.cursor++];
            lastOriginal = originalIndex;
            matches.push({ originalIndex: originalIndex, finalIndex: finalIndex });
        });
        return matches;
    }

    function renderAIPolishDiffHtml(originalText, finalText) {
        var normalizedOriginal = String(originalText || '').replace(/\r\n?/g, '\n');
        var normalizedFinal = String(finalText || '').replace(/\r\n?/g, '\n');
        if (!normalizedOriginal.trim() || normalizedOriginal.length + normalizedFinal.length > 200000) {
            return escapeHtml(normalizedFinal).replace(/\n/g, '<br>');
        }
        var originalLines = normalizedOriginal.split('\n');
        var finalLines = normalizedFinal.split('\n');
        if (finalLines.length > 5000) return finalLines.map(escapeHtml).join('<br>');
        var matches = buildAIPolishLineMatches(originalLines, finalLines);
        var matchByFinal = new Map();
        var nextMatchByFinal = new Array(finalLines.length);
        var previousOriginal = -1;
        matches.forEach(function(match) { matchByFinal.set(match.finalIndex, match); });
        var nextMatch = null;
        for (var reverseIndex = finalLines.length - 1; reverseIndex >= 0; reverseIndex--) {
            if (matchByFinal.has(reverseIndex)) nextMatch = matchByFinal.get(reverseIndex);
            nextMatchByFinal[reverseIndex] = nextMatch;
        }
        return finalLines.map(function(line, index) {
            var match = matchByFinal.get(index);
            var escaped = escapeHtml(line);
            if (match) {
                previousOriginal = match.originalIndex;
                return escaped;
            }
            if (!String(line || '').trim()) return '';
            var followingMatch = nextMatchByFinal[index];
            var originalGapEnd = followingMatch ? followingMatch.originalIndex : originalLines.length;
            var className = originalGapEnd <= previousOriginal + 1 ? 'ap-change-add' : 'ap-change-replace';
            return '<span class="ap-change ' + className + '">' + escaped + '</span>';
        }).join('<br>');
    }

    function renderAIPolishV1Panel(mode) {
        if (!isV1Active()) return;
        var box = document.getElementById('apContentBox');
        if (!box) return;
        var state = outlineGen();
        var reportHtml = state.apDetectReportHtml ? renderAPDetectPanel(state.apDetectReportHtml) : '';
        var lockIsCurrent = !!state.apLockContent
            && isCurrentAIPolishSource(state.apLockSourceChapterKey, state.apLockSourceText);
        var lockHtml = '';
        if (lockIsCurrent) {
            var lockOpen = state.apLockExpanded !== false;
            lockHtml = '<div class="ap-lock-panel' + (lockOpen ? ' active' : '') + '"><div class="ap-lock-header" contenteditable="false" role="button" tabindex="0"><div class="ap-report-title">剧情锁定内容</div><button type="button" class="ap-lock-toggle">' + (lockOpen ? '收起' : '展开') + '</button></div><div class="ap-lock-body">' + escapeHtml(state.apLockContent).replace(/\n/g, '<br>') + '</div></div>';
        }
        var finalText = state.apFinalText || '';
        var finalIsCurrent = !!finalText
            && isCurrentAIPolishSource(state.apPolishSourceChapterKey, state.apPolishSourceText);
        var finalHtml = (mode === 'final' || state.apMode === 'polish_done') && finalIsCurrent
            ? '<div class="ap-final-text">' + renderAIPolishDiffHtml(state.apPolishSourceText || '', finalText) + '</div>'
            : '';
        if (reportHtml || lockHtml || finalHtml) {
            box.innerHTML = '<div class="ap-report">' + reportHtml + lockHtml + finalHtml + '</div>';
            var report = box.querySelector('.ap-report');
            var headers = report ? Array.prototype.slice.call(report.querySelectorAll('.ap-detect-header, .ap-lock-header')) : [];
            if (report && headers.length) {
                var stickyStack = document.createElement('div');
                stickyStack.classList.add('ap-sticky-stack');
                stickyStack.setAttribute('contenteditable', 'false');
                headers.forEach(function(header) { stickyStack.appendChild(header); });
                report.insertBefore(stickyStack, report.firstChild);
                report.querySelectorAll('.ap-detect-panel, .ap-lock-panel').forEach(function(panel) {
                    panel.classList.add('ap-panel-body-shell');
                });
            }
        } else {
            box.innerHTML = '<div class="ap-v1-empty">按顺序使用 AI检测、剧情锁定、AI优化。</div>';
        }
        setAPApplyEnabled(finalIsCurrent);
        setAPLockButton(lockIsCurrent ? 'done' : 'idle');
        window.updateAIPolishSharedStatus?.();
    }

    function getAIPolishFocusGroups() {
        return AP_FOCUS_TEMPLATES;
    }

    function getAIPolishFocusOption(groupId, optionId) {
        var group = getAIPolishFocusGroups().find(function(item) { return item.id === groupId; });
        return group ? group.options.find(function(item) { return item.id === optionId; }) : null;
    }

    function setAIPolishTemplateButtonText(text) {
        var button = document.getElementById('apConfigTemplateBtn');
        if (!button) return;
        var config = outlineGen().apConfig || {};
        var selectedId = String(config.templateId || '').replace(/^tpl:/, '');
        var template = selectedId && typeof window.gTPublic === 'function'
            ? window.gTPublic().find(function(item) { return item && String(item.id) === selectedId; })
            : null;
        if (!template && text && String(config.templateId || '').startsWith('preset:')) {
            template = { title: text, builtIn: true, author: '内置' };
        }
        if (typeof window.renderTemplateSelectionButton === 'function') {
            window.renderTemplateSelectionButton(button, template, { title: text || '', placeholder: '请选择提示词模版' });
        } else {
            button.textContent = text || '请选择提示词模版';
            button.classList.toggle('is-placeholder', !text);
        }
    }

    function getAIPolishTemplateConfig(templateId) {
        if (String(templateId || '').startsWith('tpl:')) {
            var id = String(templateId).slice(4);
            var templates = typeof window.gTPublic === 'function' ? window.gTPublic() : [];
            var selected = templates.find(function(template) { return String(template.id) === id; });
            if (selected) return { id: id, title: selected.title || 'AI优化模板', prompt: selected.systemPrompt || '' };
        }
        return AP_TEMPLATE_PRESETS.find(function(template) { return template.id === templateId; }) || AP_TEMPLATE_PRESETS[0];
    }

    function renderAIPolishFocusSelectors() {
        var box = document.getElementById('apFocusOptions');
        if (!box) return;
        var selectedMap = outlineGen().apConfig?.focusTemplates || {};
        box.innerHTML = getAIPolishFocusGroups().map(function(group) {
            var options = ['<option value="">不指定</option>'].concat((group.options || []).map(function(option) {
                return '<option value="' + escapeHtml(option.id) + '">' + escapeHtml(option.title) + '</option>';
            })).join('');
            return '<label class="ap-focus-row"><span>' + escapeHtml(group.label) + '：</span><select class="ap-focus-select" data-group="' + escapeHtml(group.id) + '">' + options + '</select></label>';
        }).join('');
        box.querySelectorAll('.ap-focus-select').forEach(function(select) {
            select.value = selectedMap[select.dataset.group || ''] || '';
        });
    }

    function populateAIPolishTemplateSelect() {
        var config = outlineGen().apConfig || {};
        setAIPolishTemplateButtonText(config.templateName || '');
        renderAIPolishFocusSelectors();
        var intensity = config.intensity || 'medium';
        document.querySelectorAll('#apIntensityOptions .ap-option-card').forEach(function(button) {
            button.classList.toggle('selected', button.dataset.intensity === intensity);
        });
    }

    function openAIPolishTemplateSelector() {
        if (typeof window.openTemplateSelectorWithContext === 'function') {
            window.openTemplateSelectorWithContext({ context: 'aiPolish', subCategory: 'AI消痕' });
        } else if (typeof window.openTemplateSelector === 'function') {
            window._tplSelectContext = 'aiPolish';
            window.openTemplateSelector();
        }
    }

    function getAIPolishConfigFromModal() {
        var selectedIntensity = document.querySelector('#apIntensityOptions .ap-option-card.selected');
        var focusTemplates = {};
        var focusSelections = [];
        document.querySelectorAll('#apFocusOptions .ap-focus-select').forEach(function(select) {
            var groupId = select.dataset.group || '';
            var optionId = select.value || '';
            var option = getAIPolishFocusOption(groupId, optionId);
            if (!groupId || !option) return;
            focusTemplates[groupId] = optionId;
            var group = getAIPolishFocusGroups().find(function(item) { return item.id === groupId; });
            focusSelections.push({ groupId: groupId, label: group?.label || groupId, id: optionId, title: option.title, content: option.content || '' });
        });
        var previous = outlineGen().apConfig || {};
        return {
            templateId: previous.templateId || 'preset:general',
            templateName: previous.templateName || getAIPolishTemplateConfig(previous.templateId || 'preset:general').title,
            intensity: selectedIntensity?.dataset?.intensity || 'medium',
            focusTemplates: focusTemplates,
            focusSelections: focusSelections
        };
    }

    function requireV1Ready(actionLabel) {
        if (!isV1Active()) return false;
        if (outlineGen().apAbortController || window.isNaturalizeV2Running?.()) {
            Toast.warn('当前消痕任务正在运行，请先停止后再继续');
            return false;
        }
        if (!getCurrentBodyPlainText()) {
            Toast.warn('正文为空，无法' + actionLabel);
            return false;
        }
        if (!getConfiguredActionModel()) {
            Toast.warn('请先在设置中配置自己的工具模型');
            return false;
        }
        return true;
    }

    function openAIPolishConfig() {
        if (!requireV1Ready('优化')) return;
        populateAIPolishTemplateSelect();
        Modal.open('aiPolishConfigModal');
    }

    function buildAPLockPrompts(text) {
        return {
            system: [
                '你是小说剧情锁定助手，只提取剧情关键点，不改写正文。',
                '必须按以下九项输出：人物、地点、时间线、事件顺序、因果关系、道具设定、伏笔钩子、情绪转折、章尾悬念。',
                '只输出提取结果，不要点评，不要给写作建议。'
            ].join('\n'),
            user: '请锁定以下正文的剧情关键点：\n\n' + text
        };
    }

    function buildAIPolishPrompts(text, config, lockContent) {
        var safeConfig = config || {};
        var template = getAIPolishTemplateConfig(safeConfig.templateId);
        var focusSelections = Array.isArray(safeConfig.focusSelections) ? safeConfig.focusSelections : [];
        var focusText = focusSelections.length ? focusSelections.map(function(item) { return item.label + '：' + item.title; }).join('；') : '不指定';
        var focusPromptText = focusSelections.map(function(item) {
            return '### ' + item.label + '：' + item.title + '\n' + (item.content || '');
        }).join('\n\n');
        var intensityText = AP_INTENSITY_TEXT[safeConfig.intensity] || AP_INTENSITY_TEXT.medium;
        var detectionText = outlineGen().apDetectReportText || '';
        var systemPrompt = [
            '你是一名有5年经验的真人网文作者和自媒体作者，擅长把机器味很重的文字改成更自然的手写感。',
            '你的表达要口语化、接地气，句子长短不一，可以有轻微停顿和一点点不那么完美的转折，但不能乱改剧情。',
            '',
            '【本次提示词模板】',
            template.prompt || '按通用网文阅读体验进行AI优化，减少模板句、解释腔、机械转折和章尾升华。',
            '',
            '【AI优化三段式流程】',
            '第一步：诊断。先阅读【AI检测报告】和【待优化正文】，只在内部判断 AI 味、流水账、空话、节奏问题、机械连接词和段落僵硬处，不要输出诊断过程。',
            '第二步：受限改写。只按诊断结果、本次提示词模板、优化力度和侧重点改写表达；保留原文剧情事实、人物关系、事件顺序、道具设定和伏笔。',
            '第三步：自检。输出前对照【剧情锁定内容】检查人物、地点、时间线、事件顺序、因果关系、道具设定、伏笔、情绪转折、章尾悬念是否漂移；发现漂移必须先修正再输出。',
            '如果检测报告和剧情锁定冲突，剧情锁定优先；只改表达，不改剧情事实。',
            '',
            '【优化力度】' + intensityText,
            '【侧重点】' + focusText,
            focusPromptText ? '【侧重点参考模板】\n' + focusPromptText : '',
            '',
            '【硬性规则】',
            '1. 保留全部核心信息和剧情，不新增剧情，不删除剧情，不更换人物关系。',
            '2. 输出字数控制在原文字数的85%-120%之间。',
            '3. 去掉AI味、解释腔、模板句、工整排比、机械连接词和空泛升华。',
            '4. 不要使用“首先、其次、最后、综上所述、总而言之、由此可见”这类机械连接词。',
            '5. 句子长短错落，段落长短不一，不要每段都差不多。',
            '6. 可以自然加入2-3个不改变剧情的小细节，比如动作、场景触感、角色当下的小反应；不要编造新设定和新事件。',
            '7. 可以少量使用口语词和网络语，但必须顺，不要刻意。',
            '8. 逻辑可以有轻微跳跃，不用把每个情绪都解释清楚。',
            '9. 最终只输出优化后的正文，不要标题，不要报告，不要“以下是正文”，不要解释。',
            '',
            '【失败条件】',
            '如果你无法保证剧情不漂移，就保守改写，不要大幅重写；禁止输出诊断报告、复核报告、修正说明或任何解释。'
        ].join('\n');
        var userMessage = [
            '【AI检测报告（必须参考，优先处理其中的标记和建议）】',
            detectionText || '未检测',
            '',
            '【剧情锁定内容】',
            lockContent || '未提供',
            '',
            '【待优化正文】',
            text
        ].join('\n');
        return { system: systemPrompt, user: userMessage, templateTitle: template.title || 'AI优化' };
    }

    function cleanAIPolishFinalText(text) {
        return String(text || '').trim()
            .replace(/^```(?:text|markdown|md|正文)?\s*/i, '')
            .replace(/```$/i, '')
            .replace(/^(?:以下是(?:改写后|消痕后)?正文[:：]?|改写后正文[:：]?|消痕后正文[:：]?)/, '')
            .trim();
    }

    async function runAIPolishLLM(systemPrompt, userPrompt, abortController, meta) {
        var options = meta || {};
        var model = options.modelCfg || getConfiguredActionModel();
        if (!model?.base || !model?.model) {
            var missingModelError = new Error('请先在设置中配置自己的工具模型');
            missingModelError.code = 'COMMUNITY_MODEL_REQUIRED';
            throw missingModelError;
        }
        if (typeof window.streamGenerate !== 'function') throw new Error('自备模型接口尚未初始化');
        var output = '';
        var requestError = null;
        var signal = abortController?.signal || new AbortController().signal;
        await window.streamGenerate(
            Object.assign({}, model, { maxTokens: options.maxTokens || model.maxTokens }),
            systemPrompt,
            userPrompt,
            function(chunk) { output += String(chunk || ''); },
            function(finalText) { output = String(finalText || output); },
            function(error) { requestError = error instanceof Error ? error : new Error(String(error || options.fallback || 'AI请求失败')); },
            signal,
            { timeoutMs: options.timeoutMs }
        );
        if (requestError) throw requestError;
        output = String(output || '').trim();
        if (!output) throw new Error((options.fallback || 'AI请求失败') + '：模型未返回可用内容');
        return output;
    }

    async function triggerAPPlotLock(auto) {
        if (!requireV1Ready('锁定剧情')) return '';
        var text = getCurrentBodyPlainText();
        var sourceChapterKey = getCurrentAIPolishChapterKey();
        window.ensureAIDetectState?.(text, true, { preserveExisting: true });
        var state = outlineGen();
        if (!isCurrentAIPolishSource(state.apLockSourceChapterKey, state.apLockSourceText)) {
            state.apLockContent = '';
            state.apLockSourceText = '';
            state.apLockSourceChapterKey = '';
        }
        state.apFinalText = '';
        state.apPolishSourceText = '';
        state.apPolishSourceChapterKey = '';
        state.apMode = 'lock';
        setAPApplyEnabled(false);
        renderAIPolishV1Panel();
        clearAPStatusTimers();
        setAPStatus('正在锁定剧情关键点...', true);
        setAPLockButton('working');
        setAIPolishV1ButtonsWorking(true);
        state.apLockExpanded = true;
        var abortController = new AbortController();
        state.apAbortController = abortController;
        var contentBox = document.getElementById('apContentBox');
        if (contentBox) contentBox.classList.add('generating');
        window.setOGSendWorking?.(true, '剧情锁定');
        var prompts = buildAPLockPrompts(text);
        Utils.appendLog?.(null, '正在锁定剧情关键点', 'progress');
        try {
            var locked = await runAIPolishLLM(prompts.system, prompts.user, abortController, {
                modelCfg: getConfiguredActionModel(),
                maxTokens: 4096,
                fallback: '剧情锁定失败'
            });
            if (abortController.signal.aborted || !isCurrentAIPolishSource(sourceChapterKey, text)) {
                Utils.appendLog?.(null, '剧情锁定完成，但来源章节或正文已变化，旧结果未写入', 'warn');
                if (!auto) Toast.warn('章节或正文已变化，请在当前章节重新锁定');
                return '';
            }
            state.apLockContent = locked;
            state.apLockSourceText = text;
            state.apLockSourceChapterKey = sourceChapterKey;
            state.apMode = 'lock_done';
            setAPStatus('', false);
            renderAIPolishV1Panel();
            Utils.appendLog?.(null, '剧情锁定完成', 'success');
            if (!auto) Toast.success('剧情关键点已锁定');
            return state.apLockContent;
        } catch (error) {
            if (window.isAbortLikeError?.(error) || error?.name === 'AbortError') {
                Utils.appendLog?.(null, '已停止剧情锁定', 'warn');
            } else {
                var message = String(error?.message || error || '剧情锁定失败');
                Utils.appendLog?.(null, message, 'error');
                Toast.error(message);
            }
            setAPStatus('', false);
            setAPLockButton(state.apLockContent ? 'done' : 'idle');
            return '';
        } finally {
            if (state.apAbortController === abortController) {
                state.apAbortController = null;
                if (contentBox) contentBox.classList.remove('generating');
                window.setOGSendWorking?.(false);
                setAPStatus('', false);
                setAIPolishV1ButtonsWorking(false);
                setAPLockButton(isCurrentAIPolishSource(state.apLockSourceChapterKey, state.apLockSourceText) ? 'done' : 'idle');
            }
        }
    }

    async function startAIPolishWithConfig() {
        if (!requireV1Ready('优化')) return false;
        var text = getCurrentBodyPlainText();
        var sourceChapterKey = getCurrentAIPolishChapterKey();
        var config = getAIPolishConfigFromModal();
        var state = outlineGen();
        state.apConfig = config;
        Modal.close('aiPolishConfigModal');
        state.apPolishSourceText = text;
        state.apPolishSourceChapterKey = sourceChapterKey;
        window.ensureAIDetectState?.(text, true, { preserveExisting: true });
        renderAIPolishV1Panel();
        setAPApplyEnabled(false);
        var lockContent = isCurrentAIPolishSource(state.apLockSourceChapterKey, state.apLockSourceText)
            ? state.apLockContent
            : '';
        if (!lockContent) {
            lockContent = await triggerAPPlotLock(true);
            if (!lockContent) return false;
        }
        state.apPolishSourceText = text;
        state.apPolishSourceChapterKey = sourceChapterKey;
        var contentBox = document.getElementById('apContentBox');
        var abortController = new AbortController();
        state.apAbortController = abortController;
        state.apMode = 'polish';
        clearAPStatusTimers();
        setAPStatus('正在进行受限优化...', true);
        state.apStatusTimers = [
            setTimeout(function() { if (state.apAbortController === abortController) setAPStatus('正在复核剧情一致性...', true); }, 2200),
            setTimeout(function() { if (state.apAbortController === abortController) setAPStatus('正在修正漂移段落...', true); }, 4800)
        ];
        if (contentBox) contentBox.classList.add('generating');
        setAIPolishV1ButtonsWorking(true);
        window.setOGSendWorking?.(true, 'AI优化');
        var prompts = buildAIPolishPrompts(text, config, lockContent);
        Utils.appendLog?.(null, '正在进行AI优化', 'progress');
        try {
            var finalText = await runAIPolishLLM(prompts.system, prompts.user, abortController, {
                modelCfg: getConfiguredActionModel(),
                maxTokens: 16384,
                fallback: 'AI优化失败'
            });
            if (abortController.signal.aborted || !isCurrentAIPolishSource(sourceChapterKey, text)) {
                var staleSourceError = new Error('章节或正文已变化，请在当前章节重新优化');
                staleSourceError.code = 'AI_POLISH_SOURCE_CHANGED';
                throw staleSourceError;
            }
            var polishCheck = window.validateAIPolishFinalText(finalText, text);
            if (!polishCheck.ok) throw new Error(polishCheck.message);
            state.apFinalText = polishCheck.content;
            state.apContent = polishCheck.content;
            state.apMode = 'polish_done';
            renderAIPolishV1Panel('final');
            setAPStatus('', false);
            setAPApplyEnabled(true);
            Utils.appendLog?.(null, 'AI优化完成，已通过三段式自检', 'success');
            Toast.success('AI优化完成，请检查后再应用到正文');
            return true;
        } catch (error) {
            if (window.isAbortLikeError?.(error) || error?.name === 'AbortError') {
                Utils.appendLog?.(null, '已停止AI优化', 'warn');
            } else if (error?.code === 'AI_POLISH_SOURCE_CHANGED') {
                Utils.appendLog?.(null, error.message, 'warn');
                Toast.warn(error.message);
            } else {
                var message = String(error?.message || error || 'AI优化失败');
                Utils.appendLog?.(null, message, 'error');
                Toast.error(message);
            }
            return false;
        } finally {
            clearAPStatusTimers();
            if (contentBox) contentBox.classList.remove('generating');
            if (state.apAbortController === abortController) state.apAbortController = null;
            window.setOGSendWorking?.(false);
            setAIPolishV1ButtonsWorking(false);
            setAPLockButton(isCurrentAIPolishSource(state.apLockSourceChapterKey, state.apLockSourceText) ? 'done' : 'idle');
            setAPStatus('', false);
        }
    }

    async function applyAIPolishV1Result() {
        if (!isV1Active()) return false;
        var state = outlineGen();
        var finalText = String(document.querySelector('#apContentBox .ap-final-text')?.innerText || state.apFinalText || '').trim();
        if (!finalText) {
            Toast.warn('当前没有可应用的AI优化结果');
            return false;
        }
        if (!isCurrentAIPolishSource(state.apPolishSourceChapterKey, state.apPolishSourceText)) {
            setAPApplyEnabled(false);
            Toast.warn('这个优化结果不属于当前章节，或正文已经变化，请重新优化');
            return false;
        }
        var confirmed = await Confirm.show('确定用当前AI优化结果覆盖本章正文吗？');
        if (!confirmed) return false;
        if (!isCurrentAIPolishSource(state.apPolishSourceChapterKey, state.apPolishSourceText)) {
            setAPApplyEnabled(false);
            Toast.warn('确认期间章节或正文发生了变化，本次没有覆盖');
            return false;
        }
        window.clearAIDetectHighlights?.(true);
        window.writePlainTextToResultBox?.(finalText, { saveChapter: true, dispatchInput: true });
        state.apFinalText = finalText;
        state.apContent = finalText;
        var replaceStatus = document.getElementById('naturalizeReplaceStatus');
        if (replaceStatus) {
            replaceStatus.textContent = '已替换';
            replaceStatus.classList.remove('is-unapplied');
            replaceStatus.classList.add('is-applied');
        }
        Toast.success('已应用到正文');
        return true;
    }

    function cancelAIPolishV1() {
        var controller = outlineGen().apAbortController;
        if (!controller) return false;
        controller.abort(new DOMException('user_cancelled', 'AbortError'));
        return true;
    }

    function resetAIPolishV1State() {
        var state = outlineGen();
        ['apDetectText', 'apDetectHits', 'apDetectReportText', 'apDetectReportHtml', 'apLockContent', 'apLockSourceText', 'apLockSourceChapterKey', 'apFinalText', 'apContent', 'apPolishSourceText', 'apPolishSourceChapterKey'].forEach(function(key) {
            state[key] = Array.isArray(state[key]) ? [] : '';
        });
        state.apMode = '';
    }

    function invalidateAIPolishV1State() {
        window.clearAIDetectHighlights?.(true);
        resetAIPolishV1State();
    }

    async function clearAIPolishV1Result(options) {
        var state = outlineGen();
        if (state.apAbortController) {
            Toast.warn('消痕 I 正在处理，请先停止后再清空');
            return false;
        }
        var hasContent = !!(state.apDetectReportHtml || state.apLockContent || state.apFinalText);
        if (!hasContent) {
            if (!options?.silent) Toast.warn('消痕 I 内容已经是空的');
            return false;
        }
        if (!options?.skipConfirm) {
            var confirmed = await Confirm.show('确定清空当前“消痕 I”检测、锁定和优化结果吗？不会删除章节正文。');
            if (!confirmed) return false;
        }
        invalidateAIPolishV1State();
        var replaceStatus = document.getElementById('naturalizeReplaceStatus');
        if (replaceStatus) {
            replaceStatus.textContent = '未替换';
            replaceStatus.classList.remove('is-applied');
            replaceStatus.classList.add('is-unapplied');
        }
        renderAIPolishV1Panel();
        if (!options?.silent) Toast.success('已清空消痕 I 结果');
        return true;
    }

    function bindAIPolishV1Ui() {
        document.getElementById('btnAIDetect')?.addEventListener('click', function() {
            if (!requireV1Ready('检测')) return;
            window.triggerAIDetect?.();
        });
        document.getElementById('btnAPLock')?.addEventListener('click', function() { triggerAPPlotLock(false); });
        document.getElementById('btnAIPolish')?.addEventListener('click', openAIPolishConfig);
        document.getElementById('apConfigTemplateBtn')?.addEventListener('click', openAIPolishTemplateSelector);
        document.getElementById('btnAPTemplateMenu')?.addEventListener('click', function(event) {
            event.preventDefault();
            event.stopPropagation();
            window.openTemplateQuickMenu?.(this, {
                context: 'aiPolish',
                getSelectedId: function() { return String(outlineGen().apConfig?.templateId || '').replace(/^tpl:/, ''); }
            });
        });
        document.getElementById('btnStartAIPolish')?.addEventListener('click', startAIPolishWithConfig);
        document.querySelectorAll('#apIntensityOptions .ap-option-card').forEach(function(button) {
            button.addEventListener('click', function() {
                document.querySelectorAll('#apIntensityOptions .ap-option-card').forEach(function(item) { item.classList.remove('selected'); });
                button.classList.add('selected');
            });
        });
        document.getElementById('apContentBox')?.addEventListener('click', function(event) {
            if (!isV1Active()) return;
            var target = event.target?.closest?.('.ap-detect-header, .ap-detect-toggle, .ap-lock-header, .ap-lock-toggle');
            if (!target || !this.contains(target)) return;
            event.preventDefault();
            if (target.closest('.ap-detect-header, .ap-detect-toggle')) {
                outlineGen().apReportExpanded = outlineGen().apReportExpanded === false;
            } else {
                outlineGen().apLockExpanded = outlineGen().apLockExpanded === false;
            }
            renderAIPolishV1Panel();
        });
        document.getElementById('apContentBox')?.addEventListener('input', function() {
            if (!isV1Active() || outlineGen().apMode !== 'polish_done') return;
            var finalElement = this.querySelector('.ap-final-text');
            if (!finalElement) return;
            var finalText = String(finalElement.innerText || '').trim();
            outlineGen().apFinalText = finalText;
            outlineGen().apContent = finalText;
            setAPApplyEnabled(!!finalText);
        });
    }

    Object.assign(window, {
        setAPStatus: setAPStatus,
        clearAPStatusTimers: clearAPStatusTimers,
        setAPApplyEnabled: setAPApplyEnabled,
        setAIPolishV1ButtonsWorking: setAIPolishV1ButtonsWorking,
        setAPLockButton: setAPLockButton,
        renderAPDetectPanel: renderAPDetectPanel,
        renderAIPolishDiffHtml: renderAIPolishDiffHtml,
        renderAIPolishV1Panel: renderAIPolishV1Panel,
        getAIPolishFocusGroups: getAIPolishFocusGroups,
        getAIPolishFocusOption: getAIPolishFocusOption,
        setAIPolishTemplateButtonText: setAIPolishTemplateButtonText,
        getAIPolishTemplateConfig: getAIPolishTemplateConfig,
        openAIPolishConfig: openAIPolishConfig,
        buildAPLockPrompts: buildAPLockPrompts,
        buildAIPolishPrompts: buildAIPolishPrompts,
        cleanAIPolishFinalText: cleanAIPolishFinalText,
        runAIPolishLLM: runAIPolishLLM,
        triggerAPPlotLock: triggerAPPlotLock,
        startAIPolishWithConfig: startAIPolishWithConfig,
        applyAIPolishV1Result: applyAIPolishV1Result,
        cancelAIPolishV1: cancelAIPolishV1,
        invalidateAIPolishV1State: invalidateAIPolishV1State,
        clearAIPolishV1Result: clearAIPolishV1Result,
        getCurrentAIPolishChapterKey: getCurrentAIPolishChapterKey,
        isCurrentAIPolishSource: isCurrentAIPolishSource,
        ZHIYU_AI_POLISH_V1_READY: true
    });
    window.renderAPSidePanel = renderAIPolishV1Panel;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindAIPolishV1Ui, { once: true });
    } else {
        bindAIPolishV1Ui();
    }
})(window, document);
