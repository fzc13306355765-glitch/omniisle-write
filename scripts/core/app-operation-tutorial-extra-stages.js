(function(window, document) {
    'use strict';

    const mainlinePack = window.ZHIYU_OPERATION_TUTORIAL_MAINLINE_PACK;
    if (!mainlinePack) throw new Error('操作引导教程主线阶段包未加载');
    const { DEMO_SYNOPSIS_REQUIREMENT, DEMO_SYNOPSIS, DEMO_FINE_REQUIREMENT, DEMO_FINE_SOURCE, DEMO_FINE_OUTLINE, DEMO_CHAPTER_REQUIREMENT, DEMO_CHAPTER, DEMO_NATURALIZED_CHAPTER, DEMO_LOCAL_SELECTION, DEMO_LOCAL_POLISH_INSTRUCTION, DEMO_LOCAL_POLISHED, DEMO_REWRITE_REQUIREMENT, DEMO_REWRITTEN_CHAPTER, DEMO_ADVANCED_OUTLINE, DEMO_STAGE_OUTLINE, DEMO_FUNCTIONAL_DIRECTION, DEMO_FUNCTIONAL_CONTENT, DEMO_DECOMPOSE_CONTENT, DEMO_FULL_ANALYSIS_SOURCE_NAME, DEMO_FULL_ANALYSIS_RESULT_NAME, DEMO_FULL_ANALYSIS_MODEL_ROUTE, DEMO_FULL_ANALYSIS_CHAPTERS, DEMO_OUTLINE, DEMO_FULL_ANALYSIS_FILES } = mainlinePack.content;

    function createRuntime(api) {
        const { runtime, DEMO_BOOK_NAME, DEMO_BOOK_INPUT_NAME, DEMO_MODEL_NAME, DEMO_TEMPLATE_NAME, DEMO_MEMORY_FOLDER_NAME, getAppState, getModal, openModal, closeModal, isVisible, findTextButton, resolveTarget, createButton, getStageMeta, getNextMainlineStageId, createTutorialMenu, openTutorialMenu, closeTutorialMenu, createLayer, snapshotTutorialState, snapshotTutorialElements, restoreTutorialElements, snapshotButton, restoreButton, prepareDemoState, prepareNewBookState, selectTutorialActionTab, prepareFineOutlineState, toTutorialEditorHtml, createDemoBookPreview, prepareChapterState, prepareContentStageState, prepareOutlineExtensionState, prepareDecomposeStageState, prepareFullAnalysisStageState, prepareDecomposeSettingsState, hideTutorialBookPreview, prepareStage, setInputValue, showTutorialCoverDownloadButton, restoreTutorialCoverDownloadButton, generateTutorialCover, startDemoSynopsisStream, completeDemoBookCreation, createDemoMemoryBooks, showTutorialMemoryPreview, showTutorialAdvancedMemoryPreview, showTutorialDecomposeMemoryPreview, showTutorialFullAnalysisMemoryPreview, hideTutorialMemoryPreview, showTutorialPage, ensureTutorialPageVisible, restoreTutorialState, openOutlineForTutorial, selectTutorialNormalMode, selectTutorialAdvancedMode, selectTutorialFunctionMode, selectTutorialFunctionType, selectTutorialDirectMode, toggleTutorialGenre, getTutorialTemplate, findTutorialTemplateCard, openTutorialTemplateSelector, applyTutorialTemplate, findOutlineFileCard, openTutorialAdvancedSourceFiles, resetTutorialStageSelection, openTutorialAdvancedLinks, openTutorialFunctionalLinks, showAdvancedTutorialRecoveryButtons, openTutorialModelModal, selectTutorialModel, applyTutorialModel, startDemoStream, startDemoFineOutlineStream, saveDemoFineOutline, openTutorialChapterMemorySelector, openTutorialDecomposeSettingsChapterLinks, openTutorialReferenceSelector, enableTutorialChapterGenerate, startDemoChapterStream, confirmDemoChapter, saveDemoChapter, normalizeTutorialText, streamTutorialText, startDemoAdvancedOutlineStream, saveDemoAdvancedOutline, startDemoStageOutlineStream, saveDemoStageOutline, startDemoFunctionalStream, saveDemoFunctionalContent, prepareDecomposeWorksChoice, startDemoDecomposeStream, saveDemoDecompose, returnToDemoDecomposePanel, openDecomposeInfoModal, closeDecomposeInfoModal, showDemoDecomposeStopButton, getTutorialFullAnalysisChapters, setTutorialFullAnalysisButton, appendTutorialFullAnalysisLog, renderDemoFullAnalysisCompletePanel, startDemoFullAnalysis, saveDemoFullAnalysis, returnToDemoFullAnalysisPanel, showDemoFullAnalysisSupplementControls, showTutorialDecomposeSettingsMemoryPreview, findMemoryFileCard, openTutorialDecomposeSettingsEditor, returnToTutorialFineOutlineForSettings, closeTutorialDecomposeSettingsEditorForReturn, openTutorialDecomposeSettingsLinks, ensureTutorialDecomposeSettingsLinkedStack, openTutorialDecomposeSettingsRoleList, closeTutorialDecomposeSettingsRoleList, prepareDemoNaturalizePanel, configureDemoNaturalizePanel, selectTutorialNaturalizeLevel, startDemoNaturalizeStream, openDemoNaturalizeConfirm, applyDemoNaturalizedChapter, openTutorialPolishModal, startDemoLocalPolish, confirmDemoLocalPolish, openTutorialRewriteModal, openTutorialRewriteMemorySelector, startDemoLocalRewrite, confirmDemoLocalRewrite, showTutorialHistoryButton, restoreTutorialHistoryButton, saveDemoOutline, updateLayerPosition, positionNote, positionLoop, waitForTarget, advanceStep, skipStep, handleDocumentClick, handleDocumentInput, handleDocumentChange, handleDocumentSelection, showWrongTargetFeedback, showRecoverableTargetError, skipCurrentStage, finishStage, returnToTutorialMenu, stopTutorial, startStage, startTutorial, createEntryButton, installTutorialEntries, findMemoryLinkCard, createMemoryLinkSelectionStep } = api;

        function prepareTutorialNaturalizeStart() {
            const start = document.getElementById('btnNaturalize');
            if (!start) return;
            start.disabled = false;
            start.textContent = 'AI消痕 中级';
        }

        function prepareTutorialNaturalizeApply() {
            const apply = document.getElementById('btnAPSave');
            if (!apply) return;
            apply.disabled = false;
            apply.textContent = '应用到正文';
        }

        function loadTutorialDecomposeLocalFile() {
            const content = [
                '第一卷 雾城初醒',
                '第0章：哥哥失踪',
                '三年前，周衡在临海北站留下最后一条语音：不要让第七座钟楼敲响。',
                '第1章：地图亮起',
                DEMO_CHAPTER
            ].join('\n\n');
            const file = new File([content], '雾城夜巡-本地完结稿.txt', { type: 'text/plain;charset=utf-8' });
            window.handleDecompFile?.({ target: { files: [file] } });
        }

        function createTutorialFullAnalysisChapters() {
            return DEMO_FULL_ANALYSIS_CHAPTERS.map(function(chapter, index) {
                const content = String(chapter.content || '');
                return {
                    title: chapter.title,
                    content,
                    wordCount: content.replace(/\s+/g, '').length,
                    preview: content.slice(0, 90).replace(/\s+/g, ' '),
                    selected: false,
                    volume: chapter.volume,
                    _importVolumeIndex: 0,
                    _importOriginalIndex: index
                };
            });
        }

        function prepareTutorialFullAnalysisImport() {
            closeModal('importBookModal');
            window.ZHIYU_IMPORT_PREVIEW_CONTEXT = { active: true, chapters: createTutorialFullAnalysisChapters() };
            const chapters = getTutorialFullAnalysisChapters();
            const title = document.getElementById('importParseTitle');
            if (title) title.textContent = DEMO_FULL_ANALYSIS_SOURCE_NAME + '.txt';
            const info = document.getElementById('importParseInfo');
            if (info) {
                const totalWords = chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0);
                info.textContent = '总字数：' + totalWords.toLocaleString() + ' | 总章节：' + chapters.length;
            }
            const name = document.getElementById('importBookName');
            if (name) name.value = DEMO_FULL_ANALYSIS_SOURCE_NAME;
            const selectAll = document.getElementById('btnImportSelectAll');
            if (selectAll) selectAll.textContent = '全选章节';
            window.renderImportChapterList?.();
            window.updateImportAnalysisEstimate?.();
            openModal('importParseModal');
        }

        function sortTutorialFullAnalysisChapters() {
            const chapters = getTutorialFullAnalysisChapters();
            chapters.sort(function(a, b) {
                const numberOf = function(title) {
                    if (/序章/.test(String(title || ''))) return 0;
                    const match = String(title || '').match(/第\s*(\d+)\s*章/);
                    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
                };
                const chapterDiff = numberOf(a.title) - numberOf(b.title);
                return chapterDiff || Number(a._importOriginalIndex || 0) - Number(b._importOriginalIndex || 0);
            });
            window.renderImportChapterList?.();
            window.ZHIYU_TOAST?.success?.('教程章节已按阅读顺序排列');
        }

        function getTutorialFullAnalysisModels() {
            const allowedRoutes = new Set([
                'minimax/MiniMax-M2.7', 'minimax/MiniMax-M3', 'agnes/agnes-2.5-flash',
                'opencode-go-deepseek-v4-flash/deepseek-v4-flash', 'opencode-go-mimo-v25/mimo-v2.5',
                'opencode-go-mimo-v25-pro/mimo-v2.5-pro', 'opencode-go-kimi-k27/kimi-k2.7-code',
                'opencode-go-qwen37-plus/qwen3.7-plus', 'opencode-go-hy3/hy3',
                'opencode-go-glm52/glm-5.2', 'opencode-go-glm51/glm-5.1'
            ]);
            const configured = Array.isArray(window.ZHIYU_MODEL_CONFIG?.BUILTIN_MODELS) ? window.ZHIYU_MODEL_CONFIG.BUILTIN_MODELS : [];
            const models = configured.map(function(model) {
                const provider = String(model.freeProvider || '');
                const modelName = String(model.freeModel || model.name || '');
                return {
                    name: String(model.name || model.freeModel || ''), provider, model: modelName,
                    route: provider + '/' + modelName
                };
            }).filter(model => model.name && allowedRoutes.has(model.route));
            if (!models.some(model => model.route === DEMO_FULL_ANALYSIS_MODEL_ROUTE)) {
                const separator = DEMO_FULL_ANALYSIS_MODEL_ROUTE.indexOf('/');
                models.unshift({
                    name: DEMO_MODEL_NAME,
                    provider: DEMO_FULL_ANALYSIS_MODEL_ROUTE.slice(0, separator),
                    model: DEMO_FULL_ANALYSIS_MODEL_ROUTE.slice(separator + 1),
                    route: DEMO_FULL_ANALYSIS_MODEL_ROUTE
                });
            }
            return models;
        }

        function renderTutorialFullAnalysisModelLogo(container, model) {
            if (!container) return;
            container.innerHTML = '';
            const fallback = document.createElement('span');
            fallback.className = 'full-analysis-model-logo-fallback';
            fallback.textContent = String(model?.name || model?.provider || '?').trim().slice(0, 1).toUpperCase() || '?';
            const logo = window.getModelProviderIcon?.({
                name: model?.name,
                provider: model?.provider,
                freeProvider: model?.provider,
                freeModel: model?.model
            }) || {};
            if (!logo.src) {
                container.appendChild(fallback);
                return;
            }
            const image = document.createElement('img');
            image.className = 'full-analysis-model-logo-image';
            image.src = logo.src;
            image.alt = '';
            image.setAttribute('aria-hidden', 'true');
            image.addEventListener('error', function() {
                if (logo.fallbackSrc && image.src.indexOf(logo.fallbackSrc.replace(/^\.\//, '')) < 0) {
                    image.src = logo.fallbackSrc;
                    return;
                }
                image.replaceWith(fallback);
            });
            container.appendChild(image);
        }

        function prepareTutorialFullAnalysisModelControl() {
            const models = getTutorialFullAnalysisModels();
            const select = document.getElementById('fullAnalysisNormalModel');
            if (select) {
                select.innerHTML = '<option value="">请选择模型</option>';
                models.forEach(model => {
                    const option = document.createElement('option');
                    option.value = model.route;
                    option.textContent = model.name;
                    select.appendChild(option);
                });
                select.value = '';
                select.disabled = false;
            }
            const menu = document.getElementById('fullAnalysisNormalModelMenu');
            if (menu) {
                menu.replaceChildren(...models.map(model => {
                    const option = document.createElement('button');
                    option.type = 'button';
                    option.className = 'full-analysis-model-option';
                    option.setAttribute('role', 'option');
                    option.setAttribute('aria-label', model.name);
                    option.setAttribute('aria-selected', 'false');
                    option.dataset.fullAnalysisModelRoute = model.route;
                    const icon = document.createElement('span');
                    icon.className = 'full-analysis-model-logo';
                    renderTutorialFullAnalysisModelLogo(icon, model);
                    const label = document.createElement('span');
                    label.className = 'full-analysis-model-option-label';
                    label.textContent = model.name;
                    option.append(icon, label);
                    return option;
                }));
                menu.hidden = true;
            }
            const label = document.getElementById('fullAnalysisNormalModelLabel');
            if (label) label.textContent = '选择模型';
            const triggerIcon = document.getElementById('fullAnalysisNormalModelIcon');
            if (triggerIcon) triggerIcon.innerHTML = '';
            const trigger = document.getElementById('btnFullAnalysisNormalModel');
            if (trigger) {
                trigger.disabled = false;
                trigger.setAttribute('aria-expanded', 'false');
                trigger.setAttribute('aria-label', '普通模型：选择模型');
            }
            runtime.modelSelected = false;
        }

        function openTutorialFullAnalysisPanel() {
            closeModal('importParseModal');
            prepareTutorialFullAnalysisModelControl();
            const mode = document.getElementById('fullAnalysisModeSelect');
            if (mode) {
                mode.value = 'staged';
                mode.disabled = false;
            }
            const modeDescription = document.getElementById('fullAnalysisModeDescription');
            if (modeDescription) modeDescription.textContent = '分阶段确认会在章节事实和分卷汇总后暂停，确认后再进入下一阶段。';
            const scope = document.getElementById('fullAnalysisScopeSelect');
            if (scope) {
                scope.value = 'chapter';
                scope.disabled = false;
            }
            const chapterRange = document.getElementById('fullAnalysisChapterRange');
            if (chapterRange) chapterRange.hidden = false;
            const volumeRange = document.getElementById('fullAnalysisVolumeRange');
            if (volumeRange) volumeRange.hidden = true;
            const scopeSummary = document.getElementById('fullAnalysisScopeSummary');
            if (scopeSummary) scopeSummary.textContent = '当前按章节范围分析；请选择“全部章节”体验完整流程。';
            const progress = document.getElementById('fullAnalysisProgressText');
            if (progress) progress.textContent = '准备分析 ' + getTutorialFullAnalysisChapters().length + ' 章正文';
            const usage = document.getElementById('fullAnalysisUsage');
            if (usage) usage.textContent = '教程内置作品 · 不上传正文';
            const bar = document.getElementById('fullAnalysisProgressBar');
            if (bar) bar.style.width = '0%';
            const log = document.getElementById('fullAnalysisLog');
            if (log) log.innerHTML = '<div>已读取教程内置章节，等待开始。</div>';
            const review = document.getElementById('fullAnalysisReviewSection');
            if (review) review.style.display = 'none';
            const save = document.getElementById('fullAnalysisSaveSection');
            if (save) save.style.display = 'none';
            const danger = document.getElementById('fullAnalysisDangerZone');
            if (danger) danger.classList.remove('is-visible');
            setTutorialFullAnalysisButton('btnFullAnalysisBack', 'inline-flex', false);
            setTutorialFullAnalysisButton('btnFullAnalysisStart', 'inline-flex', false);
            ['btnFullAnalysisSkipSegment', 'btnFullAnalysisCancel', 'btnFullAnalysisStopNow', 'btnFullAnalysisContinue', 'btnFullAnalysisRestart', 'btnFullAnalysisDoneClose', 'btnFullAnalysisSave'].forEach(id => setTutorialFullAnalysisButton(id, 'none', false));
            setTutorialFullAnalysisButton('btnFullAnalysisMinimize', 'inline-flex', false);
            const taskbar = document.getElementById('fullAnalysisTaskbar');
            if (taskbar) taskbar.style.display = 'none';
            openModal('fullTextAnalysisModal');
        }

        function openTutorialFullAnalysisModelMenu() {
            const menu = document.getElementById('fullAnalysisNormalModelMenu');
            const trigger = document.getElementById('btnFullAnalysisNormalModel');
            if (menu) menu.hidden = false;
            if (trigger) trigger.setAttribute('aria-expanded', 'true');
        }

        function selectTutorialFullAnalysisModel(target) {
            if (!target) return;
            const route = String(target.dataset.fullAnalysisModelRoute || '');
            const select = document.getElementById('fullAnalysisNormalModel');
            if (select) select.value = route;
            document.querySelectorAll('#fullAnalysisNormalModelMenu [data-full-analysis-model-route]').forEach(option => {
                const selected = option === target;
                option.classList.toggle('is-selected', selected);
                option.setAttribute('aria-selected', selected ? 'true' : 'false');
            });
            const labelText = target.querySelector('.full-analysis-model-option-label')?.textContent || DEMO_MODEL_NAME;
            const selectedModel = getTutorialFullAnalysisModels().find(model => model.route === route);
            const label = document.getElementById('fullAnalysisNormalModelLabel');
            if (label) label.textContent = labelText;
            renderTutorialFullAnalysisModelLogo(document.getElementById('fullAnalysisNormalModelIcon'), selectedModel);
            const trigger = document.getElementById('btnFullAnalysisNormalModel');
            if (trigger) {
                trigger.setAttribute('aria-label', '普通模型：' + labelText);
                trigger.setAttribute('aria-expanded', 'false');
            }
            const menu = document.getElementById('fullAnalysisNormalModelMenu');
            if (menu) menu.hidden = true;
            runtime.modelSelected = true;
        }

        function applyTutorialFullAnalysisMode(target) {
            if (target) target.value = 'automatic';
            const description = document.getElementById('fullAnalysisModeDescription');
            if (description) description.textContent = '自动分析会连续完成章节分析和八文件汇总；需要时仍可暂停或立即停止。';
        }

        function applyTutorialFullAnalysisScope(target) {
            if (target) target.value = 'all';
            const chapterRange = document.getElementById('fullAnalysisChapterRange');
            const volumeRange = document.getElementById('fullAnalysisVolumeRange');
            if (chapterRange) chapterRange.hidden = true;
            if (volumeRange) volumeRange.hidden = true;
            const summary = document.getElementById('fullAnalysisScopeSummary');
            if (summary) summary.textContent = '将分析全部 ' + getTutorialFullAnalysisChapters().length + ' 个章节。';
        }

        function buildAiPolishSteps() {
            return [
                {
                    id: 'ai-polish-select-chapter', type: 'click', target: '#treeContent .chapter-item[data-vi="0"][data-ci="1"]',
                    title: '选择要优化的章节', body: '请在真实章节目录中点击“第1章：地图亮起”。'
                },
                {
                    id: 'ai-polish-open-tab', type: 'click', target: '.action-tab-btn[data-tab="aiPolish"]',
                    title: '打开“优化”页签', body: '请点击右侧真实“优化”页签。教程会保留原页面布局。',
                    intercept: function() {
                        selectTutorialActionTab('aiPolish');
                        configureDemoNaturalizePanel();
                    }
                },
                {
                    id: 'ai-polish-open-level', type: 'click', target: '#btnNaturalizeLevel',
                    title: '打开消痕等级', body: '请点击 AI消痕 右侧箭头，查看三个真实等级。'
                },
                {
                    id: 'ai-polish-select-level', type: 'click',
                    target: function() { return findTextButton('#naturalizeLevelMenu', '中级'); },
                    title: '选择“中级”', body: '请选择“中级”。教程只切换真实界面状态，不连接消痕服务。',
                    intercept: selectTutorialNaturalizeLevel
                },
                {
                    id: 'ai-polish-start', type: 'click', target: '#btnNaturalize',
                    title: '开始 AI消痕', body: '请点击真实“AI消痕 中级”。结果使用预置内容，不调用任何 AI。',
                    prepare: prepareTutorialNaturalizeStart,
                    intercept: startDemoNaturalizeStream
                },
                {
                    id: 'ai-polish-stream', type: 'wait', target: '#apContentBox',
                    title: '查看优化结果', body: '预置优化结果正在真实结果框中流式显示。',
                    run: function() { return runtime.streamPromise; }
                },
                {
                    id: 'ai-polish-apply', type: 'click', target: '#btnAPSave',
                    title: '应用到正文', body: '请点击真实“应用到正文”。这是覆盖正文前必须确认的操作。',
                    prepare: prepareTutorialNaturalizeApply,
                    intercept: openDemoNaturalizeConfirm
                },
                {
                    id: 'ai-polish-confirm', type: 'click', target: '#_cfmOk',
                    title: '确认覆盖正文', body: '请在真实确认框中点击“确认”。教程只替换演示正文，不写入作品。'
                },
                {
                    id: 'ai-polish-levels-info', type: 'info', target: '#naturalizeSplitAction',
                    title: '三个消痕等级', body: '低级尽量少改，中级平衡自然度与原意，高级改写幅度更大。正式使用时按正文情况选择。'
                },
                {
                    id: 'ai-polish-status-info', type: 'info', target: '#naturalizeReplaceStatus',
                    title: '替换状态', body: '“未替换”表示结果仍在预览；“已替换”表示已经应用到正文。'
                },
                {
                    id: 'ai-polish-edit-info', type: 'info', target: '#apContentBox',
                    title: '结果可以先修改', body: '应用前可以直接编辑优化结果，再决定是否覆盖正文。'
                },
                {
                    id: 'ai-polish-stop-info', type: 'info', target: '#apStopBtn',
                    title: '停止 AI消痕', body: '正式任务生成时，可以用这里停止当前消痕任务。',
                    prepare: function() {
                        const button = document.getElementById('apStopBtn');
                        if (button) { button.style.display = 'block'; button.disabled = true; }
                    },
                    after: function() {
                        const button = document.getElementById('apStopBtn');
                        if (button) { button.style.removeProperty('display'); button.disabled = false; }
                    }
                },
                {
                    id: 'ai-polish-clear-info', type: 'info', target: '.action-tab-btn[data-tab="aiPolish"] .action-tab-clear',
                    title: '清除优化内容', body: '这里仅清除优化工作区，不会删除章节正文。'
                },
                {
                    id: 'ai-polish-server-info', type: 'info', target: '#naturalizeServerStatus',
                    title: '消痕服务状态', body: '正式使用时这里显示服务连接状态；教程固定显示“教程演示已就绪”，不会连接真实服务。'
                }
            ];
        }

        function buildLocalPolishSteps() {
            return [
                {
                    id: 'local-polish-select-chapter', type: 'click', target: '#treeContent .chapter-item[data-vi="0"][data-ci="1"]',
                    title: '选择教程章节', body: '请点击“第1章：地图亮起”，在真实正文编辑器中打开演示正文。'
                },
                {
                    id: 'local-polish-open-model', type: 'click', target: '#btnModelSelect',
                    title: '打开正文模型', body: '局部润色沿用正文模型。请先点击真实模型入口。',
                    intercept: function() { openTutorialModelModal('chapter'); }
                },
                {
                    id: 'local-polish-select-model', type: 'click', target: '[data-tutorial-model="chapter"]',
                    title: '选择指定模型', body: '请选择“DeepSeek V4 Flash”。这里只切换显示，不调用模型。',
                    intercept: selectTutorialModel
                },
                {
                    id: 'local-polish-confirm-model', type: 'click', target: '#btnConfirmModelSelect',
                    title: '确认模型', body: '请点击真实“确定”。', intercept: applyTutorialModel
                },
                {
                    id: 'local-polish-selection', type: 'selection', target: '#resultBox',
                    title: '亲自框选指定段落',
                    body: '请拖动鼠标，完整选中以“手机上的时间跳到零点”开头、以“临海北站”结尾的这一段。',
                    validateSelection: function(text) { return normalizeTutorialText(text) === normalizeTutorialText(DEMO_LOCAL_SELECTION); }
                },
                {
                    id: 'local-polish-open', type: 'click', target: '#btnPolish',
                    title: '打开局部润色', body: '选区正确后，请点击真实“局部润色”。',
                    intercept: openTutorialPolishModal
                },
                {
                    id: 'local-polish-selection-info', type: 'info', target: '#polishSelectedText',
                    title: '核对已选文本', body: '这里会显示刚才亲自框选的文字和字数，只处理这段内容。'
                },
                {
                    id: 'local-polish-instruction', type: 'click', target: '#polishInstruction',
                    title: '认识润色要求', body: '教程已提前填好示例要求。请点击输入框，了解这里用于说明语气、氛围和不能改变的内容，不用再打字。',
                    prepare: function() { setInputValue('polishInstruction', DEMO_LOCAL_POLISH_INSTRUCTION); }
                },
                {
                    id: 'local-polish-start', type: 'click', target: '#btnStartPolish',
                    title: '开始优化', body: '请点击真实“开始优化”。教程播放预置结果，不调用 AI。',
                    intercept: startDemoLocalPolish
                },
                {
                    id: 'local-polish-stream', type: 'wait', target: '#resultBox',
                    title: '查看局部润色效果', body: '只有刚才框选的演示段落会变化。',
                    run: function() { return runtime.streamPromise; }
                },
                {
                    id: 'local-polish-confirm', type: 'click', target: '#btnConfirm',
                    title: '确定使用润色结果', body: '请点击真实“确定润色”。本次采用只保留在教程页面。',
                    intercept: confirmDemoLocalPolish
                },
                {
                    id: 'local-polish-retry-info', type: 'info', target: '#btnRegen',
                    title: '重新润色', body: '这里会保留同一选区，再生成另一版候选结果。'
                },
                {
                    id: 'local-polish-purpose-info', type: 'info', target: '#btnPolish',
                    title: '局部润色的用途', body: '局部润色主要改善表达和语气，不负责大幅改变剧情。需要补写或改剧情时，应使用局部改写。'
                }
            ];
        }

        function buildLocalRewriteSteps() {
            return [
                {
                    id: 'local-rewrite-select-chapter', type: 'click', target: '#treeContent .chapter-item[data-vi="0"][data-ci="1"]',
                    title: '选择教程章节', body: '请点击“第1章：地图亮起”，打开要改写的演示正文。'
                },
                {
                    id: 'local-rewrite-open-model', type: 'click', target: '#btnModelSelect',
                    title: '打开正文模型', body: '局部改写沿用正文模型。请点击真实模型入口。',
                    intercept: function() { openTutorialModelModal('chapter'); }
                },
                {
                    id: 'local-rewrite-select-model', type: 'click', target: '[data-tutorial-model="chapter"]',
                    title: '选择指定模型', body: '请选择“DeepSeek V4 Flash”。这里只切换显示，不调用模型。',
                    intercept: selectTutorialModel
                },
                {
                    id: 'local-rewrite-confirm-model', type: 'click', target: '#btnConfirmModelSelect',
                    title: '确认模型', body: '请点击真实“确定”。', intercept: applyTutorialModel
                },
                {
                    id: 'local-rewrite-open', type: 'click', target: '#btnRewrite',
                    title: '打开局部重写', body: '请点击真实“局部重写”。', intercept: openTutorialRewriteModal
                },
                {
                    id: 'local-rewrite-direction', type: 'click', target: '#rwDirectionGroup [data-direction="mid"]',
                    title: '选择“中段补写”', body: '请选择“中段补写”，在正文中部补充核对路线的过程。'
                },
                {
                    id: 'local-rewrite-open-links', type: 'click',
                    target: function() { return Array.from(document.querySelectorAll('#rewriteModal .gen-option')).find(element => element.textContent.includes('关联文件')); },
                    title: '打开关联文件', body: '请点击真实“关联文件”，为改写补充细纲和设定约束。',
                    intercept: openTutorialRewriteMemorySelector
                },
                {
                    id: 'local-rewrite-open-fine-folder', type: 'click',
                    target: '#memoryLinkFolders .link-folder-item[data-folder="细纲文件"]',
                    title: '打开细纲文件夹', body: '请先点击左侧真实“细纲文件”，找到当前章节的细纲。'
                },
                createMemoryLinkSelectionStep({
                    id: 'local-rewrite-select-fine',
                    title: '选择本章细纲',
                    body: '请亲自勾选高亮的“第1章细纲”，让改写内容仍符合本章目标。',
                    files: ['第1章细纲.md']
                }),
                {
                    id: 'local-rewrite-open-associated-folder', type: 'click',
                    target: '#memoryLinkFolders .link-folder-item[data-folder="__memory_link_associated__"]',
                    title: '打开关联文件', body: '请再点击左侧真实“关联文件”，查看默认记忆资料。'
                },
                createMemoryLinkSelectionStep({
                    id: 'local-rewrite-select-associated-links',
                    title: '逐个选择局部改写资料',
                    body: '请亲自勾选八份高亮的正文默认关联资料，避免改写后人物、设定、关键事件和前后状态走样。',
                    files: ['设定集.md', '信息表.md', '角色列表.md', '边界卡.md', '追踪表.md', '承接卡.md', '关键事件表.md', '资料索引.md']
                }),
                {
                    id: 'local-rewrite-selected-files-info', type: 'info',
                    target: '#memoryLinkTree .memory-link-section:first-child',
                    title: '核对已选文件', body: '顶部标签汇总了本次选择。请在正式改写前核对本章细纲和八份正文默认资料是否齐全。'
                },
                {
                    id: 'local-rewrite-confirm-links', type: 'click', target: '#btnConfirmMemoryLink',
                    title: '确认关联文件', body: '请点击真实“确定选择”。'
                },
                {
                    id: 'local-rewrite-description', type: 'click', target: '#rwPlotDescription',
                    title: '认识改写要求', body: '教程已填好示例要求。请点击真实输入框认识位置；这里用于说明要补写、删改或强化的具体方向，不要求教程用户输入。',
                    prepare: function() { setInputValue('rwPlotDescription', DEMO_REWRITE_REQUIREMENT); }
                },
                {
                    id: 'local-rewrite-words', type: 'click', target: '#rwTargetWords',
                    title: '认识目标字数', body: '教程已填好“1200”。请点击真实字数框认识位置；它用于约束改写后的目标篇幅，但正式结果不会机械等于指定字数。',
                    prepare: function() { setInputValue('rwTargetWords', '1200'); }
                },
                {
                    id: 'local-rewrite-start', type: 'click', target: '#btnRWStart',
                    title: '开始重写', body: '请点击真实“开始重写”。教程播放预置正文，不调用 AI。',
                    intercept: startDemoLocalRewrite
                },
                {
                    id: 'local-rewrite-stream', type: 'wait', target: '#resultBox',
                    title: '查看改写结果', body: '预置改写结果正在真实正文编辑器中流式显示。',
                    run: function() { return runtime.streamPromise; }
                },
                {
                    id: 'local-rewrite-confirm', type: 'click', target: '#btnConfirm',
                    title: '确定使用改写结果', body: '请点击真实“确定使用”。教程不会保存章节。',
                    intercept: confirmDemoLocalRewrite
                },
                {
                    id: 'local-rewrite-directions-info', type: 'info', target: '#btnRewrite',
                    title: '三种改写方向', body: '前段补写用于补开场，中段补写用于扩展过程，后段续写用于从结尾继续推进。'
                },
                {
                    id: 'local-rewrite-purpose-info', type: 'info', target: '#btnRewrite',
                    title: '局部改写与润色', body: '局部改写会补充或改变剧情；局部润色主要改善原有表达。'
                }
            ];
        }

        function buildAdvancedOutlineSteps() {
            return [
                {
                    id: 'advanced-open-outline', type: 'click', target: '#btnOutline',
                    title: '打开大纲功能', body: '请点击真实“生成大纲/功能”。',
                    skip: openOutlineForTutorial
                },
                {
                    id: 'advanced-select-mode', type: 'click', target: '#outlineSubModeTabs [data-submode="advanced"]',
                    title: '选择高级大纲', body: '请点击真实“高级大纲”。',
                    intercept: function(target) { selectTutorialAdvancedMode(target); }
                },
                {
                    id: 'advanced-expand-master', type: 'click', target: '#outlineAdvancedMasterToggle',
                    title: '展开大纲生成', body: '请点击“一. 大纲生成”右侧箭头，展开完整配置。'
                },
                {
                    id: 'advanced-open-genres', type: 'click', target: '#outlineGenreToggleBtn',
                    title: '打开题材选择', body: '请点击“添加题材”。'
                },
                {
                    id: 'advanced-genre-power', type: 'click', target: function() { return findTextButton('#genreTagsMale', '都市高武'); },
                    title: '选择“都市高武”', body: '请选择指定题材“都市高武”。',
                    intercept: function(target) { toggleTutorialGenre(target, 'advanced'); }
                },
                {
                    id: 'advanced-genre-idea', type: 'click', target: function() { return findTextButton('#genreTagsMale', '都市脑洞'); },
                    title: '选择“都市脑洞”', body: '请再选择“都市脑洞”。',
                    intercept: function(target) { toggleTutorialGenre(target, 'advanced'); }
                },
                {
                    id: 'advanced-confirm-genres', type: 'click', target: '#btnConfirmOutlineGenrePopup',
                    title: '确认题材', body: '请点击真实“确认”。'
                },
                {
                    id: 'advanced-word-count', type: 'click', target: '#outlineModal .wordcount-option[data-wc="long"]',
                    title: '选择全篇字数', body: '请选择“长篇（100万字）”。高级大纲会据此规划更多阶段。'
                },
                {
                    id: 'advanced-open-tags', type: 'click', target: '#outlineAdvancedSummarySection .genre-preference-add-btn',
                    title: '打开剧情标签', body: '请点击剧情梗概区域的“添加标签 +”。'
                },
                {
                    id: 'advanced-tag-system', type: 'click', target: function() { return findTextButton('#genrePreferenceTagModal', '系统'); },
                    title: '选择“系统”', body: '请选择固定标签“系统”。'
                },
                {
                    id: 'advanced-tag-rise', type: 'click', target: function() { return findTextButton('#genrePreferenceTagModal', '逆袭'); },
                    title: '选择“逆袭”', body: '请再选择“逆袭”。'
                },
                {
                    id: 'advanced-confirm-tags', type: 'click', target: '#btnConfirmGenrePreferenceTags',
                    title: '确认剧情标签', body: '请点击真实“确定”。'
                },
                {
                    id: 'advanced-open-model', type: 'click', target: '#btnOutlineModelSelect',
                    title: '打开大纲模型', body: '请点击真实“大纲模型”。',
                    intercept: function() { openTutorialModelModal(); }
                },
                {
                    id: 'advanced-select-model', type: 'click', target: '[data-tutorial-model="outline"]',
                    title: '选择指定模型', body: '请选择“DeepSeek V4 Flash”。这里只切换显示。',
                    intercept: selectTutorialModel
                },
                {
                    id: 'advanced-confirm-model', type: 'click', target: '#btnConfirmModelSelect',
                    title: '确认模型', body: '请点击真实“确定”。', intercept: applyTutorialModel
                },
                {
                    id: 'advanced-generate', type: 'click', target: '#btnStartOutline',
                    title: '生成高级母大纲', body: '请点击真实“生成大纲”。教程播放预置母大纲，不调用 AI。',
                    intercept: startDemoAdvancedOutlineStream
                },
                {
                    id: 'advanced-stream', type: 'wait', target: '#outlineResultBox',
                    title: '查看分段结果', body: '高级母大纲正在真实结果区按流式效果展示。',
                    run: function() { return runtime.streamPromise; }
                },
                {
                    id: 'advanced-open-memory', type: 'click', target: '#sideNav .nav-item[data-page="memory"]',
                    title: '打开记忆页', body: '请点击左侧真实“记忆”导航，查看高级大纲整理出的关联资料。',
                    prepare: function() { closeModal('outlineModal'); },
                    intercept: function() { showTutorialMemoryPreview({ includeAdvanced: true, overviewOnly: true }); }
                },
                {
                    id: 'advanced-select-memory-book', type: 'click',
                    target: function() { return document.querySelector('#memBookGrid .memory-book-card[data-book="' + CSS.escape(DEMO_BOOK_NAME) + '"]'); },
                    title: '选择教程作品', body: '请点击记忆页中的“雾城夜巡”，进入这部作品的真实关联文件区域。'
                },
                {
                    id: 'advanced-memory-info', type: 'info',
                    target: function() { return document.querySelector('#memTree .memory-file-section[data-memory-section="foundation"]'); },
                    title: '认识高级大纲关联文件',
                    body: '这里是真实关联文件区域。剧情总览、设定集、信息表和角色列表会约束后续阶段粗纲与正文。教程不打开文件内容。',
                    after: function() { hideTutorialMemoryPreview(); openOutlineForTutorial(); selectTutorialAdvancedMode(document.querySelector('#outlineSubModeTabs [data-submode="advanced"]')); showAdvancedTutorialRecoveryButtons(); }
                },
                {
                    id: 'advanced-stage-info', type: 'info', target: '#outlineAdvancedGroupStages',
                    title: '二. 阶段生成', body: '母大纲保存后，可以在这里选择 S01、S02 等阶段，继续展开阶段粗纲。'
                },
                {
                    id: 'advanced-retry-info', type: 'info', target: '#btnRetryAdvancedSegment',
                    title: '重试当前段', body: '只重新处理出错或不满意的当前分段，不从头重做全部母大纲。'
                },
                {
                    id: 'advanced-complete-info', type: 'info', target: '#btnCompleteAdvancedSegment',
                    title: '补全当前段', body: '当当前分段被截断时，可以从中断处继续补齐。'
                },
                {
                    id: 'advanced-copy-info', type: 'info', target: '#btnOutlineCopy',
                    title: '复制内容', body: '复制只把当前内容放入剪贴板，不会保存或重建关联资料。'
                },
                {
                    id: 'advanced-fold-info', type: 'info', target: '#outlineAdvancedMasterToggle',
                    title: '折叠配置', body: '配置完成后可以收起大纲生成区域，为结果区留出更多空间。'
                }
            ];
        }

        function buildStageOutlineSteps() {
            return [
                {
                    id: 'stage-open-outline', type: 'click', target: '#btnOutline',
                    title: '打开大纲功能', body: '请点击真实“生成大纲/功能”。', skip: openOutlineForTutorial
                },
                {
                    id: 'stage-select-advanced', type: 'click', target: '#outlineSubModeTabs [data-submode="advanced"]',
                    title: '进入高级大纲', body: '请点击真实“高级大纲”。',
                    intercept: function(target) { selectTutorialAdvancedMode(target); }
                },
                {
                    id: 'stage-expand-group', type: 'click', target: '#outlineAdvancedStagesToggle',
                    title: '展开阶段生成', body: '请点击“二. 阶段生成”右侧箭头。'
                },
                {
                    id: 'stage-open-source', type: 'click', target: '#outlineAdvancedSourceOption',
                    title: '打开母大纲选择', body: '请点击真实“选择大纲”。'
                },
                {
                    id: 'stage-open-memory-source', type: 'click', target: '#ogPickerMemRow',
                    title: '从记忆库加载', body: '请点击真实“从记忆库加载大纲”。',
                    intercept: openTutorialAdvancedSourceFiles
                },
                {
                    id: 'stage-select-master-file', type: 'click', target: function() { return findOutlineFileCard('剧情总览.md'); },
                    title: '选择剧情总览', body: '请选择“剧情总览.md”，它是本次阶段粗纲的母大纲。'
                },
                {
                    id: 'stage-confirm-master-file', type: 'click', target: '#btnOGFileConfirm',
                    title: '确认母大纲文件', body: '请点击文件弹窗中的真实“确定”。'
                },
                {
                    id: 'stage-confirm-master', type: 'click', target: '#btnOGConfirm',
                    title: '确认使用母大纲', body: '请点击选择大纲弹窗中的真实“确定”，让页面识别阶段。',
                    after: resetTutorialStageSelection
                },
                {
                    id: 'stage-select-stage', type: 'change', target: '#outlineAdvancedStageSelect', expectedValue: 'S01',
                    title: '选择 S01 阶段', body: '请打开真实下拉框并选择“S01 地图亮起”。'
                },
                {
                    id: 'stage-open-links', type: 'click', target: '#outlineAdvancedLinkOption',
                    title: '打开关联文件', body: '请点击真实“选择关联文件”。',
                    intercept: openTutorialAdvancedLinks
                },
                createMemoryLinkSelectionStep({
                    id: 'stage-select-links',
                    title: '逐个选择阶段粗纲资料',
                    body: '请亲自勾选高亮的资料索引、关键事件表、信息表、角色列表和设定集。它们对应高级大纲的真实默认参考规则。',
                    files: ['资料索引.md', '关键事件表.md', '信息表.md', '角色列表.md', '设定集.md']
                }),
                {
                    id: 'stage-confirm-links', type: 'click', target: '#btnConfirmMemoryLink',
                    title: '确认关联文件', body: '请点击真实“确定选择”。'
                },
                {
                    id: 'stage-open-model', type: 'click', target: '#btnOutlineModelSelect',
                    title: '打开大纲模型', body: '请点击真实“大纲模型”。', intercept: openTutorialModelModal
                },
                {
                    id: 'stage-select-model', type: 'click', target: '[data-tutorial-model="outline"]',
                    title: '选择指定模型', body: '请选择“DeepSeek V4 Flash”。', intercept: selectTutorialModel
                },
                {
                    id: 'stage-confirm-model', type: 'click', target: '#btnConfirmModelSelect',
                    title: '确认模型', body: '请点击真实“确定”。', intercept: applyTutorialModel
                },
                {
                    id: 'stage-generate', type: 'click', target: '#btnStartAdvancedStageOutlineBottom',
                    title: '生成阶段粗纲', body: '请点击真实“生成阶段粗纲”。教程播放预置结果。',
                    intercept: startDemoStageOutlineStream
                },
                {
                    id: 'stage-stream', type: 'wait', target: '#outlineResultBox',
                    title: '查看阶段粗纲', body: 'S01 阶段粗纲正在真实结果区流式展示。',
                    run: function() { return runtime.streamPromise; }
                },
                {
                    id: 'stage-save', type: 'click', target: '#btnOutlineSave',
                    title: '保存阶段粗纲', body: '请点击真实保存按钮。教程不会写入记忆库。',
                    intercept: saveDemoStageOutline
                },
                {
                    id: 'stage-selection-info', type: 'info', target: '#outlineAdvancedStageSelect',
                    title: '阶段选择规则', body: '这里只能展开母大纲中已经存在的阶段，每次选择一个目标阶段。'
                },
                {
                    id: 'stage-links-info', type: 'info', target: '#outlineAdvancedLinkOption',
                    title: '关联文件的用途', body: '人物与世界观资料会约束阶段粗纲，避免扩写时改名、改设定或越过剧情边界。'
                },
                {
                    id: 'stage-copy-info', type: 'info', target: '#btnOutlineCopy',
                    title: '复制与恢复按钮', body: '复制不会保存；重试和补全只处理当前分段；折叠按钮用于整理配置区。'
                }
            ];
        }

        function buildFunctionalSteps() {
            return [
                {
                    id: 'functional-open-outline', type: 'click', target: '#btnOutline',
                    title: '打开大纲功能', body: '请点击真实“生成大纲/功能”。', skip: openOutlineForTutorial
                },
                {
                    id: 'functional-select-mode', type: 'click', target: '#outlineModeTabs [data-mode="function"]',
                    title: '进入功能性生成', body: '请点击真实“功能性生成”。',
                    intercept: function(target) { selectTutorialFunctionMode(target); }
                },
                {
                    id: 'functional-select-type', type: 'click', target: '#outlineFunctionTypeToggle [data-fn="imitate"]',
                    title: '选择“大纲设定”', body: '请选择本次固定功能“大纲设定”。',
                    intercept: function(target) { selectTutorialFunctionType(target); }
                },
                {
                    id: 'functional-open-genres', type: 'click', target: '#outlineFunctionGenreToggleBtn',
                    title: '打开题材选择', body: '请点击“添加题材”。'
                },
                {
                    id: 'functional-genre-power', type: 'click', target: function() { return findTextButton('#genreTagsMale', '都市高武'); },
                    title: '选择“都市高武”', body: '请选择指定题材“都市高武”。',
                    intercept: function(target) { toggleTutorialGenre(target, 'function'); }
                },
                {
                    id: 'functional-genre-idea', type: 'click', target: function() { return findTextButton('#genreTagsMale', '都市脑洞'); },
                    title: '选择“都市脑洞”', body: '请再选择“都市脑洞”。',
                    intercept: function(target) { toggleTutorialGenre(target, 'function'); }
                },
                {
                    id: 'functional-confirm-genres', type: 'click', target: '#btnConfirmOutlineGenrePopup',
                    title: '确认题材', body: '请点击真实“确认”。'
                },
                {
                    id: 'functional-open-template', type: 'click', target: '#outlineTemplateOption',
                    title: '打开功能模板', body: '请点击真实提示词模板入口。',
                    intercept: function() { openTutorialTemplateSelector('functionalOutline'); }
                },
                {
                    id: 'functional-select-template', type: 'click', target: function() { return findTutorialTemplateCard('functionalOutline'); },
                    title: '选择知屿内置模板', body: '请选择“知屿·长篇小说大纲”。这里练习真实的模板选择，生成效果仍使用教程预置内容。'
                },
                {
                    id: 'functional-apply-template', type: 'click', target: '#btnApplyTemplate',
                    title: '应用功能模板', body: '请点击真实“应用”，模板名称会回填到配置区。',
                    intercept: function() { applyTutorialTemplate('functionalOutline'); }
                },
                {
                    id: 'functional-open-links', type: 'click', target: '#outlineFunctionLinkOption',
                    title: '打开关联文件', body: '请点击真实“选择关联文件”。',
                    intercept: openTutorialFunctionalLinks
                },
                createMemoryLinkSelectionStep({
                    id: 'functional-select-links',
                    title: '逐个选择功能性生成资料',
                    body: '功能性生成允许按任务自由选资料。本教程指定“设定集”和“信息表”，请亲自勾选两个高亮文件。',
                    files: ['设定集.md', '信息表.md']
                }),
                {
                    id: 'functional-confirm-links', type: 'click', target: '#btnConfirmMemoryLink',
                    title: '确认关联文件', body: '请点击真实“确定选择”。'
                },
                {
                    id: 'functional-direction', type: 'click', target: '#outlineCoreSummary',
                    title: '认识功能方向', body: '教程已提前写好示例要求。请点击输入框，了解这里用于说明要提炼的设定、边界和输出方向，不用再打字。',
                    prepare: function() { setInputValue('outlineCoreSummary', DEMO_FUNCTIONAL_DIRECTION); }
                },
                {
                    id: 'functional-open-model', type: 'click', target: '#btnOutlineModelSelect',
                    title: '打开大纲模型', body: '请点击真实“大纲模型”。', intercept: openTutorialModelModal
                },
                {
                    id: 'functional-select-model', type: 'click', target: '[data-tutorial-model="outline"]',
                    title: '选择指定模型', body: '请选择“DeepSeek V4 Flash”。', intercept: selectTutorialModel
                },
                {
                    id: 'functional-confirm-model', type: 'click', target: '#btnConfirmModelSelect',
                    title: '确认模型', body: '请点击真实“确定”。', intercept: applyTutorialModel
                },
                {
                    id: 'functional-generate', type: 'click', target: '#btnStartOutline',
                    title: '生成功能内容', body: '请点击真实“生成内容”。教程播放预置设定。',
                    intercept: startDemoFunctionalStream
                },
                {
                    id: 'functional-stream', type: 'wait', target: '#outlineResultBox',
                    title: '查看大纲设定', body: '预置设定正在真实结果区流式展示。',
                    run: function() { return runtime.streamPromise; }
                },
                {
                    id: 'functional-save', type: 'click', target: '#btnOutlineSave',
                    title: '保存功能内容', body: '请点击真实保存按钮。教程只显示成功反馈。',
                    intercept: saveDemoFunctionalContent
                },
                {
                    id: 'functional-types-info', type: 'info', target: '#outlineFunctionTypeToggle',
                    title: '大纲设定与剧本', body: '大纲设定用于整理世界观、人物和写作边界；剧本用于生成分镜、场景和角色等剧本资料。'
                },
                {
                    id: 'functional-direction-info', type: 'info', target: '#outlineCoreSummary',
                    title: '功能方向描述', body: '这里用于明确拆解目标、写法要求或剧本要求，越具体越容易得到可用结果。'
                },
                {
                    id: 'functional-links-info', type: 'info', target: '#outlineFunctionLinkOption',
                    title: '功能也能参考作品资料', body: '功能性生成同样可以引用当前作品的设定、人物和信息资料。'
                },
                {
                    id: 'functional-actions-info', type: 'info', target: '#outlineActions',
                    title: '复制、停止和重新生成', body: '生成过程中主按钮会变成停止；完成后可以复制结果，再次点击生成可获取另一版。'
                }
            ];
        }

        function buildDecomposeSteps() {
            return [
                {
                    id: 'decompose-open-tab', type: 'click', target: '.action-tab-btn[data-tab="decompose"]',
                    title: '打开拆书', body: '请点击右侧真实“拆书”页签。',
                    intercept: function() { selectTutorialActionTab('decompose'); }
                },
                {
                    id: 'decompose-open-import', type: 'click', target: '#btnDCImportBook',
                    title: '导入参考章节', body: '请点击真实“导入书籍”，模拟从电脑导入自己已经完结的作品。'
                },
                {
                    id: 'decompose-local-file-tab', type: 'click', target: '#decompTabFile',
                    title: '选择本地文件', body: '请点击真实“导入本地文件”。教程不会读取您的磁盘。'
                },
                {
                    id: 'decompose-load-local-file', type: 'click', target: '#decompFileDropZone',
                    title: '装载演示完结稿', body: '请点击真实文件投放区。教程会装载内置的 txt 演示稿，模拟本地文件解析，不打开系统文件选择器。',
                    intercept: loadTutorialDecomposeLocalFile
                },
                {
                    id: 'decompose-select-first', type: 'click',
                    target: '#decompFileList .decomp-file-chapter-row[data-chapter-index="0"] .decomp-file-chapter-checkbox',
                    title: '选择序章', body: '请选择演示文件中的“第0章：哥哥失踪”（序章）。'
                },
                {
                    id: 'decompose-select-second', type: 'click',
                    target: '#decompFileList .decomp-file-chapter-row[data-chapter-index="1"] .decomp-file-chapter-checkbox',
                    title: '选择第一章', body: '请再选择“第1章：地图亮起”。'
                },
                {
                    id: 'decompose-confirm-import', type: 'click', target: '#btnDecomposeConfirm',
                    title: '确认导入', body: '请点击真实“确认导入”，所选章节会出现在拆书文件堆。'
                },
                {
                    id: 'decompose-open-template', type: 'click', target: '#btnDCTemplate',
                    title: '打开拆书模板', body: '请点击真实“提示词模版”。',
                    intercept: function() { openTutorialTemplateSelector('decompose'); }
                },
                {
                    id: 'decompose-select-template', type: 'click',
                    target: function() { return findTutorialTemplateCard('decompose'); },
                    title: '选择拆书模板', body: '请选择“知屿·拆书 A（结构节奏）”。本步只真实展示选中状态，演示内容不会使用或发送这份提示词。'
                },
                {
                    id: 'decompose-apply-template', type: 'click', target: '#btnApplyTemplate',
                    title: '应用拆书模板', body: '请点击真实“应用”，模板名称会回填到拆书工具区。',
                    intercept: function() { applyTutorialTemplate('decompose'); }
                },
                {
                    id: 'decompose-open-model', type: 'click', target: '#btnActionModelSelect',
                    title: '打开操作模型', body: '请点击真实模型入口。',
                    intercept: function() { openTutorialModelModal('action'); }
                },
                {
                    id: 'decompose-select-model', type: 'click', target: '[data-tutorial-model="action"]',
                    title: '选择指定模型', body: '请选择“DeepSeek V4 Flash”。这里只切换显示。',
                    intercept: selectTutorialModel
                },
                {
                    id: 'decompose-confirm-model', type: 'click', target: '#btnConfirmModelSelect',
                    title: '确认模型', body: '请点击真实“确定”。', intercept: applyTutorialModel
                },
                {
                    id: 'decompose-generate', type: 'click', target: '#btnOGSend',
                    title: '开始拆书', body: '请点击真实生成箭头。教程播放预置拆书结果，不调用 AI。',
                    intercept: startDemoDecomposeStream
                },
                {
                    id: 'decompose-stream', type: 'wait', target: '#dcContentBox',
                    title: '查看拆书结果', body: '预置拆书结果正在真实拆书结果框中流式显示。',
                    run: function() { return runtime.streamPromise; }
                },
                {
                    id: 'decompose-save', type: 'click', target: '#btnDCSave',
                    title: '保存拆书', body: '请点击真实“保存拆书”。教程只给出成功反馈，不写记忆库。',
                    intercept: saveDemoDecompose
                },
                {
                    id: 'decompose-memory-info', type: 'info',
                    target: function() { return document.querySelector('#memTree .memory-file-section[data-memory-section="foundation"]'); },
                    title: '认识拆书设定', body: '这里是真实关联文件区域。拆书设定会记录结构、节奏、爽点和写法边界，供后续细纲或正文参考。',
                    prepare: showTutorialDecomposeMemoryPreview,
                    after: returnToDemoDecomposePanel
                },
                {
                    id: 'decompose-local-info', type: 'info', target: '#decompTabFile',
                    title: '导入本地文件', body: '正式功能支持 txt 和 md；教程不会打开文件选择器，也不会读取您的磁盘。',
                    prepare: openDecomposeInfoModal
                },
                {
                    id: 'decompose-local-select-all-info', type: 'info', target: '#btnDecompFileSelectAll',
                    title: '全选章节', body: '导入本地完结稿后，可以快速选中解析出的章节；正式拆书最多选择十章。'
                },
                {
                    id: 'decompose-smart-sort-info', type: 'info', target: '#btnDecompFileSmartSort',
                    title: '智能排序', body: '当文件中的章节顺序混乱时，可以按卷号和章节号重新排列。'
                },
                {
                    id: 'decompose-keep-order-info', type: 'info', target: '#btnDecompFileKeepOrder',
                    title: '保持原始顺序', body: '如果原文件顺序就是正确的，可以恢复并保持文件中的原始排列。',
                    after: closeDecomposeInfoModal
                },
                {
                    id: 'decompose-clear-info', type: 'info', target: '.action-tab-btn[data-tab="decompose"] .action-tab-clear',
                    title: '清除拆书内容', body: '清除只清空拆书工作区，不删除正文和已经保存的关联文件。'
                },
                {
                    id: 'decompose-stop-info', type: 'info', target: '#dcStopBtn',
                    title: '停止生成', body: '正式生成过程中可以在这里中止当前拆书任务。',
                    prepare: showDemoDecomposeStopButton,
                    after: function() {
                        const button = document.getElementById('dcStopBtn');
                        if (button) { button.style.removeProperty('display'); button.disabled = false; }
                    }
                },
                {
                    id: 'decompose-regenerate-info', type: 'info', target: '#btnOGSend',
                    title: '重新生成', body: '结果完成后再次点击生成箭头，可以保留当前参考章节再获取一版。'
                },
                {
                    id: 'decompose-stack-info', type: 'info', target: '#dcStackChapters',
                    title: '导入文件堆', body: '这里会显示本次拆书实际参考的章节，点击文件堆可以查看来源。'
                }
            ];
        }

        function buildFullAnalysisSteps() {
            return [
                {
                    id: 'full-analysis-open-import', type: 'click', target: '#importBookCard',
                    title: '打开导入作品', body: '请点击总览页真实“导入作品”卡片。'
                },
                {
                    id: 'full-analysis-select-type', type: 'click',
                    target: function() { return document.querySelector('input[name="importType"][value="novel"]')?.closest('label'); },
                    title: '选择小说', body: '请选择真实作品类型“小说”。聚焦范围包含选项和标题，方便确认自己选择的内容。'
                },
                {
                    id: 'full-analysis-confirm-import', type: 'click', target: '#btnConfirmImport',
                    title: '确定导入', body: '请点击真实“确定导入”。教程会装载内置完结稿，不打开系统文件选择器。',
                    intercept: prepareTutorialFullAnalysisImport
                },
                {
                    id: 'full-analysis-select-all', type: 'click', target: '#btnImportSelectAll',
                    title: '全选章节', body: '请点击真实“全选章节”，把解析出的演示章节全部纳入分析。'
                },
                {
                    id: 'full-analysis-smart-sort', type: 'click', target: '#btnImportSmartSort',
                    title: '智能排序', body: '请点击真实“智能排序”，按卷和章节编号恢复阅读顺序。',
                    intercept: sortTutorialFullAnalysisChapters
                },
                {
                    id: 'full-analysis-open-panel', type: 'click', target: '#btnImportAnalyze',
                    title: '进入全文分析', body: '请点击真实“全文分析”。教程只打开真实分析面板，不创建分析任务。',
                    intercept: openTutorialFullAnalysisPanel
                },
                {
                    id: 'full-analysis-open-model', type: 'click', target: '#btnFullAnalysisNormalModel',
                    title: '打开模型列表', body: '请点击真实全文分析模型入口。',
                    intercept: openTutorialFullAnalysisModelMenu
                },
                {
                    id: 'full-analysis-select-model', type: 'click',
                    target: function() { return document.querySelector('[data-full-analysis-model-route="' + DEMO_FULL_ANALYSIS_MODEL_ROUTE + '"]'); },
                    title: '选择指定模型', body: '请选择“DeepSeek V4 Flash”。原页面选中后立即生效，因此没有额外确认按钮。',
                    intercept: selectTutorialFullAnalysisModel
                },
                {
                    id: 'full-analysis-mode', type: 'change', target: '#fullAnalysisModeSelect', expectedValue: 'automatic',
                    title: '选择自动分析', body: '请打开真实执行方式选择器并选择“自动分析”。',
                    intercept: applyTutorialFullAnalysisMode
                },
                {
                    id: 'full-analysis-scope', type: 'change', target: '#fullAnalysisScopeSelect', expectedValue: 'all',
                    title: '分析全部章节', body: '请打开真实分析范围选择器并选择“全部章节”。',
                    intercept: applyTutorialFullAnalysisScope
                },
                {
                    id: 'full-analysis-start', type: 'click', target: '#btnFullAnalysisStart',
                    title: '开始分析', body: '请点击真实“开始分析”。教程播放预置进度，不上传正文、不调用 AI。',
                    intercept: startDemoFullAnalysis
                },
                {
                    id: 'full-analysis-progress', type: 'wait', target: '#fullAnalysisProgressText',
                    title: '查看分析过程', body: '真实进度条、章节日志和八文件汇总区正在播放预置过程。',
                    run: function() { return runtime.streamPromise; }
                },
                {
                    id: 'full-analysis-name', type: 'click', target: '#fullAnalysisNewBookName',
                    title: '核对新作品名称', body: '教程已提前填好示例书名。请点击输入框确认这里用于填写分析结果的新作品名称，不用再打字。',
                    prepare: function() { setInputValue('fullAnalysisNewBookName', DEMO_FULL_ANALYSIS_RESULT_NAME); }
                },
                {
                    id: 'full-analysis-save', type: 'click', target: '#btnFullAnalysisSave',
                    title: '保存到新作品', body: '请点击真实“保存到新作品”。教程只展示结果，不创建作品或文件。',
                    intercept: saveDemoFullAnalysis
                },
                {
                    id: 'full-analysis-memory', type: 'info',
                    target: function() { return document.querySelector('#memTree .memory-file-section[data-memory-section="foundation"]'); },
                    title: '认识八份分析资料', body: '这里是真实关联文件区域，已展示大纲、剧情总览、设定集、信息表、角色列表、追踪表、边界卡和承接卡。',
                    after: returnToDemoFullAnalysisPanel
                },
                {
                    id: 'full-analysis-mode-info', type: 'info', target: '#fullAnalysisModeSection',
                    title: '自动分析与分阶段确认', body: '自动分析会连续完成；分阶段确认会在关键阶段暂停，让您检查结果后再继续。'
                },
                {
                    id: 'full-analysis-scope-info', type: 'info', target: '#fullAnalysisScopeSection',
                    title: '三种分析范围', body: '可以分析全部章节，也可以按章节范围或分卷范围只分析需要的部分。'
                },
                {
                    id: 'full-analysis-back-info', type: 'info', target: '#btnFullAnalysisBack',
                    title: '返回调整', body: '正式任务开始前，可以返回章节解析页重新选择章节和范围。'
                },
                {
                    id: 'full-analysis-skip-info', type: 'info', target: '#btnFullAnalysisSkipSegment',
                    title: '跳过当前阶段', body: '分阶段模式中可以跳过当前章节段或汇总阶段，已完成进度仍会保留。',
                    prepare: showDemoFullAnalysisSupplementControls
                },
                {
                    id: 'full-analysis-minimize-info', type: 'info', target: '#btnFullAnalysisMinimize',
                    title: '最小化', body: '正式分析可以缩到任务栏继续观察，不必一直占着主窗口。'
                },
                {
                    id: 'full-analysis-pause-info', type: 'info', target: '#btnFullAnalysisCancel',
                    title: '暂停与继续', body: '暂停会保留已完成进度；之后可点击继续分析，从检查点接着处理。'
                },
                {
                    id: 'full-analysis-stop-info', type: 'info', target: '#btnFullAnalysisStopNow',
                    title: '立即停止', body: '需要提前结束时，可按当前已有结果直接总结或结束任务。'
                },
                {
                    id: 'full-analysis-clear-info', type: 'info', target: '#btnFullAnalysisRestart',
                    title: '清除本次任务', body: '只清除这一次分析的临时检查点，不删除已经保存的作品。'
                },
                {
                    id: 'full-analysis-delete-info', type: 'info', target: '#btnFullAnalysisDelete',
                    title: '删除此任务', body: '这是同一临时任务的删除入口；教程只介绍，不执行删除。'
                }
            ];
        }

        function buildDecomposeSettingsSteps() {
            function findRefFile(displayName) {
                return Array.from(document.querySelectorAll('#treeRefs .ref-file-item')).find(function(item) {
                    return String(item.querySelector('span')?.textContent || '').trim() === displayName;
                }) || null;
            }
            function findMemoryLinkFolder(displayName) {
                return Array.from(document.querySelectorAll('#memoryLinkFolders .link-folder-item')).find(function(item) {
                    return String(item.querySelector('.link-folder-name')?.textContent || '').trim() === displayName;
                }) || null;
            }
            function findMemoryLinkSection(displayName) {
                return Array.from(document.querySelectorAll('#memoryLinkTree .memory-link-section')).find(function(section) {
                    return String(section.querySelector('.memory-link-section-title span')?.textContent || '').trim() === displayName;
                }) || null;
            }
            return [
                {
                    id: 'decompose-settings-area', type: 'info', target: '#treeRefs',
                    title: '认识关联文件区域',
                    body: '这里是写作页章节目录左下角真实的“关联文件区域”。这些文件是 AI 的长期记忆；教程只展示文件外观和用途，不打开内容，也不会保存到账号。',
                    prepare: showTutorialDecomposeSettingsMemoryPreview
                },
                {
                    id: 'decompose-settings-foundation', type: 'info',
                    target: function() { return findRefFile('设定集'); },
                    title: '设定集、信息表和角色列表',
                    body: '设定集记录世界规则，信息表记录地点、势力和物品，角色列表记录人物身份、关系与状态。细纲和正文通常都需要这三类长期事实。'
                },
                {
                    id: 'decompose-settings-outline-files', type: 'info',
                    target: function() { return findRefFile('章节粗纲'); },
                    title: '章节粗纲与阶段粗纲',
                    body: '普通大纲生成的是章节粗纲；高级大纲按阶段生成阶段粗纲。生成细纲时二选一：普通流程选章节粗纲，高级流程只选当前阶段对应的阶段粗纲。'
                },
                {
                    id: 'decompose-settings-continuity', type: 'info',
                    target: function() { return findRefFile('追踪表'); },
                    title: '追踪表、边界卡和承接卡',
                    body: '追踪表管理主线、伏笔和未解决事项；边界卡约束不能写错的设定；承接卡记录上一段状态和下一段必须接住的任务。它们用于避免正文前后矛盾。'
                },
                {
                    id: 'decompose-settings-indexes', type: 'info',
                    target: function() { return findRefFile('关键事件表'); },
                    title: '关键事件表与资料索引',
                    body: '关键事件表保存影响主线的重要事件，资料索引帮助快速找到相关事实。正文生成的真实默认规则会一并带上这两份资料。'
                },
                {
                    id: 'decompose-settings-decompose-file', type: 'info',
                    target: function() { return findRefFile('拆书设定'); },
                    title: '拆书设定',
                    body: '拆书设定记录可借鉴的结构、节奏、爽点和写法边界。只有确实要参考拆书方法时才主动勾选，不是每次细纲或正文都默认加入。'
                },
                {
                    id: 'decompose-settings-fine-rule', type: 'info', target: '#treeRefs',
                    title: '生成细纲应该选什么',
                    body: '先在“大纲来源”里二选一：普通大纲选章节粗纲，高级大纲选当前阶段粗纲；再在关联文件里勾选设定集、信息表和角色列表。不要同时勾两种粗纲。'
                },
                {
                    id: 'decompose-settings-open-chapter-links', type: 'click', target: '#btnComposerLinkFiles',
                    title: '打开正文关联文件',
                    body: '请点击正文输入区上方真实的“关联文件”，进入正文生成时实际使用的选择弹窗。',
                    intercept: openTutorialDecomposeSettingsChapterLinks,
                    skip: openTutorialDecomposeSettingsChapterLinks
                },
                {
                    id: 'decompose-settings-chapter-fine-folder', type: 'click',
                    target: function() { return findMemoryLinkFolder('细纲文件'); },
                    spotlightTarget: '#memoryLinkModal .memory-link-modal-box',
                    title: '进入细纲文件夹',
                    body: '请点击左侧真实的“细纲文件”，查看正文最直接的剧情依据。'
                },
                {
                    id: 'decompose-settings-chapter-fine-rule', type: 'info',
                    target: '#memoryLinkTree .link-file-card[data-name="第1章细纲.md"]',
                    spotlightTarget: '#memoryLinkModal .memory-link-modal-box',
                    title: '正文选择当前章细纲',
                    body: '生成正文时选择当前章节对应的细纲。细纲已经把粗纲拆成更精确的场景、冲突和节奏，所以不再重复勾选章节粗纲。'
                },
                {
                    id: 'decompose-settings-chapter-associated-folder', type: 'click',
                    target: function() { return findMemoryLinkFolder('关联文件'); },
                    spotlightTarget: '#memoryLinkModal .memory-link-modal-box',
                    title: '进入关联文件分区',
                    body: '请点击左侧真实的“关联文件”，查看正文默认需要的长期记忆文件。'
                },
                {
                    id: 'decompose-settings-chapter-rule', type: 'info',
                    target: function() { return findMemoryLinkSection('关联文件'); },
                    spotlightTarget: '#memoryLinkModal .memory-link-modal-box',
                    title: '生成正文应该选什么',
                    body: '正文选择设定集、信息表、角色列表、追踪表、边界卡、承接卡、关键事件表和资料索引。它们分别负责世界规则、人物事实、剧情连续性与资料定位。'
                },
                {
                    id: 'decompose-settings-chapter-exclusions', type: 'info',
                    target: function() { return findMemoryLinkSection('大纲资料'); },
                    spotlightTarget: '#memoryLinkModal .memory-link-modal-box',
                    title: '正文为什么不再选大纲',
                    body: '已有细纲时，不再勾大纲或章节粗纲：设定集、信息表和角色列表已经保存长期信息，细纲又比粗纲更精确地说明本章剧情。重复加入只会增加上下文并可能造成冲突。'
                },
                {
                    id: 'decompose-settings-selected-files', type: 'info',
                    target: function() { return findMemoryLinkSection('已选文件'); },
                    spotlightTarget: '#memoryLinkModal .memory-link-modal-box',
                    title: '核对已选文件',
                    body: '弹窗顶部会把已选文件显示成标签。生成前在这里核对是否包含当前章细纲和八份正文关联文件，可以及时发现漏选或多选。'
                },
                {
                    id: 'decompose-settings-close-links', type: 'click', target: '#btnCloseMemoryLink',
                    spotlightTarget: '#memoryLinkModal .memory-link-modal-box',
                    title: '关闭关联文件弹窗', body: '请点击右上角真实关闭按钮，返回写作页；本阶段只介绍规则，不改动真实选择。',
                    skip: function() { document.getElementById('btnCloseMemoryLink')?.click(); }
                },
                {
                    id: 'decompose-settings-open-display', type: 'click', target: '#treeRefs .ref-files-settings-trigger',
                    spotlightTarget: '#treeRefs',
                    title: '打开显示设置', body: '请点击真实“显示设置”。这里只调整左侧显示哪些关联文件，不会删除文件。',
                    skip: function() { document.querySelector('#treeRefs .ref-files-settings-trigger')?.click(); }
                },
                {
                    id: 'decompose-settings-visibility', type: 'info',
                    target: '#treeRefs .ref-files-settings-row:first-child',
                    spotlightTarget: '#treeRefs .ref-files-settings-panel',
                    title: '勾选要显示的文件',
                    body: '勾选框只控制文件是否显示在章节目录下方，不会删除文件，也不会改变生成时已经选择的关联资料。'
                },
                {
                    id: 'decompose-settings-order', type: 'info',
                    target: '#treeRefs .ref-files-settings-row:first-child [data-ref-drag-key]',
                    spotlightTarget: '#treeRefs .ref-files-settings-panel',
                    title: '调整显示顺序',
                    body: '按住“按住拖动”并上下移动，可以实时调整文件显示顺序；按 Esc 或拖出区域会取消。教程只介绍位置，不改变您的长期设置。'
                },
                {
                    id: 'decompose-settings-close-display', type: 'click',
                    target: '#treeRefs .ref-files-settings-footer button',
                    spotlightTarget: '#treeRefs .ref-files-settings-panel',
                    title: '关闭显示设置', body: '请点击真实“关闭”，返回关联文件区域。',
                    skip: function() { document.querySelector('#treeRefs .ref-files-settings-footer button')?.click(); }
                },
                {
                    id: 'decompose-settings-finish', type: 'info', target: '#treeRefs',
                    title: '按任务选择，不要全部勾选',
                    body: '关联文件不是越多越好。每次按当前功能选择必要文件，并在弹窗顶部“已选文件”标签中核对，能让生成目标更清楚、剧情更稳定。'
                }
            ];
        }



        function applySafeSkip(id) {
            if (id === 'create-book-channel') {
                document.querySelector('#createBookChannel [data-gender="male"]')?.click();
            } else if (id === 'create-book-genre-primary' || id === 'create-book-genre-secondary') {
                findTextButton('#createBookGenreMale', id === 'create-book-genre-primary' ? '都市高武' : '都市脑洞')?.click();
            } else if (id === 'create-book-open-synopsis') {
                document.getElementById('btnOpenBookSynopsisGenerator')?.click();
            } else if (id === 'create-book-generate-synopsis') {
                startDemoSynopsisStream();
            } else if (id === 'create-book-apply-synopsis') {
                document.getElementById('btnApplyBookSynopsis')?.click();
            } else if (id === 'create-book-cover-generate') {
                generateTutorialCover();
            } else if (id === 'create-book-confirm') {
                completeDemoBookCreation();
            } else if (id === 'fine-open-tab') {
                selectTutorialActionTab('fineOutline');
            } else if (id === 'fine-open-outline-picker') {
                document.getElementById('btnOGPickOutline')?.click();
            } else if (id === 'fine-open-memory-outline') {
                document.getElementById('ogPickerMemRow')?.click();
            } else if (id === 'fine-select-chapter-outline') {
                document.querySelector('#ogOutlineFileGrid .link-file-card[data-name="章节粗纲.md"]')?.click();
            } else if (id === 'fine-confirm-outline-file') {
                document.getElementById('btnOGFileConfirm')?.click();
            } else if (id === 'fine-regex-split') {
                document.getElementById('btnOGRegexSplit')?.click();
            } else if (id === 'fine-confirm-chapters') {
                document.getElementById('btnOGConfirm')?.click();
            } else if (id === 'fine-open-links') {
                openTutorialDecomposeSettingsLinks();
            } else if (id === 'fine-confirm-links') {
                document.getElementById('btnConfirmMemoryLink')?.click();
            } else if (id === 'fine-open-template') {
                openTutorialTemplateSelector('fineOutline');
            } else if (id === 'fine-select-template') {
                findTutorialTemplateCard('fineOutline')?.click();
            } else if (id === 'fine-apply-template') {
                applyTutorialTemplate('fineOutline');
                closeModal('templateSelectModal');
            } else if (id === 'fine-open-model') {
                openTutorialModelModal('action');
            } else if (id === 'fine-select-model') {
                selectTutorialModel(document.querySelector('[data-tutorial-model="action"]'));
            } else if (id === 'fine-confirm-model') {
                applyTutorialModel();
            } else if (id === 'fine-generate') {
                startDemoFineOutlineStream();
            } else if (id === 'fine-save') {
                saveDemoFineOutline();
            } else if (id === 'chapter-select') {
                document.querySelector('#treeContent .chapter-item[data-vi="0"][data-ci="1"]')?.click();
            } else if (id === 'chapter-open-model') {
                openTutorialModelModal('chapter');
            } else if (id === 'chapter-select-model') {
                selectTutorialModel(document.querySelector('[data-tutorial-model="chapter"]'));
            } else if (id === 'chapter-confirm-model') {
                applyTutorialModel();
            } else if (id === 'chapter-open-template') {
                openTutorialTemplateSelector('chapter');
            } else if (id === 'chapter-select-template') {
                findTutorialTemplateCard('chapter')?.click();
            } else if (id === 'chapter-apply-template') {
                applyTutorialTemplate('chapter');
                closeModal('templateSelectModal');
            } else if (id === 'chapter-open-links') {
                openTutorialChapterMemorySelector();
            } else if (id === 'chapter-open-fine-folder' || id === 'local-rewrite-open-fine-folder') {
                document.querySelector('#memoryLinkFolders .link-folder-item[data-folder="细纲文件"]')?.click();
            } else if (id === 'chapter-open-associated-folder' || id === 'local-rewrite-open-associated-folder') {
                document.querySelector('#memoryLinkFolders .link-folder-item[data-folder="__memory_link_associated__"]')?.click();
            } else if (id === 'chapter-confirm-links') {
                document.getElementById('btnConfirmMemoryLink')?.click();
            } else if (id === 'chapter-open-references') {
                openTutorialReferenceSelector();
            } else if (id === 'chapter-select-reference') {
                document.querySelector('#refChapterList .ref-body-cb[data-vi="0"][data-ci="0"]')?.click();
            } else if (id === 'chapter-confirm-references') {
                document.getElementById('btnConfirmRefChapters')?.click();
            } else if (id === 'chapter-generate') {
                enableTutorialChapterGenerate();
                startDemoChapterStream();
            } else if (id === 'chapter-confirm-use') {
                confirmDemoChapter();
            } else if (id === 'chapter-save') {
                saveDemoChapter();
            } else if (id === 'ai-polish-select-chapter' || id === 'local-polish-select-chapter' || id === 'local-rewrite-select-chapter') {
                document.querySelector('#treeContent .chapter-item[data-vi="0"][data-ci="1"]')?.click();
            } else if (id === 'ai-polish-open-tab') {
                selectTutorialActionTab('aiPolish');
                configureDemoNaturalizePanel();
            } else if (id === 'ai-polish-open-level') {
                document.getElementById('naturalizeLevelMenu')?.classList.add('open');
                document.getElementById('btnNaturalizeLevel')?.setAttribute('aria-expanded', 'true');
            } else if (id === 'ai-polish-select-level') {
                selectTutorialNaturalizeLevel(findTextButton('#naturalizeLevelMenu', '中级'));
            } else if (id === 'ai-polish-start') {
                startDemoNaturalizeStream();
            } else if (id === 'ai-polish-apply') {
                openDemoNaturalizeConfirm();
            } else if (id === 'ai-polish-confirm') {
                document.getElementById('_cfmOk')?.click();
            } else if (id === 'local-polish-open-model' || id === 'local-rewrite-open-model') {
                openTutorialModelModal('chapter');
            } else if (id === 'local-polish-select-model' || id === 'local-rewrite-select-model') {
                selectTutorialModel(document.querySelector('[data-tutorial-model="chapter"]'));
            } else if (id === 'local-polish-confirm-model' || id === 'local-rewrite-confirm-model') {
                applyTutorialModel();
            } else if (id === 'local-polish-selection') {
                runtime.selectedText = DEMO_LOCAL_SELECTION;
            } else if (id === 'local-polish-open') {
                openTutorialPolishModal();
            } else if (id === 'local-polish-start') {
                startDemoLocalPolish();
            } else if (id === 'local-polish-confirm') {
                confirmDemoLocalPolish();
            } else if (id === 'local-rewrite-open') {
                openTutorialRewriteModal();
            } else if (id === 'local-rewrite-direction') {
                window.setRewriteDirection?.('mid');
            } else if (id === 'local-rewrite-open-links') {
                openTutorialRewriteMemorySelector();
            } else if (id === 'local-rewrite-confirm-links') {
                document.getElementById('btnConfirmMemoryLink')?.click();
            } else if (id === 'local-rewrite-start') {
                startDemoLocalRewrite();
            } else if (id === 'local-rewrite-confirm') {
                confirmDemoLocalRewrite();
            } else if (id === 'advanced-select-mode' || id === 'stage-select-advanced') {
                selectTutorialAdvancedMode(document.querySelector('#outlineSubModeTabs [data-submode="advanced"]'));
            } else if (id === 'advanced-expand-master') {
                window.setAdvancedOutlineGroupExpanded?.('master', true);
            } else if (id === 'advanced-open-genres' || id === 'functional-open-genres') {
                document.getElementById(id === 'advanced-open-genres' ? 'outlineGenreToggleBtn' : 'outlineFunctionGenreToggleBtn')?.click();
            } else if (id === 'advanced-genre-power' || id === 'advanced-genre-idea') {
                toggleTutorialGenre(findTextButton('#genreTagsMale', id.endsWith('power') ? '都市高武' : '都市脑洞'), 'advanced');
            } else if (id === 'advanced-confirm-genres' || id === 'functional-confirm-genres') {
                document.getElementById('btnConfirmOutlineGenrePopup')?.click();
            } else if (id === 'advanced-word-count') {
                document.querySelector('#outlineModal .wordcount-option[data-wc="long"]')?.click();
            } else if (id === 'advanced-open-tags') {
                document.querySelector('#outlineAdvancedSummarySection .genre-preference-add-btn')?.click();
            } else if (id === 'advanced-tag-system' || id === 'advanced-tag-rise') {
                findTextButton('#genrePreferenceTagModal', id.endsWith('system') ? '系统' : '逆袭')?.click();
            } else if (id === 'advanced-confirm-tags') {
                document.getElementById('btnConfirmGenrePreferenceTags')?.click();
            } else if (id === 'advanced-open-model' || id === 'stage-open-model' || id === 'functional-open-model') {
                openTutorialModelModal();
            } else if (id === 'advanced-select-model' || id === 'stage-select-model' || id === 'functional-select-model') {
                selectTutorialModel(document.querySelector('[data-tutorial-model="outline"]'));
            } else if (id === 'advanced-confirm-model' || id === 'stage-confirm-model' || id === 'functional-confirm-model') {
                applyTutorialModel();
            } else if (id === 'advanced-generate') {
                startDemoAdvancedOutlineStream();
            } else if (id === 'advanced-open-memory') {
                showTutorialMemoryPreview({ includeAdvanced: true, overviewOnly: true });
            } else if (id === 'advanced-select-memory-book') {
                document.querySelector('#memBookGrid .memory-book-card[data-book="' + CSS.escape(DEMO_BOOK_NAME) + '"]')?.click();
            } else if (id === 'stage-expand-group') {
                window.setAdvancedOutlineGroupExpanded?.('stages', true);
            } else if (id === 'stage-open-source') {
                document.getElementById('outlineAdvancedSourceOption')?.click();
            } else if (id === 'stage-open-memory-source') {
                openTutorialAdvancedSourceFiles();
            } else if (id === 'stage-select-master-file') {
                findOutlineFileCard('剧情总览.md')?.click();
            } else if (id === 'stage-confirm-master-file') {
                document.getElementById('btnOGFileConfirm')?.click();
            } else if (id === 'stage-confirm-master') {
                document.getElementById('btnOGConfirm')?.click();
            } else if (id === 'stage-select-stage') {
                const select = document.getElementById('outlineAdvancedStageSelect');
                if (select) {
                    select.value = 'S01';
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                }
            } else if (id === 'stage-open-links') {
                openTutorialAdvancedLinks();
            } else if (id === 'stage-confirm-links') {
                document.getElementById('btnConfirmMemoryLink')?.click();
            } else if (id === 'stage-generate') {
                startDemoStageOutlineStream();
            } else if (id === 'stage-save') {
                saveDemoStageOutline();
            } else if (id === 'functional-select-mode') {
                selectTutorialFunctionMode(document.querySelector('#outlineModeTabs [data-mode="function"]'));
            } else if (id === 'functional-select-type') {
                selectTutorialFunctionType(document.querySelector('#outlineFunctionTypeToggle [data-fn="imitate"]'));
            } else if (id === 'functional-genre-power' || id === 'functional-genre-idea') {
                toggleTutorialGenre(findTextButton('#genreTagsMale', id.endsWith('power') ? '都市高武' : '都市脑洞'), 'function');
            } else if (id === 'functional-open-template') {
                openTutorialTemplateSelector('functionalOutline');
            } else if (id === 'functional-select-template') {
                findTutorialTemplateCard('functionalOutline')?.click();
            } else if (id === 'functional-apply-template') {
                applyTutorialTemplate('functionalOutline');
            } else if (id === 'functional-open-links') {
                openTutorialFunctionalLinks();
            } else if (id === 'functional-confirm-links') {
                document.getElementById('btnConfirmMemoryLink')?.click();
            } else if (id === 'functional-generate') {
                startDemoFunctionalStream();
            } else if (id === 'functional-save') {
                saveDemoFunctionalContent();
            } else if (id === 'decompose-open-tab') {
                selectTutorialActionTab('decompose');
            } else if (id === 'decompose-open-import') {
                document.getElementById('btnDCImportBook')?.click();
            } else if (id === 'decompose-local-file-tab') {
                document.getElementById('decompTabFile')?.click();
            } else if (id === 'decompose-load-local-file') {
                loadTutorialDecomposeLocalFile();
            } else if (id === 'decompose-select-first' || id === 'decompose-select-second') {
                document.querySelector('#decompFileList .decomp-file-chapter-row[data-chapter-index="' + (id.endsWith('first') ? '0' : '1') + '"] .decomp-file-chapter-checkbox')?.click();
            } else if (id === 'decompose-confirm-import') {
                document.getElementById('btnDecomposeConfirm')?.click();
            } else if (id === 'decompose-open-template') {
                openTutorialTemplateSelector('decompose');
            } else if (id === 'decompose-select-template') {
                findTutorialTemplateCard('decompose')?.click();
            } else if (id === 'decompose-apply-template') {
                applyTutorialTemplate('decompose');
            } else if (id === 'decompose-open-model') {
                openTutorialModelModal('action');
            } else if (id === 'decompose-select-model') {
                selectTutorialModel(document.querySelector('[data-tutorial-model="action"]'));
            } else if (id === 'decompose-confirm-model') {
                applyTutorialModel();
            } else if (id === 'decompose-generate') {
                startDemoDecomposeStream();
            } else if (id === 'decompose-save') {
                saveDemoDecompose();
            } else if (id === 'full-analysis-open-import') {
                openModal('importBookModal');
            } else if (id === 'full-analysis-select-type') {
                const novel = document.querySelector('input[name="importType"][value="novel"]');
                if (novel) novel.checked = true;
            } else if (id === 'full-analysis-confirm-import') {
                prepareTutorialFullAnalysisImport();
            } else if (id === 'full-analysis-select-all') {
                getTutorialFullAnalysisChapters().forEach(chapter => { chapter.selected = true; });
                window.renderImportChapterList?.();
                const selectAll = document.getElementById('btnImportSelectAll');
                if (selectAll) selectAll.textContent = '取消全选';
            } else if (id === 'full-analysis-smart-sort') {
                sortTutorialFullAnalysisChapters();
            } else if (id === 'full-analysis-open-panel') {
                openTutorialFullAnalysisPanel();
            } else if (id === 'full-analysis-open-model') {
                openTutorialFullAnalysisModelMenu();
            } else if (id === 'full-analysis-select-model') {
                selectTutorialFullAnalysisModel(document.querySelector('[data-full-analysis-model-route="' + DEMO_FULL_ANALYSIS_MODEL_ROUTE + '"]'));
            } else if (id === 'full-analysis-mode') {
                applyTutorialFullAnalysisMode(document.getElementById('fullAnalysisModeSelect'));
            } else if (id === 'full-analysis-scope') {
                applyTutorialFullAnalysisScope(document.getElementById('fullAnalysisScopeSelect'));
            } else if (id === 'full-analysis-start') {
                startDemoFullAnalysis();
            } else if (id === 'full-analysis-name') {
                setInputValue('fullAnalysisNewBookName', DEMO_FULL_ANALYSIS_RESULT_NAME);
            } else if (id === 'full-analysis-save') {
                saveDemoFullAnalysis();
            } else if (id === 'normal-mode') {
                selectTutorialNormalMode(document.querySelector('#outlineSubModeTabs [data-submode="normal"]'));
            } else if (id === 'genre-urban-power' || id === 'genre-urban-idea') {
                const text = id === 'genre-urban-power' ? '都市高武' : '都市脑洞';
                findTextButton('#genreTagsMale', text)?.click();
            } else if (id === 'confirm-genres') {
                document.getElementById('btnConfirmOutlineGenrePopup')?.click();
            } else if (id === 'open-template') openTutorialTemplateSelector();
            else if (id === 'select-template') findTutorialTemplateCard()?.click();
            else if (id === 'apply-template') {
                applyTutorialTemplate();
                closeModal('templateSelectModal');
            }
            else if (id === 'word-count') document.querySelector('#outlineModal .wordcount-option[data-wc="long"]')?.click();
            else if (id === 'plot-tag-system' || id === 'plot-tag-rise') {
                findTextButton('#genrePreferenceTagModal', id === 'plot-tag-system' ? '系统' : '逆袭')?.click();
            } else if (id === 'confirm-plot-tags') document.getElementById('btnConfirmGenrePreferenceTags')?.click();
            else if (id === 'direct-mode') selectTutorialDirectMode(document.querySelector('#outlineGenerationModeToggle [data-outline-generation-mode="direct"]'));
            else if (id === 'open-model') openTutorialModelModal();
            else if (id === 'select-model') selectTutorialModel(document.querySelector('[data-tutorial-model="outline"]'));
            else if (id === 'confirm-model') applyTutorialModel();
            else if (id === 'generate-outline') startDemoStream();
            else if (id === 'save-outline') saveDemoOutline();
        }



        function getStageCompletionCopy(stageId) {
            if (stageId === 'new-book') {
                return '您完成了作品名称、频道、题材、简介生成、简介填入和教程内创建，也认识了封面相关功能。';
            }
            if (stageId === 'outline') {
                return '您完成了题材、模板、字数、剧情标签、模型、模拟生成、教程内保存和关联记忆文件认识。';
            }
            if (stageId === 'fine-outline') {
                return '您完成了大纲拆分、关联资料、模板、模型、剧情要求、模拟生成和教程内保存。';
            }
            if (stageId === 'chapter') {
                return '您完成了章节选择、正文模型、模板、关联文件、参考上文、字数、剧情要求、模拟生成、采用和教程内保存。';
            }
            if (stageId === 'ai-polish') {
                return '您完成了章节选择、消痕等级、模拟优化、覆盖确认和正文替换，也认识了状态、停止、清除和服务提示。';
            }
            if (stageId === 'local-polish') {
                return '您亲自框选了正文，完成模型选择、润色要求、模拟优化和采用，也认识了重新润色与放弃操作。';
            }
            if (stageId === 'local-rewrite') {
                return '您完成了章节与模型选择、重写方向、关联文件、剧情要求、目标字数、模拟改写和采用。';
            }
            if (stageId === 'advanced-outline') {
                return '您完成了高级大纲题材、字数、剧情标签、模型、模拟分段生成和教程内保存，也认识了阶段生成与分段恢复按钮。';
            }
            if (stageId === 'stage-outline') {
                return '您完成了母大纲、目标阶段、关联文件、模型、模拟生成和教程内保存。';
            }
            if (stageId === 'functional') {
                return '您完成了功能类型、题材、真实模板、关联文件、方向描述、模型、模拟生成和教程内保存。';
            }
            if (stageId === 'decompose') {
                return '您完成了参考章节、真实模板、模型、模拟拆书和教程内保存，也认识了拆书设定、导入、清除、停止和文件堆。';
            }
            if (stageId === 'full-analysis') {
                return '您完成了内置作品导入、章节选择、智能排序、模型、模式、范围、模拟分析和教程内保存，也认识了八份资料与任务控制按钮。';
            }
            if (stageId === 'decompose-settings') {
                return '您认识了章节目录下方的真实关联文件区域，了解了细纲与正文的选择规则，并体验了新版显示设置。';
            }
            return '您已经完成本阶段的真实按键操作和效果体验。';
        }



        function buildStageSteps(stageId) {
            if (stageId === 'ai-polish') return buildAiPolishSteps();
            if (stageId === 'local-polish') return buildLocalPolishSteps();
            if (stageId === 'local-rewrite') return buildLocalRewriteSteps();
            if (stageId === 'advanced-outline') return buildAdvancedOutlineSteps();
            if (stageId === 'stage-outline') return buildStageOutlineSteps();
            if (stageId === 'functional') return buildFunctionalSteps();
            if (stageId === 'decompose') return buildDecomposeSteps();
            if (stageId === 'full-analysis') return buildFullAnalysisSteps();
            if (stageId === 'decompose-settings') return buildDecomposeSettingsSteps();
            return null;
        }

        return Object.freeze({ buildStageSteps, applySafeSkip, getStageCompletionCopy });
    }

    window.ZHIYU_OPERATION_TUTORIAL_EXTRA_PACK = Object.freeze({ createRuntime });
})(window, document);
