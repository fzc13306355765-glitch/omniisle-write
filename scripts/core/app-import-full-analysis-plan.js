// 导入作品全文分析：纯计划模块。
// 只负责整理章节、统计字数、拆分安全分析段，不发请求、不写存储。
(function(window) {
    'use strict';

    const MAX_SEGMENT_CHAPTERS = 10;
    const MAX_SEGMENT_WORDS = 30000;
    const MAX_SEGMENT_SOURCE_BYTES = 20 * 1024;
    const MAX_FACT_SEGMENT_UNITS = MAX_SEGMENT_CHAPTERS;
    const LONG_CHAPTER_SLICE_WORDS = 6000;
    const SOURCE_UNIT_METADATA_RESERVE_BYTES = 64;
    const SUMMARY_GROUP_SIZE = 4;
    const SCHEMA_VERSION = '2.0.0';
    const LangExtractChunker = window.ZhiyuLangExtractChunker;
    const CHUNKER_ID = LangExtractChunker?.CHUNKER_ID || 'legacy_natural_slice_v1';

    function toPlainText(value) {
        const raw = String(value || '');
        if (!raw) return '';
        if (typeof window.editorHTMLToPlainText === 'function' && /<[^>]+>/.test(raw)) {
            return window.editorHTMLToPlainText(raw);
        }
        if (!/<[^>]+>/.test(raw)) return raw;
        return raw
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>|<\/div>|<\/li>|<\/h[1-6]>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    function countEffectiveWords(text) {
        const value = toPlainText(text);
        if (typeof window.countChineseWords === 'function') return window.countChineseWords(value);
        return value.replace(/\s/g, '').length;
    }

    function countBillableChars(text) {
        const value = toPlainText(text);
        const chinese = value.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || [];
        const latinAndDigits = value.match(/[A-Za-z0-9]/g) || [];
        return chinese.length + latinAndDigits.length;
    }

    function countUtf8Bytes(value) {
        let bytes = 0;
        for (const char of String(value || '')) {
            const code = char.codePointAt(0);
            if (code <= 0x7f) bytes += 1;
            else if (code <= 0x7ff) bytes += 2;
            else if (code <= 0xffff) bytes += 3;
            else bytes += 4;
        }
        return bytes;
    }

    function estimateSourceUnitBytes(unit) {
        return countUtf8Bytes([
            '<source-unit',
            ' unit-id="' + String(unit?.unitId || '') + '"',
            ' chapter-id="' + String(unit?.chapterId || '') + '"',
            ' volume="' + String(unit?.volumeTitle || unit?.volume || '').replace(/"/g, '') + '"',
            ' chapter="' + String(unit?.chapterTitle || unit?.sourceTitle || unit?.title || '').replace(/"/g, '') + '"',
            ' part="' + (Number(unit?.partIndex || 0) + 1) + '/' + Number(unit?.sliceTotal || 1) + '">',
            String(unit?.content || ''),
            '</source-unit>\n\n'
        ].join(''));
    }

    function hashText(value) {
        if (typeof window.ZhiyuImportFullAnalysisSchema?.hashText === 'function') {
            return window.ZhiyuImportFullAnalysisSchema.hashText(value);
        }
        const text = String(value == null ? '' : value);
        let hash = 2166136261;
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(16).padStart(8, '0');
    }

    function stableId(prefix, parts) {
        if (typeof window.ZhiyuImportFullAnalysisSchema?.makeStableId === 'function') {
            return window.ZhiyuImportFullAnalysisSchema.makeStableId(prefix, parts);
        }
        return String(prefix) + '_' + hashText((parts || []).join('\u241f'));
    }

    function parseChapterNumber(title, fallback) {
        if (typeof window.parseChapterNum === 'function') {
            const parsed = Number(window.parseChapterNum(title));
            if (Number.isFinite(parsed) && parsed > 0) return parsed;
        }
        const match = String(title || '').match(/第\s*([一二三四五六七八九十百千万\d]+)\s*章/);
        if (match) {
            const n = Number(match[1]);
            if (Number.isFinite(n) && n > 0) return n;
        }
        return fallback || 0;
    }

    function normalizeChapter(chapter, index) {
        const content = toPlainText(chapter && chapter.content);
        const title = String(chapter?.title || chapter?.name || ('第' + (index + 1) + '章')).trim();
        const explicitVolume = String(chapter?.volume || chapter?.volumeName || chapter?.volName || '').trim();
        const volume = explicitVolume || '第一卷';
        const wordCount = countEffectiveWords(content);
        const originalIndex = Number.isInteger(chapter?._importOriginalIndex) && chapter._importOriginalIndex >= 0
            ? chapter._importOriginalIndex
            : index;
        const sourceId = String(chapter?.id || chapter?._cid || chapter?._localId || '').trim();
        const explicitChapterNumber = Number(chapter?.chapterNumber);
        return {
            id: sourceId,
            title,
            volume,
            content,
            wordCount,
            globalIndex: index,
            originalIndex,
            chapterNumber: Number.isSafeInteger(explicitChapterNumber) && explicitChapterNumber > 0
                ? explicitChapterNumber
                : parseChapterNumber(title, index + 1),
            selected: chapter?.selected !== false,
            hasExplicitVolume: !!explicitVolume,
            sourceChapterId: sourceId
        };
    }

    function restoreOriginalOrder(chapters) {
        const source = Array.isArray(chapters) ? chapters : [];
        const orderer = window.ZhiyuFullTextAnalysisCore?.orderImportChapters;
        if (typeof orderer === 'function') return orderer(source, 'original').chapters;
        return source.slice().sort(function(a, b) {
            const aIndex = Number.isInteger(a?._importOriginalIndex) ? a._importOriginalIndex : source.indexOf(a);
            const bIndex = Number.isInteger(b?._importOriginalIndex) ? b._importOriginalIndex : source.indexOf(b);
            return aIndex - bIndex;
        });
    }

    function assertOriginalOrder(chapters) {
        let previous = -1;
        (Array.isArray(chapters) ? chapters : []).forEach(function(chapter) {
            const current = Number(chapter?.originalIndex);
            if (!Number.isInteger(current) || current < 0 || current <= previous) {
                const error = new Error('检测到章节原文顺序异常，已停止全文分析，请重新选择原文件');
                error.code = 'FULL_ANALYSIS_CHAPTER_ORDER';
                throw error;
            }
            previous = current;
        });
        return true;
    }

    function selectAnalysisRange(chapters, requestedScope) {
        const source = (Array.isArray(chapters) ? chapters : []).filter(function(chapter) {
            return chapter?.selected !== false;
        });
        const mode = ['chapter', 'volume'].includes(requestedScope?.mode)
            ? requestedScope.mode
            : 'all';
        if (!source.length || mode === 'all') {
            return {
                chapters: source,
                scope: {
                    mode: 'all',
                    start: 1,
                    end: source.length,
                    label: '全部章节'
                }
            };
        }
        if (mode === 'chapter') {
            const start = Math.max(1, Math.min(source.length, Math.floor(Number(requestedScope?.start || 1))));
            const end = Math.max(1, Math.min(source.length, Math.floor(Number(requestedScope?.end || source.length))));
            if (start > end) {
                const error = new Error('章节分析范围的起始章不能大于结束章');
                error.code = 'FULL_ANALYSIS_INVALID_SCOPE';
                throw error;
            }
            return {
                chapters: source.slice(start - 1, end),
                scope: {
                    mode,
                    start,
                    end,
                    label: '第 ' + start + ' 章至第 ' + end + ' 章'
                }
            };
        }
        const volumeNames = [];
        source.forEach(function(chapter) {
            const name = String(chapter?.volume || chapter?.volumeName || chapter?.volName || '第一卷').trim() || '第一卷';
            if (!volumeNames.includes(name)) volumeNames.push(name);
        });
        const start = Math.max(1, Math.min(volumeNames.length, Math.floor(Number(requestedScope?.start || 1))));
        const end = Math.max(1, Math.min(volumeNames.length, Math.floor(Number(requestedScope?.end || volumeNames.length))));
        if (start > end) {
            const error = new Error('分卷分析范围的起始卷不能大于结束卷');
            error.code = 'FULL_ANALYSIS_INVALID_SCOPE';
            throw error;
        }
        const included = new Set(volumeNames.slice(start - 1, end));
        return {
            chapters: source.filter(function(chapter) {
                const name = String(chapter?.volume || chapter?.volumeName || chapter?.volName || '第一卷').trim() || '第一卷';
                return included.has(name);
            }),
            scope: {
                mode,
                start,
                end,
                startLabel: volumeNames[start - 1],
                endLabel: volumeNames[end - 1],
                label: volumeNames[start - 1] === volumeNames[end - 1]
                    ? volumeNames[start - 1]
                    : volumeNames[start - 1] + '至' + volumeNames[end - 1]
            }
        };
    }

    function flattenSelectedChapters(input) {
        const chapters = [];
        if (Array.isArray(input?.selectedChapters)) {
            input.selectedChapters.forEach(function(chapter) {
                chapters.push(chapter);
            });
        } else if (Array.isArray(input?.chapters)) {
            input.chapters.forEach(function(chapter) {
                chapters.push(chapter);
            });
        } else if (input?.book?.volumes) {
            input.book.volumes.forEach(function(volume) {
                (volume.chapters || []).forEach(function(chapter) {
                    chapters.push({
                        ...chapter,
                        volume: volume.name || '第一卷'
                    });
                });
            });
        }
        const selection = selectAnalysisRange(
            restoreOriginalOrder(chapters),
            input?.analysisScope
        );
        const normalized = selection.chapters.map(normalizeChapter);
        if (!normalized.length) {
            const error = new Error('没有可分析的章节');
            error.code = 'FULL_ANALYSIS_NO_CHAPTERS';
            throw error;
        }
        const volumeOrder = new Map();
        normalized.forEach(function(chapter) {
            if (!volumeOrder.has(chapter.volume)) volumeOrder.set(chapter.volume, volumeOrder.size);
            chapter.volumeOrder = volumeOrder.get(chapter.volume);
            chapter.volumeId = stableId('volume', [chapter.volumeOrder, chapter.volume]);
            chapter.chapterId = chapter.sourceChapterId || stableId('chapter', [
                chapter.volumeId,
                chapter.originalIndex,
                chapter.title
            ]);
            chapter.contentFingerprint = hashText(chapter.content);
            if (!chapter.content.trim()) {
                const error = new Error('章节“' + chapter.title + '”正文为空，已停止全文分析');
                error.code = 'FULL_ANALYSIS_EMPTY_CHAPTER';
                throw error;
            }
        });
        const seen = new Set();
        normalized.forEach(function(chapter) {
            if (seen.has(chapter.chapterId)) {
                const error = new Error('检测到重复章节身份“' + chapter.title + '”，已停止全文分析');
                error.code = 'FULL_ANALYSIS_DUPLICATE_CHAPTER';
                throw error;
            }
            seen.add(chapter.chapterId);
        });
        return {
            chapters: normalized,
            analysisScope: selection.scope
        };
    }

    function chooseNaturalSliceEnd(text, start, preferredEnd) {
        if (preferredEnd >= text.length) return text.length;
        const minEnd = start + Math.floor((preferredEnd - start) * 0.7);
        const windowText = text.slice(minEnd, preferredEnd);
        const markers = ['\n\n', '\n', '。', '！', '？', '；'];
        let best = -1;
        let markerLength = 0;
        markers.forEach(function(marker) {
            const index = windowText.lastIndexOf(marker);
            if (index > best) {
                best = index;
                markerLength = marker.length;
            }
        });
        return best >= 0 ? minEnd + best + markerLength : preferredEnd;
    }

    function sliceLongChapter(chapter) {
        const base = {
            ...chapter,
            unitId: 'unit_00000000',
            chunkerId: CHUNKER_ID,
            sourceTitle: chapter.title,
            partIndex: 0,
            sliceIndex: 1,
            sliceTotal: 1,
            startOffsetInChapter: 0,
            endOffsetInChapter: chapter.content.length
        };
        if (chapter.wordCount <= LONG_CHAPTER_SLICE_WORDS
            && estimateSourceUnitBytes(base) <= MAX_SEGMENT_SOURCE_BYTES) {
            return [base];
        }
        const text = chapter.content;
        const slices = [];
        if (typeof LangExtractChunker?.splitText === 'function') {
            const metadataBytes = estimateSourceUnitBytes({
                ...base,
                content: ''
            });
            const contentByteLimit = MAX_SEGMENT_SOURCE_BYTES
                - metadataBytes
                - SOURCE_UNIT_METADATA_RESERVE_BYTES;
            if (contentByteLimit < 1) {
                const error = new Error('章节“' + chapter.title + '”的来源信息本身超过普通模型安全上限，已停止全文分析');
                error.code = 'FULL_ANALYSIS_SOURCE_METADATA_TOO_LARGE';
                throw error;
            }
            LangExtractChunker.splitText(text, {
                maxBytes: contentByteLimit,
                preferredChars: LONG_CHAPTER_SLICE_WORDS,
                minFillRatio: 0.7
            }).forEach(function(chunk) {
                slices.push({
                    ...chapter,
                    chunkerId: CHUNKER_ID,
                    sourceTitle: chapter.title,
                    content: chunk.content,
                    wordCount: countEffectiveWords(chunk.content),
                    partIndex: slices.length,
                    startOffsetInChapter: chunk.startOffset,
                    endOffsetInChapter: chunk.endOffset
                });
            });
        } else {
        let start = 0;
        while (start < text.length) {
            let preferredEnd = Math.min(text.length, start + LONG_CHAPTER_SLICE_WORDS);
            if (preferredEnd < text.length
                && /[\uD800-\uDBFF]/.test(text[preferredEnd - 1])
                && /[\uDC00-\uDFFF]/.test(text[preferredEnd])) {
                preferredEnd -= 1;
            }
            const end = chooseNaturalSliceEnd(text, start, preferredEnd);
            const part = text.slice(start, end);
            slices.push({
                ...chapter,
                sourceTitle: chapter.title,
                content: part,
                wordCount: countEffectiveWords(part),
                partIndex: slices.length,
                startOffsetInChapter: start,
                endOffsetInChapter: end
            });
            start = end;
        }
        }
        slices.forEach(function(slice, index) {
            slice.sliceIndex = index + 1;
            slice.sliceTotal = slices.length;
            slice.title = chapter.title + '（第' + (index + 1) + '/' + slices.length + '段）';
        });
        return slices;
    }

    function buildSourceUnits(chapters, sourceSnapshotId) {
        const units = [];
        let sourceOffset = 0;
        chapters.forEach(function(chapter) {
            chapter.sourceStartOffset = sourceOffset;
            chapter.sourceEndOffset = sourceOffset + chapter.content.length;
            sliceLongChapter(chapter).forEach(function(item) {
                const unit = {
                    ...item,
                    schemaVersion: SCHEMA_VERSION,
                    unitId: stableId('unit', [
                        sourceSnapshotId,
                        chapter.chapterId,
                        item.partIndex,
                        item.contentFingerprint || hashText(item.content)
                    ]),
                    sourceSnapshotId,
                    chapterId: chapter.chapterId,
                    chapterNumber: chapter.chapterNumber,
                    chapterTitle: chapter.title,
                    chapterOrder: chapter.globalIndex,
                    volumeId: chapter.volumeId,
                    volumeTitle: chapter.volume,
                    startOffset: sourceOffset + item.startOffsetInChapter,
                    endOffset: sourceOffset + item.endOffsetInChapter,
                    contentFingerprint: hashText(item.content),
                    status: 'prepared'
                };
                if (estimateSourceUnitBytes(unit) > MAX_SEGMENT_SOURCE_BYTES) {
                    const error = new Error('章节“' + chapter.title + '”的单个来源段超过普通模型安全上限，已停止全文分析');
                    error.code = 'FULL_ANALYSIS_SOURCE_UNIT_TOO_LARGE';
                    throw error;
                }
                units.push(unit);
            });
            sourceOffset = chapter.sourceEndOffset + 2;
        });
        return units;
    }

    function findExactDuplicateChapterGroups(chapters) {
        const candidatesByFingerprint = new Map();
        (Array.isArray(chapters) ? chapters : []).forEach(function(chapter) {
            const fingerprint = String(chapter?.contentFingerprint || hashText(chapter?.content || ''));
            if (!candidatesByFingerprint.has(fingerprint)) {
                candidatesByFingerprint.set(fingerprint, new Map());
            }
            const candidatesByContent = candidatesByFingerprint.get(fingerprint);
            const content = String(chapter?.content || '');
            if (!candidatesByContent.has(content)) candidatesByContent.set(content, []);
            candidatesByContent.get(content).push(chapter);
        });

        const groups = [];
        candidatesByFingerprint.forEach(function(candidatesByContent, fingerprint) {
            candidatesByContent.forEach(function(groupChapters) {
                if (groupChapters.length < 2) return;
                groups.push({
                    groupId: stableId('duplicate_content', [
                        fingerprint,
                        groupChapters.map(function(chapter) { return chapter.chapterId; }).join('|')
                    ]),
                    contentFingerprint: fingerprint,
                    wordCount: groupChapters[0].wordCount,
                    chapters: groupChapters.map(function(chapter) {
                        return {
                            chapterId: chapter.chapterId,
                            title: chapter.title,
                            volume: chapter.volume,
                            globalIndex: chapter.globalIndex,
                            originalIndex: chapter.originalIndex
                        };
                    })
                });
            });
        });
        return groups;
    }

    function buildSegments(units, options) {
        const maxUnits = Math.max(1, Number(options?.maxUnits || MAX_SEGMENT_CHAPTERS));
        const maxWords = Math.max(1, Number(options?.maxWords || MAX_SEGMENT_WORDS));
        const maxBytes = Math.max(1, Number(options?.maxBytes || MAX_SEGMENT_SOURCE_BYTES));
        const segments = [];
        let current = [];
        let currentWords = 0;
        let currentBytes = 0;

        function flush() {
            if (!current.length) return;
            const first = current[0];
            const last = current[current.length - 1];
            segments.push({
                index: segments.length + 1,
                chapters: current,
                wordCount: currentWords,
                sourceByteCount: currentBytes,
                unitIds: current.map(function(item) { return item.unitId; }),
                chapterIds: Array.from(new Set(current.map(function(item) { return item.chapterId; }))),
                startTitle: first.title,
                endTitle: last.title,
                startChapterNumber: first.chapterNumber,
                endChapterNumber: last.chapterNumber
            });
            current = [];
            currentWords = 0;
            currentBytes = 0;
        }

        units.forEach(function(chapter) {
            const sourceBytes = estimateSourceUnitBytes(chapter);
            const wouldExceedChapters = current.length >= maxUnits;
            const wouldExceedWords = current.length > 0 && currentWords + chapter.wordCount > maxWords;
            const wouldExceedBytes = current.length > 0 && currentBytes + sourceBytes > maxBytes;
            if (wouldExceedChapters || wouldExceedWords || wouldExceedBytes) flush();
            current.push(chapter);
            currentWords += chapter.wordCount;
            currentBytes += sourceBytes;
        });
        flush();

        segments.forEach(function(segment, i) {
            segment.index = i + 1;
            segment.total = segments.length;
        });
        return segments;
    }

    function buildPlan(input) {
        const bookName = String(input?.bookName || '').trim();
        const selection = flattenSelectedChapters(input);
        const chapters = selection.chapters;
        const analysisScope = selection.analysisScope;
        assertOriginalOrder(chapters);
        const sourceWorkId = String(input?.sourceWorkId || input?.book?.id || input?.book?._bid || stableId('source_work', [bookName])).trim();
        const totalWords = chapters.reduce(function(sum, chapter) { return sum + chapter.wordCount; }, 0);
        const totalBillableChars = chapters.reduce(function(sum, chapter) {
            return sum + countBillableChars(chapter.content);
        }, 0);
        const sourceFingerprint = hashText(chapters.map(function(chapter) {
            return [chapter.chapterId, chapter.originalIndex, chapter.contentFingerprint].join(':');
        }).join('|'));
        const sourceSnapshotId = String(input?.sourceSnapshotId || stableId('snapshot', [
            sourceWorkId,
            sourceFingerprint
        ]));
        const sourceUnits = buildSourceUnits(chapters, sourceSnapshotId);
        const duplicateChapterGroups = findExactDuplicateChapterGroups(chapters);
        const chapterUnits = Math.max(1, Math.ceil(chapters.length / MAX_SEGMENT_CHAPTERS));
        const wordUnits = Math.max(1, Math.ceil(totalWords / MAX_SEGMENT_WORDS));
        const segments = buildSegments(sourceUnits);
        const factSegments = segments;
        function reductionCalls(nodeCount) {
            let calls = 0;
            let remaining = Math.max(1, Number(nodeCount || 0));
            do {
                remaining = Math.ceil(remaining / SUMMARY_GROUP_SIZE);
                calls += remaining;
            } while (remaining > 1);
            return calls;
        }
        const chapterCountsByVolume = new Map();
        chapters.forEach(function(chapter) {
            chapterCountsByVolume.set(chapter.volumeId, Number(chapterCountsByVolume.get(chapter.volumeId) || 0) + 1);
        });
        let summaryUnits = 0;
        chapterCountsByVolume.forEach(function(chapterCount) {
            summaryUnits += reductionCalls(chapterCount);
        });
        summaryUnits += reductionCalls(chapterCountsByVolume.size);
        const prescanUnits = 0;
        const factExtractionUnits = factSegments.length;
        const outputUnits = 0;
        const modelOperationUnits = factExtractionUnits + summaryUnits + outputUnits;
        const requestUsage = {
            chapterCount: chapters.length,
            charCount: totalBillableChars,
            chapterCalls: Math.max(1, Math.ceil(chapters.length / MAX_SEGMENT_CHAPTERS)),
            charCalls: Math.max(1, Math.ceil(totalBillableChars / MAX_SEGMENT_WORDS))
        };
        requestUsage.callUnits = Math.max(requestUsage.chapterCalls, requestUsage.charCalls);
        requestUsage.driver = requestUsage.charCalls > requestUsage.chapterCalls ? 'chars' : 'chapters';
        const requestUnits = requestUsage.callUnits;
        const decidingRule = segments.length > Math.max(wordUnits, chapterUnits)
            ? 'bytes'
            : (wordUnits >= chapterUnits ? 'words' : 'chapters');
        const sourceSnapshot = {
            schemaVersion: SCHEMA_VERSION,
            sourceSnapshotId,
            sourceWorkId,
            sourceFingerprint,
            bookName,
            content: chapters.map(function(chapter) { return chapter.content; }).join('\n\n'),
            chapters: chapters.map(function(chapter) {
                return {
                    chapterId: chapter.chapterId,
                    chapterNumber: chapter.chapterNumber,
                    chapterTitle: chapter.title,
                    chapterOrder: chapter.globalIndex,
                    volumeId: chapter.volumeId,
                    volumeTitle: chapter.volume,
                    volumeOrder: chapter.volumeOrder,
                    startOffset: chapter.sourceStartOffset,
                    endOffset: chapter.sourceEndOffset,
                    contentFingerprint: chapter.contentFingerprint,
                    content: chapter.content
                };
            }),
            createdAt: new Date().toISOString()
        };
        return {
            schemaVersion: SCHEMA_VERSION,
            chunkerId: CHUNKER_ID,
            analysisScope,
            bookName,
            sourceWorkId,
            sourceSnapshotId,
            sourceFingerprint,
            sourceSnapshot,
            chapters,
            sourceUnits,
            duplicateChapterGroups,
            totalWords,
            totalBillableChars,
            chapterCount: chapters.length,
            chapterUnits,
            wordUnits,
            summaryUnits,
            prescanUnits,
            factExtractionUnits,
            outputUnits,
            modelOperationUnits,
            requestUsage,
            requestUnits,
            estimatedRequestRange: {
                minimum: requestUnits,
                maximum: requestUnits
            },
            decidingRule,
            segments,
            factSegments,
            createdAt: new Date().toISOString()
        };
    }

    function formatSegmentRange(segment) {
        if (!segment) return '';
        if (segment.startTitle === segment.endTitle) return segment.startTitle;
        return segment.startTitle + ' — ' + segment.endTitle;
    }

    window.ZhiyuImportFullAnalysisPlan = {
        MAX_SEGMENT_CHAPTERS,
        MAX_SEGMENT_WORDS,
        MAX_SEGMENT_SOURCE_BYTES,
        MAX_FACT_SEGMENT_UNITS,
        LONG_CHAPTER_SLICE_WORDS,
        SOURCE_UNIT_METADATA_RESERVE_BYTES,
        SUMMARY_GROUP_SIZE,
        SCHEMA_VERSION,
        CHUNKER_ID,
        toPlainText,
        countEffectiveWords,
        countBillableChars,
        countUtf8Bytes,
        estimateSourceUnitBytes,
        hashText,
        stableId,
        assertOriginalOrder,
        selectAnalysisRange,
        buildSourceUnits,
        findExactDuplicateChapterGroups,
        buildPlan,
        formatSegmentRange
    };
})(window);
