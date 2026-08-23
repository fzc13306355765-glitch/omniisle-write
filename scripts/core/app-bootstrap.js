// =================== AI detect module entry ===================
        // 优化页同时提供消痕 I（三步优化）和消痕 II（直接优化）。
        const clearAIDetectHighlights = window.clearAIDetectHighlights || function() {};
        const triggerAIDetect = window.triggerAIDetect || function() {
            if (window.Toast?.warn) window.Toast.warn('AI检测模块未加载，请刷新页面重试');
        };

        // =================== [0] 全局常量配置 ===================
        const CONFIG = window.ZHIYU_CONFIG || {};

        // =================== Execution log module entry ===================
        // 执行日志条数裁剪逻辑已拆到 scripts/core/app-execution-log.js。
        const EXECUTION_LOG_MAX = window.ZHIYU_EXECUTION_LOG_MAX_VALUE;
        const trimExecutionLog = window.trimExecutionLog;

                // =================== UI actions module entry ===================
        // 写作页按钮提示、工作中状态、确认使用状态已拆到 scripts/core/app-ui-actions.js。
        const applyWriteButtonTooltips = window.applyWriteButtonTooltips;
        const resetConfirmUseVisual = window.resetConfirmUseVisual;
        const setConfirmUseState = window.setConfirmUseState;
        const setPlotSendWorking = window.setPlotSendWorking;
        const getOGSendIdleTitle = window.getOGSendIdleTitle;
        const updateOGSendIdleTitle = window.updateOGSendIdleTitle;
        const setOGSendWorking = window.setOGSendWorking;
        const getActiveActionController = window.getActiveActionController;
        const stopActiveActionGeneration = window.stopActiveActionGeneration;

                const FORMAT_CONSTRAINTS = window.ZHIYU_FORMAT_CONSTRAINTS || {};

        // =================== [1] 工具函数区 ===================
        const Utils = window.ZHIYU_UTILS || {};

        // =================== [2] Toast 通知 + Confirm 确认框 ===================
        const Toast = window.ZHIYU_TOAST;
        const Confirm = window.ZHIYU_CONFIRM;
        const Prompt = window.ZHIYU_PROMPT;

        // =================== [3] Modal 弹窗工具 ===================
        const Modal = window.ZHIYU_MODAL;

        // =================== Storage module entry ===================
        // 本地存储逻辑已拆到 scripts/core/app-storage.js。
        const IDB = window.ZHIYU_IDB;
        const SecureStore = window.ZHIYU_SECURE_STORE;
        const StorageService = window.ZHIYU_STORAGE_SERVICE;

        // =================== Domain state module entry ===================
        // 作品状态常量和已删除书名记录逻辑已拆到 scripts/core/app-domain-state.js。
        const STORAGE_KEYS = window.ZHIYU_STORAGE_KEYS;
        const STATUS = window.ZHIYU_STATUS;
        const DELETED_BOOKS_KEY = window.ZHIYU_DELETED_BOOKS_KEY;
        const getDeletedBookNames = window.getDeletedBookNames;
        const markBookDeleted = window.markBookDeleted;
        const unmarkBookDeleted = window.unmarkBookDeleted;

        // =================== AppState module entry ===================
        // 前端运行状态初始值已拆到 scripts/core/app-state.js。
        const AppState = window.ZHIYU_APP_STATE;

        

        // 根据当前激活Tab返回对应的内容框（全局函数）
// =================== Active content module entry ===================
        // Right-panel active content box selection is split into scripts/core/app-active-content.js.
        const getActiveContentBox = window.getActiveContentBox;

// =================== Sync status module entry ===================
        // Local sync version and sidebar sync status UI helpers are split into scripts/core/app-sync-status.js.
        const _loadSyncVersions = window._loadSyncVersions;
        const _saveSyncVersions = window._saveSyncVersions;
        const touchBook = window.touchBook;
        const updateSyncUI = window.updateSyncUI;

// =================== Current user module entry ===================
        // Local current user identity helpers are split into scripts/core/app-current-user.js.
        const getCurrentUserId = window.getCurrentUserId;
        const getCurrentUserName = window.getCurrentUserName;
        const setCurrentUserName = window.setCurrentUserName;

