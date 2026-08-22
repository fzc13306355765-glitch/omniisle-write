// ===== 记忆库文件夹导出 =====
(function() {
    const AppState = window.ZHIYU_APP_STATE || window.AppState || {};
    const Toast = window.ZHIYU_TOAST || window.Toast || { warn: function(){}, success: function(){}, error: function(){} };
    const JSZIP_URL = './scripts/vendor/jszip-3.10.1.min.js?v=acc7e41455a8';
    const JSZIP_INTEGRITY = 'sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG';
    let jsZipLoadPromise = null;

    function loadJSZip() {
        if (typeof window.JSZip === 'function') return Promise.resolve(window.JSZip);
        if (jsZipLoadPromise) return jsZipLoadPromise;
        jsZipLoadPromise = new Promise(function(resolve, reject) {
            const script = document.createElement('script');
            let settled = false;
            const finish = function(error) {
                if (settled) return;
                settled = true;
                window.clearTimeout(timeoutId);
                script.onload = null;
                script.onerror = null;
                if (error) {
                    script.remove();
                    reject(error);
                } else {
                    jsZipLoadPromise = null;
                    resolve(window.JSZip);
                }
            };
            const timeoutId = window.setTimeout(function() {
                finish(new Error('本地ZIP组件加载超时，请刷新页面后重试'));
            }, 15000);
            script.src = JSZIP_URL;
            script.async = true;
            script.integrity = JSZIP_INTEGRITY;
            script.crossOrigin = 'anonymous';
            script.dataset.zhiyuDependency = 'jszip';
            script.onload = function() {
                finish(typeof window.JSZip === 'function' ? null : new Error('ZIP组件加载异常，请稍后重试'));
            };
            script.onerror = function() {
                finish(new Error('本地ZIP组件加载失败，请刷新页面后重试'));
            };
            try {
                document.head.appendChild(script);
            } catch (error) {
                finish(error instanceof Error ? error : new Error('ZIP组件加载失败，请稍后重试'));
            }
        }).catch(function(error) {
            jsZipLoadPromise = null;
            throw error;
        });
        return jsZipLoadPromise;
    }

    // 导出文件夹为 ZIP
    async function exportFolder(folderName) {
        const getMemBooks = window.getMemBooks || function() { return {}; };
        const memBooks = getMemBooks();
        const files = memBooks[AppState.memory?.book]?.[folderName];
        if (!files || files.length === 0) {
            Toast.warn('文件夹为空，无法导出');
            return;
        }

        try {
            await loadJSZip();
            await exportFolderWithJSZip(folderName, files);
        } catch (err) {
            Toast.error('导出失败：' + err.message);
        }
    }

    async function exportFolderWithJSZip(folderName, files) {
        const zip = new window.JSZip();
        files.forEach(function(file) {
            zip.file(file.name, file.content || '');
        });
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = folderName + '_' + new Date().toISOString().slice(0, 10) + '.zip';
        a.click();
        URL.revokeObjectURL(url);
        Toast.success('已导出 ' + files.length + ' 个文件');
    }

    window.exportFolder = exportFolder;
    window.exportFolderWithJSZip = exportFolderWithJSZip;
    window.ZhiyuLoadJSZip = loadJSZip;
    window.ZHIYU_MEMORY_FOLDER_EXPORT_READY = true;
})();
