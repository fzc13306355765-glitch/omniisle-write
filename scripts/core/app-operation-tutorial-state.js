(function(window, document) {
    'use strict';

    function createRuntime(api) {
        const { runtime, getAppState, selectTutorialActionTab, isVisible, closeModal, prepareStage, applySafeSkip, showStep } = api;
        const modalIds = api.modalIds || [];

        function createDemoBookPreview(options) {
            const chapterBody = options?.includeBody ? api.toTutorialEditorHtml(api.demoChapter) : '';
            return { [api.demoBookName]: {
                _bid: 'tutorial-demo-book', status: 'active', currentVol: 0, wordCount: 0,
                cover: api.demoBookCover, synopsis: api.demoSynopsis, genreGender: 'male', genres: ['都市高武', '都市脑洞'],
                volumes: [{ name: '第一卷：雾城初醒', chapters: [
                    { name: '序章：哥哥失踪', content: '三年前，周衡在临海北站留下最后一条语音：不要让第七座钟楼敲响。' },
                    { name: '第1章：地图亮起', content: chapterBody }
                ] }]
            } };
        }

        function createDemoMemoryBooks(options) {
            const files = ['追踪表.md', '边界卡.md', '设定集.md', '信息表.md', '角色列表.md', '承接卡.md'].map(name => ({ name, content: '' }));
            if (options?.fineSourceFiles) files.push(
                { name: '章节粗纲.md', content: api.demoFineSource },
                { name: '阶段粗纲.md', content: api.demoStageOutline }
            );
            else files.push({ name: '大纲.md', content: api.demoFineSource });
            if (options?.includeAdvanced) files.push(
                { name: '资料索引.md', content: '' },
                { name: '关键事件表.md', content: '' },
                { name: '剧情总览.md', content: api.demoAdvancedOutline },
                { name: 'S01阶段粗纲.md', content: api.demoStageOutline }
            );
            if (options?.includeDecompose) files.push({ name: '拆书设定.md', content: api.demoDecomposeContent });
            if (options?.includeFullAnalysis) Object.entries(api.demoFullAnalysisFiles).forEach(entry => {
                const existing = files.find(file => file.name === entry[0]);
                if (existing) existing.content = entry[1];
                else files.push({ name: entry[0], content: entry[1] });
            });
            return { [api.demoBookName]: {
                [api.demoMemoryFolderName]: files,
                '细纲文件': [],
                '拆书-第1卷': options?.includeDecompose ? [{ name: '第1章-地图亮起.md', content: api.demoDecomposeContent }] : []
            } };
        }

        function generateTutorialCover() {
            const preview = document.getElementById('createBookCoverPreview');
            if (preview) {
                preview.src = api.demoBookCover;
                preview.classList.remove('is-placeholder');
            }
            const empty = document.getElementById('createBookCoverEmpty');
            if (empty) empty.hidden = true;
            const button = document.getElementById('btnDownloadBookCover');
            if (button) { button.hidden = false; button.disabled = true; }
            window.ZHIYU_TOAST?.success?.('教程封面已生成');
        }

        function installTutorialFetchGuard() {
            document.documentElement.dataset.operationTutorialNetworkBlocked = 'true';
        }

        function restoreTutorialFetchGuard() {
            delete document.documentElement.dataset.operationTutorialNetworkBlocked;
        }

        function hasActiveFormalGeneration() {
            const activeChapterTask = Object.values(window.generationTasks || {}).some(function(task) {
                return task?.abortController && task.abortController.signal?.aborted !== true;
            });
            if (activeChapterTask) return true;
            if (window.ZHIYU_NATURALIZE_HAS_ACTIVE_TASK?.()) return true;
            return Array.from(document.querySelectorAll('[data-generating="true"], .generating, .is-generating, #fullAnalysisTaskbar'))
                .some(function(element) { return isVisible(element); });
        }

        function snapshotTutorialState() {
            const appState = getAppState();
            const outline = appState.outline || (appState.outline = {});
            const outlineGen = appState.outlineGen || (appState.outlineGen = {});
            const gen = appState.gen || (appState.gen = {});
            return {
                chapterBook: appState.chapter?.book || '',
                chapterVi: Number(appState.chapter?.vi ?? -1),
                chapterCi: Number(appState.chapter?.ci ?? -1),
                uiTab: appState.ui?.tab || 'works',
                refFileType: appState.ui?.refFileType,
                refFilesCollapsed: appState.ui?.refFilesCollapsed,
                refUiTransientPreferences: appState.ui?.refUiTransientPreferences
                    ? { ...appState.ui.refUiTransientPreferences }
                    : null,
                outlineEntries: Object.keys(outline).map(key => [key, outline[key]]),
                outlineGenEntries: Object.keys(outlineGen).map(key => [key, outlineGen[key]]),
                genEntries: Object.keys(gen).map(key => [key, gen[key]]),
                memoryEntries: Object.keys(appState.memory || {}).map(key => [key, appState.memory[key]]),
                importType: document.querySelector('input[name="importType"]:checked')?.value || 'novel',
                fullAnalysisTaskbarStyle: document.getElementById('fullAnalysisTaskbar')?.getAttribute('style') ?? null,
                selectedMemoryFiles: Array.from(document.querySelectorAll('#memTree .tree-checkbox:checked'))
                    .map(checkbox => [checkbox.dataset.folder || '', checkbox.dataset.idx || '']),
                activePages: Array.from(document.querySelectorAll('.page.active')).map(element => element.id),
                activeNavPages: Array.from(document.querySelectorAll('#sideNav .nav-item.active')).map(element => element.dataset.page),
                catalogClassName: document.getElementById('writeCatalog')?.className || '',
                bookNameText: document.getElementById('currentWritingBookName')?.textContent || '',
                resultText: document.getElementById('outlineResultBox')?.textContent || '',
                resultStyle: document.getElementById('outlineResultBox')?.getAttribute('style'),
                modelText: document.getElementById('btnOutlineModelSelect')?.textContent || '',
                templateLabel: document.getElementById('outlineTemplateLabel')?.textContent || '',
                templateValue: document.getElementById('outlineSelectedTemplate')?.textContent || '',
                templateValueTitle: document.getElementById('outlineSelectedTemplate')?.getAttribute('title'),
                templateSelected: document.getElementById('outlineTemplateOption')?.classList.contains('is-selected') || false,
                templateAvatarNodes: Array.from(document.getElementById('outlineTemplateAvatar')?.childNodes || [])
                    .map(node => node.cloneNode(true)),
                coreSummary: document.getElementById('outlineCoreSummary')?.value || '',
                wordCount: document.querySelector('#outlineModal .wordcount-option.selected')?.dataset.wc || 'short',
                generationModeActive: Array.from(document.querySelectorAll('#outlineGenerationModeToggle [data-outline-generation-mode].active'))
                    .map(element => element.dataset.outlineGenerationMode),
                createBookFields: ['createBookName', 'createBookSynopsis', 'createBookSynopsisRequirement', 'createBookSynopsisPreviewText']
                    .map(id => [id, document.getElementById(id)?.value || '']),
                createBookDownloadHidden: document.getElementById('btnDownloadBookCover')?.hidden ?? true,
                activeActionTab: document.querySelector('.action-tab-btn.active')?.dataset.tab || 'fineOutline',
                fineOutlineHtml: document.getElementById('ogContentBox')?.innerHTML || '',
                fineDescription: document.getElementById('ogDescInput')?.value || '',
                fineTemplateText: document.getElementById('btnOGTemplate')?.textContent || '',
                actionModelText: document.getElementById('btnActionModelSelect')?.textContent || '',
                chapterResultHtml: document.getElementById('resultBox')?.innerHTML || '',
                chapterResultStyle: document.getElementById('resultBox')?.getAttribute('style'),
                chapterDescription: document.getElementById('plotInput')?.value || '',
                chapterTargetWords: document.getElementById('chapterTargetWordsInput')?.value || '',
                chapterModelText: document.getElementById('btnModelSelect')?.textContent || '',
                chapterTemplateText: document.getElementById('composerTemplateName')?.textContent || '',
                editingChapterText: document.getElementById('editingChapterName')?.textContent || '',
                historyButtonHidden: document.getElementById('btnHistoryVersions')?.style.display === 'none',
                memoryUi: ['memMain', 'memSub', 'btnMemBatchManageSub', 'btnMemBatchDelete', 'btnMemBatchMove', 'btnMemBatchTag', 'memBatchActions']
                    .map(id => {
                        const element = document.getElementById(id);
                        return [id, element?.getAttribute('style') ?? null, element?.textContent ?? ''];
                    }),
                memTitleText: document.getElementById('memTitle')?.textContent || '',
                memTreeClassName: document.getElementById('memTree')?.className || '',
                startButton: snapshotButton(document.getElementById('btnStartOutline')),
                templateApplyButton: snapshotButton(document.getElementById('btnApplyTemplate')),
                synopsisGenerateButton: snapshotButton(document.getElementById('btnGenerateBookSynopsis')),
                createBookButton: snapshotButton(document.getElementById('btnConfirmCreateBook')),
                chapterGenerateButton: snapshotButton(document.getElementById('btnComposerGenerate')),
                chapterConfirmButton: snapshotButton(document.getElementById('btnConfirm')),
                chapterSaveButton: snapshotButton(document.getElementById('btnSaveNewChapter')),
                chapterStopButton: snapshotButton(document.getElementById('btnStop')),
                tutorialElementStates: snapshotTutorialElements()
            };
        }

        function snapshotTutorialElements() {
            const ids = [
                'apContentBox', 'naturalizeChapterLabel', 'naturalizeWordCount', 'naturalizeReplaceStatus',
                'naturalizeTaskStatus', 'naturalizeServerStatus', 'btnNaturalize', 'btnNaturalizeLevel', 'btnAPSave',
                'polishInstruction', 'polishSelectedText', 'polishWordCount', 'rwPlotDescription', 'rwTargetWords',
                'rwLinkedFileCount', 'rwRefPrevChapter', 'btnStartPolish', 'btnRWStart', 'btnRegen', 'btnRetry',
                'btnRetryAdvancedSegment', 'btnCompleteAdvancedSegment', 'outlineAdvancedMasterToggle', 'outlineAdvancedStagesToggle',
                'ogStopBtn', 'dcStopBtn', 'apStopBtn', 'btnOGSend', 'btnDCTemplate', 'btnActionModelSelect',
                'importParseTitle', 'importParseInfo', 'importChapterList', 'importBookName', 'importAnalysisEstimate',
                'btnImportSelectAll', 'btnImportSmartSort', 'btnImportKeepOrder', 'fullAnalysisNormalModel',
                'btnFullAnalysisNormalModel', 'fullAnalysisNormalModelIcon', 'fullAnalysisNormalModelLabel',
                'fullAnalysisNormalModelMenu', 'fullAnalysisModeSelect', 'fullAnalysisModeDescription',
                'fullAnalysisScopeSelect', 'fullAnalysisScopeSummary', 'fullAnalysisChapterRange', 'fullAnalysisVolumeRange',
                'fullAnalysisProgressText', 'fullAnalysisUsage', 'fullAnalysisProgressBar', 'fullAnalysisLog',
                'fullAnalysisReviewSection', 'fullAnalysisReviewSummary', 'fullAnalysisReviewItems',
                'fullAnalysisSaveSection', 'fullAnalysisNewBookSummary', 'fullAnalysisNewBookName',
                'btnFullAnalysisBack', 'btnFullAnalysisSkipSegment', 'btnFullAnalysisMinimize',
                'btnFullAnalysisCancel', 'btnFullAnalysisStopNow', 'btnFullAnalysisStart',
                'btnFullAnalysisContinue', 'btnFullAnalysisRestart', 'btnFullAnalysisDoneClose',
                'btnFullAnalysisSave', 'fullAnalysisDangerZone', 'btnFullAnalysisDelete',
                'edTitle', 'edText', 'edPreview', 'edSave', 'createBookCoverPreview', 'createBookCoverEmpty'
            ];
            return ids.map(id => {
                const element = document.getElementById(id);
                if (!element) return null;
                return {
                    id,
                    className: element.className,
                    style: element.getAttribute('style'),
                    hidden: element.hidden,
                    disabled: 'disabled' in element ? element.disabled : null,
                    value: 'value' in element ? element.value : null,
                    src: element.getAttribute('src'),
                    html: element.innerHTML,
                    ariaExpanded: element.getAttribute('aria-expanded'),
                    contentEditable: element.getAttribute('contenteditable')
                };
            }).filter(Boolean);
        }

        function restoreTutorialElements(states) {
            (states || []).forEach(state => {
                const element = document.getElementById(state.id);
                if (!element) return;
                element.className = state.className;
                if (state.style === null) element.removeAttribute('style');
                else element.setAttribute('style', state.style);
                element.hidden = state.hidden;
                if (state.disabled !== null && 'disabled' in element) element.disabled = state.disabled;
                if (state.value !== null && 'value' in element) element.value = state.value;
                if (state.src === null) element.removeAttribute('src');
                else element.setAttribute('src', state.src);
                element.innerHTML = state.html;
                if (state.ariaExpanded === null) element.removeAttribute('aria-expanded');
                else element.setAttribute('aria-expanded', state.ariaExpanded);
                if (state.contentEditable === null) element.removeAttribute('contenteditable');
                else element.setAttribute('contenteditable', state.contentEditable);
            });
        }

        function snapshotButton(button) {
            if (!button) return null;
            return {
                disabled: button.disabled,
                text: button.textContent,
                style: button.getAttribute('style'),
                generating: button.hasAttribute('data-generating') ? button.dataset.generating : null
            };
        }

        function restoreButton(button, snapshot) {
            if (!button || !snapshot) return;
            button.disabled = snapshot.disabled;
            button.textContent = snapshot.text;
            if (snapshot.style === null) button.removeAttribute('style');
            else button.setAttribute('style', snapshot.style);
            if (snapshot.generating === null) delete button.dataset.generating;
            else button.dataset.generating = snapshot.generating;
        }



        function restoreTutorialState() {
            const snapshot = runtime.snapshot;
            if (!snapshot) return;
            const appState = getAppState();
            if (!appState.chapter) appState.chapter = {};
            appState.chapter.book = snapshot.chapterBook;
            appState.chapter.vi = snapshot.chapterVi;
            appState.chapter.ci = snapshot.chapterCi;
            if (!appState.ui) appState.ui = {};
            appState.ui.tab = snapshot.uiTab;
            if (snapshot.refFileType === undefined) delete appState.ui.refFileType;
            else appState.ui.refFileType = snapshot.refFileType;
            if (snapshot.refFilesCollapsed === undefined) delete appState.ui.refFilesCollapsed;
            else appState.ui.refFilesCollapsed = snapshot.refFilesCollapsed;
            if (snapshot.refUiTransientPreferences === null) delete appState.ui.refUiTransientPreferences;
            else appState.ui.refUiTransientPreferences = { ...snapshot.refUiTransientPreferences };
            if (!appState.outline) appState.outline = {};
            Object.keys(appState.outline).forEach(key => delete appState.outline[key]);
            snapshot.outlineEntries.forEach(entry => { appState.outline[entry[0]] = entry[1]; });
            if (!appState.outlineGen) appState.outlineGen = {};
            Object.keys(appState.outlineGen).forEach(key => delete appState.outlineGen[key]);
            snapshot.outlineGenEntries?.forEach(entry => { appState.outlineGen[entry[0]] = entry[1]; });
            if (!appState.gen) appState.gen = {};
            Object.keys(appState.gen).forEach(key => delete appState.gen[key]);
            snapshot.genEntries?.forEach(entry => { appState.gen[entry[0]] = entry[1]; });
            if (!appState.memory) appState.memory = {};
            Object.keys(appState.memory).forEach(key => delete appState.memory[key]);
            snapshot.memoryEntries.forEach(entry => { appState.memory[entry[0]] = entry[1]; });
            const importType = document.querySelector('input[name="importType"][value="' + snapshot.importType + '"]');
            if (importType) importType.checked = true;
            const taskbar = document.getElementById('fullAnalysisTaskbar');
            if (taskbar) {
                if (snapshot.fullAnalysisTaskbarStyle === null) taskbar.removeAttribute('style');
                else taskbar.setAttribute('style', snapshot.fullAnalysisTaskbarStyle);
            }
            window.renderOutlineMode?.();
            document.querySelectorAll('.page').forEach(page => page.classList.toggle('active', snapshot.activePages.includes(page.id)));
            document.querySelectorAll('#sideNav .nav-item').forEach(item => item.classList.toggle('active', snapshot.activeNavPages.includes(item.dataset.page)));
            const catalog = document.getElementById('writeCatalog');
            if (catalog) catalog.className = snapshot.catalogClassName;
            const currentBook = document.getElementById('currentWritingBookName');
            if (currentBook) currentBook.textContent = snapshot.bookNameText;
            const result = document.getElementById('outlineResultBox');
            if (result) {
                result.textContent = snapshot.resultText;
                if (snapshot.resultStyle === null) result.removeAttribute('style');
                else result.setAttribute('style', snapshot.resultStyle);
            }
            const model = document.getElementById('btnOutlineModelSelect');
            if (model) model.textContent = snapshot.modelText;
            const templateLabel = document.getElementById('outlineTemplateLabel');
            const templateValue = document.getElementById('outlineSelectedTemplate');
            const templateOption = document.getElementById('outlineTemplateOption');
            const templateAvatar = document.getElementById('outlineTemplateAvatar');
            if (templateLabel) templateLabel.textContent = snapshot.templateLabel;
            if (templateValue) {
                templateValue.textContent = snapshot.templateValue;
                if (snapshot.templateValueTitle === null) templateValue.removeAttribute('title');
                else templateValue.setAttribute('title', snapshot.templateValueTitle);
            }
            templateOption?.classList.toggle('is-selected', snapshot.templateSelected);
            if (templateAvatar) {
                templateAvatar.replaceChildren(...snapshot.templateAvatarNodes.map(node => node.cloneNode(true)));
            }
            const summary = document.getElementById('outlineCoreSummary');
            if (summary) summary.value = snapshot.coreSummary;
            document.querySelectorAll('#outlineModal .wordcount-option').forEach(option => option.classList.toggle('selected', option.dataset.wc === snapshot.wordCount));
            document.querySelectorAll('#outlineGenerationModeToggle [data-outline-generation-mode]').forEach(option => {
                option.classList.toggle('active', snapshot.generationModeActive.includes(option.dataset.outlineGenerationMode));
            });
            snapshot.createBookFields?.forEach(entry => {
                const element = document.getElementById(entry[0]);
                if (element) element.value = entry[1];
            });
            const coverDownload = document.getElementById('btnDownloadBookCover');
            if (coverDownload) {
                coverDownload.hidden = snapshot.createBookDownloadHidden;
                coverDownload.disabled = false;
            }
            selectTutorialActionTab(snapshot.activeActionTab || 'fineOutline');
            const fineResult = document.getElementById('ogContentBox');
            if (fineResult) fineResult.innerHTML = snapshot.fineOutlineHtml;
            const fineDescription = document.getElementById('ogDescInput');
            if (fineDescription) fineDescription.value = snapshot.fineDescription;
            const fineTemplate = document.getElementById('btnOGTemplate');
            if (fineTemplate) fineTemplate.textContent = snapshot.fineTemplateText;
            const actionModel = document.getElementById('btnActionModelSelect');
            if (actionModel) actionModel.textContent = snapshot.actionModelText;
            const chapterResult = document.getElementById('resultBox');
            if (chapterResult) {
                chapterResult.innerHTML = snapshot.chapterResultHtml;
                if (snapshot.chapterResultStyle === null) chapterResult.removeAttribute('style');
                else chapterResult.setAttribute('style', snapshot.chapterResultStyle);
            }
            const chapterDescription = document.getElementById('plotInput');
            if (chapterDescription) chapterDescription.value = snapshot.chapterDescription;
            const chapterTargetWords = document.getElementById('chapterTargetWordsInput');
            if (chapterTargetWords) chapterTargetWords.value = snapshot.chapterTargetWords;
            const chapterModel = document.getElementById('btnModelSelect');
            if (chapterModel) chapterModel.textContent = snapshot.chapterModelText;
            const chapterTemplate = document.getElementById('composerTemplateName');
            if (chapterTemplate) chapterTemplate.textContent = snapshot.chapterTemplateText;
            const editingChapter = document.getElementById('editingChapterName');
            if (editingChapter) editingChapter.textContent = snapshot.editingChapterText;
            const historyButton = document.getElementById('btnHistoryVersions');
            if (historyButton) historyButton.style.display = snapshot.historyButtonHidden ? 'none' : '';
            restoreButton(document.getElementById('btnStartOutline'), snapshot.startButton);
            restoreButton(document.getElementById('btnApplyTemplate'), snapshot.templateApplyButton);
            restoreButton(document.getElementById('btnGenerateBookSynopsis'), snapshot.synopsisGenerateButton);
            restoreButton(document.getElementById('btnConfirmCreateBook'), snapshot.createBookButton);
            restoreButton(document.getElementById('btnComposerGenerate'), snapshot.chapterGenerateButton);
            restoreButton(document.getElementById('btnConfirm'), snapshot.chapterConfirmButton);
            restoreButton(document.getElementById('btnSaveNewChapter'), snapshot.chapterSaveButton);
            restoreButton(document.getElementById('btnStop'), snapshot.chapterStopButton);
            window.renderOutlineGenreTags?.();
            window.renderSummaryPreferenceChips?.();
            window.refreshTree?.();
            window.updateChapterComposerState?.();
            restoreTutorialElements(snapshot.tutorialElementStates);
            window.refreshOverview?.();
            document.body.classList.remove('zhiyu-outline-tutorial-active');
        }

        async function previousStep() {
            if (!runtime.active || runtime.replaying || runtime.transitioning || runtime.index <= 0) return;
            const targetIndex = runtime.index - 1;
            const previousButton = runtime.root?.querySelector('.outline-tutorial-previous');
            if (previousButton) previousButton.disabled = true;
            window.clearTimeout(runtime.streamTimer);
            window.clearTimeout(runtime.targetWaitTimer);
            window.clearTimeout(runtime.targetOpenTimer);
            runtime.replaying = true;
            runtime.fastForward = true;
            try {
                modalIds.forEach(closeModal);
                prepareStage(runtime.stageId);
                for (let index = 0; index < targetIndex; index += 1) {
                    const step = runtime.steps[index];
                    runtime.index = index;
                    step?.prepare?.();
                    if (step?.type === 'wait') await Promise.resolve(step.run?.());
                    else if (typeof step?.skip === 'function') step.skip();
                    else applySafeSkip(step?.id);
                    step?.after?.();
                    await Promise.resolve();
                }
                runtime.index = targetIndex;
            } catch (error) {
                console.error('[OperationTutorial] 上一步回放失败', error);
                window.ZHIYU_TOAST?.error?.('上一步恢复失败，请重新开始本阶段');
            } finally {
                runtime.replaying = false;
                runtime.fastForward = false;
            }
            showStep();
        }



        return Object.freeze({
            snapshotTutorialState, snapshotTutorialElements, restoreTutorialElements,
            snapshotButton, restoreButton, restoreTutorialState,
            installTutorialFetchGuard, restoreTutorialFetchGuard, hasActiveFormalGeneration, previousStep,
            createDemoBookPreview, createDemoMemoryBooks, generateTutorialCover
        });
    }

    window.ZHIYU_OPERATION_TUTORIAL_STATE_PACK = Object.freeze({ createRuntime });
})(window, document);
