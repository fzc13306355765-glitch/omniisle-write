(function(window) {
    'use strict';

    function appendMemoryLog(message, level) {
        const utils = window.ZHIYU_UTILS || window.Utils;
        if (typeof utils?.appendLog === 'function') {
            utils.appendLog(null, message, level);
        }
    }

    function normalizeMemoryFileName(name) {
        return String(name || '').replace(/\.md$/i, '');
    }

    function isSameMemoryFileName(a, b) {
        return normalizeMemoryFileName(a) === normalizeMemoryFileName(b);
    }

    function isExplicitUserMemoryFile(file) {
        const source = String(file?.source || '').trim().toLowerCase();
        const managedBy = String(file?.managedBy || '').trim().toLowerCase();
        return ['user-upload', 'upload', 'user'].includes(source) || managedBy === 'user';
    }

    const MATERIAL_INDEX_FILE_ALIASES = Object.freeze({
        '作品大纲': '大纲',
        '全书大纲': '大纲',
        '全书母大纲': '大纲',
        '母大纲': '大纲',
        '母纲': '大纲',
        '追踪卡': '追踪表',
        '信息卡': '信息表',
        '角色关系网': '角色列表',
        '人物关系网': '角色列表',
        '关键事件': '关键事件表',
    });

    function getMaterialIndexCanonicalFileName(name, bookName) {
        let normalized = normalizeMemoryFileName(name).trim();
        const prefix = String(bookName || '').trim() + '_';
        if (prefix !== '_' && normalized.startsWith(prefix)) normalized = normalized.slice(prefix.length);
        return MATERIAL_INDEX_FILE_ALIASES[normalized] || normalized;
    }

    function normalizeMaterialIndexFileReferences(text, bookName, allowedFileNames) {
        const allowed = Array.from(new Set((allowedFileNames || []).map(normalizeMemoryFileName).filter(Boolean)));
        const filesByCanonicalName = new Map();
        allowed.forEach(function(fileName) {
            const canonicalName = getMaterialIndexCanonicalFileName(fileName, bookName);
            const matches = filesByCanonicalName.get(canonicalName) || [];
            matches.push(fileName);
            filesByCanonicalName.set(canonicalName, matches);
        });
        return String(text || '').split(/\r?\n/).map(function(line) {
            const match = line.match(/^(\s*\|\s*)([^|]+?)(\s*\|.*)$/);
            if (!match) return line;
            const currentName = match[2].trim();
            if (!currentName || currentName === '文件名' || /^:?-{3,}:?$/.test(currentName)) return line;
            if (allowed.includes(normalizeMemoryFileName(currentName))) return line;
            const candidates = filesByCanonicalName.get(getMaterialIndexCanonicalFileName(currentName, bookName)) || [];
            if (candidates.length !== 1) return line;
            return match[1] + candidates[0] + match[3];
        }).join('\n');
    }

    function upsertChapterTableRow(content, row, chapterNum) {
        const nextRow = String(row || '').trim();
        if (!nextRow) return String(content || '');
        const escapedChapter = String(chapterNum || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const rowPattern = new RegExp('^\\|\\s*第?' + escapedChapter + '章\\s*\\|[^\\n]*$', 'm');
        const source = String(content || '').replace(/\s+$/, '');
        return rowPattern.test(source)
            ? source.replace(rowPattern, nextRow)
            : source + '\n' + nextRow;
    }

    function isAssociatedMemoryFolderName(folderName) {
        const name = String(folderName || '');
        if (!name || name === '仿写' || name === '剧本') return false;
        if (typeof window.getMemFolderType === 'function') return window.getMemFolderType(name) === 'associated';
        return name.indexOf('细纲') < 0 && name.indexOf('拆书') < 0;
    }

    function getAssociatedMemoryFolderNames(memBooks, bookName) {
        const bookMem = (memBooks && memBooks[bookName]) || {};
        const folders = Object.keys(bookMem).filter(function(folderName) {
            return Array.isArray(bookMem[folderName]) && isAssociatedMemoryFolderName(folderName);
        });
        return folders.length ? folders : ['默认文件夹'];
    }

    function getAssociatedMemoryDefaultFolder(memBooks, bookName) {
        const bookMem = (memBooks && memBooks[bookName]) || {};
        if (Array.isArray(bookMem['关联文件夹'])) return '关联文件夹';
        if (Array.isArray(bookMem['默认文件夹'])) return '默认文件夹';
        return getAssociatedMemoryFolderNames(memBooks, bookName)[0] || '默认文件夹';
    }

    function getCurrentChapterAllowedEventIds(chapterContent, explicitIds) {
        const detected = String(chapterContent || '').match(/\bF-\d{3,}\b/g) || [];
        const requested = Array.isArray(explicitIds) ? explicitIds : detected;
        const detectedSet = new Set(detected);
        return Array.from(new Set(requested.map(String).filter(id => detectedSet.has(id))));
    }

    function applyCurrentChapterEventIndexRows(files, chapterContent, chapterMeta) {
        if (typeof window.mergeAllowedMemoryTableRows !== 'function') return false;
        const meta = chapterMeta || {};
        const allowedIds = getCurrentChapterAllowedEventIds(chapterContent, meta.allowedEventIds);
        if (!allowedIds.length) return false;
        let changed = false;
        if (files.eventFile && meta.keyEventRows) {
            const next = window.mergeAllowedMemoryTableRows(files.eventFile.content, meta.keyEventRows, allowedIds, 5, meta.chapterNum);
            if (next !== files.eventFile.content) {
                files.eventFile.content = next;
                files.eventFile.updatedAt = new Date().toISOString();
                changed = true;
            }
        }
        if (files.materialFile && meta.materialIndexRows) {
            const next = window.mergeAllowedMemoryTableRows(files.materialFile.content, meta.materialIndexRows, allowedIds, 4);
            if (next !== files.materialFile.content) {
                files.materialFile.content = next;
                files.materialFile.updatedAt = new Date().toISOString();
                changed = true;
            }
        }
        return changed;
    }

    async function updateKeyEventAndMaterialIndexFiles(options) {
        const opts = options || {};
        const sourceContent = String(opts.sourceContent || '');
        const updateEvent = opts.updateEvent !== false;
        const updateMaterial = opts.updateMaterial !== false;
        if (!sourceContent.trim()
            || (!updateEvent && !updateMaterial)
            || (!opts.eventFile && !opts.materialFile)) return false;
        const systemPrompt = '你是知屿写作的资料维护助手。只输出要求的文件内容，不要解释，不要编造。';
        const fileNames = (opts.files || []).map(file => String(file.name || '').replace(/\.md$/i, '')).filter(Boolean);
        const filesBrief = fileNames.map(name => '- ' + name).join('\n');
        let changed = false;

        if (opts.eventFile && updateEvent) {
            const prompt = window.buildKeyEventTablePrompt(opts.bookName, sourceContent, opts.eventFile.content, opts.meta, opts.sourceType);
            try {
                let result = await window.requestMemoryAnalysisWithFallback(opts.modelCfg, systemPrompt, prompt, {
                    label: '关键事件表', fallback: '关键事件表生成失败', requestFeature: 'analysis', requestIdPrefix: 'analysis_key_events', requestTraceGroup: opts.meta?.requestTraceGroup
                });
                let check = window.validateKeyEventTableOutput(result, opts.sourceType, opts.eventFile.content);
                if (!check.ok) {
                    result = await window.retryMemoryCardOutputOnce(result, check.message, () => window.requestMemoryAnalysisWithFallback(
                        opts.modelCfg,
                        systemPrompt + '\n上一次关键事件表未通过格式或事件ID校验，请完整重做。',
                        prompt + '\n\n上一次失败原因：' + check.message,
                        { label: '关键事件表格式重试', fallback: '关键事件表生成失败', requestFeature: 'analysis', requestIdPrefix: 'analysis_key_events_retry', requestTraceGroup: opts.meta?.requestTraceGroup }
                    ));
                    check = window.validateKeyEventTableOutput(result, opts.sourceType, opts.eventFile.content);
                }
                if (!check.ok) throw new Error(check.message);
                opts.eventFile.content = check.content;
                opts.eventFile.updatedAt = new Date().toISOString();
                changed = true;
                appendMemoryLog('🧷 关键事件表已更新', 'success');
            } catch (error) {
                if (window.isAuthExpiredError?.(error)) throw error;
                opts.onFailure?.('关键事件表', error);
                const message = typeof window.formatAiErrorForDisplay === 'function'
                    ? window.formatAiErrorForDisplay(error, '关键事件表更新失败')
                    : String(error?.message || error || '关键事件表更新失败');
                appendMemoryLog('❌ 关键事件表更新失败，已保留原内容：' + message, 'error');
            }
        }

        if (opts.materialFile && updateMaterial) {
            const allowedEventIds = Array.from(new Set(String(opts.eventFile?.content || '').match(/\bF-\d{3,}\b/g) || []));
            const prompt = window.buildMaterialIndexPrompt(
                opts.bookName,
                sourceContent,
                opts.materialFile.content,
                filesBrief,
                opts.meta,
                opts.sourceType,
                allowedEventIds.join('、')
            );
            try {
                let result = await window.requestMemoryAnalysisWithFallback(opts.modelCfg, systemPrompt, prompt, {
                    label: '资料索引', fallback: '资料索引生成失败', requestFeature: 'analysis', requestIdPrefix: 'analysis_material_index', requestTraceGroup: opts.meta?.requestTraceGroup
                });
                result = normalizeMaterialIndexFileReferences(result, opts.bookName, fileNames);
                let check = window.validateMaterialIndexOutput(result, fileNames, allowedEventIds, opts.materialFile.content);
                if (!check.ok) {
                    result = await window.retryMemoryCardOutputOnce(result, check.message, () => window.requestMemoryAnalysisWithFallback(
                        opts.modelCfg,
                        systemPrompt + '\n上一次资料索引未通过真实文件名或事件ID校验，请完整重做。',
                        prompt + '\n\n上一次失败原因：' + check.message,
                        { label: '资料索引格式重试', fallback: '资料索引生成失败', requestFeature: 'analysis', requestIdPrefix: 'analysis_material_index_retry', requestTraceGroup: opts.meta?.requestTraceGroup }
                    ));
                    result = normalizeMaterialIndexFileReferences(result, opts.bookName, fileNames);
                    check = window.validateMaterialIndexOutput(result, fileNames, allowedEventIds, opts.materialFile.content);
                }
                if (!check.ok) throw new Error(check.message);
                opts.materialFile.content = check.content;
                opts.materialFile.updatedAt = new Date().toISOString();
                changed = true;
                appendMemoryLog('🗂️ 资料索引已更新', 'success');
            } catch (error) {
                if (window.isAuthExpiredError?.(error)) throw error;
                opts.onFailure?.('资料索引', error);
                const message = typeof window.formatAiErrorForDisplay === 'function'
                    ? window.formatAiErrorForDisplay(error, '资料索引更新失败')
                    : String(error?.message || error || '资料索引更新失败');
                appendMemoryLog('❌ 资料索引更新失败，已保留原内容：' + message, 'error');
            }
        }
        return changed;
    }

    function createMemoryFilesWorkingCopy(bookName, memoryCandidate) {
        const hasCandidate = !!memoryCandidate
            && typeof memoryCandidate === 'object'
            && !Array.isArray(memoryCandidate);
        if (!hasCandidate) window.ensureMemBook(bookName);
        const source = hasCandidate ? memoryCandidate : (window.getMemBooks() || {});
        const memBooks = JSON.parse(JSON.stringify(source));
        if (!memBooks[bookName]) memBooks[bookName] = { 默认文件夹: [] };
        return memBooks;
    }

    async function generateAllMemoryFiles(bookName, outlineContent, chapterContent, genres, sourceType, chapterMeta) {
        // Background memory work always uses the ordinary-model fallback pool.
        // Keep this value only for compatibility with existing child-module options.
        const modelCfg = null;

        const requestTraceGroup = window.makeRequestId?.('memory_analysis_group')
            || ('memory_analysis_group:' + Date.now());
        const meta = { ...(chapterMeta || {}), requestTraceGroup };
        const retryFailedCards = new Set(Array.isArray(meta.retryFailedCards) ? meta.retryFailedCards : []);
        const retryFailedOnly = retryFailedCards.size > 0;
        const memoryUpdateFailures = [];
        const markMemoryUpdateFailure = function(name) {
            if (name && !memoryUpdateFailures.includes(name)) memoryUpdateFailures.push(name);
        };
        const memoryAnalysisRequestTrace = window.beginSuppressedRequestEstimateLog?.({
            requestFeature: 'summary',
            requestUnits: 1,
            requestCallUnits: 1,
            requestTraceGroup
        }, '记忆库分析');
        try {
        const memBooks = createMemoryFilesWorkingCopy(bookName, meta.memBooksCandidate);
        const defaultFolder = getAssociatedMemoryDefaultFolder(memBooks, bookName);
        if (!memBooks[bookName][defaultFolder]) memBooks[bookName][defaultFolder] = [];
        const todayStr = new Date().toISOString().slice(0, 10);
        const memoryProfileName = meta.memoryProfile || (sourceType === 'chapter' ? 'chapter' : 'normalOutline');
        const profile = window.getMemoryProfile(memoryProfileName);
        const books = window.gB();
        const book = books[bookName];
        const eventIndexEnabled = profile.createEventIndex === true
            || (profile.updateEventIndex === 'existing-advanced-only' && window.isEventIndexEnabledForBook(book));
        const primaryFileName = meta.primaryFileName || '大纲';
        const primaryStageName = primaryFileName === '大纲' ? '大纲阶段' : primaryFileName + '阶段';
        const isNormalOutlineRebuild = sourceType === 'outline'
            && memoryProfileName === 'normalOutline'
            && primaryFileName === '大纲';

        function findExisting(name) {
            const searchFolders = meta.systemFilesFolderOnly === true
                ? [defaultFolder]
                : [defaultFolder].concat(
                    getAssociatedMemoryFolderNames(memBooks, bookName)
                        .filter(folder => folder !== defaultFolder)
                );
            for (const folder of searchFolders) {
                const files = Array.isArray(memBooks[bookName][folder]) ? memBooks[bookName][folder] : [];
                const found = files.find(file =>
                    !isExplicitUserMemoryFile(file)
                    && isSameMemoryFileName(file.name, name)
                );
                if (found) return found;
            }
            return null;
        }

        function findOrCreate(name, initContent) {
            const existing = findExisting(name);
            if (existing) return existing;
            const file = {
                name,
                content: initContent || '',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                source: 'system-generated',
                managedBy: 'zhiyu-writing'
            };
            memBooks[bookName][defaultFolder].push(file);
            return file;
        }

        function validateStructuredMemoryFilesOrThrow() {
            const checks = [
                [`${bookName}_信息表`, window.validateInfoTableOutput],
                [`${bookName}_角色列表`, window.validateRoleListOutput],
            ];
            // 普通大纲可以保留旧的高级资料，但不能让这些停用文件阻断当前保存。
            if (eventIndexEnabled) {
                checks.push(
                    [`${bookName}_关键事件表`, window.validateKeyEventTableOutput],
                    [`${bookName}_资料索引`, window.validateMaterialIndexOutput]
                );
            }
            for (const [name, validator] of checks) {
                if (memoryUpdateFailures.some(failedName => name.includes(failedName))) continue;
                if (typeof validator !== 'function') continue;
                const file = getAssociatedMemoryFolderNames(memBooks, bookName)
                    .flatMap(folder => memBooks[bookName][folder] || [])
                    .find(item => isSameMemoryFileName(item.name, name));
                if (!file) continue;
                const result = validator(file.content);
                if (!result.ok) throw new Error(name + '校验失败：' + result.message);
            }
        }

        async function persistMemoryFilesOrThrow() {
            if (meta.deferPersist === true) return true;
            const persist = meta.atomicPersist === true
                ? window.sMBAtomic
                : window.sMB;
            if (typeof persist !== 'function') {
                throw new Error(meta.atomicPersist === true
                    ? '关联资料原子保存服务尚未加载，请刷新页面后重试'
                    : '关联资料保存服务尚未加载，请刷新页面后重试');
            }
            const saved = await persist(memBooks);
            if (saved === false) throw new Error('本地关联资料保存失败，已保留原有资料，请稍后重试');
            return true;
        }

        // 1. 主文件 —— 保存大纲/拆书内容 + 末尾追加约束块
        if (outlineContent) {
            const outlineFile = findOrCreate(`${bookName}_${primaryFileName}`, outlineContent);
            if (sourceType === 'outline' || !outlineFile.content) {
                const constraintBlock = `\n\n---\n\n## 写作约束（必须遵守）\n- 角色 → 以「${bookName}_角色列表」为准，禁止自行编造\n- 势力/地点/物品 → 以「${bookName}_信息表」为准\n- 世界观/修炼/金手指 → 以「${bookName}_设定集」为准\n- 禁区/下章规划/进度提醒 → 以「${bookName}_边界卡」为准\n- 章节进度/伏笔/角色状态 → 以「${bookName}_追踪表」为准`;
                outlineFile.content = outlineContent + constraintBlock;
                outlineFile.updatedAt = new Date().toISOString();
            }
            appendMemoryLog(
                sourceType === 'outline'
                    ? '📄 ' + primaryFileName + '已创建'
                    : '📄 ' + primaryFileName + '.md 已更新',
                'success'
            );
        }

        // 预生成空文件（即使没有 API key）
        const trackFileName = `${bookName}_追踪表`;
        const boundFileName = `${bookName}_边界卡`;
        const settingFileName = `${bookName}_设定集`;
        const continuityFileName = `${bookName}_承接卡`;

        findOrCreate(trackFileName, `# 追踪表\n\n## 进度总览\n已写章节：0 章（${primaryStageName}）\n最近更新：${todayStr}（已生成${primaryFileName}）\n题材：${genres || ''}\n\n## 已完成章节\n| 章 | 章节进度 | 角色状态变化 | 伏笔追踪 |\n|----|----------|-------------|----------|\n`);
        findOrCreate(boundFileName, `# 边界卡\n\n| 章 | 本章禁区 | 下章规划 | 进度提醒(≤20字) |\n|----|----------|----------|----------------|\n`);
        findOrCreate(settingFileName, `# 设定集\n\n> 世界观、修炼体系、金手指概要、特殊设定（无内容的部分不记录）\n\n`);
        findOrCreate(continuityFileName, window.createContinuityCardSkeleton(todayStr));
        const infoTableFile = findOrCreate(`${bookName}_信息表`, window.createInfoTableSkeleton(todayStr));
        const roleListFile = findOrCreate(`${bookName}_角色列表`, window.createRoleListSkeleton(todayStr));
        const existingRoleValidation = typeof window.validateRoleListOutput === 'function'
            ? window.validateRoleListOutput(roleListFile.content, { requireCurrentFormat: true })
            : { ok: true };
        const normalOutlineInfoSeed = isNormalOutlineRebuild
            ? window.createInfoTableSkeleton(todayStr)
            : infoTableFile.content;
        const normalOutlineRoleSeed = isNormalOutlineRebuild
            ? window.createRoleListSkeleton(todayStr)
            : (existingRoleValidation.ok ? roleListFile.content : window.createRoleListSkeleton(todayStr));
        const legacyInfoCard = findExisting(`${bookName}_信息卡`);
        const hasUsefulRows = content => String(content || '').split(/\r?\n/).some(line => {
            const text = line.trim();
            return /^\|.*\|$/.test(text) && !/^\|\s*(?:---|名称|角色)/.test(text) && !/[（(]待/.test(text);
        });
        const infoLegacyContent = !hasUsefulRows(infoTableFile.content) ? legacyInfoCard?.content || '' : '';
        const roleLegacyContent = [
            !existingRoleValidation.ok ? roleListFile.content : '',
            !hasUsefulRows(roleListFile.content) ? legacyInfoCard?.content || '' : ''
        ].filter(Boolean).join('\n\n');
        let eventFile = null;
        let materialFile = null;
        if (eventIndexEnabled) {
            eventFile = findOrCreate(`${bookName}_关键事件表`, window.createKeyEventTableSkeleton());
            materialFile = findOrCreate(`${bookName}_资料索引`, window.createMaterialIndexSkeleton());
            if (meta.deferPersist !== true && profile.createEventIndex === true && book) {
                window.setEventIndexPolicy(book, true, 'advanced-outline');
            }
            if (sourceType === 'chapter') {
                applyCurrentChapterEventIndexRows({ eventFile, materialFile }, chapterContent, meta);
            }
        }

        if (sourceType === 'outline') {
            appendMemoryLog('📖 设定集已生成', 'success');
        }

        // 自备模型配置不完整时跳过 AI 生成，避免把内容发送到未知地址。
        // 2. 追踪卡.md（大纲阶段只建空表格；章节阶段 AI 生成一行追加）
        const trackFile = findOrCreate(trackFileName, `# 追踪表\n\n## 进度总览\n\n## 已完成章节\n| 章 | 章节进度 | 角色状态变化 | 伏笔追踪 |\n|----|----------|-------------|----------|\n`);
        if (sourceType === 'outline') {
            const todayStr2 = new Date().toISOString().slice(0, 10);
            trackFile.content = `# 追踪表

## 进度总览
已写章节：0 章（大纲阶段）
最近更新：${todayStr2}（已生成${primaryFileName}）
题材：${genres || ''}

## 已完成章节
| 章 | 章节进度 | 角色状态变化 | 伏笔追踪 |
|----|----------|-------------|----------|
`;
            trackFile.updatedAt = new Date().toISOString();
        } else if (chapterContent && (!retryFailedOnly || retryFailedCards.has('追踪表'))) {
            try {
                const trackingContent = await window.generateTrackingEntryFromChapter(bookName, chapterContent, meta);
                if (trackingContent) {
                    const totalChapters = window.countTotalChapters(window.gB()[bookName]);
                    const chNum = meta?.chapterNum || 0;
                    const chName = meta?.chapterName || '';
                    trackFile.content = trackFile.content
                        .replace(/已写章节：\d+ 章/, `已写章节：${totalChapters} 章`)
                        .replace(/最近更新：.*/, `最近更新：第${chNum}章《${chName}》`);
                    trackFile.content = upsertChapterTableRow(trackFile.content, trackingContent, chNum);
                    trackFile.updatedAt = new Date().toISOString();
                    appendMemoryLog('📋 追踪表已更新（第' + (meta?.chapterNum || '?') + '章）', 'success');
                } else {
                    appendMemoryLog('📋 追踪表无需更新（无新内容）', 'success');
                }
            } catch (error) {
                if (window.isAuthExpiredError?.(error)) throw error;
                markMemoryUpdateFailure('追踪表');
            }
        }

        // 3. 边界卡.md（大纲阶段只建空表格；章节阶段 AI 生成一行追加）
        const boundFile = findOrCreate(boundFileName, '# 边界卡\n\n');
        if (sourceType === 'outline') {
            boundFile.content = `# 边界卡

| 章 | 本章禁区 | 下章规划 | 进度提醒(≤20字) |
|----|----------|----------|----------------|
`;
            boundFile.updatedAt = new Date().toISOString();
        } else if (chapterContent && (!retryFailedOnly || retryFailedCards.has('边界卡'))) {
            try {
                const boundaryContent = await window.generateBoundaryEntryFromChapter(bookName, chapterContent, meta);
                if (boundaryContent) {
                    boundFile.content = upsertChapterTableRow(boundFile.content, boundaryContent, meta?.chapterNum || '');
                    boundFile.updatedAt = new Date().toISOString();
                    appendMemoryLog('🚧 边界卡已更新（第' + (meta?.chapterNum || '?') + '章）', 'success');
                } else {
                    appendMemoryLog('🚧 边界卡无需更新（无新内容）', 'success');
                }
            } catch (error) {
                if (window.isAuthExpiredError?.(error)) throw error;
                markMemoryUpdateFailure('边界卡');
            }
        }

        // 4. 承接卡.md（只记录下一章开场需要的短承接，不参与反向同步）
        const continuityFile = findOrCreate(continuityFileName, window.createContinuityCardSkeleton(todayStr));
        if (sourceType === 'outline') {
            continuityFile.content = window.createContinuityCardSkeleton(todayStr);
            continuityFile.updatedAt = new Date().toISOString();
        } else if (chapterContent && (!retryFailedOnly || retryFailedCards.has('承接卡'))) {
            try {
                const continuityData = await window.generateContinuityEntryFromChapter(bookName, chapterContent, meta);
                if (continuityData) {
                    window.updateContinuityCardContent(continuityFile, meta?.chapterNum || '?', meta?.chapterName || '', continuityData);
                    appendMemoryLog('🧭 承接卡已更新（第' + (meta?.chapterNum || '?') + '章，已限长）', 'success');
                } else {
                    appendMemoryLog('🧭 承接卡无需更新（未获取到承接信息）', 'success');
                }
            } catch (error) {
                if (window.isAuthExpiredError?.(error)) throw error;
                markMemoryUpdateFailure('承接卡');
            }
        }

        // 普通大纲超过五万字时，先分段提取事实再汇总；高级大纲和其他入口保持原流程。
        let normalOutlineAnalysis = null;
        let outlineAnalysisSource = outlineContent;
        if (isNormalOutlineRebuild && outlineContent) {
            normalOutlineAnalysis = await window.prepareNormalOutlineMemoryAnalysis({
                bookName,
                outlineContent,
                modelCfg,
                requestTraceGroup
            });
            outlineAnalysisSource = normalOutlineAnalysis.sourceContent || outlineContent;
        }

        // 5. 设定集、非人物信息表、角色列表分别维护，避免重新合成旧版大信息卡。
        if (sourceType === 'outline' && outlineContent) {
            const [settingContent, initInfo, initRoles] = await Promise.all([
                window.generateSettingCard(bookName, outlineAnalysisSource || chapterContent, sourceType, meta),
                window.generateInfoCard(bookName, outlineAnalysisSource, normalOutlineInfoSeed, { chapterName: primaryFileName + '初始化', chapterNum: 0, legacyContent: infoLegacyContent, requestTraceGroup }, null),
                window.generateRoleRelationCard(bookName, outlineAnalysisSource, normalOutlineRoleSeed, {
                    chapterName: primaryFileName + '初始化',
                    chapterNum: 0,
                    legacyContent: roleLegacyContent,
                    compactRoleList: isNormalOutlineRebuild,
                    requestTraceGroup
                })
            ]);
            if (settingContent === null) markMemoryUpdateFailure('设定集');
            if (initInfo === null) markMemoryUpdateFailure('信息表');
            if (initRoles === null) markMemoryUpdateFailure('角色列表');
            if (isNormalOutlineRebuild && ![settingContent, initInfo, initRoles].every(function(value) {
                return typeof value === 'string' && value.trim();
            })) {
                throw new Error('普通大纲关联资料生成未完整返回，已保留原有资料，请稍后重试');
            }
            if (settingContent && settingContent.trim() !== '无变化') {
                const settingFile = findOrCreate(settingFileName,
                    `# 设定集\n\n> 世界观、修炼体系、金手指概要、特殊设定（无内容的部分不记录）\n\n`);
                settingFile.content = `# 设定集\n\n> 基于${primaryFileName}自动生成于 ${todayStr}\n\n${settingContent}`;
                settingFile.updatedAt = new Date().toISOString();
            }
            if (initInfo && initInfo.trim() && initInfo.trim() !== '无变化') {
                infoTableFile.content = initInfo.trim();
                infoTableFile.updatedAt = new Date().toISOString();
            }
            if (initRoles && initRoles.trim() && initRoles.trim() !== '无变化') {
                roleListFile.content = initRoles.trim();
                roleListFile.updatedAt = new Date().toISOString();
            }
        } else if (sourceType === 'chapter' && chapterContent) {
            const [newInfo, newRoles] = await Promise.all([
                !retryFailedOnly || retryFailedCards.has('信息表')
                    ? window.generateInfoCard(bookName, chapterContent, infoTableFile.content, { ...meta, legacyContent: infoLegacyContent }, null)
                    : Promise.resolve('无变化'),
                !retryFailedOnly || retryFailedCards.has('角色列表')
                    ? window.generateRoleRelationCard(bookName, chapterContent, roleListFile.content, { ...meta, legacyContent: roleLegacyContent })
                    : Promise.resolve('无变化')
            ]);
            if (newInfo === null) markMemoryUpdateFailure('信息表');
            if (newRoles === null) markMemoryUpdateFailure('角色列表');
            if (newInfo && newInfo.trim() !== '无变化') {
                infoTableFile.content = newInfo.trim();
                infoTableFile.updatedAt = new Date().toISOString();
            }
            if (newRoles && newRoles.trim() !== '无变化') {
                roleListFile.content = newRoles.trim();
                roleListFile.updatedAt = new Date().toISOString();
            }
        }

        // 6. 设定集按需更新（章节阶段：融合式增量，新规则融入已有内容，不标章节）
        if (sourceType === 'chapter' && chapterContent && (!retryFailedOnly || retryFailedCards.has('设定集'))) {
            const settingFile = findOrCreate(settingFileName, `# 设定集\n\n> 世界观、修炼体系、金手指概要、特殊设定（无内容的部分不记录）\n\n`);
            if (settingFile.content && settingFile.content.length > 50) {
                const newSetting = await window.generateSettingUpdate(bookName, chapterContent, settingFile.content, meta);
                if (newSetting === null) {
                    markMemoryUpdateFailure('设定集');
                } else if (newSetting && newSetting.trim() && newSetting.trim() !== '无' && !newSetting.includes('无新设定')) {
                    settingFile.content = newSetting.trim();
                    settingFile.updatedAt = new Date().toISOString();
                    appendMemoryLog('📖 设定集已更新（融合新设定）', 'success');
                } else {
                    appendMemoryLog('📖 设定集无变化（未发现新设定）', 'success');
                }
            }
        }

        // 7. 仅高级大纲，或已启用高级资料的作品，维护关键事件表和资料索引。
        const updateEventIndex = !retryFailedOnly || retryFailedCards.has('关键事件表');
        const updateMaterialIndex = !retryFailedOnly || retryFailedCards.has('资料索引');
        if (eventIndexEnabled && (updateEventIndex || updateMaterialIndex)) {
            const allMemoryFiles = getAssociatedMemoryFolderNames(memBooks, bookName)
                .flatMap(folder => memBooks[bookName][folder] || []);
            await updateKeyEventAndMaterialIndexFiles({
                bookName,
                sourceContent: outlineContent || chapterContent,
                sourceType,
                meta,
                modelCfg,
                eventFile,
                materialFile,
                files: allMemoryFiles,
                updateEvent: updateEventIndex,
                updateMaterial: updateMaterialIndex,
                onFailure: markMemoryUpdateFailure
            });
        }

        if (meta.requireComplete === true && memoryUpdateFailures.length > 0) {
            throw new Error('关联资料更新未完整完成：' + memoryUpdateFailures.join('、') + '。原有资料已保留，请重试。');
        }
        validateStructuredMemoryFilesOrThrow();
        await persistMemoryFilesOrThrow();
        await window.completeNormalOutlineMemoryAnalysis?.(normalOutlineAnalysis);
        if (meta.deferPersist !== true && profile.createEventIndex === true && book) window.sB(books);
        if (memoryUpdateFailures.length > 0) {
            appendMemoryLog(
                '⚠️ 部分记忆卡未更新：' + memoryUpdateFailures.join('、') + '。正文和其他成功项目已保留，可重新点击“确定使用”重试。',
                'warn'
            );
        }
        if (sourceType !== 'outline') {
            appendMemoryLog('💾 记忆文件已保存', 'success');
        }
        window.finishSuppressedRequestEstimateLog?.(memoryAnalysisRequestTrace, true);
        return { failedCards: memoryUpdateFailures, memBooks };
        } catch (error) {
            window.finishSuppressedRequestEstimateLog?.(memoryAnalysisRequestTrace, false);
            throw error;
        }
    }

    window.ZHIYU_MEMORY_ALL_GENERATOR = {
        generateAllMemoryFiles,
        updateKeyEventAndMaterialIndexFiles,
        createMemoryFilesWorkingCopy,
        normalizeMaterialIndexFileReferences
    };
    window.getAssociatedMemoryFolderNames = window.getAssociatedMemoryFolderNames || getAssociatedMemoryFolderNames;
    window.getAssociatedMemoryDefaultFolder = window.getAssociatedMemoryDefaultFolder || getAssociatedMemoryDefaultFolder;
    window.getFunctionalSharedFolders = window.getFunctionalSharedFolders || getAssociatedMemoryFolderNames;
    window.getFunctionalDefaultFolder = window.getFunctionalDefaultFolder || getAssociatedMemoryDefaultFolder;
    window.getCurrentChapterAllowedEventIds = getCurrentChapterAllowedEventIds;
    window.applyCurrentChapterEventIndexRows = applyCurrentChapterEventIndexRows;
    window.updateKeyEventAndMaterialIndexFiles = updateKeyEventAndMaterialIndexFiles;
    window.normalizeMaterialIndexFileReferences = normalizeMaterialIndexFileReferences;
    window.generateAllMemoryFiles = generateAllMemoryFiles;
})(window);
