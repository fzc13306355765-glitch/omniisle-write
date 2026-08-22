// 全文分析长文本无损切块器。
// 算法借鉴 Google LangExtract 的 chunking.py 与 core/tokenizer.py：
// https://github.com/google/langextract/tree/b5fe0baf807ac35ec95b968a71e4d03f198a1b60
// 原项目使用 Apache License 2.0；本文件改写为浏览器原生 JavaScript，并增加 UTF-8 字节上限。
(function(window) {
    'use strict';

    const CHUNKER_ID = 'langextract_unicode_v1';
    const SENTENCE_END_RE = /^[.?!。！？]$/u;
    const SENTENCE_CLOSER_RE = /^[”’"'」』】）》）\]}>》]$/u;
    const NEWLINE_RE = /[\r\n]/u;
    const COMBINING_MARK_RE = /^\p{Mark}$/u;
    const VARIATION_OR_MODIFIER_RE = /^[\uFE00-\uFE0F\u{E0100}-\u{E01EF}\u{1F3FB}-\u{1F3FF}\u20E3]$/u;
    const REGIONAL_INDICATOR_RE = /^[\u{1F1E6}-\u{1F1FF}]$/u;
    // 部分模型服务可能会拒绝过大的 JSON 正文。
    // 默认值必须按实际网页入口的安全上限分包，不能依赖云函数内部更宽松的限制。
    const DEFAULT_UPLOAD_PAYLOAD_BYTES = 64 * 1024;
    const DEFAULT_UPLOAD_PART_BYTES = 384 * 1024;
    const DEFAULT_UPLOAD_PART_CHARS = 120000;
    const MAX_UPLOAD_PAYLOADS = 1000;

    function countUtf8Bytes(value) {
        let bytes = 0;
        for (const char of String(value == null ? '' : value)) {
            const code = char.codePointAt(0);
            if (code <= 0x7f) bytes += 1;
            else if (code <= 0x7ff) bytes += 2;
            else if (code <= 0xffff) bytes += 3;
            else bytes += 4;
        }
        return bytes;
    }

    function fallbackGraphemes(text) {
        const graphemes = [];
        let offset = 0;
        let regionalCount = 0;
        for (const symbol of text) {
            const previous = graphemes[graphemes.length - 1];
            const isRegional = REGIONAL_INDICATOR_RE.test(symbol);
            const joinsPrevious = !!previous && (
                COMBINING_MARK_RE.test(symbol)
                || VARIATION_OR_MODIFIER_RE.test(symbol)
                || symbol === '\u200D'
                || previous.segment.endsWith('\u200D')
                || (isRegional && regionalCount % 2 === 1)
            );
            if (joinsPrevious) {
                previous.segment += symbol;
                previous.end += symbol.length;
            } else {
                graphemes.push({
                    segment: symbol,
                    start: offset,
                    end: offset + symbol.length
                });
            }
            regionalCount = isRegional ? regionalCount + 1 : 0;
            offset += symbol.length;
        }
        return graphemes;
    }

    function segmentGraphemes(value) {
        const text = String(value == null ? '' : value);
        if (!text) return [];
        const Segmenter = window.Intl?.Segmenter
            || (typeof Intl !== 'undefined' ? Intl.Segmenter : null);
        if (typeof Segmenter !== 'function') return fallbackGraphemes(text);
        const segmenter = new Segmenter('zh-CN', { granularity: 'grapheme' });
        return Array.from(segmenter.segment(text), function(entry) {
            return {
                segment: entry.segment,
                start: entry.index,
                end: entry.index + entry.segment.length
            };
        });
    }

    function findNaturalBoundaryIndexes(graphemes) {
        const boundaries = new Set();
        let pendingSentenceEnd = -1;
        graphemes.forEach(function(grapheme, index) {
            const value = grapheme.segment;
            if (pendingSentenceEnd >= 0
                && (SENTENCE_CLOSER_RE.test(value) || SENTENCE_END_RE.test(value))) {
                pendingSentenceEnd = index + 1;
                return;
            }
            if (pendingSentenceEnd >= 0) {
                boundaries.add(pendingSentenceEnd);
                pendingSentenceEnd = -1;
            }
            if (NEWLINE_RE.test(value)) boundaries.add(index + 1);
            if (SENTENCE_END_RE.test(value)) pendingSentenceEnd = index + 1;
        });
        if (pendingSentenceEnd >= 0) boundaries.add(pendingSentenceEnd);
        boundaries.add(graphemes.length);
        return boundaries;
    }

    function findHardEnd(prefixBytes, startIndex, maxBytes) {
        let low = startIndex + 1;
        let high = prefixBytes.length - 1;
        let best = startIndex;
        while (low <= high) {
            const middle = Math.floor((low + high) / 2);
            if (prefixBytes[middle] - prefixBytes[startIndex] <= maxBytes) {
                best = middle;
                low = middle + 1;
            } else {
                high = middle - 1;
            }
        }
        return best;
    }

    function findPreferredEnd(graphemes, startIndex, hardEnd, preferredChars) {
        if (!Number.isFinite(preferredChars)) return hardEnd;
        const preferredOffset = graphemes[startIndex].start + preferredChars;
        let low = startIndex + 1;
        let high = hardEnd;
        let best = startIndex + 1;
        while (low <= high) {
            const middle = Math.floor((low + high) / 2);
            if (graphemes[middle - 1].end <= preferredOffset) {
                best = middle;
                low = middle + 1;
            } else {
                high = middle - 1;
            }
        }
        return Math.min(best, hardEnd);
    }

    function chooseChunkEnd(graphemes, naturalBoundaries, startIndex, targetEnd, minFillRatio) {
        const startOffset = graphemes[startIndex].start;
        const targetOffset = graphemes[targetEnd - 1].end;
        const minOffset = startOffset
            + Math.floor((targetOffset - startOffset) * minFillRatio);
        for (let index = targetEnd; index > startIndex; index -= 1) {
            if (naturalBoundaries.has(index) && graphemes[index - 1].end >= minOffset) {
                return index;
            }
        }
        return targetEnd;
    }

    function splitText(value, options) {
        const text = String(value == null ? '' : value);
        if (!text) return [];
        const maxBytes = Math.floor(Number(options?.maxBytes));
        if (!Number.isFinite(maxBytes) || maxBytes < 1) {
            throw new TypeError('maxBytes 必须是大于 0 的整数');
        }
        const preferredCharsValue = Number(options?.preferredChars);
        const preferredChars = Number.isFinite(preferredCharsValue) && preferredCharsValue > 0
            ? Math.floor(preferredCharsValue)
            : Number.POSITIVE_INFINITY;
        const minFillValue = Number(options?.minFillRatio);
        const minFillRatio = Number.isFinite(minFillValue)
            ? Math.min(1, Math.max(0, minFillValue))
            : 0.7;
        const graphemes = segmentGraphemes(text);
        const naturalBoundaries = findNaturalBoundaryIndexes(graphemes);
        const prefixBytes = [0];
        graphemes.forEach(function(grapheme) {
            prefixBytes.push(prefixBytes[prefixBytes.length - 1] + countUtf8Bytes(grapheme.segment));
        });

        const chunks = [];
        let startIndex = 0;
        while (startIndex < graphemes.length) {
            const hardEnd = findHardEnd(prefixBytes, startIndex, maxBytes);
            if (hardEnd === startIndex) {
                const error = new Error('单个 Unicode 字符簇超过了长文本切块字节上限');
                error.code = 'FULL_ANALYSIS_GRAPHEME_TOO_LARGE';
                error.startOffset = graphemes[startIndex].start;
                throw error;
            }
            const preferredEnd = findPreferredEnd(
                graphemes,
                startIndex,
                hardEnd,
                preferredChars
            );
            const endIndex = chooseChunkEnd(
                graphemes,
                naturalBoundaries,
                startIndex,
                preferredEnd,
                minFillRatio
            );
            const startOffset = graphemes[startIndex].start;
            const endOffset = graphemes[endIndex - 1].end;
            chunks.push({
                startOffset,
                endOffset,
                content: text.slice(startOffset, endOffset),
                byteLength: prefixBytes[endIndex] - prefixBytes[startIndex]
            });
            startIndex = endIndex;
        }
        return chunks;
    }

    function normalizeUploadChapters(chapters) {
        const normalized = (Array.isArray(chapters) ? chapters : []).map(function(chapter, index) {
            const content = String(chapter?.content || '');
            const inputNumber = Number(chapter?.chapterNumber ?? chapter?.number);
            const chapterNumber = Number.isSafeInteger(inputNumber) && inputNumber > 0
                ? inputNumber
                : index + 1;
            return {
                chapterId: 'import-chapter-' + (index + 1),
                sourceIndex: index,
                chapterNumber,
                title: String(chapter?.title || ('第' + chapterNumber + '章')).trim().slice(0, 160),
                volumeName: String(chapter?.volumeName || chapter?.volume || '第一卷').slice(0, 160),
                content
            };
        }).filter(function(chapter) {
            return chapter.content.trim().length > 0;
        }).map(function(chapter, index) {
            return {
                ...chapter,
                chapterId: 'import-chapter-' + (index + 1),
                sourceIndex: index
            };
        });
        const strictlyIncreasing = normalized.every(function(chapter, index) {
            return index === 0 || chapter.chapterNumber > normalized[index - 1].chapterNumber;
        });
        return strictlyIncreasing ? normalized : normalized.map(function(chapter, index) {
            return { ...chapter, chapterNumber: index + 1 };
        });
    }

    function buildUploadEntry(chapter, content, partIndex, partTotal) {
        return {
            chapterId: chapter.chapterId,
            sourceIndex: chapter.sourceIndex,
            chapterNumber: chapter.chapterNumber,
            title: chapter.title,
            volumeName: chapter.volumeName,
            partIndex,
            partTotal,
            content
        };
    }

    function splitUploadChapter(chapter, byteLimit) {
        const initialPartBytes = Math.max(
            1024,
            Math.min(DEFAULT_UPLOAD_PART_BYTES, Math.floor(byteLimit * 0.75))
        );
        const pending = splitText(chapter.content, {
            maxBytes: initialPartBytes,
            preferredChars: DEFAULT_UPLOAD_PART_CHARS,
            minFillRatio: 0.7
        }).map(function(part) {
            return part.content;
        });
        const safeParts = [];
        while (pending.length) {
            const content = pending.shift();
            const probe = JSON.stringify({
                schemaVersion: 1,
                entries: [buildUploadEntry(chapter, content, 0, 1)]
            });
            if (countUtf8Bytes(probe) <= byteLimit) {
                safeParts.push(content);
                continue;
            }
            const contentBytes = countUtf8Bytes(content);
            const refined = splitText(content, {
                maxBytes: Math.max(1, Math.floor(contentBytes / 2)),
                preferredChars: Math.max(1, Math.floor(content.length / 2)),
                minFillRatio: 0
            }).map(function(part) {
                return part.content;
            });
            if (refined.length < 2 || refined.join('') !== content) {
                throw new Error('单个正文片段无法在安全大小内完成上传');
            }
            pending.unshift(...refined);
        }
        return safeParts;
    }

    function buildUploadPayloads(chapters, maxPayloadBytes) {
        const normalized = normalizeUploadChapters(chapters);
        if (!normalized.length) {
            throw new Error('没有可分析的正文，请至少选择一个有内容的章节');
        }
        const byteLimit = Math.max(
            64 * 1024,
            Number(maxPayloadBytes) || DEFAULT_UPLOAD_PAYLOAD_BYTES
        );
        const entries = [];
        normalized.forEach(function(chapter) {
            const parts = splitUploadChapter(chapter, byteLimit);
            parts.forEach(function(content, partIndex) {
                entries.push(buildUploadEntry(chapter, content, partIndex, parts.length));
            });
        });

        const payloads = [];
        let current = [];
        function flush() {
            if (!current.length) return;
            const payloadText = JSON.stringify({ schemaVersion: 1, entries: current });
            const byteLength = countUtf8Bytes(payloadText);
            if (byteLength > byteLimit) {
                throw new Error('单个正文分包超过安全上传大小');
            }
            payloads.push({ payloadText, byteLength, entries: current });
            current = [];
        }
        entries.forEach(function(entry) {
            const candidate = current.concat(entry);
            const candidateBytes = countUtf8Bytes(JSON.stringify({
                schemaVersion: 1,
                entries: candidate
            }));
            if (current.length && candidateBytes > byteLimit) flush();
            current.push(entry);
        });
        flush();
        if (payloads.length > MAX_UPLOAD_PAYLOADS) {
            throw new Error('正文分包数量过多，暂时无法安全分析');
        }
        return {
            chapters: normalized,
            payloads,
            totalBytes: payloads.reduce(function(total, payload) {
                return total + payload.byteLength;
            }, 0)
        };
    }

    window.ZhiyuLangExtractChunker = {
        CHUNKER_ID,
        buildUploadPayloads,
        countUtf8Bytes,
        segmentGraphemes,
        splitText
    };
})(window);
