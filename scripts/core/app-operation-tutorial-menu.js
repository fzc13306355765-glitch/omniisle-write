(function(window, document) {
    'use strict';

    const STAGE_CATALOG = Object.freeze([
        { id: 'new-book', title: '新建作品', group: '主线创作', summary: '认识作品名称、频道、题材、简介和创建入口。' },
        { id: 'outline', title: '普通大纲', group: '主线创作', summary: '从题材和模板开始，生成并认识关联记忆文件。' },
        { id: 'fine-outline', title: '细纲', group: '主线创作', summary: '选择大纲和关联资料，生成章节级细纲。' },
        { id: 'chapter', title: '生成正文', group: '主线创作', summary: '使用细纲、参考上文和模板生成章节正文。' },
        { id: 'ai-polish', title: 'AI优化', group: '正文处理', summary: '体验整章优化与 AI 消痕。' },
        { id: 'local-polish', title: '局部润色', group: '正文处理', summary: '选中正文后，只润色指定片段。' },
        { id: 'local-rewrite', title: '局部改写', group: '正文处理', summary: '选中正文后，按要求重写指定片段。' },
        { id: 'advanced-outline', title: '高级大纲', group: '大纲扩展', summary: '按更完整的阶段规划生成高级大纲。' },
        { id: 'stage-outline', title: '阶段粗纲', group: '大纲扩展', summary: '根据总纲继续拆出一个阶段的粗纲。' },
        { id: 'functional', title: '功能性生成', group: '大纲扩展', summary: '认识角色、世界观等功能性生成入口。' },
        { id: 'decompose', title: '拆书', group: '分析拆解', summary: '导入章节并分析结构、节奏和写法。' },
        { id: 'full-analysis', title: '全文分析', group: '分析拆解', summary: '选择范围和模式，体验长篇全文分析。' },
        { id: 'decompose-settings', title: '认识关联文件', group: '创作基础', summary: '认识章节目录下方的关联文件、选择规则和显示设置。' }
    ]);
    const META = Object.freeze({
        stageCatalog: STAGE_CATALOG,
        mainlineStageIds: Object.freeze(['new-book', 'outline', 'fine-outline', 'chapter']),
        implementedStageIds: Object.freeze(['new-book', 'outline', 'fine-outline', 'chapter', 'ai-polish', 'local-polish', 'local-rewrite', 'advanced-outline', 'stage-outline', 'functional', 'decompose', 'full-analysis', 'decompose-settings']),
        interceptedActions: Object.freeze(['btnStartOutline', 'btnOutlineSave', 'btnGenerateBookSynopsis', 'btnConfirmCreateBook', 'btnOGSend', 'btnOGSave', 'btnComposerGenerate', 'btnConfirm', 'btnSaveNewChapter', 'btnNaturalize', 'btnAPSave', 'btnStartPolish', 'btnRWStart', 'btnDCSave', 'btnConfirmImport', 'btnImportAnalyze', 'btnFullAnalysisStart', 'btnFullAnalysisSave']),
        modalIds: Object.freeze(['outlineModal', 'templateSelectModal', 'modelSelectModal', 'genrePreferenceTagModal', 'createBookModal', 'createBookSynopsisModal', 'outlinePickerModal', 'ogOutlineFileModal', 'memoryLinkModal', 'refChapterModal', 'polishModal', 'rewriteModal', 'decomposeImportModal', 'importBookModal', 'importParseModal', 'fullTextAnalysisModal', 'editorModal'])
    });

    function createRuntime(api) {
        const {
            runtime, STAGE_CATALOG, IMPLEMENTED_STAGE_IDS, MAINLINE_STAGE_IDS,
            NEW_HOMEPAGE_PATH, startStage
        } = api;

        function createTutorialMenu() {
            if (runtime.menuRoot?.isConnected) return runtime.menuRoot;
            const root = document.createElement('div');
            root.className = 'operation-tutorial-menu-layer';
            root.innerHTML = [
                '<section class="operation-tutorial-menu" role="dialog" aria-modal="true" aria-labelledby="operationTutorialMenuTitle">',
                '  <header class="operation-tutorial-menu-head">',
                '    <div><span class="operation-tutorial-menu-kicker">知屿写作</span><h2 id="operationTutorialMenuTitle">操作引导教程</h2></div>',
                '    <button class="operation-tutorial-menu-close" type="button" aria-label="关闭操作引导教程">×</button>',
                '  </header>',
                '  <p class="operation-tutorial-menu-copy">无需登录，亲手完成从新建作品到生成正文的全过程。</p>',
                '  <div class="operation-tutorial-mainline">',
                '    <div><strong>完整创作流程</strong><span>新建作品 → 普通大纲 → 细纲 → 生成正文</span></div>',
                '    <button class="operation-tutorial-mainline-start" type="button">从新建作品开始</button>',
                '  </div>',
                '  <div class="operation-tutorial-stage-groups"></div>',
                '</section>'
            ].join('');
            const groups = root.querySelector('.operation-tutorial-stage-groups');
            [...new Set(STAGE_CATALOG.map(stage => stage.group))].forEach(groupName => {
                const section = document.createElement('section');
                section.className = 'operation-tutorial-stage-group';
                const heading = document.createElement('h3');
                heading.textContent = groupName;
                const grid = document.createElement('div');
                grid.className = 'operation-tutorial-stage-grid';
                STAGE_CATALOG.filter(stage => stage.group === groupName).forEach(stage => {
                    const available = IMPLEMENTED_STAGE_IDS.has(stage.id);
                    const card = document.createElement('button');
                    card.type = 'button';
                    card.className = 'operation-tutorial-stage-card';
                    card.disabled = !available;
                    card.dataset.stageId = stage.id;
                    card.innerHTML = '<strong>' + stage.title + '</strong><span>' + stage.summary + '</span><small>' + (available ? '单独体验' : '制作中') + '</small>';
                    if (available) card.addEventListener('click', function() { startStage(stage.id, { flowMode: 'individual' }); });
                    grid.appendChild(card);
                });
                section.append(heading, grid);
                groups.appendChild(section);
            });
            root.querySelector('.operation-tutorial-mainline-start').addEventListener('click', function() {
                startStage(MAINLINE_STAGE_IDS[0], { flowMode: 'mainline' });
            });
            root.querySelector('.operation-tutorial-menu-close').addEventListener('click', closeTutorialMenu);
            root.addEventListener('click', function(event) {
                if (event.target === root) closeTutorialMenu();
            });
            document.body.appendChild(root);
            runtime.menuRoot = root;
            return root;
        }

        function openTutorialMenu(options) {
            if (options?.fromHomepage === true) runtime.returnToHomepageOnExit = true;
            document.body.classList.add('zhiyu-outline-tutorial-active');
            createTutorialMenu().classList.add('active');
        }

        function closeTutorialMenu(options) {
            runtime.menuRoot?.classList.remove('active');
            if (runtime.returnToHomepageOnExit && options?.stayOnPage !== true) {
                window.location.assign(NEW_HOMEPAGE_PATH);
                return;
            }
            document.body.classList.remove('zhiyu-outline-tutorial-active');
        }

        return Object.freeze({ createTutorialMenu, openTutorialMenu, closeTutorialMenu });
    }

    window.ZHIYU_OPERATION_TUTORIAL_MENU_PACK = Object.freeze({ createRuntime, meta: META });
})(window, document);
