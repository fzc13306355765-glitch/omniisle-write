(function(window) {
    'use strict';

    function getRefUiPreferenceKey(bookName, refType, kind) {
        const suffix = String(bookName || '') + '_' + (refType || 'body');
        const prefix = kind === 'visible'
            ? 'zhiyu_ref_visible_files_'
            : kind === 'settingsOpen'
                ? 'zhiyu_ref_settings_open_'
                : kind === 'moreExpanded'
                    ? 'zhiyu_ref_more_expanded_'
                    : 'zhiyu_ref_order_';
        return window.AccountDataScope.key(prefix + suffix);
    }

    function getRefDisplayKey(bookName, refType) {
        return getRefUiPreferenceKey(bookName, refType, 'order');
    }

    function readRefUiPreference(key) {
        const transient = window.AppState?.ui?.refUiTransientPreferences || {};
        if (Object.prototype.hasOwnProperty.call(transient, key)) return transient[key];
        if (window.BrowserStoragePolicy?.readJsonWithFallback) {
            return window.BrowserStoragePolicy.readJsonWithFallback(key, window.sessionStorage, window.localStorage);
        }
        for (const storage of [window.sessionStorage, window.localStorage]) {
            try {
                const raw = storage?.getItem(key);
                if (raw !== null && raw !== undefined) return JSON.parse(raw);
            } catch (error) {}
        }
        return null;
    }

    function writeRefUiPreference(key, value) {
        try {
            const target = window.BrowserStoragePolicy?.writeJsonWithFallback
                ? window.BrowserStoragePolicy.writeJsonWithFallback(key, value, window.localStorage, window.sessionStorage)
                : (window.localStorage.setItem(key, JSON.stringify(value)), 'local');
            if (window.AppState?.ui?.refUiTransientPreferences) {
                delete window.AppState.ui.refUiTransientPreferences[key];
            }
            return target;
        } catch (error) {
            if (!window.AppState) window.AppState = {};
            if (!window.AppState.ui) window.AppState.ui = {};
            if (!window.AppState.ui.refUiTransientPreferences) window.AppState.ui.refUiTransientPreferences = {};
            window.AppState.ui.refUiTransientPreferences[key] = value;
            return 'memory';
        }
    }

    function updateRefFilesCollapsedPreference(collapsedKey, currentCollapsed) {
        const nextCollapsed = !currentCollapsed;
        const saveTarget = writeRefUiPreference(collapsedKey, nextCollapsed ? 1 : 0);
        if (saveTarget === 'memory') window.Toast?.warn?.('浏览器存储空间不足，本次收起状态仅在当前页面有效');
        window.refreshTree?.();
        return nextCollapsed;
    }

    function updateRefVisibilitySetting(fileKey, checked, selectedNames, visibleKey, settingsOpenKey) {
        const current = Array.isArray(selectedNames) ? selectedNames : [];
        const nextNames = checked
            ? current.concat(fileKey)
            : current.filter(function(name) { return name !== fileKey; });
        const clean = Array.from(new Set(nextNames.filter(Boolean)));
        const saveTarget = writeRefUiPreference(visibleKey, clean);
        if (settingsOpenKey) writeRefUiPreference(settingsOpenKey, 1);
        if (saveTarget === 'memory') window.Toast?.warn?.('浏览器存储空间不足，本次显示设置仅在当前页面有效');
        window.refreshTree?.();
        return clean;
    }

    function getRefDisplayOrder(bookName, refType, files) {
        const names = (files || []).map(file => file.displayName || file.name).filter(Boolean);
        const stored = readRefUiPreference(getRefDisplayKey(bookName, refType));
        const legacyNames = { '母大纲': '剧情总览', '拆书': '拆书设定', '仿写': '拆书设定', '仿写设定': '拆书设定', '信息卡': '信息表', '角色关系网': '角色列表' };
        const saved = Array.isArray(stored) ? Array.from(new Set(stored.map(name => legacyNames[name] || name))) : [];
        const currentSet = new Set(names);
        return saved.filter(name => currentSet.has(name))
            .concat(names.filter(name => !saved.includes(name)));
    }

    function saveRefDisplayOrder(bookName, refType, order) {
        const clean = Array.from(new Set((order || []).map(String).filter(Boolean)));
        writeRefUiPreference(getRefDisplayKey(bookName, refType), clean);
        return clean;
    }

    function updateRefDisplayOrder(bookName, refType, order, settingsOpenKey) {
        const clean = Array.from(new Set((order || []).map(String).filter(Boolean)));
        const saveTarget = writeRefUiPreference(getRefDisplayKey(bookName, refType), clean);
        if (settingsOpenKey) writeRefUiPreference(settingsOpenKey, 1);
        if (saveTarget === 'memory') window.Toast?.warn?.('浏览器存储空间不足，本次排序仅在当前页面有效');
        window.refreshTree?.();
        return clean;
    }

    function sortStageOutlineDisplayFiles(files) {
        const list = (files || []).slice();
        const originalOrder = new Map(list.map((file, index) => [file, index]));
        function rank(file) {
            const name = String(file?.displayName || file?.name || '');
            if (name === '大纲') return 0;
            if (name === '剧情总览') return 1;
            const match = name.match(/^S(\d{1,})阶段粗纲$/i) || name.match(/^阶段粗纲[-_—].*?S(\d{1,})/i);
            if (match) return 10 + Number(match[1] || 0);
            return 1000 + (originalOrder.get(file) || 0);
        }
        return list.sort((a, b) => rank(a) - rank(b));
    }

    function sortRefDisplayFiles(bookName, refType, files) {
        const naturalFiles = sortStageOutlineDisplayFiles(files);
        const order = getRefDisplayOrder(bookName, refType, naturalFiles);
        const rank = new Map(order.map((name, index) => [name, index]));
        return naturalFiles.sort((a, b) => (rank.get(a.displayName || a.name) ?? 9999) - (rank.get(b.displayName || b.name) ?? 9999));
    }

    Object.assign(window, {
        getRefUiPreferenceKey,
        getRefDisplayKey,
        readRefUiPreference,
        writeRefUiPreference,
        updateRefFilesCollapsedPreference,
        updateRefVisibilitySetting,
        getRefDisplayOrder,
        saveRefDisplayOrder,
        updateRefDisplayOrder,
        sortStageOutlineDisplayFiles,
        sortRefDisplayFiles
    });
})(window);
