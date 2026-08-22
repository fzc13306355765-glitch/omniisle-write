(function(window) {
    'use strict';

    const STORAGE_KEY = 'novel_theme';
    const root = document.documentElement;

    function normalizeTheme(value) {
        return String(value || '').toLowerCase() === 'dark' ? 'dark' : 'light';
    }

    function readStoredTheme() {
        try {
            return normalizeTheme(window.localStorage.getItem(STORAGE_KEY));
        } catch (error) {
            return 'light';
        }
    }

    function applyTheme(value, options) {
        const theme = normalizeTheme(value);
        const shouldPersist = options?.persist !== false;
        if (theme === 'dark') root.setAttribute('data-theme', 'dark');
        else root.removeAttribute('data-theme');
        if (shouldPersist) {
            try {
                window.localStorage.setItem(STORAGE_KEY, theme);
            } catch (error) {
                // Local storage may be unavailable in private or restricted browser contexts.
            }
        }
        const toggle = document.getElementById('darkModeToggle');
        if (toggle) toggle.checked = theme === 'dark';
        const sidebarToggle = document.getElementById('sidebarDarkModeToggle');
        if (sidebarToggle) {
            const enabled = String(theme === 'dark');
            sidebarToggle.setAttribute('aria-pressed', enabled);
            sidebarToggle.setAttribute('aria-checked', enabled);
            sidebarToggle.setAttribute(
                'aria-label',
                theme === 'dark' ? '切换到日间模式' : '切换到夜间模式'
            );
            sidebarToggle.title = theme === 'dark' ? '切换到日间模式' : '切换到夜间模式';
        }
        const sidebarState = document.getElementById('sidebarDarkModeState');
        if (sidebarState) {
            sidebarState.textContent = theme === 'dark' ? '当前为夜间模式' : '当前为日间模式';
        }
        window.dispatchEvent(new CustomEvent('zhiyu:theme-change', { detail: { theme: theme } }));
        return theme;
    }

    const initialTheme = readStoredTheme();
    applyTheme(initialTheme, { persist: false });

    window.ZHIYU_THEME = {
        storageKey: STORAGE_KEY,
        get: function() { return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; },
        readStored: readStoredTheme,
        apply: applyTheme
    };
})(window);
