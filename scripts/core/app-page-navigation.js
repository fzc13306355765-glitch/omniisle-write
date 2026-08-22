// Split project page navigation module.
// Keeps sidebar page switching and collapse button wiring out of the legacy main script.
(function(window, document) {
    'use strict';

    const AppState = window.ZHIYU_APP_STATE;
    const ResponsiveDevice = window.ZHIYU_RESPONSIVE_DEVICE;
    const tabletSidebarFallbackMedia = window.matchMedia(
        '(min-width: 600px) and (min-height: 600px) '
        + 'and (any-pointer: coarse) and (max-width: 1440px)'
    );

    function isTabletLayout() {
        return typeof ResponsiveDevice?.isTablet === 'function'
            ? ResponsiveDevice.isTablet()
            : tabletSidebarFallbackMedia.matches;
    }

    function callIfReady(name) {
        if (typeof window[name] === 'function') {
            window[name]();
        }
    }

    async function switchPage(id) {
        const previousPage = AppState.ui.page;
        if (previousPage === 'write' && typeof window.flushTodayWritingTime === 'function') {
            window.flushTodayWritingTime();
        }
        AppState.ui.page = id;
        document.querySelectorAll('#sideNav .nav-item').forEach(n => n.classList.remove('active'));
        let active = document.querySelector('#sideNav .nav-item[data-page="' + id + '"]');
        if (active) active.classList.add('active');
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        let page = document.getElementById('page-' + id);
        if (page) page.classList.add('active');
        await refreshPage(id);
        if (id === 'write' && typeof window.resetWritingTimeTick === 'function') {
            window.resetWritingTimeTick(true);
        }
    }

    async function refreshPage(id) {
        if (id === 'write' || id === 'memory') {
            await window.ensureStartupMemoryReady?.();
        }
        if (id === 'overview') callIfReady('refreshOverview');
        else if (id === 'write') {
            callIfReady('refreshBookSelect');
            callIfReady('refreshTree');
            callIfReady('ensureWritingBookSelected');
        } else if (id === 'memory') callIfReady('refreshMemGrid');
        else if (id === 'template') {
            const ensure = window.ZhiyuPageModules?.ensure;
            if (typeof ensure === 'function') {
                return ensure('template').then(function() { callIfReady('refreshTemplatePage'); });
            }
            callIfReady('refreshTemplatePage');
        }
        else if (id === 'publish') callIfReady('refreshPub');
        else if (id === 'setting') callIfReady('refreshSettings');
    }

    function syncTabletSidebar() {
        const sidebar = document.getElementById('sidebar');
        const collapseButton = document.getElementById('collapseBtn');
        if (!sidebar) return;

        if (isTabletLayout()) {
            if (!sidebar.classList.contains('collapsed')) {
                sidebar.classList.add('collapsed');
                sidebar.dataset.tabletDefaultCollapsed = 'true';
            }
        } else if (sidebar.dataset.tabletDefaultCollapsed === 'true') {
            sidebar.classList.remove('collapsed');
            delete sidebar.dataset.tabletDefaultCollapsed;
        }

        if (collapseButton) {
            collapseButton.innerHTML = sidebar.classList.contains('collapsed') ? '▶' : '◀';
            collapseButton.title = sidebar.classList.contains('collapsed') ? '展开导航栏' : '收起导航栏';
        }
    }

    function syncTabletViewport() {
        const root = document.documentElement;
        if (!isTabletLayout()) {
            root.style.removeProperty('--zhiyu-tablet-viewport-height');
            root.style.removeProperty('--zhiyu-tablet-viewport-top');
            return;
        }

        const viewport = window.visualViewport;
        const viewportHeight = Math.max(1, Math.round(viewport?.height || window.innerHeight));
        const viewportTop = Math.max(0, Math.round(viewport?.offsetTop || 0));
        root.style.setProperty('--zhiyu-tablet-viewport-height', viewportHeight + 'px');
        root.style.setProperty('--zhiyu-tablet-viewport-top', viewportTop + 'px');
    }

    function syncTabletLayout() {
        syncTabletSidebar();
        syncTabletViewport();
    }

    function bindPageNavigation() {
        syncTabletLayout();
        if (typeof ResponsiveDevice?.subscribe === 'function') {
            ResponsiveDevice.subscribe(syncTabletLayout);
        } else if (typeof tabletSidebarFallbackMedia.addEventListener === 'function') {
            tabletSidebarFallbackMedia.addEventListener('change', syncTabletLayout);
        } else {
            tabletSidebarFallbackMedia.addListener?.(syncTabletLayout);
        }
        window.addEventListener('resize', syncTabletLayout);
        window.addEventListener('orientationchange', syncTabletLayout);
        window.visualViewport?.addEventListener('resize', syncTabletViewport);
        window.visualViewport?.addEventListener('scroll', syncTabletViewport);
        document.querySelectorAll('#sideNav .nav-item').forEach(i => i.addEventListener('click', async function() {
            await switchPage(this.dataset.page);
        }));
        document.getElementById('collapseBtn')?.addEventListener('click', async function() {
            if (isTabletLayout()) return;
            let sb = document.getElementById('sidebar');
            sb.classList.toggle('collapsed');
            this.innerHTML = sb.classList.contains('collapsed') ? '▶' : '◀';
            this.title = sb.classList.contains('collapsed') ? '展开导航栏' : '收起导航栏';
        });
    }

    window.switchPage = switchPage;
    window.refreshPage = refreshPage;
    window.syncTabletSidebar = syncTabletSidebar;
    window.syncTabletViewport = syncTabletViewport;
    window.bindPageNavigation = bindPageNavigation;
})(window, document);
