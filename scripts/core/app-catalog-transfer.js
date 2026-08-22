// Catalog file transfer modal split from the latest test frontend.
// Handles selected chapter/memory export and local-file import as copies only.
(function(window, document) {
    'use strict';

    const AppState = window.ZHIYU_APP_STATE || window.AppState || {};
    const StorageService = window.ZHIYU_STORAGE_SERVICE || window.StorageService || {};
    const Utils = window.ZHIYU_UTILS || window.Utils || {
        escapeHtml: function(value) {
            return String(value || '').replace(/[&<>"']/g, function(ch) {
                return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch];
            });
        }
    };
    const Toast = window.ZHIYU_TOAST || window.Toast || { show: function(){}, warn: function(){}, success: function(){}, error: function(){} };
    const Confirm = window.ZHIYU_CONFIRM || window.Confirm || { show: function() { return Promise.resolve(true); } };
    const ZHIYU_SELECTIVE_TRANSFER_FORMAT = 'zhiyu-selective-transfer-v1';
    const ZHIYU_CATALOG_ZIP_FORMAT = 'zhiyu-catalog-transfer-zip-v2';
    const ZHIYU_CATALOG_MANIFEST = '知屿导出清单.json';
    const ZHIYU_MULTI_BOOK_ZIP_FORMAT = 'zhiyu-multi-book-backup-zip-v1';
    const ZHIYU_MULTI_BOOK_MANIFEST = '知屿作品备份清单.json';
    const ZHIYU_CATALOG_IMPORT_MAX_FILES = 2000;
    const ZHIYU_CATALOG_IMPORT_MAX_CHAPTERS = 20000;
    const ZHIYU_CATALOG_IMPORT_MAX_TEXT = 100 * 1024 * 1024;
    const ZHIYU_CATALOG_IMPORT_MAX_ZIP = 100 * 1024 * 1024;
    const ZHIYU_MEMORY_TRASH_KEY = '__memoryTrash';
    const ZHIYU_CATALOG_FOLDER_MAP = {
        associated: '关联文件文件夹',
        outline: '细纲文件夹',
        decompose: '拆书文件夹',
        summary: '剧情总结文件夹',
        custom: '用户自定义文件夹'
    };

    function gB() { return typeof window.gB === 'function' ? window.gB() : {}; }
    function getMemBooks() { return typeof window.getMemBooks === 'function' ? window.getMemBooks() : {}; }
    function countWordsSafe(text) { return typeof window.countWords === 'function' ? window.countWords(text) : String(text || '').replace(/\s/g, '').length; }
    function htmlToText(content) { return typeof window.zhiyuHtmlToText === 'function' ? window.zhiyuHtmlToText(content) : String(content || ''); }
    function normalizeBreaks(text) { return typeof window.zhiyuNormalizeBreaks === 'function' ? window.zhiyuNormalizeBreaks(text) : String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim(); }
    function plainToEditorHtml(text) { return typeof window.plainTextToEditorHTML === 'function' ? window.plainTextToEditorHTML(text) : Utils.escapeHtml(text).replace(/\n/g, '<br>'); }
    function parseChapterNumSafe(name) { return typeof window.parseChapterNum === 'function' ? window.parseChapterNum(name) : Number.POSITIVE_INFINITY; }

    function zhiyuCatalogTextBytes(text) {
        const value = String(text || '');
        if (typeof TextEncoder === 'function') return new TextEncoder().encode(value).byteLength;
        return new Blob([value]).size;
    }

    function zhiyuZipEntrySize(entry) {
        const size = Number(entry?._data?.uncompressedSize);
        return Number.isFinite(size) && size >= 0 ? size : 0;
    }

    function zhiyuCloneCatalogValue(value) {
        if (typeof structuredClone === 'function') return structuredClone(value);
        return JSON.parse(JSON.stringify(value || {}));
    }

    async function zhiyuCommitCatalogState(booksCandidate, memBooksCandidate, expectedUid) {
        const uid = String(expectedUid || window.AccountDataScope?.getActiveUid?.() || '');
        if (!uid || uid !== String(window.AccountDataScope?.getActiveUid?.() || '')) {
            throw new Error('导入期间账号已切换，未写入任何数据');
        }
        if (typeof StorageService.commitBooksAndMemory !== 'function') {
            throw new Error('原子导入服务未加载，请刷新页面后重试');
        }
        const memoryKey = window.AccountDataScope?.key?.('mem_books', uid) || ('mem_books__uid_' + uid);
        const committed = await StorageService.commitBooksAndMemory(
            booksCandidate,
            memoryKey,
            memBooksCandidate,
            uid
        );
        if (!committed) {
            if (uid !== String(window.AccountDataScope?.getActiveUid?.() || '')) {
                throw new Error('导入期间账号已切换，未写入当前账号数据');
            }
            throw new Error('本地导入提交失败，原有数据未改变');
        }
        if (typeof window.replaceMemBooksSnapshot === 'function') {
            const replaced = window.replaceMemBooksSnapshot(memBooksCandidate, uid);
            if (replaced === false) throw new Error('导入提交后账号已切换，请重新打开当前账号');
        }
        return true;
    }

    function zhiyuCurrentBookName() {
        return document.getElementById('bookSel')?.value || '';
    }

    function zhiyuBaseFileName(name) {
        return String(name || '导入章节')
            .replace(/\.(json|md|txt|doc|docx)$/i, '')
            .trim() || '导入章节';
    }

    function zhiyuMemoryFileContent(file) {
        if (file === null || file === undefined) return '';
        if (typeof file !== 'object') return String(file);
        return String(file.content ?? file.text ?? file.value ?? file.summary ?? '');
    }

    function zhiyuCatalogMemoryFileCopy(file, index) {
        if (file && typeof file === 'object' && !Array.isArray(file)) return Object.assign({}, file);
        return {
            name: '文件' + (Number(index || 0) + 1),
            content: zhiyuMemoryFileContent(file)
        };
    }

    function zhiyuCatalogMemoryFiles(bookMem, folderName) {
        if (folderName === ZHIYU_MEMORY_TRASH_KEY) return [];
        const value = bookMem?.[folderName];
        if (Array.isArray(value)) return value;
        if (!value || typeof value !== 'object') return [];
        if (Array.isArray(value.files)) return value.files;
        if (Array.isArray(value.items)) return value.items;
        return Object.values(value).filter(function(item) {
            return item && typeof item === 'object'
                && ['content', 'text', 'value', 'summary', 'name', 'fileName', 'title'].some(function(key) { return key in item; });
        });
    }

    function zhiyuMemoryFolderType(folderName) {
        const name = String(folderName || '');
        if (/细纲|细纲文件/.test(name)) return 'outline';
        if (/拆书|拆书文件/.test(name)) return 'decompose';
        if (/章节概要|剧情总结|总结概括/.test(name)) return 'summary';
        if (/^(默认文件夹|关联文件夹)$/.test(name)) return 'associated';
        return 'custom';
    }

    function zhiyuSafeCatalogName(name, fallback) {
        const safe = typeof window.zhiyuSafeFileName === 'function'
            ? window.zhiyuSafeFileName(name || fallback || '未命名文件')
            : String(name || fallback || '未命名文件').replace(/[\\/:*?"<>|]/g, '_');
        return String(safe || fallback || '未命名文件').trim() || (fallback || '未命名文件');
    }

    function zhiyuCatalogFormatExtension(format) {
        return format === 'md' ? 'md' : (format === 'word' ? 'doc' : 'txt');
    }

    function zhiyuCatalogFormattedContent(content, format, title) {
        const text = String(content || '');
        if (format !== 'word') return text;
        const escaped = Utils.escapeHtml(text).replace(/\n/g, '<br>');
        return '<html><head><meta charset="utf-8"><title>' + Utils.escapeHtml(title || '') + '</title></head><body style="font-family:Microsoft YaHei,Arial;line-height:1.8;">' + escaped + '</body></html>';
    }

    function zhiyuUniqueZipPath(usedPaths, folderName, fileName) {
        const extMatch = String(fileName || '').match(/(\.[^.]+)$/);
        const ext = extMatch ? extMatch[1] : '';
        const stem = ext ? String(fileName).slice(0, -ext.length) : String(fileName || '未命名文件');
        let index = 0;
        let candidate = folderName + '/' + fileName;
        while (usedPaths.has(candidate.toLowerCase())) {
            index += 1;
            candidate = folderName + '/' + stem + '（' + index + '）' + ext;
        }
        usedPaths.add(candidate.toLowerCase());
        return candidate;
    }

    function zhiyuIsCatalogFolderKind(kind) {
        return ['book', 'volume', 'memory-root', 'memory-category', 'memory-folder'].includes(kind);
    }

    function zhiyuCollectCatalogExport(root, bookName) {
        const books = gB();
        const book = books[bookName];
        if (!book) return null;
        const selectedChapterKeys = new Set(Array.from(root.querySelectorAll('input[data-kind="chapter"]:checked')).map(function(cb) {
            return cb.dataset.volumeIndex + ':' + cb.dataset.chapterIndex;
        }));
        const volumes = (book.volumes || []).map(function(vol, vi) {
            const chapters = [];
            (vol.chapters || []).forEach(function(ch, ci) {
                if (!selectedChapterKeys.has(String(vi) + ':' + String(ci))) return;
                chapters.push({
                    bookName: bookName,
                    volumeName: vol.name || ('第' + (vi + 1) + '卷'),
                    volumeIndex: vi,
                    chapterName: ch.name || ('第' + (ci + 1) + '章'),
                    chapterIndex: ci,
                    name: ch.name || ('第' + (ci + 1) + '章'),
                    content: typeof window.zhiyuChapterExportContent === 'function' ? window.zhiyuChapterExportContent(bookName, vi, ci, ch) : htmlToText(ch.content || ''),
                    createdAt: ch.createdAt || '',
                    updatedAt: typeof window.zhiyuChapterUpdatedAt === 'function' ? window.zhiyuChapterUpdatedAt(book, ch) : (ch.updatedAt || ch.createdAt || book.updatedAt || book.createdAt || '')
                });
            });
            return { name: vol.name || ('第' + (vi + 1) + '卷'), chapters: chapters };
        }).filter(function(vol) { return vol.chapters.length; });
        const memBooks = getMemBooks();
        const bookMem = memBooks[bookName] || {};
        const exportMem = {};
        root.querySelectorAll('input[data-kind="memory-file"]:checked').forEach(function(cb) {
            const folder = cb.dataset.folder;
            const index = Number(cb.dataset.fileIndex);
            const source = zhiyuCatalogMemoryFiles(bookMem, folder)[index];
            if (source === null || source === undefined) return;
            if (!exportMem[folder]) exportMem[folder] = [];
            exportMem[folder].push(zhiyuCatalogMemoryFileCopy(source, index));
        });
        return {
            format: ZHIYU_SELECTIVE_TRANSFER_FORMAT,
            exportedAt: new Date().toISOString(),
            bookName: bookName,
            books: volumes.length ? [{ name: bookName, volumes: volumes }] : [],
            memBooks: Object.keys(exportMem).length ? { [bookName]: exportMem } : {}
        };
    }

    function zhiyuCollectFullBookExport(bookName) {
        const books = gB();
        const book = books[bookName];
        if (!book) return null;
        const volumes = (book.volumes || []).map(function(vol, vi) {
            return {
                name: vol.name || ('第' + (vi + 1) + '卷'),
                chapters: (vol.chapters || []).map(function(ch, ci) {
                    return {
                        bookName: bookName,
                        volumeName: vol.name || ('第' + (vi + 1) + '卷'),
                        volumeIndex: vi,
                        chapterName: ch.name || ('第' + (ci + 1) + '章'),
                        chapterIndex: ci,
                        name: ch.name || ('第' + (ci + 1) + '章'),
                        content: typeof window.zhiyuChapterExportContent === 'function'
                            ? window.zhiyuChapterExportContent(bookName, vi, ci, ch)
                            : htmlToText(ch.content || ''),
                        createdAt: ch.createdAt || '',
                        updatedAt: typeof window.zhiyuChapterUpdatedAt === 'function'
                            ? window.zhiyuChapterUpdatedAt(book, ch)
                            : (ch.updatedAt || ch.createdAt || book.updatedAt || book.createdAt || '')
                    };
                })
            };
        }).filter(function(vol) { return vol.chapters.length; });
        const sourceMem = getMemBooks()[bookName] || {};
        const exportMem = {};
        Object.keys(sourceMem).forEach(function(folderName) {
            const files = zhiyuCatalogMemoryFiles(sourceMem, folderName);
            if (files.length) exportMem[folderName] = files.map(function(file, index) {
                return zhiyuCatalogMemoryFileCopy(file, index);
            });
        });
        return {
            format: ZHIYU_SELECTIVE_TRANSFER_FORMAT,
            exportedAt: new Date().toISOString(),
            bookName: bookName,
            books: volumes.length ? [{ name: bookName, volumes: volumes }] : [],
            memBooks: Object.keys(exportMem).length ? { [bookName]: exportMem } : {}
        };
    }

    function zhiyuCatalogRowHtml(opts) {
        const checked = opts.checked === false ? '' : 'checked';
        const disabled = opts.disabled ? 'disabled' : '';
        const level = Number(opts.level || 0);
        const meta = opts.meta ? '<span style="color:#8a94a6;font-size:12px;white-space:nowrap;">' + Utils.escapeHtml(opts.meta) + '</span>' : '';
        const attrs = opts.attrs || '';
        return '<div class="catalog-transfer-row" data-level="' + level + '" data-kind="' + Utils.escapeHtml(opts.kind || '') + '" data-path="' + Utils.escapeHtml(opts.path || '') + '" style="display:grid;grid-template-columns:18px 20px minmax(0,1fr) auto;align-items:center;gap:8px;width:100%;box-sizing:border-box;padding:8px 10px 8px ' + (10 + level * 22) + 'px;border-radius:7px;user-select:none;-webkit-user-select:none;">'
            + '<input type="checkbox" ' + checked + ' ' + disabled + ' data-kind="' + Utils.escapeHtml(opts.kind || '') + '" data-path="' + Utils.escapeHtml(opts.path || '') + '" style="width:16px;height:16px;margin:0;" ' + attrs + '>'
            + '<span data-catalog-icon style="color:#3b82f6;text-align:center;line-height:1;user-select:none;-webkit-user-select:none;">' + (opts.icon || '📄') + '</span>'
            + '<span data-catalog-name style="font-weight:' + (opts.bold ? '700' : '500') + ';color:#1f2937;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;user-select:none;-webkit-user-select:none;">' + Utils.escapeHtml(opts.label || '') + '</span>'
            + meta
            + '</div>';
    }

    function zhiyuBuildCatalogExportHtml(bookName, query) {
        const books = gB();
        const book = books[bookName];
        if (!book) return '<div style="color:#8a94a6;padding:18px;">请先选择作品</div>';
        const keyword = String(query || '').trim().toLowerCase();
        const memBooks = getMemBooks();
        const bookMem = memBooks[bookName] || {};
        let html = '';
        html += zhiyuCatalogRowHtml({ kind: 'book', path: 'book', level: 0, icon: '📁', label: bookName, bold: true });
        (book.volumes || []).forEach(function(vol, vi) {
            const visible = (vol.chapters || []).some(function(ch) {
                return !keyword || String(ch.name || '').toLowerCase().includes(keyword) || htmlToText(ch.content || '').toLowerCase().includes(keyword);
            });
            if (!visible && keyword) return;
            html += zhiyuCatalogRowHtml({ kind: 'volume', path: 'book/vol-' + vi, level: 1, icon: '📁', label: vol.name || ('第' + (vi + 1) + '卷'), bold: true });
            (vol.chapters || []).forEach(function(ch, ci) {
                const text = htmlToText(ch.content || '');
                if (keyword && !String(ch.name || '').toLowerCase().includes(keyword) && !text.toLowerCase().includes(keyword)) return;
                html += zhiyuCatalogRowHtml({
                    kind: 'chapter',
                    path: 'book/vol-' + vi + '/ch-' + ci,
                    level: 2,
                    icon: '📄',
                    label: ch.name || ('第' + (ci + 1) + '章'),
                    meta: countWordsSafe(ch.content || '') + '字',
                    attrs: 'data-volume-index="' + vi + '" data-chapter-index="' + ci + '"'
                });
            });
        });
        const catMap = {
            associated: { label: '关联文件', folders: [] },
            outline: { label: '细纲文件', folders: [] },
            decompose: { label: '拆书文件', folders: [] },
            summary: { label: '剧情总结', folders: [] },
            custom: { label: '用户自定义文件', folders: [] }
        };
        Object.keys(bookMem).forEach(function(folderName) {
            const list = zhiyuCatalogMemoryFiles(bookMem, folderName);
            if (!list.length) return;
            catMap[zhiyuMemoryFolderType(folderName)].folders.push({ name: folderName, files: list });
        });
        html += zhiyuCatalogRowHtml({ kind: 'memory-root', path: 'book/memory', level: 1, icon: '📁', label: '记忆库文件夹', bold: true });
        Object.keys(catMap).forEach(function(type) {
            const cat = catMap[type];
            const catPath = 'book/memory/' + type;
            html += zhiyuCatalogRowHtml({ kind: 'memory-category', path: catPath, level: 2, icon: '📁', label: cat.label, bold: true, disabled: cat.folders.length === 0 });
            cat.folders.forEach(function(folder) {
                const visibleFiles = folder.files.filter(function(file) {
                    const text = zhiyuMemoryFileContent(file);
                    return !keyword || String(file?.name || '').toLowerCase().includes(keyword) || text.toLowerCase().includes(keyword);
                });
                if (!visibleFiles.length && keyword) return;
                html += zhiyuCatalogRowHtml({ kind: 'memory-folder', path: catPath + '/' + folder.name, level: 3, icon: '📁', label: folder.name, bold: true, meta: visibleFiles.length + '个文件' });
                folder.files.forEach(function(file, fi) {
                    const text = zhiyuMemoryFileContent(file);
                    if (keyword && !String(file?.name || '').toLowerCase().includes(keyword) && !text.toLowerCase().includes(keyword)) return;
                    html += zhiyuCatalogRowHtml({
                        kind: 'memory-file',
                        path: catPath + '/' + folder.name + '/file-' + fi,
                        level: 4,
                        icon: '📄',
                        label: file?.name || ('文件' + (fi + 1)),
                        meta: countWordsSafe(text) + '字',
                        attrs: 'data-folder="' + Utils.escapeHtml(folder.name) + '" data-file-index="' + fi + '"'
                    });
                });
            });
        });
        return html || '<div style="color:#8a94a6;padding:18px;">没有可导出的内容</div>';
    }

    function zhiyuBuildCatalogTransferText(data) {
        const lines = [];
        lines.push(window.ZHIYU_READABLE_EXPORT_VERSION || '知屿写作可导入格式 v1');
        lines.push('导出时间：' + (typeof window.zhiyuReadableTime === 'function' ? window.zhiyuReadableTime(new Date()) : new Date().toLocaleString()));
        lines.push('作品：' + (data.bookName || '未命名作品'));
        lines.push('');
        (data.books || []).forEach(function(book) {
            lines.push('# 作品：' + book.name);
            (book.volumes || []).forEach(function(vol) {
                lines.push('');
                lines.push('## 分卷：' + vol.name);
                (vol.chapters || []).forEach(function(ch) {
                    lines.push('');
                    if (typeof window.zhiyuBuildChapterBlock === 'function') lines.push(window.zhiyuBuildChapterBlock(Object.assign({ volumeName: vol.name }, ch), ch.content || ''));
                    else lines.push('### ' + (ch.name || ch.chapterName || '未命名章节') + '\n' + (ch.content || ''));
                });
            });
        });
        const memBook = data.memBooks?.[data.bookName] || {};
        if (Object.keys(memBook).length) {
            lines.push('');
            lines.push('# 记忆库文件');
            Object.keys(memBook).forEach(function(folder) {
                lines.push('');
                lines.push('## 文件夹：' + folder);
                (memBook[folder] || []).forEach(function(file) {
                    lines.push('');
                    lines.push('### ' + (file.name || '未命名文件'));
                    lines.push(zhiyuMemoryFileContent(file));
                });
            });
        }
        return lines.join('\n');
    }

    function zhiyuAddCatalogPayloadToZip(zip, data, bookName, format, basePath) {
        const extension = zhiyuCatalogFormatExtension(format);
        const usedPaths = new Set();
        const files = [];
        const rootPrefix = String(basePath || '').replace(/^\/+|\/+$/g, '');
        const withRoot = function(path) { return rootPrefix ? rootPrefix + '/' + path : path; };
        if (data.books.length) {
            const bodyData = Object.assign({}, data, { memBooks: {} });
            const bodyPath = zhiyuUniqueZipPath(
                usedPaths,
                withRoot('正文文件夹'),
                zhiyuSafeCatalogName(bookName, '作品') + '_全部正文.' + extension
            );
            zip.file(bodyPath, zhiyuCatalogFormattedContent(zhiyuBuildCatalogTransferText(bodyData), format, bookName + ' 全部正文'));
            files.push({ path: bodyPath, kind: 'body', chapterCount: data.books.reduce(function(total, book) {
                return total + (book.volumes || []).reduce(function(sum, volume) { return sum + (volume.chapters || []).length; }, 0);
            }, 0) });
        }
        const memBook = data.memBooks?.[bookName] || {};
        Object.keys(memBook).forEach(function(originalFolder) {
            const category = zhiyuMemoryFolderType(originalFolder);
            const folderName = withRoot(ZHIYU_CATALOG_FOLDER_MAP[category]);
            (memBook[originalFolder] || []).forEach(function(file, index) {
                const title = file?.name || ('未命名文件' + (index + 1));
                const path = zhiyuUniqueZipPath(usedPaths, folderName, zhiyuSafeCatalogName(title, '未命名文件') + '.' + extension);
                zip.file(path, zhiyuCatalogFormattedContent(zhiyuMemoryFileContent(file), format, title));
                files.push({
                    path: path,
                    kind: 'memory',
                    category: category,
                    originalFolder: originalFolder,
                    title: title,
                    createdAt: file?.createdAt || '',
                    updatedAt: file?.updatedAt || ''
                });
            });
        });
        const manifest = {
            format: ZHIYU_CATALOG_ZIP_FORMAT,
            version: 2,
            exportedAt: new Date().toISOString(),
            bookName: bookName,
            selectedFormat: format,
            files: files,
            payload: data
        };
        const manifestPath = withRoot(ZHIYU_CATALOG_MANIFEST);
        zip.file(manifestPath, JSON.stringify(manifest, null, 2));
        return { manifest: manifest, manifestPath: manifestPath };
    }

    async function zhiyuCreateCatalogTransferZip(root, bookName, format) {
        const data = zhiyuCollectCatalogExport(root, bookName);
        if (!data || (!data.books.length && !Object.keys(data.memBooks || {}).length)) {
            Toast.warn('请至少选择一个章节或记忆库文件');
            return null;
        }
        const JSZipClass = typeof window.JSZip === 'function'
            ? window.JSZip
            : await window.ZhiyuLoadJSZip?.();
        if (typeof JSZipClass !== 'function') throw new Error('ZIP组件未加载，请检查网络后重试');
        const zip = new JSZipClass();
        const added = zhiyuAddCatalogPayloadToZip(zip, data, bookName, format, '');
        return { zip: zip, manifest: added.manifest, data: data };
    }

    async function zhiyuGenerateVerifiedZip(zip, minimumFileCount, businessFileCount) {
        const fileCount = Object.keys(zip?.files || {}).reduce(function(total, path) {
            return total + (zip.files[path]?.dir ? 0 : 1);
        }, 0);
        if (!Number(businessFileCount || 0)) throw new Error('压缩包内没有可导出的正文或记忆库文件');
        if (fileCount < Number(minimumFileCount || 1)) throw new Error('压缩包文件不完整，未创建下载文件');
        const bytes = await zip.generateAsync({ type: 'uint8array' });
        const byteLength = Number(bytes?.byteLength || bytes?.length || 0);
        if (byteLength <= 22 || Number(bytes?.[0]) !== 0x50 || Number(bytes?.[1]) !== 0x4b) {
            throw new Error('压缩包生成异常，未创建下载文件');
        }
        return {
            blob: new Blob([bytes], { type: 'application/zip' }),
            byteLength: byteLength,
            businessFileCount: Number(businessFileCount)
        };
    }

    function zhiyuTriggerBlobDownload(blob, fileName, summary) {
        let stack = document.querySelector('[data-zhiyu-zip-download-stack]');
        if (!stack) {
            stack = document.createElement('div');
            stack.dataset.zhiyuZipDownloadStack = 'true';
            stack.style.cssText = 'position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:2147483000;display:flex;flex-direction:column;gap:8px;align-items:stretch;width:max-content;max-width:calc(100vw - 24px);';
            document.body.appendChild(stack);
        }
        const url = URL.createObjectURL(blob);
        const banner = document.createElement('div');
        banner.dataset.zhiyuZipDownloadReady = 'true';
        banner.setAttribute('role', 'status');
        banner.style.cssText = 'display:flex;align-items:center;gap:12px;max-width:100%;padding:12px 14px;background:#ffffff;border:1px solid #bfdbfe;border-radius:10px;box-shadow:0 10px 30px rgba(15,23,42,.22);color:#0f172a;font-size:14px;';
        const label = document.createElement('span');
        label.textContent = '压缩包已生成并已尝试自动下载' + (summary ? '（' + summary + '）' : '');
        const anchor = document.createElement('a');
        anchor.dataset.zhiyuSaveZip = 'true';
        anchor.href = url;
        anchor.download = fileName;
        anchor.textContent = '没有开始下载？点击这里保存';
        anchor.style.cssText = 'display:inline-flex;align-items:center;min-height:36px;padding:0 14px;border-radius:8px;background:#2563eb;color:#fff;font-weight:700;text-decoration:none;white-space:nowrap;';
        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.dataset.zhiyuCloseZip = 'true';
        closeButton.textContent = '×';
        closeButton.setAttribute('aria-label', '关闭压缩包保存提示');
        closeButton.style.cssText = 'border:0;background:transparent;color:#64748b;font-size:22px;line-height:1;cursor:pointer;padding:4px;';
        banner.append(label, anchor, closeButton);
        let cleaned = false;
        const cleanup = function() {
            if (cleaned) return;
            cleaned = true;
            banner.remove();
            URL.revokeObjectURL(url);
            if (!stack.childElementCount) stack.remove();
        };
        let automaticClick = false;
        anchor.addEventListener('click', function() {
            if (automaticClick) return;
            window.setTimeout(cleanup, 1000);
        });
        closeButton.addEventListener('click', cleanup);
        stack.appendChild(banner);
        let autoTriggered = false;
        try {
            automaticClick = true;
            anchor.click();
            autoTriggered = true;
        } catch (error) {
            console.warn('浏览器未自动开始 ZIP 下载，请使用页面顶部的保存按钮', error);
        } finally {
            automaticClick = false;
        }
        return { anchor: anchor, banner: banner, autoTriggered: autoTriggered };
    }

    async function zhiyuDownloadCatalogTransfer(root, bookName, format) {
        const stamp = typeof window.zhiyuNowStamp === 'function' ? window.zhiyuNowStamp() : new Date().toISOString().replace(/[:.]/g, '-');
        const safeBookName = zhiyuSafeCatalogName(bookName, '知屿导出');
        const fileName = safeBookName + '-知屿导出-' + stamp + '.zip';
        const built = await zhiyuCreateCatalogTransferZip(root, bookName, format);
        if (!built) return false;
        const businessFileCount = built.manifest.files.length;
        const generated = await zhiyuGenerateVerifiedZip(built.zip, businessFileCount + 1, businessFileCount);
        const sizeText = generated.byteLength >= 1024
            ? Math.max(1, Math.round(generated.byteLength / 1024)) + ' KB'
            : generated.byteLength + ' B';
        zhiyuTriggerBlobDownload(generated.blob, fileName, generated.businessFileCount + ' 个内容文件，' + sizeText);
        Toast.show('ZIP 已完整生成；若浏览器未开始下载，请点击页面顶部蓝色按钮');
        return true;
    }

    function zhiyuUniqueBackupFolderName(used, bookName) {
        const base = zhiyuSafeCatalogName(bookName, '未命名作品');
        let candidate = base;
        let index = 0;
        while (used.has(candidate.toLowerCase())) {
            index += 1;
            candidate = base + '（' + index + '）';
        }
        used.add(candidate.toLowerCase());
        return candidate;
    }

    async function zhiyuCreateMultiBookBackupZip(bookNames, format) {
        const names = Array.from(new Set((bookNames || []).map(function(name) { return String(name || '').trim(); }).filter(Boolean)));
        if (!names.length) throw new Error('请至少选择一个作品');
        const JSZipClass = typeof window.JSZip === 'function'
            ? window.JSZip
            : await window.ZhiyuLoadJSZip?.();
        if (typeof JSZipClass !== 'function') throw new Error('ZIP组件未加载，请检查网络后重试');
        const zip = new JSZipClass();
        const usedFolders = new Set();
        const works = [];
        const skippedBooks = [];
        let businessFileCount = 0;
        names.forEach(function(bookName) {
            const data = zhiyuCollectFullBookExport(bookName);
            if (!data || (!data.books.length && !Object.keys(data.memBooks || {}).length)) {
                skippedBooks.push(bookName);
                return;
            }
            const folder = zhiyuUniqueBackupFolderName(usedFolders, bookName);
            const added = zhiyuAddCatalogPayloadToZip(zip, data, bookName, format || 'txt', folder);
            if (!added.manifest.files.length) return;
            businessFileCount += added.manifest.files.length;
            works.push({
                bookName: bookName,
                folder: folder,
                manifestPath: added.manifestPath,
                chapterCount: (data.books[0]?.volumes || []).reduce(function(total, volume) {
                    return total + (volume.chapters || []).length;
                }, 0),
                memoryFileCount: Object.values(data.memBooks?.[bookName] || {}).reduce(function(total, files) {
                    return total + (Array.isArray(files) ? files.length : 0);
                }, 0)
            });
        });
        if (!works.length) throw new Error('所选作品没有可导出的正文或记忆库文件');
        const manifest = {
            format: ZHIYU_MULTI_BOOK_ZIP_FORMAT,
            version: 1,
            exportedAt: new Date().toISOString(),
            selectedFormat: format || 'txt',
            works: works,
            skippedBooks: skippedBooks
        };
        zip.file(ZHIYU_MULTI_BOOK_MANIFEST, JSON.stringify(manifest, null, 2));
        return { zip: zip, manifest: manifest, businessFileCount: businessFileCount };
    }

    async function zhiyuDownloadMultiBookBackup(bookNames, format) {
        const fileName = '知屿写作-作品备份-' + (typeof window.zhiyuNowStamp === 'function'
            ? window.zhiyuNowStamp()
            : new Date().toISOString().replace(/[:.]/g, '-')) + '.zip';
        const built = await zhiyuCreateMultiBookBackupZip(bookNames, format);
        const minimumFileCount = built.businessFileCount + built.manifest.works.length + 1;
        const generated = await zhiyuGenerateVerifiedZip(built.zip, minimumFileCount, built.businessFileCount);
        const sizeText = generated.byteLength >= 1024
            ? Math.max(1, Math.round(generated.byteLength / 1024)) + ' KB'
            : generated.byteLength + ' B';
        zhiyuTriggerBlobDownload(generated.blob, fileName, generated.businessFileCount + ' 个内容文件，' + sizeText);
        const skippedText = built.manifest.skippedBooks.length
            ? '；已跳过空作品：' + built.manifest.skippedBooks.join('、')
            : '';
        Toast.show('作品备份已完整生成；若浏览器未开始下载，请点击页面顶部蓝色按钮' + skippedText);
        return built.manifest;
    }

    function openMultiBookBackupExportModal() {
        const books = gB();
        const bookNames = Object.keys(books || {});
        if (!bookNames.length) {
            Toast.warn('当前没有可导出的作品');
            return;
        }
        const overlay = document.createElement('div');
        overlay.className = 'catalog-transfer-overlay';
        overlay.style.cssText = zhiyuCatalogTransferStyle();
        overlay.innerHTML = '<div class="catalog-transfer-dialog" style="' + zhiyuCatalogDialogStyle() + '">'
            + '<div style="display:flex;align-items:center;justify-content:space-between;padding:18px 24px;border-bottom:1px solid #e5e7eb;">'
            + '<div><div style="font-size:22px;font-weight:800;color:#111827;">导出作品备份</div><div style="font-size:12px;color:#64748b;margin-top:4px;">每个作品单独放在父文件夹中，内部沿用文件管理的目录格式。</div></div>'
            + '<button type="button" data-close style="border:none;background:transparent;font-size:24px;color:#6b7280;cursor:pointer;">×</button></div>'
            + '<div style="padding:16px 24px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e5e7eb;background:#f8fafc;">'
            + '<label style="display:flex;align-items:center;gap:8px;font-weight:700;color:#334155;"><input type="checkbox" data-select-all checked> 全选作品</label>'
            + '<div style="display:flex;gap:14px;align-items:center;font-size:13px;color:#334155;"><strong>文件格式：</strong>'
            + '<label><input type="radio" name="multiBackupFormat" value="txt" checked> TXT</label>'
            + '<label><input type="radio" name="multiBackupFormat" value="md"> MD</label>'
            + '<label><input type="radio" name="multiBackupFormat" value="word"> Word</label></div></div>'
            + '<div data-book-list style="flex:1;min-height:0;overflow:auto;padding:14px 24px;background:#fff;">'
            + bookNames.map(function(bookName) {
                const chapterCount = (books[bookName]?.volumes || []).reduce(function(total, volume) {
                    return total + (volume.chapters || []).length;
                }, 0);
                return '<label style="display:grid;grid-template-columns:18px minmax(0,1fr) auto;gap:10px;align-items:center;padding:11px 12px;border-bottom:1px solid #eef2f7;cursor:pointer;">'
                    + '<input type="checkbox" data-backup-book="' + Utils.escapeHtml(bookName) + '" checked>'
                    + '<strong style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#1f2937;">' + Utils.escapeHtml(bookName) + '</strong>'
                    + '<span style="font-size:12px;color:#64748b;">' + chapterCount + ' 章</span></label>';
            }).join('')
            + '</div><div style="display:flex;align-items:center;justify-content:space-between;padding:14px 24px;border-top:1px solid #e5e7eb;">'
            + '<span data-selected-count style="font-size:13px;color:#64748b;"></span>'
            + '<div style="display:flex;gap:10px;"><button class="btn btn-outline" data-cancel>取消</button><button class="btn btn-dark" data-export>导出压缩包</button></div></div></div>';
        document.body.appendChild(overlay);
        const close = function() { overlay.remove(); };
        const checks = function() { return Array.from(overlay.querySelectorAll('[data-backup-book]')); };
        const update = function() {
            const selected = checks().filter(function(input) { return input.checked; }).length;
            const total = checks().length;
            const all = overlay.querySelector('[data-select-all]');
            if (all) {
                all.checked = selected === total;
                all.indeterminate = selected > 0 && selected < total;
            }
            const count = overlay.querySelector('[data-selected-count]');
            if (count) count.textContent = '已选择 ' + selected + '/' + total + ' 个作品';
        };
        overlay.querySelector('[data-close]')?.addEventListener('click', close);
        overlay.querySelector('[data-cancel]')?.addEventListener('click', close);
        overlay.addEventListener('click', function(event) { if (event.target === overlay) close(); });
        overlay.querySelector('[data-select-all]')?.addEventListener('change', function() {
            const checked = this.checked;
            checks().forEach(function(input) { input.checked = checked; });
            update();
        });
        checks().forEach(function(input) { input.addEventListener('change', update); });
        overlay.querySelector('[data-export]')?.addEventListener('click', async function() {
            const selectedNames = checks().filter(function(input) { return input.checked; }).map(function(input) { return input.dataset.backupBook; });
            if (!selectedNames.length) {
                Toast.warn('请至少选择一个作品');
                return;
            }
            const button = this;
            const oldText = button.textContent;
            button.disabled = true;
            button.textContent = '正在生成ZIP...';
            try {
                const format = overlay.querySelector('input[name="multiBackupFormat"]:checked')?.value || 'txt';
                const exported = await zhiyuDownloadMultiBookBackup(selectedNames, format);
                if (exported) close();
            } catch (error) {
                Toast.error('导出失败：' + (error.message || '请稍后重试'));
            } finally {
                if (document.body.contains(button)) {
                    button.disabled = false;
                    button.textContent = oldText;
                }
            }
        });
        update();
    }

    async function zhiyuParseCatalogTransferFile(file) {
        const text = await file.text();
        const cleanText = String(text || '').replace(/^\uFEFF/, '');
        const result = { records: [], memBooks: null, sourceName: file.name };
        if (/\.json$/i.test(file.name)) {
            const data = JSON.parse(cleanText);
            if (data.format === ZHIYU_SELECTIVE_TRANSFER_FORMAT) {
                result.records = window.zhiyuRecordsFromBackupBooks ? window.zhiyuRecordsFromBackupBooks(data.books || []) : [];
                result.memBooks = data.memBooks || null;
                return result;
            }
            if (data.format === window.ZHIYU_BACKUP_FORMAT || data.books) {
                result.records = window.zhiyuRecordsFromBackupBooks ? window.zhiyuRecordsFromBackupBooks(data.books || []) : [];
                result.memBooks = data.memBooks || null;
                return result;
            }
        }
        const parsed = window.zhiyuParseReadableExport ? window.zhiyuParseReadableExport(cleanText) : null;
        if (parsed?.records?.length) {
            result.records = parsed.records;
            return result;
        }
        result.records = zhiyuRegexSplitChapters(cleanText, file.name);
        return result;
    }

    function zhiyuCatalogRecordsFromBooks(books) {
        if (typeof window.zhiyuRecordsFromBackupBooks === 'function') return window.zhiyuRecordsFromBackupBooks(books || []);
        const records = [];
        (books || []).forEach(function(book) {
            (book.volumes || []).forEach(function(volume) {
                (volume.chapters || []).forEach(function(chapter) {
                    records.push({
                        bookName: book.name || book.title || '',
                        volumeName: volume.name || '第一卷',
                        chapterName: chapter.name || chapter.title || '未命名章节',
                        content: htmlToText(chapter.content || ''),
                        createdAt: chapter.createdAt || '',
                        updatedAt: chapter.updatedAt || ''
                    });
                });
            });
        });
        return records;
    }

    function zhiyuCanonicalImportFolder(category) {
        return {
            associated: '默认文件夹',
            outline: '细纲文件',
            decompose: '拆书文件',
            summary: '章节概要',
            custom: '用户自定义'
        }[category] || '用户自定义';
    }

    function zhiyuPlainCatalogText(raw, fileName) {
        const text = String(raw || '').replace(/^\uFEFF/, '');
        if (!/\.doc$/i.test(fileName || '') || !/<(?:html|body|br|p)\b/i.test(text)) return text;
        try {
            const doc = new DOMParser().parseFromString(text.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n'), 'text/html');
            return normalizeBreaks(doc.body?.textContent || text);
        } catch (_error) {
            return text.replace(/<[^>]+>/g, ' ');
        }
    }

    function zhiyuCatalogEntryId(prefix) {
        return String(prefix || 'entry') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
    }

    function zhiyuMemoryEntriesFromPayload(memBooks, bookName, manifestFiles) {
        const entries = [];
        const sourceBook = memBooks?.[bookName] || memBooks?.[Object.keys(memBooks || {})[0]] || {};
        const paths = (manifestFiles || []).filter(function(file) { return file.kind === 'memory'; });
        const used = new Set();
        Object.keys(sourceBook).forEach(function(originalFolder) {
            (sourceBook[originalFolder] || []).forEach(function(file, index) {
                let fileMetaIndex = paths.findIndex(function(meta, metaIndex) {
                    return !used.has(metaIndex) && meta.originalFolder === originalFolder && String(meta.title || '') === String(file?.name || '');
                });
                if (fileMetaIndex < 0) fileMetaIndex = paths.findIndex(function(_meta, metaIndex) { return !used.has(metaIndex); });
                if (fileMetaIndex >= 0) used.add(fileMetaIndex);
                const meta = fileMetaIndex >= 0 ? paths[fileMetaIndex] : null;
                entries.push({
                    id: zhiyuCatalogEntryId('memory'),
                    path: meta?.path || (ZHIYU_CATALOG_FOLDER_MAP[zhiyuMemoryFolderType(originalFolder)] + '/' + (file?.name || ('未命名文件' + (index + 1)))),
                    name: file?.name || ('未命名文件' + (index + 1)),
                    category: zhiyuMemoryFolderType(originalFolder),
                    originalFolder: originalFolder,
                    content: zhiyuMemoryFileContent(file),
                    fileMeta: Object.assign({}, file),
                    selected: true
                });
            });
        });
        return entries;
    }

    function zhiyuEntriesFromManifest(manifest, sourceName) {
        if (!manifest || manifest.format !== ZHIYU_CATALOG_ZIP_FORMAT || Number(manifest.version) !== 2 || !manifest.payload || typeof manifest.payload !== 'object') {
            throw new Error('不是受支持的知屿导出 ZIP（需要 v2 清单）');
        }
        const entries = [];
        const records = zhiyuCatalogRecordsFromBooks(manifest.payload.books || []);
        if (records.length > ZHIYU_CATALOG_IMPORT_MAX_CHAPTERS) {
            throw new Error('ZIP 内章节过多，最多支持 ' + ZHIYU_CATALOG_IMPORT_MAX_CHAPTERS + ' 章');
        }
        if (records.length) {
            const bodyMeta = (manifest.files || []).find(function(file) { return file.kind === 'body'; });
            entries.push({
                id: zhiyuCatalogEntryId('body'),
                path: bodyMeta?.path || '正文文件夹/' + (manifest.bookName || '全部正文'),
                name: String(bodyMeta?.path || sourceName || '全部正文').split('/').pop(),
                category: 'body',
                records: records,
                selected: true
            });
        }
        return entries.concat(zhiyuMemoryEntriesFromPayload(manifest.payload.memBooks, manifest.bookName, manifest.files)).map(function(entry) {
            return Object.assign({}, entry, { sourceBookName: manifest.bookName || '' });
        });
    }

    function zhiyuDetectCatalogCategory(path, text) {
        const value = String(path || '');
        if (value.includes('正文文件夹/')) return 'body';
        if (value.includes('关联文件文件夹/') || /关联文件|设定集/.test(value)) return 'associated';
        if (value.includes('细纲文件夹/') || /细纲/.test(value)) return 'outline';
        if (value.includes('拆书文件夹/') || /拆书/.test(value)) return 'decompose';
        if (value.includes('剧情总结文件夹/') || /章节概要|剧情总结|总结概括/.test(value)) return 'summary';
        if (value.includes('用户自定义文件夹/')) return 'custom';
        const parsed = typeof window.zhiyuParseReadableExport === 'function' ? window.zhiyuParseReadableExport(text) : null;
        if (parsed?.records?.length) return 'body';
        const chapterMatches = String(text || '').match(/^(?:#{1,6}\s*)?第[\d零一二三四五六七八九十百千]+[章节回]/gm) || [];
        if (chapterMatches.length || /^第[\d零一二三四五六七八九十百千]+[章节回]/.test(zhiyuBaseFileName(value))) return 'body';
        return '';
    }

    function zhiyuEntryFromText(path, rawText) {
        const name = String(path || '导入文件').split('/').pop();
        const text = zhiyuPlainCatalogText(rawText, name);
        if (/\.json$/i.test(name)) {
            try {
                const data = JSON.parse(text);
                if (data.format === ZHIYU_CATALOG_ZIP_FORMAT) return zhiyuEntriesFromManifest(data, name);
                if (
                    data.format === ZHIYU_SELECTIVE_TRANSFER_FORMAT
                    || data.format === window.ZHIYU_BACKUP_FORMAT
                    || (!data.format && data.version && data.books)
                ) {
                    const manifestLike = { files: [], bookName: data.bookName || Object.keys(data.memBooks || {})[0] || '', payload: data };
                    const records = zhiyuCatalogRecordsFromBooks(data.books || []);
                    const entries = records.length ? [{ id: zhiyuCatalogEntryId('body'), path: path, name: name, category: 'body', records: records, selected: true }] : [];
                    return entries.concat(zhiyuMemoryEntriesFromPayload(data.memBooks, manifestLike.bookName, []));
                }
            } catch (_error) {}
        }
        const category = zhiyuDetectCatalogCategory(path, text);
        if (category === 'body') {
            const parsed = typeof window.zhiyuParseReadableExport === 'function' ? window.zhiyuParseReadableExport(text) : null;
            return [{
                id: zhiyuCatalogEntryId('body'),
                path: path,
                name: name,
                category: 'body',
                records: parsed?.records?.length ? parsed.records : zhiyuRegexSplitChapters(text, name),
                selected: true
            }];
        }
        return [{
            id: zhiyuCatalogEntryId('file'),
            path: path,
            name: zhiyuBaseFileName(name),
            category: category,
            originalFolder: category ? zhiyuCanonicalImportFolder(category) : '',
            content: text,
            selected: true
        }];
    }

    async function zhiyuParseCatalogZipBundle(file) {
        const JSZipClass = typeof window.JSZip === 'function' ? window.JSZip : await window.ZhiyuLoadJSZip?.();
        if (!JSZipClass || typeof JSZipClass.loadAsync !== 'function') throw new Error('ZIP组件未加载，请检查网络后重试');
        if (Number(file?.size || 0) > ZHIYU_CATALOG_IMPORT_MAX_ZIP) throw new Error('ZIP 文件过大，压缩包不能超过 100 MB');
        const zipBuffer = await file.arrayBuffer();
        if (zipBuffer.byteLength > ZHIYU_CATALOG_IMPORT_MAX_ZIP) throw new Error('ZIP 文件过大，压缩包不能超过 100 MB');
        const zip = await JSZipClass.loadAsync(zipBuffer);
        const allEntries = Object.keys(zip.files || {}).map(function(key) { return zip.files[key]; }).filter(function(entry) { return entry && !entry.dir; });
        if (allEntries.length > ZHIYU_CATALOG_IMPORT_MAX_FILES) throw new Error('ZIP 内文件过多，最多支持 ' + ZHIYU_CATALOG_IMPORT_MAX_FILES + ' 个文件');
        const declaredTextBytes = allEntries.reduce(function(total, entry) {
            return total + zhiyuZipEntrySize(entry);
        }, 0);
        if (declaredTextBytes > ZHIYU_CATALOG_IMPORT_MAX_TEXT) throw new Error('ZIP 解压后的内容过大，最多支持 100 MB');
        const entryByName = new Map(allEntries.map(function(entry) {
            return [String(entry.name || '').replace(/\\/g, '/'), entry];
        }));
        const rootManifestEntry = entryByName.get(ZHIYU_MULTI_BOOK_MANIFEST);
        const manifests = [];
        if (rootManifestEntry) {
            const rootText = await rootManifestEntry.async('string');
            if (zhiyuCatalogTextBytes(rootText) > ZHIYU_CATALOG_IMPORT_MAX_TEXT) throw new Error('ZIP 作品备份清单过大，最多支持 100 MB');
            const rootManifest = JSON.parse(rootText);
            if (rootManifest.format !== ZHIYU_MULTI_BOOK_ZIP_FORMAT || Number(rootManifest.version) !== 1 || !Array.isArray(rootManifest.works)) {
                throw new Error('不是受支持的知屿作品备份 ZIP（需要 v1 总清单）');
            }
            for (const work of rootManifest.works) {
                const manifestPath = String(work?.manifestPath || '').replace(/\\/g, '/');
                const manifestEntry = entryByName.get(manifestPath);
                if (!manifestEntry) throw new Error('作品“' + (work?.bookName || '未命名') + '”缺少导出清单');
                const manifestText = await manifestEntry.async('string');
                if (zhiyuCatalogTextBytes(manifestText) > ZHIYU_CATALOG_IMPORT_MAX_TEXT) throw new Error('ZIP 导出清单过大，最多支持 100 MB');
                const manifest = JSON.parse(manifestText);
                zhiyuEntriesFromManifest(manifest, file.name);
                manifests.push(manifest);
            }
            return {
                entries: manifests.flatMap(function(manifest) { return zhiyuEntriesFromManifest(manifest, file.name); }),
                manifests: manifests,
                rootManifest: rootManifest
            };
        }
        const manifestEntries = allEntries.filter(function(entry) {
            return String(entry.name || '').split('/').pop() === ZHIYU_CATALOG_MANIFEST;
        });
        if (manifestEntries.length) {
            for (const manifestEntry of manifestEntries) {
                const manifestText = await manifestEntry.async('string');
                if (zhiyuCatalogTextBytes(manifestText) > ZHIYU_CATALOG_IMPORT_MAX_TEXT) throw new Error('ZIP 导出清单过大，最多支持 100 MB');
                const manifest = JSON.parse(manifestText);
                zhiyuEntriesFromManifest(manifest, file.name);
                manifests.push(manifest);
            }
            return {
                entries: manifests.flatMap(function(manifest) { return zhiyuEntriesFromManifest(manifest, file.name); }),
                manifests: manifests,
                rootManifest: null
            };
        }
        const supported = allEntries.filter(function(entry) { return /\.(?:json|md|txt|doc)$/i.test(entry.name || ''); });
        let totalText = 0;
        const entries = [];
        for (const entry of supported) {
            const text = await entry.async('string');
            totalText += zhiyuCatalogTextBytes(text);
            if (totalText > ZHIYU_CATALOG_IMPORT_MAX_TEXT) throw new Error('ZIP 解压后的文本内容过大，最多支持 100 MB');
            entries.push.apply(entries, zhiyuEntryFromText(entry.name, text));
        }
        if (!entries.length) throw new Error('ZIP 内没有可识别的知屿文本文件');
        return { entries: entries, manifests: [], rootManifest: null };
    }

    async function zhiyuParseCatalogZip(file) {
        const bundle = await zhiyuParseCatalogZipBundle(file);
        return bundle.entries;
    }

    async function zhiyuParseCatalogImportFiles(fileList) {
        const files = Array.from(fileList || []);
        if (!files.length) return [];
        if (files.length > ZHIYU_CATALOG_IMPORT_MAX_FILES) throw new Error('一次最多选择 ' + ZHIYU_CATALOG_IMPORT_MAX_FILES + ' 个文件');
        const groups = new Map();
        let totalText = 0;
        for (const file of files) {
            if (/\.docx$/i.test(file.name || '')) throw new Error('DOCX 暂不支持，请使用本软件导出的 Word（.doc）、TXT 或 MD 文件');
            const relativePath = String(file.webkitRelativePath || file.name || '导入文件').replace(/\\/g, '/');
            const groupName = /\.zip$/i.test(file.name || '') ? file.name : (relativePath.includes('/') ? relativePath.split('/')[0] : '本地文件');
            if (!groups.has(groupName)) groups.set(groupName, { id: zhiyuCatalogEntryId('group'), name: groupName, expanded: true, categoryExpanded: {}, entries: [] });
            let entries;
            if (/\.zip$/i.test(file.name || '')) {
                entries = await zhiyuParseCatalogZip(file);
            } else {
                if (Number(file?.size || 0) > ZHIYU_CATALOG_IMPORT_MAX_TEXT) throw new Error('选择的文本内容过大，最多支持 100 MB');
                const text = await file.text();
                totalText += zhiyuCatalogTextBytes(text);
                if (totalText > ZHIYU_CATALOG_IMPORT_MAX_TEXT) throw new Error('选择的文本内容过大，最多支持 100 MB');
                entries = zhiyuEntryFromText(relativePath, text);
            }
            groups.get(groupName).entries.push.apply(groups.get(groupName).entries, entries);
        }
        return Array.from(groups.values());
    }

    function zhiyuAggregateCatalogImport(groups, targetBookName) {
        const records = [];
        const memBooks = { [targetBookName]: {} };
        const entries = [];
        (groups || []).forEach(function(group) {
            (group.entries || []).forEach(function(entry) {
                if (!entry.selected) return;
                entries.push(entry);
                let category = entry.category;
                if (!category) return;
                if (category === 'body') {
                    const sourceRecords = entry.records?.length ? entry.records : [{ volumeName: '第一卷', chapterName: entry.name || '导入章节', content: entry.content || '' }];
                    records.push.apply(records, sourceRecords);
                    return;
                }
                const folder = entry.originalFolder || zhiyuCanonicalImportFolder(category);
                if (!memBooks[targetBookName][folder]) memBooks[targetBookName][folder] = [];
                memBooks[targetBookName][folder].push(Object.assign({}, entry.fileMeta || {}, {
                    name: entry.name || '导入文件',
                    content: entry.content || entry.fileMeta?.content || '',
                    updatedAt: entry.fileMeta?.updatedAt || new Date().toISOString()
                }));
            });
        });
        return { records: records, memBooks: memBooks, entries: entries };
    }

    function zhiyuMarkImportedBodyEntriesForRetry(entries) {
        let changed = 0;
        (entries || []).forEach(function(entry) {
            if (entry?.category !== 'body' || !entry.selected) return;
            entry.selected = false;
            changed += 1;
        });
        return changed;
    }

    function zhiyuSortCatalogImportRecords(records) {
        return (records || []).slice().sort(function(a, b) {
            const v = String(a.volumeName || '').localeCompare(String(b.volumeName || ''), 'zh-Hans');
            if (v) return v;
            const an = parseChapterNumSafe(a.chapterName || '');
            const bn = parseChapterNumSafe(b.chapterName || '');
            if (an !== bn) return an - bn;
            return String(a.chapterName || '').localeCompare(String(b.chapterName || ''), 'zh-Hans');
        });
    }

    function zhiyuCatalogCategoryLabel(category) {
        return {
            body: '正文',
            associated: '关联文件',
            outline: '细纲',
            decompose: '拆书',
            summary: '剧情总结',
            custom: '用户自定义'
        }[category] || '待选择位置';
    }

    function zhiyuRenderCatalogImportGroups(root, groups) {
        const list = root.querySelector('[data-import-list]');
        if (!list) return;
        const keyword = String(root.querySelector('[data-import-search]')?.value || '').trim().toLowerCase();
        const allEntries = (groups || []).reduce(function(output, group) { return output.concat(group.entries || []); }, []);
        if (!allEntries.length) {
            list.innerHTML = '<div style="color:#8a94a6;padding:18px;">还没有选择导入文件或文件夹</div>';
        } else {
            list.innerHTML = (groups || []).map(function(group) {
                const entries = (group.entries || []).filter(function(entry) {
                    return !keyword || String(entry.name || '').toLowerCase().includes(keyword) || String(entry.path || '').toLowerCase().includes(keyword);
                });
                if (!entries.length && keyword) return '';
                group.categoryExpanded = group.categoryExpanded || {};
                const renderEntry = function(entry) {
                    const detail = entry.category === 'body'
                        ? ((entry.records || []).length + ' 个章节')
                        : (countWordsSafe(entry.content || entry.fileMeta?.content || '') + ' 字');
                    const categoryControl = entry.category
                        ? '<span style="font-size:12px;color:#64748b;">' + zhiyuCatalogCategoryLabel(entry.category) + ' · ' + detail + '</span>'
                        : '<select data-import-category="' + Utils.escapeHtml(entry.id) + '" style="height:30px;border:1px solid #f59e0b;border-radius:6px;background:#fff7ed;color:#9a3412;padding:0 8px;"><option value="">请选择保存位置</option><option value="body">正文</option><option value="associated">关联文件</option><option value="outline">细纲</option><option value="decompose">拆书</option><option value="summary">剧情总结</option><option value="custom">用户自定义</option></select>';
                    return '<div data-import-entry="' + Utils.escapeHtml(entry.id) + '" style="display:grid;grid-template-columns:18px minmax(0,1fr) auto;gap:9px;align-items:start;padding:9px 10px 9px 48px;border-top:1px solid #eef2f7;">'
                        + '<input type="checkbox" data-import-entry-check="' + Utils.escapeHtml(entry.id) + '" ' + (entry.selected ? 'checked' : '') + ' style="width:16px;height:16px;margin:3px 0 0;">'
                        + '<div style="min-width:0;display:grid;gap:4px;"><strong style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#1f2937;">' + Utils.escapeHtml(entry.name || '导入文件') + '</strong><span style="font-size:11px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + Utils.escapeHtml(entry.path || entry.name || '') + '</span>' + categoryControl + '</div>'
                        + '<button type="button" data-remove-import-entry="' + Utils.escapeHtml(entry.id) + '" style="border:1px solid #fecaca;border-radius:6px;background:#dc2626;color:#fff;padding:4px 9px;font-size:12px;cursor:pointer;">移除</button>'
                        + '</div>';
                };
                const categoryOrder = ['body', 'associated', 'outline', 'decompose', 'summary', 'custom', 'unresolved'];
                const categoryEntries = new Map();
                entries.forEach(function(entry) {
                    const categoryKey = entry.category || 'unresolved';
                    if (!categoryEntries.has(categoryKey)) categoryEntries.set(categoryKey, []);
                    categoryEntries.get(categoryKey).push(entry);
                });
                const categoryHtml = categoryOrder.filter(function(categoryKey) {
                    return categoryEntries.has(categoryKey);
                }).map(function(categoryKey) {
                    const items = categoryEntries.get(categoryKey);
                    const expanded = group.categoryExpanded[categoryKey] !== false;
                    return '<section data-import-category-group="' + Utils.escapeHtml(categoryKey) + '" style="border-top:1px solid #e2e8f0;background:#fff;">'
                        + '<button type="button" data-toggle-import-category-group data-import-parent-group="' + Utils.escapeHtml(group.id) + '" data-import-category-key="' + Utils.escapeHtml(categoryKey) + '" style="width:100%;display:grid;grid-template-columns:20px minmax(0,1fr) auto;gap:8px;align-items:center;border:0;background:#f1f5f9;padding:8px 12px 8px 28px;text-align:left;cursor:pointer;"><span>' + (expanded ? '▾' : '▸') + '</span><strong style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#334155;">' + Utils.escapeHtml(zhiyuCatalogCategoryLabel(categoryKey === 'unresolved' ? '' : categoryKey)) + '</strong><span style="font-size:12px;color:#64748b;">' + items.length + ' 个文件</span></button>'
                        + '<div data-import-category-group-body style="display:' + (expanded ? 'block' : 'none') + ';">' + items.map(renderEntry).join('') + '</div>'
                        + '</section>';
                }).join('');
                return '<section data-import-group="' + Utils.escapeHtml(group.id) + '" style="border:1px solid #e2e8f0;border-radius:8px;background:#fff;overflow:hidden;margin-bottom:10px;">'
                    + '<button type="button" data-toggle-import-group="' + Utils.escapeHtml(group.id) + '" style="width:100%;display:grid;grid-template-columns:20px minmax(0,1fr) auto;gap:8px;align-items:center;border:0;background:#f8fafc;padding:10px 12px;text-align:left;cursor:pointer;"><span>' + (group.expanded ? '▾' : '▸') + '</span><strong style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + Utils.escapeHtml(group.name || '本地文件') + '</strong><span style="font-size:12px;color:#64748b;">' + entries.length + ' 个文件</span></button>'
                    + '<div data-import-group-body style="display:' + (group.expanded ? 'block' : 'none') + ';">' + categoryHtml + '</div></section>';
            }).join('') || '<div style="color:#8a94a6;padding:18px;">没有匹配的文件</div>';
        }
        const selectedEntries = allEntries.filter(function(entry) { return entry.selected; });
        const unresolved = selectedEntries.filter(function(entry) { return !entry.category; }).length;
        const selected = root.querySelector('[data-import-selected]');
        if (selected) selected.textContent = selectedEntries.length
            ? ('已选择 ' + selectedEntries.length + ' 个文件' + (unresolved ? '，' + unresolved + ' 个待选择位置' : ''))
            : '还未选择文件';
    }

    function zhiyuRenderCatalogImportList(root, records) {
        const list = root.querySelector('[data-import-list]');
        if (!list) return;
        if (!records || !records.length) {
            list.innerHTML = '<div style="color:#8a94a6;padding:18px;">还没有选择导入文件</div>';
            return;
        }
        const keyword = String(root.querySelector('[data-import-search]')?.value || '').trim().toLowerCase();
        const visibleRecords = records.map(function(rec, index) { return { rec: rec, index: index }; }).filter(function(item) {
            if (!keyword) return true;
            const rec = item.rec || {};
            return String(rec.chapterName || '').toLowerCase().includes(keyword)
                || String(rec.volumeName || '').toLowerCase().includes(keyword)
                || String(rec.content || '').toLowerCase().includes(keyword);
        });
        if (!visibleRecords.length) {
            list.innerHTML = '<div style="color:#8a94a6;padding:18px;">没有匹配的章节</div>';
            return;
        }
        list.innerHTML = visibleRecords.map(function(item) {
            const rec = item.rec;
            const index = item.index;
            const text = normalizeBreaks(rec.content || '');
            const preview = text.split('\n').filter(Boolean).slice(0, 4).join('\n') || '无正文预览';
            const clippedPreview = preview.length > 220 ? preview.slice(0, 220) + '...' : preview;
            return '<label style="display:grid;grid-template-columns:18px minmax(220px,280px) minmax(0,1fr);align-items:flex-start;gap:12px;width:100%;box-sizing:border-box;padding:12px 14px;border-bottom:1px solid #eef2f7;cursor:pointer;">'
                + '<input type="checkbox" checked data-import-index="' + index + '" style="appearance:auto!important;width:16px!important;height:16px!important;min-width:16px!important;max-width:16px!important;flex:0 0 16px;margin:2px 0 0 0;padding:0;">'
                + '<span style="display:grid;grid-template-columns:20px minmax(0,1fr);gap:8px;min-width:0;max-width:100%;">'
                + '<span style="color:#3b82f6;line-height:18px;text-align:center;">📄</span>'
                + '<span style="display:flex;flex-direction:column;gap:4px;min-width:0;max-width:100%;">'
                + '<strong style="color:#111827;line-height:1.35;">' + Utils.escapeHtml(rec.chapterName || ('导入章节' + (index + 1))) + '</strong>'
                + '<span style="color:#64748b;font-size:12px;">' + Utils.escapeHtml(rec.volumeName || '第一卷') + ' · 约 ' + countWordsSafe(text) + ' 字</span>'
                + '</span>'
                + '</span>'
                + '<span style="color:#64748b;font-size:12px;line-height:1.55;white-space:pre-wrap;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;">' + Utils.escapeHtml(clippedPreview) + '</span>'
                + '</label>';
        }).join('');
        const selected = root.querySelector('[data-import-selected]');
        if (selected) selected.textContent = '已识别 ' + records.length + ' 个章节';
    }

    function zhiyuUniqueImportedName(list, baseName) {
        const source = String(baseName || '导入章节').trim() || '导入章节';
        const used = new Set((list || []).map(function(item) { return String(item?.name || '').trim(); }));
        if (!used.has(source)) return source;
        let i = 1;
        let candidate = source + '（' + i + '）';
        while (used.has(candidate)) {
            i += 1;
            candidate = source + '（' + i + '）';
        }
        return candidate;
    }

    async function zhiyuApplyCatalogImportRecordsAsCopies(records, targetBookName, sourceName, options) {
        const opts = options || {};
        const selected = (records || []).filter(function(rec) { return rec && (rec.chapterName || rec.content); });
        if (!selected.length) {
            Toast.warn('没有可导入的章节');
            return false;
        }
        if (selected.length > ZHIYU_CATALOG_IMPORT_MAX_CHAPTERS) {
            throw new Error('导入章节过多，一次最多支持 ' + ZHIYU_CATALOG_IMPORT_MAX_CHAPTERS + ' 章');
        }
        const expectedUid = String(opts.expectedUid || window.AccountDataScope?.getActiveUid?.() || '');
        const books = opts.targetBooks || zhiyuCloneCatalogValue(gB());
        const bookName = targetBookName || selected[0].bookName || zhiyuBaseFileName(sourceName);
        if (!books[bookName]) books[bookName] = { title: bookName, volumes: [{ name: '第一卷', chapters: [] }] };
        const now = new Date().toISOString();
        selected.forEach(function(rec, index) {
            const volName = rec.volumeName || '第一卷';
            let vol = books[bookName].volumes.find(function(item) { return item.name === volName; });
            if (!vol) {
                vol = { name: volName, chapters: [] };
                books[bookName].volumes.push(vol);
            }
            const baseName = rec.chapterName || ('导入章节' + (index + 1));
            const chapterName = zhiyuUniqueImportedName(vol.chapters, baseName);
            const chapter = {
                name: chapterName,
                content: plainToEditorHtml(normalizeBreaks(rec.content || '')),
                createdAt: now,
                updatedAt: now
            };
            window.ensureChapterLocalId?.(chapter);
            vol.chapters.push(chapter);
        });
        if (typeof window.sortChapters === 'function') window.sortChapters(books[bookName]);
        if (opts.deferSave) {
            return { ok: true, books, bookName, importedChapters: selected.length };
        }
        await zhiyuCommitCatalogState(books, zhiyuCloneCatalogValue(getMemBooks()), expectedUid);
        localStorage.setItem(AccountDataScope.key('novel_current_book'), bookName);
        if (typeof window.refreshBookSelect === 'function') window.refreshBookSelect();
        const bookSel = document.getElementById('bookSel');
        if (bookSel) bookSel.value = bookName;
        if (typeof window.refreshTree === 'function') window.refreshTree();
        Toast.success('已新增导入 ' + selected.length + ' 个章节');
        return true;
    }

    async function zhiyuMergeCatalogMemBooksAsCopies(sourceMemBooks, targetBookName, options) {
        if (!sourceMemBooks || !targetBookName) return 0;
        const opts = options || {};
        const sourceBook = sourceMemBooks[targetBookName] || sourceMemBooks[Object.keys(sourceMemBooks)[0]];
        if (!sourceBook) return 0;
        const expectedUid = window.AccountDataScope?.getActiveUid?.() || '';
        const memBooks = opts.targetMemBooks || zhiyuCloneCatalogValue(getMemBooks());
        if (!memBooks[targetBookName]) memBooks[targetBookName] = {};
        let count = 0;
        const importedAssociatedNames = [];
        Object.keys(sourceBook).forEach(function(folderName) {
            const list = Array.isArray(sourceBook[folderName]) ? sourceBook[folderName] : [];
            if (!memBooks[targetBookName][folderName]) memBooks[targetBookName][folderName] = [];
            list.forEach(function(file) {
                const targetList = memBooks[targetBookName][folderName];
                const copy = Object.assign({}, file);
                delete copy._refFileId;
                copy.name = zhiyuUniqueImportedName(targetList, file?.name || '导入文件');
                copy.updatedAt = copy.updatedAt || new Date().toISOString();
                targetList.push(copy);
                if (zhiyuMemoryFolderType(folderName) === 'associated') {
                    const prefix = targetBookName + '_';
                    let displayName = String(copy.name || '').replace(/\.(?:md|txt|doc|docx)$/i, '');
                    if (displayName.indexOf(prefix) === 0) displayName = displayName.slice(prefix.length);
                    if (displayName) importedAssociatedNames.push(displayName);
                }
                count += 1;
            });
        });
        if (Array.isArray(opts.importedAssociatedNames) && importedAssociatedNames.length) {
            opts.importedAssociatedNames.push.apply(opts.importedAssociatedNames, importedAssociatedNames);
        }
        if (opts.deferSave) return count;
        if (count) {
            await zhiyuCommitCatalogState(zhiyuCloneCatalogValue(gB()), memBooks, expectedUid);
            if (typeof window.refreshMemTree === 'function') window.refreshMemTree();
            if (importedAssociatedNames.length && typeof window.getRefUiPreferenceKey === 'function') {
                const visibleKey = window.getRefUiPreferenceKey(targetBookName, 'body', 'visible');
                const visibleNames = window.readRefUiPreference?.(visibleKey);
                if (Array.isArray(visibleNames)) {
                    window.writeRefUiPreference?.(visibleKey, Array.from(new Set(visibleNames.concat(importedAssociatedNames))));
                }
            }
            if (typeof window.refreshTree === 'function') window.refreshTree();
        }
        return count;
    }

    function zhiyuUniqueImportedBookName(books, baseName) {
        const base = String(baseName || '导入作品').trim() || '导入作品';
        if (!books[base]) return base;
        let index = 1;
        let candidate = base + '（' + index + '）';
        while (books[candidate]) {
            index += 1;
            candidate = base + '（' + index + '）';
        }
        return candidate;
    }

    async function zhiyuImportBookBackupFile(file) {
        if (!file || !/\.zip$/i.test(file.name || '')) throw new Error('作品备份请选择知屿导出的 ZIP 压缩包');
        const bundle = await zhiyuParseCatalogZipBundle(file);
        if (!bundle.manifests.length) throw new Error('ZIP 内没有可识别的作品备份清单');
        const expectedUid = String(window.AccountDataScope?.getActiveUid?.() || '');
        const stagedBooks = zhiyuCloneCatalogValue(gB());
        const stagedMemBooks = zhiyuCloneCatalogValue(getMemBooks());
        const associatedNamesByBook = {};
        const currentBookKey = window.AccountDataScope?.key?.('novel_current_book') || 'novel_current_book';
        let importedWorks = 0;
        let importedChapters = 0;
        let importedMemoryFiles = 0;
        let lastBookName = '';
        for (const manifest of bundle.manifests) {
                const payload = manifest?.payload || {};
                const sourceBookName = String(manifest?.bookName || payload?.books?.[0]?.name || '导入作品');
                const targetBookName = zhiyuUniqueImportedBookName(stagedBooks, sourceBookName);
                const records = zhiyuCatalogRecordsFromBooks(payload.books || []);
                if (records.length) {
                    await zhiyuApplyCatalogImportRecordsAsCopies(records, targetBookName, file.name, {
                        targetBooks: stagedBooks,
                        deferSave: true,
                        expectedUid
                    });
                    importedChapters += records.length;
                    if (importedChapters > ZHIYU_CATALOG_IMPORT_MAX_CHAPTERS) {
                        throw new Error('备份内章节过多，一次最多支持 ' + ZHIYU_CATALOG_IMPORT_MAX_CHAPTERS + ' 章');
                    }
                } else {
                    stagedBooks[targetBookName] = { title: targetBookName, volumes: [{ name: '第一卷', chapters: [] }] };
                }
                const importedAssociatedNames = [];
                const memoryCount = await zhiyuMergeCatalogMemBooksAsCopies(
                    payload.memBooks || {},
                    targetBookName,
                    {
                        targetMemBooks: stagedMemBooks,
                        deferSave: true,
                        importedAssociatedNames: importedAssociatedNames
                    }
                );
                if (importedAssociatedNames.length) associatedNamesByBook[targetBookName] = importedAssociatedNames;
                importedMemoryFiles += memoryCount;
                importedWorks += 1;
                lastBookName = targetBookName;
        }
        await zhiyuCommitCatalogState(stagedBooks, stagedMemBooks, expectedUid);
        Object.keys(associatedNamesByBook).forEach(function(bookName) {
            if (typeof window.getRefUiPreferenceKey !== 'function') return;
            const visibleKey = window.getRefUiPreferenceKey(bookName, 'body', 'visible');
            const visibleNames = window.readRefUiPreference?.(visibleKey);
            if (Array.isArray(visibleNames)) {
                window.writeRefUiPreference?.(
                    visibleKey,
                    Array.from(new Set(visibleNames.concat(associatedNamesByBook[bookName])))
                );
            }
        });
        if (lastBookName) {
            localStorage.setItem(currentBookKey, lastBookName);
            if (typeof window.refreshBookSelect === 'function') window.refreshBookSelect();
            const bookSelect = document.getElementById('bookSel');
            if (bookSelect) bookSelect.value = lastBookName;
            if (typeof window.refreshTree === 'function') window.refreshTree();
            if (typeof window.refreshMemTree === 'function') window.refreshMemTree();
        }
        Toast.success('已导入 ' + importedWorks + ' 个作品、' + importedChapters + ' 个章节、' + importedMemoryFiles + ' 个记忆文件');
        return {
            importedWorks: importedWorks,
            importedChapters: importedChapters,
            importedMemoryFiles: importedMemoryFiles,
            lastBookName: lastBookName
        };
    }

    function zhiyuUpdateCatalogSelectedCount(root) {
        const count = root.querySelectorAll('input[data-kind="chapter"]:checked,input[data-kind="memory-file"]:checked').length;
        const badge = root.closest('.catalog-transfer-dialog')?.querySelector('[data-selected-count]');
        if (badge) badge.textContent = '已选择 ' + count + ' 个文件';
    }

    function zhiyuUpdateCatalogFolderVisibility(root) {
        const collapsedLevels = [];
        root.querySelectorAll('.catalog-transfer-row').forEach(function(row) {
            const level = Number(row.dataset.level || 0);
            while (collapsedLevels.length && collapsedLevels[collapsedLevels.length - 1] >= level) {
                collapsedLevels.pop();
            }
            const hidden = collapsedLevels.length > 0;
            row.style.display = hidden ? 'none' : 'grid';
            const kind = row.dataset.kind || '';
            const icon = row.querySelector('[data-catalog-icon]');
            if (icon && zhiyuIsCatalogFolderKind(kind)) {
                icon.textContent = row.dataset.collapsed === '1' ? '📁' : '📂';
            }
            if (!hidden && row.dataset.collapsed === '1') {
                collapsedLevels.push(level);
            }
        });
    }

    function zhiyuWireCatalogTreeChecks(root) {
        root.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
            cb.addEventListener('change', function() {
                const path = this.dataset.path || '';
                if (!path) return;
                root.querySelectorAll('input[type="checkbox"]').forEach(function(other) {
                    const otherPath = other.dataset.path || '';
                    if (otherPath !== path && otherPath.startsWith(path + '/')) {
                        other.checked = cb.checked;
                    }
                });
                zhiyuUpdateCatalogSelectedCount(root);
            });
        });
        zhiyuWireCatalogFolderToggle(root);
        zhiyuUpdateCatalogSelectedCount(root);
    }

    function zhiyuWireCatalogFolderToggle(root) {
        root.querySelectorAll('.catalog-transfer-row').forEach(function(row) {
            const kind = row.dataset.kind || '';
            const cb = row.querySelector('input[type="checkbox"]');
            if (!zhiyuIsCatalogFolderKind(kind) || cb?.disabled) return;
            const toggleTargets = row.querySelectorAll('[data-catalog-icon], [data-catalog-name]');
            toggleTargets.forEach(function(target) {
                target.title = '点击展开/收起';
                target.style.cursor = 'pointer';
                target.addEventListener('mousedown', function(e) {
                    e.preventDefault();
                });
                target.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    zhiyuToggleCatalogFolder(root, row);
                });
            });
        });
        zhiyuUpdateCatalogFolderVisibility(root);
    }

    function zhiyuToggleCatalogFolder(root, row) {
        if (!row) return;
        const kind = row.dataset.kind || '';
        if (!zhiyuIsCatalogFolderKind(kind)) return;
        row.dataset.collapsed = row.dataset.collapsed === '1' ? '0' : '1';
        zhiyuUpdateCatalogFolderVisibility(root);
    }

    function zhiyuCatalogTransferStyle() {
        return [
            'position:fixed;inset:0;z-index:10020;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;',
            ''
        ].join('');
    }

    function zhiyuCatalogDialogStyle() {
        return 'width:min(940px,92vw);height:min(760px,88vh);background:#fff;border-radius:10px;box-shadow:0 24px 60px rgba(15,23,42,.22);display:flex;flex-direction:column;overflow:hidden;';
    }

    function zhiyuRegexSplitChapters(text, fileName) {
        const clean = normalizeBreaks(text || '');
        const headingMatches = typeof window.zhiyuFindStandaloneHeadingMatches === 'function'
            ? window.zhiyuFindStandaloneHeadingMatches(clean, 'chapter-any')
            : [...clean.matchAll(/^[\t \u3000]*(?:#{1,6}[\t \u3000]*)?(第[\t \u3000]*[0-9０-９零〇两一二三四五六七八九十百千万]+[\t \u3000]*[章节回][^\r\n]{0,120}?)[\t \u3000]*\r?$/gm)];
        const matches = headingMatches.map(function(match) {
            const rawStart = Number.isInteger(match.rawStart) ? match.rawStart : match.index;
            const rawEnd = Number.isInteger(match.rawEnd) ? match.rawEnd : match.index + String(match[0] || '').length;
            return {
                index: rawStart,
                title: String(match[0] || match[1] || '').trim().replace(/^#+\s*/, '').trim(),
                len: rawEnd - rawStart
            };
        });
        if (!matches.length) {
            return [{
                bookName: '',
                volumeName: '第一卷',
                chapterName: zhiyuBaseFileName(fileName),
                content: clean
            }];
        }
        return matches.map(function(item, idx) {
            const next = matches[idx + 1];
            const start = item.index + item.len;
            const end = next ? next.index : clean.length;
            return {
                bookName: '',
                volumeName: '第一卷',
                chapterName: item.title,
                content: clean.slice(start, end).trim()
            };
        }).filter(function(record) { return record.chapterName || record.content; });
    }

    function zhiyuMountCatalogImportPanel(overlay, bookName, close, importState) {
        const body = overlay.querySelector('[data-catalog-body]');
        body.innerHTML = '<div style="height:100%;display:flex;flex-direction:column;padding:18px 24px;gap:14px;">'
            + '<input data-import-search placeholder="搜索待导入文件..." style="height:38px;border:1px solid #dbe1ea;border-radius:8px;padding:0 12px;font-size:14px;">'
            + '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">'
            + '<button class="btn btn-outline" data-pick-import style="height:34px;border-radius:6px;padding:0 16px;">选择本地文件 / ZIP</button>'
            + '<button class="btn btn-outline" data-pick-import-folder style="height:34px;border-radius:6px;padding:0 16px;">选择本地文件夹</button>'
            + '<span data-import-selected style="color:#64748b;font-size:13px;">还未选择文件</span>'
            + '<input type="file" data-import-file accept=".zip,.json,.md,.txt,.doc" multiple style="display:none;">'
            + '<input type="file" data-import-folder accept=".json,.md,.txt,.doc" webkitdirectory multiple style="display:none;">'
            + '</div>'
            + '<div style="display:flex;gap:8px;align-items:center;background:#f5f9ff;border:1px solid #dbeafe;border-radius:8px;padding:10px 12px;">'
            + '<button class="btn btn-outline btn-sm" data-import-all style="height:30px;border-radius:6px;padding:0 12px;">全选</button>'
            + '<button class="btn btn-outline btn-sm" data-import-invert style="height:30px;border-radius:6px;padding:0 12px;">反选</button>'
            + '<button class="btn btn-outline btn-sm" data-import-sort style="height:30px;border-radius:6px;padding:0 12px;">排序（按分卷-分章）</button>'
            + '<span style="font-size:12px;color:#64748b;margin-left:auto;">只新增副本；红色“移除”只移出本次清单。</span>'
            + '</div>'
            + '<div data-import-list style="flex:1;overflow:auto;min-height:0;"></div>'
            + '<div style="display:flex;justify-content:flex-end;gap:10px;padding-top:4px;">'
            + '<button class="btn btn-outline" data-close-import style="height:34px;border-radius:6px;padding:0 16px;">取消</button>'
            + '<button class="btn btn-outline" data-do-import style="height:34px;border-radius:6px;padding:0 16px;">导入选中文件</button>'
            + '</div></div>';

        const renderGroups = function() { zhiyuRenderCatalogImportGroups(body, importState.groups); };
        const appendGroups = function(newGroups) {
            (newGroups || []).forEach(function(newGroup) {
                const existing = importState.groups.find(function(group) { return group.name === newGroup.name; });
                if (existing) existing.entries.push.apply(existing.entries, newGroup.entries || []);
                else importState.groups.push(newGroup);
            });
            renderGroups();
        };
        const findEntry = function(id) {
            for (const group of importState.groups) {
                const entry = (group.entries || []).find(function(item) { return item.id === id; });
                if (entry) return entry;
            }
            return null;
        };
        const handlePickedFiles = async function(fileInput) {
            if (!fileInput.files?.length) return;
            try {
                appendGroups(await zhiyuParseCatalogImportFiles(fileInput.files));
            } catch (error) {
                Toast.error('导入文件解析失败：' + (error.message || '文件格式错误'));
            } finally {
                fileInput.value = '';
            }
        };

        renderGroups();
        body.querySelector('[data-import-search]')?.addEventListener('input', renderGroups);
        body.querySelector('[data-pick-import]')?.addEventListener('click', function() { body.querySelector('[data-import-file]')?.click(); });
        body.querySelector('[data-pick-import-folder]')?.addEventListener('click', function() { body.querySelector('[data-import-folder]')?.click(); });
        body.querySelector('[data-import-file]')?.addEventListener('change', function(event) { handlePickedFiles(event.target); });
        body.querySelector('[data-import-folder]')?.addEventListener('change', function(event) { handlePickedFiles(event.target); });
        body.querySelector('[data-import-all]')?.addEventListener('click', function() {
            importState.groups.forEach(function(group) { (group.entries || []).forEach(function(entry) { entry.selected = true; }); });
            renderGroups();
        });
        body.querySelector('[data-import-invert]')?.addEventListener('click', function() {
            importState.groups.forEach(function(group) { (group.entries || []).forEach(function(entry) { entry.selected = !entry.selected; }); });
            renderGroups();
        });
        body.querySelector('[data-import-sort]')?.addEventListener('click', function() {
            importState.groups.forEach(function(group) {
                (group.entries || []).forEach(function(entry) { if (entry.records?.length) entry.records = zhiyuSortCatalogImportRecords(entry.records); });
            });
            renderGroups();
        });
        body.querySelector('[data-import-list]')?.addEventListener('click', function(event) {
            const categoryToggle = event.target.closest?.('[data-toggle-import-category-group]');
            if (categoryToggle) {
                const group = importState.groups.find(function(item) { return item.id === categoryToggle.dataset.importParentGroup; });
                const categoryKey = categoryToggle.dataset.importCategoryKey;
                if (group && categoryKey) {
                    group.categoryExpanded = group.categoryExpanded || {};
                    group.categoryExpanded[categoryKey] = group.categoryExpanded[categoryKey] === false;
                }
                renderGroups();
                return;
            }
            const toggle = event.target.closest?.('[data-toggle-import-group]');
            if (toggle) {
                const group = importState.groups.find(function(item) { return item.id === toggle.dataset.toggleImportGroup; });
                if (group) group.expanded = !group.expanded;
                renderGroups();
                return;
            }
            const remove = event.target.closest?.('[data-remove-import-entry]');
            if (remove) {
                importState.groups.forEach(function(group) { group.entries = (group.entries || []).filter(function(entry) { return entry.id !== remove.dataset.removeImportEntry; }); });
                importState.groups = importState.groups.filter(function(group) { return group.entries.length; });
                renderGroups();
            }
        });
        body.querySelector('[data-import-list]')?.addEventListener('change', function(event) {
            const checkId = event.target.dataset?.importEntryCheck;
            if (checkId) {
                const entry = findEntry(checkId);
                if (entry) entry.selected = event.target.checked;
                renderGroups();
                return;
            }
            const categoryId = event.target.dataset?.importCategory;
            if (categoryId) {
                const entry = findEntry(categoryId);
                if (entry) {
                    entry.category = event.target.value;
                    entry.originalFolder = event.target.value && event.target.value !== 'body' ? zhiyuCanonicalImportFolder(event.target.value) : '';
                    if (event.target.value === 'body' && !entry.records?.length) entry.records = zhiyuRegexSplitChapters(entry.content || '', entry.name || '导入章节');
                }
                renderGroups();
            }
        });
        body.querySelector('[data-close-import]')?.addEventListener('click', close);
        body.querySelector('[data-do-import]')?.addEventListener('click', async function() {
            if (importState.importing) return;
            const aggregate = zhiyuAggregateCatalogImport(importState.groups, bookName);
            if (!aggregate.entries.length) { Toast.warn('请先选择要导入的文件'); return; }
            const unresolved = aggregate.entries.filter(function(entry) { return !entry.category; });
            if (unresolved.length) { Toast.warn('还有 ' + unresolved.length + ' 个文件无法自动识别，请先选择保存位置'); return; }
            const memoryCount = Object.values(aggregate.memBooks[bookName] || {}).reduce(function(total, files) { return total + files.length; }, 0);
            const confirmed = await Confirm.show('将导入到作品“' + bookName + '”：\n正文 ' + aggregate.records.length + ' 章，记忆库 ' + memoryCount + ' 个文件。\n全部新增为副本，重名自动编号，不覆盖原文件。确定继续吗？', { zIndex: 10030 });
            if (!confirmed) return;
            const importBtn = this;
            importState.importing = true;
            importBtn.disabled = true;
            importBtn.textContent = '导入中...';
            let shouldClose = false;
            try {
                const expectedUid = String(window.AccountDataScope?.getActiveUid?.() || '');
                const stagedBooks = zhiyuCloneCatalogValue(gB());
                const stagedMemBooks = zhiyuCloneCatalogValue(getMemBooks());
                if (aggregate.records.length) {
                    await zhiyuApplyCatalogImportRecordsAsCopies(
                        aggregate.records,
                        bookName,
                        aggregate.entries.map(function(entry) { return entry.name; }).join('、'),
                        { targetBooks: stagedBooks, deferSave: true, expectedUid }
                    );
                }
                const memCount = await zhiyuMergeCatalogMemBooksAsCopies(
                    aggregate.memBooks,
                    bookName,
                    { targetMemBooks: stagedMemBooks, deferSave: true }
                );
                await zhiyuCommitCatalogState(stagedBooks, stagedMemBooks, expectedUid);
                shouldClose = true;
                localStorage.setItem(AccountDataScope.key('novel_current_book'), bookName);
                if (typeof window.refreshBookSelect === 'function') window.refreshBookSelect();
                const bookSel = document.getElementById('bookSel');
                if (bookSel) bookSel.value = bookName;
                if (typeof window.refreshTree === 'function') window.refreshTree();
                if (typeof window.refreshMemTree === 'function') window.refreshMemTree();
                Toast.success('导入完成：正文 ' + aggregate.records.length + ' 章，记忆库 ' + memCount + ' 个文件');
                close();
            } catch (error) {
                console.error('导入文件失败', error);
                Toast.error('导入失败，原有数据未改变：' + (error.message || '请重试'));
            } finally {
                if (!shouldClose && document.body.contains(overlay)) {
                    importState.importing = false;
                    importBtn.disabled = false;
                    importBtn.textContent = '导入选中文件';
                }
            }
        });
    }

    function openCatalogTransferModal(initialTab) {
        const bookName = zhiyuCurrentBookName();
        if (!bookName) { Toast.warn('请先选择作品'); return; }
        const overlay = document.createElement('div');
        overlay.className = 'catalog-transfer-overlay';
        overlay.style.cssText = zhiyuCatalogTransferStyle();
        overlay.innerHTML = '<div class="catalog-transfer-dialog" style="' + zhiyuCatalogDialogStyle() + '">'
            + '<div style="display:flex;align-items:center;justify-content:space-between;padding:18px 24px;border-bottom:1px solid #e5e7eb;">'
            + '<div style="font-size:22px;font-weight:800;color:#111827;">当前作品：' + Utils.escapeHtml(bookName) + '</div>'
            + '<button type="button" data-close style="border:none;background:transparent;font-size:24px;color:#6b7280;cursor:pointer;">×</button>'
            + '</div>'
            + '<div style="display:flex;gap:28px;padding:0 24px;border-bottom:1px solid #e5e7eb;">'
            + '<button type="button" data-tab="export" style="height:46px;border:none;background:transparent;font-weight:700;color:#2563eb;border-bottom:3px solid #2563eb;cursor:pointer;">导出文件</button>'
            + '<button type="button" data-tab="import" style="height:46px;border:none;background:transparent;font-weight:700;color:#64748b;border-bottom:3px solid transparent;cursor:pointer;">导入文件</button>'
            + '</div>'
            + '<div data-catalog-body style="flex:1;min-height:0;overflow:hidden;"></div>'
            + '</div>';
        document.body.appendChild(overlay);
        const close = function() { overlay.remove(); };
        overlay.querySelector('[data-close]')?.addEventListener('click', close);
        overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
        let currentTab = initialTab || 'export';
        let importState = { groups: [], importing: false };

        const renderTabs = function() {
            overlay.querySelectorAll('[data-tab]').forEach(function(btn) {
                const active = btn.dataset.tab === currentTab;
                btn.style.color = active ? '#2563eb' : '#64748b';
                btn.style.borderBottomColor = active ? '#2563eb' : 'transparent';
            });
        };

        const renderExport = function() {
            renderTabs();
            const body = overlay.querySelector('[data-catalog-body]');
            body.innerHTML = '<div style="height:100%;display:flex;flex-direction:column;padding:18px 24px;gap:14px;">'
                + '<input data-export-search placeholder="搜索章节或记忆库文件..." style="height:38px;border:1px solid #dbe1ea;border-radius:8px;padding:0 12px;font-size:14px;">'
                + '<div style="display:flex;align-items:center;justify-content:space-between;background:#f5f9ff;border:1px solid #dbeafe;border-radius:8px;padding:10px 12px;">'
                + '<div style="display:flex;gap:18px;align-items:center;font-size:14px;color:#334155;">'
                + '<strong>导出格式：</strong>'
                + '<label><input type="radio" name="catalogExportFormat" value="txt" checked> TXT</label>'
                + '<label><input type="radio" name="catalogExportFormat" value="md"> MD</label>'
                + '<label><input type="radio" name="catalogExportFormat" value="word"> Word</label>'
                + '</div><span data-selected-count style="font-size:13px;color:#64748b;">已选择 0 个文件</span></div>'
                + '<div data-export-tree style="flex:1;overflow:auto;border:1px solid #e2e8f0;border-radius:8px;padding:10px;background:#fff;"></div>'
                + '<div style="display:flex;justify-content:flex-end;gap:10px;padding-top:4px;">'
                + '<button class="btn btn-outline" data-close-export style="height:34px;border-radius:6px;padding:0 16px;">取消</button>'
                + '<button class="btn btn-outline" data-do-export style="height:34px;border-radius:6px;padding:0 16px;">导出压缩包</button>'
                + '</div>'
                + '</div>';
            const tree = body.querySelector('[data-export-tree]');
            const renderTree = function() {
                tree.innerHTML = zhiyuBuildCatalogExportHtml(bookName, body.querySelector('[data-export-search]')?.value || '');
                zhiyuWireCatalogTreeChecks(tree);
            };
            renderTree();
            body.querySelector('[data-export-search]')?.addEventListener('input', renderTree);
            const updateExportButton = function() {
                const btn = body.querySelector('[data-do-export]');
                if (btn) btn.textContent = '导出压缩包';
            };
            body.querySelectorAll('input[name="catalogExportFormat"]').forEach(function(radio) {
                radio.addEventListener('change', updateExportButton);
            });
            updateExportButton();
            body.querySelector('[data-close-export]')?.addEventListener('click', close);
            body.querySelector('[data-do-export]')?.addEventListener('click', async function() {
                const format = body.querySelector('input[name="catalogExportFormat"]:checked')?.value || 'txt';
                const button = this;
                button.disabled = true;
                const originalText = button.textContent;
                button.textContent = '正在生成ZIP...';
                try {
                    await zhiyuDownloadCatalogTransfer(tree, bookName, format);
                } catch (error) {
                    console.error('导出 ZIP 失败', error);
                    Toast.error('导出失败：' + (error.message || '请稍后重试'));
                } finally {
                    if (document.body.contains(button)) {
                        button.disabled = false;
                        button.textContent = originalText;
                    }
                }
            });
        };

        const renderImport = function() {
            renderTabs();
            zhiyuMountCatalogImportPanel(overlay, bookName, close, importState);
        };

        overlay.querySelectorAll('[data-tab]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                currentTab = btn.dataset.tab;
                if (currentTab === 'import') renderImport();
                else renderExport();
            });
        });
        if (currentTab === 'import') renderImport();
        else renderExport();
    }

    window.ZHIYU_SELECTIVE_TRANSFER_FORMAT = ZHIYU_SELECTIVE_TRANSFER_FORMAT;
    window.ZHIYU_CATALOG_ZIP_FORMAT = ZHIYU_CATALOG_ZIP_FORMAT;
    window.ZHIYU_CATALOG_MANIFEST = ZHIYU_CATALOG_MANIFEST;
    window.ZHIYU_MULTI_BOOK_ZIP_FORMAT = ZHIYU_MULTI_BOOK_ZIP_FORMAT;
    window.ZHIYU_MULTI_BOOK_MANIFEST = ZHIYU_MULTI_BOOK_MANIFEST;
    window.openCatalogTransferModal = openCatalogTransferModal;
    window.zhiyuCurrentBookName = zhiyuCurrentBookName;
    window.zhiyuBuildCatalogExportHtml = zhiyuBuildCatalogExportHtml;
    window.zhiyuCollectCatalogExport = zhiyuCollectCatalogExport;
    window.zhiyuCollectFullBookExport = zhiyuCollectFullBookExport;
    window.zhiyuCreateCatalogTransferZip = zhiyuCreateCatalogTransferZip;
    window.zhiyuDownloadCatalogTransfer = zhiyuDownloadCatalogTransfer;
    window.zhiyuCreateMultiBookBackupZip = zhiyuCreateMultiBookBackupZip;
    window.zhiyuDownloadMultiBookBackup = zhiyuDownloadMultiBookBackup;
    window.openMultiBookBackupExportModal = openMultiBookBackupExportModal;
    window.zhiyuParseCatalogTransferFile = zhiyuParseCatalogTransferFile;
    window.zhiyuParseCatalogImportFiles = zhiyuParseCatalogImportFiles;
    window.zhiyuParseCatalogZip = zhiyuParseCatalogZip;
    window.zhiyuParseCatalogZipBundle = zhiyuParseCatalogZipBundle;
    window.zhiyuEntriesFromManifest = zhiyuEntriesFromManifest;
    window.zhiyuAggregateCatalogImport = zhiyuAggregateCatalogImport;
    window.zhiyuMarkImportedBodyEntriesForRetry = zhiyuMarkImportedBodyEntriesForRetry;
    window.zhiyuRenderCatalogImportGroups = zhiyuRenderCatalogImportGroups;
    window.zhiyuApplyCatalogImportRecordsAsCopies = zhiyuApplyCatalogImportRecordsAsCopies;
    window.zhiyuMergeCatalogMemBooksAsCopies = zhiyuMergeCatalogMemBooksAsCopies;
    window.zhiyuCommitCatalogState = zhiyuCommitCatalogState;
    window.zhiyuImportBookBackupFile = zhiyuImportBookBackupFile;
    window.zhiyuMemoryFolderType = zhiyuMemoryFolderType;
    window.ZHIYU_CATALOG_TRANSFER_READY = true;
})(window, document);
