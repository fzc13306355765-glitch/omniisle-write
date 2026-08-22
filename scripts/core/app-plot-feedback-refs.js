// ===== 剧情反馈助手：参考文件与记忆库选择 =====
(function(){
  function createPlotFeedbackRefController(options) {
    options = options || {};

    var btnUpload = options.btnUpload || null;
    var btnChooseMemory = options.btnChooseMemory || null;
    var btnUploadFile = options.btnUploadFile || null;
    var btnUploadFolder = options.btnUploadFolder || null;
    var fileInput = options.fileInput || null;
    var folderInput = options.folderInput || null;
    var fileChip = options.fileChip || null;
    var uploadMenu = options.uploadMenu || null;
    var Toast = options.Toast || window.ZHIYU_TOAST || window.Toast || { warn: function(){} };
    var Modal = options.Modal || window.ZHIYU_MODAL || window.Modal || { open: function(){} };
    var AppState = options.AppState || window.ZHIYU_APP_STATE || window.AppState || {};
    var getRefFileContent = options.getRefFileContent || window.getRefFileContent || function() { return null; };
    var ensureMemBook = options.ensureMemBook || window.ensureMemBook || function() {};
    var updateLinkedMemoryCount = options.updateLinkedMemoryCount || window.updateLinkedMemoryCount || function() {};
    var refreshMemoryLinkTree = options.refreshMemoryLinkTree || window.refreshMemoryLinkTree || function() {};
    var readTextFile = options.readFileAsText || readFileAsText;

    var refFile = null;
    var refLoadVersion = 0;
    var MAX_REF_BYTES = 200 * 1024;
    var MAX_FOLDER_BYTES = 500 * 1024;
    var MAX_FOLDER_FILES = 20;
    var ALLOWED_EXTS = ['txt', 'md', 'markdown', 'csv', 'json'];

    if (!AppState.chapter) AppState.chapter = {};
    if (!AppState.gen) AppState.gen = {};
    if (!Array.isArray(AppState.gen.linkedFiles)) AppState.gen.linkedFiles = [];

    function getRefFile() {
      return refFile;
    }

    function getReferenceOwnerScope() {
      return {
        ownerUid: String(window.AccountDataScope?.getActiveUid?.() || AppState.auth?.uid || 'guest'),
        bookName: String((AppState.chapter && AppState.chapter.book) || document.getElementById?.('bookSel')?.value || '')
      };
    }

    function beginReferenceLoad() {
      var scope = getReferenceOwnerScope();
      scope.version = ++refLoadVersion;
      return scope;
    }

    function isReferenceLoadCurrent(loadScope) {
      var current = getReferenceOwnerScope();
      return !!loadScope
        && loadScope.version === refLoadVersion
        && loadScope.ownerUid === current.ownerUid
        && loadScope.bookName === current.bookName;
    }

    function clearRefFile() {
      refLoadVersion += 1;
      refFile = null;
      if (fileInput) fileInput.value = '';
      if (folderInput) folderInput.value = '';
      renderFileChip();
    }

    function clearRefFileForBookChange() {
      clearRefFile();
      if (!AppState.assistant) AppState.assistant = {};
      AppState.assistant.linkedFiles = [];
      if (window._linkMemoryContext === 'plot-feedback') {
        window._linkMemoryContext = null;
      }
      updateLinkedMemoryCount();
      return true;
    }

    function renderFileChip() {
      if (!fileChip) return;
      fileChip.textContent = '';
      if (!refFile) {
        fileChip.classList.remove('show');
        return;
      }
      var name = document.createElement('span');
      name.textContent = refFile.name;
      var close = document.createElement('button');
      close.type = 'button';
      close.title = '移除参考文件';
      close.textContent = 'x';
      close.addEventListener('click', clearRefFile);
      fileChip.appendChild(name);
      fileChip.appendChild(close);
      fileChip.classList.add('show');
    }

    function readFileAsText(file) {
      return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onload = function() { resolve(String(reader.result || '')); };
        reader.onerror = function() { reject(new Error('文件读取失败')); };
        reader.readAsText(file, 'utf-8');
      });
    }

    function closeUploadMenu() {
      if (uploadMenu) uploadMenu.classList.remove('open');
    }

    function isAllowedTextFile(file) {
      var ext = (file.name.split('.').pop() || '').toLowerCase();
      return ALLOWED_EXTS.indexOf(ext) !== -1;
    }

    async function applySingleFile(file) {
      if (!file) return;
      if (!isAllowedTextFile(file)) {
        Toast.warn('参考文件仅支持 txt、md、csv、json，建议 200KB 内');
        if (fileInput) fileInput.value = '';
        return;
      }
      if (file.size > MAX_REF_BYTES) {
        Toast.warn('参考文件建议控制在 200KB 内');
        if (fileInput) fileInput.value = '';
        return;
      }
      var loadScope = beginReferenceLoad();
      var content = await readTextFile(file);
      if (!isReferenceLoadCurrent(loadScope)) return false;
      refFile = {
        name: file.name,
        size: file.size,
        content: content,
        memBook: loadScope.bookName,
        ownerUid: loadScope.ownerUid,
        files: [{ name: file.name, size: file.size, content: content, folder: '本次上传', memBook: loadScope.bookName, ownerUid: loadScope.ownerUid, sourceType: 'local-upload' }]
      };
      if (folderInput) folderInput.value = '';
      renderFileChip();
      return true;
    }

    async function applyFolderFiles(files) {
      files = Array.prototype.slice.call(files || []).filter(isAllowedTextFile);
      if (!files.length) {
        Toast.warn('文件夹内未找到 txt、md、csv、json 文件');
        if (folderInput) folderInput.value = '';
        return;
      }
      if (files.length > MAX_FOLDER_FILES) {
        Toast.warn('文件夹超过 20 个文本文件，本次未读取；请减少文件后重试');
        if (folderInput) folderInput.value = '';
        return;
      }
      var selected = files;
      var total = selected.reduce(function(sum, file) { return sum + Number(file.size || 0); }, 0);
      if (total > MAX_FOLDER_BYTES) {
        Toast.warn('文件夹参考内容超过 500KB，本次未读取；请减少文件后重试');
        if (folderInput) folderInput.value = '';
        return;
      }
      var parts = [];
      var referenceFiles = [];
      var loadScope = beginReferenceLoad();
      var rootName = (selected[0].webkitRelativePath || '').split('/')[0] || '参考文件夹';
      for (var j = 0; j < selected.length; j++) {
        var f = selected[j];
        var rel = f.webkitRelativePath || f.name;
        var fileContent = await readTextFile(f);
        if (!isReferenceLoadCurrent(loadScope)) return false;
        parts.push('【' + rel + '】\n' + fileContent);
        referenceFiles.push({ name: rel, size: f.size, content: fileContent, folder: rootName, relativePath: rel, memBook: loadScope.bookName, ownerUid: loadScope.ownerUid, sourceType: 'local-upload' });
      }
      if (!isReferenceLoadCurrent(loadScope)) return false;
      refFile = {
        name: rootName + '（' + selected.length + '个文件）',
        size: total,
        content: parts.join('\n\n---\n\n'),
        memBook: loadScope.bookName,
        ownerUid: loadScope.ownerUid,
        files: referenceFiles
      };
      if (fileInput) fileInput.value = '';
      renderFileChip();
      return true;
    }

    function cloneLinkedFiles(files) {
      return (files || []).map(function(f) { return Object.assign({}, f); });
    }

    function getPlotBookName() {
      return (AppState.chapter && AppState.chapter.book) || document.getElementById('bookSel')?.value || '';
    }

    function applyPlotMemorySelection() {
      if (window._linkMemoryContext !== 'plot-feedback') return;
      var selected = cloneLinkedFiles(AppState.assistant?.linkedFiles);
      var bookName = getPlotBookName();
      var parts = [];
      var referenceFiles = [];
      var missingFiles = [];
      selected.forEach(function(item) {
        var ref = bookName ? getRefFileContent(bookName, item.name, item.memFolder || item.folder, item.memIdx ?? item.idx, item.memFingerprint || item.fingerprint || '') : null;
        var content = ref ? ref.content : (item.content || '');
        if (content) {
          parts.push('【' + item.name + '】\n' + content);
          referenceFiles.push(Object.assign({}, item, {
            name: item.name,
            content: content,
            folder: ref?.folder || item.memFolder || item.folder,
            idx: ref?.idx ?? item.memIdx ?? item.idx
          }));
        } else missingFiles.push(item.name || '未命名资料');
      });
      if (missingFiles.length) {
        Toast.warn('参考文件已移动、不存在或内容为空，请重新选择：' + missingFiles.join('、'));
        return;
      }
      if (AppState.assistant) AppState.assistant.linkedFiles = [];
      window._linkMemoryContext = null;
      if (!parts.length) {
        Toast.warn('未选择可读取的记忆库文件');
        return;
      }
      var content = parts.join('\n\n---\n\n');
      refFile = {
        name: '记忆库文件（' + parts.length + '个）',
        size: content.length,
        content: content,
        files: referenceFiles
      };
      if (fileInput) fileInput.value = '';
      if (folderInput) folderInput.value = '';
      renderFileChip();
    }

    function openPlotMemorySelector() {
      var bookName = getPlotBookName();
      if (!bookName) { Toast.warn('请先选择书籍'); return; }
      ensureMemBook(bookName);
      if (!AppState.assistant) AppState.assistant = {};
      AppState.assistant.linkedFiles = [];
      window._linkMemoryContext = 'plot-feedback';
      Modal.open('memoryLinkModal');
      refreshMemoryLinkTree();
      updateLinkedMemoryCount();
    }

    if (btnUpload) {
      btnUpload.addEventListener('click', function(e) {
        e.stopPropagation();
        if (uploadMenu) uploadMenu.classList.toggle('open');
      });
    }
    if (uploadMenu) {
      uploadMenu.addEventListener('click', function(e) { e.stopPropagation(); });
    }
    document.addEventListener('click', closeUploadMenu);
    if (btnChooseMemory) {
      btnChooseMemory.addEventListener('click', function() {
        closeUploadMenu();
        openPlotMemorySelector();
      });
    }
    if (btnUploadFile && fileInput) {
      btnUploadFile.addEventListener('click', function() {
        closeUploadMenu();
        fileInput.click();
      });
      fileInput.addEventListener('change', async function() {
        try {
          await applySingleFile(fileInput.files && fileInput.files[0]);
        } catch (err) {
          Toast.warn('文件读取失败，请换一个文本文件');
          fileInput.value = '';
        }
      });
    }
    if (btnUploadFolder && folderInput) {
      btnUploadFolder.addEventListener('click', function() {
        closeUploadMenu();
        folderInput.click();
      });
      folderInput.addEventListener('change', async function() {
        try {
          await applyFolderFiles(folderInput.files);
        } catch (err) {
          Toast.warn('文件夹读取失败，请换一组文本文件');
          folderInput.value = '';
        }
      });
    }

    var plotMemoryModal = document.getElementById('memoryLinkModal');
    if (plotMemoryModal) {
      var plotMemoryObserver = new MutationObserver(function() {
        if (plotMemoryModal.style.display === 'none' && window._linkMemoryContext === 'plot-feedback') {
          applyPlotMemorySelection();
        }
      });
      plotMemoryObserver.observe(plotMemoryModal, { attributes: true, attributeFilter: ['style'] });
    }

    return {
      getRefFile: getRefFile,
      clearRefFile: clearRefFile,
      clearRefFileForBookChange: clearRefFileForBookChange,
      closeUploadMenu: closeUploadMenu,
      openPlotMemorySelector: openPlotMemorySelector,
      renderFileChip: renderFileChip,
      applySingleFile: applySingleFile,
      applyFolderFiles: applyFolderFiles
    };
  }

  window.createPlotFeedbackRefController = createPlotFeedbackRefController;
  window.ZHIYU_PLOT_FEEDBACK_REFS_READY = true;
})();
