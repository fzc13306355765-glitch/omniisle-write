(function(window) {
    'use strict';

    const OUTLINE_CHAPTER_WORDS = 2500;
    const OUTLINE_TARGET_WORDS = Object.freeze({ short: 150000, medium: 500000, long: 1000000, xlong: 2000000 });
    const OUTLINE_EVENT_ID_CHAPTER_INTERVAL = 20;
    const OUTLINE_EVENT_ID_MAX = 15;
    const OUTLINE_EVENT_ID_MENTIONS_PER_ID_MAX = 3;
    const OUTLINE_SCALE_PROFILES = Object.freeze({
        short: Object.freeze({ label: '短篇/短中篇小说', structure: '故事集中推进，开端、发展、高潮和结尾紧凑完整。', masterSegments: 1 }),
        medium: Object.freeze({ label: '中篇小说', structure: '主线、人物成长、阶段目标和中期转折都留出空间。', masterSegments: 1 }),
        long: Object.freeze({ label: '长篇网文/长篇小说', structure: '包含开局成长、中期扩展、多轮阶段目标和后期收束。', masterSegments: 3 }),
        xlong: Object.freeze({ label: '超长篇网文', structure: '主线分层展开，世界观、势力和人物成长逐步扩展。', masterSegments: 3 }),
    });

    function chineseToNumber(raw) {
        const source = String(raw || '').trim();
        if (/^\d+$/.test(source)) return Number(source);
        const digits = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
        const units = { 十: 10, 百: 100, 千: 1000, 万: 10000 };
        let total = 0;
        let section = 0;
        let number = 0;
        for (const char of source) {
            if (Object.prototype.hasOwnProperty.call(digits, char)) {
                number = digits[char];
                continue;
            }
            const unit = units[char];
            if (!unit) return 0;
            if (unit === 10000) {
                section += number;
                total += (section || 1) * unit;
                section = 0;
            } else {
                section += (number || 1) * unit;
            }
            number = 0;
        }
        return total + section + number;
    }

    function normalizeOutlineChapterHeadingNumbers(text) {
        return String(text || '').replace(/(^|\n)(\s*(?:[-*+]\s*)?(?:#{0,6}\s*)?[《【\[]?\s*)第\s*([零〇两一二三四五六七八九十百千万\d]+)\s*(章|回|节)([】》\]]?[：:\s、.-]?)/g, function(all, lineStart, prefix, rawNo, unit, suffix) {
            const chapterNo = chineseToNumber(rawNo);
            if (!Number.isFinite(chapterNo) || chapterNo <= 0 || /^\d+$/.test(String(rawNo || ''))) return all;
            return lineStart + prefix + '第' + chapterNo + unit + suffix;
        });
    }

    function cleanAdvancedOutlineText(text) {
        const reasoningSafe = typeof window.stripOutlineReasoningText === 'function'
            ? window.stripOutlineReasoningText(text)
            : String(text || '').replace(/<think(?:\s[^>]*)?>[\s\S]*?<\/think\s*>/gi, '');
        const stripped = String(reasoningSafe || '').replace(/^```(?:markdown|md|text)?\s*/i, '').replace(/```$/i, '').trim();
        return normalizeOutlineChapterHeadingNumbers(stripped);
    }

    function getAdvancedOutlineWcKey() {
        return document.querySelector('#outlineModal .wordcount-option.selected')?.dataset.wc || 'short';
    }

    function getOutlineTargetWords(wcKey) { return OUTLINE_TARGET_WORDS[wcKey] || OUTLINE_TARGET_WORDS.medium; }
    function getOutlineTargetChapterCount(wcKey) { return Math.max(1, Math.ceil(getOutlineTargetWords(wcKey) / OUTLINE_CHAPTER_WORDS)); }
    function getOutlineScaleProfile(wcKey) {
        const key = OUTLINE_SCALE_PROFILES[wcKey] ? wcKey : 'medium';
        return Object.assign({}, OUTLINE_SCALE_PROFILES[key], { key, targetWords: getOutlineTargetWords(key), chapters: getOutlineTargetChapterCount(key) });
    }
    function getOutlineEventIdLimit(targetChapters) {
        return Math.max(3, Math.min(OUTLINE_EVENT_ID_MAX, Math.ceil((Number(targetChapters) || 0) / OUTLINE_EVENT_ID_CHAPTER_INTERVAL)));
    }
    function getAdvancedOutlinePlan(wcKey) {
        const scale = getOutlineScaleProfile(wcKey);
        return { wcKey: scale.key, targetWords: scale.targetWords, targetChapters: scale.chapters, eventIdLimit: getOutlineEventIdLimit(scale.chapters), stageTotal: 5, masterSegments: scale.masterSegments };
    }
    function getAdvancedOutlineSegmentSchedule(wcKey) {
        const total = getAdvancedOutlinePlan(wcKey || getAdvancedOutlineWcKey()).masterSegments;
        const labels = total === 3 ? ['母纲设定与角色', '母纲阶段与卷规划', '母纲关键事件与资料索引'] : ['大纲与阶段规划'];
        return labels.map(function(label, index) { return { index: index + 1, total, part: index + 1, label }; });
    }
    function getAdvancedStageSegmentSchedule(wcKey, stage, actualStageStart) {
        const scale = getOutlineScaleProfile(wcKey || getAdvancedOutlineWcKey());
        const total = scale.key === 'long' || scale.key === 'xlong' ? 2 : 1;
        const startChapter = Math.max(1, Number(actualStageStart) || Number(stage?.startChapter) || 1);
        const targetChapters = Math.max(
            0,
            Number(stage?.chapterTarget)
                || (stage?.startChapter && stage?.endChapter ? Number(stage.endChapter) - Number(stage.startChapter) + 1 : 0)
        );
        const targetEnd = targetChapters ? startChapter + targetChapters - 1 : Number(stage?.endChapter) || 0;
        if (total === 1) {
            return [{
                index: 1,
                total: 1,
                part: 1,
                label: '阶段粗纲',
                plannedStart: startChapter,
                plannedEnd: targetEnd,
                targetEnd,
                targetChapters,
            }];
        }
        const firstCount = targetChapters ? Math.ceil(targetChapters / 2) : 0;
        const midpoint = firstCount ? startChapter + firstCount - 1 : 0;
        return [
            {
                index: 1,
                total: 2,
                part: 1,
                label: '阶段粗纲前半段',
                plannedStart: startChapter,
                plannedEnd: midpoint,
                targetEnd,
                targetChapters,
            },
            {
                index: 2,
                total: 2,
                part: 2,
                label: '阶段粗纲后半段',
                plannedStart: midpoint ? midpoint + 1 : 0,
                plannedEnd: targetEnd,
                targetEnd,
                targetChapters,
            },
        ];
    }
    function stripAdvancedPlanningHeadingEmphasis(value) {
        let text = String(value || '').trim();
        while (
            (text.startsWith('**') && text.endsWith('**') && text.length > 4)
            || (text.startsWith('__') && text.endsWith('__') && text.length > 4)
        ) {
            text = text.slice(2, -2).trim();
        }
        return text;
    }
    function parseAdvancedStageChapterRange(value) {
        const match = String(value || '').match(/第\s*(\d+)\s*(?:章)?\s*[-－–—~～至到]\s*第?\s*(\d+)\s*章/i);
        const start = Number(match?.[1]) || 0;
        const end = Number(match?.[2]) || 0;
        return start > 0 && end >= start ? { start, end } : null;
    }
    function getAdvancedStageChapterScale(block) {
        const rawValue = getAdvancedPlanningFieldValue(block, '章节规模');
        if (!rawValue) return { rawValue: '', target: 0, min: 0, max: 0 };
        const allowed = rawValue.match(/(\d+)\s*(?:章)?\s*[-－–—~～至到]\s*(\d+)\s*章/i);
        const allowedStart = Number(allowed?.[1]) || 0;
        const allowedEnd = Number(allowed?.[2]) || 0;
        const min = allowedStart && allowedEnd ? Math.min(allowedStart, allowedEnd) : 0;
        const max = allowedStart && allowedEnd ? Math.max(allowedStart, allowedEnd) : 0;
        const approximate = rawValue.match(/(?:约|大约|预计|计划|共)\s*(\d+)\s*章/i)
            || rawValue.match(/(\d+)\s*章\s*(?:左右|上下)/i)
            || rawValue.match(/^\s*(\d+)\s*章/i);
        let target = Number(approximate?.[1]) || 0;
        if (!target && min && max) target = Math.round((min + max) / 2);
        if (min && target < min) target = min;
        if (max && target > max) target = max;
        return {
            rawValue,
            target,
            min: min || target,
            max: max || target,
        };
    }

    function extractAdvancedOutlineStages(content) {
        const cleanText = cleanAdvancedOutlineText(content);
        const stageSection = splitAdvancedMasterTopLevelSections(cleanText)
            .find(function(section) { return section.title === '全书阶段规划'; });
        const text = stageSection?.content || cleanText;
        const regex = /^(?:#{1,6}[ \t]*)?(?:\*\*|__)?(?:(?:阶段粗纲[:：]?|阶段)[ \t]*)?(S\d{1,3})[ \t]*(?:[:：]|[-—][ \t]+|[ \t]+)[ \t]*([^\n\r]+?)(?:\*\*|__)?[ \t]*$/gmi;
        const matches = [];
        let match;
        while ((match = regex.exec(text))) {
            const stageNo = Number(match[1].slice(1));
            if (!Number.isFinite(stageNo) || stageNo <= 0) continue;
            matches.push({
                key: 'S' + String(stageNo).padStart(2, '0'),
                title: stripAdvancedPlanningHeadingEmphasis(match[2]),
                heading: match[0],
                index: match.index,
            });
        }
        const deduped = new Map();
        matches.forEach(function(item, index) {
            const block = text.slice(item.index, matches[index + 1]?.index || text.length).trim();
            const explicitRange = parseAdvancedStageChapterRange(
                getAdvancedPlanningFieldValue(block, '章节范围') || item.heading
            );
            deduped.set(item.key, Object.assign({}, item, { block, explicitRange, chapterScale: getAdvancedStageChapterScale(block) }));
        });
        const stages = Array.from(deduped.values()).sort(function(left, right) {
            return Number(left.key.slice(1)) - Number(right.key.slice(1));
        });
        let previousPlannedEnd = 0;
        return stages.map(function(stage, index) {
            const explicitRange = stage.explicitRange;
            const scale = stage.chapterScale || {};
            const startChapter = explicitRange?.start
                || (scale.target ? (previousPlannedEnd > 0 ? previousPlannedEnd + 1 : (index === 0 ? 1 : 0)) : 0);
            const chapterTarget = explicitRange
                ? explicitRange.end - explicitRange.start + 1
                : Number(scale.target) || 0;
            const minChapters = explicitRange ? chapterTarget : Number(scale.min) || chapterTarget;
            const maxChapters = explicitRange ? chapterTarget : Number(scale.max) || chapterTarget;
            const endChapter = explicitRange?.end
                || (startChapter && chapterTarget ? startChapter + chapterTarget - 1 : 0);
            if (endChapter) previousPlannedEnd = endChapter;
            return Object.assign({}, stage, {
                startChapter,
                endChapter,
                chapterTarget,
                minChapters,
                maxChapters,
                chapterRangeExplicit: !!explicitRange,
                chapterScaleText: String(scale.rawValue || ''),
            });
        });
    }

    function getMissingAdvancedMasterStages(stages) {
        const keys = new Set((stages || []).map(function(stage) { return String(stage.key || '').toUpperCase(); }));
        return ['S01', 'S02', 'S03', 'S04', 'S05'].filter(function(key) { return !keys.has(key); });
    }
    function normalizeAdvancedPlanningId(prefix, rawId) {
        const number = Number(String(rawId || '').replace(new RegExp('^' + prefix, 'i'), ''));
        return Number.isFinite(number) && number > 0 ? prefix + String(number).padStart(2, '0') : '';
    }
    function getAdvancedPlanningFieldValue(block, label) {
        const escapedLabel = String(label || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const bracketedLabel = new RegExp(
            '^(?:\\*\\*|__)?【\\s*' + escapedLabel + '\\s*】(?:\\*\\*|__)?\\s*[:：]?\\s*(.*)$',
            'i'
        );
        const plainLabel = new RegExp(
            '^(?:\\*\\*|__)?' + escapedLabel + '(?:\\*\\*|__)?\\s*[:：]\\s*(.*)$',
            'i'
        );
        const structuredField = /^(?:\*\*|__)?(?:【[^】]{1,30}】|[\u3400-\u9fffA-Za-z/]{2,30})(?:\*\*|__)?\s*[:：]/;
        const lines = String(block || '').split(/\r?\n/);
        for (let index = 0; index < lines.length; index += 1) {
            const line = String(lines[index] || '').trim().replace(/^[-+*]\s+/, '');
            const match = line.match(bracketedLabel) || line.match(plainLabel);
            if (!match) continue;
            const values = [];
            if (String(match[1] || '').trim()) values.push(String(match[1]).trim());
            for (let nextIndex = index + 1; nextIndex < lines.length && nextIndex <= index + 12; nextIndex += 1) {
                const nextLine = String(lines[nextIndex] || '').trim().replace(/^[-+*]\s+/, '');
                if (!nextLine) {
                    if (values.length) break;
                    continue;
                }
                if (/^#{1,6}\s/.test(nextLine) || /^(?:\*\*|__)?【[^】]{1,30}】/.test(nextLine) || structuredField.test(nextLine)) break;
                values.push(nextLine);
            }
            return values.join(' ').trim();
        }
        return '';
    }
    function getAdvancedPlanningFieldIds(block, label, prefix) {
        const rawValue = getAdvancedPlanningFieldValue(block, label);
        const ids = [];
        const seen = new Set();
        const rangeSeparator = '[-－–—~～至到]';
        const tokens = rawValue.match(new RegExp(
            '\\b' + prefix + '\\s*\\d{1,3}\\b(?:\\s*' + rangeSeparator + '\\s*(?:' + prefix + '\\s*)?\\d{1,3}\\b)?',
            'gi'
        )) || [];
        const tokenPattern = new RegExp(
            '^' + prefix + '\\s*(\\d{1,3})(?:\\s*' + rangeSeparator + '\\s*(?:' + prefix + '\\s*)?(\\d{1,3}))?$',
            'i'
        );
        function addId(number) {
            const id = normalizeAdvancedPlanningId(prefix, prefix + number);
            if (!id || seen.has(id)) return;
            seen.add(id);
            ids.push(id);
        }
        tokens.forEach(function(token) {
            const parts = String(token || '').trim().match(tokenPattern);
            if (!parts) return;
            const start = Number(parts[1]);
            const end = Number(parts[2]);
            if (!Number.isFinite(end)) {
                addId(start);
                return;
            }
            const step = end >= start ? 1 : -1;
            for (let number = start, count = 0; count < 1000; number += step, count += 1) {
                addId(number);
                if (number === end) break;
            }
        });
        return { rawValue, ids };
    }
    function extractAdvancedOutlineVolumes(volumeSection) {
        const source = String(volumeSection || '');
        const matches = Array.from(source.matchAll(/^##[ \t]*(?:\*\*|__)?(?:卷[ \t]*)?(V\d{1,3})[ \t]*(?:[:：]|[-—][ \t]+|[ \t]+)?[^\n\r]*?(?:\*\*|__)?[ \t]*$/gmi));
        return matches.map(function(match, index) {
            return {
                key: normalizeAdvancedPlanningId('V', match[1]),
                block: source.slice(match.index, matches[index + 1]?.index || source.length).trim(),
            };
        });
    }
    function validateAdvancedMasterStagePlanning(masterContent) {
        const source = cleanAdvancedOutlineText(masterContent);
        const marker = source.search(/^#\s*阶段粗纲[:：]/m);
        const master = marker > 0 ? source.slice(0, marker) : source;
        const sections = splitAdvancedMasterTopLevelSections(master);
        const stageSection = sections.find(function(section) { return section.title === '全书阶段规划'; });
        const volumeSection = sections.find(function(section) { return section.title === '卷规划'; });
        const rawStageKeys = Array.from(String(stageSection?.content || '').matchAll(/^(?:#{1,6}[ \t]*)?(?:\*\*|__)?(?:(?:阶段粗纲[:：]?|阶段)[ \t]*)?(S\d{1,3})[ \t]*(?:[:：]|[-—][ \t]+|[ \t]+)[ \t]*([^\n\r]+?)(?:\*\*|__)?[ \t]*$/gmi))
            .map(function(match) { return normalizeAdvancedPlanningId('S', match[1]); })
            .filter(Boolean);
        const duplicateStageKeys = Array.from(new Set(rawStageKeys.filter(function(key, index) {
            return rawStageKeys.indexOf(key) !== index;
        })));
        if (duplicateStageKeys.length) {
            return {
                ok: false,
                code: 'ADVANCED_MASTER_STAGE_DUPLICATE',
                reason: '大纲阶段规划存在重复编号：' + duplicateStageKeys.join('、') + '。每个阶段只能出现一次。',
                missingStages: [],
            };
        }
        const allowedStageKeys = new Set(['S01', 'S02', 'S03', 'S04', 'S05']);
        const unexpectedStageKeys = Array.from(new Set(rawStageKeys.filter(function(key) {
            return !allowedStageKeys.has(key);
        })));
        if (unexpectedStageKeys.length) {
            return {
                ok: false,
                code: 'ADVANCED_MASTER_STAGE_INVALID',
                reason: '大纲阶段规划只能使用 S01-S05，发现无效阶段：' + unexpectedStageKeys.join('、') + '。',
                missingStages: [],
            };
        }
        const stages = extractAdvancedOutlineStages(stageSection?.content || '');
        const missingStages = getMissingAdvancedMasterStages(stages);
        if (missingStages.length) {
            return { ok: false, code: 'ADVANCED_MASTER_STAGE_INCOMPLETE', reason: '大纲阶段规划不完整，缺少 ' + missingStages.join('、') + '。', missingStages };
        }
        if (!volumeSection) {
            return { ok: false, code: 'ADVANCED_MASTER_VOLUME_INCOMPLETE', reason: '大纲缺少“卷规划”，阶段与卷必须保持有效的双向关联。', missingStages: [] };
        }

        const issues = [];
        const stageKeys = new Set(stages.map(function(stage) { return stage.key; }));
        const volumes = extractAdvancedOutlineVolumes(volumeSection.content);
        if (!volumes.length) {
            return { ok: false, code: 'ADVANCED_MASTER_VOLUME_INCOMPLETE', reason: '大纲“卷规划”中没有识别到有效卷编号。', missingStages: [] };
        }
        const volumeCounts = new Map();
        volumes.forEach(function(volume) {
            volumeCounts.set(volume.key, (volumeCounts.get(volume.key) || 0) + 1);
        });
        Array.from(volumeCounts.entries()).forEach(function(entry) {
            if (entry[1] > 1) issues.push(entry[0] + ' 在卷规划中重复出现');
        });
        const volumeKeys = new Set(volumes.map(function(volume) { return volume.key; }));
        const stageRelations = new Map();
        stages.forEach(function(stage) {
            const included = getAdvancedPlanningFieldIds(stage.block, '包含卷', 'V');
            const validVolumes = included.ids.filter(function(volumeKey) { return volumeKeys.has(volumeKey); });
            stageRelations.set(stage.key, new Set(validVolumes));
            if (!included.ids.length) issues.push(stage.key + ' 的【包含卷】没有填写有效卷号');
            included.ids.forEach(function(volumeKey) {
                if (!volumeKeys.has(volumeKey)) issues.push(stage.key + ' 引用了不存在的卷 ' + volumeKey);
            });
        });

        const volumeRelations = new Map();
        volumes.forEach(function(volume) {
            const belonged = getAdvancedPlanningFieldIds(volume.block, '所属阶段', 'S');
            const validStages = belonged.ids.filter(function(stageKey) { return stageKeys.has(stageKey); });
            const relatedStages = volumeRelations.get(volume.key) || new Set();
            validStages.forEach(function(stageKey) { relatedStages.add(stageKey); });
            volumeRelations.set(volume.key, relatedStages);
            if (!belonged.ids.length) issues.push((volume.key || '未知卷') + ' 的【所属阶段】没有填写有效阶段编号');
            belonged.ids.forEach(function(stageKey) {
                if (!stageKeys.has(stageKey)) issues.push((volume.key || '未知卷') + ' 引用了不存在的阶段 ' + stageKey);
            });
        });
        stageRelations.forEach(function(relatedVolumes, stageKey) {
            relatedVolumes.forEach(function(volumeKey) {
                if (!volumeRelations.get(volumeKey)?.has(stageKey)) {
                    issues.push(stageKey + ' 的【包含卷】含 ' + volumeKey + '，但 ' + volumeKey + ' 的【所属阶段】未包含 ' + stageKey);
                }
            });
        });
        volumeRelations.forEach(function(relatedStages, volumeKey) {
            relatedStages.forEach(function(stageKey) {
                if (!stageRelations.get(stageKey)?.has(volumeKey)) {
                    issues.push(volumeKey + ' 的【所属阶段】含 ' + stageKey + '，但 ' + stageKey + ' 的【包含卷】未包含 ' + volumeKey);
                }
            });
        });
        return issues.length
            ? {
                ok: false,
                code: 'ADVANCED_MASTER_VOLUME_MAPPING_INVALID',
                reason: '阶段与卷规划引用关系不完整：' + issues.slice(0, 4).join('；') + (issues.length > 4 ? '；另有' + (issues.length - 4) + '项问题。' : '。'),
                missingStages: [],
                issues,
            }
            : { ok: true, missingStages: [], issues: [] };
    }
    function validateAdvancedMasterStageCompleteness(stagesOrContent) {
        const missing = getMissingAdvancedMasterStages(Array.isArray(stagesOrContent) ? stagesOrContent : extractAdvancedOutlineStages(stagesOrContent));
        if (missing.length) throw new Error('母纲缺少阶段：' + missing.join('、'));
        return true;
    }

    function getOutlineChapterNumbers(text) {
        const source = String(text || '');
        const regex = /(?:^|\n)\s*(?:[-*+]\s*)?(?:#{0,6}\s*)?[《【\[]?\s*第\s*([零〇两一二三四五六七八九十百千万\d]+)\s*(?:章|回|节)/g;
        const numbers = [];
        let match;
        while ((match = regex.exec(source))) {
            const chapterNo = chineseToNumber(match[1]);
            if (Number.isFinite(chapterNo) && chapterNo > 0) numbers.push(chapterNo);
        }
        return numbers;
    }
    function getAdvancedStageChapterNumbers(content) {
        const source = String(content || '');
        const marker = source.search(/^#\s*阶段粗纲[:：]/m);
        return getOutlineChapterNumbers(marker >= 0 ? source.slice(marker) : source);
    }
    function getAdvancedStageChapterEntries(content) {
        const source = String(content || '');
        const marker = source.search(/^#\s*阶段粗纲[:：]/m);
        const stageSource = marker >= 0 ? source.slice(marker) : source;
        const entries = [];
        let current = null;
        stageSource.split(/\r?\n/).forEach(function(line) {
            const heading = String(line || '').match(/^\s*(?:[-*+]\s*)?(?:#{0,6}\s*)?[《【\[]?\s*第\s*([零〇两一二三四五六七八九十百千万\d]+)\s*(?:章|回|节)[】》\]]?\s*(?:[：:、.\-—]\s*)?(.*)$/);
            if (heading) {
                if (current) entries.push(current);
                current = {
                    chapterNumber: chineseToNumber(heading[1]),
                    title: String(heading[2] || '').trim(),
                    lines: [String(line || '').trim()],
                };
                return;
            }
            if (current) current.lines.push(String(line || ''));
        });
        if (current) entries.push(current);
        return entries
            .filter(function(entry) { return Number.isFinite(entry.chapterNumber) && entry.chapterNumber > 0; })
            .map(function(entry) {
                return {
                    chapterNumber: entry.chapterNumber,
                    title: entry.title,
                    content: entry.lines.join('\n').trim(),
                };
            });
    }
    function getAdvancedStageChapterProgress(content) {
        const numbers = getAdvancedStageChapterNumbers(content);
        const lastChapter = numbers.length ? numbers[numbers.length - 1] : 0;
        return { chapterCount: numbers.length, lastChapter, nextChapter: Math.max(1, lastChapter + 1) };
    }
    function getAdvancedStageExpectedStart(masterContent, stageKey, previousStageSnapshot) {
        const stageNo = Number(String(stageKey || '').replace(/^S/i, ''));
        if (!Number.isFinite(stageNo) || stageNo <= 1) return { ok: true, nextChapter: 1, previousStage: '' };
        const previousKey = 'S' + String(stageNo - 1).padStart(2, '0');
        const snapshot = previousStageSnapshot && typeof previousStageSnapshot === 'object' ? previousStageSnapshot : null;
        const lastChapter = Number(snapshot?.lastChapter) || 0;
        const targetKey = 'S' + String(stageNo).padStart(2, '0');
        const matchesStage = snapshot?.stageKey === previousKey
            && (!snapshot.nextStageKey || snapshot.nextStageKey === targetKey);
        if (!matchesStage || lastChapter <= 0) {
            return {
                ok: false,
                nextChapter: 0,
                previousStage: previousKey,
                message: '请先生成并保存' + previousKey + '阶段粗纲，再生成' + targetKey + '。',
            };
        }
        return {
            ok: true,
            nextChapter: lastChapter + 1,
            previousStage: previousKey,
            snapshotId: String(snapshot.snapshotId || ''),
        };
    }
    function validateAdvancedStageSegmentProgress(beforeContent, afterContent, expectedStart, segment) {
        const beforeNumbers = getAdvancedStageChapterNumbers(beforeContent);
        const afterNumbers = getAdvancedStageChapterNumbers(afterContent);
        const newNumbers = afterNumbers.slice(beforeNumbers.length);
        const label = segment?.label || segment?.title || '阶段粗纲';
        if (!newNumbers.length) return { ok: false, reason: label + '没有输出章节标题，应从第' + expectedStart + '章开始补全。' };
        if (newNumbers[0] !== expectedStart) return { ok: false, reason: label + '章号没有接上：应从第' + expectedStart + '章开始，但本段从第' + newNumbers[0] + '章开始。' };
        for (let index = 0; index < newNumbers.length; index += 1) {
            const expected = expectedStart + index;
            if (newNumbers[index] !== expected) return { ok: false, reason: label + '章号不连续：第' + expected + '章缺失，当前识别到第' + newNumbers[index] + '章。' };
        }
        return { ok: true, start: newNumbers[0], end: newNumbers[newNumbers.length - 1] };
    }
    function validateAdvancedStageCompleteness(content, stage, expectedStart) {
        const numbers = getAdvancedStageChapterNumbers(content);
        if (!numbers.length) return { ok: false, reason: '阶段粗纲没有识别到章节标题。' };
        const requiredStart = Math.max(0, Number(expectedStart) || Number(stage?.startChapter) || 0);
        if (requiredStart && numbers[0] !== requiredStart) return { ok: false, reason: '阶段粗纲应从第' + requiredStart + '章开始。' };
        for (let index = 1; index < numbers.length; index += 1) {
            if (numbers[index] !== numbers[index - 1] + 1) {
                return { ok: false, reason: '阶段粗纲章号不连续：第' + numbers[index - 1] + '章后识别到第' + numbers[index] + '章。' };
            }
        }
        const chapterCount = numbers.length;
        const targetChapters = Number(stage?.chapterTarget)
            || (stage?.startChapter && stage?.endChapter ? stage.endChapter - stage.startChapter + 1 : 0);
        const minChapters = Number(stage?.minChapters) || targetChapters;
        const maxChapters = Number(stage?.maxChapters) || targetChapters;
        const advisoryMinChapters = targetChapters ? Math.ceil(targetChapters * 0.8) : 0;
        const advisoryMaxChapters = targetChapters ? Math.floor(targetChapters * 1.2) : 0;
        let warning = '';
        if (advisoryMinChapters && chapterCount < advisoryMinChapters) {
            warning = '当前阶段生成了' + chapterCount + '章，低于母纲目标' + targetChapters
                + '章的80%参考值（' + advisoryMinChapters + '章）。内容已保留，请自行判断是否需要继续扩写。';
        } else if (advisoryMaxChapters && chapterCount > advisoryMaxChapters) {
            warning = '当前阶段生成了' + chapterCount + '章，超过母纲目标' + targetChapters
                + '章的120%参考值（' + advisoryMaxChapters + '章）。内容已保留，请自行判断是否需要压缩。';
        }
        return {
            ok: true,
            warning,
            chapterCount,
            lastChapter: numbers[numbers.length - 1],
            targetChapters,
            minChapters,
            maxChapters,
            advisoryMinChapters,
            advisoryMaxChapters,
        };
    }
    function assertOutlineFirstChapterNotSkipped(content, expectedStart) {
        const first = getAdvancedStageChapterNumbers(content)[0] || 0;
        if (!first || (expectedStart && first !== expectedStart)) throw new Error('阶段粗纲应从第 ' + (expectedStart || 1) + ' 章开始');
        return true;
    }

    function getOutlineEventIds(text) { return Array.from(new Set(String(text || '').match(/\bF-\d{3,}\b/g) || [])); }
    function assertOutlineEventIdLimit(text, plan) {
        const limit = Number(plan?.eventIdLimit) || getOutlineEventIdLimit(plan?.targetChapters);
        const ids = getOutlineEventIds(text);
        if (ids.length > limit) return { ok: false, reason: '大纲 F-ID 过多：已出现' + ids.length + '个，全书最多' + limit + '个。', ids, limit };
        for (const id of ids) {
            const mentions = (String(text || '').match(new RegExp('\\b' + id + '\\b', 'g')) || []).length;
            if (mentions > OUTLINE_EVENT_ID_MENTIONS_PER_ID_MAX) return { ok: false, reason: id + ' 出现过于频繁。', ids, limit };
        }
        return { ok: true, ids, limit };
    }

    function getAdvancedStageType(stageBlock, stageTitle) {
        const raw = ((String(stageBlock || '').match(/【阶段类型】\s*([\s\S]*?)(?=\n\s*\n|【|$)/) || [null, stageTitle || ''])[1] || '');
        return ['开篇', '发展', '深化', '高潮', '收尾'].find(function(type) { return raw.includes(type); }) || '';
    }
    function buildAdvancedPromptHeader(input) {
        const scale = input.scale || getOutlineScaleProfile(input.wcKey || getAdvancedOutlineWcKey());
        return [
            '【题材】' + (input.genres || '未指定'),
            '【规模】' + scale.label + '，约 ' + scale.chapters + ' 章',
            '【核心梗概】' + (input.summary || input.coreSummary || '请按题材原创'),
            input.genreContextPrompt || '',
            input.linkedFilesText ? '【关联资料】\n' + input.linkedFilesText : '',
        ].filter(Boolean).join('\n\n');
    }
    function buildAdvancedStageOutlinePrompt(masterContent, options) {
        const opt = options || {};
        const cleanMaster = cleanAdvancedOutlineText(masterContent);
        const stageSection = splitAdvancedMasterTopLevelSections(cleanMaster)
            .find(function(section) { return section.title === '全书阶段规划'; });
        const stages = extractAdvancedOutlineStages(stageSection?.content || cleanMaster);
        const stage = stages.find(function(item) { return item.key === opt.stageKey; }) || stages[0];
        const nextChapter = Math.max(1, Number(opt.chapterProgress?.nextChapter) || stage?.startChapter || 1);
        const actualStageStart = Math.max(1, Number(opt.actualStageStart) || nextChapter);
        const rangeStart = opt.useActualBoundary ? actualStageStart : (Number(stage?.startChapter) || actualStageStart);
        const targetChapters = Number(stage?.chapterTarget) || 0;
        const minChapters = Number(stage?.minChapters) || targetChapters;
        const maxChapters = Number(stage?.maxChapters) || targetChapters;
        const targetEnd = targetChapters ? rangeStart + targetChapters - 1 : Number(stage?.endChapter) || 0;
        const minEnd = minChapters ? rangeStart + minChapters - 1 : 0;
        const maxEnd = maxChapters ? rangeStart + maxChapters - 1 : 0;
        const chapterRangeText = stage?.chapterRangeExplicit && stage?.endChapter
            ? (opt.useActualBoundary
                ? ('实际从第' + actualStageStart + '章起，母纲原计划在第' + stage.endChapter + '章附近收束，仅作为剧情规模参考；'
                    + '不得使用母纲原计划起点覆盖实际起点。阶段内“五阶段划分”的第一小段不是整个阶段的终点。')
                : ('第' + stage.startChapter + '-' + stage.endChapter + '章；阶段内“五阶段划分”的第一小段不是整个阶段的终点。'))
            : targetChapters
            ? ('从第' + rangeStart + '章开始，整个' + (stage?.key || opt.stageKey || '当前阶段')
                + '目标生成约' + targetChapters + '章'
                + (minChapters && maxChapters && (minChapters !== targetChapters || maxChapters !== targetChapters)
                    ? ('，允许' + minChapters + '-' + maxChapters + '章；至少写到第' + minEnd + '章，建议写到第' + targetEnd + '章，最多第' + maxEnd + '章')
                    : ('，必须完整写到第' + targetEnd + '章'))
                + '。阶段内“五阶段划分”只是这批章节的内部结构，其中第一小段绝不是整个阶段的终点。'
                + (opt.useActualBoundary ? '不得使用母纲原计划起点覆盖实际起点。' : ''))
            : (opt.useActualBoundary
                ? ('实际从第' + actualStageStart + '章起，章节规模参考母纲；不得使用母纲原计划起点覆盖实际起点')
                : (stage?.startChapter && stage?.endChapter ? ('第' + stage.startChapter + '-' + stage.endChapter + '章') : '严格参考母纲当前阶段的【章节规模】'));
        const allowedIds = getOutlineEventIds(stage?.block || '');
        const includedVolumes = getAdvancedPlanningFieldIds(stage?.block || '', '包含卷', 'V').ids;
        if (!includedVolumes.length) throw new Error((stage?.key || opt.stageKey || '当前阶段') + ' 的【包含卷】没有有效卷号。');
        const volumeSection = splitAdvancedMasterTopLevelSections(cleanMaster)
            .find(function(section) { return section.title === '卷规划'; });
        const volumeMap = new Map(extractAdvancedOutlineVolumes(volumeSection?.content || '')
            .map(function(volume) { return [volume.key, volume.block]; }));
        const missingVolumes = includedVolumes.filter(function(volumeKey) { return !volumeMap.has(volumeKey); });
        if (missingVolumes.length) {
            throw new Error((stage?.key || opt.stageKey || '当前阶段') + ' 引用的卷规划不存在：' + missingVolumes.join('、') + '。');
        }
        const currentVolumes = includedVolumes.join('、');
        const volumeText = includedVolumes.map(function(volumeKey) { return volumeMap.get(volumeKey); }).join('\n\n');
        const eventControl = allowedIds.length
            ? '只能使用母纲当前阶段已经规划的事件 ID：' + allowedIds.join('、') + '。每个 ID 至少在真实节点落标一次，普通章节不要标记。'
            : '母纲当前阶段没有列出 F-ID，本阶段不得自行新增 F-ID。';
        const template = window.ZHIYU_ADVANCED_OUTLINE_PROMPTS?.stage || '';
        const prompt = template
            .replaceAll('{{阶段编号}}', stage?.key || opt.stageKey || '当前阶段')
            .replaceAll('{{阶段名称}}', stage?.title || '阶段粗纲')
            .replaceAll('{{阶段类型}}', getAdvancedStageType(stage?.block, stage?.title) || '按母纲判断')
            .replaceAll('{{包含卷}}', currentVolumes)
            .replaceAll('{{章节范围}}', chapterRangeText)
            .replaceAll('{{当前生成段说明}}', '本次生成当前阶段粗纲')
            .replaceAll('{{当前阶段规划内容}}', stage?.block || cleanMaster.slice(0, 7000))
            .replaceAll('{{当前阶段卷规划内容}}', volumeText)
            .replaceAll('{{前一阶段结尾交接}}', '参考母纲上一阶段的【结尾交接】')
            .replaceAll('{{不能提前解决内容}}', '严格参考母纲当前阶段的【不能提前解决】')
            .replaceAll('{{关键事件状态}}', eventControl)
            .replaceAll('{{角色列表内容}}', '参考母纲中的角色资料、对话风格、人物弧线和角色关系');
        return prompt
            + '\n\n【章节连续性硬要求】\n第一条必须是“## 第' + nextChapter + '章：章节标题”，后续逐章递增，不得跳章、倒退或重写旧章。'
            + '\n\n【母纲核心内容】\n' + cleanMaster.slice(0, 6000);
    }
    function buildAdvancedStageSegmentPrompt(basePrompt, options) {
        const opt = options || {};
        const segment = opt.segment || {};
        if (Number(segment.total) !== 2) return String(basePrompt || '');
        const stage = opt.stage || {};
        const actualStageStart = Math.max(1, Number(opt.actualStageStart) || Number(stage.startChapter) || 1);
        const targetChapters = Math.max(0, Number(segment.targetChapters) || Number(stage.chapterTarget) || 0);
        const targetEnd = Math.max(0, Number(segment.targetEnd) || (targetChapters ? actualStageStart + targetChapters - 1 : 0));
        const expectedStart = Math.max(1, Number(opt.expectedStart) || actualStageStart);
        const prompts = window.ZHIYU_ADVANCED_OUTLINE_PROMPTS || {};
        if (Number(segment.part) === 1) {
            const firstTemplate = prompts.stageSegmentFirst || '';
            return [
                String(basePrompt || ''),
                firstTemplate
                    .replaceAll('{{阶段编号}}', stage.key || opt.stageKey || '当前阶段')
                    .replaceAll('{{阶段名称}}', stage.title || '阶段粗纲')
                    .replaceAll('{{实际起始章}}', String(actualStageStart))
                    .replaceAll('{{目标章数}}', targetChapters ? String(targetChapters) : '母纲规划数量')
                    .replaceAll('{{目标结束章}}', targetEnd ? String(targetEnd) : '母纲规划终点')
                    .replaceAll('{{本段起始章}}', String(expectedStart))
                    .replaceAll('{{本段建议结束章}}', segment.plannedEnd ? String(segment.plannedEnd) : '阶段中点'),
            ].filter(Boolean).join('\n\n');
        }
        const entries = getAdvancedStageChapterEntries(opt.completedContent || '');
        const completedStart = entries[0]?.chapterNumber || actualStageStart;
        const completedEnd = entries[entries.length - 1]?.chapterNumber || expectedStart - 1;
        const chapterDirectory = entries.length
            ? entries.map(function(entry) {
                return '第' + entry.chapterNumber + '章：' + (entry.title || '未命名章节');
            }).join('\n')
            : '暂无已完成章节目录';
        const lastTen = entries.length
            ? entries.slice(-10).map(function(entry) { return entry.content; }).join('\n\n')
            : '暂无上一段章节内容';
        const allowedIds = getOutlineEventIds(stage.block || '');
        const usedIds = getOutlineEventIds(opt.completedContent || '').filter(function(id) { return allowedIds.includes(id); });
        const pendingIds = allowedIds.filter(function(id) { return !usedIds.includes(id); });
        const finalTemplate = prompts.stageSegmentFinal || prompts.continuation || '';
        return [
            String(basePrompt || ''),
            finalTemplate
                .replaceAll('{{阶段编号}}', stage.key || opt.stageKey || '当前阶段')
                .replaceAll('{{阶段名称}}', stage.title || '阶段粗纲')
                .replaceAll('{{已完成起始章}}', String(completedStart))
                .replaceAll('{{已完成结束章}}', String(completedEnd))
                .replaceAll('{{已完成章数}}', String(entries.length))
                .replaceAll('{{本段起始章}}', String(expectedStart))
                .replaceAll('{{目标章数}}', targetChapters ? String(targetChapters) : '母纲规划数量')
                .replaceAll('{{目标结束章}}', targetEnd ? String(targetEnd) : '母纲规划终点')
                .replaceAll('{{已完成章节目录}}', chapterDirectory)
                .replaceAll('{{上一段最后十章}}', lastTen)
                .replaceAll('{{已使用事件}}', usedIds.length ? usedIds.join('、') : '暂无')
                .replaceAll('{{待落实事件}}', pendingIds.length ? pendingIds.join('、') : '无'),
        ].filter(Boolean).join('\n\n');
    }

    function splitAdvancedMasterTopLevelSections(text) {
        const source = cleanAdvancedOutlineText(text);
        const matches = Array.from(source.matchAll(/^#[ \t]+([^\n\r]+)[ \t]*$/gm));
        if (!matches.length) return [{ title: '', content: source }];
        return matches.map(function(match, index) {
            return { title: stripAdvancedPlanningHeadingEmphasis(match[1]), content: source.slice(match.index, matches[index + 1]?.index || source.length).trim() };
        });
    }
    function buildAdvancedMasterPlanningRepairPrompt(masterContent, missingStages) {
        const planning = splitAdvancedMasterTopLevelSections(masterContent)
            .filter(function(section) { return section.title === '全书阶段规划' || section.title === '卷规划'; })
            .map(function(section) { return section.content; })
            .join('\n\n');
        return `你正在修复母大纲的阶段与卷引用关系，不是在重写大纲或续写结局。

${(missingStages || []).length ? ('当前缺少阶段：' + missingStages.join('、') + '。') : '当前阶段与卷存在缺失引用或双向关系不一致，只修正明确的结构问题。'}
如果现有内容已经包含高潮、结局或余波，不要追加第二个结局，也不要改变故事事实和最终结果。

要求：
1. 除补齐明确缺失的阶段或卷块外，保留现有阶段与卷数量、编号和顺序，不合并、不拆分、不重新分卷。
2. 保留所有已有剧情事实、阶段目标、卷内容、人物命运、结局和前后顺序。
3. 允许一个阶段包含多卷，也允许同一卷归属多个阶段；不得强制改成 S01→V01、S02→V02 的同编号一一对应。
4. 每个 S01-S05 阶段至少引用一个真实存在的卷，每个卷至少归属一个真实存在的阶段。
5. 【包含卷】与【所属阶段】必须双向一致；只补齐缺失编号或修正不一致引用。
6. 保留已有 F-ID，不新增无关事件，不写章节粗纲、细纲或正文。
7. 只输出下面两个完整一级标题，禁止输出解释或其他内容：
# 全书阶段规划
# 卷规划

【需要修复的现有内容】
${planning || cleanAdvancedOutlineText(masterContent).slice(0, 12000)}`;
    }
    function mergeAdvancedMasterPlanningRepair(masterContent, repairContent) {
        const repair = new Map(splitAdvancedMasterTopLevelSections(repairContent).map(function(section) { return [section.title, section.content]; }));
        if (!repair.has('全书阶段规划') || !repair.has('卷规划')) throw new Error('阶段规划修复结果不完整。');
        const planningTitles = new Set(['全书阶段规划', '卷规划']);
        const mergedSections = [];
        let planningInserted = false;
        splitAdvancedMasterTopLevelSections(masterContent).forEach(function(section) {
            if (!planningTitles.has(section.title)) {
                mergedSections.push(section.content);
                return;
            }
            if (planningInserted) return;
            mergedSections.push(repair.get('全书阶段规划'), repair.get('卷规划'));
            planningInserted = true;
        });
        if (!planningInserted) mergedSections.push(repair.get('全书阶段规划'), repair.get('卷规划'));
        const result = mergedSections.filter(Boolean).join('\n\n');
        const validation = validateAdvancedMasterStagePlanning(result);
        if (!validation.ok) throw new Error(validation.reason);
        return result;
    }

    Object.assign(window, {
        cleanAdvancedOutlineText,
        normalizeOutlineChapterHeadingNumbers,
        getAdvancedOutlineWcKey,
        getOutlineTargetWords,
        getOutlineTargetChapterCount,
        getOutlineScaleProfile,
        getOutlineEventIdLimit,
        getAdvancedOutlinePlan,
        getAdvancedOutlineSegmentSchedule,
        getAdvancedStageSegmentSchedule,
        extractAdvancedOutlineStages,
        getMissingAdvancedMasterStages,
        validateAdvancedMasterStagePlanning,
        validateAdvancedMasterStageCompleteness,
        getOutlineChapterNumbers,
        getAdvancedStageChapterNumbers,
        getAdvancedStageChapterEntries,
        getAdvancedStageChapterProgress,
        getAdvancedStageExpectedStart,
        validateAdvancedStageSegmentProgress,
        validateAdvancedStageCompleteness,
        assertOutlineFirstChapterNotSkipped,
        getOutlineEventIds,
        assertOutlineEventIdLimit,
        getAdvancedStageType,
        buildAdvancedPromptHeader,
        buildAdvancedStageOutlinePrompt,
        buildAdvancedStageSegmentPrompt,
        buildAdvancedMasterPlanningRepairPrompt,
        mergeAdvancedMasterPlanningRepair,
    });
})(window);
