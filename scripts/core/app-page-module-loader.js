(function initPageModuleLoader(window, document) {
    'use strict';

    const pagePromises = new Map();
    const sourcePromises = new Map();

    function loadSource(source) {
        const normalized = String(source || '').trim();
        if (!normalized) return Promise.resolve();
        if (sourcePromises.has(normalized)) return sourcePromises.get(normalized);
        const promise = new Promise(function(resolve, reject) {
            const script = document.createElement('script');
            script.src = normalized;
            script.async = false;
            script.dataset.zhiyuLazyLoaded = '1';
            script.onload = function() { resolve(); };
            script.onerror = function() { reject(new Error('页面模块加载失败：' + normalized)); };
            document.head.appendChild(script);
        });
        sourcePromises.set(normalized, promise);
        return promise;
    }

    function ensure(pageId) {
        const page = String(pageId || '').trim();
        if (!page) return Promise.resolve();
        if (pagePromises.has(page)) return pagePromises.get(page);
        const blocks = Array.from(document.querySelectorAll(
            'template[data-zhiyu-lazy][data-page="' + page + '"][data-src]'
        ));
        const promise = blocks.reduce(function(chain, block) {
            return chain.then(function() { return loadSource(block.dataset.src); });
        }, Promise.resolve()).then(function() {
            document.dispatchEvent(new CustomEvent('zhiyu:page-modules-ready', { detail: { page } }));
        });
        pagePromises.set(page, promise);
        return promise;
    }

    window.ZhiyuPageModules = Object.freeze({ ensure });
    window.ZHIYU_PAGE_MODULE_LOADER_READY = true;
})(window, document);
