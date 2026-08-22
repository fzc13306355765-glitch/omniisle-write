(function(window) {
    'use strict';

    function getApiSettings() {
        if (typeof window.gA === 'function') return window.gA() || {};
        return {};
    }

    function saveApiSettings(api) {
        if (typeof window.sA === 'function') window.sA(api || {});
    }

    function setValue(id, value) {
        const el = document.getElementById(id);
        if (el) el.value = value || '';
    }

    function refreshPub() {
        const api = getApiSettings();
        setValue('pubCookie', api.cookie);
        setValue('pubUrl', api.pubUrl);
    }

    function savePublishSettings() {
        const api = getApiSettings();
        const cookieEl = document.getElementById('pubCookie');
        const urlEl = document.getElementById('pubUrl');
        api.cookie = cookieEl ? cookieEl.value : '';
        api.pubUrl = urlEl ? urlEl.value : '';
        saveApiSettings(api);

        const statusEl = document.getElementById('apiStatus');
        if (statusEl) {
            statusEl.textContent = '发布设置已保存';
            setTimeout(() => {
                statusEl.textContent = '';
            }, 2000);
        }
    }

    document.getElementById('btnPublishSave')?.addEventListener('click', savePublishSettings);

    window.refreshPub = refreshPub;
    window.ZHIYU_PUBLISH_PAGE_READY = true;
})(window);
