(function(window, document) {
    'use strict';

    const TUTORIAL_ID = 'outline';
    const TUTORIAL_MENU_ID = 'menu';
    const DEMO_BOOK_NAME = '雾城夜巡';
    const DEMO_BOOK_INPUT_NAME = '雾城夜巡';
    const DEMO_BOOK_COVER = './assets/tutorials/mist-city-night-patrol-cover.png';
    const DEMO_MODEL_NAME = 'DeepSeek V4 Flash';
    const DEMO_TEMPLATE_NAME = '知屿·长篇小说大纲';
    const DEMO_MEMORY_FOLDER_NAME = '关联文件夹';
    const NEW_HOMEPAGE_PATH = '/';
    const REQUESTED_TUTORIAL = new URLSearchParams(window.location.search).get('tutorial') || '';
    const TARGET_PADDING = 7;
    const TARGET_WAIT_MS = 5000;
    const FOCUS_CONTAINER_SELECTOR = '.outline-genre-popup, .template-tag-picker-dialog, .feedback-dialog, .model-picker-box, .ref-files-settings-panel, .modal-box';
    const TUTORIAL_MAINLINE_STAGE_PACK = window.ZHIYU_OPERATION_TUTORIAL_MAINLINE_PACK;
    const TUTORIAL_EXTRA_STAGE_PACK = window.ZHIYU_OPERATION_TUTORIAL_EXTRA_PACK;
    const TUTORIAL_STATE_PACK = window.ZHIYU_OPERATION_TUTORIAL_STATE_PACK;
    const TUTORIAL_MENU_PACK = window.ZHIYU_OPERATION_TUTORIAL_MENU_PACK;
    const TUTORIAL_POSITIONING = window.ZHIYU_OUTLINE_TUTORIAL_POSITIONING;
    if (!TUTORIAL_MAINLINE_STAGE_PACK || !TUTORIAL_EXTRA_STAGE_PACK || !TUTORIAL_STATE_PACK || !TUTORIAL_MENU_PACK || !TUTORIAL_POSITIONING) throw new Error('操作引导教程阶段包未加载');
    const { stageCatalog: STAGE_CATALOG, mainlineStageIds: MAINLINE_STAGE_IDS, implementedStageIds, interceptedActions: INTERCEPTED_ACTIONS, modalIds: TUTORIAL_MODAL_IDS } = TUTORIAL_MENU_PACK.meta;
    const IMPLEMENTED_STAGE_IDS = new Set(implementedStageIds);
    const REQUESTED_FROM_HOMEPAGE = REQUESTED_TUTORIAL === TUTORIAL_MENU_ID || STAGE_CATALOG.some(stage => stage.id === REQUESTED_TUTORIAL);
    const { DEMO_SYNOPSIS_REQUIREMENT, DEMO_SYNOPSIS, DEMO_FINE_REQUIREMENT, DEMO_FINE_SOURCE, DEMO_FINE_OUTLINE, DEMO_CHAPTER_REQUIREMENT, OFFICIAL_TEMPLATE_SNAPSHOTS, DEMO_CHAPTER, DEMO_NATURALIZED_CHAPTER, DEMO_LOCAL_SELECTION, DEMO_LOCAL_POLISH_INSTRUCTION, DEMO_LOCAL_POLISHED, DEMO_REWRITE_REQUIREMENT, DEMO_REWRITTEN_CHAPTER, DEMO_ADVANCED_OUTLINE, DEMO_STAGE_OUTLINE, DEMO_FUNCTIONAL_DIRECTION, DEMO_FUNCTIONAL_CONTENT, DEMO_DECOMPOSE_CONTENT, DEMO_FULL_ANALYSIS_SOURCE_NAME, DEMO_FULL_ANALYSIS_RESULT_NAME, DEMO_FULL_ANALYSIS_MODEL_ROUTE, DEMO_FULL_ANALYSIS_CHAPTERS, DEMO_OUTLINE, DEMO_FULL_ANALYSIS_FILES } = TUTORIAL_MAINLINE_STAGE_PACK.content;
    const runtime = {
        active: false,
        index: 0,
        steps: [],
        target: null,
        actionTarget: null,
        snapshot: null,
        root: null,
        streamPromise: null,
        streamTimer: 0,
        fastForward: false,
        replaying: false,
        transitioning: false,
        frame: 0,
        targetWaitTimer: 0,
        targetOpenTimer: 0,
        fetchGuardOriginal: null,
        fetchGuard: null,
        closing: false,
        lastRectKey: '',
        modelSelected: false,
        autoStarted: false,
        returnToHomepageOnExit: false,
        stageId: '',
        stageTitle: '',
        flowMode: 'individual',
        menuRoot: null,
        modelScope: 'outline',
        selectedText: '',
        localOriginalText: '',
        pendingDemoConfirm: null
    };

    let tutorialMainlineBuilders = null;
    let tutorialExtraRuntime = null;

    function getTutorialStageApi() {
        return {
            runtime, DEMO_BOOK_NAME, DEMO_BOOK_INPUT_NAME, DEMO_MODEL_NAME,
            DEMO_TEMPLATE_NAME, DEMO_MEMORY_FOLDER_NAME,
            getAppState,
            getModal,
            openModal,
            closeModal,
            isVisible,
            findTextButton,
            resolveTarget,
            resolveSpotlightTarget,
            createButton,
            getStageMeta,
            getNextMainlineStageId,
            createTutorialMenu,
            openTutorialMenu,
            closeTutorialMenu,
            createLayer,
            snapshotTutorialState,
            snapshotTutorialElements,
            restoreTutorialElements,
            snapshotButton,
            restoreButton,
            prepareDemoState,
            prepareNewBookState,
            continueDemoBookWriting,
            selectTutorialActionTab,
            prepareFineOutlineState,
            toTutorialEditorHtml,
            createDemoBookPreview,
            prepareChapterState,
            prepareContentStageState,
            prepareOutlineExtensionState,
            prepareDecomposeStageState,
            prepareFullAnalysisStageState,
            prepareDecomposeSettingsState,
            hideTutorialBookPreview,
            prepareStage,
            setInputValue,
            showTutorialCoverDownloadButton,
            restoreTutorialCoverDownloadButton,
            generateTutorialCover,
            startDemoSynopsisStream,
            completeDemoBookCreation,
            createDemoMemoryBooks,
            showTutorialMemoryPreview,
            showTutorialAdvancedMemoryPreview,
            showTutorialDecomposeMemoryPreview,
            showTutorialFullAnalysisMemoryPreview,
            hideTutorialMemoryPreview,
            showTutorialPage,
            ensureTutorialPageVisible,
            restoreTutorialState,
            openOutlineForTutorial,
            selectTutorialNormalMode,
            selectTutorialAdvancedMode,
            selectTutorialFunctionMode,
            selectTutorialFunctionType,
            selectTutorialDirectMode,
            toggleTutorialGenre,
            getTutorialTemplate,
            findTutorialTemplateCard,
            openTutorialTemplateSelector,
            applyTutorialTemplate,
            findOutlineFileCard,
            openTutorialAdvancedSourceFiles,
            resetTutorialStageSelection,
            openTutorialAdvancedLinks,
            openTutorialFunctionalLinks,
            showAdvancedTutorialRecoveryButtons,
            openTutorialModelModal,
            selectTutorialModel,
            applyTutorialModel,
            startDemoStream,
            startDemoFineOutlineStream,
            saveDemoFineOutline,
            openTutorialChapterMemorySelector,
            openTutorialDecomposeSettingsChapterLinks,
            openTutorialReferenceSelector,
            enableTutorialChapterGenerate,
            startDemoChapterStream,
            confirmDemoChapter,
            saveDemoChapter,
            normalizeTutorialText,
            streamTutorialText,
            startDemoAdvancedOutlineStream,
            saveDemoAdvancedOutline,
            startDemoStageOutlineStream,
            saveDemoStageOutline,
            startDemoFunctionalStream,
            saveDemoFunctionalContent,
            prepareDecomposeWorksChoice,
            startDemoDecomposeStream,
            saveDemoDecompose,
            returnToDemoDecomposePanel,
            openDecomposeInfoModal,
            closeDecomposeInfoModal,
            showDemoDecomposeStopButton,
            getTutorialFullAnalysisChapters,
            setTutorialFullAnalysisButton,
            appendTutorialFullAnalysisLog,
            renderDemoFullAnalysisCompletePanel,
            startDemoFullAnalysis,
            saveDemoFullAnalysis,
            returnToDemoFullAnalysisPanel,
            showDemoFullAnalysisSupplementControls,
            showTutorialDecomposeSettingsMemoryPreview,
            findMemoryFileCard,
            openTutorialDecomposeSettingsEditor,
            returnToTutorialFineOutlineForSettings,
            closeTutorialDecomposeSettingsEditorForReturn,
            openTutorialDecomposeSettingsLinks,
            ensureTutorialDecomposeSettingsLinkedStack,
            openTutorialDecomposeSettingsRoleList,
            closeTutorialDecomposeSettingsRoleList,
            prepareDemoNaturalizePanel,
            configureDemoNaturalizePanel,
            selectTutorialNaturalizeLevel,
            startDemoNaturalizeStream,
            openDemoNaturalizeConfirm,
            applyDemoNaturalizedChapter,
            openTutorialPolishModal,
            startDemoLocalPolish,
            confirmDemoLocalPolish,
            openTutorialRewriteModal,
            openTutorialRewriteMemorySelector,
            startDemoLocalRewrite,
            confirmDemoLocalRewrite,
            showTutorialHistoryButton,
            restoreTutorialHistoryButton,
            saveDemoOutline,
            updateLayerPosition,
            positionLoop,
            waitForTarget,
            advanceStep,
            skipStep,
            handleDocumentClick,
            handleDocumentInput,
            handleDocumentChange,
            handleDocumentSelection,
            showWrongTargetFeedback,
            showRecoverableTargetError,
            skipCurrentStage,
            finishStage,
            returnToTutorialMenu,
            stopTutorial,
            startStage,
            startTutorial,
            createEntryButton,
            installTutorialEntries,
        };
    }

    let tutorialStateRuntime = null;

    function getTutorialStateRuntime() {
        if (!tutorialStateRuntime) {
            tutorialStateRuntime = TUTORIAL_STATE_PACK.createRuntime({
                runtime, getAppState, selectTutorialActionTab, isVisible, closeModal, prepareStage, applySafeSkip, showStep,
                modalIds: TUTORIAL_MODAL_IDS, demoBookName: DEMO_BOOK_NAME, demoMemoryFolderName: DEMO_MEMORY_FOLDER_NAME,
                demoBookCover: DEMO_BOOK_COVER, demoSynopsis: DEMO_SYNOPSIS, demoChapter: DEMO_CHAPTER,
                demoFineSource: DEMO_FINE_SOURCE, demoStageOutline: DEMO_STAGE_OUTLINE, demoAdvancedOutline: DEMO_ADVANCED_OUTLINE,
                demoDecomposeContent: DEMO_DECOMPOSE_CONTENT, demoFullAnalysisFiles: DEMO_FULL_ANALYSIS_FILES, toTutorialEditorHtml
            });
        }
        return tutorialStateRuntime;
    }

    function snapshotTutorialState() { return getTutorialStateRuntime().snapshotTutorialState(); }
    function snapshotTutorialElements() { return getTutorialStateRuntime().snapshotTutorialElements(); }
    function restoreTutorialElements(states) { return getTutorialStateRuntime().restoreTutorialElements(states); }
    function snapshotButton(button) { return getTutorialStateRuntime().snapshotButton(button); }
    function restoreButton(button, snapshot) { return getTutorialStateRuntime().restoreButton(button, snapshot); }
    function restoreTutorialState() { return getTutorialStateRuntime().restoreTutorialState(); }
    function installTutorialFetchGuard() { return getTutorialStateRuntime().installTutorialFetchGuard(); }
    function restoreTutorialFetchGuard() { return getTutorialStateRuntime().restoreTutorialFetchGuard(); }
    function hasActiveFormalGeneration() { return getTutorialStateRuntime().hasActiveFormalGeneration(); }
    function previousStep() { return getTutorialStateRuntime().previousStep(); }
    function getTutorialMainlineBuilders() {
        if (!tutorialMainlineBuilders) {
            tutorialMainlineBuilders = TUTORIAL_MAINLINE_STAGE_PACK.createBuilders(getTutorialStageApi());
        }
        return tutorialMainlineBuilders;
    }

    function getTutorialExtraRuntime() {
        if (!tutorialExtraRuntime) {
            const api = getTutorialStageApi();
            api.findMemoryLinkCard = getTutorialMainlineBuilders().findMemoryLinkCard;
            api.createMemoryLinkSelectionStep = getTutorialMainlineBuilders().createMemoryLinkSelectionStep;
            tutorialExtraRuntime = TUTORIAL_EXTRA_STAGE_PACK.createRuntime(api);
        }
        return tutorialExtraRuntime;
    }

    function applySafeSkip(id) {
        return getTutorialExtraRuntime().applySafeSkip(id);
    }

    function getStageCompletionCopy(stageId) {
        return getTutorialExtraRuntime().getStageCompletionCopy(stageId);
    }
    if (REQUESTED_FROM_HOMEPAGE && document.body) {
        document.body.classList.add('zhiyu-outline-tutorial-active');
    }

    function getAppState() {
        return window.ZHIYU_APP_STATE || window.AppState || {};
    }

    function getModal() {
        return window.ZHIYU_MODAL || window.Modal || null;
    }

    function openModal(id) {
        const modal = document.getElementById(id);
        if (!modal) return;
        if (typeof getModal()?.open === 'function') getModal().open(id);
        else modal.style.display = 'flex';
    }

    function closeModal(id) {
        const modal = document.getElementById(id);
        if (!modal) return;
        if (typeof getModal()?.close === 'function') getModal().close(id);
        else modal.style.display = 'none';
    }

    function isVisible(element) {
        if (!element || !element.isConnected) return false;
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    }

    function findTextButton(rootSelector, text) {
        const root = document.querySelector(rootSelector);
        if (!root) return null;
        return Array.from(root.querySelectorAll('button, [role="button"], .wordcount-option'))
            .find(element => element.textContent.trim() === text && isVisible(element)) || null;
    }

    function resolveTarget(step) {
        const candidate = typeof step.target === 'function'
            ? step.target()
            : document.querySelector(step.target || '');
        return isVisible(candidate) ? candidate : null;
    }

    function resolveSpotlightTarget(step, actionTarget) {
        return TUTORIAL_POSITIONING.resolveSpotlightTarget(step, actionTarget, isVisible, FOCUS_CONTAINER_SELECTOR);
    }

    function clearActionHighlight() {
        TUTORIAL_POSITIONING.clearActionHighlight(runtime);
    }

    function setActionHighlight(target, step) {
        TUTORIAL_POSITIONING.setActionHighlight(runtime, target, step);
    }

    function createButton(className, label, action) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = className;
        button.textContent = label;
        button.addEventListener('click', action);
        return button;
    }

    function getStageMeta(stageId) {
        return STAGE_CATALOG.find(stage => stage.id === stageId) || null;
    }

    function getNextMainlineStageId(stageId) {
        const index = MAINLINE_STAGE_IDS.indexOf(stageId);
        return index >= 0 ? (MAINLINE_STAGE_IDS[index + 1] || '') : '';
    }

    let tutorialMenuRuntime = null;

    function getTutorialMenuRuntime() {
        if (!tutorialMenuRuntime) {
            tutorialMenuRuntime = TUTORIAL_MENU_PACK.createRuntime({
                runtime, STAGE_CATALOG, IMPLEMENTED_STAGE_IDS, MAINLINE_STAGE_IDS,
                NEW_HOMEPAGE_PATH, startStage
            });
        }
        return tutorialMenuRuntime;
    }

    function createTutorialMenu() { return getTutorialMenuRuntime().createTutorialMenu(); }
    function openTutorialMenu(options) { return getTutorialMenuRuntime().openTutorialMenu(options); }
    function closeTutorialMenu(options) { return getTutorialMenuRuntime().closeTutorialMenu(options); }

    function createLayer() {
        if (runtime.root?.isConnected) return runtime.root;
        const root = document.createElement('div');
        root.className = 'outline-tutorial-layer';
        root.setAttribute('aria-live', 'polite');
        root.innerHTML = [
            '<div class="outline-tutorial-mask outline-tutorial-mask-top"></div>',
            '<div class="outline-tutorial-mask outline-tutorial-mask-right"></div>',
            '<div class="outline-tutorial-mask outline-tutorial-mask-bottom"></div>',
            '<div class="outline-tutorial-mask outline-tutorial-mask-left"></div>',
            '<div class="outline-tutorial-spotlight" aria-hidden="true"></div>',
            '<div class="outline-tutorial-action-ring" aria-hidden="true" hidden></div>',
            '<div class="outline-tutorial-hole-blocker" aria-hidden="true"></div>',
            '<section class="outline-tutorial-note" role="dialog" aria-modal="false" aria-labelledby="outlineTutorialTitle">',
            '  <div class="outline-tutorial-note-head">',
            '    <span class="outline-tutorial-progress"></span>',
            '    <button class="outline-tutorial-close" type="button" aria-label="关闭教程">×</button>',
            '  </div>',
            '  <h3 id="outlineTutorialTitle"></h3>',
            '  <p class="outline-tutorial-copy"></p>',
            '  <p class="outline-tutorial-hint"></p>',
            '  <div class="outline-tutorial-note-actions">',
            '    <button class="outline-tutorial-secondary outline-tutorial-previous" type="button">上一步</button>',
            '    <button class="outline-tutorial-skip-step" type="button">跳过本步</button>',
            '    <button class="outline-tutorial-skip-stage" type="button">跳过本阶段</button>',
            '    <button class="outline-tutorial-next" type="button">知道了，下一项</button>',
            '  </div>',
            '</section>'
        ].join('');
        document.body.appendChild(root);
        root.querySelector('.outline-tutorial-close').addEventListener('click', stopTutorial);
        root.querySelector('.outline-tutorial-previous').addEventListener('click', previousStep);
        root.querySelector('.outline-tutorial-skip-step').addEventListener('click', skipStep);
        root.querySelector('.outline-tutorial-skip-stage').addEventListener('click', skipCurrentStage);
        root.querySelector('.outline-tutorial-next').addEventListener('click', advanceStep);
        root.querySelectorAll('.outline-tutorial-mask').forEach(mask => mask.addEventListener('click', showWrongTargetFeedback));
        runtime.root = root;
        return root;
    }

    function prepareDemoState() {
        const appState = getAppState();
        if (!appState.chapter) appState.chapter = {};
        if (!appState.outline) appState.outline = {};
        appState.chapter.book = DEMO_BOOK_NAME;
        Object.assign(appState.outline, {
            mode: 'outline', outlineSubMode: 'normal', genres: [], coreSummary: '', content: '',
            genrePreferenceTags: { normal: [] }, genrePreferenceAppliedGenres: { normal: [] },
            generationMode: 'direct', generationRuntime: null, templateId: '', templateIds: {}
        });
        window.ZHIYU_BOOK_PREVIEW_CONTEXT = { active: true, books: createDemoBookPreview() };
        if (runtime.flowMode === 'mainline') {
            if (!appState.ui) appState.ui = {};
            appState.ui.tab = 'works';
            showTutorialPage('overview');
            window.refreshOverview?.();
        } else {
            ensureTutorialPageVisible();
        }
        const currentBook = document.getElementById('currentWritingBookName');
        if (currentBook) currentBook.textContent = DEMO_BOOK_NAME + '（不会保存）';
        const result = document.getElementById('outlineResultBox');
        if (result) {
            result.textContent = '点击「生成大纲」后，教程内容将在这里流式显示。';
            result.style.color = '';
            result.style.background = '';
        }
        document.getElementById('outlineCoreSummary') && (document.getElementById('outlineCoreSummary').value = '');
        document.querySelectorAll('#outlineModal .wordcount-option').forEach(option => option.classList.toggle('selected', option.dataset.wc === 'short'));
        window.renderOutlineGenreTags?.();
        window.renderSummaryPreferenceChips?.();
        window.renderOutlineTemplateSelection?.('outline');
    }

    function continueDemoBookWriting() {
        const appState = getAppState();
        if (!appState.chapter) appState.chapter = {};
        appState.chapter.book = DEMO_BOOK_NAME;
        appState.chapter.vi = -1;
        appState.chapter.ci = -1;
        ensureTutorialPageVisible();
        const selector = document.getElementById('bookSel');
        let option = selector?.querySelector('[data-tutorial-book-option]');
        if (selector && !option) {
            option = document.createElement('option');
            option.value = DEMO_BOOK_NAME;
            option.textContent = DEMO_BOOK_NAME;
            option.dataset.tutorialBookOption = '1';
            selector.appendChild(option);
        }
        if (selector) selector.value = DEMO_BOOK_NAME;
        const currentBook = document.getElementById('currentWritingBookName');
        if (currentBook) currentBook.textContent = DEMO_BOOK_NAME + '（不会保存）';
        window.refreshTree?.();
    }

    function prepareNewBookState() {
        document.body.classList.add('zhiyu-outline-tutorial-active');
        ['createBookModal', 'createBookSynopsisModal'].forEach(closeModal);
        delete window.ZHIYU_BOOK_PREVIEW_CONTEXT;
        showTutorialPage('overview');
        window.refreshOverview?.();
    }

    function selectTutorialActionTab(tabName) {
        const nextTab = ['fineOutline', 'decompose', 'aiPolish'].includes(tabName) ? tabName : 'fineOutline';
        const isFine = nextTab === 'fineOutline';
        const isDecompose = nextTab === 'decompose';
        const isPolish = nextTab === 'aiPolish';
        const appState = getAppState();
        if (!appState.outlineGen) appState.outlineGen = {};
        appState.outlineGen.activeTab = nextTab;
        document.querySelectorAll('.action-tab-btn[data-tab]').forEach(button => {
            button.classList.toggle('active', button.dataset.tab === nextTab);
        });
        const displays = {
            ogContentWrap: isFine ? '' : 'none',
            dcContentWrap: isDecompose ? '' : 'none',
            apContentWrap: isPolish ? '' : 'none',
            ogFileStacksRow: isFine ? 'flex' : 'none',
            dcFileStacksRow: isDecompose ? 'flex' : 'none',
            apFileStacksRow: isPolish ? 'flex' : 'none',
            ogDragDivider: isPolish ? 'none' : 'flex',
            ogInputArea: isPolish ? 'none' : 'flex',
            btnOGSend: isPolish ? 'none' : '',
            btnActionModelSelect: isPolish ? 'none' : ''
        };
        Object.entries(displays).forEach(entry => {
            const element = document.getElementById(entry[0]);
            if (element) element.style.display = entry[1];
        });
        const bottom = document.getElementById('actionBtnsBottom');
        if (bottom) bottom.style.display = 'none';
    }

    function prepareFineOutlineState() {
        const appState = getAppState();
        if (!appState.chapter) appState.chapter = {};
        if (!appState.outlineGen) appState.outlineGen = {};
        appState.chapter.book = DEMO_BOOK_NAME;
        Object.assign(appState.outlineGen, {
            activeTab: 'fineOutline', linkedFiles: [], linkedFilesByBook: {}, linkedMemoryDefaultsApplied: true,
            chapters: [], pendingChapters: [], linkedOutlineFiles: [], linkedOutlineFilesByBook: {},
            templateId: '', templateName: '', ogContent: ''
        });
        window.ZHIYU_MEMORY_PREVIEW_CONTEXT = { active: true, books: createDemoMemoryBooks({ fineSourceFiles: true }) };
        ensureTutorialPageVisible();
        selectTutorialActionTab('fineOutline');
        const currentBook = document.getElementById('currentWritingBookName');
        if (currentBook) currentBook.textContent = DEMO_BOOK_NAME + '（不会保存）';
        const result = document.getElementById('ogContentBox');
        if (result) result.textContent = '选择大纲和关联文件后，点击生成箭头查看教程细纲。';
        const description = document.getElementById('ogDescInput');
        if (description) description.value = '';
        const templateButton = document.getElementById('btnOGTemplate');
        if (templateButton) templateButton.textContent = '提示词模版';
        const modelButton = document.getElementById('btnActionModelSelect');
        if (modelButton) modelButton.textContent = '模型 ▼';
        window.refreshAllOGFileStacks?.();
    }

    function toTutorialEditorHtml(text) {
        if (typeof window.plainTextToEditorHTML === 'function') return window.plainTextToEditorHTML(text);
        return String(text || '').split(/\n{2,}/).map(paragraph => '<p>' + paragraph.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>').join('');
    }

    function createDemoBookPreview(options) { return getTutorialStateRuntime().createDemoBookPreview(options); }

    function prepareChapterState() {
        const appState = getAppState();
        if (!appState.chapter) appState.chapter = {};
        if (!appState.gen) appState.gen = {};
        appState.chapter.book = DEMO_BOOK_NAME;
        appState.chapter.vi = -1;
        appState.chapter.ci = -1;
        Object.assign(appState.gen, {
            templateId: '', linkedFiles: [], linkedMemoryBookName: DEMO_BOOK_NAME,
            linkedMemoryBookScopeKey: 'tutorial-demo-book', refChapters: [], refSummaries: [],
            refSummaryCandidates: [], keyEventSummaries: [], keyEventSummaryCandidates: [],
            plotInput: ''
        });
        const previewBooks = createDemoMemoryBooks({ includeAdvanced: true });
        previewBooks[DEMO_BOOK_NAME]['细纲文件'] = [{ name: '第1章细纲.md', content: DEMO_FINE_OUTLINE }];
        window.ZHIYU_MEMORY_PREVIEW_CONTEXT = { active: true, books: previewBooks };
        window.ZHIYU_BOOK_PREVIEW_CONTEXT = { active: true, books: createDemoBookPreview() };
        ensureTutorialPageVisible();
        const selector = document.getElementById('bookSel');
        if (selector && !selector.querySelector('[data-tutorial-book-option]')) {
            const option = document.createElement('option');
            option.value = DEMO_BOOK_NAME;
            option.textContent = DEMO_BOOK_NAME;
            option.dataset.tutorialBookOption = '1';
            selector.appendChild(option);
        }
        if (selector) selector.value = DEMO_BOOK_NAME;
        const currentBook = document.getElementById('currentWritingBookName');
        if (currentBook) currentBook.textContent = DEMO_BOOK_NAME + '（不会保存）';
        const result = document.getElementById('resultBox');
        if (result) result.innerHTML = '';
        const plot = document.getElementById('plotInput');
        if (plot) plot.value = '';
        const words = document.getElementById('chapterTargetWordsInput');
        if (words) words.value = '';
        const templateName = document.getElementById('composerTemplateName');
        if (templateName) templateName.textContent = '选择提示词模版';
        const modelButton = document.getElementById('btnModelSelect');
        if (modelButton) modelButton.textContent = '模型 ▼';
        const confirmButton = document.getElementById('btnConfirm');
        if (confirmButton) confirmButton.disabled = true;
        window.refreshTree?.();
        window.updateChapterComposerState?.();
    }

    function prepareContentStageState(stageId) {
        const appState = getAppState();
        if (!appState.chapter) appState.chapter = {};
        if (!appState.gen) appState.gen = {};
        if (!appState.outlineGen) appState.outlineGen = {};
        appState.chapter.book = DEMO_BOOK_NAME;
        appState.chapter.vi = -1;
        appState.chapter.ci = -1;
        Object.assign(appState.gen, {
            templateId: '', linkedFiles: [], linkedMemoryBookName: DEMO_BOOK_NAME,
            linkedMemoryBookScopeKey: 'tutorial-demo-book', refChapters: [], refSummaries: [],
            refSummaryCandidates: [], keyEventSummaries: [], keyEventSummaryCandidates: [],
            plotInput: ''
        });
        const previewBooks = createDemoMemoryBooks({ includeAdvanced: true });
        previewBooks[DEMO_BOOK_NAME]['细纲文件'] = [{ name: '第1章细纲.md', content: DEMO_FINE_OUTLINE }];
        window.ZHIYU_MEMORY_PREVIEW_CONTEXT = { active: true, books: previewBooks };
        window.ZHIYU_BOOK_PREVIEW_CONTEXT = { active: true, books: createDemoBookPreview({ includeBody: true }) };
        ensureTutorialPageVisible();
        const selector = document.getElementById('bookSel');
        if (selector && !selector.querySelector('[data-tutorial-book-option]')) {
            const option = document.createElement('option');
            option.value = DEMO_BOOK_NAME;
            option.textContent = DEMO_BOOK_NAME;
            option.dataset.tutorialBookOption = '1';
            selector.appendChild(option);
        }
        if (selector) selector.value = DEMO_BOOK_NAME;
        const currentBook = document.getElementById('currentWritingBookName');
        if (currentBook) currentBook.textContent = DEMO_BOOK_NAME + '（不会保存）';
        const result = document.getElementById('resultBox');
        if (result) result.innerHTML = toTutorialEditorHtml(DEMO_CHAPTER);
        const modelButton = document.getElementById('btnModelSelect');
        if (modelButton) modelButton.textContent = '模型 ▼';
        runtime.selectedText = '';
        runtime.localOriginalText = DEMO_CHAPTER;
        runtime.pendingDemoConfirm = null;
        if (stageId === 'ai-polish') prepareDemoNaturalizePanel();
        else selectTutorialActionTab('fineOutline');
        window.refreshTree?.();
        window.updateChapterComposerState?.();
    }

    function prepareOutlineExtensionState(stageId) {
        const appState = getAppState();
        if (!appState.chapter) appState.chapter = {};
        if (!appState.outline) appState.outline = {};
        if (!appState.outlineGen) appState.outlineGen = {};
        appState.chapter.book = DEMO_BOOK_NAME;
        Object.assign(appState.outline, {
            mode: 'outline', outlineSubMode: 'normal', genres: [], outlineAdvancedGenres: [], functionalGenres: [],
            coreSummary: '', functionalDirection: '', functionSubject: '', functionType: 'imitate',
            content: '', functionalContent: '', genrePreferenceTags: { normal: [], advanced: [], function: [] },
            genrePreferenceAppliedGenres: { normal: [], advanced: [], function: [] },
            generationMode: 'direct', generationRuntime: null, templateId: '', templateIds: {},
            functionalLinkedFiles: [], outlineAdvancedLinkedFiles: [], outlineAdvancedMasterSnapshot: '',
            outlineAdvancedStages: [], outlineAdvancedSourceName: ''
        });
        Object.assign(appState.outlineGen, {
            outlinePickerMode: 'fineOutline', advancedLinkedOutlineFiles: [], advancedLinkedOutlineFilesByBook: {},
            pendingStages: [], linkedFiles: [], linkedFilesByBook: {}
        });
        window.ZHIYU_MEMORY_PREVIEW_CONTEXT = { active: true, books: createDemoMemoryBooks({ includeAdvanced: true }) };
        ensureTutorialPageVisible();
        const currentBook = document.getElementById('currentWritingBookName');
        if (currentBook) currentBook.textContent = DEMO_BOOK_NAME + '（不会保存）';
        const result = document.getElementById('outlineResultBox');
        if (result) result.textContent = stageId === 'functional'
            ? '完成配置后，教程大纲设定会在这里流式显示。'
            : (stageId === 'stage-outline' ? '选择母大纲和目标阶段后，阶段粗纲会显示在这里。' : '点击生成后，高级母大纲会显示在这里。');
        document.getElementById('outlineCoreSummary') && (document.getElementById('outlineCoreSummary').value = '');
        document.getElementById('outlineAdvancedCoreSummary') && (document.getElementById('outlineAdvancedCoreSummary').value = '');
        window.renderOutlineMode?.();
        window.setAdvancedOutlineGroupExpanded?.('master', false);
        window.setAdvancedOutlineGroupExpanded?.('stages', false);
        window.renderOutlineGenreTags?.();
        window.renderSummaryPreferenceChips?.();
    }

    function prepareDecomposeStageState() {
        const appState = getAppState();
        if (!appState.chapter) appState.chapter = {};
        if (!appState.outlineGen) appState.outlineGen = {};
        appState.chapter.book = DEMO_BOOK_NAME;
        appState.chapter.vi = -1;
        appState.chapter.ci = -1;
        Object.assign(appState.outlineGen, {
            activeTab: 'fineOutline', decomposeChapters: [], dcContent: '', templateId: '', templateName: ''
        });
        window.ZHIYU_MEMORY_PREVIEW_CONTEXT = { active: true, books: createDemoMemoryBooks({ includeDecompose: true }) };
        window.ZHIYU_BOOK_PREVIEW_CONTEXT = { active: true, books: createDemoBookPreview({ includeBody: true }) };
        ensureTutorialPageVisible();
        const currentBook = document.getElementById('currentWritingBookName');
        if (currentBook) currentBook.textContent = DEMO_BOOK_NAME + '（不会保存）';
        selectTutorialActionTab('fineOutline');
        const result = document.getElementById('dcContentBox');
        if (result) result.textContent = '';
        const templateButton = document.getElementById('btnDCTemplate');
        if (templateButton) templateButton.textContent = '提示词模版';
        const modelButton = document.getElementById('btnActionModelSelect');
        if (modelButton) modelButton.textContent = '模型 ▼';
    }

    function prepareFullAnalysisStageState() {
        document.body.classList.add('zhiyu-outline-tutorial-active');
        ['importBookModal', 'importParseModal', 'fullTextAnalysisModal'].forEach(closeModal);
        showTutorialPage('overview');
        delete window.ZHIYU_IMPORT_PREVIEW_CONTEXT;
        const novelType = document.querySelector('input[name="importType"][value="novel"]');
        if (novelType) novelType.checked = true;
        const selectAll = document.getElementById('btnImportSelectAll');
        if (selectAll) selectAll.textContent = '全选章节';
        const taskbar = document.getElementById('fullAnalysisTaskbar');
        if (taskbar) taskbar.style.display = 'none';
    }

    function prepareDecomposeSettingsState() {
        const appState = getAppState();
        if (!appState.chapter) appState.chapter = {};
        if (!appState.outlineGen) appState.outlineGen = {};
        if (!appState.ui) appState.ui = {};
        appState.chapter.book = DEMO_BOOK_NAME;
        appState.chapter.vi = 0;
        appState.chapter.ci = 1;
        Object.assign(appState.outlineGen, {
            activeTab: 'fineOutline', linkedFiles: [], linkedFilesByBook: {},
            linkedMemoryBookName: DEMO_BOOK_NAME, linkedMemoryBookScopeKey: 'tutorial-demo-book',
            linkedMemoryDefaultsApplied: true
        });
        const previewBooks = createDemoMemoryBooks({
            fineSourceFiles: true,
            includeAdvanced: true,
            includeDecompose: true,
            includeFullAnalysis: true
        });
        const associatedFiles = previewBooks[DEMO_BOOK_NAME]?.[DEMO_MEMORY_FOLDER_NAME] || [];
        ['关键事件表.md', '资料索引.md'].forEach(function(name) {
            const file = associatedFiles.find(item => item.name === name);
            if (file && !file.content) file.content = name === '关键事件表.md'
                ? '# 关键事件表\n\n记录影响主线推进的重要事件。'
                : '# 资料索引\n\n记录重要资料的位置与检索线索。';
        });
        previewBooks[DEMO_BOOK_NAME]['细纲文件'] = [{ name: '第1章细纲.md', content: DEMO_FINE_OUTLINE }];
        window.ZHIYU_MEMORY_PREVIEW_CONTEXT = { active: true, books: previewBooks };
        window.ZHIYU_BOOK_PREVIEW_CONTEXT = { active: true, books: createDemoBookPreview({ includeBody: true }) };
        showTutorialDecomposeSettingsMemoryPreview();
    }

    function hideTutorialBookPreview() {
        delete window.ZHIYU_BOOK_PREVIEW_CONTEXT;
        document.querySelectorAll('[data-tutorial-book-option]').forEach(option => option.remove());
    }

    function prepareStage(stageId) {
        delete window.ZHIYU_MEMORY_LINK_TUTORIAL_CONTEXT;
        if (stageId === 'new-book') prepareNewBookState();
        else if (stageId === 'outline') prepareDemoState();
        else if (stageId === 'fine-outline') prepareFineOutlineState();
        else if (stageId === 'chapter') prepareChapterState();
        else if (stageId === 'ai-polish' || stageId === 'local-polish' || stageId === 'local-rewrite') prepareContentStageState(stageId);
        else if (stageId === 'advanced-outline' || stageId === 'stage-outline' || stageId === 'functional') prepareOutlineExtensionState(stageId);
        else if (stageId === 'decompose') prepareDecomposeStageState();
        else if (stageId === 'full-analysis') prepareFullAnalysisStageState();
        else if (stageId === 'decompose-settings') prepareDecomposeSettingsState();
    }

    function setInputValue(id, value) {
        const input = document.getElementById(id);
        if (!input) return;
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function showTutorialCoverDownloadButton() {
        const button = document.getElementById('btnDownloadBookCover');
        if (!button) return;
        button.hidden = false;
        button.disabled = true;
    }

    function restoreTutorialCoverDownloadButton() {
        const button = document.getElementById('btnDownloadBookCover');
        if (!button) return;
        button.hidden = runtime.snapshot?.createBookDownloadHidden ?? true;
        button.disabled = false;
    }

    function generateTutorialCover() { return getTutorialStateRuntime().generateTutorialCover(); }

    function startDemoSynopsisStream() {
        const preview = document.getElementById('createBookSynopsisPreviewText');
        const button = document.getElementById('btnGenerateBookSynopsis');
        if (!preview) {
            runtime.streamPromise = Promise.resolve();
            return;
        }
        window.clearTimeout(runtime.streamTimer);
        preview.value = '';
        preview.classList.add('is-generating', 'outline-tutorial-streaming');
        if (button) {
            button.disabled = true;
            button.textContent = '教程内容生成中...';
        }
        let cursor = 0;
        runtime.streamPromise = new Promise(resolve => {
            function appendChunk() {
                if (!runtime.active) return resolve();
                preview.value += DEMO_SYNOPSIS.slice(cursor, cursor + 7);
                cursor += 7;
                preview.scrollTop = preview.scrollHeight;
                if (cursor < DEMO_SYNOPSIS.length) {
                    runtime.streamTimer = window.setTimeout(appendChunk, runtime.fastForward ? 0 : 28);
                    return;
                }
                preview.classList.remove('is-generating', 'outline-tutorial-streaming');
                preview.classList.add('outline-tutorial-stream-complete');
                if (button) {
                    button.disabled = false;
                    button.textContent = '生成简介';
                }
                resolve();
            }
            appendChunk();
        });
    }

    function completeDemoBookCreation() {
        const name = String(document.getElementById('createBookName')?.value || '').trim();
        if (name !== DEMO_BOOK_INPUT_NAME) return;
        closeModal('createBookSynopsisModal');
        closeModal('createBookModal');
        const appState = getAppState();
        if (!appState.chapter) appState.chapter = {};
        appState.chapter.book = DEMO_BOOK_NAME;
        if (!appState.ui) appState.ui = {};
        appState.ui.tab = 'works';
        window.ZHIYU_BOOK_PREVIEW_CONTEXT = { active: true, books: createDemoBookPreview() };
        showTutorialPage('overview');
        window.refreshOverview?.();
        window.ZHIYU_TOAST?.success?.('教程作品已创建，仅在本次演示中有效');
    }

    function createDemoMemoryBooks(options) { return getTutorialStateRuntime().createDemoMemoryBooks(options); }

    function showTutorialMemoryPreview(options) {
        const appState = getAppState();
        if (!appState.memory) appState.memory = {};
        ['outlineModal', 'templateSelectModal', 'modelSelectModal', 'genrePreferenceTagModal'].forEach(closeModal);
        window.ZHIYU_MEMORY_PREVIEW_CONTEXT = {
            active: true,
            books: createDemoMemoryBooks(options)
        };
        appState.memory.book = DEMO_BOOK_NAME;
        appState.memory.view = 'associated';
        appState.memory.folder = '';
        appState.memory.backupVolume = '';
        appState.memory.batchMode = false;
        document.querySelectorAll('.page').forEach(page => page.classList.toggle('active', page.id === 'page-memory'));
        document.querySelectorAll('#sideNav .nav-item').forEach(item => item.classList.toggle('active', item.dataset.page === 'memory'));
        window.exitMemBatchMode?.();
        if (options?.overviewOnly) {
            appState.memory.book = '';
            const main = document.getElementById('memMain');
            const sub = document.getElementById('memSub');
            if (main) main.style.display = 'block';
            if (sub) sub.style.display = 'none';
            window.refreshMemGrid?.();
            return;
        }
        if (typeof window.openMemBook === 'function') window.openMemBook(DEMO_BOOK_NAME);
        else {
            const main = document.getElementById('memMain');
            const sub = document.getElementById('memSub');
            if (main) main.style.display = 'none';
            if (sub) sub.style.display = 'flex';
            const title = document.getElementById('memTitle');
            if (title) title.textContent = DEMO_BOOK_NAME;
            window.renderMemFolderSidebar?.();
            window.renderMemFileList?.();
        }
    }

    function showTutorialAdvancedMemoryPreview() {
        showTutorialMemoryPreview({ includeAdvanced: true });
    }

    function showTutorialDecomposeMemoryPreview() {
        showTutorialMemoryPreview({ includeDecompose: true });
    }

    function showTutorialFullAnalysisMemoryPreview() {
        showTutorialMemoryPreview({ includeFullAnalysis: true });
    }

    function hideTutorialMemoryPreview() {
        if (!window.ZHIYU_MEMORY_PREVIEW_CONTEXT) return;
        delete window.ZHIYU_MEMORY_PREVIEW_CONTEXT;
        const snapshot = runtime.snapshot;
        const appState = getAppState();
        if (!appState.memory) appState.memory = {};
        Object.keys(appState.memory).forEach(key => delete appState.memory[key]);
        snapshot?.memoryEntries?.forEach(entry => { appState.memory[entry[0]] = entry[1]; });
        window.renderMemFolderSidebar?.();
        window.renderMemFileList?.();
        snapshot?.memoryUi?.forEach(entry => {
            const element = document.getElementById(entry[0]);
            if (!element) return;
            if (entry[1] === null) element.removeAttribute('style');
            else element.setAttribute('style', entry[1]);
            if (entry[0] === 'btnMemBatchManageSub') element.textContent = entry[2];
        });
        const title = document.getElementById('memTitle');
        if (title) title.textContent = snapshot?.memTitleText || '';
        const tree = document.getElementById('memTree');
        if (tree) tree.className = snapshot?.memTreeClassName || 'tree-container memory-file-grid';
        snapshot?.selectedMemoryFiles?.forEach(selected => {
            const checkbox = Array.from(document.querySelectorAll('#memTree .tree-checkbox')).find(candidate => (
                (candidate.dataset.folder || '') === selected[0] && (candidate.dataset.idx || '') === selected[1]
            ));
            if (!checkbox) return;
            checkbox.checked = true;
            checkbox.closest('.memory-file-card')?.classList.add('selected');
        });
        window.updateMemSelectedCount?.();
        ensureTutorialPageVisible();
    }

    function showTutorialPage(pageName) {
        document.querySelectorAll('.page').forEach(page => page.classList.toggle('active', page.id === 'page-' + pageName));
        document.querySelectorAll('#sideNav .nav-item').forEach(item => item.classList.toggle('active', item.dataset.page === pageName));
    }

    function ensureTutorialPageVisible() {
        document.body.classList.add('zhiyu-outline-tutorial-active');
        showTutorialPage('write');
        document.getElementById('writeCatalog')?.classList.remove('collapsed');
    }

    function openOutlineForTutorial() {
        openModal('outlineModal');
        window.renderOutlineGenreTags?.();
        window.renderSummaryPreferenceChips?.();
    }

    function selectTutorialNormalMode(target) {
        const appState = getAppState();
        if (!appState.outline) appState.outline = {};
        appState.outline.outlineSubMode = 'normal';
        document.querySelectorAll('#outlineSubModeTabs [data-submode]').forEach(button => {
            button.classList.toggle('active', button === target);
        });
        window.syncAdvancedOutlineUI?.();
    }

    function selectTutorialAdvancedMode(target) {
        const appState = getAppState();
        if (!appState.outline) appState.outline = {};
        appState.outline.mode = 'outline';
        appState.outline.outlineSubMode = 'advanced';
        document.querySelectorAll('#outlineModeTabs [data-mode]').forEach(button => {
            button.classList.toggle('active', button.dataset.mode === 'outline');
        });
        document.querySelectorAll('#outlineSubModeTabs [data-submode]').forEach(button => {
            button.classList.toggle('active', button === target || button.dataset.submode === 'advanced');
        });
        window.syncAdvancedOutlineUI?.();
        window.renderOutlineGenreTags?.();
        window.renderSummaryPreferenceChips?.();
    }

    function selectTutorialFunctionMode(target) {
        const appState = getAppState();
        if (!appState.outline) appState.outline = {};
        appState.outline.mode = 'function';
        appState.outline.outlineSubMode = 'normal';
        document.querySelectorAll('#outlineModeTabs [data-mode]').forEach(button => {
            button.classList.toggle('active', button === target || button.dataset.mode === 'function');
        });
        window.renderOutlineMode?.();
        window.renderOutlineGenreTags?.();
        window.renderSummaryPreferenceChips?.();
    }

    function selectTutorialFunctionType(target) {
        const type = target?.dataset.fn === 'script' ? 'script' : 'imitate';
        window.setOutlineFunctionType?.(type);
        document.querySelectorAll('#outlineFunctionTypeToggle [data-fn]').forEach(option => {
            option.classList.toggle('active', option === target || option.dataset.fn === type);
        });
        window.renderOutlineTemplateSelection?.(type === 'script' ? 'functionalScript' : 'functionalOutline');
    }

    function selectTutorialDirectMode(target) {
        document.querySelectorAll('#outlineGenerationModeToggle [data-outline-generation-mode]').forEach(button => {
            button.classList.toggle('active', button === target);
        });
    }

    function toggleTutorialGenre(target, mode) {
        const genre = String(target?.textContent || '').trim();
        if (!genre) return;
        const current = typeof window.getOutlineGenresForMode === 'function'
            ? window.getOutlineGenresForMode(mode).slice()
            : [];
        const next = current.includes(genre)
            ? current.filter(item => item !== genre)
            : current.concat(genre).slice(0, 3);
        window.setOutlineGenresForMode?.(mode, next, { persist: false });
        window.renderOutlineGenreTags?.();
        window.renderSummaryPreferenceChips?.();
    }

    function getTutorialTemplate(context) {
        const demoDecomposeTemplate = TUTORIAL_MAINLINE_STAGE_PACK.content.DEMO_DECOMPOSE_TEMPLATE;
        const officialTemplateIds = window.ZHIYU_COMMUNITY_OFFICIAL_TEMPLATE_IDS || {};
        const id = context === 'decompose'
            ? demoDecomposeTemplate.id
            : (context === 'chapter'
                ? officialTemplateIds.chapterTomato
                : (context === 'fineOutline' ? officialTemplateIds.fineOutline : officialTemplateIds.outline));
        const templates = typeof window.gTPublic === 'function' ? window.gTPublic() : [];
        return templates.find(item => String(item?.id || '') === id)
            || (context === 'decompose' ? demoDecomposeTemplate : null);
    }

    function findTutorialTemplateCard(context) {
        const template = getTutorialTemplate(context);
        if (!template) return null;
        return document.querySelector('#tplGrid [data-tpl-id="' + CSS.escape(String(template.id)) + '"]');
    }

    function openTutorialTemplateSelector(context) {
        const templateContext = context === 'fineOutline'
            ? 'fineOutline'
            : (context === 'chapter' ? 'chapter' : (context === 'functionalOutline' ? 'functionalOutline' : (context === 'decompose' ? 'decompose' : 'outline')));
        const chapterTemplate = templateContext === 'chapter';
        const options = {
            context: templateContext === 'decompose' ? 'decompose' : (chapterTemplate ? 'chapter' : (templateContext === 'fineOutline' ? 'fineOutline' : 'outline')),
            subCategory: chapterTemplate ? '正文' : (templateContext === 'decompose' ? '拆书' : (templateContext === 'fineOutline' ? '细纲' : '大纲')),
            skipRemoteRefresh: true
        };
        const current = typeof window.gTPublic === 'function' ? window.gTPublic() : [];
        const existingIds = new Set(current.map(item => String(item?.id || '')));
        const previewTemplates = templateContext === 'decompose'
            ? [TUTORIAL_MAINLINE_STAGE_PACK.content.DEMO_DECOMPOSE_TEMPLATE]
            : OFFICIAL_TEMPLATE_SNAPSHOTS;
        window.ZHIYU_TEMPLATE_PREVIEW_CONTEXT = {
            active: true,
            templates: current.concat(previewTemplates.filter(item => !existingIds.has(String(item.id))))
        };
        if (typeof window.openTemplateSelectorWithContext === 'function') {
            window.openTemplateSelectorWithContext(options);
        } else if (typeof window.openTemplateSelector === 'function') {
            window.openTemplateSelector(options);
        }
    }

    function applyTutorialTemplate(context) {
        const templateContext = context === 'fineOutline'
            ? 'fineOutline'
            : (context === 'chapter' ? 'chapter' : (context === 'functionalOutline' ? 'functionalOutline' : (context === 'decompose' ? 'decompose' : 'outline')));
        const template = getTutorialTemplate(templateContext);
        const selectedCard = findTutorialTemplateCard(templateContext);
        if (!template || !selectedCard?.classList.contains('tpl-card-selected')) return;
        const appState = getAppState();
        if (!appState.outline) appState.outline = {};
        if (!appState.outlineGen) appState.outlineGen = {};
        if (!appState.gen) appState.gen = {};
        if (templateContext === 'fineOutline') {
            if (typeof window.setTemplateContextTemplateId === 'function') {
                window.setTemplateContextTemplateId('fineOutline', template.id);
            }
            appState.outlineGen.templateId = template.id;
            appState.outlineGen.templateName = template.title || '细纲模板';
            if (typeof window.setOGTemplateButtonText === 'function') {
                window.setOGTemplateButtonText(appState.outlineGen.templateName);
            } else {
                const button = document.getElementById('btnOGTemplate');
                if (button) button.textContent = appState.outlineGen.templateName;
            }
            closeModal('templateSelectModal');
            return;
        }
        if (templateContext === 'chapter') {
            appState.gen.templateId = template.id;
            const label = document.getElementById('composerTemplateName');
            if (label) label.textContent = template.title || '正文模板';
            closeModal('templateSelectModal');
            window.updateChapterComposerState?.();
            return;
        }
        if (templateContext === 'decompose') {
            window.setActionTemplateButtonText?.('decompose', template.title || '拆书模板', template);
            closeModal('templateSelectModal');
            return;
        }
        if (templateContext === 'functionalOutline') {
            if (typeof window.setTemplateContextTemplateId === 'function') {
                window.setTemplateContextTemplateId('functionalOutline', template.id);
            }
            appState.outline.templateIds.functionalOutline = template.id;
            appState.outline.templateId = template.id;
            window.renderOutlineTemplateSelection?.('functionalOutline');
            const label = document.getElementById('outlineTemplateLabel');
            const value = document.getElementById('outlineSelectedTemplate');
            document.getElementById('outlineTemplateOption')?.classList.add('is-selected');
            if (label) label.textContent = '选择提示词模版';
            if (value) {
                value.textContent = template.title || '大纲设定模板';
                value.title = template.title || '大纲设定模板';
            }
            closeModal('templateSelectModal');
            return;
        }
        appState.outline.templateIds = { ...(appState.outline.templateIds || {}) };
        if (typeof window.setTemplateContextTemplateId === 'function') {
            window.setTemplateContextTemplateId('outline', template.id);
        } else {
            appState.outline.templateIds.outline = template.id;
            appState.outline.templateId = template.id;
        }
        const renderedTemplate = window.renderOutlineTemplateSelection?.('outline');
        const label = document.getElementById('outlineTemplateLabel');
        const value = document.getElementById('outlineSelectedTemplate');
        const option = document.getElementById('outlineTemplateOption');
        if (!renderedTemplate) {
            option?.classList.add('is-selected');
            if (label) label.textContent = '选择提示词模版';
            if (value) {
                value.textContent = template.title || DEMO_TEMPLATE_NAME;
                value.title = template.title || DEMO_TEMPLATE_NAME;
            }
        }
        closeModal('templateSelectModal');
    }

    function findOutlineFileCard(fileName) {
        return Array.from(document.querySelectorAll('#ogOutlineFileGrid .link-file-card'))
            .find(card => String(card.dataset.name || '') === fileName) || null;
    }

    function openTutorialAdvancedSourceFiles() {
        window.openOGOutlineFileModal?.();
        const selected = window.getOGOutlineSelectionList?.('advanced');
        if (Array.isArray(selected)) selected.splice(0, selected.length);
        window.refreshOGOutlineFileGrid?.();
    }

    function resetTutorialStageSelection() {
        const select = document.getElementById('outlineAdvancedStageSelect');
        if (!select) return;
        let placeholder = Array.from(select.options || []).find(option => option.value === '');
        if (!placeholder) {
            placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = '请选择目标阶段';
            placeholder.dataset.tutorialStagePlaceholder = '1';
            select.prepend(placeholder);
        }
        select.value = '';
    }

    function openTutorialAdvancedLinks() {
        const appState = getAppState();
        if (!appState.outline) appState.outline = {};
        appState.outline.outlineAdvancedLinkedFiles = [];
        delete appState.outline.outlineAdvancedLinkedDefaultsBook;
        window.openAdvancedOutlineLinkSelector?.({ skipDefaults: true });
    }

    function openTutorialFunctionalLinks() {
        const appState = getAppState();
        if (!appState.outline) appState.outline = {};
        appState.outline.functionalLinkedFiles = [];
        window.openOutlineFunctionLinkSelector?.();
    }

    function showAdvancedTutorialRecoveryButtons() {
        ['btnRetryAdvancedSegment', 'btnCompleteAdvancedSegment'].forEach(id => {
            const button = document.getElementById(id);
            if (!button) return;
            button.hidden = false;
            button.style.display = 'inline-flex';
            button.disabled = true;
        });
        window.setAdvancedOutlineGroupExpanded?.('master', true);
        window.setAdvancedOutlineGroupExpanded?.('stages', true);
    }

    function openTutorialModelModal(scope) {
        runtime.modelScope = scope === 'action' ? 'action' : (scope === 'chapter' ? 'chapter' : 'outline');
        document.querySelectorAll('[data-tutorial-model]').forEach(card => card.removeAttribute('data-tutorial-model'));
        window.ZHIYU_MODEL_PREVIEW_CONTEXT = { active: true, modelId: DEMO_MODEL_NAME };
        const pickerScope = runtime.modelScope === 'chapter' ? 'writing' : runtime.modelScope;
        const markTutorialModelCard = function() {
            const card = document.querySelector('#modelPickerList .model-picker-card[data-name="' + CSS.escape(DEMO_MODEL_NAME) + '"]');
            if (card) card.dataset.tutorialModel = runtime.modelScope;
        };
        const renderTask = window.openModelPicker?.(pickerScope, {
            tutorialPreview: true,
            modelId: DEMO_MODEL_NAME
        });
        markTutorialModelCard();
        Promise.resolve(renderTask).then(markTutorialModelCard);
        runtime.modelSelected = false;
    }

    function selectTutorialModel(target) {
        if (!target) return;
        runtime.modelSelected = true;
        target.closest('#modelPickerList')?.querySelectorAll('.model-picker-card.selected').forEach(card => card.classList.remove('selected'));
        target.classList.add('selected');
    }

    function applyTutorialModel() {
        if (!runtime.modelSelected) return;
        const buttonId = runtime.modelScope === 'action'
            ? 'btnActionModelSelect'
            : (runtime.modelScope === 'chapter' ? 'btnModelSelect' : 'btnOutlineModelSelect');
        const button = document.getElementById(buttonId);
        if (button) button.textContent = (runtime.modelScope === 'outline' ? '大纲：' : '模型：') + DEMO_MODEL_NAME + ' ▼';
        closeModal('modelSelectModal');
        document.querySelectorAll('[data-tutorial-model]').forEach(card => card.removeAttribute('data-tutorial-model'));
        delete window.ZHIYU_MODEL_PREVIEW_CONTEXT;
    }

    function startDemoStream() {
        const result = document.getElementById('outlineResultBox');
        const button = document.getElementById('btnStartOutline');
        if (!result) {
            runtime.streamPromise = Promise.resolve();
            return;
        }
        window.clearTimeout(runtime.streamTimer);
        result.textContent = '';
        result.classList.add('outline-tutorial-streaming');
        if (button) {
            button.disabled = true;
            button.textContent = '教程内容生成中...';
        }
        let cursor = 0;
        runtime.streamPromise = new Promise(resolve => {
            function appendChunk() {
                if (!runtime.active) return resolve();
                const chunkSize = cursor < 180 ? 10 : 20;
                result.textContent += DEMO_OUTLINE.slice(cursor, cursor + chunkSize);
                cursor += chunkSize;
                result.scrollTop = result.scrollHeight;
                if (cursor < DEMO_OUTLINE.length) {
                    runtime.streamTimer = window.setTimeout(appendChunk, runtime.fastForward ? 0 : 24);
                    return;
                }
                result.classList.remove('outline-tutorial-streaming');
                result.classList.add('outline-tutorial-stream-complete');
                const appState = getAppState();
                if (appState.outline) appState.outline.content = DEMO_OUTLINE;
                if (button) {
                    button.disabled = false;
                    button.textContent = '生成大纲';
                }
                resolve();
            }
            appendChunk();
        });
    }

    function startDemoFineOutlineStream() {
        const result = document.getElementById('ogContentBox');
        const button = document.getElementById('btnOGSend');
        if (!result) {
            runtime.streamPromise = Promise.resolve();
            return;
        }
        window.clearTimeout(runtime.streamTimer);
        result.textContent = '';
        result.classList.add('outline-tutorial-streaming');
        if (button) {
            button.disabled = true;
            button.textContent = '…';
        }
        let cursor = 0;
        runtime.streamPromise = new Promise(resolve => {
            function appendChunk() {
                if (!runtime.active) return resolve();
                result.textContent += DEMO_FINE_OUTLINE.slice(cursor, cursor + 12);
                cursor += 12;
                result.scrollTop = result.scrollHeight;
                if (cursor < DEMO_FINE_OUTLINE.length) {
                    runtime.streamTimer = window.setTimeout(appendChunk, runtime.fastForward ? 0 : 26);
                    return;
                }
                result.classList.remove('outline-tutorial-streaming');
                result.classList.add('outline-tutorial-stream-complete');
                const appState = getAppState();
                if (!appState.outlineGen) appState.outlineGen = {};
                appState.outlineGen.ogContent = DEMO_FINE_OUTLINE;
                if (button) {
                    button.disabled = false;
                    button.textContent = '↑';
                }
                resolve();
            }
            appendChunk();
        });
    }

    function saveDemoFineOutline() {
        const previewBooks = window.ZHIYU_MEMORY_PREVIEW_CONTEXT?.books;
        if (previewBooks?.[DEMO_BOOK_NAME]) {
            previewBooks[DEMO_BOOK_NAME]['细纲文件'] = [{ name: '第1章细纲.md', content: DEMO_FINE_OUTLINE }];
        }
        window.ZHIYU_TOAST?.success?.('教程细纲已保存，仅在本次演示中有效');
    }

    function openTutorialChapterMemorySelector() {
        const appState = getAppState();
        if (!appState.gen) appState.gen = {};
        appState.gen.linkedFiles = [];
        window.openLinkMemorySelector?.();
        appState.gen.linkedFiles = [];
        window.refreshMemoryLinkTree?.();
        window.updateLinkedMemoryCount?.();
    }

    function openTutorialDecomposeSettingsChapterLinks() {
        const appState = getAppState();
        if (!appState.gen) appState.gen = {};
        const books = window.ZHIYU_MEMORY_PREVIEW_CONTEXT?.books || {};
        const book = books[DEMO_BOOK_NAME] || {};
        const requestedFiles = [
            { folder: '细纲文件', name: '第1章细纲.md' },
            { folder: DEMO_MEMORY_FOLDER_NAME, name: '设定集.md' },
            { folder: DEMO_MEMORY_FOLDER_NAME, name: '信息表.md' },
            { folder: DEMO_MEMORY_FOLDER_NAME, name: '角色列表.md' },
            { folder: DEMO_MEMORY_FOLDER_NAME, name: '追踪表.md' },
            { folder: DEMO_MEMORY_FOLDER_NAME, name: '边界卡.md' },
            { folder: DEMO_MEMORY_FOLDER_NAME, name: '承接卡.md' },
            { folder: DEMO_MEMORY_FOLDER_NAME, name: '关键事件表.md' },
            { folder: DEMO_MEMORY_FOLDER_NAME, name: '资料索引.md' }
        ];
        const tutorialSelections = requestedFiles.map(function(requested) {
            const files = Array.isArray(book[requested.folder]) ? book[requested.folder] : [];
            const index = files.findIndex(function(file) { return String(file?.name || '') === requested.name; });
            if (index < 0) return null;
            return window.createMemoryReferenceSelection?.(DEMO_BOOK_NAME, requested.folder, index)
                || { name: requested.name, memBook: DEMO_BOOK_NAME, memFolder: requested.folder, memIdx: index };
        }).filter(Boolean);
        window.openLinkMemorySelector?.();
        if (typeof window.setActiveMemoryLinkFiles === 'function') window.setActiveMemoryLinkFiles(tutorialSelections);
        else appState.gen.linkedFiles = tutorialSelections;
        window.refreshMemoryLinkTree?.();
        window.updateLinkedMemoryCount?.();
    }

    function openTutorialReferenceSelector() {
        const appState = getAppState();
        if (!appState.gen) appState.gen = {};
        appState.gen.refChapters = [];
        appState.gen.refSummaries = [];
        appState.gen.keyEventSummaries = [];
        openModal('refChapterModal');
        window.renderRefChapterList?.(DEMO_BOOK_NAME);
    }

    function enableTutorialChapterGenerate() {
        const button = document.getElementById('btnComposerGenerate');
        if (button) button.disabled = false;
    }

    function startDemoChapterStream() {
        const result = document.getElementById('resultBox');
        const generateButton = document.getElementById('btnComposerGenerate');
        const stopButton = document.getElementById('btnStop');
        if (!result) {
            runtime.streamPromise = Promise.resolve();
            return;
        }
        window.clearTimeout(runtime.streamTimer);
        result.textContent = '';
        result.classList.add('outline-tutorial-streaming');
        if (generateButton) {
            generateButton.disabled = true;
            generateButton.textContent = '教程正文生成中...';
        }
        if (stopButton) {
            stopButton.disabled = false;
            stopButton.textContent = '停止';
        }
        let cursor = 0;
        runtime.streamPromise = new Promise(resolve => {
            function appendChunk() {
                if (!runtime.active) return resolve();
                result.textContent += DEMO_CHAPTER.slice(cursor, cursor + 10);
                cursor += 10;
                result.scrollTop = result.scrollHeight;
                if (cursor < DEMO_CHAPTER.length) {
                    runtime.streamTimer = window.setTimeout(appendChunk, runtime.fastForward ? 0 : 25);
                    return;
                }
                result.classList.remove('outline-tutorial-streaming');
                result.classList.add('outline-tutorial-stream-complete');
                if (generateButton) {
                    generateButton.disabled = false;
                    generateButton.textContent = '生成本章';
                }
                if (stopButton) {
                    stopButton.disabled = true;
                    stopButton.textContent = '暂未生成';
                }
                const confirm = document.getElementById('btnConfirm');
                if (confirm) confirm.disabled = false;
                resolve();
            }
            appendChunk();
        });
    }

    function confirmDemoChapter() {
        window.ZHIYU_TOAST?.success?.('已采用教程正文，仅在本次演示中有效');
    }

    function saveDemoChapter() {
        window.ZHIYU_TOAST?.success?.('教程章节已保存，仅在本次演示中有效');
    }

    function normalizeTutorialText(text) {
        return String(text || '').replace(/\s+/g, '').trim();
    }

    function streamTutorialText(target, text, options) {
        if (!target) {
            runtime.streamPromise = Promise.resolve();
            return runtime.streamPromise;
        }
        const chunkSize = Math.max(4, Number(options?.chunkSize || 10));
        const interval = Math.max(8, Number(options?.interval || 24));
        const onStart = options?.onStart;
        const onDone = options?.onDone;
        window.clearTimeout(runtime.streamTimer);
        target.textContent = '';
        target.classList.add('outline-tutorial-streaming');
        if (typeof onStart === 'function') onStart();
        let cursor = 0;
        runtime.streamPromise = new Promise(resolve => {
            function appendChunk() {
                if (!runtime.active) return resolve();
                target.textContent += String(text || '').slice(cursor, cursor + chunkSize);
                cursor += chunkSize;
                target.scrollTop = target.scrollHeight;
                if (cursor < String(text || '').length) {
                    runtime.streamTimer = window.setTimeout(appendChunk, runtime.fastForward ? 0 : interval);
                    return;
                }
                target.classList.remove('outline-tutorial-streaming');
                target.classList.add('outline-tutorial-stream-complete');
                if (typeof onDone === 'function') onDone();
                resolve();
            }
            appendChunk();
        });
        return runtime.streamPromise;
    }

    function startDemoAdvancedOutlineStream() {
        const result = document.getElementById('outlineResultBox');
        const start = document.getElementById('btnStartOutline');
        streamTutorialText(result, DEMO_ADVANCED_OUTLINE, {
            chunkSize: 16,
            interval: 18,
            onStart: function() {
                if (start) {
                    start.disabled = true;
                    start.textContent = '教程分段生成中...';
                }
            },
            onDone: function() {
                const appState = getAppState();
                if (!appState.outline) appState.outline = {};
                appState.outline.advancedContent = DEMO_ADVANCED_OUTLINE;
                appState.outline.advancedOutputKind = 'master';
                if (start) {
                    start.disabled = false;
                    start.textContent = '生成大纲';
                }
            }
        });
    }

    function saveDemoAdvancedOutline() {
        const books = window.ZHIYU_MEMORY_PREVIEW_CONTEXT?.books;
        const folder = books?.[DEMO_BOOK_NAME]?.[DEMO_MEMORY_FOLDER_NAME];
        if (Array.isArray(folder)) {
            const record = folder.find(file => file.name === '剧情总览.md');
            if (record) record.content = DEMO_ADVANCED_OUTLINE;
        }
        window.ZHIYU_TOAST?.success?.('教程高级大纲已保存，仅在本次演示中有效');
        closeModal('outlineModal');
        ensureTutorialPageVisible();
    }

    function startDemoStageOutlineStream() {
        const result = document.getElementById('outlineResultBox');
        const start = document.getElementById('btnStartAdvancedStageOutlineBottom');
        streamTutorialText(result, DEMO_STAGE_OUTLINE, {
            chunkSize: 16,
            interval: 18,
            onStart: function() {
                if (start) {
                    start.disabled = true;
                    start.textContent = '教程阶段生成中...';
                }
            },
            onDone: function() {
                const appState = getAppState();
                if (!appState.outline) appState.outline = {};
                appState.outline.advancedStageContent = DEMO_STAGE_OUTLINE;
                appState.outline.advancedOutputKind = 'stage';
                if (start) {
                    start.disabled = false;
                    start.textContent = '生成阶段粗纲';
                }
            }
        });
    }

    function saveDemoStageOutline() {
        const books = window.ZHIYU_MEMORY_PREVIEW_CONTEXT?.books;
        const folder = books?.[DEMO_BOOK_NAME]?.[DEMO_MEMORY_FOLDER_NAME];
        if (Array.isArray(folder)) {
            const record = folder.find(file => file.name === 'S01阶段粗纲.md');
            if (record) record.content = DEMO_STAGE_OUTLINE;
        }
        window.ZHIYU_TOAST?.success?.('教程阶段粗纲已保存，仅在本次演示中有效');
    }

    function startDemoFunctionalStream() {
        const result = document.getElementById('outlineResultBox');
        const start = document.getElementById('btnStartOutline');
        streamTutorialText(result, DEMO_FUNCTIONAL_CONTENT, {
            chunkSize: 16,
            interval: 18,
            onStart: function() {
                if (start) {
                    start.disabled = true;
                    start.textContent = '教程内容生成中...';
                }
            },
            onDone: function() {
                const appState = getAppState();
                if (!appState.outline) appState.outline = {};
                appState.outline.functionalContent = DEMO_FUNCTIONAL_CONTENT;
                if (start) {
                    start.disabled = false;
                    start.textContent = '生成功能内容';
                }
            }
        });
    }

    function saveDemoFunctionalContent() {
        window.ZHIYU_TOAST?.success?.('教程功能内容已保存，仅在本次演示中有效');
    }

    function prepareDecomposeWorksChoice() {
        document.getElementById('decompTabFile')?.classList.add('active');
        document.getElementById('decompTabWorks')?.classList.remove('active');
        const works = document.getElementById('decompPanelWorks');
        const file = document.getElementById('decompPanelFile');
        if (works) works.style.display = 'none';
        if (file) file.style.display = '';
    }

    function startDemoDecomposeStream() {
        const result = document.getElementById('dcContentBox');
        const start = document.getElementById('btnOGSend');
        const stop = document.getElementById('dcStopBtn');
        streamTutorialText(result, DEMO_DECOMPOSE_CONTENT, {
            chunkSize: 14,
            interval: 18,
            onStart: function() {
                if (start) {
                    start.disabled = true;
                    start.textContent = '…';
                }
                if (stop) stop.style.display = '';
            },
            onDone: function() {
                const appState = getAppState();
                if (!appState.outlineGen) appState.outlineGen = {};
                appState.outlineGen.dcContent = DEMO_DECOMPOSE_CONTENT;
                if (start) {
                    start.disabled = false;
                    start.textContent = '↑';
                }
                if (stop) stop.style.display = 'none';
            }
        });
    }

    function saveDemoDecompose() {
        window.ZHIYU_TOAST?.success?.('教程拆书已保存，仅在本次演示中有效');
    }

    function returnToDemoDecomposePanel() {
        hideTutorialMemoryPreview();
        ensureTutorialPageVisible();
        selectTutorialActionTab('decompose');
        const result = document.getElementById('dcContentBox');
        if (result) result.textContent = DEMO_DECOMPOSE_CONTENT;
    }

    function openDecomposeInfoModal() {
        document.getElementById('btnDCImportBook')?.click();
    }

    function closeDecomposeInfoModal() {
        closeModal('decomposeImportModal');
        ensureTutorialPageVisible();
        selectTutorialActionTab('decompose');
    }

    function showDemoDecomposeStopButton() {
        const button = document.getElementById('dcStopBtn');
        if (!button) return;
        button.style.display = 'block';
        button.disabled = true;
    }

    function getTutorialFullAnalysisChapters() {
        const preview = window.ZHIYU_IMPORT_PREVIEW_CONTEXT;
        return preview?.active === true && Array.isArray(preview.chapters) ? preview.chapters : [];
    }

    function setTutorialFullAnalysisButton(id, display, disabled) {
        const button = document.getElementById(id);
        if (!button) return;
        button.style.display = display;
        button.disabled = !!disabled;
    }

    function appendTutorialFullAnalysisLog(message, kind) {
        const log = document.getElementById('fullAnalysisLog');
        if (!log) return;
        const row = document.createElement('div');
        row.className = 'full-analysis-log-item is-' + (kind || 'complete');
        const icon = document.createElement('span');
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = kind === 'complete' ? '✓' : '•';
        const content = document.createElement('div');
        content.textContent = message;
        row.append(icon, content);
        log.appendChild(row);
        log.scrollTop = log.scrollHeight;
    }

    function renderDemoFullAnalysisCompletePanel() {
        const progress = document.getElementById('fullAnalysisProgressText');
        if (progress) progress.textContent = '全文分析完成，八份资料已汇总';
        const bar = document.getElementById('fullAnalysisProgressBar');
        if (bar) bar.style.width = '100%';
        const review = document.getElementById('fullAnalysisReviewSection');
        if (review) review.style.display = 'block';
        const summary = document.getElementById('fullAnalysisReviewSummary');
        if (summary) summary.textContent = '已从演示章节整理出 8 份可继续用于创作的关联资料。';
        const items = document.getElementById('fullAnalysisReviewItems');
        if (items) {
            items.replaceChildren(...Object.keys(DEMO_FULL_ANALYSIS_FILES).map(name => {
                const item = document.createElement('div');
                item.className = 'full-analysis-review-item';
                item.textContent = name;
                return item;
            }));
        }
        const save = document.getElementById('fullAnalysisSaveSection');
        if (save) save.style.display = 'block';
        const saveSummary = document.getElementById('fullAnalysisNewBookSummary');
        if (saveSummary) saveSummary.textContent = '输入一个新作品名称；不会覆盖原作品。';
        const name = document.getElementById('fullAnalysisNewBookName');
        if (name) {
            name.value = '';
            name.disabled = false;
        }
        setTutorialFullAnalysisButton('btnFullAnalysisStart', 'none', false);
        setTutorialFullAnalysisButton('btnFullAnalysisBack', 'inline-flex', false);
        setTutorialFullAnalysisButton('btnFullAnalysisCancel', 'none', false);
        setTutorialFullAnalysisButton('btnFullAnalysisStopNow', 'none', false);
        setTutorialFullAnalysisButton('btnFullAnalysisSave', 'inline-flex', false);
        const saveButton = document.getElementById('btnFullAnalysisSave');
        if (saveButton) saveButton.textContent = '保存到新作品';
    }

    function startDemoFullAnalysis() {
        const progress = document.getElementById('fullAnalysisProgressText');
        const bar = document.getElementById('fullAnalysisProgressBar');
        const log = document.getElementById('fullAnalysisLog');
        if (log) log.innerHTML = '';
        ['fullAnalysisModeSelect', 'fullAnalysisScopeSelect', 'fullAnalysisNormalModel'].forEach(id => {
            const element = document.getElementById(id);
            if (element) element.disabled = true;
        });
        const model = document.getElementById('btnFullAnalysisNormalModel');
        if (model) model.disabled = true;
        setTutorialFullAnalysisButton('btnFullAnalysisStart', 'none', false);
        setTutorialFullAnalysisButton('btnFullAnalysisBack', 'none', false);
        setTutorialFullAnalysisButton('btnFullAnalysisCancel', 'inline-flex', true);
        setTutorialFullAnalysisButton('btnFullAnalysisStopNow', 'inline-flex', true);
        const frames = [
            { percent: 12, title: '正在整理作品章节', log: '已确认 4 个章节的顺序和分卷。' },
            { percent: 38, title: '正在分析人物与事件', log: '第1—2章分析完成：主角目标、雾区规则和首次破局已提取。' },
            { percent: 66, title: '正在梳理剧情与伏笔', log: '第3章分析完成：旧医院线索已接入钟楼主线。' },
            { percent: 84, title: '正在汇总八份关联资料', log: '正在整理大纲、剧情总览、设定、人物和追踪资料。' },
            { percent: 100, title: '全文分析完成，八份资料已汇总', log: '八份关联资料检查完成，可以保存到新作品。' }
        ];
        let index = 0;
        runtime.streamPromise = new Promise(resolve => {
            function nextFrame() {
                if (!runtime.active) return resolve();
                const frame = frames[index];
                if (progress) progress.textContent = frame.title;
                if (bar) bar.style.width = frame.percent + '%';
                appendTutorialFullAnalysisLog(frame.log, frame.percent === 100 ? 'complete' : 'current');
                index += 1;
                if (index < frames.length) {
                    runtime.streamTimer = window.setTimeout(nextFrame, runtime.fastForward ? 0 : 420);
                    return;
                }
                renderDemoFullAnalysisCompletePanel();
                resolve();
            }
            nextFrame();
        });
    }

    function saveDemoFullAnalysis() {
        const name = String(document.getElementById('fullAnalysisNewBookName')?.value || '').trim();
        if (name !== DEMO_FULL_ANALYSIS_RESULT_NAME) return;
        closeModal('fullTextAnalysisModal');
        showTutorialFullAnalysisMemoryPreview();
        window.ZHIYU_TOAST?.success?.('教程分析结果已展示，仅在本次演示中有效');
    }

    function returnToDemoFullAnalysisPanel() {
        hideTutorialMemoryPreview();
        renderDemoFullAnalysisCompletePanel();
        openModal('fullTextAnalysisModal');
    }

    function showDemoFullAnalysisSupplementControls() {
        setTutorialFullAnalysisButton('btnFullAnalysisSkipSegment', 'inline-flex', true);
        setTutorialFullAnalysisButton('btnFullAnalysisCancel', 'inline-flex', true);
        setTutorialFullAnalysisButton('btnFullAnalysisContinue', 'inline-flex', true);
        setTutorialFullAnalysisButton('btnFullAnalysisStopNow', 'inline-flex', true);
        setTutorialFullAnalysisButton('btnFullAnalysisRestart', 'inline-flex', true);
        const danger = document.getElementById('fullAnalysisDangerZone');
        if (danger) {
            danger.classList.add('is-visible');
            danger.style.display = 'flex';
        }
        const deleteButton = document.getElementById('btnFullAnalysisDelete');
        if (deleteButton) deleteButton.disabled = true;
    }

    function showTutorialDecomposeSettingsMemoryPreview() {
        closeModal('editorModal');
        ensureTutorialPageVisible();
        const appState = getAppState();
        if (!appState.ui) appState.ui = {};
        appState.ui.refFileType = 'body';
        appState.ui.refFilesCollapsed = false;
        if (!appState.ui.refUiTransientPreferences) appState.ui.refUiTransientPreferences = {};
        const transient = appState.ui.refUiTransientPreferences;
        const scopedKey = function(raw) {
            return window.AccountDataScope?.key?.(raw) || raw;
        };
        transient[scopedKey('zhiyu_ref_files_collapsed_' + DEMO_BOOK_NAME)] = 0;
        const visibleNames = ['大纲', '剧情总览', '章节粗纲', '阶段粗纲', 'S01阶段粗纲', '拆书设定', '设定集', '信息表', '角色列表', '关键事件表', '资料索引', '追踪表', '边界卡', '承接卡'];
        const visibleKey = window.getRefUiPreferenceKey?.(DEMO_BOOK_NAME, 'body', 'visible');
        const moreKey = window.getRefUiPreferenceKey?.(DEMO_BOOK_NAME, 'body', 'moreExpanded');
        const settingsOpenKey = window.getRefUiPreferenceKey?.(DEMO_BOOK_NAME, 'body', 'settingsOpen');
        if (visibleKey) transient[visibleKey] = visibleNames;
        if (moreKey) transient[moreKey] = 1;
        if (settingsOpenKey) transient[settingsOpenKey] = 0;
        const selector = document.getElementById('bookSel');
        if (selector && !selector.querySelector('[data-tutorial-book-option]')) {
            const option = document.createElement('option');
            option.value = DEMO_BOOK_NAME;
            option.textContent = DEMO_BOOK_NAME;
            option.dataset.tutorialBookOption = '1';
            selector.appendChild(option);
        }
        if (selector) selector.value = DEMO_BOOK_NAME;
        const currentBook = document.getElementById('currentWritingBookName');
        if (currentBook) currentBook.textContent = DEMO_BOOK_NAME + '（不会保存）';
        window.refreshTree?.();
    }

    function findMemoryFileCard(fileName) {
        const expected = String(fileName || '').replace(/\.md$/i, '');
        return Array.from(document.querySelectorAll('#memTree .memory-file-card')).find(card => {
            const key = String(card.dataset.memoryFileKey || '').replace(/\.md$/i, '');
            const name = String(card.querySelector('.memory-file-name')?.textContent || '').trim();
            return isVisible(card) && (key === expected || name === expected);
        }) || null;
    }

    function openTutorialDecomposeSettingsEditor() {
        const title = document.getElementById('edTitle');
        const source = document.getElementById('edText');
        const preview = document.getElementById('edPreview');
        const save = document.getElementById('edSave');
        if (title) title.textContent = '查看：拆书设定.md';
        if (source) {
            source.textContent = DEMO_DECOMPOSE_CONTENT;
            source.contentEditable = 'false';
        }
        if (preview) {
            preview.innerHTML = [
                '<section data-tutorial-decompose-setting="structure"><h4>结构参考</h4><p>失踪哥哥的旧物把人物私愿与城市异常绑定；每章都承担推进主线或验证规则的任务。</p></section>',
                '<section data-tutorial-decompose-setting="rhythm"><h4>节奏参考</h4><p>日常收尾 → 异常亮起 → 现实冲突 → 危险出现；章末用现实出口消失继续抬高悬念。</p></section>',
                '<section data-tutorial-decompose-setting="boundary"><h4>写法边界</h4><p>只借鉴规则递进、职业经验破局和章末扩大谜团的方法，不复制人物与具体事件。</p></section>'
            ].join('');
        }
        if (save) save.disabled = true;
        openModal('editorModal');
    }

    function returnToTutorialFineOutlineForSettings() {
        closeModal('editorModal');
        ensureTutorialPageVisible();
        selectTutorialActionTab('fineOutline');
        const currentBook = document.getElementById('currentWritingBookName');
        if (currentBook) currentBook.textContent = DEMO_BOOK_NAME + '（不会保存）';
        window.refreshAllOGFileStacks?.();
    }

    function closeTutorialDecomposeSettingsEditorForReturn() {
        closeModal('editorModal');
    }

    function openTutorialDecomposeSettingsLinks() {
        const appState = getAppState();
        if (!appState.outlineGen) appState.outlineGen = {};
        Object.assign(appState.outlineGen, {
            linkedFiles: [], linkedFilesByBook: {}, linkedMemoryBookName: DEMO_BOOK_NAME,
            linkedMemoryBookScopeKey: 'tutorial-demo-book', linkedMemoryDefaultsApplied: true
        });
        window.openOGLinkMemorySelector?.();
        const selected = window.getOGLinkedFiles?.();
        if (Array.isArray(selected)) selected.splice(0, selected.length);
        appState.outlineGen.linkedMemoryDefaultsApplied = true;
        window.refreshMemoryLinkTree?.();
        window.updateLinkedMemoryCount?.();
    }

    function ensureTutorialDecomposeSettingsLinkedStack() {
        window.refreshAllOGFileStacks?.();
        const stack = document.getElementById('ogStackLinked');
        if (stack) stack.style.display = 'flex';
    }

    function openTutorialDecomposeSettingsRoleList() {
        window.openOGLinkMemorySelector?.();
    }

    function closeTutorialDecomposeSettingsRoleList() {
        closeModal('memoryLinkModal');
        ensureTutorialPageVisible();
        selectTutorialActionTab('fineOutline');
    }

    function prepareDemoNaturalizePanel() {
        selectTutorialActionTab('fineOutline');
        configureDemoNaturalizePanel();
    }

    function configureDemoNaturalizePanel() {
        window.setAIPolishMode?.('v2');
        const box = document.getElementById('apContentBox');
        if (box) box.textContent = '';
        const label = document.getElementById('naturalizeChapterLabel');
        if (label) label.textContent = '第1章：地图亮起';
        const wordCount = document.getElementById('naturalizeWordCount');
        if (wordCount) wordCount.textContent = '0';
        const replaceStatus = document.getElementById('naturalizeReplaceStatus');
        if (replaceStatus) {
            replaceStatus.textContent = '未替换';
            replaceStatus.classList.remove('is-applied');
            replaceStatus.classList.add('is-unapplied');
        }
        const server = document.getElementById('naturalizeServerStatus');
        if (server) {
            server.textContent = '教程演示已就绪';
            server.className = 'outline-tutorial-server-status is-online outline-tutorial-server-ready';
        }
        const start = document.getElementById('btnNaturalize');
        if (start) {
            start.disabled = false;
            start.textContent = 'AI消痕 低级';
        }
        const apply = document.getElementById('btnAPSave');
        if (apply) {
            apply.disabled = true;
            apply.textContent = '应用到正文';
        }
    }

    function selectTutorialNaturalizeLevel(target) {
        document.querySelectorAll('#naturalizeLevelMenu [data-strength]').forEach(option => {
            option.classList.toggle('active', option === target);
        });
        document.getElementById('naturalizeLevelMenu')?.classList.remove('open');
        document.getElementById('btnNaturalizeLevel')?.setAttribute('aria-expanded', 'false');
        const start = document.getElementById('btnNaturalize');
        if (start) {
            start.disabled = false;
            start.textContent = 'AI消痕 中级';
        }
    }

    function startDemoNaturalizeStream() {
        const box = document.getElementById('apContentBox');
        const start = document.getElementById('btnNaturalize');
        const apply = document.getElementById('btnAPSave');
        const wordCount = document.getElementById('naturalizeWordCount');
        streamTutorialText(box, DEMO_NATURALIZED_CHAPTER, {
            chunkSize: 10,
            interval: 22,
            onStart: function() {
                if (start) {
                    start.disabled = true;
                    start.textContent = '教程消痕中...';
                }
            },
            onDone: function() {
                if (start) {
                    start.disabled = false;
                    start.textContent = 'AI消痕 中级';
                }
                if (apply) apply.disabled = false;
                if (wordCount) wordCount.textContent = String(DEMO_NATURALIZED_CHAPTER.replace(/\s+/g, '').length);
            }
        });
    }

    function openDemoNaturalizeConfirm() {
        const confirm = window.ZHIYU_CONFIRM || window.Confirm;
        if (!confirm?.show) return;
        runtime.pendingDemoConfirm = Promise.resolve(confirm.show('将用AI消痕结果覆盖当前章节正文，此操作不可撤销。确定继续？', { zIndex: 29980 }))
            .then(function(ok) {
                if (ok && runtime.active && runtime.stageId === 'ai-polish') applyDemoNaturalizedChapter();
                return ok;
            });
    }

    function applyDemoNaturalizedChapter() {
        const editor = document.getElementById('resultBox');
        if (editor) editor.innerHTML = toTutorialEditorHtml(DEMO_NATURALIZED_CHAPTER);
        const replaceStatus = document.getElementById('naturalizeReplaceStatus');
        if (replaceStatus) {
            replaceStatus.textContent = '已替换';
            replaceStatus.classList.remove('is-unapplied');
            replaceStatus.classList.add('is-applied');
        }
        window.ZHIYU_TOAST?.success?.('教程优化结果已应用，仅在本次演示中有效');
    }

    function openTutorialPolishModal() {
        const selectedText = runtime.selectedText || DEMO_LOCAL_SELECTION;
        const selected = document.getElementById('polishSelectedText');
        const count = document.getElementById('polishWordCount');
        const instruction = document.getElementById('polishInstruction');
        if (selected) selected.textContent = selectedText;
        if (count) count.textContent = String(selectedText.replace(/\s+/g, '').length);
        if (instruction) instruction.value = '';
        openModal('polishModal');
    }

    function startDemoLocalPolish() {
        const instruction = String(document.getElementById('polishInstruction')?.value || '').trim();
        if (instruction !== DEMO_LOCAL_POLISH_INSTRUCTION) return;
        closeModal('polishModal');
        const editor = document.getElementById('resultBox');
        const polishedChapter = DEMO_CHAPTER.replace(DEMO_LOCAL_SELECTION, DEMO_LOCAL_POLISHED);
        const confirm = document.getElementById('btnConfirm');
        const regen = document.getElementById('btnRegen');
        const cancel = document.getElementById('btnRetry');
        streamTutorialText(editor, polishedChapter, {
            chunkSize: 14,
            interval: 18,
            onStart: function() {
                if (confirm) confirm.disabled = true;
            },
            onDone: function() {
                if (confirm) {
                    confirm.disabled = false;
                    confirm.style.display = 'inline-block';
                    confirm.textContent = '确定润色';
                }
                if (regen) {
                    regen.style.display = 'inline-block';
                    regen.textContent = '🔄 重新润色';
                    regen.dataset.mode = 'repolish';
                }
                if (cancel) {
                    cancel.style.display = 'inline-block';
                    cancel.textContent = '❌ 放弃润色';
                    cancel.dataset.mode = 'cancelPolish';
                }
            }
        });
    }

    function confirmDemoLocalPolish() {
        window.ZHIYU_TOAST?.success?.('教程润色结果已采用，仅在本次演示中有效');
    }

    function openTutorialRewriteModal() {
        document.querySelectorAll('#rwDirectionGroup [data-direction]').forEach(option => {
            option.classList.toggle('is-selected', option.dataset.direction === 'tail');
        });
        setInputValue('rwPlotDescription', '');
        setInputValue('rwTargetWords', '2000');
        const count = document.getElementById('rwLinkedFileCount');
        if (count) count.textContent = '未选择';
        const previous = document.getElementById('rwRefPrevChapter');
        if (previous) previous.textContent = '将自动参考上一章末尾，帮助正文连续衔接。';
        openModal('rewriteModal');
    }

    function openTutorialRewriteMemorySelector() {
        const appState = getAppState();
        if (!appState.gen) appState.gen = {};
        appState.gen.linkedFiles = [];
        window.openLinkMemoryForRewrite?.();
        appState.gen.linkedFiles = [];
        window.refreshMemoryLinkTree?.();
        window.updateLinkedMemoryCount?.();
    }

    function startDemoLocalRewrite() {
        const description = String(document.getElementById('rwPlotDescription')?.value || '').trim();
        const words = String(document.getElementById('rwTargetWords')?.value || '').trim();
        if (description !== DEMO_REWRITE_REQUIREMENT || words !== '1200') return;
        closeModal('rewriteModal');
        const editor = document.getElementById('resultBox');
        const confirm = document.getElementById('btnConfirm');
        streamTutorialText(editor, DEMO_REWRITTEN_CHAPTER, {
            chunkSize: 14,
            interval: 18,
            onStart: function() {
                if (confirm) confirm.disabled = true;
            },
            onDone: function() {
                if (confirm) {
                    confirm.disabled = false;
                    confirm.style.display = 'inline-block';
                    confirm.textContent = '确定使用';
                }
            }
        });
    }

    function confirmDemoLocalRewrite() {
        window.ZHIYU_TOAST?.success?.('教程改写结果已采用，仅在本次演示中有效');
    }

    function showTutorialHistoryButton() {
        const button = document.getElementById('btnHistoryVersions');
        if (button) button.style.display = '';
    }

    function restoreTutorialHistoryButton() {
        const button = document.getElementById('btnHistoryVersions');
        if (button) button.style.display = runtime.snapshot?.historyButtonHidden ? 'none' : '';
    }

    function saveDemoOutline() {
        window.ZHIYU_TOAST?.success?.('教程大纲已保存，仅在本次演示中有效');
        closeModal('outlineModal');
        ensureTutorialPageVisible();
    }

    function updateLayerPosition(force) {
        if (!runtime.active || !runtime.root || !runtime.target || !isVisible(runtime.target)) return;
        const rect = runtime.target.getBoundingClientRect();
        const actionRect = isVisible(runtime.actionTarget) ? runtime.actionTarget.getBoundingClientRect() : null;
        const left = Math.max(4, rect.left - TARGET_PADDING);
        const top = Math.max(4, rect.top - TARGET_PADDING);
        const right = Math.min(window.innerWidth - 4, rect.right + TARGET_PADDING);
        const bottom = Math.min(window.innerHeight - 4, rect.bottom + TARGET_PADDING);
        const key = [left, top, right, bottom, actionRect?.left, actionRect?.top, actionRect?.right, actionRect?.bottom]
            .map(value => Math.round(value || 0)).join(':');
        if (!force && key === runtime.lastRectKey) return;
        runtime.lastRectKey = key;
        const masks = {
            top: runtime.root.querySelector('.outline-tutorial-mask-top'),
            right: runtime.root.querySelector('.outline-tutorial-mask-right'),
            bottom: runtime.root.querySelector('.outline-tutorial-mask-bottom'),
            left: runtime.root.querySelector('.outline-tutorial-mask-left')
        };
        Object.assign(masks.top.style, { left: '0px', top: '0px', width: '100vw', height: top + 'px' });
        Object.assign(masks.bottom.style, { left: '0px', top: bottom + 'px', width: '100vw', height: Math.max(0, window.innerHeight - bottom) + 'px' });
        Object.assign(masks.left.style, { left: '0px', top: top + 'px', width: left + 'px', height: Math.max(0, bottom - top) + 'px' });
        Object.assign(masks.right.style, { left: right + 'px', top: top + 'px', width: Math.max(0, window.innerWidth - right) + 'px', height: Math.max(0, bottom - top) + 'px' });
        const spotlight = runtime.root.querySelector('.outline-tutorial-spotlight');
        const blocker = runtime.root.querySelector('.outline-tutorial-hole-blocker');
        const targetRadius = window.getComputedStyle(runtime.target).borderRadius || '10px';
        [spotlight, blocker].forEach(element => Object.assign(element.style, {
            left: left + 'px', top: top + 'px', width: Math.max(0, right - left) + 'px', height: Math.max(0, bottom - top) + 'px',
            borderRadius: targetRadius
        }));
        const actionRing = runtime.root.querySelector('.outline-tutorial-action-ring');
        TUTORIAL_POSITIONING.positionActionRing(actionRing, runtime.actionTarget, actionRect);
        TUTORIAL_POSITIONING.positionNote(runtime.root.querySelector('.outline-tutorial-note'), actionRect ? {
            left: Math.max(4, actionRect.left),
            top: Math.max(4, actionRect.top),
            right: Math.min(window.innerWidth - 4, actionRect.right),
            bottom: Math.min(window.innerHeight - 4, actionRect.bottom)
        } : { left, top, right, bottom }, runtime.target !== runtime.actionTarget ? { left, top, right, bottom } : null);
    }

    function positionLoop() {
        if (!runtime.active) return;
        updateLayerPosition(false);
        runtime.frame = window.requestAnimationFrame(positionLoop);
    }

    function waitForTarget(step) {
        window.clearTimeout(runtime.targetWaitTimer);
        const started = Date.now();
        return new Promise((resolve, reject) => {
            function inspect() {
                if (!runtime.active) return reject(new Error('tutorial-stopped'));
                const target = resolveTarget(step);
                if (target) return resolve(target);
                if (Date.now() - started >= TARGET_WAIT_MS) return reject(new Error('target-not-found:' + step.id));
                runtime.targetWaitTimer = window.setTimeout(inspect, 80);
            }
            inspect();
        });
    }

    async function runShowStep() {
        if (!runtime.active) return;
        const step = runtime.steps[runtime.index];
        if (!step) return finishStage();
        if (typeof step.prepare === 'function') step.prepare();
        let actionTarget = null;
        try {
            actionTarget = await waitForTarget(step);
            runtime.target = resolveSpotlightTarget(step, actionTarget);
            setActionHighlight(actionTarget, step);
        } catch (error) {
            if (!runtime.active || runtime.steps[runtime.index] !== step) return;
            showRecoverableTargetError(step);
            return;
        }
        const scrolled = TUTORIAL_POSITIONING.ensureActionTargetVisible(actionTarget, runtime.target);
        await new Promise(resolve => window.setTimeout(resolve, scrolled && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 260 : 0));
        if (!runtime.active || runtime.steps[runtime.index] !== step) return;
        const root = createLayer();
        runtime.transitioning = false;
        root.classList.add('active');
        root.classList.toggle('is-info-step', step.type === 'info' || step.type === 'wait');
        root.classList.toggle('is-framed-target', runtime.target !== runtime.actionTarget);
        root.dataset.tutorialStageId = runtime.stageId;
        root.dataset.tutorialStepId = step.id;
        root.dataset.tutorialStepType = step.type;
        root.querySelector('.outline-tutorial-progress').textContent = runtime.stageTitle + ' ' + (runtime.index + 1) + '/' + runtime.steps.length;
        root.querySelector('#outlineTutorialTitle').textContent = step.title;
        root.querySelector('.outline-tutorial-copy').textContent = step.body;
        const framedTarget = runtime.target !== runtime.actionTarget;
        root.querySelector('.outline-tutorial-hint').textContent = step.type === 'click'
            ? (framedTarget ? '请点击窗口内发光位置继续' : '请点击高亮区域继续')
            : (step.type === 'input'
                ? (framedTarget ? '请点击窗口内发光输入框' : '请在高亮区域完成指定输入')
                    : (step.type === 'change'
                        ? '请在高亮区域选择指定选项'
                        : (step.type === 'selection' ? '请亲自拖动选择指定文字' : (step.type === 'wait' ? '正在播放教程内容' : '这是功能说明'))));
        if (typeof step.onProgress === 'function') step.onProgress();
        const skipButton = root.querySelector('.outline-tutorial-skip-step');
        skipButton.hidden = !['click', 'input', 'change', 'selection', 'wait'].includes(step.type);
        skipButton.disabled = false;
        skipButton.textContent = step.type === 'wait' ? '立即显示全部' : '跳过本步';
        const previousButton = root.querySelector('.outline-tutorial-previous');
        previousButton.hidden = runtime.index === 0;
        previousButton.disabled = runtime.replaying;
        const nextButton = root.querySelector('.outline-tutorial-next');
        nextButton.hidden = step.type !== 'info';
        nextButton.disabled = false;
        nextButton.classList.toggle('is-guided-action', step.type === 'info');
        const blocker = root.querySelector('.outline-tutorial-hole-blocker');
        const opensHole = ['click', 'input', 'change', 'selection'].includes(step.type);
        blocker.hidden = false;
        runtime.lastRectKey = '';
        updateLayerPosition(true);
        window.clearTimeout(runtime.targetOpenTimer);
        if (opensHole) {
            const openHole = function() {
                if (runtime.active && runtime.steps[runtime.index] === step) blocker.hidden = true;
            };
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) openHole();
            else runtime.targetOpenTimer = window.setTimeout(openHole, 260);
        }
        if (step.type === 'wait') {
            Promise.resolve(step.run?.()).then(function() {
                if (!runtime.active || runtime.steps[runtime.index] !== step) return;
                runtime.targetWaitTimer = window.setTimeout(function() {
                    if (runtime.active && runtime.steps[runtime.index] === step) advanceStep();
                }, 2450);
            }).catch(error => handleTutorialRuntimeFailure(error, '教程内容播放失败'));
        }
    }

    function showStep() {
        return runShowStep().catch(error => handleTutorialRuntimeFailure(error, '教程步骤执行失败'));
    }

    function advanceStep() {
        if (!runtime.active || runtime.transitioning) return;
        runtime.transitioning = true;
        window.clearTimeout(runtime.targetOpenTimer);
        clearActionHighlight();
        const current = runtime.steps[runtime.index];
        if (typeof current?.after === 'function') current.after();
        if (current?.type === 'wait') runtime.fastForward = false;
        const blocker = runtime.root?.querySelector('.outline-tutorial-hole-blocker');
        if (blocker) blocker.hidden = false;
        runtime.index += 1;
        runtime.root?.querySelectorAll('.outline-tutorial-next, .outline-tutorial-skip-step, .outline-tutorial-previous').forEach(button => { button.disabled = true; });
        runtime.root?.querySelector('.outline-tutorial-note')?.classList.add('is-changing');
        window.setTimeout(function() {
            runtime.root?.querySelector('.outline-tutorial-note')?.classList.remove('is-changing');
            showStep();
        }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 100);
    }

    function skipStep() {
        if (!runtime.active || runtime.replaying || runtime.transitioning) return;
        const step = runtime.steps[runtime.index];
        if (step?.type === 'wait') {
            runtime.fastForward = true;
            const button = runtime.root?.querySelector('.outline-tutorial-skip-step');
            if (button) {
                button.disabled = true;
                button.textContent = '正在显示全部…';
            }
            return;
        }
        runtime.replaying = true;
        try {
            if (typeof step?.skip === 'function') step.skip();
            else applySafeSkip(step?.id);
        } finally {
            runtime.replaying = false;
        }
        advanceStep();
    }

    function handleDocumentClick(event) {
        if (!runtime.active || runtime.replaying || runtime.transitioning || runtime.root?.contains(event.target)) return;
        const step = runtime.steps[runtime.index];
        if (!step) return;
        const target = resolveTarget(step);
        const clickedTarget = target && (target === event.target || target.contains(event.target));
        if (step.type !== 'click') {
            if (['input', 'change', 'selection'].includes(step.type) && !clickedTarget && runtime.target?.contains?.(event.target)) {
                event.preventDefault();
                event.stopImmediatePropagation();
                showWrongTargetFeedback();
            }
            return;
        }
        if (!clickedTarget) {
            if (runtime.target?.contains?.(event.target)) {
                event.preventDefault();
                event.stopImmediatePropagation();
                showWrongTargetFeedback();
            }
            return;
        }
        if (typeof step.allowClick === 'function' && !step.allowClick(event.target, event)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }
        if (typeof step.intercept === 'function') {
            event.preventDefault();
            event.stopImmediatePropagation();
            step.intercept(target, event);
        }
        window.setTimeout(function() {
            if (!runtime.active || runtime.steps[runtime.index] !== step) return;
            if (typeof step.isComplete === 'function' && !step.isComplete()) return;
            advanceStep();
        }, 0);
    }

    function handleDocumentInput(event) {
        if (!runtime.active || runtime.replaying || runtime.transitioning || runtime.root?.contains(event.target)) return;
        const step = runtime.steps[runtime.index];
        if (!step || step.type !== 'input') return;
        const target = resolveTarget(step);
        if (!target || !(target === event.target || target.contains(event.target))) return;
        event.stopImmediatePropagation();
        const value = String(event.target.value || '').trim();
        const valid = typeof step.validate === 'function'
            ? step.validate(value, event.target)
            : value === String(step.expectedValue || '').trim();
        if (!valid) return;
        window.setTimeout(function() {
            if (runtime.active && runtime.steps[runtime.index] === step) advanceStep();
        }, 0);
    }

    function handleDocumentChange(event) {
        if (!runtime.active || runtime.replaying || runtime.transitioning || runtime.root?.contains(event.target)) return;
        const step = runtime.steps[runtime.index];
        if (!step || step.type !== 'change') return;
        const target = resolveTarget(step);
        if (!target || !(target === event.target || target.contains(event.target))) return;
        const value = String(event.target.value || '').trim();
        const valid = typeof step.validate === 'function'
            ? step.validate(value, event.target)
            : value === String(step.expectedValue || '').trim();
        if (!valid) return;
        if (typeof step.intercept === 'function') {
            event.preventDefault();
            event.stopImmediatePropagation();
            step.intercept(event.target, event);
        }
        window.setTimeout(function() {
            if (runtime.active && runtime.steps[runtime.index] === step) advanceStep();
        }, 0);
    }

    function handleDocumentSelection() {
        if (!runtime.active || runtime.replaying || runtime.transitioning) return;
        const step = runtime.steps[runtime.index];
        if (!step || step.type !== 'selection') return;
        const target = resolveTarget(step);
        const selection = window.getSelection?.();
        if (!target || !selection || selection.rangeCount < 1 || selection.isCollapsed) return;
        const range = selection.getRangeAt(0);
        const common = range.commonAncestorContainer?.nodeType === Node.ELEMENT_NODE
            ? range.commonAncestorContainer
            : range.commonAncestorContainer?.parentElement;
        if (!common || !target.contains(common)) return;
        const text = String(selection.toString() || '').trim();
        const valid = typeof step.validateSelection === 'function'
            ? step.validateSelection(text, selection, target)
            : !!text;
        if (!valid) return;
        runtime.selectedText = text;
        window.setTimeout(function() {
            if (runtime.active && runtime.steps[runtime.index] === step) advanceStep();
        }, 120);
    }

    function showWrongTargetFeedback() {
        if (!runtime.root) return;
        const note = runtime.root.querySelector('.outline-tutorial-note');
        const spotlight = runtime.root.querySelector('.outline-tutorial-spotlight');
        const actionRing = runtime.root.querySelector('.outline-tutorial-action-ring');
        note.classList.remove('is-wrong');
        spotlight.classList.remove('is-wrong');
        actionRing?.classList.remove('is-wrong');
        void note.offsetWidth;
        note.classList.add('is-wrong');
        spotlight.classList.add('is-wrong');
        actionRing?.classList.add('is-wrong');
    }

    function showRecoverableTargetError(step) {
        runtime.transitioning = false;
        const root = createLayer();
        clearActionHighlight();
        runtime.target = document.body;
        root.classList.add('active', 'is-target-error');
        root.querySelector('.outline-tutorial-progress').textContent = runtime.stageTitle;
        root.querySelector('#outlineTutorialTitle').textContent = '暂时没有找到这个按钮';
        root.querySelector('.outline-tutorial-copy').textContent = '目标“' + step.title + '”还没有显示。您可以跳过本步，或关闭教程后重新开始。';
        root.querySelector('.outline-tutorial-hint').textContent = '教程没有替您自动完成该操作';
        root.querySelector('.outline-tutorial-next').hidden = true;
        root.querySelector('.outline-tutorial-skip-step').hidden = false;
        root.querySelector('.outline-tutorial-skip-step').disabled = false;
        root.querySelector('.outline-tutorial-hole-blocker').hidden = false;
        updateLayerPosition(true);
    }

    function skipCurrentStage() {
        if (!runtime.active) return;
        const nextStageId = runtime.flowMode === 'mainline' ? getNextMainlineStageId(runtime.stageId) : '';
        if (nextStageId && IMPLEMENTED_STAGE_IDS.has(nextStageId)) {
            startStage(nextStageId, { flowMode: 'mainline' });
            return;
        }
        finishStage();
    }

    function finishStage() {
        if (!runtime.active) return;
        runtime.transitioning = false;
        window.clearTimeout(runtime.streamTimer);
        hideTutorialMemoryPreview();
        delete window.ZHIYU_IMPORT_PREVIEW_CONTEXT;
        TUTORIAL_MODAL_IDS.forEach(closeModal);
        restoreTutorialCoverDownloadButton();
        const root = createLayer();
        clearActionHighlight();
        root.classList.add('active', 'is-complete');
        root.classList.remove('is-info-step', 'is-target-error');
        root.querySelectorAll('.outline-tutorial-mask').forEach(mask => mask.removeAttribute('style'));
        root.querySelector('.outline-tutorial-spotlight').removeAttribute('style');
        root.querySelector('.outline-tutorial-hole-blocker').hidden = false;
        const note = root.querySelector('.outline-tutorial-note');
        note.removeAttribute('style');
        root.querySelector('.outline-tutorial-progress').textContent = runtime.stageTitle + '阶段完成';
        root.querySelector('#outlineTutorialTitle').textContent = '您已经走完' + runtime.stageTitle + '流程';
        root.querySelector('.outline-tutorial-copy').textContent = getStageCompletionCopy(runtime.stageId);
        const nextStageId = runtime.flowMode === 'mainline' ? getNextMainlineStageId(runtime.stageId) : '';
        const nextStage = getStageMeta(nextStageId);
        const canContinue = nextStage && IMPLEMENTED_STAGE_IDS.has(nextStageId);
        root.querySelector('.outline-tutorial-hint').textContent = canContinue
            ? '可以继续进入“' + nextStage.title + '”，也可以返回目录选择其他功能。'
            : '可以返回教程目录，单独选择想体验的功能。';
        const actions = root.querySelector('.outline-tutorial-note-actions');
        const buttons = [
            createButton('outline-tutorial-secondary', '返回教程目录', returnToTutorialMenu),
            createButton('outline-tutorial-secondary', '再体验一次', function() {
                const stageId = runtime.stageId;
                const flowMode = runtime.flowMode;
                startStage(stageId, { flowMode });
            })
        ];
        if (canContinue) {
            buttons.push(createButton('outline-tutorial-primary', '继续：' + nextStage.title, function() {
                startStage(nextStageId, { flowMode: 'mainline' });
            }));
        } else {
            buttons.push(createButton('outline-tutorial-primary', '结束教程', stopTutorial));
        }
        actions.replaceChildren(...buttons);
    }

    async function returnToTutorialMenu() {
        await stopTutorial({ stayOnPage: true, skipConfirm: true });
        openTutorialMenu({ fromHomepage: runtime.returnToHomepageOnExit });
    }

    function forceTutorialCleanup() {
        runtime.active = false;
        window.clearTimeout(runtime.streamTimer);
        window.clearTimeout(runtime.targetWaitTimer);
        window.clearTimeout(runtime.targetOpenTimer);
        window.cancelAnimationFrame(runtime.frame);
        TUTORIAL_MODAL_IDS.forEach(id => { try { closeModal(id); } catch (error) {} });
        runtime.root?.remove();
        runtime.root = null;
        clearActionHighlight();
        document.querySelectorAll('[data-tutorial-target-active], [data-tutorial-model], .outline-tutorial-action-target, .outline-tutorial-info-target, .outline-tutorial-link-required, .outline-tutorial-streaming, .outline-tutorial-stream-complete').forEach(element => {
            element.classList.remove('outline-tutorial-action-target', 'outline-tutorial-info-target', 'outline-tutorial-link-required', 'outline-tutorial-streaming', 'outline-tutorial-stream-complete', 'is-wrong');
            element.removeAttribute('data-tutorial-target-active');
            element.removeAttribute('data-tutorial-model');
        });
        document.getAnimations?.({ subtree: true }).forEach(animation => {
            if (/^outlineTutorial/.test(animation.animationName || '')) animation.cancel();
        });
        runtime.target = null;
        runtime.streamPromise = null;
        runtime.fastForward = false;
        runtime.replaying = false;
        runtime.transitioning = false;
        window.ZHIYU_OPERATION_TUTORIAL_STORAGE_BLOCK_UNTIL = Date.now() + 600;
        document.body?.classList.remove('zhiyu-outline-tutorial-active');
        delete document.documentElement.dataset.operationTutorialNetworkBlocked;
        delete window.ZHIYU_TEMPLATE_PREVIEW_CONTEXT;
        delete window.ZHIYU_MODEL_PREVIEW_CONTEXT;
        delete window.ZHIYU_IMPORT_PREVIEW_CONTEXT;
        delete window.ZHIYU_MEMORY_LINK_TUTORIAL_CONTEXT;
        delete window.ZHIYU_MEMORY_PREVIEW_CONTEXT;
        delete window.ZHIYU_BOOK_PREVIEW_CONTEXT;
        try { restoreTutorialFetchGuard(); } catch (error) {}
    }

    function handleTutorialRuntimeFailure(error, message) {
        if (!runtime.active) return;
        try {
            if (runtime.snapshot) restoreTutorialState();
        } catch (restoreError) {
            console.error('[operation-tutorial] 异常后的页面恢复失败', restoreError);
        } finally {
            runtime.snapshot = null;
            forceTutorialCleanup();
        }
        console.error('[operation-tutorial] ' + message, error);
        try { window.ZHIYU_TOAST?.error?.('操作引导出现异常，页面已恢复，请稍后重试'); } catch (toastError) {}
    }

    async function stopTutorial(options) {
        if (!runtime.active) return;
        const stageCompleted = runtime.root?.classList.contains('is-complete') === true;
        const shouldConfirmExit = runtime.index > 0 && !stageCompleted && options?.skipConfirm !== true;
        if (shouldConfirmExit) {
            const confirm = window.ZHIYU_CONFIRM || window.Confirm;
            if (confirm?.show) {
                const confirmation = confirm.show('退出后，本阶段的演示进度会清除。确定退出吗？', {
                    confirmText: '退出教程', cancelText: '继续教程', zIndex: 2147483646
                });
                const continueButton = document.getElementById('_cfmCancel');
                if (continueButton) continueButton.textContent = '继续教程';
                const confirmed = await confirmation;
                if (!confirmed || !runtime.active) return;
            }
        }
        const shouldReturnToHomepage = runtime.returnToHomepageOnExit && options?.stayOnPage !== true;
        const closingRoot = runtime.root;
        const animateExit = options?.skipConfirm !== true && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        runtime.closing = true;
        runtime.active = false;
        try {
            document.getElementById('_cfmCancel')?.click();
            window.clearTimeout(runtime.streamTimer);
            window.clearTimeout(runtime.targetWaitTimer);
            window.clearTimeout(runtime.targetOpenTimer);
            window.cancelAnimationFrame(runtime.frame);
            TUTORIAL_MODAL_IDS.forEach(closeModal);
            document.querySelectorAll('[data-tutorial-model]').forEach(card => card.removeAttribute('data-tutorial-model'));
            delete window.ZHIYU_TEMPLATE_PREVIEW_CONTEXT;
            delete window.ZHIYU_MODEL_PREVIEW_CONTEXT;
            delete window.ZHIYU_IMPORT_PREVIEW_CONTEXT;
            delete window.ZHIYU_MEMORY_LINK_TUTORIAL_CONTEXT;
            hideTutorialMemoryPreview();
            document.getElementById('outlineResultBox')?.classList.remove('outline-tutorial-streaming', 'outline-tutorial-stream-complete');
            document.getElementById('createBookSynopsisPreviewText')?.classList.remove('outline-tutorial-streaming', 'outline-tutorial-stream-complete', 'is-generating');
            document.getElementById('ogContentBox')?.classList.remove('outline-tutorial-streaming', 'outline-tutorial-stream-complete');
            document.getElementById('resultBox')?.classList.remove('outline-tutorial-streaming', 'outline-tutorial-stream-complete');
            document.getElementById('apContentBox')?.classList.remove('outline-tutorial-streaming', 'outline-tutorial-stream-complete');
            restoreTutorialCoverDownloadButton();
            restoreTutorialHistoryButton();
            clearActionHighlight();
            runtime.target = null;
            runtime.streamPromise = null;
            runtime.fastForward = false;
            runtime.replaying = false;
            runtime.transitioning = false;
            if (shouldReturnToHomepage) {
                runtime.snapshot = null;
                if (animateExit && closingRoot) {
                    closingRoot.classList.add('is-closing');
                    await new Promise(resolve => window.setTimeout(resolve, 160));
                }
                window.location.assign(NEW_HOMEPAGE_PATH);
                return;
            }
            hideTutorialBookPreview();
            try {
                restoreTutorialState();
            } catch (error) {
                console.error('[operation-tutorial] 页面状态恢复失败', error);
            }
            runtime.snapshot = null;
            runtime.stageId = '';
            runtime.stageTitle = '';
            if (animateExit && closingRoot) {
                closingRoot.classList.add('is-closing');
                await new Promise(resolve => window.setTimeout(resolve, 160));
            }
            runtime.root?.remove();
            runtime.root = null;
        } finally {
            forceTutorialCleanup();
            runtime.closing = false;
        }
    }

    function buildStageSteps(stageId) {
        return getTutorialMainlineBuilders().buildStageSteps(stageId)
            || getTutorialExtraRuntime().buildStageSteps(stageId)
            || [];
    }
    async function startStage(stageId, options) {
        const stage = getStageMeta(stageId);
        if (!stage || !IMPLEMENTED_STAGE_IDS.has(stageId)) return;
        if (runtime.closing) return;
        if (!runtime.active && hasActiveFormalGeneration()) {
            window.ZHIYU_TOAST?.warn?.('当前有真实生成任务正在运行，请等待任务结束后再开始操作引导。');
            return;
        }
        if (runtime.active) await stopTutorial({ stayOnPage: true, skipConfirm: true });
        runtime.menuRoot?.classList.remove('active');
        runtime.closing = false;
        runtime.active = true;
        document.body.classList.add('zhiyu-outline-tutorial-active');
        installTutorialFetchGuard();
        runtime.index = 0;
        runtime.stageId = stageId;
        runtime.stageTitle = stage.title;
        runtime.flowMode = options?.flowMode === 'mainline' ? 'mainline' : 'individual';
        runtime.fastForward = false;
        runtime.replaying = false;
        runtime.transitioning = false;
        try {
            runtime.steps = buildStageSteps(stageId);
            runtime.snapshot = snapshotTutorialState();
            prepareStage(stageId);
            createLayer();
            runtime.frame = window.requestAnimationFrame(positionLoop);
            showStep();
        } catch (error) {
            try {
                if (runtime.snapshot) restoreTutorialState();
            } catch (restoreError) {
                console.error('[operation-tutorial] 启动失败后的页面恢复失败', restoreError);
            } finally {
                runtime.snapshot = null;
                forceTutorialCleanup();
            }
            console.error('[operation-tutorial] 教程启动失败', error);
            window.ZHIYU_TOAST?.error?.('操作引导暂时无法启动，请稍后重试');
        }
    }

    function startTutorial() {
        startStage(TUTORIAL_ID, { flowMode: 'individual' });
    }

    function createEntryButton(id, className, title, subtitle, action) {
        const button = document.createElement('button');
        button.type = 'button';
        button.id = id;
        button.className = className;
        button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v12H8l-4 3z"/><path d="M8 9h8M8 13h5"/></svg><span><strong>' + title + '</strong><small>' + subtitle + '</small></span>';
        button.addEventListener('click', action);
        return button;
    }

    function installTutorialEntries() {
        const entry = document.getElementById('btnOperationTutorialSidebar');
        if (entry && entry.dataset.operationTutorialBound !== '1') {
            entry.dataset.operationTutorialBound = '1';
            entry.addEventListener('click', function() {
                openTutorialMenu({ fromHomepage: false });
            });
        }
        if (!runtime.autoStarted && REQUESTED_FROM_HOMEPAGE) {
            runtime.autoStarted = true;
            runtime.returnToHomepageOnExit = true;
            window.setTimeout(function() {
                if (REQUESTED_TUTORIAL === TUTORIAL_MENU_ID || !IMPLEMENTED_STAGE_IDS.has(REQUESTED_TUTORIAL)) {
                    openTutorialMenu({ fromHomepage: true });
                } else {
                    startStage(REQUESTED_TUTORIAL, { flowMode: 'individual' });
                }
            }, 700);
        }
    }

    document.addEventListener('click', handleDocumentClick, true);
    document.addEventListener('input', handleDocumentInput, true);
    document.addEventListener('change', handleDocumentChange, true);
    document.addEventListener('selectionchange', handleDocumentSelection);
    window.addEventListener('resize', function() { updateLayerPosition(true); });
    window.ZHIYU_OPERATION_TUTORIAL = Object.freeze({
        startOutline: startTutorial,
        startStage,
        openMenu: openTutorialMenu,
        stop: stopTutorial,
        isActive: function() { return runtime.active; },
        stages: STAGE_CATALOG,
        interceptedActions: INTERCEPTED_ACTIONS
    });

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installTutorialEntries, { once: true });
    else installTutorialEntries();
})(window, document);
