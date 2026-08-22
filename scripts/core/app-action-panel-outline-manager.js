// 细纲本地缓存管理。
window.OutlineManager = {
  save: function(bookName, chapterId, content) {
    var key = window.AccountDataScope.key('outline_' + bookName + '_' + chapterId);
    if (window.ZHIYU_LARGE_LOCAL_STORE?.set) {
      window.ZHIYU_LARGE_LOCAL_STORE.set(key, content || '', 'chapter_outline').catch(function(error) {
        console.error('细纲草稿保存失败：', error);
      });
      return;
    }
    try { localStorage.setItem(key, content); } catch (e) {}
  },
  load: function(bookName, chapterId) {
    var key = window.AccountDataScope.key('outline_' + bookName + '_' + chapterId);
    return window.ZHIYU_LARGE_LOCAL_STORE?.get?.(key) ?? localStorage.getItem(key) ?? '';
  },
  remove: function(bookName, chapterId) {
    var key = window.AccountDataScope.key('outline_' + bookName + '_' + chapterId);
    if (window.ZHIYU_LARGE_LOCAL_STORE?.remove) {
      window.ZHIYU_LARGE_LOCAL_STORE.remove(key).catch(function(error) {
        console.error('细纲草稿删除失败：', error);
      });
    } else {
      localStorage.removeItem(key);
    }
  },
  listChapters: function(bookName) {
    var prefix = 'outline_' + bookName + '_', suffix = '__uid_' + window.AccountDataScope.getActiveUid(), keys = [];
    var storedKeys = window.ZHIYU_LARGE_LOCAL_STORE?.list?.(prefix) || [];
    storedKeys.forEach(function(k) {
      if (k.endsWith(suffix)) keys.push(k.slice(prefix.length, -suffix.length));
    });
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(prefix) === 0 && k.endsWith(suffix)) {
        var chapterId = k.slice(prefix.length, -suffix.length);
        if (!keys.includes(chapterId)) keys.push(chapterId);
      }
    }
    return keys;
  }
};

window.ZHIYU_OUTLINE_MANAGER_READY = true;
