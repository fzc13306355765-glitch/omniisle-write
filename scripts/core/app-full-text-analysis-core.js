(function(root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.ZhiyuFullTextAnalysisCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    'use strict';

    const CHAPTERS_PER_CALL = 10;
    const CHARS_PER_CALL = 30000;
    const DEFAULT_CHUNK_CHAR_LIMIT = 26000;
    const ROLLING_CHAPTER_LIMIT = 10;
    const ROLLING_CARD_NAMES = Object.freeze(['追踪表', '边界卡', '承接卡']);

    const FEATURE_ALIASES = Object.freeze({
        fullTextImport: 'full-text-import',
        advancedOutline: 'advanced-outline',
        advancedStage: 'advanced-stage',
        normalOutline: 'normal-outline',
        decompose: 'decompose',
        script: 'script'
    });

    const OVERWRITE_COPY = Object.freeze({
        'full-text-import': Object.freeze({
            title: '导入并覆盖已有作品',
            confirmText: '确认覆盖并保存',
            message: '保存后，本次导入的正文和分析结果会替换目标作品中的对应内容。',
            keepItems: Object.freeze(['章节细纲', '拆书设定和拆书章节', '剧本、分镜、角色、场景、道具', '用户上传文件'])
        }),
        'advanced-outline': Object.freeze({
            title: '保存并重建高级大纲',
            confirmText: '继续保存',
            message: '保存后，系统会按新大纲重新生成对应关联文件。',
            keepItems: Object.freeze(['正文', '章节细纲', '拆书设定和拆书章节', '剧本、分镜、角色、场景、道具', '用户上传文件'])
        }),
        'advanced-stage': Object.freeze({
            title: '保存并更新阶段粗纲',
            confirmText: '继续保存',
            message: '保存后，只更新当前阶段和本次实际涉及的关联文件。',
            keepItems: Object.freeze(['其他阶段粗纲（当前阶段除外）', '正文、章节细纲、拆书设定和拆书章节', '追踪表、边界卡和承接卡', '剧本、分镜、角色、场景、道具', '用户上传文件'])
        }),
        'normal-outline': Object.freeze({
            title: '保存并重建普通大纲',
            confirmText: '继续保存',
            message: '保存后，系统会按普通大纲重建关联文件，并清除不再适用的高级大纲文件。',
            keepItems: Object.freeze(['正文', '章节细纲', '拆书设定和拆书章节', '剧本、分镜、角色、场景、道具', '用户上传文件'])
        }),
        decompose: Object.freeze({
            title: '保存并重建拆书设定',
            confirmText: '继续保存',
            message: '保存后，系统会按新的拆书设定重建对应关联文件。',
            keepItems: Object.freeze(['大纲、剧情总览、阶段粗纲', '关键事件表和资料索引', '正文、章节细纲和拆书章节', '剧本、分镜、角色、场景、道具', '用户上传文件'])
        }),
        script: Object.freeze({
            title: '保存并替换剧本',
            confirmText: '继续保存',
            message: '保存后，只替换剧本主文件，已有辅助文件继续保留。',
            keepItems: Object.freeze(['已有分镜、角色、场景和道具文件', '大纲、剧情总览、阶段粗纲、拆书设定', '设定集、信息表、角色列表、关键事件表和资料索引', '追踪表、边界卡、承接卡', '正文、章节细纲、拆书章节和用户上传文件'])
        })
    });

    function asText(value) {
        return String(value == null ? '' : value);
    }

    function clone(value) {
        if (typeof structuredClone === 'function') return structuredClone(value);
        return JSON.parse(JSON.stringify(value));
    }

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.freeze(value);
        Object.keys(value).forEach(function(key) { deepFreeze(value[key]); });
        return value;
    }

    function countValidTextChars(value) {
        const text = asText(value);
        const chinese = text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || [];
        const latinAndDigits = text.match(/[A-Za-z0-9]/g) || [];
        return chinese.length + latinAndDigits.length;
    }

    function getChapterText(chapter) {
        return asText(chapter && (chapter.content != null ? chapter.content : chapter.text));
    }

    function normalizeAnalysisChapters(chapters) {
        return (Array.isArray(chapters) ? chapters : []).map(function(chapter, index) {
            const content = getChapterText(chapter);
            const chapterNumber = Number(chapter && (chapter.chapterNumber || chapter.number)) || parseChapterNumber(chapter && (chapter.title || chapter.name)) || index + 1;
            return {
                id: asText(chapter && chapter.id) || 'chapter-' + chapterNumber + '-' + index,
                chapterNumber: chapterNumber,
                title: asText(chapter && (chapter.title || chapter.name)) || '第' + chapterNumber + '章',
                volume: asText(chapter && (chapter.volume || chapter.volumeName)),
                content: content,
                charCount: countValidTextChars(content),
                sourceIndex: index
            };
        }).filter(function(chapter) { return chapter.charCount > 0 && chapter.content.trim(); });
    }

    function calculateUsage(chapters) {
        const normalized = normalizeAnalysisChapters(chapters);
        const chapterCount = normalized.length;
        const charCount = normalized.reduce(function(total, chapter) { return total + chapter.charCount; }, 0);
        const chapterCalls = chapterCount ? Math.ceil(chapterCount / CHAPTERS_PER_CALL) : 0;
        const charCalls = charCount ? Math.ceil(charCount / CHARS_PER_CALL) : 0;
        const callUnits = Math.max(chapterCalls, charCalls);
        return deepFreeze({
            chapterCount: chapterCount,
            charCount: charCount,
            chapterCalls: chapterCalls,
            charCalls: charCalls,
            callUnits: callUnits,
            driver: charCalls > chapterCalls ? 'chars' : 'chapters'
        });
    }

    function splitTextPreservingAll(text, maxChars) {
        const source = asText(text);
        const limit = Math.max(1000, Math.floor(Number(maxChars) || DEFAULT_CHUNK_CHAR_LIMIT));
        if (source.length <= limit) return [source];
        const parts = [];
        let start = 0;
        while (start < source.length) {
            let end = Math.min(source.length, start + limit);
            if (end < source.length) {
                const floor = start + Math.floor(limit * 0.65);
                const paragraphBreak = source.lastIndexOf('\n\n', end);
                const lineBreak = source.lastIndexOf('\n', end);
                const sentenceBreak = Math.max(source.lastIndexOf('。', end), source.lastIndexOf('！', end), source.lastIndexOf('？', end));
                const preferred = Math.max(paragraphBreak, lineBreak, sentenceBreak >= 0 ? sentenceBreak + 1 : -1);
                if (preferred > floor) end = preferred;
            }
            if (end <= start) end = Math.min(source.length, start + limit);
            parts.push(source.slice(start, end));
            start = end;
        }
        return parts;
    }

    function buildAnalysisChunks(chapters, options) {
        const opts = options || {};
        const maxChars = Math.max(1000, Math.floor(Number(opts.maxChars) || DEFAULT_CHUNK_CHAR_LIMIT));
        const maxChapters = Math.max(1, Math.floor(Number(opts.maxChapters) || CHAPTERS_PER_CALL));
        const normalized = normalizeAnalysisChapters(chapters);
        const pieces = [];
        normalized.forEach(function(chapter) {
            const split = splitTextPreservingAll(chapter.content, maxChars);
            split.forEach(function(content, partIndex) {
                pieces.push({
                    chapterId: chapter.id,
                    chapterNumber: chapter.chapterNumber,
                    title: chapter.title,
                    volume: chapter.volume,
                    partIndex: partIndex,
                    partTotal: split.length,
                    content: content,
                    sourceIndex: chapter.sourceIndex
                });
            });
        });

        const chunks = [];
        let current = [];
        let currentLength = 0;
        let currentChapterIds = new Set();
        function flush() {
            if (!current.length) return;
            const chapterNumbers = Array.from(new Set(current.map(function(item) { return item.chapterNumber; })));
            chunks.push({
                parts: current,
                startChapter: Math.min.apply(Math, chapterNumbers),
                endChapter: Math.max.apply(Math, chapterNumbers),
                chapterCount: chapterNumbers.length,
                charCount: current.reduce(function(total, item) { return total + countValidTextChars(item.content); }, 0)
            });
            current = [];
            currentLength = 0;
            currentChapterIds = new Set();
        }

        pieces.forEach(function(piece) {
            const nextLength = piece.content.length;
            const addsChapter = !currentChapterIds.has(piece.chapterId);
            if (current.length && (currentLength + nextLength > maxChars
                || (addsChapter && currentChapterIds.size >= maxChapters))) flush();
            current.push(piece);
            currentLength += nextLength;
            currentChapterIds.add(piece.chapterId);
            if (currentLength >= maxChars) flush();
        });
        flush();

        return chunks.map(function(chunk, index) {
            const text = chunk.parts.map(function(part) {
                const partLabel = part.partTotal > 1 ? '（片段' + (part.partIndex + 1) + '/' + part.partTotal + '）' : '';
                const volumeLabel = part.volume ? '【' + part.volume + '】' : '';
                return volumeLabel + '【' + part.title + partLabel + '】\n' + part.content;
            }).join('\n\n');
            return deepFreeze({
                id: 'analysis-chunk-' + (index + 1),
                index: index + 1,
                total: chunks.length,
                startChapter: chunk.startChapter,
                endChapter: chunk.endChapter,
                chapterCount: chunk.chapterCount,
                charCount: chunk.charCount,
                text: text,
                parts: clone(chunk.parts)
            });
        });
    }

    function chineseNumberToInt(value) {
        const source = asText(value).trim();
        if (!source) return 0;
        if (/^\d+$/.test(source)) return Number(source);
        const digitMap = { '零': 0, '〇': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
        const unitMap = { '十': 10, '百': 100, '千': 1000, '万': 10000 };
        let total = 0;
        let section = 0;
        let number = 0;
        for (const char of source) {
            if (Object.prototype.hasOwnProperty.call(digitMap, char)) {
                number = digitMap[char];
                continue;
            }
            const unit = unitMap[char];
            if (!unit) return 0;
            if (unit === 10000) {
                section = (section + number) * unit;
                total += section;
                section = 0;
                number = 0;
            } else {
                section += (number || 1) * unit;
                number = 0;
            }
        }
        return total + section + number;
    }

    function parseChapterNumber(value) {
        const match = asText(value).match(/第\s*([零〇一二两三四五六七八九十百千万\d]+)\s*章/);
        return match ? chineseNumberToInt(match[1]) : 0;
    }

    function orderImportChapters(chapters, mode) {
        const source = Array.isArray(chapters) ? chapters.slice() : [];
        const entries = source.map(function(chapter, index) {
            const originalIndex = Number.isInteger(chapter && chapter._importOriginalIndex)
                && chapter._importOriginalIndex >= 0 ? chapter._importOriginalIndex : index;
            return {
                chapter: chapter,
                originalIndex: originalIndex,
                volume: asText(chapter && chapter.volume).trim(),
                chapterNumber: parseChapterNumber(chapter && (chapter.title || chapter.name))
            };
        });
        if (mode === 'original') {
            entries.sort(function(a, b) { return a.originalIndex - b.originalIndex; });
            return { safe: true, chapters: entries.map(function(entry) { return entry.chapter; }), message: '' };
        }
        const withVolume = entries.filter(function(entry) { return !!entry.volume; });
        if (withVolume.length > 0 && withVolume.length !== entries.length) {
            return {
                safe: false,
                chapters: source,
                message: '检测到卷信息不完整，已保持原始顺序，避免打乱剧情。'
            };
        }
        const groups = new Map();
        entries.forEach(function(entry) {
            const groupName = entry.volume || '__single_volume__';
            if (!groups.has(groupName)) groups.set(groupName, []);
            groups.get(groupName).push(entry);
        });
        for (const groupEntries of groups.values()) {
            const numbers = groupEntries.map(function(entry) { return entry.chapterNumber; });
            if (numbers.some(function(number) { return number <= 0; }) || new Set(numbers).size !== numbers.length) {
                return {
                    safe: false,
                    chapters: source,
                    message: '检测到章节号缺失或重复，已保持原始顺序，避免跨卷混排。'
                };
            }
        }
        const volumeOrder = new Map();
        entries.slice().sort(function(a, b) { return a.originalIndex - b.originalIndex; }).forEach(function(entry) {
            const groupName = entry.volume || '__single_volume__';
            if (!volumeOrder.has(groupName)) volumeOrder.set(groupName, volumeOrder.size);
        });
        entries.sort(function(a, b) {
            const aGroup = a.volume || '__single_volume__';
            const bGroup = b.volume || '__single_volume__';
            const groupDiff = volumeOrder.get(aGroup) - volumeOrder.get(bGroup);
            if (groupDiff) return groupDiff;
            if (a.chapterNumber !== b.chapterNumber) return a.chapterNumber - b.chapterNumber;
            return a.originalIndex - b.originalIndex;
        });
        return { safe: true, chapters: entries.map(function(entry) { return entry.chapter; }), message: '' };
    }

    function getChapterRowNumber(line) {
        if (!/^\|\s*第/.test(asText(line).trim())) return 0;
        return parseChapterNumber(line);
    }

    function getMaxChapterNumber(content) {
        return asText(content).split(/\r?\n/).reduce(function(max, line) {
            const chapterNumber = getChapterRowNumber(line);
            return chapterNumber > max ? chapterNumber : max;
        }, 0);
    }

    function normalizeChapterTableRows(content, limit) {
        const maxRows = Math.max(1, Math.floor(Number(limit) || ROLLING_CHAPTER_LIMIT));
        const lines = asText(content).split(/\r?\n/);
        const rowIndexes = [];
        const rows = new Map();
        lines.forEach(function(line, index) {
            const currentNumber = getChapterRowNumber(line);
            if (!currentNumber) return;
            rowIndexes.push(index);
            rows.set(currentNumber, line.trim());
        });
        if (!rowIndexes.length) return asText(content).trim() + '\n';
        const keptRows = Array.from(rows.entries())
            .sort(function(a, b) { return a[0] - b[0]; })
            .slice(-maxRows)
            .map(function(item) { return item[1]; });

        const rowIndexSet = new Set(rowIndexes);
        let insertAt = rowIndexes.length ? rowIndexes[0] : -1;
        const output = [];
        lines.forEach(function(line, index) {
            if (!rowIndexSet.has(index)) output.push(line);
            else if (index < insertAt) insertAt -= 1;
        });
        if (insertAt < 0) {
            const divider = output.findIndex(function(line) { return /^\|(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(line.trim()); });
            insertAt = divider >= 0 ? divider + 1 : output.length;
        } else {
            insertAt = Math.min(insertAt, output.length);
        }
        output.splice.apply(output, [insertAt, 0].concat(keptRows));
        return output.join('\n').trim() + '\n';
    }

    function upsertChapterTableRow(content, row, chapterNumber, limit) {
        const number = Number(chapterNumber) || parseChapterNumber(row);
        if (!number) throw new Error('章节编号无效');
        return normalizeChapterTableRows(asText(content).trimEnd() + '\n' + asText(row).trim(), limit);
    }

    function shouldUpdateContinuityCurrent(content, chapterNumber) {
        const current = Number(chapterNumber) || 0;
        const latest = getMaxChapterNumber(content);
        return current > 0 && current >= latest;
    }

    function canonicalFileName(bookName, fileName) {
        const prefix = asText(bookName).trim() + '_';
        let name = asText(fileName).trim().replace(/\.(?:md|txt)$/i, '');
        if (prefix !== '_' && name.startsWith(prefix)) name = name.slice(prefix.length);
        const aliases = { '信息卡': '信息表', '角色关系网': '角色列表', '人物关系网': '角色列表', '拆书': '拆书设定', '仿写': '拆书设定', '仿写设定': '拆书设定' };
        return aliases[name] || name;
    }

    const MEMORY_FILE_SOURCE_USER = 'user-upload';
    const MEMORY_FILE_SOURCE_SYSTEM = 'system-generated';
    const MEMORY_FILE_MANAGER_SYSTEM = 'zhiyu-writing';
    const SYSTEM_MEMORY_TOMBSTONE_FIELD = 'deletedSystemMemoryFiles';
    const LEGACY_SYSTEM_FOLDERS = new Set(['默认文件夹', '关联文件夹', '剧本', '仿写']);
    const LEGACY_SYSTEM_FILE_NAMES = new Set([
        '大纲', '大纲快照', '剧情总览', '母大纲', '母纲', '母大纲原始备份', '母纲备份',
        '设定集', '信息表', '信息卡', '角色列表', '角色关系网', '人物关系网',
        '追踪表', '边界卡', '承接卡', '关键事件表', '资料索引', '拆书', '拆书设定', '仿写', '仿写设定',
        '剧本', '分镜', '角色', '场景', '道具'
    ]);

    function isLegacySystemFileName(bookName, fileName, folderName) {
        const rawName = asText(fileName).trim().replace(/\.(?:md|txt)$/i, '');
        const prefix = asText(bookName).trim() + '_';
        const folder = asText(folderName).trim();
        if ((folder === '默认文件夹' || folder === '关联文件夹') && prefix !== '_' && !rawName.startsWith(prefix)) return false;
        const name = canonicalFileName(bookName, fileName);
        return LEGACY_SYSTEM_FILE_NAMES.has(name) || isStageFile(name);
    }

    function hasLegacySystemContentSignature(bookName, file, folderName) {
        const content = asText(file && file.content).trim();
        if (!content) return false;
        const name = canonicalFileName(bookName, file && file.name);
        const hasHeading = function(values) {
            return values.some(function(value) {
                return new RegExp('^#{1,3}\\s*' + value + '\\s*(?:$|[：:])', 'm').test(content);
            });
        };
        if (name === '追踪表') {
            return hasHeading(['追踪表']) && (/^##\s*(?:进度总览|已完成章节|大纲信息|长期未结事项)\s*$/m.test(content)
                || /\|\s*章\s*\|\s*章节进度\s*\|\s*角色状态变化\s*\|\s*伏笔追踪\s*\|/.test(content));
        }
        if (name === '边界卡') {
            return hasHeading(['边界卡']) && (/^##\s*当前有效边界\s*$/m.test(content)
                || /\|\s*章\s*\|\s*本章禁区\s*\|\s*下章规划\s*\|/.test(content));
        }
        if (name === '承接卡') {
            return hasHeading(['承接卡']) && (/^##\s*当前承接\s*$/m.test(content)
                || /^##\s*最近(?:10|20)?章?承接(?:记录)?\s*$/m.test(content)
                || /最后画面[：:].*未完成动作/s.test(content));
        }
        if (name === '设定集') {
            return hasHeading(['设定集']) && (/^>\s*(?:基于.+自动生成|世界观、修炼体系、金手指概要、特殊设定)/m.test(content)
                || /^##\s*(?:世界观|修炼体系|能力体系|职业体系|金手指概要|特殊规则|禁区)\s*$/m.test(content));
        }
        if (name === '信息表') {
            return hasHeading(['信息表', '信息卡']) && ((content.match(/^##\s*(?:势力|地点|地点树|物品|物品栏)\s*$/gm) || []).length >= 2
                || /\|\s*(?:势力名|地点|持有人)\s*\|[^\n]*\|/.test(content));
        }
        if (name === '角色列表') {
            return hasHeading(['角色列表', '角色关系网', '人物关系网']) && (/^##\s*(?:角色资料|角色写作画像)\s*$/m.test(content)
                || /^##\s*(?:角色关系|角色关系网)\s*$/m.test(content)
                || /(?:→|->|=>)/.test(content));
        }
        if (name === '关键事件表') {
            return hasHeading(['关键事件表']) && /^##\s*活跃事件\s*$/m.test(content)
                && /^##\s*完成摘要\s*$/m.test(content) && /\|\s*ID\s*\|\s*类型\s*\|/.test(content);
        }
        if (name === '资料索引') {
            return hasHeading(['资料索引']) && /\|\s*文件名\s*\|\s*文件类型\s*\|\s*覆盖范围\s*\|/.test(content)
                && /\|\s*关联事件ID\s*\|/.test(content);
        }
        if (isStageFile(name)) {
            return /^#\s*阶段粗纲[：:]/m.test(content) && /\bS\d{2,}\b/i.test(content + '\n' + name);
        }
        if (name === '拆书设定') {
            return hasHeading(['拆书设定', '拆书', '仿写设定', '仿写']) && (/^>\s*保存时间[：:]/m.test(content)
                || (content.match(/^(?:#{1,3}\s*)?第\s*[零〇一二两三四五六七八九十百千万\d]+\s*章/gm) || []).length >= 2);
        }
        if (['剧本', '分镜', '角色', '场景', '道具'].includes(name)) {
            return hasHeading([name]) && (/^>\s*保存时间[：:]/m.test(content)
                || /剧本总结提示词结构已预留|^##\s*待总结\s*$/m.test(content));
        }
        if (['大纲', '大纲快照', '剧情总览', '母大纲', '母纲', '母大纲原始备份', '母纲备份'].includes(name)) {
            const planningHeadings = content.match(/^#\s*(?:书名备选|母大纲总览|全书阶段规划|设定集内容|信息表内容|角色列表内容)\s*$/gm) || [];
            const chapterHeadings = content.match(/^(?:#{1,3}\s*)?第\s*[零〇一二两三四五六七八九十百千万\d]+\s*章(?:\s*[：:]|\s|$)/gm) || [];
            return hasHeading(['大纲', '大纲快照', '剧情总览', '母大纲', '母纲'])
                || planningHeadings.length >= 2 || chapterHeadings.length >= 2;
        }
        return false;
    }

    function hasExplicitUserMemoryMarker(file) {
        const source = asText(file && file.source).trim().toLowerCase();
        const managedBy = asText(file && file.managedBy).trim().toLowerCase();
        return source === MEMORY_FILE_SOURCE_USER || source === 'upload' || source === 'user' || managedBy === 'user';
    }

    function isExplicitSystemManagedMemoryFile(file) {
        if (hasExplicitUserMemoryMarker(file)) return false;
        const source = asText(file && file.source).trim().toLowerCase();
        const managedBy = asText(file && file.managedBy).trim().toLowerCase();
        return source === MEMORY_FILE_SOURCE_SYSTEM || managedBy === MEMORY_FILE_MANAGER_SYSTEM;
    }

    function isRecognizableLegacySystemMemoryFile(file, folderName, bookName) {
        if (hasExplicitUserMemoryMarker(file) || isExplicitSystemManagedMemoryFile(file)) return false;
        const folder = asText(folderName).trim();
        return LEGACY_SYSTEM_FOLDERS.has(folder)
            && isLegacySystemFileName(bookName, file && file.name, folder)
            && hasLegacySystemContentSignature(bookName, file, folder);
    }

    function isLegacyAmbiguousMemoryFile(file, folderName, bookName) {
        if (hasExplicitUserMemoryMarker(file) || isExplicitSystemManagedMemoryFile(file)) return false;
        return LEGACY_SYSTEM_FOLDERS.has(asText(folderName).trim())
            && isLegacySystemFileName(bookName, file && file.name, folderName)
            && !isRecognizableLegacySystemMemoryFile(file, folderName, bookName);
    }

    function isUserUploadedMemoryFile(file, folderName, bookName) {
        if (hasExplicitUserMemoryMarker(file)) return true;
        if (isExplicitSystemManagedMemoryFile(file)) return false;
        return true;
    }

    function isSystemManagedMemoryFile(file, folderName, bookName) {
        return isExplicitSystemManagedMemoryFile(file);
    }

    function applyCloudRestoreMemoryFile(bookName, bookMemory, cloudFile, fallbackFolder, restoredAt) {
        const memory = bookMemory && typeof bookMemory === 'object' ? bookMemory : {};
        const meta = cloudFile && cloudFile.meta && typeof cloudFile.meta === 'object' ? cloudFile.meta : {};
        const folderName = asText(cloudFile && (cloudFile.folderName || meta.folderName) || fallbackFolder || '关联文件夹').trim() || '关联文件夹';
        if (['__proto__', 'prototype', 'constructor'].includes(folderName.toLowerCase())) {
            throw new Error('云端文件夹名称无效，已停止恢复');
        }
        const fileName = asText(cloudFile && (cloudFile.fileName || cloudFile.name)).trim() || '未命名文件';
        const now = asText(restoredAt).trim() || new Date().toISOString();
        const restored = {
            name: fileName,
            content: asText(cloudFile && cloudFile.content),
            updatedAt: now,
            restoredAt: now
        };
        ['source', 'managedBy', 'createdAt'].forEach(function(field) {
            const value = asText(meta[field] || (cloudFile && cloudFile[field])).trim();
            if (value) restored[field] = value;
        });
        if (!Array.isArray(memory[folderName])) memory[folderName] = [];

        const incomingSystem = isSystemManagedMemoryFile(restored, folderName, bookName);
        const canonicalName = canonicalFileName(bookName, fileName);
        let selectedFolder = '';
        let selectedIndex = -1;
        if (incomingSystem) {
            Object.keys(memory).some(function(folder) {
                const list = Array.isArray(memory[folder]) ? memory[folder] : [];
                const index = list.findIndex(function(file) {
                    return isSystemManagedMemoryFile(file, folder, bookName)
                        && canonicalFileName(bookName, file && file.name) === canonicalName;
                });
                if (index < 0) return false;
                selectedFolder = folder;
                selectedIndex = index;
                return true;
            });
        } else {
            selectedFolder = folderName;
            selectedIndex = memory[folderName].findIndex(function(file) {
                return asText(file && file.name) === fileName
                    && !isSystemManagedMemoryFile(file, folderName, bookName);
            });
        }

        if (selectedIndex >= 0) {
            const current = memory[selectedFolder][selectedIndex] || {};
            memory[selectedFolder][selectedIndex] = { ...current, ...restored };
            return { folderName: selectedFolder, index: selectedIndex, file: memory[selectedFolder][selectedIndex], replaced: true };
        }
        memory[folderName].push(restored);
        return { folderName: folderName, index: memory[folderName].length - 1, file: restored, replaced: false };
    }

    function getSystemMemoryTombstones(bookName, book) {
        const raw = book && book.memoryPolicy && book.memoryPolicy[SYSTEM_MEMORY_TOMBSTONE_FIELD];
        return Array.from(new Set((Array.isArray(raw) ? raw : []).map(function(name) {
            return canonicalFileName(bookName, name);
        }).filter(Boolean))).sort();
    }

    function reconcileSystemMemoryTombstones(bookName, book, bookMemory, deletedCanonicalNames) {
        if (!book || typeof book !== 'object') return [];
        const tombstones = new Set(getSystemMemoryTombstones(bookName, book));
        (Array.isArray(deletedCanonicalNames) ? deletedCanonicalNames : []).forEach(function(name) {
            const canonical = canonicalFileName(bookName, name);
            if (canonical) tombstones.add(canonical);
        });
        Object.keys(bookMemory && typeof bookMemory === 'object' ? bookMemory : {}).forEach(function(folderName) {
            const files = Array.isArray(bookMemory[folderName]) ? bookMemory[folderName] : [];
            files.forEach(function(file) {
                if (!isSystemManagedMemoryFile(file, folderName, bookName)) return;
                tombstones.delete(canonicalFileName(bookName, file && file.name));
            });
        });
        const next = Array.from(tombstones).filter(Boolean).sort();
        if (next.length) {
            book.memoryPolicy = { ...(book.memoryPolicy || {}), [SYSTEM_MEMORY_TOMBSTONE_FIELD]: next };
        } else if (book.memoryPolicy && Object.prototype.hasOwnProperty.call(book.memoryPolicy, SYSTEM_MEMORY_TOMBSTONE_FIELD)) {
            delete book.memoryPolicy[SYSTEM_MEMORY_TOMBSTONE_FIELD];
        }
        return next;
    }

    function memoryFileIdentity(folderName, index, file) {
        return asText(folderName) + ':' + asText(file && file.name) + ':'
            + fingerprint(asText(file && file.updatedAt) + '\n' + asText(file && file.content));
    }

    function isMeaningfulContent(content) {
        const raw = asText(content).trim();
        if (!raw) return false;
        const meaningful = raw.split(/\r?\n/).map(function(line) { return line.trim(); }).filter(function(line) {
            if (!line) return false;
            if (/^#{1,6}\s+/.test(line)) return false;
            if (/^>/.test(line)) return false;
            if (/^\|(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(line)) return false;
            if (/^\|/.test(line) && !/第\s*[零〇一二两三四五六七八九十百千万\d]+\s*章/.test(line)) return false;
            if (/^(?:待填充|待总结|暂无|暂无内容|无|—|-)\s*[。.]?$/.test(line)) return false;
            return true;
        });
        return meaningful.length > 0;
    }

    function fingerprint(value) {
        const text = asText(value);
        let hash = 2166136261;
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(16).padStart(8, '0') + ':' + text.length;
    }

    function comparableJson(value) {
        const serialized = JSON.stringify(value);
        return serialized === undefined ? 'null' : serialized;
    }

    function collectChangedTopLevelKeys(base, desired) {
        const before = base && typeof base === 'object' && !Array.isArray(base) ? base : {};
        const after = desired && typeof desired === 'object' && !Array.isArray(desired) ? desired : {};
        const keys = Array.from(new Set(Object.keys(before).concat(Object.keys(after))));
        return keys.filter(function(key) {
            const beforeHas = Object.prototype.hasOwnProperty.call(before, key);
            const afterHas = Object.prototype.hasOwnProperty.call(after, key);
            return beforeHas !== afterHas || comparableJson(beforeHas ? before[key] : {}) !== comparableJson(afterHas ? after[key] : {});
        });
    }

    function mergeChangedTopLevelKeysDetailed(input) {
        const ctx = input || {};
        const latest = ctx.latest && typeof ctx.latest === 'object' && !Array.isArray(ctx.latest) ? ctx.latest : {};
        const base = ctx.base && typeof ctx.base === 'object' && !Array.isArray(ctx.base) ? ctx.base : {};
        const desired = ctx.desired && typeof ctx.desired === 'object' && !Array.isArray(ctx.desired) ? ctx.desired : {};
        const unsafeNames = ['__proto__', 'prototype', 'constructor'];
        const changedKeys = Array.from(new Set(Array.isArray(ctx.changedKeys) ? ctx.changedKeys.map(asText) : []));
        const next = { ...latest };
        const conflicts = [];
        const appliedKeys = [];
        changedKeys.forEach(function(key) {
            if (!key || unsafeNames.includes(key.toLowerCase())) throw new Error('作品名称不可使用，请换一个名称');
            const baseHas = Object.prototype.hasOwnProperty.call(base, key);
            const latestHas = Object.prototype.hasOwnProperty.call(latest, key);
            const desiredHas = Object.prototype.hasOwnProperty.call(desired, key);
            const baseJson = comparableJson(baseHas ? base[key] : {});
            const latestJson = comparableJson(latestHas ? latest[key] : {});
            const desiredJson = comparableJson(desiredHas ? desired[key] : {});
            const latestMatchesBase = latestHas === baseHas && latestJson === baseJson;
            const latestMatchesDesired = latestHas === desiredHas && latestJson === desiredJson;
            if (!latestMatchesBase && !latestMatchesDesired) {
                conflicts.push(key);
                return;
            }
            if (desiredHas) next[key] = clone(desired[key]);
            else delete next[key];
            appliedKeys.push(key);
        });
        return { value: next, conflicts: conflicts, appliedKeys: appliedKeys };
    }

    function mergeChangedTopLevelKeys(input) {
        const result = mergeChangedTopLevelKeysDetailed(input);
        if (result.conflicts.length) {
            const error = new Error((asText(input && input.label).trim() || '内容') + '“' + result.conflicts[0] + '”已在其他页面更新，本次旧状态未覆盖新内容');
            error.conflictKeys = result.conflicts.slice();
            throw error;
        }
        return result.value;
    }

    function mergeTargetScopedCommit(input) {
        const ctx = input || {};
        const guard = ctx.guard || {};
        const bookName = asText(guard.bookName).trim();
        const deleteTarget = guard.deleteTarget === true;
        const renameTo = asText(guard.renameTo).trim();
        const preserveLatestMemory = guard.preserveLatestMemory === true;
        const unsafeNames = ['__proto__', 'prototype', 'constructor'];
        if (!bookName || unsafeNames.includes(bookName.toLowerCase())) throw new Error('作品名称不可使用，请换一个名称');
        if (renameTo && unsafeNames.includes(renameTo.toLowerCase())) throw new Error('作品名称不可使用，请换一个名称');
        if (!deleteTarget && (!ctx.desiredBook || typeof ctx.desiredBook !== 'object' || Array.isArray(ctx.desiredBook))) {
            throw new Error('待保存作品不存在，已停止保存');
        }
        const latestBooks = ctx.latestBooks && typeof ctx.latestBooks === 'object' && !Array.isArray(ctx.latestBooks) ? ctx.latestBooks : {};
        const latestMemBooks = ctx.latestMemBooks && typeof ctx.latestMemBooks === 'object' && !Array.isArray(ctx.latestMemBooks) ? ctx.latestMemBooks : {};
        const hasBook = Object.prototype.hasOwnProperty.call(latestBooks, bookName);
        const hasMemory = Object.prototype.hasOwnProperty.call(latestMemBooks, bookName);

        if (guard.createOnly === true) {
            if (hasBook || hasMemory) throw new Error('该作品名刚刚已被其他页面使用，请重新选择作品名称');
        } else {
            const expectedBookExists = guard.expectedBookExists === true;
            const expectedMemoryExists = guard.expectedMemoryExists === true;
            const latestBookJson = comparableJson(hasBook ? latestBooks[bookName] : {});
            const latestMemoryJson = comparableJson(hasMemory ? latestMemBooks[bookName] : {});
            const latestBookVersion = fingerprint(latestBookJson);
            const latestMemoryVersion = fingerprint(latestMemoryJson);
            const bookVersionChanged = typeof guard.expectedBookSerialized === 'string'
                ? latestBookJson !== guard.expectedBookSerialized
                : latestBookVersion !== asText(guard.expectedBookVersion);
            const memoryVersionChanged = typeof guard.expectedMemorySerialized === 'string'
                ? latestMemoryJson !== guard.expectedMemorySerialized
                : latestMemoryVersion !== asText(guard.expectedMemoryVersion);
            const changed = hasBook !== expectedBookExists
                || bookVersionChanged
                || (!preserveLatestMemory && (hasMemory !== expectedMemoryExists || memoryVersionChanged));
            if (changed) throw new Error('该作品刚刚已在其他页面更新，当前结果未覆盖新内容，请重新确认后再保存');
        }

        const nextBooks = { ...latestBooks };
        const nextMemBooks = { ...latestMemBooks };
        if (deleteTarget) {
            delete nextBooks[bookName];
            delete nextMemBooks[bookName];
        } else if (renameTo && renameTo !== bookName) {
            if (Object.prototype.hasOwnProperty.call(latestBooks, renameTo) || Object.prototype.hasOwnProperty.call(latestMemBooks, renameTo)) {
                throw new Error('新作品名刚刚已被其他页面使用，请重新选择作品名称');
            }
            delete nextBooks[bookName];
            delete nextMemBooks[bookName];
            nextBooks[renameTo] = clone(ctx.desiredBook);
            if (!preserveLatestMemory && ctx.desiredMemory && typeof ctx.desiredMemory === 'object' && !Array.isArray(ctx.desiredMemory)) {
                nextMemBooks[renameTo] = clone(ctx.desiredMemory);
            }
        } else {
            nextBooks[bookName] = clone(ctx.desiredBook);
            if (!preserveLatestMemory) {
                nextMemBooks[bookName] = clone(ctx.desiredMemory && typeof ctx.desiredMemory === 'object' && !Array.isArray(ctx.desiredMemory)
                    ? ctx.desiredMemory
                    : { '默认文件夹': [] });
            }
        }
        return { books: nextBooks, memBooks: nextMemBooks };
    }

    function flattenMemoryFiles(bookName, memBooks) {
        const bookMemory = memBooks && memBooks[bookName];
        if (!bookMemory || typeof bookMemory !== 'object') return [];
        const files = [];
        Object.keys(bookMemory).forEach(function(folder) {
            const list = Array.isArray(bookMemory[folder]) ? bookMemory[folder] : [];
            list.forEach(function(file, index) {
                files.push({
                    id: memoryFileIdentity(folder, index, file),
                    folder: folder,
                    index: index,
                    name: asText(file && file.name),
                    canonicalName: canonicalFileName(bookName, file && file.name),
                    content: asText(file && file.content),
                    source: asText(file && file.source),
                    managedBy: asText(file && file.managedBy),
                    userUploaded: isUserUploadedMemoryFile(file, folder, bookName),
                    systemManaged: isSystemManagedMemoryFile(file, folder, bookName),
                    legacyAmbiguous: isLegacyAmbiguousMemoryFile(file, folder, bookName),
                    meaningful: isMeaningfulContent(file && file.content),
                    version: fingerprint(asText(file && file.updatedAt) + '\n' + asText(file && file.content))
                });
            });
        });
        return files;
    }

    function isStageFile(name) {
        return /^S\d{2,}阶段粗纲$/i.test(name) || /^阶段粗纲[-_—]/.test(name);
    }

    function selectFiles(files, suffixes, predicate) {
        const names = new Set(Array.isArray(suffixes) ? suffixes : []);
        return files.filter(function(file) {
            if (!file.systemManaged) return false;
            return names.has(file.canonicalName) || (predicate && predicate(file.canonicalName, file));
        });
    }

    function hasMeaningfulBookBody(book) {
        return (book && Array.isArray(book.volumes) ? book.volumes : []).some(function(volume) {
            return (Array.isArray(volume && volume.chapters) ? volume.chapters : []).some(function(chapter) {
                return isMeaningfulContent(chapter && chapter.content);
            });
        });
    }

    function targetRecord(kind, label, target) {
        return {
            kind: kind,
            label: label,
            id: target.id,
            name: target.name || label,
            canonicalName: target.canonicalName || label,
            folder: target.folder || '',
            index: Number.isInteger(target.index) ? target.index : -1,
            version: target.version,
            legacyAmbiguous: target.legacyAmbiguous === true,
            meaningful: target.meaningful !== false
        };
    }

    function addFileGroup(targets, items, label, files, action, requireMeaningful) {
        const visible = files.filter(function(file) { return !requireMeaningful || file.meaningful; });
        if (visible.length) items.push(label);
        files.forEach(function(file) { targets.push({ action: action, ...targetRecord('memory-file', label, file) }); });
    }

    function resolveFeature(value) {
        const raw = asText(value);
        return FEATURE_ALIASES[raw] || raw;
    }

    function getAdvancedStageUpdatedSuffixes(ctx, bookName) {
        const supplied = Array.isArray(ctx && ctx.updatedSuffixes) && ctx.updatedSuffixes.length;
        const source = supplied
            ? ctx.updatedSuffixes
            : ['设定集', '信息表', '角色列表', '关键事件表', '资料索引'];
        return Array.from(new Set(source.map(function(name) {
            return canonicalFileName(bookName, name);
        }).filter(function(name) {
            return !!name && !ROLLING_CARD_NAMES.includes(name);
        })));
    }

    function isProtectedCollisionForFeature(kind, canonicalName, ctx, bookName) {
        const name = asText(canonicalName);
        const fixed = {
            'full-text-import': ['大纲', '大纲快照', '剧情总览', '设定集', '信息表', '角色列表', '追踪表', '边界卡', '承接卡', '关键事件表', '资料索引'],
            'advanced-outline': ['大纲', '剧情总览', '设定集', '信息表', '角色列表', '关键事件表', '资料索引', '追踪表', '边界卡', '承接卡'],
            'normal-outline': ['大纲', '设定集', '信息表', '角色列表', '追踪表', '边界卡', '承接卡', '剧情总览', '关键事件表', '资料索引'],
            'decompose': ['拆书设定', '设定集', '信息表', '角色列表', '追踪表', '边界卡', '承接卡'],
            'script': ['剧本']
        };
        if ((fixed[kind] || []).includes(name)) return true;
        if (kind === 'full-text-import' || kind === 'advanced-outline' || kind === 'normal-outline') return isStageFile(name);
        if (kind !== 'advanced-stage') return false;
        const stageName = canonicalFileName(bookName, ctx.stageFileName || '');
        const updated = getAdvancedStageUpdatedSuffixes(ctx, bookName);
        return name === '大纲' || name === '剧情总览' || (!!stageName && name === stageName) || updated.includes(name);
    }

    function buildOverwritePlan(feature, input) {
        const kind = resolveFeature(feature);
        const copy = OVERWRITE_COPY[kind];
        if (!copy) throw new Error('未知覆盖计划：' + kind);
        const ctx = input || {};
        const bookName = asText(ctx.bookName).trim();
        const book = ctx.book || {};
        const bookId = asText(ctx.bookId || book._bid || book.bookId || book.id).trim();
        if (!bookId) throw new Error('目标作品缺少稳定编号');
        const files = flattenMemoryFiles(bookName, ctx.memBooks || {});
        const replaceItems = [];
        const deleteItems = [];
        const targets = [];
        const by = function(suffixes, predicate) { return selectFiles(files, suffixes, predicate); };
        const meaningfulBy = function(suffixes, predicate) { return by(suffixes, predicate).filter(function(file) { return file.meaningful; }); };
        const outlineVersion = fingerprint(asText(book && book.outline && book.outline.updatedAt) + '\n' + asText(book && book.outline && book.outline.content));
        const bodyVersion = fingerprint(JSON.stringify((book && book.volumes) || []));
        const bookVersion = fingerprint(JSON.stringify(book || {}));
        const memoryBookVersion = fingerprint(JSON.stringify((ctx.memBooks && ctx.memBooks[bookName]) || {}));
        targets.push({ action: 'guard', kind: 'book', label: '作品版本校验', id: 'book:all', name: bookName, version: bookVersion, meaningful: false });
        targets.push({ action: 'guard', kind: 'memory-book', label: '关联资料版本校验', id: 'memory:book', name: '关联资料', version: memoryBookVersion, meaningful: false });

        function addBookOutline(label) {
            if (!isMeaningfulContent(book && book.outline && book.outline.content)) return;
            replaceItems.push(label);
            targets.push({ action: 'replace', kind: 'book-outline', label: label, id: 'book:outline', name: '大纲', version: outlineVersion, meaningful: true });
        }
        function addBookBody(label) {
            if (!hasMeaningfulBookBody(book)) return;
            replaceItems.push(label);
            targets.push({ action: 'replace', kind: 'book-body', label: label, id: 'book:body', name: '正文', version: bodyVersion, meaningful: true });
        }

        if (kind === 'full-text-import') {
            addBookBody('现有正文、分卷和章节目录');
            addBookOutline('大纲（由本次八文件结果重建）');
            addFileGroup(targets, replaceItems, '大纲、旧大纲快照、剧情总览', by(['大纲', '大纲快照', '剧情总览']), 'replace', true);
            addFileGroup(targets, replaceItems, '设定集、信息表、角色列表', by(['设定集', '信息表', '角色列表']), 'replace', true);
            addFileGroup(targets, replaceItems, '追踪表、边界卡、承接卡', by(['追踪表', '边界卡', '承接卡']), 'replace', true);
            addFileGroup(targets, deleteItems, '旧的记忆库大纲文件和阶段粗纲', by(['大纲'], isStageFile), 'delete', false);
            addFileGroup(targets, deleteItems, '旧的关键事件表和资料索引', by(['关键事件表', '资料索引']), 'delete', false);
        } else if (kind === 'advanced-outline') {
            addBookOutline('大纲、剧情总览、阶段粗纲');
            const advancedFiles = by(['大纲', '剧情总览'], isStageFile);
            if (!isMeaningfulContent(book && book.outline && book.outline.content)) addFileGroup(targets, replaceItems, '大纲、剧情总览、阶段粗纲', advancedFiles, 'replace', true);
            else advancedFiles.forEach(function(file) { targets.push({ action: 'replace', ...targetRecord('memory-file', '大纲、剧情总览、阶段粗纲', file) }); });
            addFileGroup(targets, replaceItems, '设定集、信息表、角色列表', by(['设定集', '信息表', '角色列表']), 'replace', true);
            addFileGroup(targets, replaceItems, '关键事件表、资料索引、追踪表、边界卡、承接卡', by(['关键事件表', '资料索引', '追踪表', '边界卡', '承接卡']), 'replace', true);
        } else if (kind === 'advanced-stage') {
            const stageName = canonicalFileName(bookName, ctx.stageFileName || '');
            if (isMeaningfulContent(book && book.outline && book.outline.content)) addBookOutline('作品大纲');
            else targets.push({ action: 'guard', kind: 'book-outline', label: '大纲版本校验', id: 'book:outline', name: '大纲', version: outlineVersion, meaningful: false });
            addFileGroup(targets, replaceItems, '大纲、剧情总览', by(['大纲', '剧情总览']), 'replace', true);
            addFileGroup(targets, replaceItems, stageName || '当前阶段粗纲', by([], function(name) { return !!stageName && name === stageName; }), 'replace', true);
            const updated = getAdvancedStageUpdatedSuffixes(ctx, bookName);
            addFileGroup(targets, replaceItems, '本次涉及的设定集、信息表、角色列表、关键事件表和资料索引', by(updated), 'replace', true);
        } else if (kind === 'normal-outline') {
            addBookOutline('大纲');
            const normalOutlineFiles = by(['大纲']);
            if (!isMeaningfulContent(book && book.outline && book.outline.content)) addFileGroup(targets, replaceItems, '大纲', normalOutlineFiles, 'replace', true);
            else normalOutlineFiles.forEach(function(file) { targets.push({ action: 'replace', ...targetRecord('memory-file', '大纲', file) }); });
            addFileGroup(targets, replaceItems, '设定集、信息表、角色列表', by(['设定集', '信息表', '角色列表']), 'replace', true);
            addFileGroup(targets, replaceItems, '追踪表、边界卡、承接卡', by(['追踪表', '边界卡', '承接卡']), 'replace', true);
            addFileGroup(targets, deleteItems, '旧的剧情总览和阶段粗纲', by(['剧情总览'], isStageFile), 'delete', false);
            addFileGroup(targets, deleteItems, '旧的关键事件表和资料索引', by(['关键事件表', '资料索引']), 'delete', false);
        } else if (kind === 'decompose') {
            addFileGroup(targets, replaceItems, '拆书设定', by(['拆书设定']), 'replace', true);
            addFileGroup(targets, replaceItems, '设定集、信息表、角色列表', by(['设定集', '信息表', '角色列表']), 'replace', true);
            addFileGroup(targets, replaceItems, '追踪表、边界卡、承接卡', by(['追踪表', '边界卡', '承接卡']), 'replace', true);
        } else if (kind === 'script') {
            addFileGroup(targets, replaceItems, '剧本主文件', by(['剧本']), 'replace', true);
        }

        const protectedCollisions = files.filter(function(file) {
            return !file.systemManaged && file.meaningful && isProtectedCollisionForFeature(kind, file.canonicalName, ctx, bookName);
        });
        if (protectedCollisions.length) {
            protectedCollisions.forEach(function(file) {
                targets.push({ action: 'keep', ...targetRecord('memory-file', '受保护的同名文件', file) });
            });
        }

        const dedupe = function(items) { return Array.from(new Set(items)); };
        const plan = {
            feature: kind,
            bookId: bookId,
            bookName: bookName,
            title: copy.title,
            subject: bookName ? '《' + bookName + '》' : '',
            message: copy.message,
            confirmText: copy.confirmText,
            cancelText: '取消',
            replaceItems: dedupe(replaceItems),
            deleteItems: dedupe(deleteItems),
            keepItems: copy.keepItems.slice(),
            targets: targets,
            requiresConfirmation: targets.some(function(target) { return target.action === 'delete' || target.meaningful; }),
            context: {
                stageFileName: asText(ctx.stageFileName),
                updatedSuffixes: kind === 'advanced-stage'
                    ? getAdvancedStageUpdatedSuffixes(ctx, bookName)
                    : (Array.isArray(ctx.updatedSuffixes) ? ctx.updatedSuffixes.slice() : [])
            }
        };
        if (protectedCollisions.length) {
            plan.keepItems.push('同名用户文件或来源不明旧文件（原样保留；系统需要时另建正式文件）');
        }
        plan.keepItems = dedupe(plan.keepItems);
        plan.version = fingerprint(JSON.stringify([
            plan.bookId,
            plan.targets.map(function(target) {
                return [target.action, target.kind, target.id, target.version];
            }).sort()
        ]));
        return deepFreeze(plan);
    }

    function isOverwritePlanCurrent(plan, input) {
        if (!plan || !plan.feature) return false;
        const next = buildOverwritePlan(plan.feature, {
            ...(input || {}),
            stageFileName: plan.context && plan.context.stageFileName,
            updatedSuffixes: plan.context && plan.context.updatedSuffixes
        });
        return next.version === plan.version;
    }

    function assertOverwritePlanApplied(plan, input) {
        const ctx = input || {};
        const bookName = asText(ctx.bookName || plan && plan.bookName).trim();
        const book = ctx.book || {};
        if (!plan || !bookName || asText(book._bid || book.bookId || book.id) !== asText(plan.bookId)) {
            throw new Error('待保存作品与已确认的覆盖范围不一致，已停止保存');
        }
        const files = flattenMemoryFiles(bookName, ctx.memBooks || {});
        const targets = Array.isArray(plan.targets) ? plan.targets : [];
        const keepCounts = new Map();
        const finalCounts = new Map();
        const targetKey = function(target) { return asText(target && target.id) + '|' + asText(target && target.version); };
        targets.filter(function(target) {
            return target.action === 'keep' && target.kind === 'memory-file';
        }).forEach(function(target) {
            const key = targetKey(target);
            keepCounts.set(key, (keepCounts.get(key) || 0) + 1);
        });
        files.filter(function(file) { return !file.systemManaged; }).forEach(function(file) {
            const key = targetKey(file);
            finalCounts.set(key, (finalCounts.get(key) || 0) + 1);
        });
        keepCounts.forEach(function(requiredCount, key) {
            if ((finalCounts.get(key) || 0) < requiredCount) {
                throw new Error('有标记为“不会删除”的文件发生变化，已停止保存');
            }
        });

        targets.forEach(function(target) {
            if (target.action === 'guard' || target.action === 'keep') return;
            if (target.kind === 'book-outline' && target.action === 'replace') {
                if (!isMeaningfulContent(book && book.outline && book.outline.content)) {
                    throw new Error('大纲没有按确认范围完成重建，已停止保存');
                }
                return;
            }
            if (target.kind === 'book-body' && target.action === 'replace') {
                if (!hasMeaningfulBookBody(book)) throw new Error('正文没有按确认范围完成写入，已停止保存');
                return;
            }
            if (target.kind !== 'memory-file') return;
            const canonicalName = asText(target.canonicalName);
            const matches = files.filter(function(file) {
                return file.systemManaged && file.canonicalName === canonicalName;
            });
            if (target.action === 'delete') {
                if (matches.length) throw new Error('“' + canonicalName + '”没有按确认范围删除，已停止保存');
                return;
            }
            if (target.action !== 'replace') return;
            const mayRemoveObsoleteStage = plan.feature === 'advanced-outline' && isStageFile(canonicalName);
            if (!matches.length && mayRemoveObsoleteStage) return;
            if (matches.length !== 1) {
                throw new Error('“' + canonicalName + '”没有按确认范围完成重建，已停止保存');
            }
        });
        return true;
    }

    return Object.freeze({
        CHAPTERS_PER_CALL: CHAPTERS_PER_CALL,
        CHARS_PER_CALL: CHARS_PER_CALL,
        DEFAULT_CHUNK_CHAR_LIMIT: DEFAULT_CHUNK_CHAR_LIMIT,
        ROLLING_CHAPTER_LIMIT: ROLLING_CHAPTER_LIMIT,
        calculateUsage: calculateUsage,
        canonicalFileName: canonicalFileName,
        countValidTextChars: countValidTextChars,
        buildAnalysisChunks: buildAnalysisChunks,
        buildOverwritePlan: buildOverwritePlan,
        fingerprint: fingerprint,
        collectChangedTopLevelKeys: collectChangedTopLevelKeys,
        mergeChangedTopLevelKeys: mergeChangedTopLevelKeys,
        mergeChangedTopLevelKeysDetailed: mergeChangedTopLevelKeysDetailed,
        mergeTargetScopedCommit: mergeTargetScopedCommit,
        getMaxChapterNumber: getMaxChapterNumber,
        getSystemMemoryTombstones: getSystemMemoryTombstones,
        isMeaningfulContent: isMeaningfulContent,
        isExplicitSystemManagedMemoryFile: isExplicitSystemManagedMemoryFile,
        isLegacyAmbiguousMemoryFile: isLegacyAmbiguousMemoryFile,
        isRecognizableLegacySystemMemoryFile: isRecognizableLegacySystemMemoryFile,
        isSystemManagedMemoryFile: isSystemManagedMemoryFile,
        applyCloudRestoreMemoryFile: applyCloudRestoreMemoryFile,
        isUserUploadedMemoryFile: isUserUploadedMemoryFile,
        assertOverwritePlanApplied: assertOverwritePlanApplied,
        isOverwritePlanCurrent: isOverwritePlanCurrent,
        memoryFileIdentity: memoryFileIdentity,
        MEMORY_FILE_MANAGER_SYSTEM: MEMORY_FILE_MANAGER_SYSTEM,
        MEMORY_FILE_SOURCE_SYSTEM: MEMORY_FILE_SOURCE_SYSTEM,
        MEMORY_FILE_SOURCE_USER: MEMORY_FILE_SOURCE_USER,
        normalizeChapterTableRows: normalizeChapterTableRows,
        normalizeAnalysisChapters: normalizeAnalysisChapters,
        orderImportChapters: orderImportChapters,
        parseChapterNumber: parseChapterNumber,
        reconcileSystemMemoryTombstones: reconcileSystemMemoryTombstones,
        shouldUpdateContinuityCurrent: shouldUpdateContinuityCurrent,
        splitTextPreservingAll: splitTextPreservingAll,
        upsertChapterTableRow: upsertChapterTableRow
    });
});
