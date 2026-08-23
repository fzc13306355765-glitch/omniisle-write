(function(window, document) {
    'use strict';

    const DEMO_SYNOPSIS_REQUIREMENT = '男主周砚是夜班代驾，意外得到一张会标记午夜雾区的旧城地图。他要寻找失踪三年的哥哥，并阻止第七座钟楼敲响。';
    const DEMO_SYNOPSIS = '临海城午夜起雾后，会出现只有少数人能看见的危险区域。夜班代驾周砚意外得到一张会提前标记雾区的旧城地图，每解决一次异常，地图便补全一段被城市抹去的历史。\n\n为了寻找失踪三年的哥哥，他加入秘密巡查队，却发现哥哥留下的线索都指向即将苏醒的第七座钟楼。地图能帮他避开死亡，也在把他变成怪物眼中最清晰的坐标。';
    const DEMO_FINE_REQUIREMENT = '先生成第1章细纲，重点写周砚第一次发现旧城地图会标记雾区，并在结尾留下地铁末班车异常。';
    const DEMO_FINE_SOURCE = [
        '## 第1章：地图亮起',
        '周砚在一次夜班代驾途中收到哥哥留下的旧城地图，地图在午夜标出一处不存在的地铁出口。',
        '',
        '## 第2章：末班车没有终点',
        '周砚跟随地图进入末班车，在重复的报站声中救下急诊医生沈青禾，并第一次看见雾区规则。'
    ].join('\n');
    const DEMO_FINE_OUTLINE = [
        '## 第1章：地图亮起',
        '',
        '【本章目标】让周砚得到旧城地图，亲眼确认雾区存在，并主动踏入第一起异常。',
        '',
        '【开场】深夜十一点五十分，周砚送完最后一位代驾客人，在后座夹层发现哥哥失踪前使用过的旧城地图。地图表面原本空白，午夜一到却浮出一条通往废弃地铁口的红线。',
        '',
        '【推进】周砚以为是特殊油墨，按红线寻找来源。沿途的路牌和导航开始出现矛盾，周围行人却像看不见异常。他用代驾工作积累的路线记忆确认：地图标记的出口三年前就已封死。',
        '',
        '【冲突】地铁口突然传来末班车报站声，一名神色慌张的女孩越过封锁线。周砚在地图上看到她的位置变成黑点，犹豫后追入通道。',
        '',
        '【章末钩子】锈死的闸机自行开启，广播播报“下一站，临海旧城”。周砚回头时，现实中的出口已经消失。'
    ].join('\n');
    const DEMO_CHAPTER_REQUIREMENT = '周砚收到哥哥留下的旧城地图，午夜时地图第一次亮起，并指向已经封闭的地铁口。';
    // 与 ai-proxy/official-template-seed-core.js 的正式种子保持同一稳定 ID 和元数据。
    // 教程只读展示这些快照，不写模板缓存，也不把提示词发送给 AI。
    const OFFICIAL_TEMPLATE_SNAPSHOTS = Object.freeze([
        { id: 'official_template_v1_outline', seedKey: 'outline', seedVersion: 'official-templates:v1', title: '大纲生成模板', description: '帮助快速生成小说大纲', category: '大纲', tags: ['大纲', '框架'], builtIn: true, isOfficial: true, isPublic: true, deleted: false, author: '官方', creatorId: 'zhiyu-official-2026', systemPrompt: '你是一位资深编辑，擅长帮助作家构建完整的故事框架。请根据用户提供的信息，生成详细的小说大纲。' },
        { id: 'd0dc319b6a2a427c00165f1e7f2139ea', seedKey: 'fine_outline_tomato', seedVersion: 'tutorial-live-snapshot:20260822', title: '【细纲】粗纲转细纲（番茄爆款）', description: '将整理好的大纲转换成每章详细的细纲，格式请用【第X章】标题的格式', category: '细纲', tags: ['细纲', '番茄', '爆款'], builtIn: false, isOfficial: true, isPublic: true, deleted: false, author: '官方', creatorId: 'zhiyu-official-2026', systemPrompt: '' },
        { id: 'official_template_v1_platform_blockbuster', seedKey: 'platform_blockbuster', seedVersion: 'official-templates:v1', title: '平台爆款写作指令', description: '番茄/起点爆款网文风格', category: '正文', tags: ['网文', '爆款'], builtIn: true, isOfficial: true, isPublic: true, deleted: false, author: '官方', creatorId: 'zhiyu-official-2026', systemPrompt: '你是一位擅长创作爆款网文的作家，文风简洁有力，节奏紧凑，擅长制造冲突和悬念。\n\n写作规则：\n1. 每章必须有至少一个反转或悬念\n2. 人物对话要符合人设\n3. 节奏要快，避免冗长描述\n4. 结尾要有钩子，吸引读者继续阅读' }
    ]);
    const DEMO_DECOMPOSE_TEMPLATE = Object.freeze({
        id: 'tutorial_decompose_miaomang_guide',
        title: '[拆书】全能至强拆书提示词(渺茫指引提供)',
        description: '拆书教程指定展示模板',
        category: '拆书', tags: ['拆书'], author: '渺茫指引',
        isPublic: true, deleted: false, systemPrompt: ''
    });
    const DEMO_CHAPTER = [
        '午夜十一点五十九分，周砚把代驾折叠车塞进后备箱，指尖忽然碰到一层发脆的纸。',
        '',
        '那是一张临海旧城地图，边角磨得发白，背面写着哥哥周衡的名字。三年前，周衡就是带着这张地图失踪的。',
        '',
        '手机上的时间跳到零点。原本褪色的街道纹路一点点亮起，一条暗红色细线从周砚脚下延伸出去，穿过两个街区，停在早已封闭的临海北站。',
        '',
        '周砚抬头看向路牌。导航显示北站距离这里四点七公里，可他记得很清楚，那座地铁口就在前方拐角，而且三年前就被水泥封死。',
        '',
        '远处忽然响起报站声。',
        '',
        '“末班车即将进站，请乘客退到黄线以内。”',
        '',
        '雾从巷口漫过来，街上的行人没有一个回头。只有地图上，代表周砚的白点旁边，缓慢浮出一个新的黑点。',
        '',
        '黑点正在向地铁口移动。'
    ].join('\n');
    const DEMO_NATURALIZED_CHAPTER = [
        '午夜十一点五十九分，周砚把折叠车推进后备箱，指尖忽然碰到一张发脆的旧纸。',
        '',
        '纸上印着临海旧城。边角磨得发白，背面只有两个字——周衡。三年前，哥哥就是带着它失踪的。',
        '',
        '零点一到，褪色的街道像从纸底醒来。一线暗红从周砚脚下蜿蜒出去，穿过两个街区，停在早已封闭的临海北站。',
        '',
        '手机导航说北站还在四点七公里外。可周砚记得，那座被水泥封死的入口，就在前方拐角。',
        '',
        '雾里忽然响起报站声。',
        '',
        '“末班车即将进站，请乘客退到黄线以内。”',
        '',
        '街上的人谁也没有回头。只有地图上，代表他的白点旁边，慢慢浮出一个黑点。',
        '',
        '黑点正向地铁口移动。'
    ].join('\n');
    const DEMO_LOCAL_SELECTION = '手机上的时间跳到零点。原本褪色的街道纹路一点点亮起，一条暗红色细线从周砚脚下延伸出去，穿过两个街区，停在早已封闭的临海北站。';
    const DEMO_LOCAL_POLISH_INSTRUCTION = '让地图亮起的画面更有氛围，句子更自然，但不要改变剧情。';
    const DEMO_LOCAL_POLISHED = '手机时间跳到零点。褪色的街道纹路像从旧纸深处苏醒，一寸寸泛起微光。暗红色细线沿周砚脚下游走，穿过两个街区，最终钉在早已封闭的临海北站。';
    const DEMO_REWRITE_REQUIREMENT = '补写周砚确认地图不是幻觉的过程，让他用代驾经验核对路线，并在结尾听见地铁报站声。';
    const DEMO_REWRITTEN_CHAPTER = [
        '午夜十一点五十九分，周砚把代驾折叠车塞进后备箱，指尖忽然碰到一层发脆的纸。',
        '',
        '那是一张临海旧城地图，边角磨得发白，背面写着哥哥周衡的名字。三年前，周衡就是带着这张地图失踪的。',
        '',
        '手机时间跳到零点，褪色的街道纹路随之亮起。周砚先打开导航，又凭这些年跑代驾记下的路口逐一核对。导航说北站还在四点七公里外，地图上的红线却直指前方拐角。',
        '',
        '他沿街走了两百米，连续看见三块本不该同时出现的旧路牌。直到红线与鞋尖完全重合，他才确定：出错的不是记忆。',
        '',
        '被水泥封死三年的地铁口，正从雾里一点点露出来。',
        '',
        '远处忽然响起报站声。',
        '',
        '“末班车即将进站，请乘客退到黄线以内。”'
    ].join('\n');
    const DEMO_ADVANCED_OUTLINE = [
        '# 《雾城夜巡》剧情总览',
        '',
        '## 核心命题',
        '被城市抹去的记忆是否值得用现实秩序交换。周砚从寻找哥哥出发，最终必须决定保留雾城真相还是终止所有异常。',
        '',
        '## 全书阶段规划',
        '',
        '### S01 地图亮起',
        '章节范围：1-25章',
        '周砚获得旧城地图，经历地铁末班车、旧医院和无名巷三起事件，建立雾区规则并加入巡查队。',
        '',
        '### S02 城中暗线',
        '章节范围：26-55章',
        '雾区与现实案件重合，周砚发现队内有人持续销毁旧档案。',
        '',
        '### S03 钟楼倒计时',
        '章节范围：56-90章',
        '六座废弃钟楼依次苏醒，哥哥留下的路线指向城市地下封锁工程。',
        '',
        '### S04 失踪者归来',
        '章节范围：91-125章',
        '周衡以异常身份归来，巡查队内部立场彻底分裂。',
        '',
        '### S05 雾城真相',
        '章节范围：126-160章',
        '周砚进入第七钟楼，在保留城市记忆与维持现实秩序之间作出选择。'
    ].join('\n');
    const DEMO_STAGE_OUTLINE = [
        '# S01阶段粗纲：地图亮起',
        '',
        '【阶段目标】完成周砚从普通代驾到巡查队预备成员的身份转变，建立地图、雾区和代价三条核心规则。',
        '',
        '## 第一单元 地铁末班车（1-6章）',
        '地图首次亮起；周砚进入不存在的末班车；救下沈青禾；发现每次报站都会抹去一名乘客的记忆。',
        '',
        '## 第二单元 旧医院夜诊（7-14章）',
        '沈青禾带周砚进入封存病区；两人确认雾区会借真实遗憾形成规则；周砚第一次主动使用地图改写路线。',
        '',
        '## 第三单元 无名巷（15-22章）',
        '巡查队介入；周砚发现哥哥留下的隐蔽路标；队内有人抢先销毁现场档案。',
        '',
        '## 阶段收束（23-25章）',
        '周砚通过巡查队考核，地图浮出第一座钟楼坐标；灰伞人留下“不要相信完整地图”的警告。'
    ].join('\n');
    const DEMO_FUNCTIONAL_DIRECTION = '提炼这部作品的世界规则、能力边界、关键禁区和可持续升级方向，形成后续写作可直接参考的大纲设定。';
    const DEMO_FUNCTIONAL_CONTENT = [
        '# 《雾城夜巡》大纲设定',
        '',
        '## 雾区规则',
        '雾区只在午夜后出现，普通人会自动忽略异常；进入者必须遵守当次事件的显性规则，强行破坏会触发更高等级追捕。',
        '',
        '## 旧城地图',
        '地图提前标记危险地点，但不会直接给出答案。每完成一次事件，地图补全一段被抹去的城市历史，同时提高持有者在异常视野中的可见度。',
        '',
        '## 能力边界',
        '周砚擅长路线记忆、现场判断和规则组合，不能无代价正面碾压。升级来自掌握更多路线权限，而不是单纯数值增长。',
        '',
        '## 写作禁区',
        '不得让地图自动解决冲突；不得让雾区规则临时改变；不得提前揭晓灰伞人与周衡的最终立场。',
        '',
        '## 持续升级方向',
        '单点异常 → 多地点联动 → 城区级规则冲突 → 钟楼改变城市记忆。每次升级都同步扩大人物代价和真相风险。'
    ].join('\n');
    const DEMO_DECOMPOSE_CONTENT = [
        '## 第1章：地图亮起',
        '',
        '【结构功能】用“失踪哥哥的旧物”把人物私愿与城市异常绑定，第一屏就建立寻找哥哥的长期目标。',
        '【节奏拆解】日常代驾收尾 → 地图异常亮起 → 路线与现实冲突 → 地铁报站声出现，危险逐级抬高。',
        '【章末钩子】现实出口消失，主角从旁观者变成规则事件参与者。',
        '',
        '## 第2章：末班车没有终点',
        '',
        '【结构功能】通过沈青禾引入搭档，并用末班车规则完成第一次可验证的雾区破局。',
        '【爽点方法】主角不是硬碰怪物，而是利用路线记忆找出重复报站中的唯一错误站名。',
        '【可借鉴边界】学习“规则递进、职业经验破局、章末扩大谜团”的方法，不复制原作人物和具体事件。'
    ].join('\n');
    const DEMO_FULL_ANALYSIS_SOURCE_NAME = '雾城夜巡（教程完结稿）';
    const DEMO_FULL_ANALYSIS_RESULT_NAME = '雾城夜巡（全文分析教程结果）';
    const DEMO_FULL_ANALYSIS_MODEL_ROUTE = 'opencode-go-deepseek-v4-flash/deepseek-v4-flash';
    const DEMO_FULL_ANALYSIS_CHAPTERS = Object.freeze([
        { title: '第3章：旧医院值班表', content: '周砚和沈青禾追查失踪病人，在旧医院发现值班表每天都会多出一个不存在的名字。', volume: '第一卷：地图亮起' },
        { title: '序章：哥哥失踪', content: '三年前，周衡在临海北站留下最后一条语音：不要让第七座钟楼敲响。', volume: '第一卷：地图亮起' },
        { title: '第2章：末班车没有终点', content: '周砚进入循环报站的末班车，用路线记忆找出唯一错误站名，并救下沈青禾。', volume: '第一卷：地图亮起' },
        { title: '第1章：地图亮起', content: DEMO_CHAPTER, volume: '第一卷：地图亮起' }
    ]);
    const DEMO_OUTLINE = [
        '作品名：《雾城夜巡》',
        '题材：都市高武、都市脑洞',
        '篇幅：长篇，约一百万字',
        '',
        '一、核心设定',
        '临海城每到午夜都会出现只有少数人能看见的“雾区”。主角周砚原本是夜班代驾，意外得到一张会提前标注危险地点的旧城地图。每解决一次雾区事件，地图就会补全一段被城市抹去的历史，但也会让他逐渐成为怪物眼中的坐标。',
        '',
        '二、主角目标',
        '周砚起初只想找到失踪三年的哥哥。随着调查深入，他发现哥哥曾是秘密巡查队成员，并留下“不要让第七座钟楼敲响”的警告。主角必须在保护身边人的同时，查清雾区来源和巡查队内鬼。',
        '',
        '三、主要人物',
        '周砚：谨慎、记路能力极强，擅长把生活经验变成战斗办法。',
        '沈青禾：急诊医生，能够短暂听见雾区残留的记忆，是主角最稳定的搭档。',
        '陈渡：巡查队行动组长，外表冷硬，实际一直暗中保护周砚兄弟。',
        '灰伞人：多次在关键地点出现，似乎既在阻止灾难，也在推动主角接近真相。',
        '',
        '四、剧情阶段',
        '第一阶段“地图亮起”：主角解决地铁末班车、旧医院和无名巷三起事件，建立能力规则并加入巡查队。',
        '第二阶段“城中暗线”：雾区开始与现实案件重合，主角发现队内有人故意销毁旧档案。',
        '第三阶段“钟楼倒计时”：六座废弃钟楼依次苏醒，哥哥留下的线索指向城市地下的封锁工程。',
        '第四阶段“雾城真相”：主角必须在保留城市记忆和维持现实秩序之间作出选择，并亲手终止第七座钟楼。',
        '',
        '五、节奏与爽点',
        '前期以短事件快速建立规则，中期把事件线索汇入同一阴谋；每次破局都会解锁地图新能力，同时带来更高暴露风险。关键爽点来自主角用城市路线、职业见闻和团队配合反制强敌，而不是无代价碾压。'
    ].join('\n');
    const DEMO_FULL_ANALYSIS_FILES = Object.freeze({
        '大纲.md': DEMO_OUTLINE,
        '剧情总览.md': DEMO_ADVANCED_OUTLINE,
        '设定集.md': '雾区只在午夜后出现；旧城地图能提前标记危险，但每次使用都会提高持有者的暴露程度。',
        '信息表.md': '第七座钟楼：核心倒计时。旧城地图：哥哥留下的异常物。临海北站：第一起规则事件入口。',
        '角色列表.md': '周砚：夜班代驾，擅长路线记忆。沈青禾：急诊医生，能听见雾区残留记忆。周衡：失踪的哥哥。',
        '追踪表.md': '主线：寻找周衡；暗线：巡查队旧档案被人为销毁；倒计时：第七座钟楼苏醒。',
        '边界卡.md': '地图不能直接给答案；规则不得临时改变；主角不能无代价正面碾压异常。',
        '承接卡.md': '下一阶段从旧医院事件切入，推动巡查队招募，同时留下灰伞人销毁档案的线索。'
    });



    const CONTENT = Object.freeze({
        DEMO_SYNOPSIS_REQUIREMENT,
        DEMO_SYNOPSIS,
        DEMO_FINE_REQUIREMENT,
        DEMO_FINE_SOURCE,
        DEMO_FINE_OUTLINE,
        DEMO_CHAPTER_REQUIREMENT,
        OFFICIAL_TEMPLATE_SNAPSHOTS,
        DEMO_DECOMPOSE_TEMPLATE,
        DEMO_CHAPTER,
        DEMO_NATURALIZED_CHAPTER,
        DEMO_LOCAL_SELECTION,
        DEMO_LOCAL_POLISH_INSTRUCTION,
        DEMO_LOCAL_POLISHED,
        DEMO_REWRITE_REQUIREMENT,
        DEMO_REWRITTEN_CHAPTER,
        DEMO_ADVANCED_OUTLINE,
        DEMO_STAGE_OUTLINE,
        DEMO_FUNCTIONAL_DIRECTION,
        DEMO_FUNCTIONAL_CONTENT,
        DEMO_DECOMPOSE_CONTENT,
        DEMO_FULL_ANALYSIS_SOURCE_NAME,
        DEMO_FULL_ANALYSIS_RESULT_NAME,
        DEMO_FULL_ANALYSIS_MODEL_ROUTE,
        DEMO_FULL_ANALYSIS_CHAPTERS,
        DEMO_OUTLINE,
        DEMO_FULL_ANALYSIS_FILES,
    });

    function createBuilders(api) {
        const { runtime, DEMO_BOOK_NAME, DEMO_BOOK_INPUT_NAME, DEMO_MODEL_NAME, DEMO_TEMPLATE_NAME, DEMO_MEMORY_FOLDER_NAME, getAppState, getModal, openModal, closeModal, isVisible, findTextButton, resolveTarget, createButton, getStageMeta, getNextMainlineStageId, createTutorialMenu, openTutorialMenu, closeTutorialMenu, createLayer, snapshotTutorialState, snapshotTutorialElements, restoreTutorialElements, snapshotButton, restoreButton, prepareDemoState, prepareNewBookState, continueDemoBookWriting, selectTutorialActionTab, prepareFineOutlineState, toTutorialEditorHtml, createDemoBookPreview, prepareChapterState, prepareContentStageState, prepareOutlineExtensionState, prepareDecomposeStageState, prepareFullAnalysisStageState, prepareDecomposeSettingsState, hideTutorialBookPreview, prepareStage, setInputValue, showTutorialCoverDownloadButton, restoreTutorialCoverDownloadButton, generateTutorialCover, startDemoSynopsisStream, completeDemoBookCreation, createDemoMemoryBooks, showTutorialMemoryPreview, showTutorialAdvancedMemoryPreview, showTutorialDecomposeMemoryPreview, showTutorialFullAnalysisMemoryPreview, hideTutorialMemoryPreview, showTutorialPage, ensureTutorialPageVisible, restoreTutorialState, openOutlineForTutorial, selectTutorialNormalMode, selectTutorialAdvancedMode, selectTutorialFunctionMode, selectTutorialFunctionType, selectTutorialDirectMode, toggleTutorialGenre, getTutorialTemplate, findTutorialTemplateCard, openTutorialTemplateSelector, applyTutorialTemplate, findOutlineFileCard, openTutorialAdvancedSourceFiles, resetTutorialStageSelection, openTutorialAdvancedLinks, openTutorialFunctionalLinks, showAdvancedTutorialRecoveryButtons, openTutorialModelModal, selectTutorialModel, applyTutorialModel, startDemoStream, startDemoFineOutlineStream, saveDemoFineOutline, openTutorialChapterMemorySelector, openTutorialReferenceSelector, enableTutorialChapterGenerate, startDemoChapterStream, confirmDemoChapter, saveDemoChapter, normalizeTutorialText, streamTutorialText, startDemoAdvancedOutlineStream, saveDemoAdvancedOutline, startDemoStageOutlineStream, saveDemoStageOutline, startDemoFunctionalStream, saveDemoFunctionalContent, prepareDecomposeWorksChoice, startDemoDecomposeStream, saveDemoDecompose, returnToDemoDecomposePanel, openDecomposeInfoModal, closeDecomposeInfoModal, showDemoDecomposeStopButton, createTutorialFullAnalysisChapters, getTutorialFullAnalysisChapters, prepareTutorialFullAnalysisImport, sortTutorialFullAnalysisChapters, getTutorialFullAnalysisModels, prepareTutorialFullAnalysisModelControl, setTutorialFullAnalysisButton, openTutorialFullAnalysisPanel, openTutorialFullAnalysisModelMenu, selectTutorialFullAnalysisModel, applyTutorialFullAnalysisMode, applyTutorialFullAnalysisScope, appendTutorialFullAnalysisLog, renderDemoFullAnalysisCompletePanel, startDemoFullAnalysis, saveDemoFullAnalysis, returnToDemoFullAnalysisPanel, showDemoFullAnalysisSupplementControls, showTutorialDecomposeSettingsMemoryPreview, findMemoryFileCard, openTutorialDecomposeSettingsEditor, returnToTutorialFineOutlineForSettings, closeTutorialDecomposeSettingsEditorForReturn, openTutorialDecomposeSettingsLinks, ensureTutorialDecomposeSettingsLinkedStack, openTutorialDecomposeSettingsRoleList, closeTutorialDecomposeSettingsRoleList, prepareDemoNaturalizePanel, configureDemoNaturalizePanel, selectTutorialNaturalizeLevel, startDemoNaturalizeStream, openDemoNaturalizeConfirm, applyDemoNaturalizedChapter, openTutorialPolishModal, startDemoLocalPolish, confirmDemoLocalPolish, openTutorialRewriteModal, openTutorialRewriteMemorySelector, startDemoLocalRewrite, confirmDemoLocalRewrite, showTutorialHistoryButton, restoreTutorialHistoryButton, saveDemoOutline, updateLayerPosition, positionNote, positionLoop, waitForTarget, advanceStep, skipStep, handleDocumentClick, handleDocumentInput, handleDocumentChange, handleDocumentSelection, showWrongTargetFeedback, showRecoverableTargetError, skipCurrentStage, finishStage, returnToTutorialMenu, stopTutorial, startStage, startTutorial, createEntryButton, installTutorialEntries } = api;

        function buildNewBookSteps() {
            return [
                {
                    id: 'create-book-open', type: 'click', target: '#createBookCard',
                    title: '找到“新建作品”',
                    body: '请点击操作台里的真实“新建作品”按钮，打开作品资料弹窗。',
                    skip: function() { document.getElementById('createBookCard')?.click(); }
                },
                {
                    id: 'create-book-name', type: 'click', target: '#createBookName',
                    title: '填写作品名称',
                    body: '教程已填好“雾城夜巡”。请亲自点击真实输入框，认识书名填写位置。',
                    prepare: function() { setInputValue('createBookName', DEMO_BOOK_INPUT_NAME); }
                },
                {
                    id: 'create-book-channel', type: 'click', target: '#createBookChannel',
                    title: '选择作品频道', body: '整个“男频/女频”区域已完整框出。请点击其中的“男频”，频道会影响后续简介和内容的包装方向。',
                    allowClick: function(clicked) { return !!clicked?.closest?.('[data-gender="male"]'); }
                },
                {
                    id: 'create-book-genre-primary', type: 'click',
                    target: function() { return findTextButton('#createBookGenreMale', '都市高武'); },
                    title: '选择主题材', body: '请选择“都市高武”。教程使用固定题材，让后续大纲和正文保持一致。'
                },
                {
                    id: 'create-book-genre-secondary', type: 'click',
                    target: function() { return findTextButton('#createBookGenreMale', '都市脑洞'); },
                    title: '组合第二个题材', body: '请再选择“都市脑洞”，体验多题材组合。'
                },
                {
                    id: 'create-book-genre-count', type: 'info', target: '#createBookGenreCount',
                    title: '题材数量提示', body: '这里会显示已选题材数量。一个作品最多可以选择三个题材，排在前面的题材更重要。'
                },
                {
                    id: 'create-book-open-synopsis', type: 'click', target: '#btnOpenBookSynopsisGenerator',
                    title: '打开简介生成器', body: '请点击作品简介旁边的真实“一键生成”按钮。'
                },
                {
                    id: 'create-book-requirement', type: 'click', target: '#createBookSynopsisRequirement',
                    title: '填写主角与作品设定',
                    body: '教程已填好示例设定。请亲自点击输入框，了解正式使用时在哪里补充需求。',
                    prepare: function() { setInputValue('createBookSynopsisRequirement', DEMO_SYNOPSIS_REQUIREMENT); }
                },
                {
                    id: 'create-book-generate-synopsis', type: 'click', target: '#btnGenerateBookSynopsis',
                    title: '生成作品简介',
                    body: '请点击真实“生成简介”按钮。教程只播放预置内容，不会调用 AI。',
                    intercept: startDemoSynopsisStream
                },
                {
                    id: 'create-book-synopsis-stream', type: 'wait', target: '#createBookSynopsisPreviewText',
                    title: '查看简介生成效果', body: '简介正在真实预览框中逐段出现。内容是提前准备好的演示结果。',
                    run: function() { return runtime.streamPromise || Promise.resolve(); }
                },
                {
                    id: 'create-book-apply-synopsis', type: 'click', target: '#btnApplyBookSynopsis',
                    title: '确认填入简介', body: '请点击真实“确认填入”，把预览内容放回作品资料。'
                },
                {
                    id: 'create-book-synopsis-result', type: 'info', target: '#createBookSynopsis',
                    title: '检查作品简介', body: '生成结果已经真实显示在作品简介输入框里。正式使用时，您仍然可以在创建前继续修改。'
                },
                {
                    id: 'create-book-cover-upload', type: 'info', target: '#createBookCoverPicker',
                    title: '上传作品封面', body: '点击这里可以从电脑选择封面。教程不会打开文件选择器，也不会读取本地文件。'
                },
                {
                    id: 'create-book-cover-generate', type: 'click', target: '#btnGenerateBookCover',
                    title: '一键生成封面', body: '请点击真实“一键生成封面”。教程会换上预先准备的封面，不调用生成服务。',
                    intercept: generateTutorialCover
                },
                {
                    id: 'create-book-cover-preview', type: 'info', target: '#createBookCoverPreview',
                    title: '查看生成封面', body: '预先准备的封面已真实显示在封面区域。正式使用时，生成结果也会在这里替换。'
                },
                {
                    id: 'create-book-cover-download', type: 'info', target: '#btnDownloadBookCover',
                    title: '下载生成的封面', body: '生成封面后，这个真实按钮会出现，您可以下载原图保存。',
                    prepare: showTutorialCoverDownloadButton
                },
                {
                    id: 'create-book-confirm', type: 'click', target: '#btnConfirmCreateBook',
                    title: '创建教程作品',
                    body: '请点击真实“创建作品”。教程只在当前页面内模拟创建，不写入本地作品库或账号。',
                    intercept: completeDemoBookCreation
                },
                {
                    id: 'create-book-overview-result', type: 'info',
                    target: function() { return document.querySelector('.book-card [data-book="' + CSS.escape(DEMO_BOOK_NAME) + '"]')?.closest('.book-card'); },
                    title: '作品已出现在总览', body: '刚创建的作品和封面已显示在真实作品列表。它只存在于本次教程，不会保存到账号。'
                }
            ];
        }

        function buildOutlineSteps() {
            return [
                ...(runtime.flowMode === 'mainline' ? [{
                    id: 'outline-continue-writing', type: 'click',
                    target: function() {
                        return document.querySelector('.book-card [data-action="continue-write"][data-book="' + CSS.escape(DEMO_BOOK_NAME) + '"]');
                    },
                    spotlightTarget: function(target) { return target?.closest('.book-card'); },
                    title: '从作品卡进入写作页',
                    body: '请在刚创建的作品卡中点击真实“继续写作”。页面会带着这部作品进入写作区，再开始生成普通大纲。',
                    intercept: continueDemoBookWriting,
                    skip: continueDemoBookWriting
                }] : []),
                {
                    id: 'open-outline', type: 'click', target: '#btnOutline',
                    title: '找到“生成大纲/功能”',
                    body: '请亲自点击这个真实按钮。大纲、高级大纲和功能性生成都从这里进入。',
                    skip: function() { openOutlineForTutorial(); }
                },
                {
                    id: 'normal-mode', type: 'click', target: '#outlineSubModeTabs [data-submode="normal"]',
                    title: '选择普通大纲',
                    body: '这里可以在普通大纲和高级大纲之间切换。本次点击“生成大纲”。',
                    intercept: function(target) { selectTutorialNormalMode(target); }
                },
                {
                    id: 'open-genres', type: 'click', target: '#outlineGenreToggleBtn',
                    title: '打开题材选择',
                    body: '请点击“添加题材”。知道入口在哪里，也是教程的一部分。',
                    skip: function() { document.getElementById('outlineGenreToggleBtn')?.click(); }
                },
                {
                    id: 'genre-urban-power', type: 'click',
                    target: function() { return findTextButton('#genreTagsMale', '都市高武'); },
                    title: '选择指定题材', body: '请先选择“都市高武”。教程只开放指定选项，保证后面的示例内容一致。',
                    intercept: function(target) { toggleTutorialGenre(target, 'normal'); }
                },
                {
                    id: 'genre-urban-idea', type: 'click',
                    target: function() { return findTextButton('#genreTagsMale', '都市脑洞'); },
                    title: '再选择一个题材', body: '请继续选择“都市脑洞”，体验多题材组合。',
                    intercept: function(target) { toggleTutorialGenre(target, 'normal'); }
                },
                {
                    id: 'confirm-genres', type: 'click', target: '#btnConfirmOutlineGenrePopup',
                    title: '确认题材', body: '题材选择完成后，请点击原功能里的“确认”。'
                },
                {
                    id: 'open-template', type: 'click', target: '#outlineModal .outline-template-picker',
                    title: '打开提示词模板', body: '模板会决定大纲更偏重哪些信息。请点击真实的模板入口。',
                    intercept: openTutorialTemplateSelector
                },
                {
                    id: 'select-template', type: 'click',
                    target: findTutorialTemplateCard,
                    title: '选择官方模板', body: '请选中正式官方模板“大纲生成模板”。教程会真实应用模板，但不会发送它调用 AI。'
                },
                {
                    id: 'apply-template', type: 'click', target: '#btnApplyTemplate',
                    title: '应用模板', body: '请点击“应用”，把刚才选择的模板放入本次大纲配置。',
                    intercept: function() { applyTutorialTemplate(); }
                },
                {
                    id: 'word-count', type: 'click', target: '#outlineModal .wordcount-option[data-wc="long"]',
                    title: '选择全篇字数', body: '请点击“长篇（100万字）”。正式生成时，篇幅会影响大纲的阶段数量和细致程度。'
                },
                {
                    id: 'open-plot-tags', type: 'click', target: '#outlineModal .outline-summary-section .genre-preference-add-btn',
                    title: '打开剧情标签', body: '请点击“添加标签 +”，为这次故事指定更明确的爽点方向。',
                    skip: function() { document.querySelector('#outlineModal .outline-summary-section .genre-preference-add-btn')?.click(); }
                },
                {
                    id: 'plot-tag-system', type: 'click',
                    target: function() { return findTextButton('#genrePreferenceTagModal', '系统'); },
                    title: '选择剧情标签', body: '请选择“系统”。'
                },
                {
                    id: 'plot-tag-rise', type: 'click',
                    target: function() { return findTextButton('#genrePreferenceTagModal', '逆袭'); },
                    title: '补充爽点标签', body: '请再选择“逆袭”，让演示内容保持统一。'
                },
                {
                    id: 'confirm-plot-tags', type: 'click', target: '#btnConfirmGenrePreferenceTags',
                    title: '确认剧情标签', body: '请点击原弹窗中的“确定”。'
                },
                {
                    id: 'direct-mode', type: 'click', target: '#outlineGenerationModeToggle [data-outline-generation-mode="direct"]',
                    title: '选择直出模式', body: '本次使用“直出”，一次展示完整大纲。稍后还会单独介绍“询问”模式。',
                    intercept: function(target) { selectTutorialDirectMode(target); }
                },
                {
                    id: 'open-model', type: 'click', target: '#btnOutlineModelSelect',
                    title: '打开大纲模型', body: '大纲模型与正文模型可以分别设置。请点击“大纲模型”。',
                    intercept: function() { openTutorialModelModal(); }
                },
                {
                    id: 'select-model', type: 'click',
                    target: function() { return document.querySelector('[data-tutorial-model="outline"]'); },
                    title: '切换指定模型', body: '请点击“DeepSeek V4 Flash”。这里仅演示模型切换，不会调用模型。',
                    intercept: function(target) { selectTutorialModel(target); }
                },
                {
                    id: 'confirm-model', type: 'click', target: '#btnConfirmModelSelect',
                    title: '确认模型', body: '请点击原模型弹窗里的“确定”。',
                    intercept: function() { applyTutorialModel(); }
                },
                {
                    id: 'generate-outline', type: 'click', target: '#btnStartOutline',
                    title: '开始生成大纲', body: '请点击“生成大纲”。教程将播放预置内容，不调用 AI，也不消耗次数。',
                    intercept: function() { startDemoStream(); }
                },
                {
                    id: 'stream-outline', type: 'wait', target: '#outlineResultBox',
                    title: '查看流式生成效果', body: '内容正在逐段出现。这里展示的是提前准备好的教程内容，没有发出真实模型请求。',
                    run: function() { return runtime.streamPromise || Promise.resolve(); }
                },
                {
                    id: 'save-outline', type: 'click', target: '#btnOutlineSave',
                    title: '保存大纲', body: '请点击真实的“保存到大纲”。本次只写入教程内存，退出后自动清除。',
                    intercept: function() { saveDemoOutline(); }
                },
                {
                    id: 'memory-files', type: 'info',
                    target: function() { return document.querySelector('#memTree .memory-file-section[data-memory-section="foundation"]'); },
                    title: '认识关联记忆文件',
                    body: '这里展示的是操作页真实的“记忆文件”区域和真实文件卡片。它们由大纲整理而来，相当于 AI 的长期记忆；以后生成细纲和正文时，可以自动参考这些资料。教程只展示文件外观，不打开正文内容。',
                    prepare: showTutorialMemoryPreview,
                    after: function() { hideTutorialMemoryPreview(); openOutlineForTutorial(); }
                },
                {
                    id: 'mode-explanation', type: 'info', target: '#outlineGenerationModeToggle',
                    title: '直出与询问有什么区别',
                    body: '直出模式会一次完成本次大纲。询问模式会把大纲分阶段生成，您可以随时停下来告诉模型后续方向，或要求修改已生成内容，更好地把控剧情节奏。'
                },
                {
                    id: 'hot-list', type: 'info', target: '#btnOpenHotList',
                    title: '作品榜单', body: '正式使用时，可以选择榜单作品作为结构参考。教程不打开榜单，也不会读取网络内容。'
                },
                {
                    id: 'import-reference', type: 'info', target: '#btnImportRefBook',
                    title: '导入本地作品', body: '可以导入本地文本作为参考资料。教程不会读取您电脑里的任何文件。'
                },
                {
                    id: 'continue-outline', type: 'info', target: '#btnOutlineContinue',
                    title: '大纲续写', body: '已有部分大纲时，可以选择原大纲和关联文件，继续生成后续内容。'
                },
                {
                    id: 'copy-outline', type: 'info', target: '#btnOutlineCopy',
                    title: '复制内容', body: '生成后也可以先复制大纲到剪贴板，再决定是否保存。'
                }
            ];
        }

        function findMemoryLinkCard(fileName) {
            return Array.from(document.querySelectorAll('#memoryLinkTree .link-file-card'))
                .find(card => card.dataset.name === fileName && isVisible(card)) || null;
        }

        function createMemoryLinkSelectionStep(config) {
            const getNames = function() {
                const files = typeof config.files === 'function' ? config.files() : config.files;
                return Array.from(new Set((files || []).map(name => String(name || '').trim()).filter(Boolean)));
            };
            const clearHighlights = function() {
                document.querySelectorAll('#memoryLinkTree .outline-tutorial-link-required')
                    .forEach(card => card.classList.remove('outline-tutorial-link-required'));
            };
            const updateProgress = function() {
                const names = getNames();
                let selected = 0;
                clearHighlights();
                names.forEach(function(name) {
                    const card = findMemoryLinkCard(name);
                    if (card?.querySelector('.link-file-cb')?.checked) selected += 1;
                    else card?.classList.add('outline-tutorial-link-required');
                });
                const remaining = Math.max(0, names.length - selected);
                const copy = runtime.root?.querySelector('.outline-tutorial-copy');
                const hint = runtime.root?.querySelector('.outline-tutorial-hint');
                if (copy) copy.textContent = config.body + '（已选择 ' + selected + '/' + names.length + '）';
                if (hint) hint.textContent = remaining > 0
                    ? '请逐个勾选高亮文件，还需 ' + remaining + ' 个'
                    : '指定文件已全部勾选';
                return names.length > 0 && remaining === 0;
            };
            return {
                id: config.id,
                type: 'click',
                target: '#memoryLinkModal .memory-link-modal-box',
                highlightAction: false,
                title: config.title,
                body: config.body,
                prepare: function() {
                    delete window.ZHIYU_MEMORY_LINK_TUTORIAL_CONTEXT;
                },
                onProgress: updateProgress,
                allowClick: function(clicked) {
                    const card = clicked?.closest?.('.link-file-card');
                    if (card && document.getElementById('memoryLinkTree')?.contains(card) && getNames().includes(card.dataset.name)) return true;
                    showWrongTargetFeedback();
                    window.ZHIYU_TOAST?.warn?.('本次教程不需要选择这个文件，请勾选高亮文件');
                    return false;
                },
                isComplete: updateProgress,
                skip: function() {
                    getNames().forEach(function(name) {
                        const card = findMemoryLinkCard(name);
                        if (card && !card.querySelector('.link-file-cb')?.checked) card.click();
                    });
                    updateProgress();
                },
                after: clearHighlights
            };
        }

        function buildFineOutlineSteps() {
            return [
                {
                    id: 'fine-open-tab', type: 'click', target: '.action-tab-btn[data-tab="fineOutline"]',
                    title: '打开细纲页签', body: '请点击右侧操作栏的真实“细纲”页签。',
                    intercept: function() { selectTutorialActionTab('fineOutline'); }
                },
                {
                    id: 'fine-open-outline-picker', type: 'click', target: '#btnOGPickOutline',
                    title: '选择大纲来源', body: '请点击“选择大纲”，从教程作品的记忆资料中找到要拆分的粗纲。'
                },
                {
                    id: 'fine-open-memory-outline', type: 'click', target: '#ogPickerMemRow',
                    title: '从记忆库加载大纲', body: '请点击真实的“从记忆库加载大纲”。'
                },
                {
                    id: 'fine-select-chapter-outline', type: 'click',
                    target: '#ogOutlineFileGrid .link-file-card[data-name="章节粗纲.md"]',
                    title: '选择一种粗纲',
                    body: '本教程来自普通大纲，请只勾选“章节粗纲”。如果作品使用高级大纲，则改选当前阶段对应的“阶段粗纲”；两种粗纲不能同时选择。',
                    prepare: function() {
                        const selected = window.getOGOutlineSelectionList?.('fineOutline');
                        if (Array.isArray(selected)) selected.splice(0, selected.length);
                        window.refreshOGOutlineFileGrid?.();
                    }
                },
                {
                    id: 'fine-confirm-outline-file', type: 'click', target: '#btnOGFileConfirm',
                    title: '确认大纲文件', body: '请点击真实“确定”，返回大纲拆分窗口。'
                },
                {
                    id: 'fine-regex-split', type: 'click', target: '#btnOGRegexSplit',
                    title: '正则快拆章节', body: '请点击“正则快拆”。它会按“第1章、第2章”这类标题识别粗纲，不调用 AI。'
                },
                {
                    id: 'fine-review-split', type: 'info', target: '#ogSplitChapterList',
                    title: '检查拆分章节', body: '这里列出从大纲中识别到的章节。正式使用时，可以只保留本次需要生成细纲的章节。'
                },
                {
                    id: 'fine-confirm-chapters', type: 'click', target: '#btnOGConfirm',
                    title: '确认章节范围', body: '请点击真实“确定”，把已勾选章节放入细纲工作区。'
                },
                {
                    id: 'fine-open-links', type: 'click', target: '#btnOGLinkFiles',
                    title: '打开关联文件', body: '请点击“@ 关联文件”，为细纲补充角色和世界设定。',
                    intercept: openTutorialDecomposeSettingsLinks
                },
                createMemoryLinkSelectionStep({
                    id: 'fine-select-links',
                    title: '逐个选择细纲关联文件',
                    body: '请亲自勾选高亮的“设定集、信息表、角色列表”，了解细纲需要哪些人物与世界资料。',
                    files: ['设定集.md', '信息表.md', '角色列表.md']
                }),
                {
                    id: 'fine-confirm-links', type: 'click', target: '#btnConfirmMemoryLink',
                    title: '确认关联文件', body: '请点击真实“确定选择”，把刚才逐个勾选的资料放回细纲工作区。'
                },
                {
                    id: 'fine-open-template', type: 'click', target: '#btnOGTemplate',
                    title: '打开细纲模板', body: '请点击真实“提示词模版”入口。',
                    intercept: function() { openTutorialTemplateSelector('fineOutline'); }
                },
                {
                    id: 'fine-select-template', type: 'click', target: function() { return findTutorialTemplateCard('fineOutline'); },
                    title: '选择官方细纲模板', body: '请选中正式官方“【细纲】粗纲转细纲（番茄爆款）”。这里练习真实的选择与应用；演示内容仍由教程预置。'
                },
                {
                    id: 'fine-apply-template', type: 'click', target: '#btnApplyTemplate',
                    title: '应用细纲模板', body: '请点击真实“应用”。',
                    intercept: function() { applyTutorialTemplate('fineOutline'); }
                },
                {
                    id: 'fine-open-model', type: 'click', target: '#btnActionModelSelect',
                    title: '打开工具模型', body: '请点击细纲单独使用的模型入口。',
                    intercept: function() { openTutorialModelModal('action'); }
                },
                {
                    id: 'fine-select-model', type: 'click', target: '[data-tutorial-model="action"]',
                    title: '选择指定模型', body: '请选择“DeepSeek V4 Flash”。这里只切换显示，不调用模型。',
                    intercept: selectTutorialModel
                },
                {
                    id: 'fine-confirm-model', type: 'click', target: '#btnConfirmModelSelect',
                    title: '确认工具模型', body: '请点击真实“确定”。',
                    intercept: applyTutorialModel
                },
                {
                    id: 'fine-description', type: 'click', target: '#ogDescInput',
                    title: '认识细纲要求', body: '教程已提前填好示例要求。请亲自点击输入框，不用再打字。',
                    prepare: function() { setInputValue('ogDescInput', DEMO_FINE_REQUIREMENT); }
                },
                {
                    id: 'fine-generate', type: 'click', target: '#btnOGSend',
                    title: '开始生成细纲', body: '请点击真实生成箭头。教程将播放预置内容，不调用 AI。',
                    intercept: startDemoFineOutlineStream
                },
                {
                    id: 'fine-stream', type: 'wait', target: '#ogContentBox',
                    title: '查看细纲生成效果', body: '预置细纲正在真实结果框中逐段显示。',
                    run: function() { return runtime.streamPromise || Promise.resolve(); }
                },
                {
                    id: 'fine-save', type: 'click', target: '#btnOGSave',
                    title: '保存细纲', body: '请点击真实“保存细纲”。教程只给出成功反馈，不写入记忆库。',
                    intercept: saveDemoFineOutline
                },
                {
                    id: 'fine-file-stacks', type: 'info', target: '#ogFileStacksRow',
                    title: '认识细纲参考资料', body: '这里会显示本次细纲参考的大纲章节和关联文件。它们用于帮助您核对生成依据。'
                },
                {
                    id: 'fine-clear', type: 'info', target: '.action-tab-btn[data-tab="fineOutline"] .action-tab-clear',
                    title: '清除细纲工作区', body: '“清除”只清空当前细纲工作区，不等于删除已经保存的正式章节或记忆文件。'
                },
                {
                    id: 'fine-stop', type: 'info', target: '#ogStopBtn',
                    title: '停止生成', body: '正式生成过程中，可以点击这里停止当前细纲任务。',
                    prepare: function() {
                        const button = document.getElementById('ogStopBtn');
                        if (button) { button.style.display = 'block'; button.disabled = true; }
                    },
                    after: function() {
                        const button = document.getElementById('ogStopBtn');
                        if (button) { button.style.removeProperty('display'); button.disabled = false; }
                    }
                },
                {
                    id: 'fine-input-toggle', type: 'info', target: '#ogDragDivider',
                    title: '调整剧情描述区域', body: '电脑端可拖动这条分隔线调整输入区高度；平板端会显示中间箭头，用于收起或展开剧情描述。'
                },
                {
                    id: 'fine-template-menu', type: 'info', target: '#btnOGTemplateMenu',
                    title: '常用模板快捷入口', body: '点击这个箭头，可以快速切换常用细纲模板。教程不展开快捷菜单。'
                }
            ];
        }

        function buildChapterSteps() {
            return [
                {
                    id: 'chapter-select', type: 'click', target: '#treeContent .chapter-item[data-vi="0"][data-ci="1"]',
                    title: '选择要生成的章节', body: '请在真实章节目录中点击“第1章：地图亮起”。'
                },
                {
                    id: 'chapter-open-model', type: 'click', target: '#btnModelSelect',
                    title: '打开正文模型', body: '请点击正文区域的真实模型入口。',
                    intercept: function() { openTutorialModelModal('chapter'); }
                },
                {
                    id: 'chapter-select-model', type: 'click', target: '[data-tutorial-model="chapter"]',
                    title: '选择指定模型', body: '请选择“DeepSeek V4 Flash”。这里只切换显示，不调用模型。',
                    intercept: selectTutorialModel
                },
                {
                    id: 'chapter-confirm-model', type: 'click', target: '#btnConfirmModelSelect',
                    title: '确认正文模型', body: '请点击真实“确定”。', intercept: applyTutorialModel
                },
                {
                    id: 'chapter-open-template', type: 'click', target: '#btnComposerTemplate',
                    title: '打开正文模板', body: '请点击“选择提示词模版”。',
                    intercept: function() { openTutorialTemplateSelector('chapter'); }
                },
                {
                    id: 'chapter-select-template', type: 'click', target: function() { return findTutorialTemplateCard('chapter'); },
                    title: '选择官方正文模板', body: '请选择正式官方“平台爆款写作指令”。'
                },
                {
                    id: 'chapter-apply-template', type: 'click', target: '#btnApplyTemplate',
                    title: '应用正文模板', body: '请点击真实“应用”，模板名称会显示在正文工具栏。',
                    intercept: function() { applyTutorialTemplate('chapter'); }
                },
                {
                    id: 'chapter-open-links', type: 'click', target: '#btnComposerLinkFiles',
                    title: '打开正文关联文件', body: '请点击“@ 关联文件”，选择本章必须参考的细纲和设定。',
                    intercept: openTutorialChapterMemorySelector
                },
                {
                    id: 'chapter-open-fine-folder', type: 'click',
                    target: '#memoryLinkFolders .link-folder-item[data-folder="细纲文件"]',
                    title: '打开细纲文件夹', body: '请先在左侧点击真实“细纲文件”，找到本章对应的细纲。'
                },
                createMemoryLinkSelectionStep({
                    id: 'chapter-select-fine',
                    title: '选择本章细纲',
                    body: '请亲自勾选高亮的“第1章细纲”。正文首先要知道这一章具体写什么。',
                    files: ['第1章细纲.md']
                }),
                {
                    id: 'chapter-open-associated-folder', type: 'click',
                    target: '#memoryLinkFolders .link-folder-item[data-folder="__memory_link_associated__"]',
                    title: '打开关联文件', body: '请再点击左侧真实“关联文件”，查看人物、设定与连续性资料。'
                },
                createMemoryLinkSelectionStep({
                    id: 'chapter-select-associated-links',
                    title: '逐个选择正文关联资料',
                    body: '右侧已按真实结构分为“关联文件”和“大纲资料”。请逐个勾选高亮的八份正文默认资料；大纲与粗纲不在本步选择。',
                    files: ['设定集.md', '信息表.md', '角色列表.md', '边界卡.md', '追踪表.md', '承接卡.md', '关键事件表.md', '资料索引.md']
                }),
                {
                    id: 'chapter-selected-files-info', type: 'info',
                    target: '#memoryLinkTree .memory-link-section:first-child',
                    title: '核对已选文件', body: '顶部“已选文件”会把本次勾选结果汇总成标签。正式生成前请在这里核对：本章细纲和八份正文默认关联资料都已选中。'
                },
                {
                    id: 'chapter-confirm-links', type: 'click', target: '#btnConfirmMemoryLink',
                    title: '确认正文关联文件', body: '请点击真实“确定选择”。'
                },
                {
                    id: 'chapter-open-references', type: 'click', target: '#btnComposerRefChapters',
                    title: '打开参考上文', body: '请点击“参考上文”，为本章选择需要承接的已有正文。',
                    intercept: openTutorialReferenceSelector
                },
                {
                    id: 'chapter-select-reference', type: 'click', target: '#refChapterList .ref-body-cb[data-vi="0"][data-ci="0"]',
                    title: '选择前文正文', body: '请选择“序章：哥哥失踪”，让新章节自然承接前文。'
                },
                {
                    id: 'chapter-confirm-references', type: 'click', target: '#btnConfirmRefChapters',
                    title: '确认参考上文', body: '请点击真实“确定选择”。'
                },
                {
                    id: 'chapter-word-target', type: 'click', target: '#chapterTargetWordsInput',
                    title: '认识本章字数', body: '教程已填好“1800”。请点击真实字数框认识位置；它用于约束本章目标篇幅，不要求教程用户输入。',
                    prepare: function() { setInputValue('chapterTargetWordsInput', '1800'); }
                },
                {
                    id: 'chapter-description', type: 'click', target: '#plotInput',
                    title: '认识本章剧情要求', body: '教程已提前写好示例剧情。请亲自点击真实描述框，不用再打字。',
                    prepare: function() { setInputValue('plotInput', DEMO_CHAPTER_REQUIREMENT); }
                },
                {
                    id: 'chapter-generate', type: 'click', target: '#btnComposerGenerate',
                    title: '生成本章正文', body: '请点击真实“生成本章”。教程只播放预置正文，不调用 AI。',
                    prepare: enableTutorialChapterGenerate,
                    intercept: startDemoChapterStream
                },
                {
                    id: 'chapter-stream', type: 'wait', target: '#resultBox',
                    title: '查看正文流式生成', body: '预置正文正在真实编辑区逐段出现。',
                    run: function() { return runtime.streamPromise || Promise.resolve(); }
                },
                {
                    id: 'chapter-confirm-use', type: 'click', target: '#btnConfirm',
                    title: '确定使用正文', body: '请点击真实“确定使用”。教程只确认当前候选内容，不更新正式记忆文件。',
                    intercept: confirmDemoChapter
                },
                {
                    id: 'chapter-save', type: 'click', target: '#btnSaveNewChapter',
                    title: '保存当前章节', body: '请点击真实“保存章节”。教程只显示成功反馈，不写入作品库。',
                    intercept: saveDemoChapter
                },
                {
                    id: 'chapter-stop', type: 'info', target: '#btnStop',
                    title: '停止正文生成', body: '正式生成时，这里会变成停止按钮，可以中止当前任务。'
                },
                {
                    id: 'chapter-log', type: 'info', target: '#btnToggleLog',
                    title: '查看执行日志', body: '执行日志用于查看生成、保存和错误过程，排查失败原因。'
                },
                {
                    id: 'chapter-copy', type: 'info', target: '#btnCopy',
                    title: '复制正文', body: '点击这里可以复制当前正文框中的内容。'
                },
                {
                    id: 'chapter-history', type: 'info', target: '#btnHistoryVersions',
                    title: '历史版本', body: '正式保存后，可以在这里查看并恢复该章节的旧版本。',
                    prepare: showTutorialHistoryButton,
                    after: restoreTutorialHistoryButton
                },
                {
                    id: 'chapter-smart-format', type: 'info', target: '#btnAutoFormatSmart',
                    title: '智能排版', body: '智能排版会自动整理正文段落、空行和缩进。'
                },
                {
                    id: 'chapter-manual-format', type: 'info', target: '#btnManualFormatOpen',
                    title: '手动排版', body: '手动排版可以自行设置段落和显示规则。'
                },
                {
                    id: 'chapter-assistant', type: 'info', target: '#btnToggleAIFeedback',
                    title: '知屿助手', body: '这里可以单独与 AI 沟通或追加参考资料；教程不会发送任何消息。'
                },
                {
                    id: 'chapter-template-menu', type: 'info', target: '#btnComposerTemplateMenu',
                    title: '常用正文模板', body: '点击这个箭头，可以快速切换常用正文模板。'
                }
            ];
        }



        function buildStageSteps(stageId) {
            if (stageId === 'new-book') return buildNewBookSteps();
            if (stageId === 'outline') return buildOutlineSteps();
            if (stageId === 'fine-outline') return buildFineOutlineSteps();
            if (stageId === 'chapter') return buildChapterSteps();
            return null;
        }

        return Object.freeze({ buildStageSteps, findMemoryLinkCard, createMemoryLinkSelectionStep });
    }

    window.ZHIYU_OPERATION_TUTORIAL_MAINLINE_PACK = Object.freeze({ content: CONTENT, createBuilders });
})(window, document);
