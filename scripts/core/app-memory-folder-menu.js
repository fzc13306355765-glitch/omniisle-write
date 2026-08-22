// 拆分项目记忆库文件夹右键菜单模块。
// 只负责前端菜单展示，不直接读写记忆文件内容。
(function(window) {
    'use strict';

    function showFolderContextMenu(x, y, folderName) {
        const existingMenu = document.getElementById('folderContextMenu');
        if (existingMenu) existingMenu.remove();

        const menu = document.createElement('div');
        menu.id = 'folderContextMenu';
        menu.style.cssText = 'position:fixed;background:#fff;border:1px solid #e2e5ea;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:10000;min-width:140px;padding:4px 0;';
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';

        const menuItems = [
            { label: '重命名', icon: '✎', action: () => window.renameMemFolder?.(folderName) },
            { label: '导出文件夹', icon: '📦', action: () => window.exportFolder?.(folderName) }
        ];

        menuItems.forEach(item => {
            const menuItem = document.createElement('div');
            menuItem.style.cssText = 'padding:8px 16px;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:8px;';
            menuItem.innerHTML = `<span>${item.icon}</span><span>${item.label}</span>`;
            menuItem.onmouseenter = () => menuItem.style.background = '#f5f5f5';
            menuItem.onmouseleave = () => menuItem.style.background = '';
            menuItem.onclick = () => {
                item.action();
                menu.remove();
            };
            menu.appendChild(menuItem);
        });

        document.body.appendChild(menu);

        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }

    window.showFolderContextMenu = showFolderContextMenu;
    window.ZHIYU_MEMORY_FOLDER_MENU_READY = true;
})(window);
