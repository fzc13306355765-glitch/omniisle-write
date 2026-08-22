// Split project local access module.
// Keeps small local-storage wrappers out of the legacy main script.
(function(window) {
    'use strict';

    const StorageService = window.ZHIYU_STORAGE_SERVICE || window.StorageService;

        function gA(){
            let config = StorageService.getApiConfig();
            // 如果旧API配置为空但从模型选择器有自定义模型，自动读取
            if (!config.key && typeof customModels !== 'undefined' && customModels.length > 0) {
                const cm = customModels[0];
                config.key = cm.key || '';
                config.base = cm.base || '';
                config.model = cm.name || '';
            }
            return config;
        }
        function sA(a){ return StorageService.saveApiConfig(a); }
        function gS(){ return StorageService.getSettings(); }
        function sS(s){ StorageService.saveSettings(s); }

        function getBooksByStatus(st){ let all=StorageService.getBooks(), res={}; for(let n in all) if(all[n].status===st) res[n]=all[n]; return res; }

    window.gA = gA;
    window.sA = sA;
    window.gS = gS;
    window.sS = sS;
    window.getBooksByStatus = getBooksByStatus;
})(window);
