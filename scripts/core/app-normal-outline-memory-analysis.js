// Normal-outline memory analysis: segment only oversized foundation content before generating memory files.
(function(window) {
    'use strict';

    const DIRECT_OUTLINE_LIMIT = 50000;
    const SEGMENT_LIMIT = 42000;
    const TASK_VERSION = 1;
    const TASK_PREFIX = 'zhiyu_normal_outline_memory_analysis_v1_';
    const MAX_FACT_ITEMS = 80;
    const MAX_ROLE_COUNT = 30;
    const MAX_RELATION_COUNT = 80;

    function asText(value) {
        return String(value == null ? '' : value);
    }

    function hashText(value) {
        let hash = 2166136261;
        const text = asText(value);
        for (let index = 0; index < text.length; index += 1) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36);
    }

    function uniqueLimited(values, limit) {
        const seen = new Set();
        return (Array.isArray(values) ? values : [])
            .map(function(value) { return asText(value).replace(/\s+/g, ' ').trim(); })
            .filter(function(value) {
                if (!value || seen.has(value)) return false;
                seen.add(value);
                return true;
            })
            .slice(0, limit || MAX_FACT_ITEMS);
    }

    function trimFact(value, maxLength) {
        const text = asText(value).replace(/[|]/g, '｜').replace(/\s+/g, ' ').trim();
        return text.length > maxLength ? text.slice(0, maxLength) : text;
    }

    function splitOversizedSection(text, maxChars) {
        const core = window.ZhiyuFullTextAnalysisCore || window.FullTextAnalysisCore;
        if (typeof core?.splitTextPreservingAll === 'function') return core.splitTextPreservingAll(text, maxChars);
        const source = asText(text);
        const parts = [];
        for (let start = 0; start < source.length; start += maxChars) parts.push(source.slice(start, start + maxChars));
        return parts;
    }

    function buildNormalOutlineSegments(source, maxChars) {
        const text = asText(source);
        const limit = Math.max(1000, Number(maxChars) || SEGMENT_LIMIT);
        if (text.length <= limit) return [text];
        const blocks = text.split(/(?=^\s*(?:#{1,4}\s+|第[零〇一二两三四五六七八九十百千万\d]+[卷章]))/m).filter(Boolean);
        const segments = [];
        let current = '';
        function flush() {
            if (current.trim()) segments.push(current);
            current = '';
        }
        blocks.forEach(function(block) {
            if (block.length > limit) {
                flush();
                splitOversizedSection(block, limit).forEach(function(part) { if (part.trim()) segments.push(part); });
                return;
            }
            if (current && current.length + block.length > limit) flush();
            current += block;
        });
        flush();
        return segments.length ? segments : splitOversizedSection(text, limit);
    }

    function getTaskKey(bookName, sourceHash) {
        const scoped = window.AccountDataScope?.key
            ? window.AccountDataScope.key(TASK_PREFIX + encodeURIComponent(asText(bookName)) + '_' + sourceHash)
            : TASK_PREFIX + encodeURIComponent(asText(bookName)) + '_' + sourceHash;
        return scoped;
    }

    async function readTask(key) {
        try {
            return await window.ZHIYU_IDB?.get?.(key) || null;
        } catch (error) {
            return null;
        }
    }

    async function writeTask(key, value) {
        try {
            await window.ZHIYU_IDB?.set?.(key, value);
            return true;
        } catch (error) {
            return false;
        }
    }

    async function removeTask(key) {
        try {
            await window.ZHIYU_IDB?.remove?.(key);
            return true;
        } catch (error) {
            return false;
        }
    }

    function parseFactResponse(raw) {
        const source = asText(raw).replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        const fenced = source.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        const start = fenced.indexOf('{');
        const end = fenced.lastIndexOf('}');
        if (start < 0 || end <= start) return null;
        try {
            const parsed = JSON.parse(fenced.slice(start, end + 1));
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (error) {
            return null;
        }
    }

    function normalizeFactObject(raw) {
        const data = raw && typeof raw === 'object' ? raw : {};
        const normalizeRows = function(items, keys, maxLength) {
            return (Array.isArray(items) ? items : []).map(function(item) {
                if (typeof item === 'string') return trimFact(item, maxLength);
                return keys.map(function(key) { return trimFact(item?.[key], maxLength); }).filter(Boolean).join('｜');
            }).filter(Boolean);
        };
        const roles = (Array.isArray(data.roles) ? data.roles : []).map(function(item) {
            const role = item && typeof item === 'object' ? item : {};
            const name = trimFact(role.name || role.角色, 24);
            if (!name || /^(路人|群众|侍卫|店小二|弟子|士兵|村民|百姓|路人甲乙丙丁)/.test(name)) return null;
            return {
                name,
                gender: trimFact(role.gender || role.性别, 8),
                identity: trimFact(role.identity || role['身份/定位'], 28),
                affiliation: trimFact(role.affiliation || role.所属势力, 22),
                goal: trimFact(role.goal || role.核心目标, 30),
                voice: trimFact(role.voice || role.对话风格, 22),
                arc: trimFact(role.arc || role.人物弧线, 28),
                intro: trimFact(role.intro || role.人物简介, 36),
                current: trimFact(role.current || role.当前状态, 28),
                note: trimFact(role.note || role.写作提醒, 36),
                evidence: trimFact(role.evidence || role.依据 || role.来源, 40)
            };
        }).filter(Boolean);
        const relations = (Array.isArray(data.relations) ? data.relations : []).map(function(item) {
            const relation = item && typeof item === 'object' ? item : {};
            const from = trimFact(relation.from || relation.角色A, 24);
            const to = trimFact(relation.to || relation.角色B, 24);
            const label = trimFact(relation.label || relation.关系, 14);
            return from && to && label && from !== to ? { from, to, label, evidence: trimFact(relation.evidence || relation.依据 || '', 40) } : null;
        }).filter(Boolean);
        return {
            settings: uniqueLimited(normalizeRows(data.settings, ['name', 'content'], 80), MAX_FACT_ITEMS),
            factions: uniqueLimited(normalizeRows(data.factions, ['name', 'nature', 'status'], 80), MAX_FACT_ITEMS),
            locations: uniqueLimited(normalizeRows(data.locations, ['name', 'owner', 'status'], 80), MAX_FACT_ITEMS),
            items: uniqueLimited(normalizeRows(data.items, ['name', 'holder', 'status'], 80), MAX_FACT_ITEMS),
            roles: roles.slice(0, MAX_ROLE_COUNT),
            relations: relations.slice(0, MAX_RELATION_COUNT)
        };
    }

    function isUsableFactSet(facts) {
        if (!facts) return false;
        return ['settings', 'factions', 'locations', 'items', 'roles', 'relations']
            .some(function(key) { return Array.isArray(facts[key]) && facts[key].length > 0; });
    }

    function buildChunkPrompt(bookName, segment, index, total) {
        return `你是知屿写作的普通大纲基础设定资料提取助手。当前是第 ${index}/${total} 段，只提取原文已经明确写出的事实，不要补写、猜测或编造。

只保留会持续影响主线、关键事件、后续关系或写作一致性的角色。不要纳入路人、群众、一次性服务型龙套、只有泛称而没有独立剧情作用的人物；但即使只出现一次，只要直接造成关键转折或留下后续影响，仍要保留。

不要输出“性格”字段。每项必须短：关系名称不超过14字，人物简介不超过50字。角色最多50名，只保留重点角色。

只返回 JSON，不要 Markdown、解释或代码块：
{"settings":["设定事实"],"factions":[{"name":"","nature":"","status":""}],"locations":[{"name":"","owner":"","status":""}],"items":[{"name":"","holder":"","status":""}],"roles":[{"name":"","gender":"","identity":"","affiliation":"","goal":"","voice":"","arc":"","intro":"","current":"","note":"","evidence":""}],"relations":[{"from":"","label":"","to":"","evidence":""}]}

【作品】${bookName}
【本段基础设定】
${segment}`;
    }

    function getCompactRoleLimitsInstruction() {
        return '硬性限制（优先于前文示例）：最多30名重点角色、最多80条关键关系；角色名不超过20字，其他角色字段不超过48字，人物简介不超过36字。';
    }

    async function requestSegmentFacts(bookName, segment, index, total, modelCfg, requestTraceGroup) {
        const systemPrompt = '你只做小说大纲事实提取。事实必须来自当前段落，不得暴露推理过程。';
        const prompt = buildChunkPrompt(bookName, segment, index, total) + '\n\n' + getCompactRoleLimitsInstruction();
        const request = function(extra) {
            return window.requestMemoryAnalysisWithFallback(modelCfg, systemPrompt, prompt + (extra || ''), {
                label: '大纲第' + index + '/' + total + '段资料提取',
                fallback: '大纲分段资料提取失败',
                requestFeature: 'analysis',
                requestIdPrefix: 'analysis_normal_outline_segment',
                requestTraceGroup: requestTraceGroup || '',
                maxTokens: 12000
            });
        };
        let raw = await request('');
        let facts = normalizeFactObject(parseFactResponse(raw));
        if (isUsableFactSet(facts)) return facts;
        raw = await request('\n\n上一次没有返回可解析 JSON。请严格只返回完整 JSON 对象。');
        facts = normalizeFactObject(parseFactResponse(raw));
        if (!isUsableFactSet(facts)) throw new Error('第' + index + '段未返回有效资料，请稍后重试。');
        return facts;
    }

    function roleFactLine(role) {
        return [role.name, role.gender, role.identity, role.affiliation, role.goal, role.voice, role.arc, role.intro, role.current, role.note]
            .map(function(value) { return trimFact(value, 60); }).join('｜');
    }

    function mergeFacts(task) {
        const merged = { settings: [], factions: [], locations: [], items: [], roles: [], relations: [] };
        const roleMap = new Map();
        const relationMap = new Map();
        (task.segments || []).forEach(function(segment) {
            const facts = segment?.facts;
            if (!facts) return;
            ['settings', 'factions', 'locations', 'items'].forEach(function(key) {
                merged[key].push.apply(merged[key], Array.isArray(facts[key]) ? facts[key] : []);
            });
            (facts.roles || []).forEach(function(role) {
                const previous = roleMap.get(role.name) || {};
                roleMap.set(role.name, Object.assign({}, previous, Object.fromEntries(Object.entries(role).filter(function(entry) {
                    return String(entry[1] || '').trim();
                }))));
            });
            (facts.relations || []).forEach(function(relation) {
                const key = relation.from + '→' + relation.to + '：' + relation.label;
                if (!relationMap.has(key)) relationMap.set(key, relation);
            });
        });
        ['settings', 'factions', 'locations', 'items'].forEach(function(key) {
            merged[key] = uniqueLimited(merged[key], MAX_FACT_ITEMS);
        });
        merged.roles = Array.from(roleMap.values()).slice(0, MAX_ROLE_COUNT);
        merged.relations = Array.from(relationMap.values()).slice(0, MAX_RELATION_COUNT);
        return merged;
    }

    function buildMergedAnalysisSource(task) {
        const facts = mergeFacts(task);
        const lines = ['# 普通大纲基础设定分段事实汇总', '', '> 以下内容仅由普通大纲第一阶段的基础设定分段提取并汇总；不包含章节粗纲，不可编造。'];
        if (facts.settings.length) lines.push('', '## 设定事实', facts.settings.map(function(item) { return '- ' + item; }).join('\n'));
        if (facts.factions.length) lines.push('', '## 势力事实', facts.factions.map(function(item) { return '- ' + item; }).join('\n'));
        if (facts.locations.length) lines.push('', '## 地点事实', facts.locations.map(function(item) { return '- ' + item; }).join('\n'));
        if (facts.items.length) lines.push('', '## 物品事实', facts.items.map(function(item) { return '- ' + item; }).join('\n'));
        if (facts.roles.length) lines.push('', '## 角色资料', '| 角色 | 性别 | 身份/定位 | 所属势力 | 核心目标 | 对话风格 | 人物弧线 | 人物简介 | 当前状态 | 写作提醒 |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |', facts.roles.map(function(role) { return '| ' + roleFactLine(role).split('｜').join(' | ') + ' |'; }).join('\n'));
        if (facts.relations.length) lines.push('', '## 角色关系', facts.relations.map(function(item) { return item.from + '：—' + item.label + '→' + item.to; }).join('\n'));
        return lines.join('\n');
    }

    async function prepareNormalOutlineMemoryAnalysis(options) {
        const opts = options || {};
        const outline = asText(opts.outlineContent);
        if (outline.length <= DIRECT_OUTLINE_LIMIT) return { segmented: false, sourceContent: outline, taskKey: '' };
        const bookName = asText(opts.bookName);
        const segments = buildNormalOutlineSegments(outline, SEGMENT_LIMIT);
        const sourceHash = hashText(outline);
        const taskKey = getTaskKey(bookName, sourceHash);
        let task = await readTask(taskKey);
        if (!task || task.version !== TASK_VERSION || task.sourceHash !== sourceHash || task.segmentCount !== segments.length) {
            task = {
                version: TASK_VERSION,
                sourceHash,
                segmentCount: segments.length,
                createdAt: new Date().toISOString(),
                segments: segments.map(function(_, index) { return { index: index + 1, facts: null, completedAt: '' }; })
            };
            await writeTask(taskKey, task);
        }
        for (let index = 0; index < segments.length; index += 1) {
            if (task.segments[index]?.facts) continue;
            window.Utils?.appendLog?.(null, '⏳ 正在提取普通大纲基础设定：第' + (index + 1) + '/' + segments.length + '段', '');
            const facts = await requestSegmentFacts(bookName, segments[index], index + 1, segments.length, opts.modelCfg, opts.requestTraceGroup);
            task.segments[index] = { index: index + 1, facts, completedAt: new Date().toISOString() };
            await writeTask(taskKey, task);
        }
        window.Utils?.appendLog?.(null, '🧩 普通大纲基础设定已汇总，正在生成关联文件', 'progress');
        return { segmented: true, sourceContent: buildMergedAnalysisSource(task), taskKey };
    }

    async function completeNormalOutlineMemoryAnalysis(result) {
        const taskKey = asText(result?.taskKey);
        if (result?.segmented && taskKey) await removeTask(taskKey);
    }

    async function cancelNormalOutlineMemoryAnalysis(result) {
        const taskKey = asText(result?.taskKey);
        if (taskKey) await removeTask(taskKey);
    }

    window.ZHIYU_NORMAL_OUTLINE_MEMORY_ANALYSIS = Object.freeze({
        DIRECT_OUTLINE_LIMIT,
        SEGMENT_LIMIT,
        MAX_ROLE_COUNT,
        MAX_RELATION_COUNT,
        buildNormalOutlineSegments,
        normalizeFactObject,
        buildMergedAnalysisSource,
        prepareNormalOutlineMemoryAnalysis,
        completeNormalOutlineMemoryAnalysis,
        cancelNormalOutlineMemoryAnalysis
    });
    window.prepareNormalOutlineMemoryAnalysis = prepareNormalOutlineMemoryAnalysis;
    window.completeNormalOutlineMemoryAnalysis = completeNormalOutlineMemoryAnalysis;
    window.cancelNormalOutlineMemoryAnalysis = cancelNormalOutlineMemoryAnalysis;
})(window);
