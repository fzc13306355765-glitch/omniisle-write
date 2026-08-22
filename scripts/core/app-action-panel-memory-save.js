// 细纲和拆书保存到记忆库。
(function() {
        function saveOGToMemory() {
            var og = ACTION_PANEL_APP_STATE.outlineGen;
            var content = og.ogContent;
            if (!content) { ACTION_PANEL_TOAST.warn('没有可保存的细纲内容，请先生成'); return; }

            var bookName = ACTION_PANEL_APP_STATE.chapter.book;
            if (!bookName) { ACTION_PANEL_TOAST.warn('请先选择书籍'); return; }

            var chapters = splitGeneratedChapterSections(content);
            if (chapters.length === 0) {
                ACTION_PANEL_TOAST.warn('未能识别章节标题。' + getChapterFormatHelpText());
                ACTION_PANEL_UTILS.appendLog(null, '⚠️ 保存失败：未能识别章节标题。' + getChapterFormatHelpText(), 'warn');
                return;
            }

            // 获取当前卷号（1-based）
            var volNum = (typeof ACTION_PANEL_APP_STATE.chapter.vi === 'number' && ACTION_PANEL_APP_STATE.chapter.vi >= 0 ? ACTION_PANEL_APP_STATE.chapter.vi : 0) + 1;

            var memBooks = getMemBooks();
            if (!memBooks[bookName]) memBooks[bookName] = {};

            // 创建文件夹：细纲/第X卷 → 用 "细纲-第X卷" 作为文件夹名
            var memFolder = '细纲-第' + volNum + '卷';
            if (!memBooks[bookName][memFolder]) memBooks[bookName][memFolder] = [];

            var savedCount = 0, overwroteCount = 0;
            for (var j = 0; j < chapters.length; j++) {
                var ch = chapters[j];
                var chContent = ch.content;
                var num = ch.num;
                var cleanTitle = ch.cleanTitle;
                var fileName = '第' + num + '章' + (cleanTitle ? '-' + cleanTitle : '') + '.md';

                var existingIdx = -1;
                var files = memBooks[bookName][memFolder];
                for (var k = 0; k < files.length; k++) {
                    if (files[k].name === fileName) { existingIdx = k; break; }
                }

                var fileObj = {
                    name: fileName,
                    content: chContent,
                    updatedAt: new Date().toISOString()
                };
                if (!fileObj.createdAt) fileObj.createdAt = fileObj.updatedAt;

                if (existingIdx >= 0) {
                    fileObj.createdAt = files[existingIdx].createdAt || fileObj.updatedAt;
                    files[existingIdx] = window.preserveMemoryReferenceFileIdentity(files[existingIdx], fileObj);
                    overwroteCount++;
                } else {
                    files.push(fileObj);
                    savedCount++;
                }
            }

            sMB(memBooks);
            var msg = '💾 已保存到记忆库/' + memFolder + '（新增' + savedCount + '章';
            if (overwroteCount > 0) msg += '，覆盖' + overwroteCount + '章';
            msg += '）';
            ACTION_PANEL_UTILS.appendLog(null, msg, 'success');
            ACTION_PANEL_TOAST.success('已保存 ' + (savedCount + overwroteCount) + ' 章到记忆库/' + memFolder);
        }

        // 拆书模块保存（同逻辑，保存到 拆书-第X卷）
        function saveDecomposeToMemory() {
            var contentBox = document.getElementById('dcContentBox');
            var content = (contentBox?.innerText || '').trim();
            if (!content) { ACTION_PANEL_TOAST.warn('拆书内容为空，请先拆解'); return; }

            var bookName = ACTION_PANEL_APP_STATE.chapter.book;
            if (!bookName) { ACTION_PANEL_TOAST.warn('请先选择书籍'); return; }

            var chapters = splitGeneratedChapterSections(content);
            if (chapters.length === 0) {
                ACTION_PANEL_TOAST.warn('未能识别章节标题。' + getChapterFormatHelpText());
                ACTION_PANEL_UTILS.appendLog(null, '⚠️ 保存失败：未能识别章节标题。' + getChapterFormatHelpText(), 'warn');
                return;
            }

            var volNum = (typeof ACTION_PANEL_APP_STATE.chapter.vi === 'number' && ACTION_PANEL_APP_STATE.chapter.vi >= 0 ? ACTION_PANEL_APP_STATE.chapter.vi : 0) + 1;
            var memBooks = getMemBooks();
            if (!memBooks[bookName]) memBooks[bookName] = {};
            var memFolder = '拆书-第' + volNum + '卷';
            if (!memBooks[bookName][memFolder]) memBooks[bookName][memFolder] = [];

            var savedCount = 0, overwroteCount = 0;

            for (var j = 0; j < chapters.length; j++) {
                var ch = chapters[j];
                var chContent = ch.content;
                var num = ch.num;
                var cleanTitle = ch.cleanTitle;
                var chFileName = '第' + num + '章' + (cleanTitle ? '-' + cleanTitle : '') + '.md';

                var existingIdx = -1;
                var files = memBooks[bookName][memFolder];
                for (var k = 0; k < files.length; k++) {
                    if (files[k].name === chFileName) { existingIdx = k; break; }
                }
                var chFileObj = { name: chFileName, content: chContent, updatedAt: new Date().toISOString() };
                if (!chFileObj.createdAt) chFileObj.createdAt = chFileObj.updatedAt;
                if (existingIdx >= 0) { chFileObj.createdAt = files[existingIdx].createdAt || chFileObj.updatedAt; files[existingIdx] = window.preserveMemoryReferenceFileIdentity(files[existingIdx], chFileObj); overwroteCount++; }
                else { files.push(chFileObj); savedCount++; }
            }

            sMB(memBooks);
            var msg = '💾 已保存到记忆库/' + memFolder + '（新增' + savedCount + '项';
            if (overwroteCount > 0) msg += '，覆盖' + overwroteCount + '项';
            msg += '）';
            ACTION_PANEL_UTILS.appendLog(null, msg, 'success');
            ACTION_PANEL_TOAST.success('已保存到记忆库/' + memFolder);
        }

        window.saveOGToMemory = saveOGToMemory;
        window.saveDecomposeToMemory = saveDecomposeToMemory;
        window.ZHIYU_ACTION_PANEL_MEMORY_SAVE_READY = true;
})();
