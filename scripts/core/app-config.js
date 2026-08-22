// 拆分项目配置入口：从旧 app-test 内联脚本拆出，保持行为不变。
(function(window) {
    'use strict';

    window.ZHIYU_APP_VERSION = 'V3.2';
    window.ZHIYU_UPDATE_NOTES = Object.freeze([
        Object.freeze({
            version: 'V3.2',
            title: '2026-08-02 正式版更新',
            items: Object.freeze([
                '作品、章节、记忆与任务进度默认保存在本机浏览器。',
                '完善全文分析流程、八份分析资料和角色列表展示。',
                '优化日间夜间切换及 PC、平板按钮布局。',
                '改进作品选择、模型入口、模板排序和记忆页面夜间显示。',
                'AI 写作功能统一使用用户自行配置的模型 API。'
            ])
        }),
        Object.freeze({
            version: 'V3.1',
            title: '2026-07-23 本地测试版更新',
            items: Object.freeze([
                '修复大纲、阶段粗纲、正文生成与拆书流程中的阻断问题。',
                '完善作品文件 ZIP 导入导出及关联文件目录显示。',
                '重做设置中心外观、字体、夜间模式、主题与壁纸控制。',
                '修复 AI 优化弹窗层级和报告常驻栏显示。',
                '完善本机保存与导入导出流程。'
            ])
        }),
        Object.freeze({
            version: 'V3.0',
            title: '拆分测试版基线',
            items: Object.freeze([
                '完成知屿写作 PC 测试版核心页面与业务脚本的模块化拆分。',
                '建立作品、章节、记忆库、模板、发布和设置等基础功能。'
            ])
        })
    ]);

    window.ZHIYU_CONFIG = {
            MAX_REF_CHAPTERS: 6,
            MAX_TOKENS_DEFAULT: 8192,
            MAX_TOKENS_POLISH: 4096,
            AUTO_SAVE_INTERVAL: 5000,
            SEARCH_DEBOUNCE: 300,
            STORAGE_PREFIX: 'novel_',
            DEFAULT_API_BASE: '',
            DEFAULT_MODEL: '',
            CHAPTER_HISTORY_MAX: 10,
            SIDEBAR_WIDTH: 180,
            SIDEBAR_COLLAPSED_WIDTH: 60
        };

    window.ZHIYU_EXECUTION_LOG_MAX = 15;

    window.ZHIYU_WRITE_BUTTON_TITLES = {
            btnNewVolume: '新建一个分卷，用来管理一组章节',
            btnToggleOrder: '切换章节排序和管理方式',
            btnNewChapter: '在当前分卷中新建章节',
            btnImportChapter: '从本地文件导入章节正文',
            btnGen: '根据当前章节和关联资料生成本章正文',
            btnPolish: '选中正文片段后，让AI局部润色',
            btnRewrite: '选中或指定内容后，让AI局部重写',
            btnOutline: '打开大纲生成工具',
            btnScript: '根据当前作品生成剧本内容',
            btnAutoFormat: '智能或手动调整正文排版',
            btnAutoFormatSmart: '自动整理正文段落、空行和缩进',
            btnManualFormatOpen: '打开手动排版设置',
            btnModelSelect: '选择当前使用的AI模型',
            btnOutlineModelSelect: '选择生成大纲单独使用的AI模型',
            btnActionModelSelect: '选择细纲、拆书和AI消痕单独使用的AI模型',
            btnToggleLog: '打开或关闭执行日志',
            btnStop: '停止当前正在生成的正文任务',
            btnSaveNewChapter: '保存当前章节正文',
            btnHistoryVersions: '查看并恢复该章节的历史版本',
            btnSaveRefFile: '保存正在编辑的记忆库文件',
            btnFindReplace: '在当前正文或文件中查找替换',
            btnRegen: '恢复局部润色前的正文并重新设置润色',
            btnCopy: '复制当前正文框内的章节正文',
            btnConfirm: '确认采用当前生成正文，并同步更新记忆库',
            btnToggleAIFeedback: '查看你的消息和AI反馈记录',
            btnPlotUpload: '上传或选择参考材料',
            btnPlotChooseMemory: '从记忆库选择参考文件',
            btnPlotUploadFile: '上传一个本地文本参考文件',
            btnPlotUploadFolder: '上传一个本地文件夹作为参考',
            btnPlotSend: '发送当前输入给AI反馈',
            btnOGLinkFiles: '选择本次细纲生成要参考的记忆库文件',
            btnOGPickOutline: '选择或拆分大纲章节作为细纲来源',
            btnOGSave: '保存当前细纲到记忆库和章节',
            btnDCImportBook: '从当前作品导入章节用于拆书',
            btnDCSave: '保存当前拆书结果到记忆库',
            btnAIDetect: '检测正文中的AI味、套话和高风险表达',
            btnAPLock: '提取剧情关键点，供优化复核使用',
            btnAIPolish: '配置并开始AI优化',
            btnAPSave: '将AI优化后的最终正文应用到正文',
            btnOGTemplate: '选择本次生成使用的提示词模板',
            btnDCTemplate: '选择本次拆书使用的提示词模板',
            btnAPTemplate: '选择本次AI优化使用的提示词模板',
            btnOGSend: '发送当前输入给AI生成',
            btnRegenAction: '重新生成当前操作栏内容',
            btnConfirmAction: '确认采用当前操作栏内容',
            ogStopBtn: '停止细纲生成',
            dcStopBtn: '停止拆书分析',
            apStopBtn: '停止AI消痕',
            catalogToggleBtn: '收起或展开章节目录'
        };

    const NORMAL_OUTLINE_FOUNDATION_FORMAT = '\n\n【普通大纲第一阶段固定格式】\n'
        + '- 第一阶段只生成可供开篇正文使用的基础设定，严禁输出任何「第N章」章节粗纲。\n'
        + '- 必须依次使用以下七个二级标题，暂时没有的项目写「无」，不要省略标题：\n'
        + '  「## 作品基础信息」\n'
        + '  「## 故事起点」\n'
        + '  「## 世界观与硬规则」\n'
        + '  「## 力量、职业与资源体系」\n'
        + '  「## 角色初始档案」\n'
        + '  「## 初始势力、地点与物品」\n'
        + '  「## 写作边界」\n'
        + '- 角色只记录稳定设定、相互关系和开篇状态；不得写未来出场章数、隐藏身份揭露、背叛、死亡、终局结果等未来剧情。\n'
        + '- 不生成全书阶段剧情、结局规划或章节事件；这些内容从第二阶段的章节粗纲开始生成。\n'
        + '- 末尾可以增加「## 章节承接摘要（仅基础设定）」，但只能压缩上述基础事实，不得加入未来剧情。';

    window.ZHIYU_FORMAT_CONSTRAINTS = {
            OUTLINE: '\n\n【最低拆分格式】\n- 只在所选模板进入章节大纲后使用独立章节标题行，推荐「## 第N章：章节标题」；章节前的书名、设定、角色等内容必须按模板原顺序完整保留。',
            OUTLINE_FOUNDATION: NORMAL_OUTLINE_FOUNDATION_FORMAT,
            OUTLINE_DIRECT: '\n\n【大纲系统底线】\n- 用户/官方模板负责创意、题材、风格、设定内容和大纲写法；系统只要求结果能保存、拆分和继续分析。\n- 可以先输出书名建议、世界观、人物和设定信息；但完整大纲最终必须包含章节大纲，不能最终只输出设定。\n- 当前置内容生成完成，要进入章节粗纲（章节剧情概述）时，必须从第1章开始，章节编号连续。\n- 每章独立成段，使用清楚的章节标题，例如「## 第1章：章节标题」或「第1章：章节标题」。\n- 每章只写简短粗剧情，优先遵守模板里的20-40字要求；不要写成细纲、正文或长段落。\n- 相邻章节之间换行分隔，不得多章合并。',
            FINE_OUTLINE: '\n\n【细纲系统底线】\n- 用户/官方模板负责细纲内容、详略和写法；系统只要求每章能被识别并单独保存。\n- 每章独立成段，一章一个清楚的章节标题，推荐「## 第N章：章节标题」，也兼容「第N章：章节标题」。\n- 每章细纲需包含该章的情节要点，不得多章合并。\n- 每个情节要点单独换行成段，标题、要点和不同部分之间保留空行，禁止把整章内容挤成一个长段落。\n- 相邻章节之间至少保留一个空行。\n- 参考资料中已经存在的F-ID可以原样保留，禁止新建、重编号或扩散到普通章节；正文禁止输出内部ID。',
            DECOMPOSE: '\n\n【拆书系统底线】\n- 用户/官方模板负责拆书维度和分析写法；系统只要求结果能按章节保存，并提取可复用的写作骨架。\n- 必须按章节输出，每章用清楚章节编号单独成段，推荐「## 第N章：功能型标题」，也兼容「第N章：标题」。\n- 小标题可以按模板来；如果模板没有指定，可围绕开场状态、本章目标、场景顺序、冲突压力、转折揭示、钩子伏笔功能、情绪峰值和人物功能分析。\n- 移除原作人名、地点、势力、物品、世界专属词和原句表达；同一人物跨章使用稳定的功能称呼。\n- 不创建R-ID或F-ID，不保存原作设定档案，不把参考作品内容当成当前作品正文。\n- 不要把多章合并到一个章节块里，不要输出章节块以外的总结；相邻章节之间空一行，方便系统自动拆分保存。'
        };
})(window);
