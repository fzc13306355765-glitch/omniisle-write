(function(window) {
    'use strict';
    const SYSTEM_REBUILD_NAMES = new Set(['大纲', '剧情总览', '母大纲', '关键事件表', '资料索引', '信息表', '角色列表', '设定集', '追踪表', '边界卡', '承接卡']);
    const SYSTEM_REBUILD_NAME_ALIASES = Object.freeze({
        '作品大纲': '大纲',
        '全书大纲': '大纲',
        '全书母大纲': '大纲',
        '母纲': '母大纲',
        '追踪卡': '追踪表',
        '信息卡': '信息表',
        '角色关系网': '角色列表',
        '人物关系网': '角色列表',
        '关键事件': '关键事件表',
    });
    const USER_MEMORY_FILE_SOURCES = new Set(['user-upload', 'upload', 'user']);
    const AppState = window.ZHIYU_APP_STATE || window.AppState;
    const state = AppState.outline;
    const Toast = window.ZHIYU_TOAST || window.Toast || { warn() {}, success() {} };
    const normalOutlineDraftCacheFailures = new Set();
    const ADVANCED_STAGE_HANDOFF_SCHEMA_VERSION = 2;
    const ADVANCED_STAGE_HANDOFF_TAIL_CHAPTERS = 10;
    function getAdvancedOutlineBookIdentity(bookName) { return window.AccountDataScope.normalizeUid(window.AccountDataScope.getActiveUid?.() || AppState.auth?.uid || 'guest') + ':' + String(bookName || ''); }
    function getAdvancedOutlineDraftKeyPrefix(bookName) { return 'zhiyu_advanced_outline_draft_' + encodeURIComponent(getAdvancedOutlineBookIdentity(bookName)); }
    function getAdvancedOutlineDraftKey(bookName) { return window.AccountDataScope.key(getAdvancedOutlineDraftKeyPrefix(bookName)); }
    function getAdvancedOutlineStageDraftKey(bookName, stageKey) { return window.AccountDataScope.key(getAdvancedOutlineDraftKeyPrefix(bookName) + '_stage_' + String(stageKey || 'unknown')); }
    function getNormalOutlineDraftKey(bookName) { return window.AccountDataScope.key('zhiyu_normal_outline_draft_' + encodeURIComponent(getAdvancedOutlineBookIdentity(bookName))); }
    function getFunctionalOutlineDraftKey(bookName) { return window.AccountDataScope.key('zhiyu_functional_outline_draft_' + encodeURIComponent(getAdvancedOutlineBookIdentity(bookName))); }
    function fallbackAdvancedStageFingerprint(value) {
        const text = String(value || '');
        let hash = 2166136261;
        for (let index = 0; index < text.length; index += 1) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return 'fnv1a-' + (hash >>> 0).toString(16).padStart(8, '0') + '-' + text.length.toString(16);
    }
    async function getAdvancedStageContentFingerprint(value) {
        if (typeof window._sha256Text === 'function') {
            const digest = await window._sha256Text(String(value || ''));
            if (digest) return String(digest).toLowerCase();
        }
        if (window.crypto?.subtle && typeof TextEncoder === 'function') {
            const bytes = new TextEncoder().encode(String(value || ''));
            const digest = await window.crypto.subtle.digest('SHA-256', bytes);
            return Array.from(new Uint8Array(digest)).map(function(byte) {
                return byte.toString(16).padStart(2, '0');
            }).join('');
        }
        return fallbackAdvancedStageFingerprint(value);
    }
    function makeAdvancedStageHandoffSnapshotId() {
        const uuid = window.crypto?.randomUUID?.();
        const randomPart = uuid || (Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
        return 'advanced-stage-handoff-' + String(randomPart).replace(/[^a-z0-9-]/gi, '');
    }
    function saveOutlineDraftValue(key, content) {
        const text = String(content || '').trim();
        if (window.ZHIYU_LARGE_LOCAL_STORE?.set) {
            window.ZHIYU_LARGE_LOCAL_STORE.set(key, text, 'outline_draft').catch(function(error) {
                console.error('大纲草稿保存失败：', error);
            });
        } else {
            localStorage.setItem(key, text);
        }
        localStorage.setItem(key + ':meta', JSON.stringify({ cleared: !text, updatedAt: Date.now() }));
        return text;
    }
    function restoreOutlineDraftValue(key) {
        try {
            const meta = JSON.parse(localStorage.getItem(key + ':meta') || 'null');
            if (meta?.cleared) return '';
        } catch (_e) {}
        return window.ZHIYU_LARGE_LOCAL_STORE?.get?.(key) ?? localStorage.getItem(key) ?? '';
    }
    function clearOutlineDraftValue(key) {
        if (window.ZHIYU_LARGE_LOCAL_STORE?.remove) {
            window.ZHIYU_LARGE_LOCAL_STORE.remove(key).catch(function(error) {
                console.error('大纲草稿删除失败：', error);
            });
        } else {
            localStorage.removeItem(key);
        }
        localStorage.removeItem(key + ':meta');
    }
    function saveNormalOutlineDraft(bookName, content) {
        let targetBook = bookName;
        let targetContent = content;
        if (arguments.length < 2) { targetContent = bookName; targetBook = AppState.chapter.book; }
        const text = String(targetContent || '').trim();
        if (targetBook) {
            const key = getNormalOutlineDraftKey(targetBook);
            if (!normalOutlineDraftCacheFailures.has(key)) {
                try {
                    saveOutlineDraftValue(key, text);
                } catch (error) {
                    normalOutlineDraftCacheFailures.add(key);
                    console.warn('普通大纲草稿缓存失败，生成结果仍保留在当前页面：', error);
                    window.ZHIYU_UTILS?.appendLog?.(
                        null,
                        '⚠️ 浏览器草稿缓存空间不足，当前大纲结果仍已保留；请及时点击“保存到大纲”。',
                        'warn'
                    );
                }
            }
        }
        return text;
    }
    function restoreNormalOutlineDraft(bookName) { return bookName ? restoreOutlineDraftValue(getNormalOutlineDraftKey(bookName)) : ''; }
    function clearNormalOutlineDraft(bookName) {
        if (!bookName) return;
        const key = getNormalOutlineDraftKey(bookName);
        normalOutlineDraftCacheFailures.delete(key);
        clearOutlineDraftValue(key);
    }
    function saveFunctionalOutlineDraft(bookName, content) {
        let targetBook = bookName;
        let targetContent = content;
        if (arguments.length < 2) { targetContent = bookName; targetBook = AppState.chapter.book; }
        const text = String(targetContent || '').trim();
        if (targetBook) saveOutlineDraftValue(getFunctionalOutlineDraftKey(targetBook), text);
        return text;
    }
    function restoreFunctionalOutlineDraft(bookName) { return bookName ? restoreOutlineDraftValue(getFunctionalOutlineDraftKey(bookName)) : ''; }
    function clearFunctionalOutlineDraft(bookName) { if (bookName) clearOutlineDraftValue(getFunctionalOutlineDraftKey(bookName)); }
    function saveAdvancedOutlineDraft(bookName, content) {
        let targetBook = bookName;
        let targetContent = content;
        if (arguments.length < 2) { targetContent = bookName; targetBook = AppState.chapter.book; }
        const text = window.cleanAdvancedOutlineText(targetContent);
        if (targetBook) saveOutlineDraftValue(getAdvancedOutlineDraftKey(targetBook), text);
        return text;
    }
    function restoreAdvancedOutlineDraft(bookName) { return bookName ? restoreOutlineDraftValue(getAdvancedOutlineDraftKey(bookName)) : ''; }
    function clearAdvancedOutlineDraft(bookName) { if (bookName) clearOutlineDraftValue(getAdvancedOutlineDraftKey(bookName)); }
    function saveAdvancedOutlineStageDraft(bookName, stageKey, content) {
        let targetBook = bookName;
        let targetStage = stageKey;
        let targetContent = content;
        if (arguments.length < 3) { targetContent = stageKey; targetStage = bookName; targetBook = AppState.chapter.book; }
        const text = window.cleanAdvancedOutlineText(targetContent);
        if (targetBook && targetStage) saveOutlineDraftValue(getAdvancedOutlineStageDraftKey(targetBook, targetStage), text);
        return text;
    }
    function clearAdvancedOutlineStageDraft(bookName, stageKey) { if (bookName && stageKey) clearOutlineDraftValue(getAdvancedOutlineStageDraftKey(bookName, stageKey)); }
    function looksLikeAdvancedOutlineContent(content) { const text = window.cleanAdvancedOutlineText(content); return /阶段|S\d{2,}|关键事件|全书规划/.test(text) && text.length > 200; }
    function getAdvancedOutlineMasterSource() {
        const snapshot = state.outlineAdvancedMasterSnapshot || '';
        if (snapshot) return snapshot;
        const selected = typeof window.getCheckedOGOutlineText === 'function' ? window.getCheckedOGOutlineText('advanced') : '';
        if (selected) return selected;
        return '';
    }
    function normalizeAdvancedOutlineFileTitle(name, bookName) { return String(name || '').replace(new RegExp('^' + String(bookName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '_'), '').replace(/\.md$/i, ''); }
    function normalizeAdvancedOutlineRebuildName(name, bookName) {
        const normalized = normalizeAdvancedOutlineFileTitle(name, bookName);
        return SYSTEM_REBUILD_NAME_ALIASES[normalized] || normalized;
    }
    function isExplicitUserMemoryFile(file) {
        const source = String(file?.source || '').trim().toLowerCase();
        const managedBy = String(file?.managedBy || '').trim().toLowerCase();
        return USER_MEMORY_FILE_SOURCES.has(source) || managedBy === 'user';
    }
    function isExplicitSystemMemoryFile(file) {
        const source = String(file?.source || '').trim().toLowerCase();
        const managedBy = String(file?.managedBy || '').trim().toLowerCase();
        return source === 'system-generated' || managedBy === 'zhiyu-writing';
    }
    function isAdvancedOutlineSystemFolder(folderName, bookName) {
        const folder = String(folderName || '');
        if (folder === '关联文件夹' || folder === '默认文件夹') return true;
        const normalized = normalizeAdvancedOutlineRebuildName(folder, bookName);
        return SYSTEM_REBUILD_NAMES.has(normalized)
            || /^S\d{2,}阶段粗纲$/i.test(normalized)
            || /^阶段粗纲/.test(normalized);
    }
    function isAdvancedOutlineStorageFile(file, bookName, folderName) {
        if (isExplicitUserMemoryFile(file)) return false;
        const name = normalizeAdvancedOutlineRebuildName(file?.name, bookName);
        const recognized = SYSTEM_REBUILD_NAMES.has(name)
            || /^S\d{2,}阶段粗纲$/i.test(name)
            || /^阶段粗纲/.test(name);
        if (!recognized) return false;
        if (isExplicitSystemMemoryFile(file) || !folderName) return true;
        return isAdvancedOutlineSystemFolder(folderName, bookName);
    }
    function hasAdvancedOutlineStorage(bookName, memBooks) {
        return Object.entries(memBooks?.[bookName] || {}).some(([folder, files]) =>
            Array.isArray(files) && files.some(file => isAdvancedOutlineStorageFile(file, bookName, folder))
        );
    }
    function clearAdvancedOutlineStorageFiles(bookName, memBooks) {
        const book = memBooks?.[bookName];
        if (!book) return memBooks;
        Object.keys(book).forEach(folder => {
            if (!Array.isArray(book[folder])) return;
            const files = book[folder];
            const keptFiles = files.filter(file => !isAdvancedOutlineStorageFile(file, bookName, folder));
            const removedSystemFile = keptFiles.length !== files.length;
            const legacySystemFolder = isAdvancedOutlineSystemFolder(folder, bookName)
                && folder !== '关联文件夹'
                && folder !== '默认文件夹';
            if (removedSystemFile && legacySystemFolder && keptFiles.length === 0) {
                delete book[folder];
                return;
            }
            book[folder] = keptFiles;
        });
        if (!Array.isArray(book['关联文件夹']) && !Array.isArray(book['默认文件夹'])) {
            book['关联文件夹'] = [];
        }
        return memBooks;
    }
    function splitAdvancedOutlineFiles(content) {
        const text = window.cleanAdvancedOutlineText(content);
        const matches = Array.from(text.matchAll(/^#\s*阶段粗纲[:：]\s*([^\n\r]+)/gm));
        if (!matches.length) return { master: text, stages: [] };
        return {
            master: text.slice(0, matches[0].index).trim(),
            stages: matches.map(function(match, index) {
                const title = match[1].trim();
                const key = (title.match(/\bS\d{1,3}\b/i) || [''])[0].toUpperCase().replace(/^S(\d)$/, 'S0$1');
                return { key, title, content: text.slice(match.index, matches[index + 1]?.index || text.length).trim() };
            })
        };
    }
    function getAdvancedStageFileName(content, stageKey) {
        if (stageKey) return stageKey + '阶段粗纲';
        const stage = splitAdvancedOutlineFiles(content).stages[0] || window.extractAdvancedOutlineStages(content)[0];
        return stage?.key ? stage.key + '阶段粗纲' : '阶段粗纲';
    }
    function normalizeAdvancedStageKey(stageKey) {
        const match = String(stageKey || '').trim().toUpperCase().match(/^S(\d{1,3})$/);
        return match ? 'S' + String(Number(match[1])).padStart(2, '0') : '';
    }
    function findAdvancedStageFileRecord(bookName, stageKey, memBooks) {
        const normalizedStageKey = normalizeAdvancedStageKey(stageKey);
        const expectedName = normalizedStageKey + '阶段粗纲';
        const book = memBooks?.[bookName];
        if (!normalizedStageKey || !book) return { file: null, ambiguous: false };
        const tagged = [];
        const legacy = [];
        Object.values(book).forEach(function(files) {
            if (!Array.isArray(files)) return;
            files.forEach(function(file) {
                if (file?.advancedOutlineKind === 'stage-outline' && normalizeAdvancedStageKey(file.advancedStageKey) === normalizedStageKey) {
                    tagged.push(file);
                    return;
                }
                if (normalizeAdvancedOutlineFileTitle(file?.name, bookName) === expectedName) legacy.push(file);
            });
        });
        const candidates = tagged.length ? tagged : legacy;
        if (candidates.length !== 1) return { file: null, ambiguous: candidates.length > 1 };
        return { file: candidates[0], ambiguous: false };
    }
    async function buildAdvancedStageHandoffSnapshot(bookName, stageKey, stageContent, masterContent, options) {
        const normalizedStageKey = normalizeAdvancedStageKey(stageKey);
        if (!normalizedStageKey) throw new Error('阶段编号无效，无法保存承接快照。');
        const cleanStage = window.cleanAdvancedOutlineText(stageContent);
        const cleanMaster = splitAdvancedOutlineFiles(masterContent).master;
        const masterFingerprintSource = slimAdvancedMasterOutline(cleanMaster);
        const validation = validateAdvancedStageSaveContent(cleanStage, cleanMaster, options);
        if (validation.kind !== 'stage' || validation.stageKey !== normalizedStageKey) {
            throw new Error('阶段粗纲与当前阶段编号不一致，无法保存承接快照。');
        }
        const chapters = window.getAdvancedStageChapterEntries(cleanStage);
        if (!chapters.length) throw new Error(normalizedStageKey + '没有可保存的章节粗纲。');
        for (let index = 1; index < chapters.length; index += 1) {
            if (chapters[index].chapterNumber !== chapters[index - 1].chapterNumber + 1) {
                throw new Error(normalizedStageKey + '章号不连续，无法保存承接快照。');
            }
        }
        const stageNo = Number(normalizedStageKey.slice(1));
        return {
            schemaVersion: ADVANCED_STAGE_HANDOFF_SCHEMA_VERSION,
            snapshotId: makeAdvancedStageHandoffSnapshotId(),
            bookIdentity: getAdvancedOutlineBookIdentity(bookName),
            stageKey: normalizedStageKey,
            nextStageKey: 'S' + String(stageNo + 1).padStart(2, '0'),
            masterFingerprint: await getAdvancedStageContentFingerprint(masterFingerprintSource),
            sourceContentFingerprint: await getAdvancedStageContentFingerprint(cleanStage),
            firstChapter: chapters[0].chapterNumber,
            lastChapter: chapters[chapters.length - 1].chapterNumber,
            chapterCount: chapters.length,
            tailChapters: chapters.slice(-ADVANCED_STAGE_HANDOFF_TAIL_CHAPTERS).map(function(chapter) {
                return {
                    chapterNumber: chapter.chapterNumber,
                    title: chapter.title,
                    content: chapter.content,
                };
            }),
            createdAt: new Date().toISOString(),
        };
    }
    async function stabilizeRebuiltAdvancedStageHandoffId(snapshot) {
        const identityFingerprint = await getAdvancedStageContentFingerprint([
            snapshot?.bookIdentity || '',
            snapshot?.stageKey || '',
            snapshot?.masterFingerprint || '',
            snapshot?.sourceContentFingerprint || '',
        ].join('\0'));
        snapshot.snapshotId = 'advanced-stage-handoff-rebuilt-' + identityFingerprint.slice(0, 32);
        return snapshot;
    }
    async function resolveAdvancedStageHandoffSnapshot(bookName, stageKey, masterContent, memBooks) {
        const normalizedStageKey = normalizeAdvancedStageKey(stageKey);
        const books = memBooks || window.getMemBooks();
        const record = findAdvancedStageFileRecord(bookName, normalizedStageKey, books);
        if (record.ambiguous) {
            return { ok: false, reason: '检测到多个' + normalizedStageKey + '阶段粗纲，无法确认哪一份属于当前书籍。请先保留唯一一份后再生成下一阶段。' };
        }
        if (!record.file) {
            return { ok: false, reason: '请先生成并保存' + normalizedStageKey + '阶段粗纲，再生成下一阶段。' };
        }
        const savedContent = window.cleanAdvancedOutlineText(record.file.content);
        const savedStageHeaders = Array.from(savedContent.matchAll(/^#\s*阶段粗纲[:：][^\n\r]*\b(S\d{1,3})\b[^\n\r]*/gmi));
        if (savedStageHeaders.length > 1) {
            return { ok: false, reason: normalizedStageKey + '阶段粗纲包含多个阶段标题，无法确认承接边界。请检查后重新保存。' };
        }
        const savedStageKey = normalizeAdvancedStageKey(savedStageHeaders[0]?.[1] || '');
        if (savedStageKey && savedStageKey !== normalizedStageKey) {
            return { ok: false, reason: normalizedStageKey + '阶段粗纲的文件名与内容阶段不一致，已停止生成以避免串阶段。请检查后重新保存。' };
        }
        const snapshotSourceContent = savedStageKey
            ? savedContent
            : ensureAdvancedStageHeading(savedContent, normalizedStageKey);
        const stored = record.file.advancedStageHandoff;
        const expectedIdentity = getAdvancedOutlineBookIdentity(bookName);
        if (stored && (stored.bookIdentity !== expectedIdentity || normalizeAdvancedStageKey(stored.stageKey) !== normalizedStageKey)) {
            return { ok: false, reason: normalizedStageKey + '承接快照与当前账号或书籍不匹配，已停止生成以避免串书。请重新保存该阶段粗纲。' };
        }
        let currentMasterFingerprint;
        try {
            currentMasterFingerprint = await getAdvancedStageContentFingerprint(
                slimAdvancedMasterOutline(splitAdvancedOutlineFiles(masterContent).master)
            );
        } catch (error) {
            return { ok: false, reason: normalizedStageKey + '母纲校验失败：' + (error?.message || String(error)) };
        }
        if (stored?.schemaVersion === ADVANCED_STAGE_HANDOFF_SCHEMA_VERSION
            && stored.masterFingerprint !== currentMasterFingerprint) {
            return { ok: false, reason: normalizedStageKey + '保存后母纲已经变化。请检查并重新保存该阶段粗纲，再生成下一阶段。' };
        }
        const stageNo = Number(normalizedStageKey.slice(1));
        let expectedStart = 1;
        if (stageNo > 1) {
            const previousStageKey = 'S' + String(stageNo - 1).padStart(2, '0');
            const previousHandoff = await resolveAdvancedStageHandoffSnapshot(bookName, previousStageKey, masterContent, books);
            if (!previousHandoff.ok) {
                return { ok: false, reason: normalizedStageKey + '无法确认实际起点：' + previousHandoff.reason };
            }
            expectedStart = Number(previousHandoff.snapshot?.lastChapter) + 1;
        }
        if (!expectedStart) {
            return { ok: false, reason: normalizedStageKey + '没有可确认的实际起始章，已停止生成。请重新保存该阶段粗纲。' };
        }
        let rebuilt;
        try {
            rebuilt = await buildAdvancedStageHandoffSnapshot(
                bookName,
                normalizedStageKey,
                snapshotSourceContent,
                masterContent,
                { expectedStart }
            );
            await stabilizeRebuiltAdvancedStageHandoffId(rebuilt);
        } catch (error) {
            return { ok: false, reason: normalizedStageKey + '阶段粗纲无法建立承接快照：' + (error?.message || String(error)) };
        }
        if (!stored) return { ok: true, snapshot: rebuilt, rebuilt: true, legacy: true };
        if (stored.schemaVersion !== ADVANCED_STAGE_HANDOFF_SCHEMA_VERSION) {
            return { ok: true, snapshot: rebuilt, rebuilt: true, legacy: false };
        }
        const storedTailMatches = Array.isArray(stored.tailChapters)
            && stored.tailChapters.length === rebuilt.tailChapters.length
            && stored.tailChapters.every(function(chapter, index) {
                const expected = rebuilt.tailChapters[index];
                return Number(chapter?.chapterNumber) === expected.chapterNumber
                    && String(chapter?.title || '') === expected.title
                    && String(chapter?.content || '') === expected.content;
            });
        const storedIsComplete = typeof stored.snapshotId === 'string'
            && stored.snapshotId.startsWith('advanced-stage-handoff-')
            && normalizeAdvancedStageKey(stored.nextStageKey) === rebuilt.nextStageKey
            && Number(stored.firstChapter) === rebuilt.firstChapter
            && Number(stored.lastChapter) === rebuilt.lastChapter
            && Number(stored.chapterCount) === rebuilt.chapterCount
            && storedTailMatches;
        if (!storedIsComplete || stored.sourceContentFingerprint !== rebuilt.sourceContentFingerprint) {
            return { ok: true, snapshot: rebuilt, rebuilt: true, legacy: false };
        }
        return { ok: true, snapshot: stored, rebuilt: false, legacy: false };
    }
    function formatAdvancedStageHandoffContext(snapshot) {
        if (!snapshot?.stageKey || !Number(snapshot.lastChapter)) return '';
        const tail = Array.isArray(snapshot.tailChapters) ? snapshot.tailChapters : [];
        const tailText = tail.map(function(chapter) {
            return String(chapter?.content || '').trim()
                || ('## 第' + Number(chapter?.chapterNumber || 0) + '章：' + String(chapter?.title || '未命名章节'));
        }).filter(Boolean).join('\n\n');
        return [
            '【上一阶段真实承接快照】',
            '快照ID：' + snapshot.snapshotId,
            '上一阶段：' + snapshot.stageKey,
            '上一阶段实际结束：第' + snapshot.lastChapter + '章',
            '本阶段必须从第' + (Number(snapshot.lastChapter) + 1) + '章开始，不得重写上一阶段章节。',
            tailText ? '【上一阶段最后' + tail.length + '章粗纲】\n' + tailText : '',
            '请延续上面的角色状态、冲突、伏笔和场景结果；章节边界以此快照为准。母纲中的章节范围只作为剧情规模参考，不能覆盖快照起点；阶段目标与剧情方向仍以当前母纲为准。',
        ].filter(Boolean).join('\n\n');
    }
    function ensureAdvancedStageHeading(content, stageKey) {
        const clean = window.cleanAdvancedOutlineText(content);
        const expectedStageKey = normalizeAdvancedStageKey(stageKey);
        if (!expectedStageKey) return clean;
        const body = clean.replace(/^#\s*阶段粗纲[:：][^\n\r]*$/gmi, '').trim();
        return window.cleanAdvancedOutlineText('# 阶段粗纲：' + expectedStageKey + (body ? '\n\n' + body : ''));
    }

    function splitTopLevelMarkdownSections(text) {
        const source = window.cleanAdvancedOutlineText(text);
        const matches = Array.from(source.matchAll(/^#\s+([^\n\r]+)\s*$/gm));
        if (!matches.length) return [{ title: '', content: source }];
        return matches.map(function(match, index) {
            return { title: match[1].trim(), content: source.slice(match.index, matches[index + 1]?.index || source.length).trim() };
        });
    }

    function slimAdvancedMasterOutline(masterContent) {
        const archived = new Set(['设定集内容', '信息表内容', '信息卡内容', '角色列表内容', '角色关系网内容', '关键事件表初版', '资料索引初版']);
        return window.cleanAdvancedOutlineText(splitTopLevelMarkdownSections(masterContent)
            .filter(function(section) { return !archived.has(section.title); })
            .map(function(section) { return section.content; })
            .join('\n\n'));
    }

    function buildAdvancedOutlinePersistContent(aggregateContent) {
        const parts = splitAdvancedOutlineFiles(aggregateContent);
        return {
            rawMaster: parts.master,
            slimMaster: slimAdvancedMasterOutline(parts.master),
            stages: parts.stages,
            hasStages: parts.stages.length > 0,
            aggregateContent: window.cleanAdvancedOutlineText([parts.master].concat(parts.stages.map(function(stage) { return stage.content; })).filter(Boolean).join('\n\n'))
        };
    }

    function validateAdvancedStageSaveContent(content, masterContent, options) {
        const clean = window.cleanAdvancedOutlineText(content);
        const stageHeaders = Array.from(clean.matchAll(/^#\s*阶段粗纲[:：][^\n\r]*\b(S\d{1,3})\b[^\n\r]*/gmi));
        if (!stageHeaders.length) {
            const masterValidation = window.validateAdvancedMasterStagePlanning(clean);
            if (!masterValidation.ok) throw new Error(masterValidation.reason);
            return { kind: 'master', stageKey: '', firstChapter: 0, lastChapter: 0 };
        }
        if (stageHeaders.length !== 1) throw new Error('阶段粗纲必须且只能包含一个S编号阶段。');
        const masterValidation = window.validateAdvancedMasterStagePlanning(masterContent);
        if (!masterValidation.ok) throw new Error('当前母纲不符合阶段与卷规则：' + masterValidation.reason);
        const stageKey = 'S' + String(Number(stageHeaders[0][1].slice(1))).padStart(2, '0');
        const numbers = window.getAdvancedStageChapterNumbers(clean);
        if (!numbers.length) throw new Error(stageKey + '阶段粗纲没有识别到章节标题。');
        for (let index = 1; index < numbers.length; index += 1) {
            if (numbers[index] !== numbers[index - 1] + 1) throw new Error(stageKey + '章号不连续：第' + numbers[index - 1] + '章后识别到第' + numbers[index] + '章。');
        }
        const stagePlan = window.extractAdvancedOutlineStages(masterContent).find(function(stage) { return stage.key === stageKey; });
        if (!stagePlan) throw new Error('大纲中没有找到' + stageKey + '阶段规划。');
        const expectedStart = Math.max(0, Number(options?.expectedStart) || Number(stagePlan.startChapter) || 0);
        if (expectedStart && numbers[0] !== expectedStart) throw new Error(stageKey + '应从第' + expectedStart + '章开始。');
        const completeness = window.validateAdvancedStageCompleteness(clean, stagePlan, expectedStart || numbers[0]);
        if (!completeness.ok) throw new Error(completeness.reason);
        const allowedIds = new Set(window.getOutlineEventIds(stagePlan.block));
        const unknownIds = window.getOutlineEventIds(clean).filter(function(id) { return !allowedIds.has(id); });
        if (unknownIds.length) throw new Error(stageKey + '使用了大纲未规划的事件ID：' + unknownIds.join('、') + '。');
        return {
            kind: 'stage',
            stageKey,
            firstChapter: numbers[0],
            lastChapter: numbers[numbers.length - 1],
            chapterWarning: String(completeness.warning || ''),
        };
    }

    function mergeAdvancedStageIntoOutline(outlineContent, stageContent) {
        const incoming = window.cleanAdvancedOutlineText(stageContent);
        const incomingStage = splitAdvancedOutlineFiles(incoming).stages[0];
        if (!incomingStage?.key) return window.cleanAdvancedOutlineText(outlineContent);
        const parts = splitAdvancedOutlineFiles(outlineContent);
        const stages = parts.stages.filter(function(stage) { return stage.key !== incomingStage.key; });
        stages.push(incomingStage);
        stages.sort(function(left, right) { return left.key.localeCompare(right.key, 'en'); });
        return window.cleanAdvancedOutlineText([parts.master].concat(stages.map(function(stage) { return stage.content; })).filter(Boolean).join('\n\n'));
    }

    function upsertAdvancedStageFile(bookName, stageKey, content, memBooks, options) {
        const candidate = memBooks || {};
        if (!candidate[bookName]) candidate[bookName] = { 默认文件夹: [] };
        const folder = Array.isArray(candidate[bookName]['关联文件夹']) ? '关联文件夹' : '默认文件夹';
        const list = candidate[bookName][folder] || (candidate[bookName][folder] = []);
        const normalizedStageKey = normalizeAdvancedStageKey(stageKey);
        const name = normalizedStageKey + '阶段粗纲';
        const now = new Date().toISOString();
        const existing = list.find(function(file) {
            return !isExplicitUserMemoryFile(file)
                && normalizeAdvancedOutlineFileTitle(file.name, bookName) === name;
        });
        if (existing) {
            existing.content = content;
            existing.updatedAt = now;
            existing.source = 'system-generated';
            existing.managedBy = 'zhiyu-writing';
            existing.advancedOutlineKind = 'stage-outline';
            existing.advancedStageKey = normalizedStageKey;
            if (options?.handoffSnapshot) existing.advancedStageHandoff = options.handoffSnapshot;
        } else {
            list.push({
                name: bookName + '_' + name,
                content,
                createdAt: now,
                updatedAt: now,
                source: 'system-generated',
                managedBy: 'zhiyu-writing',
                advancedOutlineKind: 'stage-outline',
                advancedStageKey: normalizedStageKey,
                advancedStageHandoff: options?.handoffSnapshot || null,
            });
        }
        return candidate;
    }
    async function persistAdvancedOutlineFiles(bookName, content, memBooks, options) {
        const candidate = JSON.parse(JSON.stringify(memBooks || window.getMemBooks() || {}));
        if (!candidate[bookName]) candidate[bookName] = { 默认文件夹: [] };
        const folder = Array.isArray(candidate[bookName]['关联文件夹']) ? '关联文件夹' : '默认文件夹';
        if (!Array.isArray(candidate[bookName][folder])) candidate[bookName][folder] = [];
        const files = buildAdvancedOutlinePersistContent(content);
        const now = new Date().toISOString();
        const upsert = function(name, fileContent) {
            const list = candidate[bookName][folder];
            const fullName = bookName + '_' + name;
            const existing = list.find(file =>
                !isExplicitUserMemoryFile(file)
                && normalizeAdvancedOutlineFileTitle(file.name, bookName) === name
            );
            if (existing) {
                existing.content = fileContent;
                existing.updatedAt = now;
                existing.source = 'system-generated';
                existing.managedBy = 'zhiyu-writing';
            } else {
                list.push({
                    name: fullName,
                    content: fileContent,
                    createdAt: now,
                    updatedAt: now,
                    source: 'system-generated',
                    managedBy: 'zhiyu-writing',
                });
            }
        };
        upsert('大纲', files.aggregateContent);
        upsert('剧情总览', files.slimMaster);
        files.stages.forEach(stage => upsert(stage.key + '阶段粗纲', stage.content));
        if (options?.deferPersist !== true) {
            const persist = window.sMBAtomic || window.sMB;
            if (typeof persist !== 'function') throw new Error('高级大纲保存服务尚未加载，请刷新页面后重试');
            const saved = await persist(candidate);
            if (saved === false) throw new Error('高级大纲保存失败，原有资料已保留，请稍后重试');
        }
        return { candidate, parts: files };
    }
    async function commitAdvancedOutlineState(books, memBooks, expectedUid) {
        const storage = window.ZHIYU_STORAGE_SERVICE;
        const scope = window.AccountDataScope;
        const activeUid = String(scope?.getActiveUid?.() || '');
        if (!expectedUid || activeUid !== expectedUid) {
            throw new Error('账号已经切换，本次保存未写入其他账号');
        }
        if (!storage?.commitBooksAndMemory || !scope?.key || !window.replaceMemBooksSnapshot) {
            throw new Error('高级大纲原子保存服务尚未加载，请刷新页面后重试');
        }
        const committed = await storage.commitBooksAndMemory(
            books,
            scope.key('mem_books', expectedUid),
            memBooks,
            expectedUid
        );
        if (!committed) throw new Error('高级大纲保存失败，原有作品和资料均已保留，请稍后重试');
        if (window.replaceMemBooksSnapshot(memBooks, expectedUid) !== true) {
            throw new Error('高级大纲已经保存，但当前账号缓存未刷新，请刷新页面后查看');
        }
        window._zhiyuLastBooksSaveTask = Promise.resolve(true);
        window._triggerCloudSync?.();
        return true;
    }
    async function saveAdvancedOutlineToMemory() {
        const bookName = AppState.chapter.book;
        if (!bookName) { Toast.warn('请先选择书籍'); return false; }
        const accountUid = String(window.AccountDataScope?.getActiveUid?.() || AppState.auth?.uid || '');
        const bookIdentity = getAdvancedOutlineBookIdentity(bookName);
        const stageIdentity = state.advancedOutputKind === 'stage' ? state.advancedStageIdentity : null;
        const outputIsStage = !!(stageIdentity?.key && state.advancedStageContent);
        let raw = window.cleanAdvancedOutlineText(outputIsStage ? state.advancedStageContent : (state.advancedContent || document.getElementById('outlineResultBox')?.textContent || ''));
        if (outputIsStage) raw = ensureAdvancedStageHeading(raw, stageIdentity.key);
        if (!raw) { Toast.warn('暂无高级大纲内容'); return false; }
        const master = getAdvancedOutlineMasterSource();
        const current = window.getMemBooks();
        let stageExpectedStart = 0;
        if (outputIsStage) {
            const stageKey = normalizeAdvancedStageKey(stageIdentity.key);
            const stageNo = Number(stageKey.slice(1));
            if (stageNo > 1) {
                const previousStageKey = 'S' + String(stageNo - 1).padStart(2, '0');
                const previousHandoff = await resolveAdvancedStageHandoffSnapshot(bookName, previousStageKey, master, current);
                if (getAdvancedOutlineBookIdentity(String(AppState.chapter.book || '')) !== bookIdentity) {
                    Toast.warn('账号或书籍已经切换，本次保存已停止，请重新选择后再试。');
                    return false;
                }
                if (!previousHandoff.ok) {
                    Toast.warn(previousHandoff.reason);
                    return false;
                }
                stageExpectedStart = Number(previousHandoff.snapshot?.lastChapter) + 1;
            } else {
                stageExpectedStart = 1;
            }
        }
        const validation = validateAdvancedStageSaveContent(
            raw,
            master || raw,
            stageExpectedStart ? { expectedStart: stageExpectedStart } : null
        );
        const stageOnly = validation.kind === 'stage';
        let candidate = JSON.parse(JSON.stringify(current));
        if (!stageOnly && hasAdvancedOutlineStorage(bookName, current)) {
            const confirmApi = window.ZHIYU_CONFIRM || window.Confirm;
            if (typeof confirmApi?.show !== 'function') {
                throw new Error('保存确认组件尚未加载，请刷新页面后重试');
            }
            const confirmed = await confirmApi.show('保存后，系统会按新大纲重新生成以下关联文件。', {
                variant: 'outline-rebuild',
                title: '保存并重建高级大纲',
                subject: '《' + bookName + '》',
                replaceItems: ['大纲、剧情总览、阶段粗纲', '设定集、信息表、角色列表', '关键事件表、资料索引、追踪表、边界卡、承接卡'],
                keepItems: ['正文', '章节细纲', '拆书章节', '用户上传文件'],
                confirmText: '继续保存',
                cancelText: '取消'
            });
            if (!confirmed) return false;
            candidate = clearAdvancedOutlineStorageFiles(bookName, candidate);
        }
        let finalContent = raw;
        if (stageOnly) {
            const stageKey = validation.stageKey || stageIdentity?.key;
            const handoffSnapshot = await buildAdvancedStageHandoffSnapshot(
                bookName,
                stageKey,
                raw,
                master,
                { expectedStart: stageExpectedStart || validation.firstChapter }
            );
            finalContent = mergeAdvancedStageIntoOutline(master, raw);
            upsertAdvancedStageFile(bookName, stageKey, raw, candidate, { handoffSnapshot });
        } else {
            const logUtils = window.ZHIYU_UTILS || window.Utils || {};
            let associatedFilesWaitLogToken = '';
            try {
                if (typeof logUtils.beginExecutionLogWait === 'function') {
                    associatedFilesWaitLogToken = logUtils.beginExecutionLogWait('分析关联文件', 'progress');
                }
                if (!associatedFilesWaitLogToken) {
                    logUtils.appendLog?.(null, '分析关联文件', 'progress');
                }
                const generated = await window.generateAllMemoryFiles(
                    bookName,
                    raw,
                    null,
                    (state.genres || []).join('、'),
                    'outline',
                    {
                        primaryFileName: '大纲',
                        memoryProfile: 'advancedOutline',
                        requireComplete: true,
                        deferPersist: true,
                        systemFilesFolderOnly: true,
                        memBooksCandidate: candidate,
                    }
                );
                candidate = generated?.memBooks || candidate;
            } finally {
                if (associatedFilesWaitLogToken && typeof logUtils.endExecutionLogWait === 'function') {
                    logUtils.endExecutionLogWait(associatedFilesWaitLogToken);
                }
            }
        }
        if (getAdvancedOutlineBookIdentity(String(AppState.chapter.book || '')) !== bookIdentity) {
            Toast.warn('账号或书籍已经切换，本次保存已停止，请重新选择后再试。');
            return false;
        }
        const persisted = await persistAdvancedOutlineFiles(
            bookName,
            finalContent,
            candidate,
            { deferPersist: true }
        );
        const books = JSON.parse(JSON.stringify(window.gB() || {}));
        if (!books[bookName]) throw new Error('当前作品不存在，已停止保存');
        books[bookName].outline = {
            content: persisted.parts.aggregateContent,
            updatedAt: new Date().toISOString()
        };
        window.setEventIndexPolicy(books[bookName], true, 'advanced-outline');
        await commitAdvancedOutlineState(books, persisted.candidate, accountUid);
        state.advancedContent = persisted.parts.aggregateContent;
        if (!stageOnly) {
            clearAdvancedOutlineDraft(bookName);
        } else {
            clearAdvancedOutlineStageDraft(bookName, validation.stageKey || stageIdentity?.key);
        }
        if (typeof window.refreshTree === 'function') {
            try {
                window.refreshTree();
            } catch (error) {
                console.warn('高级大纲已保存，但章节目录刷新失败：', error);
                (window.ZHIYU_UTILS || window.Utils)?.appendLog?.(null, '⚠️ 高级大纲已保存，但章节目录刷新失败，请手动刷新页面。', 'warn');
            }
        }
        window.updateAdvancedOutlineStageOptions?.();
        if (stageOnly && validation.chapterWarning) {
            (window.ZHIYU_UTILS || window.Utils)?.appendLog?.(null, '⚠️ ' + validation.chapterWarning, 'warn');
            Toast.warn('阶段粗纲已保存。' + validation.chapterWarning);
        } else {
            Toast.success(stageOnly ? '阶段粗纲已保存' : '高级大纲已保存');
        }
        window._scheduleReliableCloudBackup?.('save-advanced-outline');
        return true;
    }
    Object.assign(window, { getAdvancedOutlineBookIdentity, getAdvancedOutlineDraftKeyPrefix, getAdvancedOutlineDraftKey, getAdvancedOutlineStageDraftKey, getNormalOutlineDraftKey, getFunctionalOutlineDraftKey, saveNormalOutlineDraft, restoreNormalOutlineDraft, clearNormalOutlineDraft, saveFunctionalOutlineDraft, restoreFunctionalOutlineDraft, clearFunctionalOutlineDraft, saveAdvancedOutlineDraft, restoreAdvancedOutlineDraft, clearAdvancedOutlineDraft, saveAdvancedOutlineStageDraft, clearAdvancedOutlineStageDraft, looksLikeAdvancedOutlineContent, getAdvancedOutlineMasterSource, normalizeAdvancedOutlineFileTitle, normalizeAdvancedOutlineRebuildName, isExplicitUserMemoryFile, isAdvancedOutlineStorageFile, hasAdvancedOutlineStorage, clearAdvancedOutlineStorageFiles, splitAdvancedOutlineFiles, splitTopLevelMarkdownSections, slimAdvancedMasterOutline, buildAdvancedOutlinePersistContent, ensureAdvancedStageHeading, validateAdvancedStageSaveContent, mergeAdvancedStageIntoOutline, findAdvancedStageFileRecord, buildAdvancedStageHandoffSnapshot, resolveAdvancedStageHandoffSnapshot, formatAdvancedStageHandoffContext, upsertAdvancedStageFile, getAdvancedStageFileName, persistAdvancedOutlineFiles, commitAdvancedOutlineState, saveAdvancedOutlineToMemory });
})(window);
