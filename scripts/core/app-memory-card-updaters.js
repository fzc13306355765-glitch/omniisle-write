(function(window) {
    'use strict';

    function getChapterNumber(chapterName, fallback) {
        if (typeof window.extractChapterNumber === 'function') {
            return window.extractChapterNumber(chapterName) || fallback;
        }
        if (typeof window.extractChapterNumberFromName === 'function') {
            return window.extractChapterNumberFromName(chapterName) || fallback;
        }
        if (typeof window.parseChapterNum === 'function') {
            const parsed = window.parseChapterNum(chapterName);
            return Number.isFinite(parsed) ? parsed : fallback;
        }
        return fallback;
    }

    function getBookStore() {
        return typeof window.gB === 'function' ? window.gB() : {};
    }

    function saveMemBooks(memBooks) {
        if (typeof window.sMB === 'function') window.sMB(memBooks);
    }

    function getDefaultFolder(memBook) {
        return Object.keys(memBook || {})[0] || '默认文件夹';
    }

    function findMemoryFile(memBook, fileName) {
        for (const folder in memBook) {
            const files = memBook[folder] || [];
            const found = files.find(f => f.name === fileName);
            if (found) return found;
        }
        return null;
    }

    function normalizeTableRow(content) {
        return String(content || '').trim().replace(/^\|?\s*/, '| ');
    }

    function splitTableRow(row) {
        const text = String(row || '').trim();
        if (!/^\|.*\|$/.test(text)) return [];
        return text.split('|').slice(1, -1).map(cell => cell.trim());
    }

    function mergeAllowedMemoryTableRows(existingContent, incomingContent, allowedRowKeys, expectedColumns, currentChapter) {
        const allowed = new Set((allowedRowKeys || []).map(String));
        const incomingRows = String(incomingContent || '').split(/\r?\n/)
            .map(row => row.trim())
            .filter(row => {
                const cells = splitTableRow(row);
                if (!cells.length || !allowed.has(cells[0])) return false;
                if (expectedColumns && cells.length !== expectedColumns) return false;
                if (currentChapter && !cells.some(cell => cell.includes('第' + currentChapter + '章'))) return false;
                return true;
            });
        if (!incomingRows.length) return String(existingContent || '');

        const replacement = new Map(incomingRows.map(row => [splitTableRow(row)[0], row]));
        const seen = new Set();
        const lines = String(existingContent || '').split(/\r?\n/).map(line => {
            const cells = splitTableRow(line);
            const key = cells[0];
            if (!replacement.has(key)) return line;
            seen.add(key);
            return replacement.get(key);
        });
        for (const [key, row] of replacement) {
            if (!seen.has(key)) lines.push(row);
        }
        return lines.join('\n').replace(/\n{3,}/g, '\n\n');
    }

    function updateTrackingCard(bookName, chapterIndex, chapterName, trackingContent) {
        const memBooks = typeof window.ensureMemBook === 'function' ? window.ensureMemBook(bookName) : {};
        if (!memBooks[bookName]) return;

        const trackFileName = `${bookName}_追踪表`;
        const chapterNum = getChapterNumber(chapterName, chapterIndex);
        const validation = window.validateTrackingRowOutput?.(trackingContent, chapterNum);
        if (validation && !validation.ok) return false;
        const newRow = validation?.content || normalizeTableRow(trackingContent);
        let trackFile = findMemoryFile(memBooks[bookName], trackFileName);

        if (trackFile) {
            const rowRegex = new RegExp(`\\n\\|\\s*第${chapterNum}章\\s*\\|.*\\|`, '');
            if (rowRegex.test(trackFile.content)) {
                trackFile.content = trackFile.content.replace(rowRegex, `\n${newRow}`);
            } else {
                trackFile.content += `\n${newRow}`;
            }
            trackFile.updatedAt = new Date().toISOString();
        } else {
            const defaultFolder = getDefaultFolder(memBooks[bookName]);
            if (!memBooks[bookName][defaultFolder]) {
                memBooks[bookName][defaultFolder] = [];
            }
            const books = getBookStore();
            const totalChapters = typeof window.countTotalChapters === 'function'
                ? window.countTotalChapters(books[bookName])
                : 0;
            memBooks[bookName][defaultFolder].push({
                name: trackFileName,
                content: `# 追踪表\n\n## 进度总览\n已写章节：${chapterIndex} / ${totalChapters} 章\n最近更新：第${chapterIndex}章《${chapterName}》\n\n## 已完成章节\n| 章 | 章节进度 | 角色状态变化 | 伏笔追踪 |\n|----|----------|-------------|----------|\n${newRow}`,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
        }

        saveMemBooks(memBooks);
        return true;
    }

    function updateBoundaryCard(bookName, chapterIndex, chapterName, boundaryContent) {
        const memBooks = typeof window.ensureMemBook === 'function' ? window.ensureMemBook(bookName) : {};
        if (!memBooks[bookName]) return;

        const boundaryFileName = `${bookName}_边界卡`;
        const chapterNum = getChapterNumber(chapterName, chapterIndex);
        const validation = window.validateBoundaryRowOutput?.(boundaryContent, chapterNum);
        if (validation && !validation.ok) return false;
        const newRow = validation?.content || normalizeTableRow(boundaryContent);
        let boundaryFile = findMemoryFile(memBooks[bookName], boundaryFileName);

        if (boundaryFile) {
            const rowRegex = new RegExp(`\\n\\|\\s*第${chapterNum}章\\s*\\|.*\\|`, '');
            if (rowRegex.test(boundaryFile.content)) {
                boundaryFile.content = boundaryFile.content.replace(rowRegex, `\n${newRow}`);
            } else {
                boundaryFile.content += `\n${newRow}`;
            }
            boundaryFile.updatedAt = new Date().toISOString();
        } else {
            const defaultFolder = getDefaultFolder(memBooks[bookName]);
            if (!memBooks[bookName][defaultFolder]) {
                memBooks[bookName][defaultFolder] = [];
            }
            memBooks[bookName][defaultFolder].push({
                name: boundaryFileName,
                content: `# 边界卡\n\n| 章 | 本章禁区 | 下章规划 | 进度提醒(≤20字) |\n|----|----------|----------|----------------|\n${newRow}`,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
        }

        saveMemBooks(memBooks);
        return true;
    }

    window.ZHIYU_MEMORY_CARD_UPDATERS = {
        updateTrackingCard,
        updateBoundaryCard,
        mergeAllowedMemoryTableRows
    };
    window.updateTrackingCard = updateTrackingCard;
    window.updateBoundaryCard = updateBoundaryCard;
    window.mergeAllowedMemoryTableRows = mergeAllowedMemoryTableRows;
})(window);
