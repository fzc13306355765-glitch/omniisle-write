// 拆分项目 AppState 模块。
// 只保存前端运行时初始状态，不改变作品、章节、模板或账号数据格式。
(function(window) {
    'use strict';

const AppState = {
            chapter: { book: null, vi: -1, ci: -1, localId: '' },
            gen: { templateId: '', refChapters: [], linkedFiles: [], linkedFilesByChapter: {}, linkedDefaultsInitializedByChapter: {}, linkedMemoryBookName: '', linkedMemoryBookScopeKey: '', linkedMemoryChapterScopeKey: '', plotInput: '', chapterGenerationFocus: 'story' },
            template: { viewingId: '', tab: 'fav', showAll: false, listTab: 'all', lengthCats: [], subCats: [], page: 1, pageSize: 12 },
            ui: { page: 'overview', tab: 'works', batchMode: false, searchQuery: '', bookForCover: '', overviewEditBook: '', dragChapter: null, selectedVolumeBook: '', selectedVolumeVi: -1 },
            memory: { book: '', folder: '', view: 'associated', batchMode: false },
            toolbar: { bold: false, italic: false, underline: false },
            outline: { genres: [], outlineNormalCustomGenre: '', outlineAdvancedGenres: [], templateId: '', content: '', tplTab: 'fav', tplShowAll: false, refBooks: [], importedWorkSummary: '', importedWorkName: '', genreGender: 'male', mode: 'outline', outlineSubMode: 'normal', outlineGenreExpanded: false, outlineAdvancedCustomGenre: '', outlineAdvancedCoreSummary: '', genrePreferenceTags: { normal: [], advanced: [], function: [] }, genrePreferenceAppliedGenres: { normal: [], advanced: [], function: [] } },
            outlineGen: { templateId: '', chapters: [], linkedFiles: [], linkedFilesByBook: {}, linkedMemoryBookName: '', linkedMemoryBookScopeKey: '', linkedOutlineFiles: [], advancedLinkedOutlineFiles: [], linkedOutlineFilesByBook: {}, advancedLinkedOutlineFilesByBook: {}, linkedOutlineBookName: '', advancedLinkedOutlineBookName: '', linkedOutlineBookScopeKey: '', advancedLinkedOutlineBookScopeKey: '', customInput: '', regexPattern: '', decomposeChapters: [] },
            selection: { text: '', range: null },
            auth: { isLoggedIn: false, uid: '', username: '', displayName: '', avatar: '' },
            sync: { status: 'synced', _versions: {} }
        };

    window.ZHIYU_APP_STATE = AppState;
})(window);
