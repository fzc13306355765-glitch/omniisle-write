// 导入作品全文分析：结构化事实、证据和知识快照的数据契约。
// 本模块只做确定性校验与本地证据定位，不发模型请求、不写存储。
(function(window) {
    'use strict';

    const SCHEMA_VERSION = '2.0.0';
    const CERTAINTIES = Object.freeze(['confirmed', 'rumor', 'unknown', 'inferred']);
    const REVIEW_STATUSES = Object.freeze(['unreviewed', 'verified', 'needs_review', 'accepted', 'rejected']);
    const FACT_COLLECTIONS = Object.freeze([
        'characters',
        'characterStateChanges',
        'relationships',
        'events',
        'settings',
        'worldRules',
        'locations',
        'factions',
        'items',
        'cluesIntroduced',
        'cluesResolved',
        'conflicts',
        'unresolvedQuestions',
        'continuationConstraints'
    ]);
    const TASK_STATUSES = Object.freeze([
        'prepared',
        'running',
        'pause_requested',
        'paused',
        'retry_wait',
        'merging',
        'completed_unsaved',
        'saved',
        'failed',
        'cancelled'
    ]);
    const REQUEST_STATUSES = Object.freeze([
        'prepared',
        'dispatched',
        'result_unknown',
        'result_received',
        'committed',
        'failed'
    ]);
    const OUTPUT_SUFFIXES = Object.freeze([
        '设定集',
        '信息表',
        '角色列表',
        '追踪表',
        '边界卡',
        '承接卡',
        '关键事件表',
        '资料索引'
    ]);
    const EVIDENCE_PUNCTUATION_EQUIVALENTS = Object.freeze({
        ',': '，', '，': '，',
        ';': '；', '；': '；',
        ':': '：', '：': '：',
        '?': '？', '？': '？',
        '!': '！', '！': '！',
        '.': '。', '。': '。',
        '"': '"', '“': '"', '”': '"',
        "'": "'", '‘': "'", '’': "'",
        '(': '（', '（': '（',
        ')': '）', '）': '）'
    });

    const CHAPTER_FACT_FIELDS = new Set([
        'schemaVersion', 'chapterFactId', 'taskId', 'sourceSnapshotId',
        'chapterId', 'chapterTitle', 'volumeId', 'volumeTitle', 'chapterOrder',
        'summary', 'evidence', 'validation', 'createdAt',
        ...FACT_COLLECTIONS
    ]);
    const FACT_FIELDS = new Set([
        'factId', 'type', 'name', 'canonicalName', 'aliases', 'statement',
        'description', 'value', 'previousValue', 'state', 'participants',
        'subjectName', 'objectName', 'relation', 'certainty', 'confidence',
        'evidenceIds', 'validFromChapterId', 'changedAtChapterId',
        'validToChapterId', 'userReviewStatus', 'tags'
    ]);
    const EVIDENCE_FIELDS = new Set([
        'evidenceId', 'unitId', 'chapterId', 'startOffset', 'endOffset',
        'quote', 'before', 'after', 'extractorModel', 'promptVersion',
        'confidence', 'reviewStatus', 'candidateOffsets'
    ]);

    function isRecord(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function clone(value) {
        if (typeof structuredClone === 'function') return structuredClone(value);
        return JSON.parse(JSON.stringify(value));
    }

    function hashText(value) {
        const text = String(value == null ? '' : value);
        let hash = 2166136261;
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(16).padStart(8, '0');
    }

    function makeStableId(prefix, parts) {
        return String(prefix || 'id') + '_' + hashText((parts || []).map(function(part) {
            return String(part == null ? '' : part);
        }).join('\u241f'));
    }

    function collectExtraFields(value, allowed, path, errors) {
        if (!isRecord(value)) return;
        Object.keys(value).forEach(function(key) {
            if (!allowed.has(key)) errors.push(path + ' 包含不允许的字段：' + key);
        });
    }

    function requireString(value, path, errors, maxLength) {
        const text = typeof value === 'string' ? value.trim() : '';
        if (!text) errors.push(path + ' 必须是非空文本');
        if (text && maxLength && text.length > maxLength) errors.push(path + ' 超过长度上限 ' + maxLength);
        return text;
    }

    function requireNumber(value, path, errors, min, max) {
        if (!Number.isFinite(value)) {
            errors.push(path + ' 必须是数字');
            return;
        }
        if (value < min || value > max) errors.push(path + ' 必须在 ' + min + ' 到 ' + max + ' 之间');
    }

    function validateEvidence(evidence, path, errors) {
        if (!isRecord(evidence)) {
            errors.push(path + ' 必须是对象');
            return;
        }
        collectExtraFields(evidence, EVIDENCE_FIELDS, path, errors);
        requireString(evidence.evidenceId, path + '.evidenceId', errors, 160);
        requireString(evidence.unitId, path + '.unitId', errors, 160);
        requireString(evidence.chapterId, path + '.chapterId', errors, 160);
        const quote = requireString(evidence.quote, path + '.quote', errors, 500);
        requireNumber(evidence.confidence, path + '.confidence', errors, 0, 1);
        if (!REVIEW_STATUSES.includes(evidence.reviewStatus)) {
            errors.push(path + '.reviewStatus 枚举无效');
        }
        if (evidence.candidateOffsets != null && (!Array.isArray(evidence.candidateOffsets)
            || evidence.candidateOffsets.some(function(item) {
                return !Number.isInteger(item?.startOffset)
                    || !Number.isInteger(item?.endOffset)
                    || item.endOffset <= item.startOffset;
            }))) {
            errors.push(path + '.candidateOffsets 必须是有效字符范围数组');
        }
        const hasStart = Number.isInteger(evidence.startOffset) && evidence.startOffset >= 0;
        const hasEnd = Number.isInteger(evidence.endOffset) && evidence.endOffset >= 0;
        if (evidence.reviewStatus === 'verified') {
            if (!hasStart || !hasEnd || evidence.endOffset <= evidence.startOffset) {
                errors.push(path + ' 已验证证据必须有有效字符位置');
            } else if (quote && evidence.endOffset - evidence.startOffset !== quote.length) {
                errors.push(path + ' 的字符范围与短引长度不一致');
            }
        } else if ((evidence.startOffset != null || evidence.endOffset != null) && (!hasStart || !hasEnd)) {
            errors.push(path + ' 的字符位置必须同时有效或同时为空');
        }
    }

    function validateFact(fact, path, evidenceIds, errors, warnings) {
        if (!isRecord(fact)) {
            errors.push(path + ' 必须是对象');
            return;
        }
        collectExtraFields(fact, FACT_FIELDS, path, errors);
        requireString(fact.factId, path + '.factId', errors, 160);
        requireString(fact.type, path + '.type', errors, 80);
        requireString(fact.statement, path + '.statement', errors, 1200);
        if (!CERTAINTIES.includes(fact.certainty)) errors.push(path + '.certainty 枚举无效');
        requireNumber(fact.confidence, path + '.confidence', errors, 0, 1);
        if (!Array.isArray(fact.evidenceIds) || !fact.evidenceIds.length) {
            errors.push(path + ' 缺少原文证据，不能进入事实账本');
        } else {
            fact.evidenceIds.forEach(function(evidenceId, index) {
                if (!evidenceIds.has(String(evidenceId || ''))) {
                    errors.push(path + '.evidenceIds[' + index + '] 找不到对应证据');
                }
            });
        }
        if (fact.aliases != null && (!Array.isArray(fact.aliases) || fact.aliases.some(function(item) {
            return typeof item !== 'string' || !item.trim();
        }))) {
            errors.push(path + '.aliases 必须是非空文本数组');
        }
        if (fact.participants != null && (!Array.isArray(fact.participants) || fact.participants.some(function(item) {
            return typeof item !== 'string' || !item.trim();
        }))) {
            errors.push(path + '.participants 必须是非空文本数组');
        }
        if (fact.certainty === 'inferred') {
            if (fact.userReviewStatus === 'accepted') {
                errors.push(path + ' 的推测不能直接标记为用户已确认');
            }
            warnings.push(path + ' 是推测，只能进入待确认区');
        }
    }

    function validateChapterFact(value) {
        const errors = [];
        const warnings = [];
        if (!isRecord(value)) return { valid: false, errors: ['ChapterFact 必须是对象'], warnings, value: null };
        collectExtraFields(value, CHAPTER_FACT_FIELDS, 'ChapterFact', errors);
        if (value.schemaVersion !== SCHEMA_VERSION) errors.push('ChapterFact.schemaVersion 不受支持');
        [
            'chapterFactId', 'taskId', 'sourceSnapshotId', 'chapterId',
            'chapterTitle', 'volumeId', 'volumeTitle'
        ].forEach(function(key) {
            requireString(value[key], 'ChapterFact.' + key, errors, 240);
        });
        if (!Number.isInteger(value.chapterOrder) || value.chapterOrder < 0) {
            errors.push('ChapterFact.chapterOrder 必须是非负整数');
        }
        requireString(value.summary, 'ChapterFact.summary', errors, 4000);
        if (!Array.isArray(value.evidence)) errors.push('ChapterFact.evidence 必须是数组');
        const evidenceIds = new Set();
        (Array.isArray(value.evidence) ? value.evidence : []).forEach(function(evidence, index) {
            validateEvidence(evidence, 'ChapterFact.evidence[' + index + ']', errors);
            const id = String(evidence?.evidenceId || '');
            if (id && evidenceIds.has(id)) errors.push('ChapterFact.evidence 存在重复 evidenceId：' + id);
            if (id) evidenceIds.add(id);
        });
        FACT_COLLECTIONS.forEach(function(collection) {
            if (!Array.isArray(value[collection])) {
                errors.push('ChapterFact.' + collection + ' 必须是数组');
                return;
            }
            value[collection].forEach(function(fact, index) {
                validateFact(fact, 'ChapterFact.' + collection + '[' + index + ']', evidenceIds, errors, warnings);
            });
        });
        if (!isRecord(value.validation)) {
            errors.push('ChapterFact.validation 必须是对象');
        } else {
            const allowed = new Set([
                'valid', 'errors', 'warnings', 'evidenceCoverage', 'reviewRequired',
                'processedPartCount', 'totalPartCount', 'complete'
            ]);
            collectExtraFields(value.validation, allowed, 'ChapterFact.validation', errors);
        }
        return { valid: errors.length === 0, errors, warnings, value };
    }

    function assertChapterFact(value) {
        const result = validateChapterFact(value);
        if (!result.valid) {
            const error = new Error('章节事实结构校验失败：' + result.errors.join('；'));
            error.code = 'FULL_ANALYSIS_SCHEMA_INVALID';
            error.validation = result;
            throw error;
        }
        return value;
    }

    function stripJsonWrapper(value) {
        return String(value == null ? '' : value)
            .replace(/^\uFEFF/, '')
            .trim()
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/, '')
            .trim();
    }

    function parseJsonResponse(value, options) {
        let text = stripJsonWrapper(value);
        let repaired = false;
        try {
            return { value: JSON.parse(text), repaired };
        } catch (firstError) {
            if (options?.allowMechanicalRepair !== true) throw firstError;
            const repairedText = text
                .replace(/,\s*([}\]])/g, '$1')
                .replace(/[\u201c\u201d]/g, '"');
            if (repairedText !== text) {
                try {
                    return {
                        value: JSON.parse(repairedText),
                        repaired: true,
                        repairMethod: 'basic'
                    };
                } catch (basicRepairError) {}
            }
            const jsonrepair = window.JSONRepair?.jsonrepair;
            if (typeof jsonrepair !== 'function') throw firstError;
            text = jsonrepair(text);
            repaired = true;
            return {
                value: JSON.parse(text),
                repaired,
                repairMethod: 'jsonrepair'
            };
        }
    }

    function findAllOccurrences(text, quote) {
        const offsets = [];
        let from = 0;
        while (quote && from <= text.length) {
            const index = text.indexOf(quote, from);
            if (index < 0) break;
            offsets.push(index);
            from = index + Math.max(1, quote.length);
        }
        return offsets;
    }

    function normalizeEvidencePunctuation(value) {
        const text = String(value || '');
        const tokens = [];
        for (let index = 0; index < text.length; index += 1) {
            const char = text[index];
            if (/\s/.test(char)) continue;
            if (char === '.' && text[index + 1] === '.') {
                let end = index + 2;
                while (text[end] === '.') end += 1;
                tokens.push({ value: '…', start: index, end });
                index = end - 1;
                continue;
            }
            if (char === '…') {
                let end = index + 1;
                while (text[end] === '…') end += 1;
                tokens.push({ value: '…', start: index, end });
                index = end - 1;
                continue;
            }
            const punctuation = EVIDENCE_PUNCTUATION_EQUIVALENTS[char];
            tokens.push({
                value: punctuation || char,
                start: index,
                end: index + 1
            });
        }
        return {
            text: tokens.map(function(item) { return item.value; }).join(''),
            tokens
        };
    }

    function findPunctuationEquivalentOccurrences(text, quote) {
        const semanticLength = (String(quote || '').match(/[\u3400-\u9fffA-Za-z0-9]/g) || []).length;
        if (semanticLength < 8) return [];
        const normalizedText = normalizeEvidencePunctuation(text);
        const normalizedQuote = normalizeEvidencePunctuation(quote).text;
        if (!normalizedQuote) return [];
        return findAllOccurrences(normalizedText.text, normalizedQuote).map(function(index) {
            const first = normalizedText.tokens[index];
            const last = normalizedText.tokens[index + normalizedQuote.length - 1];
            if (!first || !last) return null;
            return {
                index: first.start,
                endIndex: last.end,
                quote: text.slice(first.start, last.end)
            };
        }).filter(Boolean);
    }

    function resolveEvidenceOffsets(rawEvidence, sourceUnit) {
        const evidence = clone(rawEvidence || {});
        const text = String(sourceUnit?.content || '');
        let quote = String(evidence.quote || '').trim();
        const baseOffset = Number.isInteger(sourceUnit?.startOffset) ? sourceUnit.startOffset : 0;
        const occurrences = findAllOccurrences(text, quote);
        let candidates = occurrences.map(function(index) {
            return { index, endIndex: index + quote.length, quote };
        });
        if (!candidates.length) {
            candidates = findPunctuationEquivalentOccurrences(text, quote);
        }
        const before = String(evidence.before || '').trim();
        const after = String(evidence.after || '').trim();
        if (candidates.length > 1 && (before || after)) {
            candidates = candidates.filter(function(candidate) {
                const beforeMatches = !before
                    || text.slice(Math.max(0, candidate.index - before.length), candidate.index) === before;
                const afterMatches = !after
                    || text.slice(candidate.endIndex, candidate.endIndex + after.length) === after;
                return beforeMatches && afterMatches;
            });
        }
        evidence.unitId = String(sourceUnit?.unitId || evidence.unitId || '');
        evidence.chapterId = String(sourceUnit?.chapterId || evidence.chapterId || '');
        if (candidates.length === 1) {
            quote = candidates[0].quote;
            evidence.quote = quote;
            evidence.startOffset = baseOffset + candidates[0].index;
            evidence.endOffset = baseOffset + candidates[0].endIndex;
            evidence.reviewStatus = 'verified';
            evidence.candidateOffsets = [];
        } else {
            evidence.startOffset = null;
            evidence.endOffset = null;
            evidence.reviewStatus = 'needs_review';
            evidence.candidateOffsets = candidates.map(function(candidate) {
                return {
                    startOffset: baseOffset + candidate.index,
                    endOffset: baseOffset + candidate.endIndex
                };
            });
        }
        return {
            evidence,
            matched: candidates.length === 1,
            ambiguous: candidates.length > 1,
            occurrenceCount: candidates.length
        };
    }

    function validateAnalysisTask(task) {
        const errors = [];
        if (!isRecord(task)) return { valid: false, errors: ['AnalysisTask 必须是对象'] };
        ['taskId', 'ownerId', 'sourceWorkId', 'sourceSnapshotId', 'sourceFingerprint', 'mode'].forEach(function(key) {
            requireString(task[key], 'AnalysisTask.' + key, errors, 240);
        });
        if (task.schemaVersion !== SCHEMA_VERSION) errors.push('AnalysisTask.schemaVersion 不受支持');
        if (!TASK_STATUSES.includes(task.status)) errors.push('AnalysisTask.status 枚举无效');
        if (!['automatic', 'staged'].includes(task.mode)) errors.push('AnalysisTask.mode 枚举无效');
        return { valid: errors.length === 0, errors };
    }

    function validateSourceUnit(unit) {
        const errors = [];
        if (!isRecord(unit)) return { valid: false, errors: ['SourceUnit 必须是对象'] };
        ['unitId', 'sourceSnapshotId', 'volumeId', 'chapterId', 'contentFingerprint'].forEach(function(key) {
            requireString(unit[key], 'SourceUnit.' + key, errors, 240);
        });
        ['volumeOrder', 'chapterOrder', 'partIndex', 'startOffset', 'endOffset'].forEach(function(key) {
            if (!Number.isInteger(unit[key]) || unit[key] < 0) errors.push('SourceUnit.' + key + ' 必须是非负整数');
        });
        if (Number.isInteger(unit.startOffset) && Number.isInteger(unit.endOffset) && unit.endOffset <= unit.startOffset) {
            errors.push('SourceUnit 字符范围无效');
        }
        return { valid: errors.length === 0, errors };
    }

    function validateCanonicalEntity(entity) {
        const errors = [];
        if (!isRecord(entity)) return { valid: false, errors: ['CanonicalEntity 必须是对象'] };
        ['entityId', 'entityType', 'canonicalName', 'firstSeenChapterId', 'lastSeenChapterId'].forEach(function(key) {
            requireString(entity[key], 'CanonicalEntity.' + key, errors, 240);
        });
        if (!Array.isArray(entity.aliases)) errors.push('CanonicalEntity.aliases 必须是数组');
        if (!Array.isArray(entity.stateHistory)) errors.push('CanonicalEntity.stateHistory 必须是数组');
        if (!Array.isArray(entity.evidenceIds) || !entity.evidenceIds.length) {
            errors.push('CanonicalEntity.evidenceIds 不能为空');
        }
        return { valid: errors.length === 0, errors };
    }

    function validateSummaryNode(node) {
        const errors = [];
        if (!isRecord(node)) return { valid: false, errors: ['SummaryNode 必须是对象'] };
        ['summaryNodeId', 'contentFingerprint', 'status'].forEach(function(key) {
            requireString(node[key], 'SummaryNode.' + key, errors, 240);
        });
        if (!['chapter', 'volume', 'book'].includes(node.level)) errors.push('SummaryNode.level 枚举无效');
        if (!Array.isArray(node.sourceNodeIds) || !Array.isArray(node.sourceFactIds)) {
            errors.push('SummaryNode 来源必须是数组');
        }
        if (!isRecord(node.content)) errors.push('SummaryNode.content 必须是结构化对象');
        return { valid: errors.length === 0, errors };
    }

    function validateOutputBundle(bundle) {
        const errors = [];
        if (!isRecord(bundle)) return { valid: false, errors: ['OutputBundle 必须是对象'] };
        if (bundle.schemaVersion !== SCHEMA_VERSION) errors.push('OutputBundle.schemaVersion 不受支持');
        if (!isRecord(bundle.files)) {
            errors.push('OutputBundle.files 必须是对象');
        } else {
            OUTPUT_SUFFIXES.forEach(function(suffix) {
                requireString(bundle.files[suffix], 'OutputBundle.files.' + suffix, errors);
            });
        }
        if (!isRecord(bundle.coverage)) errors.push('OutputBundle.coverage 必须是对象');
        return { valid: errors.length === 0, errors };
    }

    function createKnowledgeSnapshot(input) {
        const source = input || {};
        const ownerId = requireSnapshotText(source.ownerId, 'ownerId');
        const targetWorkId = requireSnapshotText(source.targetWorkId, 'targetWorkId');
        const taskId = requireSnapshotText(source.sourceTaskId, 'sourceTaskId');
        const sourceSnapshotId = requireSnapshotText(source.sourceSnapshotId, 'sourceSnapshotId');
        const facts = clone(Array.isArray(source.facts) ? source.facts : []);
        facts.forEach(assertChapterFact);
        const evidence = clone(Array.isArray(source.evidence) ? source.evidence : facts.flatMap(function(fact) {
            return Array.isArray(fact.evidence) ? fact.evidence : [];
        }));
        return {
            schemaVersion: SCHEMA_VERSION,
            knowledgeSnapshotId: String(source.knowledgeSnapshotId || makeStableId('knowledge', [ownerId, targetWorkId, taskId])),
            ownerId,
            targetWorkId,
            sourceTaskId: taskId,
            sourceSnapshotId,
            factLedgerRevision: Number(source.factLedgerRevision || 1),
            entityRevision: Number(source.entityRevision || 1),
            summaryRevision: Number(source.summaryRevision || 1),
            facts,
            entities: clone(Array.isArray(source.entities) ? source.entities : []),
            summaryNodes: clone(Array.isArray(source.summaryNodes) ? source.summaryNodes : []),
            evidence,
            continuationIndex: clone(isRecord(source.continuationIndex) ? source.continuationIndex : {}),
            createdAt: String(source.createdAt || new Date().toISOString()),
            status: 'ready'
        };
    }

    function requireSnapshotText(value, name) {
        const text = String(value || '').trim();
        if (!text) throw new Error('生成知识快照缺少 ' + name);
        return text;
    }

    window.ZhiyuImportFullAnalysisSchema = {
        SCHEMA_VERSION,
        CERTAINTIES,
        REVIEW_STATUSES,
        FACT_COLLECTIONS,
        TASK_STATUSES,
        REQUEST_STATUSES,
        OUTPUT_SUFFIXES,
        hashText,
        makeStableId,
        parseJsonResponse,
        resolveEvidenceOffsets,
        validateAnalysisTask,
        validateSourceUnit,
        validateChapterFact,
        assertChapterFact,
        validateCanonicalEntity,
        validateSummaryNode,
        validateOutputBundle,
        createKnowledgeSnapshot
    };
})(window);