// =================== Data access module entry ===================
        // Template and book local data helpers are split into scripts/core/app-data-access.js.
        const gT = window.gT;
        const gTPublic = window.gTPublic;
        const sT = window.sT;
        const gB = window.gB;
        const sB = window.sB;

        // =================== Memory file helpers module entry ===================
        // 关联记忆文件读取、保存和章节旧条目清理已拆到 scripts/core/app-memory-file-helpers.js。
        const getRefFileContent = window.getRefFileContent;
        const saveRefFileContent = window.saveRefFileContent;
        const stripChapterFromMemoryCards = window.stripChapterFromMemoryCards;
        const ensureMemBook = window.ensureMemBook;

        // =================== Memory card updaters module entry ===================
        // 追踪表和边界卡更新逻辑已拆到 scripts/core/app-memory-card-updaters.js。
        const updateTrackingCard = window.updateTrackingCard;
        const updateBoundaryCard = window.updateBoundaryCard;

        // =================== Template display module entry ===================
        // 模板统计和文件图标展示逻辑已拆到 scripts/core/app-template-display.js。
        const getTemplateLikeCount = window.getTemplateLikeCount;
        const getTemplateUsageCount = window.getTemplateUsageCount;
        const renderTemplateMetrics = window.renderTemplateMetrics;
        const renderLineIcon = window.renderLineIcon;

                // Cloud sync, local backup/import, and history version UI logic is split into scripts/core/app-cloud-sync-history.js.

        // =================== Local access module entry ===================
        // Local config/settings/book-status helpers are split into scripts/core/app-local-access.js.
        const gA = window.gA;
        const sA = window.sA;
        const gS = window.gS;
        const sS = window.sS;
        const getBooksByStatus = window.getBooksByStatus;


        // =================== Word count module entry ===================
        // Word count, editor text conversion, and target progress helpers are split into scripts/core/app-word-count.js.
        // =================== Editor content module entry ===================
        // Result-box write/save helpers are split into scripts/core/app-editor-content.js.
        const saveResultBoxHTMLToCurrentChapter = window.saveResultBoxHTMLToCurrentChapter;
        const writePlainTextToResultBox = window.writePlainTextToResultBox;

// =================== Page navigation module entry ===================
        // Sidebar page switching and collapse button binding are split into scripts/core/app-page-navigation.js.
        const switchPage = window.switchPage;
        const refreshPage = window.refreshPage;
        const bindPageNavigation = window.bindPageNavigation;
        bindPageNavigation();

// =================== Overview interactions module entry ===================
        // Overview search and tab bindings are split into scripts/core/app-overview-interactions.js.
        const bindOverviewInteractions = window.bindOverviewInteractions;
        bindOverviewInteractions();

        // =================== Overview page module entry ===================
        // 总览页渲染逻辑已拆到 scripts/core/app-overview.js。
        const refreshOverview = window.refreshOverview;
        const getOverviewChapterTarget = window.getOverviewChapterTarget;

// =================== Overview management module entry ===================
        // 作品还原、删除、重命名、归档、批量管理和封面上传已拆到 scripts/core/app-overview-management.js。
        const restoreBook = window.restoreBook;
        const permanentlyDeleteBook = window.permanentlyDeleteBook;
        const updateBatchActions = window.updateBatchActions;
        const renameBook = window.renameBook;
        const archiveBook = window.archiveBook;
        const trashBook = window.trashBook;

// =================== Import book module entry ===================
        // 新建作品、导入作品、章节解析、确认导入已拆到 scripts/core/app-import-book.js。
        const aiDetectChapters = window.aiDetectChapters;
        const handleImportFile = window.handleImportFile;
        const countChineseWords = window.countChineseWords;
        const analyzeImportedBook = window.analyzeImportedBook;

// =================== Folder import module entry ===================
        // 本地文件夹导入整本书已拆到 scripts/core/app-folder-import.js。

