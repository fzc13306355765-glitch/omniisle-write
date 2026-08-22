(function(window) {
    'use strict';

    const outlineSyncTasks = new Map();
    const recentOutlineSyncs = new Map();
    const RECENT_OUTLINE_SYNC_TTL_MS = 15000;

    function makeOutlineSyncFingerprint(bookName, oldOutline, newOutline) {
        const source = [bookName, oldOutline, newOutline].map(value => String(value || '')).join('\u0000');
        let hash = 2166136261;
        for (let index = 0; index < source.length; index += 1) {
            hash ^= source.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return String(bookName || '') + ':' + source.length + ':' + (hash >>> 0).toString(36);
    }

    async function runSyncModel(modelCfg, systemPrompt, prompt, requestOptions) {
        const resp = await window.callLLMAPI(
            { key: '', base: '', model: '' },
            systemPrompt,
            prompt,
            modelCfg,
            requestOptions
        );
        return resp?.content?.[0]?.text || '';
    }

    async function runSyncModelWithOrdinaryFallback(systemPrompt, prompt, requestOptions) {
        const candidates = typeof window.getOrdinaryModelCandidates === 'function'
            ? window.getOrdinaryModelCandidates().filter(function(candidate) {
                return candidate && !candidate.custom && window.getRequestTier(candidate) !== 'advanced';
            })
            : [];
        if (!candidates.length) throw new Error('没有可用的普通模型');
        const stableRequest = { ...(requestOptions || {}) };
        const requestIdPrefix = String(stableRequest.requestIdPrefix || 'analysis_memory_sync');
        delete stableRequest.requestIdPrefix;
        const makeFallbackRequestId = function() {
            return window.makeRequestId?.(requestIdPrefix)
                || `${requestIdPrefix}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
        };
        stableRequest.requestId = stableRequest.requestId || makeFallbackRequestId();
        let lastError = null;
        for (let index = 0; index < candidates.length; index += 1) {
            try {
                const attemptRequest = { ...stableRequest };
                const result = await runSyncModel(candidates[index], systemPrompt, prompt, attemptRequest);
                if (String(result || '').trim()) return result;
                const emptyError = new Error('AI 同步未返回内容');
                emptyError.code = 'EMPTY_RESPONSE';
                throw emptyError;
            } catch (error) {
                if (window.isAuthExpiredError?.(error)) throw error;
                lastError = error;
                const canRetry = typeof window.shouldRetryMemoryAnalysis === 'function'
                    && window.shouldRetryMemoryAnalysis(error);
                if (!canRetry || index >= candidates.length - 1) throw error;
                if (error?.code === 'EMPTY_RESPONSE') stableRequest.requestId = makeFallbackRequestId();
                window.Utils?.appendLog?.(null, '⚠️ 普通模型临时失败，正在切换下一个普通模型继续同步', 'progress');
            }
        }
        throw lastError || new Error('AI 同步失败');
    }

    async function syncSingleFileChange(bookName, changedFileName, oldContent, newContent, options) {
        const memBooks = window.getMemBooks();
        if (!memBooks[bookName]) return { ok: false, skipped: true, changedCount: 0, failedCards: [] };
        const allSysNames = ['_大纲', '_追踪表', '_边界卡', '_信息卡', '_设定集'];
        const changedSuffix = '_' + changedFileName;
        const explicitReplacements = Array.isArray(options?.replacements) ? options.replacements : [];

        if (explicitReplacements.length) {
            let changedCount = 0;
            for (const suffix of allSysNames) {
                if (suffix === changedSuffix) continue;
                const fileName = bookName + suffix;
                for (const folder in memBooks[bookName]) {
                    const file = (memBooks[bookName][folder] || []).find(item => item.name === fileName || item.name === fileName + '.md');
                    if (!file) continue;
                    const nextContent = applyOutlineReplacements(file.content || '', explicitReplacements);
                    if (nextContent !== file.content) {
                        file.content = nextContent;
                        file.updatedAt = new Date().toISOString();
                        changedCount += 1;
                    }
                    break;
                }
            }
            const saved = await window.sMB(memBooks);
            if (saved === false) {
                window.Utils.appendLog(null, '❌ 关联文件同步结果保存失败，请稍后重试', 'error');
                return { ok: false, changedCount, failedCards: ['本地保存'] };
            }
            window.Utils.appendLog(null, changedCount
                ? '✅ 明确替换已同步到 ' + changedCount + ' 个关联文件'
                : '✅ 其他关联文件中没有找到需要替换的内容', 'success');
            return { ok: true, changedCount, failedCards: [] };
        }

        const failedCards = [];
        let changedCount = 0;

        for (const suffix of allSysNames) {
            if (suffix === changedSuffix) continue;
            const fileName = bookName + suffix;
            let cardFile = null;
            for (const folder in memBooks[bookName]) {
                const found = memBooks[bookName][folder].find((f) => f.name === fileName);
                if (found) { cardFile = found; break; }
            }
            if (!cardFile) continue;

            const cardName = suffix.replace('_', '');
            const prompt = `用户修改了「${changedFileName}」文件。请逐一核对差异并更新「${cardName}」：

${changedFileName}旧内容：${oldContent}

${changedFileName}新内容：${newContent}

当前${cardName}：${cardFile.content}

请执行：
1. 找出${changedFileName}新旧内容之间的所有差异
2. 在${cardName}中找到受影响的段落，逐一修正使其一致
3. 如果新内容新增了信息而${cardName}中缺少，也补充进去

直接输出修正后的${cardName}完整内容。如果完全没有差异，回复"无需修改"。`;

            try {
                const result = await runSyncModelWithOrdinaryFallback('你是专业的小说编辑助手。', prompt);
                if (result && result.trim() && !result.includes('无需修改')) {
                    let cleanResult = result.trim();
                    cleanResult = cleanResult.replace(/^[#\s]*对比[新旧].*?变更[：:][\s\S]*?(?=#{1,3}\s)/, '');
                    cleanResult = cleanResult.replace(/^[#\s]*(以下是?|根据|分析|检测到)[\s\S]*?(?=#{1,3}\s|\*\*)/, '');
                    if (cardFile.content.length > 100 && cleanResult.length < cardFile.content.length * 0.3) {
                        // AI 返回太短时跳过，避免误覆盖完整资料。
                    } else {
                        cardFile.content = cleanResult;
                        cardFile.updatedAt = new Date().toISOString();
                        changedCount += 1;
                        window.Toast.show('✅ ' + cardName + ' 已同步更新');
                    }
                }
            } catch (e) {
                if (window.isAuthExpiredError?.(e)) throw e;
                if (!failedCards.includes(cardName)) failedCards.push(cardName);
                const message = typeof window.formatAiErrorForDisplay === 'function'
                    ? window.formatAiErrorForDisplay(e, cardName + '同步失败')
                    : String(e?.message || e || cardName + '同步失败');
                window.Utils.appendLog(
                    null,
                    '❌ ' + cardName + '同步失败，已保留原内容：' + message,
                    'error'
                );
            }
        }
        const saved = await window.sMB(memBooks);
        if (saved === false) {
            if (!failedCards.includes('本地保存')) failedCards.push('本地保存');
            window.Utils.appendLog(null, '❌ 关联文件同步结果保存失败，请稍后重试', 'error');
        }
        return {
            ok: failedCards.length === 0,
            changedCount,
            failedCards
        };
    }

    function truncateMiddleText(text, maxChars) {
        const str = String(text || '');
        if (str.length <= maxChars) return str;
        const keep = Math.max(100, Math.floor((maxChars - 80) / 2));
        return str.slice(0, keep) + '\n\n......（中间内容过长，已省略，避免请求过大）......\n\n' + str.slice(-keep);
    }

    function collectChangedLinePairs(oldText, newText, maxPairs, maxLineChars) {
        const oldLines = String(oldText || '').replace(/\r\n/g, '\n').split('\n');
        const newLines = String(newText || '').replace(/\r\n/g, '\n').split('\n');
        const total = Math.max(oldLines.length, newLines.length);
        const pairs = [];
        for (let i = 0; i < total; i++) {
            const oldLine = oldLines[i] || '';
            const newLine = newLines[i] || '';
            if (oldLine === newLine) continue;
            if (!oldLine.trim() && !newLine.trim()) continue;
            pairs.push({
                line: i + 1,
                oldLine: maxLineChars ? truncateMiddleText(oldLine, maxLineChars) : oldLine,
                newLine: maxLineChars ? truncateMiddleText(newLine, maxLineChars) : newLine
            });
            if (pairs.length >= maxPairs) break;
        }
        return pairs;
    }

    function buildOutlineDiffBrief(oldOutline, newOutline) {
        const pairs = collectChangedLinePairs(oldOutline, newOutline, 28, 900);
        if (!pairs.length) return '未检测到可描述的行级变化。';
        return pairs.map((p) => [
            '第' + p.line + '行',
            '旧：' + (p.oldLine || '（空）'),
            '新：' + (p.newLine || '（空）')
        ].join('\n')).join('\n\n');
    }

    function extractSimpleOutlineReplacements(oldOutline, newOutline) {
        const pairs = collectChangedLinePairs(oldOutline, newOutline, 80, 0);
        const seen = new Set();
        const replacements = [];
        for (const p of pairs) {
            const oldLine = p.oldLine || '';
            const newLine = p.newLine || '';
            if (!oldLine || !newLine || oldLine.length > 500 || newLine.length > 500) continue;
            let start = 0;
            while (start < oldLine.length && start < newLine.length && oldLine[start] === newLine[start]) start++;
            let oldEnd = oldLine.length - 1;
            let newEnd = newLine.length - 1;
            while (oldEnd >= start && newEnd >= start && oldLine[oldEnd] === newLine[newEnd]) {
                oldEnd--;
                newEnd--;
            }
            const from = oldLine.slice(start, oldEnd + 1).trim();
            const to = newLine.slice(start, newEnd + 1).trim();
            if (!from || !to || from === to) continue;
            if (from.length > 40 || to.length > 40) continue;
            if (/[\r\n]/.test(from + to)) continue;
            const key = from + '->' + to;
            if (seen.has(key)) continue;
            seen.add(key);
            replacements.push({ from, to, line: p.line });
            if (replacements.length >= 20) break;
        }
        return replacements;
    }

    function applyOutlineReplacements(content, replacements) {
        let next = String(content || '');
        let changed = false;
        for (const item of replacements) {
            if (!item.from || item.from === item.to || !next.includes(item.from)) continue;
            next = next.split(item.from).join(item.to);
            changed = true;
        }
        return changed ? next : content;
    }

    function extractSyncedCardContent(rawResult, cardName) {
        let text = String(rawResult || '').trim();
        text = text.replace(/^```(?:markdown|md)?\s*/i, '').replace(/```$/i, '').trim();
        if (!text || /^(NO_CHANGE|无需修改|无须修改)$/i.test(text)) return '';
        const safeCardName = String(cardName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const block = new RegExp('(?:^|\\n)\\s*(?:#{1,6}\\s*)?(?:FILE|文件)\\s*[:：]\\s*' + safeCardName + '\\s*\\n([\\s\\S]*)$', 'i').exec(text);
        if (block) text = block[1].trim();
        if (/^(NO_CHANGE|无需修改|无须修改)$/i.test(text)) return '';
        return text;
    }

    function extractSyncedFileBlocks(rawResult, allowedNames) {
        const text = String(rawResult || '')
            .replace(/^```(?:markdown|md)?\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();
        if (!text || /^(NO_CHANGE|无需修改|无须修改)$/i.test(text)) return {};
        const allowed = new Set((allowedNames || []).map(name => String(name || '').trim()).filter(Boolean));
        const headerRegex = /(?:^|\n)\s*(?:#{1,6}\s*)?(?:FILE|文件)\s*[:：]\s*([^\n\r]+)\s*(?=\n|$)/gim;
        const matches = [];
        let match;
        while ((match = headerRegex.exec(text)) !== null) {
            const name = String(match[1] || '').trim();
            if (allowed.has(name)) matches.push({ name, start: headerRegex.lastIndex, headerStart: match.index });
        }
        const blocks = {};
        matches.forEach(function(item, index) {
            const end = index + 1 < matches.length ? matches[index + 1].headerStart : text.length;
            const content = text.slice(item.start, end).trim();
            if (content && !/^(NO_CHANGE|无需修改|无须修改)$/i.test(content)) blocks[item.name] = content;
        });
        return blocks;
    }

    async function performOutlineChangesToCards(bookName, oldOutline, newOutline, stepLog, options) {
        const memBooks = window.getMemBooks();
        if (!memBooks[bookName]) return { ok: true, changedCount: 0, skipped: true };

        // 和线上测试版保持一致：大纲改动后只同步信息卡和设定集。
        const cardData = {};
        const cardNames = ['_信息卡', '_设定集'];
        const nameMap = { '_信息卡': '信息卡', '_设定集': '设定集' };
        let foundAny = false;
        function findMemoryFileByBaseName(baseName) {
            for (const folder in memBooks[bookName]) {
                const fileList = Array.isArray(memBooks[bookName][folder]) ? memBooks[bookName][folder] : [];
                const found = fileList.find((f) => f.name === baseName || f.name === baseName + '.md');
                if (found) return found;
            }
            return null;
        }
        for (const suffix of cardNames) {
            const fileName = bookName + suffix;
            const found = findMemoryFileByBaseName(fileName);
            if (found) {
                cardData[suffix] = { file: found, name: nameMap[suffix] };
                foundAny = true;
            }
        }
        if (!foundAny) return { ok: true, changedCount: 0, skipped: true };

        window.Utils.appendLog(null, '🧭 正在分析大纲变更并同步关联文件...');
        const explicitReplacements = Array.isArray(options?.replacements) ? options.replacements : [];
        const simpleReplacements = explicitReplacements.length
            ? explicitReplacements
            : extractSimpleOutlineReplacements(oldOutline, newOutline);
        let changedCount = 0;
        if (simpleReplacements.length) {
            for (const suffix of cardNames) {
                if (!cardData[suffix]) continue;
                const file = cardData[suffix].file;
                const nextContent = applyOutlineReplacements(file.content || '', simpleReplacements);
                if (nextContent !== file.content) {
                    file.content = nextContent;
                    file.updatedAt = new Date().toISOString();
                    window.Utils.appendLog(null, '✅ ' + cardData[suffix].name + ' 已按大纲明显改动同步', 'success');
                    changedCount++;
                }
            }
            if (changedCount > 0 || explicitReplacements.length) {
                window.sMB(memBooks);
                window.Utils.appendLog(null, changedCount
                    ? '✅ 大纲变更已同步到 ' + changedCount + ' 个文件'
                    : '✅ 关联文件中没有找到需要替换的内容', 'success');
                return { ok: true, changedCount, deterministic: true };
            }
        }

        const diffBrief = truncateMiddleText(buildOutlineDiffBrief(oldOutline, newOutline), 16000);
        try {
            const fileSections = [];
            for (const suffix of cardNames) {
                if (!cardData[suffix]) continue;
                const cardName = cardData[suffix].name;
                const currentCardContent = cardData[suffix].file.content || '';
                fileSections.push('### ' + cardName + '\n' + truncateMiddleText(currentCardContent, 12000));
            }
            const prompt = [
                '用户修改了小说大纲。请一次判断以下全部关联文件是否需要同步更新。',
                '',
                '【大纲变更摘录】',
                diffBrief,
                '',
                '【关联文件当前内容】',
                fileSections.join('\n\n'),
                '',
                '要求：',
                '1. 如果全部文件都无需修改，只输出：NO_CHANGE',
                '2. 只输出确实需要修改的文件；每个文件使用“FILE: 文件名”开头，下一行开始输出该文件修改后的完整内容。',
                '3. 只同步大纲变更直接影响的信息，不要扩写新设定，也不要输出解释。'
            ].join('\n');
            if (prompt.length > 42000) {
                window.Utils.appendLog(null, '⚠️ 关联文件内容过长，已跳过自动同步，可手动调整', 'warn');
                return { ok: true, changedCount: 0, skipped: true };
            }
            const requestOptions = {
                requestFeature: 'analysis',
                aiAction: 'analysis',
                requestCallUnits: 1,
                requestIdPrefix: 'analysis_outline_sync'
            };
            const result = await runSyncModelWithOrdinaryFallback(
                '你是专业的小说资料维护助手，负责根据大纲变更一次同步全部关联文件。',
                prompt,
                requestOptions
            );
            const blocks = extractSyncedFileBlocks(result, Object.values(nameMap));
            for (const suffix of cardNames) {
                if (!cardData[suffix]) continue;
                const cardName = cardData[suffix].name;
                const currentCardContent = cardData[suffix].file.content || '';
                const content = blocks[cardName] || '';
                if (!content) continue;
                if (currentCardContent.length > 100 && content.length < currentCardContent.length * 0.3) {
                    window.Utils.appendLog(null, '⚠️ ' + cardName + ' 返回内容过短，已保留原文件', 'warn');
                    continue;
                }
                if (content !== currentCardContent) {
                    cardData[suffix].file.content = content;
                    cardData[suffix].file.updatedAt = new Date().toISOString();
                    window.Utils.appendLog(null, '✅ ' + cardName + ' 已同步更新', 'success');
                    changedCount++;
                }
            }

            window.sMB(memBooks);
            if (changedCount > 0) {
                window.Utils.appendLog(null, '✅ 大纲变更已同步到 ' + changedCount + ' 个文件', 'success');
            } else {
                window.Utils.appendLog(null, '所有文件无需修改', 'success');
            }
            return { ok: true, changedCount, modelCalls: 1 };
        } catch (e) {
            console.error('大纲变更同步失败:', e);
            const message = typeof window.formatAiErrorForDisplay === 'function'
                ? window.formatAiErrorForDisplay(e, 'AI同步失败')
                : String(e?.message || e || 'AI同步失败');
            window.Utils.appendLog(null, message, 'error');
            return { ok: false, changedCount: 0, error: e };
        }
    }

    async function syncOutlineChangesToCards(bookName, oldOutline, newOutline, stepLog, options) {
        const oldText = String(oldOutline || '');
        const newText = String(newOutline || '');
        if (!oldText || !newText || oldText === newText) {
            return { ok: true, changedCount: 0, skipped: true };
        }
        const key = makeOutlineSyncFingerprint(bookName, oldText, newText);
        const running = outlineSyncTasks.get(key);
        if (running) return running;

        const recent = recentOutlineSyncs.get(key);
        if (recent && Date.now() - recent.finishedAt < RECENT_OUTLINE_SYNC_TTL_MS) {
            return recent.result;
        }
        recentOutlineSyncs.forEach(function(entry, entryKey) {
            if (Date.now() - entry.finishedAt >= RECENT_OUTLINE_SYNC_TTL_MS) recentOutlineSyncs.delete(entryKey);
        });

        const task = performOutlineChangesToCards(bookName, oldText, newText, stepLog, options)
            .then(function(result) {
                if (result?.ok !== false) recentOutlineSyncs.set(key, { result, finishedAt: Date.now() });
                return result;
            })
            .finally(function() {
                if (outlineSyncTasks.get(key) === task) outlineSyncTasks.delete(key);
            });
        outlineSyncTasks.set(key, task);
        return task;
    }

    window.ZHIYU_MEMORY_SYNC = {
        syncSingleFileChange,
        syncOutlineChangesToCards,
        buildOutlineDiffBrief,
        extractSimpleOutlineReplacements,
        applyOutlineReplacements,
        extractSyncedCardContent,
        extractSyncedFileBlocks
    };
    window.syncSingleFileChange = syncSingleFileChange;
    window.syncOutlineChangesToCards = syncOutlineChangesToCards;
    window.buildOutlineDiffBrief = buildOutlineDiffBrief;
    window.extractSimpleOutlineReplacements = extractSimpleOutlineReplacements;
    window.applyOutlineReplacements = applyOutlineReplacements;
    window.extractSyncedCardContent = extractSyncedCardContent;
    window.extractSyncedFileBlocks = extractSyncedFileBlocks;
})(window);
