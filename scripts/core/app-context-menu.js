(function () {
  'use strict';

  function getContextMenu() {
    return document.getElementById('ctxMenu');
  }

  function getPrompt() {
    return window.ZHIYU_PROMPT || window.Prompt || { show: function () { return Promise.resolve(''); } };
  }

  function getConfirm() {
    return window.ZHIYU_CONFIRM || window.Confirm || { show: function () { return Promise.resolve(false); } };
  }

  function getToast() {
    return window.ZHIYU_TOAST || window.Toast || { warn: function () {}, success: function () {}, error: function () {} };
  }

  function getAppState() {
    return window.ZHIYU_APP_STATE || window.AppState || {};
  }

  function positionMenu(menu, event) {
    if (!menu || !event) return;
    menu.style.display = 'block';
    menu.style.left = event.clientX + 'px';
    menu.style.top = event.clientY + 'px';
  }

  function hideContextMenus(event) {
    if (event && event.target && event.target.closest('.book-menu')) return;
    const menu = getContextMenu();
    if (menu) menu.style.display = 'none';
    document.querySelectorAll('.book-menu').forEach((item) => {
      item.style.display = 'none';
      item.closest('.book-card')?.classList.remove('overview-book-menu-open');
    });
  }

  function showChapterContextMenu(event, bookName, volumeIndex, chapterIndex) {
    const menu = getContextMenu();
    if (!menu) return;

    menu.innerHTML = '<div data-action="import-chapter">⬆ 导入到本章</div><div data-action="export-chapter">⬇ 导出本章</div><div data-action="rename">📝 重命名</div><div data-action="delete">🗑️ 删除</div>';
    positionMenu(menu, event);
    menu.querySelectorAll('div').forEach((item) => {
      item.onclick = async function () {
        const action = this.dataset.action;
        menu.style.display = 'none';
        if (action === 'import-chapter') {
          const books = typeof window.gB === 'function' ? window.gB() : {};
          const book = books[bookName];
          const volume = book && book.volumes ? book.volumes[volumeIndex] : null;
          const chapter = volume && volume.chapters ? volume.chapters[chapterIndex] : null;
          if (!book || !volume || !chapter) {
            getToast().warn('未找到当前章节');
            return;
          }
          if (typeof window.zhiyuPickLocalFileForTargetImport !== 'function') {
            getToast().warn('导入功能尚未初始化完成，请刷新页面后重试');
            return;
          }
          window.zhiyuPickLocalFileForTargetImport({
            type: 'chapter',
            bookName: bookName,
            volumeName: volume.name || ('第' + (volumeIndex + 1) + '卷'),
            chapterName: chapter.name || ('第' + (chapterIndex + 1) + '章')
          });
        } else if (action === 'export-chapter') {
          if (typeof window.zhiyuExportChapter !== 'function') {
            getToast().warn('导出功能尚未初始化完成，请刷新页面后重试');
            return;
          }
          window.zhiyuExportChapter(bookName, volumeIndex, chapterIndex);
        } else if (action === 'rename') {
          const newName = await getPrompt().show('请输入新章节名：');
          if (newName) window.renameChapter(bookName, volumeIndex, chapterIndex, newName);
        } else if (action === 'delete') {
          const confirmed = await getConfirm().show('确定删除？');
          if (confirmed) window.deleteChapter(bookName, volumeIndex, chapterIndex);
        }
      };
    });
  }

  function showVolumeContextMenu(event, bookName, volumeIndex, volume, book) {
    const menu = getContextMenu();
    if (!menu) return;

    menu.innerHTML = '<div data-action="import-vol">⬆ 导入到本卷</div><div data-action="export-vol">⬇ 导出本卷</div><div data-action="rename-vol">📝 重命名</div><div data-action="delete-vol">🗑️ 删除</div>';
    positionMenu(menu, event);
    menu.querySelectorAll('div').forEach((item) => {
      item.onclick = async function () {
        const action = this.dataset.action;
        menu.style.display = 'none';
        if (action === 'import-vol') {
          const targetVolume = volume || (book && book.volumes ? book.volumes[volumeIndex] : null);
          if (!targetVolume) {
            getToast().warn('未找到当前分卷');
            return;
          }
          if (typeof window.zhiyuPickLocalFileForTargetImport !== 'function') {
            getToast().warn('导入功能尚未初始化完成，请刷新页面后重试');
            return;
          }
          window.zhiyuPickLocalFileForTargetImport({
            type: 'volume',
            bookName: bookName,
            volumeName: targetVolume.name || ('第' + (volumeIndex + 1) + '卷')
          });
        } else if (action === 'export-vol') {
          if (typeof window.zhiyuExportVolume !== 'function') {
            getToast().warn('导出功能尚未初始化完成，请刷新页面后重试');
            return;
          }
          window.zhiyuExportVolume(bookName, volumeIndex);
        } else if (action === 'rename-vol') {
          const newName = await getPrompt().show('请输入新卷名：', volume.name);
          if (newName && newName.trim()) {
            const books = window.gB();
            books[bookName].volumes[volumeIndex].name = newName.trim();
            window.sB(books);
            window.refreshTree();
          }
        } else if (action === 'delete-vol') {
          if (book.volumes.length <= 1) {
            getToast().warn('至少保留一个卷');
            return;
          }
          const hasChapters = volume.chapters && volume.chapters.length > 0;
          const message = hasChapters
            ? `卷「${volume.name}」内有 ${volume.chapters.length} 个章节，是否一并删除？`
            : `确定删除卷「${volume.name}」？`;
          const confirmed = await getConfirm().show(message);
          if (confirmed) {
            const books = window.gB();
            books[bookName].volumes.splice(volumeIndex, 1);
            const state = getAppState();
            if (state.chapter && state.chapter.book === bookName && state.chapter.vi === volumeIndex) {
              state.chapter.vi = 0;
              state.chapter.ci = 0;
            }
            window.sB(books);
            window.refreshTree();
            getToast().success('已删除');
          }
        }
      };
    });
  }

  function bindContextMenuDismiss() {
    if (document.documentElement.dataset.contextMenuDismissBound === '1') return;
    document.documentElement.dataset.contextMenuDismissBound = '1';
    document.addEventListener('click', hideContextMenus);
  }

  window.showCtxMenu = showChapterContextMenu;
  window.showVolumeCtxMenu = showVolumeContextMenu;
  window.hideContextMenus = hideContextMenus;
  window.bindContextMenuDismiss = bindContextMenuDismiss;
  window.ZHIYU_CONTEXT_MENU_READY = true;

  bindContextMenuDismiss();
})();