// =================== Book selection module entry ===================
        // 书籍下拉选择和切换当前书籍逻辑已拆到 scripts/core/app-book-selection.js。
        // Chapter tree rendering moved to scripts/core/app-tree-render.js.
        const refreshTree = window.refreshTree;

        // Chapter loading moved to scripts/core/app-chapter-loader.js.
        const loadChapter = window.loadChapter;
        // =================== Generation status module entry ===================

        // =================== Context menu module entry ===================
        // Chapter/volume right-click menus are split into scripts/core/app-context-menu.js.
        const showCtxMenu = window.showCtxMenu;
        const showVolumeCtxMenu = window.showVolumeCtxMenu;
        const hideContextMenus = window.hideContextMenus;
        const bindContextMenuDismiss = window.bindContextMenuDismiss;

        // =================== Chapter editor module entry ===================
        // Chapter edit/save/rename/delete/move helpers are split into scripts/core/app-chapter-editor.js.
        const openEditor = window.openEditor;
        const saveEditor = window.saveEditor;
        const closeEditor = window.closeEditor;
        const renameChapter = window.renameChapter;
        const deleteChapter = window.deleteChapter;
        const moveChapter = window.moveChapter;

        // =================== Memory prompt builders module entry ===================
        // 追踪表/边界卡提示词拼接已拆到 scripts/core/app-memory-prompt-builders.js。
        const buildTrackingContent = window.buildTrackingContent;
        const buildBoundaryContent = window.buildBoundaryContent;

        // 自动参考章节/记忆文件上下文读取已拆到 scripts/core/app-generation-context.js。
        const getAutoRefChapters = window.getAutoRefChapters;
        const getAutoMemoryContext = window.getAutoMemoryContext;

        // =================== Chapter actions module entry ===================
        // New volume/chapter/import/order bindings are split into scripts/core/app-chapter-actions.js.
        const createNewVolume = window.createNewVolume;
        const createNewChapter = window.createNewChapter;
        const openChapterImportPicker = window.openChapterImportPicker;
        const handleChapterImport = window.handleChapterImport;
        const toggleChapterOrder = window.toggleChapterOrder;
        const handleChapterFilePickerChange = window.handleChapterFilePickerChange;
        const bindChapterActions = window.bindChapterActions;

        // ===== 按章节号自动排序 =====
        // =================== Chapter numbering module entry: sort helpers ===================

        // Generate chapter modal entry moved to scripts/core/app-generate-modal-entry.js.

        // Rewrite action handler is split into scripts/core/app-rewrite-actions.js.

        // Rewrite modal cancel UI is split into scripts/core/app-rewrite-modal-ui.js.

        // =================== Text formatting module entry ===================

        // =================== Plot input persistence module entry ===================

        // Polish action handlers are split into scripts/core/app-polish-actions.js.

        // ===== Electron IPC API 调用（通过 preload 暴露的 electronAPI）=====

        // AI transport moved to scripts/core/app-ai-transport.js.
        const streamGenerate = window.streamGenerate;
        const callLLMAPI = window.callLLMAPI;

        // Overview help and community config moved to scripts/core/app-overview-help.js.
        // =================== Generation plan module entry ===================

        // Chapter generation prompt builder moved to scripts/core/app-generation-context.js.
        const buildGenerationPrompt = window.buildGenerationPrompt;

        // 追踪表/边界卡提示词拼接已拆到 scripts/core/app-memory-prompt-builders.js。

        // 追踪表和边界卡更新逻辑已拆到 scripts/core/app-memory-card-updaters.js。

        // =================== Chapter numbering module entry: count helper ===================

        // 记忆书籍初始化已拆到 scripts/core/app-memory-file-helpers.js。

        // Chapter generation start handler is split into scripts/core/app-generation-actions.js.

        // ===== 自动获取参考章节（往前取最多6章）=====
        // 自动参考章节/记忆文件上下文读取已拆到 scripts/core/app-generation-context.js。

        // ===== 计算章节号 =====
        // =================== Chapter numbering module entry: display helpers ===================

        // 自动参考章节/记忆文件上下文读取已拆到 scripts/core/app-generation-context.js。

        // 关联记忆文件读取、保存和章节旧条目清理已拆到 scripts/core/app-memory-file-helpers.js。

        // 追踪卡/边界卡生成编排已拆到 scripts/core/app-memory-card-orchestrator.js。
        const generateTrackingAndBoundary = window.generateTrackingAndBoundary;
        const generateOutlineCards = window.generateOutlineCards;

        // 设定集/信息卡 AI 生成已拆到 scripts/core/app-memory-info-generators.js。
        const generateSettingUpdate = window.generateSettingUpdate;
        const generateSettingCard = window.generateSettingCard;
        const generateInfoCard = window.generateInfoCard;

        // 记忆库文件联动同步已拆到 scripts/core/app-memory-sync.js。
        const syncSingleFileChange = window.syncSingleFileChange;
        const syncOutlineChangesToCards = window.syncOutlineChangesToCards;

        // 全量记忆文件生成已拆到 scripts/core/app-memory-all-generator.js。
        const generateAllMemoryFiles = window.generateAllMemoryFiles;

// =================== Outline storage module entry ===================
        // 褰撳墠绔犺妭鍚嶇О銆佷功绫嶅ぇ绾插瓨鍙栭€昏緫宸叉媶鍒?scripts/core/app-outline-storage.js銆?
        const getCurrentChapterName = window.getCurrentChapterName;

        // 记忆卡 AI 生成器已拆到 scripts/core/app-memory-ai-generators.js。
        const generateTrackingCardFromOutline = window.generateTrackingCardFromOutline;
        const generateBoundaryFromOutline = window.generateBoundaryFromOutline;
        const generateTrackingEntryFromChapter = window.generateTrackingEntryFromChapter;
        const generateBoundaryEntryFromChapter = window.generateBoundaryEntryFromChapter;
        const generateContinuityEntryFromChapter = window.generateContinuityEntryFromChapter;

        // ===== 保存大纲到书籍大纲区（非章节，不参与编号）=====
        const saveOutlineToBook = window.saveOutlineToBook;
        const loadBookOutline = window.loadBookOutline;
        // Generation stop button handler is split into scripts/core/app-generation-stop.js.

        // saveChapter handler is split into scripts/core/app-save-actions.js.

        // saveRefFile handler is split into scripts/core/app-save-actions.js.

        // =================== Find/replace module entry ===================

        // 显示保存和查询按钮
        // =================== Chapter generation status module entry ===================

        // ===== 模板选择弹窗（侧边栏 + 卡片布局）=====
// =================== Template page module entry ===================
        // 提示词模板弹窗、模板市场与模板管理前端逻辑已拆到 scripts/core/app-template-page.js。
        var openTemplateSelector = window.openTemplateSelector;
        var buildTplSidebar = window.buildTplSidebar;
        var selectTemplateInModal = window.selectTemplateInModal;
        var refreshTplGrid = window.refreshTplGrid;
        var _fetchPublicTemplates = window._fetchPublicTemplates;
        var refreshTemplatePage = window.refreshTemplatePage;
        var refreshTemplateGrid = window.refreshTemplateGrid;
        var openTemplateDetail = window.openTemplateDetail;
        var renderTemplateComments = window.renderTemplateComments;
        var renderTemplateRating = window.renderTemplateRating;
        var toggleFavTemplate = window.toggleFavTemplate;
        var clearCreateForm = window.clearCreateForm;
        var renderTempTags = window.renderTempTags;
        var getMyCreatorId = window.getMyCreatorId;
        var refreshManageTplList = window.refreshManageTplList;

        // =================== Memory page module entry ===================
        // 记忆库页面、文件夹、文件列表、编辑弹窗和批量管理前端逻辑已拆到 scripts/core/app-memory-page.js。
        var refreshMemGrid = window.refreshMemGrid;
        var _loadMemBooks = window._loadMemBooks;
        var getMemBooks = window.getMemBooks;
        var _saveMemBooks = window._saveMemBooks;
        var sMB = window.sMB;
        var openMemBook = window.openMemBook;
        var closeMem = window.closeMem;
        var renderMemFolderSidebar = window.renderMemFolderSidebar;
        var renderMemFileList = window.renderMemFileList;
        var refreshMemTree = window.refreshMemTree;
        var renameMemFolder = window.renameMemFolder;
        var deleteMemFolder = window.deleteMemFolder;
        var showFolderContextMenu = window.showFolderContextMenu;
        var exportFolder = window.exportFolder;
        var exportFolderWithJSZip = window.exportFolderWithJSZip;
        var renameMemFile = window.renameMemFile;
        var deleteMemFile = window.deleteMemFile;
        var updateFolderCheckbox = window.updateFolderCheckbox;
        var updateMemSelectedCount = window.updateMemSelectedCount;
        var openMemFileEditor = window.openMemFileEditor;
        var updateMemMainBatchUI = window.updateMemMainBatchUI;
        var exitMemBatchMode = window.exitMemBatchMode;

        // =================== Settings page module entry ===================
        var refreshSettings = window.refreshSettings;

        // Settings page local handlers are split into scripts/core/app-settings-page.js.

        // =================== Write stats module entry ===================

        // =================== Auth/account module entry ===================
        var SESSION_KEY = window.SESSION_KEY;
        var SESSION_EXPIRY_MS = window.SESSION_EXPIRY_MS;
        var saveSession = window.saveSession;
        var clearSession = window.clearSession;
        var createAuthExpiredError = window.createAuthExpiredError;
        var isAuthExpiredError = window.isAuthExpiredError;
        var handleAuthExpired = window.handleAuthExpired;
        var ensureAuthSessionForAction = window.ensureAuthSessionForAction;
        var restoreSession = window.restoreSession;
        var refreshUserUI = window.refreshUserUI;
        var getAuthHeaders = window.getAuthHeaders;
        var getAuthErrorMessage = window.getAuthErrorMessage;
        var setAuthMode = window.setAuthMode;
        var updateSinglePageAuthGate = window.updateSinglePageAuthGate;
        var syncSingleAuthMode = window.syncSingleAuthMode;
        var setSingleAuthPasswordVisible = window.setSingleAuthPasswordVisible;
        var bindSingleAuthPasswordToggle = window.bindSingleAuthPasswordToggle;
        var goToHome = window.goToHome;
        var openUserPanel = window.openUserPanel;
        var logout = window.logout;
        var saveProfileToLocal = window.saveProfileToLocal;

        // Account profile editor handlers are split into scripts/core/app-account-profile.js.

        // App startup flow moved to scripts/core/app-init.js.
        const init = window.init;
        // =================== Editor dirty state module entry ===================
        const setLastSavedContent = window.setLastSavedContent;
        const updateDirtyIndicator = window.updateDirtyIndicator;

        // =================== Selection formatting module entry ===================

        // =================== 大纲生成功能 ===================
        // =================== Outline UI module entry ===================
        const OUTLINE_GENRES_MALE = window.OUTLINE_GENRES_MALE;
        const OUTLINE_GENRES_FEMALE = window.OUTLINE_GENRES_FEMALE;
        const OUTLINE_WORDCOUNT = window.OUTLINE_WORDCOUNT;
        const initGenreTags = window.initGenreTags;

        // ===== 生成剧本：打开配置弹窗 =====
        // Script generation handlers are split into scripts/core/app-script-generation.js.

        // Outline template selector handlers are split into scripts/core/app-outline-template-selector.js.

        // ===== 导入参考书籍（与作品榜单互斥，仅保留1本）=====
        // Outline reference book picker handler is split into scripts/core/app-outline-ref-book-picker.js.

        // Outline continue modal UI handler is split into scripts/core/app-outline-continue-modal.js.
        // Outline continue local upload handler is split into scripts/core/app-outline-continue-upload.js.

        // 大纲续写 AI 生成已拆到 scripts/core/app-outline-continue-generate.js。
        const startOutlineContinueGenerate = window.startOutlineContinueGenerate;

        // ===== 刷新榜单：只获取书名 + 简介 =====

        // ===== 自定义搜索：秘塔搜索 + AI 格式化为书单 =====



        // Outline template modal close handler is split into scripts/core/app-outline-template-modal.js.

        // outlineStart handler is split into scripts/core/app-outline-actions.js.

        // Outline copy button handler is split into scripts/core/app-outline-copy.js.

        // outlineSave handler is split into scripts/core/app-outline-actions.js.

        // =================== Write layout module entry ===================
        // Writing-page splitters and panel collapse bindings are split into scripts/core/app-write-layout.js.

        // =================== Floating execution log module entry ===================
        // Floating execution log popup is split into scripts/core/app-floating-log.js.
        // Plot feedback assistant logic is split into scripts/core/app-plot-feedback.js.

        // Draft autosave logic is split into scripts/core/app-draft-autosave.js.


        // Action panel, fine outline, decompose, and AI polish UI logic is split into scripts/core/app-action-panel.js.

        // =================== Global errors module entry ===================
        // Global browser error logging is split into scripts/core/app-global-errors.js.
        // 页面关闭/刷新前紧急保存当前章节到 localStorage（同步操作，确保不丢数据）
        // Page close/refresh emergency save is split into scripts/core/app-beforeunload-save.js.

        init();

