// AI detection scan/report/highlight logic split from app-main-test.js.
(function(window, document) {
    'use strict';

    const AIDetectEngine = window.ZHIYU_AI_DETECT_ENGINE || {};
    const getAIDetectParagraphs = AIDetectEngine.getAIDetectParagraphs || function() { return []; };
    const getAIDetectSentences = AIDetectEngine.getAIDetectSentences || function() { return []; };
    const collectAIDetectHits = AIDetectEngine.collectAIDetectHits || function() { return []; };

    function getAppState() {
        var state = window.ZHIYU_APP_STATE || window.AppState || {};
        state.outlineGen = state.outlineGen || {};
        return state;
    }

    function getOutlineGenState() {
        return getAppState().outlineGen;
    }

    function escapeHTML(text) {
        return String(text || '').replace(/[&<>"']/g, function(ch) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
        });
    }

    function getEditorPlainText(editor) {
        if (typeof window.getResultBoxPlainText === 'function') return window.getResultBoxPlainText(editor);
        return (editor?.innerText || editor?.textContent || '').replace(/\u00a0/g, ' ');
    }

    function toEditorHTML(text) {
        if (typeof window.plainTextToEditorHTML === 'function') return window.plainTextToEditorHTML(text);
        return escapeHTML(text).replace(/\n/g, '<br>');
    }

    function cloneAIDetectHits(hits) {
        return (Array.isArray(hits) ? hits : []).map(function(hit) {
            return {
                start: Math.max(0, Number(hit.start) || 0),
                end: Math.max(0, Number(hit.end) || 0),
                text: String(hit.text || ''),
                label: hit.label || 'AI味句段',
                level: hit.level || 'warning',
                detail: hit.detail || '',
                suggestion: hit.suggestion || ''
            };
        }).filter(function(hit) {
            return hit.end > hit.start && hit.text;
        });
    }

    function renderAIDetectHighlightHTML(text, hits) {
        var html = '';
        var cursor = 0;
        cloneAIDetectHits(hits).forEach(function(hit) {
            html += escapeHTML(text.slice(cursor, hit.start));
            var title = hit.label + (hit.suggestion ? '：' + hit.suggestion : '');
            html += '<span class="ai-detect-mark ai-detect-' + hit.level + '" title="' + escapeHTML(title) + '">' + escapeHTML(text.slice(hit.start, hit.end)) + '</span>';
            cursor = hit.end;
        });
        html += escapeHTML(text.slice(cursor));
        return html.replace(/\n/g, '<br>');
    }

    function renderAIDetectHighlights(text, hits) {
        return renderAIDetectHighlightHTML(text, hits);
    }

    function clearAIDetectHighlights(restoreOriginal) {
        var resultBox = document.getElementById('resultBox');
        if (!resultBox) return;
        var outlineGen = getOutlineGenState();
        if (restoreOriginal && resultBox.dataset.aiDetectOriginalHtml) {
            var originalText = outlineGen.aiDetectOriginalText || '';
            var currentText = getEditorPlainText(resultBox).trim();
            if (originalText && currentText && currentText !== originalText.trim()) {
                resultBox.innerHTML = toEditorHTML(currentText);
            } else {
                resultBox.innerHTML = resultBox.dataset.aiDetectOriginalHtml;
            }
        }
        delete resultBox.dataset.aiDetectOriginalHtml;
        delete resultBox.dataset.aiDetectActive;
        delete outlineGen.aiDetectOriginalText;
    }

    function getAIDetectHitSuggestion(hit) {
        if (hit && hit.suggestion) return hit.suggestion;
        var label = String(hit?.label || '');
        if (/结构承接词|机械总结/.test(label)) return '删掉机械连接词，改成角色动作、对话或直接推进剧情。';
        if (/空泛评价|过度解释/.test(label)) return '不要解释人物“为什么”，改成一个具体动作、一个反应或一句更有角色味的话。';
        if (/微表情|声线|生理反应/.test(label)) return '保留最关键的一处反应，其余改成更具体的动作、停顿或对话。';
        if (/环境|比喻/.test(label)) return '删掉套话式氛围描写，换成当前场景里真实能看见、听见或闻到的细节。';
        if (/叙事预告/.test(label)) return '去掉“命运感”和预告腔，直接写眼前发生的事，把悬念留给动作和结果。';
        if (/超长段落/.test(label)) return '拆成2到3段，让动作、心理和对话分开落点。';
        if (/句长过于均匀/.test(label)) return '加入短句、断句或单句成段，打破整齐节奏。';
        return '按上下文改得更具体、更像角色当下会说会做的反应。';
    }

    function buildAIDetectReport(text, hits) {
        var critical = hits.filter(function(h) { return h.level === 'critical'; }).length;
        var warning = hits.filter(function(h) { return h.level === 'warning'; }).length;
        var info = hits.filter(function(h) { return h.level === 'info'; }).length;
        var grouped = {};
        hits.forEach(function(hit) {
            var key = hit.label + '|' + hit.level;
            if (!grouped[key]) grouped[key] = { label: hit.label, level: hit.level, items: [] };
            var itemText = hit.detail || hit.text;
            if (grouped[key].items.length < 8 && !grouped[key].items.includes(itemText)) grouped[key].items.push(itemText);
        });
        var lines = [
            'AI检测报告',
            '原文字数：' + text.length,
            '命中总数：' + hits.length + '（高风险' + critical + '，可疑' + warning + '，提示' + info + '）',
            '',
            '处理建议：',
            '1. 红色：优先改，通常是机械句式、解释腔、叙事预告或解释词密集。',
            '2. 黄色：看上下文决定，重点处理声线标签、生理反应、比喻模板和段落结构问题。',
            '3. 蓝色：轻度提醒，微表情和环境模板只有连续出现时再改。',
            '4. 结构类问题只高亮段首，实际修改时看整段节奏。',
            ''
        ];
        Object.keys(grouped).forEach(function(key) {
            var group = grouped[key];
            lines.push('【' + group.label + '】' + group.items.join('、'));
        });
        var suggestions = hits.slice(0, 12).map(function(hit, index) {
            return (index + 1) + '. ' + hit.label + '：' + getAIDetectHitSuggestion(hit);
        });
        if (suggestions.length) {
            lines.push('');
            lines.push('标记修改建议：');
            lines = lines.concat(suggestions);
        }
        if (!hits.length) lines.push('未发现明显AI味或俗套高频表达。');
        return lines.join('\n');
    }

    function getAIDetectSummary(text, hits) {
        var critical = hits.filter(function(h) { return h.level === 'critical'; }).length;
        var warning = hits.filter(function(h) { return h.level === 'warning'; }).length;
        var info = hits.filter(function(h) { return h.level === 'info'; }).length;
        var grouped = {};
        hits.forEach(function(hit) {
            if (!grouped[hit.label]) grouped[hit.label] = { label: hit.label, level: hit.level, count: 0, samples: [] };
            grouped[hit.label].count++;
            var sample = hit.detail || hit.text || '';
            if (sample && grouped[hit.label].samples.length < 3 && !grouped[hit.label].samples.includes(sample)) grouped[hit.label].samples.push(sample);
        });
        var groups = Object.keys(grouped).map(function(key) { return grouped[key]; }).sort(function(a, b) { return b.count - a.count; });
        var recommended = '轻度';
        if (critical >= 4 || hits.length >= 28) recommended = '重度';
        else if (critical > 0 || warning >= 6 || hits.length >= 10) recommended = '中度';
        return { textLength: text.length, total: hits.length, critical: critical, warning: warning, info: info, groups: groups, recommended: recommended };
    }

    function renderAIDetectReportHtml(text, hits) {
        var summary = getAIDetectSummary(text, hits);
        var typeChips = summary.groups.slice(0, 8).map(function(group) {
            var levelClass = group.level === 'critical' ? 'critical' : (group.level === 'warning' ? 'warning' : 'info');
            return '<span class="ap-chip ' + levelClass + '">' + escapeHTML(group.label) + ' ' + group.count + '</span>';
        }).join('');
        var detailHtml = summary.groups.slice(0, 6).map(function(group) {
            var samples = group.samples.length ? group.samples.map(function(s) { return escapeHTML(s); }).join('、') : '暂无样例';
            return '<div style="font-size:12px;line-height:1.7;margin-top:6px;"><strong>' + escapeHTML(group.label) + '：</strong>' + samples + '</div>';
        }).join('');
        if (!detailHtml) detailHtml = '<div style="font-size:12px;color:#6b7280;">未发现明显 AI 味或俗套高频表达。</div>';
        return [
            '<div class="ap-report-meta">',
            '<div class="ap-report-stat"><strong>' + summary.total + '</strong><span>问题数量</span></div>',
            '<div class="ap-report-stat"><strong>' + summary.critical + '/' + summary.warning + '</strong><span>重度/轻度</span></div>',
            '<div class="ap-report-stat"><strong>' + summary.recommended + '</strong><span>推荐力度</span></div>',
            '</div>',
            '<div class="ap-report-title">主要问题类型</div>',
            '<div class="ap-chip-list">' + (typeChips || '<span class="ap-chip">暂无明显问题</span>') + '</div>',
            '<div class="ap-report-title" style="margin-top:10px;">详细命中</div>',
            detailHtml
        ].join('');
    }

    function buildAIDetectAIPrompts(text) {
        return {
            system: '你是网文AI味检测编辑。只检测，不改写。请指出高风险AI味句段、原因和修改方向，并在末尾输出 ===AI_DETECT_MARKERS_JSON=== JSON数组 ===END===。',
            user: '待检测网文章节：\n' + String(text || '')
        };
    }

    function parseAIDetectAIResult(raw) {
        var text = String(raw || '').trim().replace(/^```(?:json|markdown|md|text)?\s*/i, '').replace(/```$/i, '').trim();
        var markers = [];
        var report = text;
        var blockMatch = text.match(/===AI_DETECT_MARKERS_JSON===([\s\S]*?)(?:===END===|$)/i);
        var jsonText = '';
        var markerPayloadParsed = false;
        if (blockMatch) {
            jsonText = blockMatch[1].trim();
            report = text.replace(/===AI_DETECT_MARKERS_JSON===[\s\S]*?(?:===END===|$)/i, '').trim();
        } else {
            var arrayMatch = text.match(/(\[[\s\S]*\])\s*$/);
            if (arrayMatch) {
                jsonText = arrayMatch[1].trim();
                report = text.slice(0, arrayMatch.index).trim();
            }
        }
        if (jsonText) {
            jsonText = jsonText.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
            try {
                var parsed = JSON.parse(jsonText);
                if (Array.isArray(parsed)) {
                    markers = parsed;
                    markerPayloadParsed = true;
                }
            } catch(e) {
                markers = [];
            }
        }
        report = report.replace(/^===AI检测报告===\s*/i, '').trim();
        return {
            report: report || 'AI检测完成，但模型未返回可展示报告。',
            markers: markers,
            markerPayloadParsed: markerPayloadParsed,
            valid: !!report
        };
    }

    function normalizeAIDetectMarkerLevel(level) {
        var v = String(level || '').toLowerCase();
        if (v === 'high' || v === 'red' || v === 'critical' || v.indexOf('高') >= 0 || v.indexOf('重') >= 0) return 'critical';
        return 'warning';
    }

    function buildAIDetectHitsFromMarkers(text, markers) {
        var hits = [];
        var used = [];
        (Array.isArray(markers) ? markers : []).forEach(function(marker) {
            var snippet = String(marker?.text || '').trim();
            if (!snippet || snippet.length < 2) return;
            var range = findAIDetectSnippetRange(text, snippet, 0);
            if (!range) return;
            var overlaps = used.some(function(item) { return range.start < item.end && range.end > item.start; });
            if (overlaps) return;
            used.push(range);
            hits.push({
                start: range.start,
                end: range.end,
                text: text.slice(range.start, range.end),
                label: marker.type || 'AI味句段',
                level: normalizeAIDetectMarkerLevel(marker.level),
                detail: marker.reason || '',
                suggestion: marker.suggestion || ''
            });
        });
        hits.sort(function(a, b) { return a.start - b.start || b.end - a.end; });
        return hits.slice(0, 80);
    }

    function resolveAIDetectHits(text, parsed) {
        if (parsed?.markerPayloadParsed) {
            var markerHits = buildAIDetectHitsFromMarkers(text, parsed.markers);
            if (markerHits.length || !parsed.markers.length) return markerHits;
        }
        return collectAIDetectHits(text);
    }

    function renderAIDetectAIReportHtml(reportText, hits) {
        var critical = hits.filter(function(h) { return h.level === 'critical'; }).length;
        var warning = hits.filter(function(h) { return h.level === 'warning'; }).length;
        var recommended = critical >= 3 ? '重度' : (critical > 0 || warning >= 5 ? '中度' : '轻度');
        var suggestionHtml = hits.slice(0, 12).map(function(hit, index) {
            var sample = String(hit.text || '').replace(/\s+/g, ' ').trim();
            if (sample.length > 80) sample = sample.slice(0, 80) + '...';
            return [
                '<div style="font-size:12px;line-height:1.7;margin-top:8px;padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--bg-card);">',
                '<strong>' + (index + 1) + '. ' + escapeHTML(hit.label || 'AI味句段') + '</strong>',
                '<div style="color:#6b7280;margin-top:4px;">原文：' + escapeHTML(sample) + '</div>',
                hit.detail ? '<div>原因：' + escapeHTML(hit.detail) + '</div>' : '',
                '<div>建议：' + escapeHTML(getAIDetectHitSuggestion(hit)) + '</div>',
                '</div>'
            ].join('');
        }).join('');
        return [
            '<div class="ap-report-meta">',
            '<div class="ap-report-stat"><strong>' + hits.length + '</strong><span>标记数量</span></div>',
            '<div class="ap-report-stat"><strong>' + critical + '/' + warning + '</strong><span>红色/黄色</span></div>',
            '<div class="ap-report-stat"><strong>' + recommended + '</strong><span>AI味风险</span></div>',
            '</div>',
            '<div style="font-size:12px;line-height:1.8;white-space:pre-wrap;color:var(--text);">' + escapeHTML(reportText || 'AI检测完成。') + '</div>',
            suggestionHtml ? '<div class="ap-report-title" style="margin-top:10px;">标记修改建议</div>' + suggestionHtml : ''
        ].join('');
    }

    function buildAIDetectCompactMap(text) {
        var compact = [];
        var map = [];
        String(text || '').split('').forEach(function(ch, index) {
            if (/[\s　]/.test(ch)) return;
            compact.push(ch);
            map.push(index);
        });
        return { text: compact.join(''), map: map };
    }

    function findAIDetectSnippetRange(sourceText, snippet, fromIndex) {
        var source = String(sourceText || '');
        var target = String(snippet || '').trim();
        if (!source || !target) return null;
        var idx = source.indexOf(target, Math.max(0, fromIndex || 0));
        if (idx < 0) idx = source.indexOf(target);
        if (idx >= 0) return { start: idx, end: idx + target.length };
        var sourceMap = buildAIDetectCompactMap(source);
        var targetCompact = target.replace(/[\s　]/g, '');
        if (targetCompact.length < 2) return null;
        var compactStart = sourceMap.map.findIndex(function(index) {
            return index >= Math.max(0, fromIndex || 0);
        });
        var compactIdx = sourceMap.text.indexOf(targetCompact, compactStart >= 0 ? compactStart : 0);
        if (compactIdx < 0) compactIdx = sourceMap.text.indexOf(targetCompact);
        if (compactIdx < 0 && targetCompact.length >= 12) {
            var chunkLength = Math.min(60, Math.max(12, Math.floor(targetCompact.length / 2)));
            var chunkStarts = [0, Math.max(0, targetCompact.length - chunkLength), Math.max(0, Math.floor((targetCompact.length - chunkLength) / 2))];
            for (var i = 0; i < chunkStarts.length; i++) {
                var chunk = targetCompact.slice(chunkStarts[i], chunkStarts[i] + chunkLength);
                if (chunk.length < 8) continue;
                compactIdx = sourceMap.text.indexOf(chunk, compactStart >= 0 ? compactStart : 0);
                if (compactIdx < 0) compactIdx = sourceMap.text.indexOf(chunk);
                if (compactIdx >= 0) {
                    return {
                        start: sourceMap.map[compactIdx],
                        end: sourceMap.map[compactIdx + chunk.length - 1] + 1
                    };
                }
            }
        }
        if (compactIdx < 0) return null;
        return {
            start: sourceMap.map[compactIdx],
            end: sourceMap.map[compactIdx + targetCompact.length - 1] + 1
        };
    }

    function reanchorAIDetectHitsToText(text, oldHits) {
        var hits = [];
        var cursor = 0;
        cloneAIDetectHits(oldHits).forEach(function(hit) {
            var range = findAIDetectSnippetRange(text, hit.text, cursor);
            if (!range) return;
            var overlaps = hits.some(function(item) {
                return range.start < item.end && range.end > item.start;
            });
            if (overlaps) return;
            hits.push({
                start: range.start,
                end: range.end,
                text: text.slice(range.start, range.end),
                label: hit.label || 'AI味句段',
                level: hit.level || 'warning',
                detail: hit.detail || '',
                suggestion: hit.suggestion || ''
            });
            cursor = range.end;
        });
        return hits;
    }

    function buildCurrentAIDetectChapterState(textOverride, hitsOverride) {
        var editor = document.getElementById('resultBox');
        var state = getAppState();
        if (!hitsOverride && editor?.dataset.aiDetectActive !== '1' && !state.outlineGen?.apDetectReportHtml && !state.outlineGen?.apDetectReportText) return null;
        var hits = cloneAIDetectHits(hitsOverride || state.outlineGen?.apDetectHits || []);
        var text = String(textOverride || state.outlineGen?.apDetectText || getEditorPlainText(editor) || '').trim();
        if (!text) return null;
        var reportText = state.outlineGen?.apDetectReportText || '';
        var reportHtml = state.outlineGen?.apDetectReportHtml || '';
        if (!hits.length && !reportText && !reportHtml) return null;
        return {
            text: text,
            hits: hits,
            reportText: reportText,
            reportHtml: reportHtml,
            updatedAt: Date.now()
        };
    }

    function attachCurrentAIDetectStateToChapter(ch, textOverride, hitsOverride) {
        if (!ch) return;
        var state = buildCurrentAIDetectChapterState(textOverride, hitsOverride);
        if (state) ch.aiDetect = state;
        else delete ch.aiDetect;
    }

    function persistCurrentAIDetectStateToChapter(textOverride, hitsOverride) {
        var state = getAppState();
        var s = state.chapter;
        if (!s || !s.book || s.vi < 0 || s.ci < 0 || typeof window.gB !== 'function') return null;
        var books = window.gB();
        var ch = books[s.book]?.volumes?.[s.vi]?.chapters?.[s.ci];
        if (!ch) return null;
        attachCurrentAIDetectStateToChapter(ch, textOverride, hitsOverride);
        if (typeof window.sB === 'function') window.sB(books);
        return ch.aiDetect || null;
    }

    function restoreAIDetectHighlightsForChapter(ch) {
        var editor = document.getElementById('resultBox');
        var saved = ch?.aiDetect;
        if (!editor || !saved) return false;
        var text = getEditorPlainText(editor).trim();
        if (!text) return false;
        var savedHits = Array.isArray(saved.hits) ? saved.hits : [];
        var hits = saved.text === text ? cloneAIDetectHits(savedHits) : reanchorAIDetectHitsToText(text, savedHits);
        var outlineGen = getOutlineGenState();
        outlineGen.apDetectText = text;
        outlineGen.apDetectHits = hits;
        outlineGen.apDetectReportText = saved.reportText || outlineGen.apDetectReportText || '';
        outlineGen.apDetectReportHtml = saved.reportHtml || outlineGen.apDetectReportHtml || renderAIDetectReportHtml(text, hits);
        outlineGen.aiDetectOriginalText = text;
        if (hits.length) {
            editor.dataset.aiDetectOriginalHtml = toEditorHTML(text);
            editor.dataset.aiDetectActive = '1';
            editor.innerHTML = renderAIDetectHighlightHTML(text, hits);
        } else {
            delete editor.dataset.aiDetectOriginalHtml;
            delete editor.dataset.aiDetectActive;
        }
        window.renderAPSidePanel?.();
        window.saveActionContentDraft?.('aiPolish');
        return true;
    }

    function reapplyAIDetectHighlightsAfterRewrite(editor) {
        if (!editor || editor.dataset.aiDetectActive !== '1') return;
        var outlineGen = getOutlineGenState();
        var oldHits = outlineGen.apDetectHits || [];
        if (!oldHits.length) return;
        var text = getEditorPlainText(editor).trim();
        if (!text) return;
        var hits = reanchorAIDetectHitsToText(text, oldHits);
        outlineGen.apDetectText = text;
        outlineGen.apDetectHits = hits;
        outlineGen.aiDetectOriginalText = text;
        editor.dataset.aiDetectOriginalHtml = editor.innerHTML;
        editor.dataset.aiDetectActive = '1';
        if (hits.length) editor.innerHTML = renderAIDetectHighlightHTML(text, hits);
        persistCurrentAIDetectStateToChapter(text, hits);
    }

    function ensureAIDetectState(text, highlight, options) {
        var outlineGen = getOutlineGenState();
        var preserveExisting = !!options?.preserveExisting
            && outlineGen.apDetectText === text
            && !!outlineGen.apDetectReportHtml;
        var hits = preserveExisting && Array.isArray(outlineGen.apDetectHits)
            ? outlineGen.apDetectHits
            : collectAIDetectHits(text);
        outlineGen.apDetectText = text;
        outlineGen.apDetectHits = hits;
        if (!preserveExisting) {
            outlineGen.apDetectReportText = buildAIDetectReport(text, hits);
            outlineGen.apDetectReportHtml = renderAIDetectReportHtml(text, hits);
        }
        if (highlight) {
            var resultBox = document.getElementById('resultBox');
            clearAIDetectHighlights(true);
            if (resultBox) {
                resultBox.dataset.aiDetectOriginalHtml = resultBox.innerHTML;
                outlineGen.aiDetectOriginalText = text;
                resultBox.dataset.aiDetectActive = '1';
                resultBox.innerHTML = renderAIDetectHighlightHTML(text, hits);
                persistCurrentAIDetectStateToChapter(text, hits);
            }
        }
        return { text: text, hits: hits };
    }

    function getAIDetectChapterContext() {
        var state = getAppState();
        var current = state.chapter || {};
        var books = typeof window.gB === 'function' ? window.gB() : {};
        var chapter = books?.[current.book]?.volumes?.[current.vi]?.chapters?.[current.ci];
        return {
            accountUid: String(window.AccountDataScope?.getActiveUid?.() || state.auth?.uid || ''),
            book: String(current.book || ''),
            vi: Number.isFinite(Number(current.vi)) ? Number(current.vi) : -1,
            ci: Number.isFinite(Number(current.ci)) ? Number(current.ci) : -1,
            localId: String(current.localId || chapter?._localId || '')
        };
    }

    var aiDetectRequestSerial = 0;
    var latestAIDetectRequestByChapter = new Map();

    function getAIDetectRequestKey(context) {
        if (!context) return '';
        var chapterKey = context.localId
            ? 'id:' + context.localId
            : 'location:' + context.book + ':' + context.vi + ':' + context.ci;
        return context.accountUid + '|' + chapterKey;
    }

    function getAIDetectRequestKeys(context) {
        if (!context) return [];
        var keys = [];
        var locationKey = context.accountUid + '|location:' + context.book + ':' + context.vi + ':' + context.ci;
        if (context.book && context.vi >= 0 && context.ci >= 0) keys.push(locationKey);
        if (context.localId) keys.push(context.accountUid + '|id:' + context.localId);
        return Array.from(new Set(keys.filter(Boolean)));
    }

    function isLatestAIDetectRequest(context, requestId) {
        var keys = getAIDetectRequestKeys(context);
        if (!keys.length) return false;
        return keys.every(function(key) {
            return latestAIDetectRequestByChapter.get(key) === requestId;
        });
    }

    function isCurrentAIDetectChapter(context) {
        var current = getAIDetectChapterContext();
        return !!context
            && current.accountUid === context.accountUid
            && current.book === context.book
            && current.vi === context.vi
            && current.ci === context.ci
            && current.localId === context.localId;
    }

    function isCurrentAIDetectRequest(context, requestId, abortController, resultBox, sourceText) {
        return isLatestAIDetectRequest(context, requestId)
            && isCurrentAIDetectChapter(context)
            && getOutlineGenState().apAbortController === abortController
            && getEditorPlainText(resultBox).trim() === sourceText;
    }

    function persistAIDetectResultToChapter(context, sourceText, hits, reportText, reportHtml) {
        var state = getAppState();
        var activeUid = String(window.AccountDataScope?.getActiveUid?.() || state.auth?.uid || '');
        if (!context || activeUid !== context.accountUid || typeof window.gB !== 'function') return false;
        var books = window.gB();
        var location = context.localId && typeof window.findChapterLocationByLocalId === 'function'
            ? window.findChapterLocationByLocalId(books, context.localId, context.book)
            : null;
        var chapter = location?.chapter || books?.[context.book]?.volumes?.[context.vi]?.chapters?.[context.ci];
        if (!chapter || (context.localId && String(chapter._localId || '') !== context.localId)) return false;
        function normalizeSource(value) {
            var plain = typeof window.htmlToAIPolishPlainText === 'function'
                ? window.htmlToAIPolishPlainText(value || '')
                : String(window.getChapterContentPlainText?.(value || '') || value || '');
            return String(plain || '')
                .replace(/\r\n?/g, '\n')
                .replace(/\u00a0/g, ' ')
                .replace(/[ \t]+\n/g, '\n')
                .trim();
        }
        var generationKey = typeof window.genTaskKey === 'function'
            ? window.genTaskKey(context.book, context.vi, context.ci)
            : '';
        var generationTask = generationKey ? window.generationTasks?.[generationKey] : null;
        var draftRecord = typeof window.loadDraftRecord === 'function'
            ? window.loadDraftRecord(context.book, context.vi, context.ci)
            : null;
        var normalizedSource = normalizeSource(sourceText);
        var authoritativeContent;
        if (generationTask && Object.prototype.hasOwnProperty.call(generationTask, 'generatedContent')) {
            authoritativeContent = generationTask.generatedContent || '';
        } else {
            var chapterContent = chapter.content || '';
            var draftContent = draftRecord && Object.prototype.hasOwnProperty.call(draftRecord, 'content')
                ? draftRecord.content || ''
                : null;
            if (draftContent === null || normalizeSource(draftContent) === normalizeSource(chapterContent)) {
                authoritativeContent = chapterContent;
            } else {
                var chapterBook = books?.[location?.book || context.book] || {};
                var draftRevision = Number(draftRecord?.updatedAt || 0);
                var chapterRevisionValue = chapter.updatedAt || chapter.modifiedAt || chapter.savedAt
                    || chapter.createdAt || chapterBook.updatedAt || chapterBook.createdAt || '';
                var chapterRevision = Number(chapterRevisionValue);
                if (!Number.isFinite(chapterRevision) || chapterRevision <= 0) {
                    chapterRevision = Date.parse(String(chapterRevisionValue || '')) || 0;
                }
                if (draftRevision > chapterRevision) authoritativeContent = draftContent;
                else if (chapterRevision > draftRevision) authoritativeContent = chapterContent;
                else return false;
            }
        }
        if (normalizeSource(authoritativeContent) !== normalizedSource) return false;
        chapter.aiDetect = {
            text: normalizedSource,
            hits: cloneAIDetectHits(hits),
            reportText: reportText || '',
            reportHtml: reportHtml || '',
            updatedAt: Date.now()
        };
        if (typeof window.sB === 'function') window.sB(books);
        return true;
    }

    async function triggerAIDetect() {
        var resultBox = document.getElementById('resultBox');
        var contentBox = document.getElementById('apContentBox');
        if (!resultBox || !contentBox) return;
        var text = getEditorPlainText(resultBox).trim();
        if (!text) { window.Toast?.warn?.('正文为空，无法检测'); return; }
        var outlineGen = getOutlineGenState();
        if (outlineGen.apAbortController || window.isNaturalizeV2Running?.()) {
            window.Toast?.warn?.('当前消痕任务正在运行，请先停止后再继续');
            return;
        }
        var requestContext = getAIDetectChapterContext();
        var requestKeys = getAIDetectRequestKeys(requestContext);
        var requestId = ++aiDetectRequestSerial;
        requestKeys.forEach(function(key) {
            latestAIDetectRequestByChapter.set(key, requestId);
        });
        clearAIDetectHighlights(true);
        var abortController = new AbortController();
        outlineGen.apAbortController = abortController;
        contentBox.classList.add('generating');
        window.setAIPolishV1ButtonsWorking?.(true);
        contentBox.innerHTML = '<div style="font-size:12px;color:#6b7280;">正在调用AI检测，请稍候...</div>';
        window.setAPStatus?.('正在调用AI检测...', true);
        window.setOGSendWorking?.(true, 'AI检测');
        outlineGen.apMode = 'detect';
        outlineGen.apReportExpanded = true;
        outlineGen.apLockExpanded = false;
        outlineGen.apFinalText = '';
        outlineGen.apContent = '';
        outlineGen.apPolishSourceText = '';
        outlineGen.apPolishSourceChapterKey = '';
        window.setAPApplyEnabled?.(false);
        window.Utils?.appendLog?.(null, '正在AI检测正文AI味', 'progress');
        try {
            var prompts = buildAIDetectAIPrompts(text);
            var modelCfg = window.getActionModelConfig();
            var raw = await window.runAIPolishLLM(prompts.system, prompts.user, abortController, {
                modelCfg: modelCfg,
                templateTitle: 'AI检测',
                maxTokens: 8192,
                fallback: 'AI检测失败'
            });
            if (!String(raw || '').trim()) {
                var emptyDetectError = new Error('AI检测未返回可用报告，本次检测未完成。');
                emptyDetectError.code = 'AI_STREAM_EMPTY';
                throw emptyDetectError;
            }
            var parsed = parseAIDetectAIResult(raw);
            if (!parsed.valid) {
                var invalidDetectError = new Error('AI检测返回格式不完整，本次检测未保存，请重试。');
                invalidDetectError.code = 'AI_DETECT_INVALID_FORMAT';
                throw invalidDetectError;
            }
            var hits = resolveAIDetectHits(text, parsed);
            var reportHtml = renderAIDetectAIReportHtml(parsed.report, hits);
            if (!isLatestAIDetectRequest(requestContext, requestId)) {
                window.Utils?.appendLog?.(null, 'AI检测完成，但该章节已有更新的检测任务，旧结果未写入', 'warn');
                return;
            }
            if (!isCurrentAIDetectRequest(requestContext, requestId, abortController, resultBox, text)) {
                if (abortController.signal.aborted || isCurrentAIDetectChapter(requestContext)) {
                    window.Utils?.appendLog?.(null, 'AI检测完成，但原章节正文或请求状态已变化，结果未写入', 'warn');
                    return;
                }
                var savedToSourceChapter = persistAIDetectResultToChapter(requestContext, text, hits, parsed.report, reportHtml);
                window.Utils?.appendLog?.(
                    null,
                    savedToSourceChapter ? 'AI检测完成，结果已保存到原章节，当前章节未受影响' : 'AI检测完成，但原章节已变化，结果未写入',
                    savedToSourceChapter ? 'success' : 'warn'
                );
                window.renderAPSidePanel?.();
                return;
            }
            outlineGen.apDetectText = text;
            outlineGen.apDetectHits = hits;
            outlineGen.apDetectReportText = parsed.report;
            outlineGen.apDetectReportHtml = reportHtml;
            resultBox.dataset.aiDetectOriginalHtml = resultBox.innerHTML;
            outlineGen.aiDetectOriginalText = text;
            resultBox.dataset.aiDetectActive = '1';
            resultBox.innerHTML = renderAIDetectHighlightHTML(text, hits);
            persistCurrentAIDetectStateToChapter(text, hits);
            window.renderAPSidePanel?.();
            window.saveActionContentDraft?.('aiPolish');
            window.setAPStatus?.('', false);
            window.Utils?.appendLog?.(null, 'AI检测完成，标记' + hits.length + '处', hits.length ? 'info' : 'success');
            if (!hits.length) window.Toast?.warn?.('AI检测完成，未拿到可标记片段');
        } catch(error) {
            if (window.isAbortLikeError?.(error)) {
                window.Utils?.appendLog?.(null, '已停止AI检测', 'warn');
            } else {
                var message = typeof window.formatAiErrorForDisplay === 'function'
                    ? window.formatAiErrorForDisplay(error, 'AI检测失败')
                    : String(error?.message || error || 'AI检测失败');
                window.Utils?.appendLog?.(null, message, 'error');
                if (isCurrentAIDetectRequest(requestContext, requestId, abortController, resultBox, text)) {
                    window.Toast?.error?.(message);
                    contentBox.innerHTML = '<div style="font-size:12px;color:#b42318;">' + escapeHTML(message) + '</div>';
                }
            }
        } finally {
            var currentOutlineGen = getOutlineGenState();
            if (currentOutlineGen.apAbortController === abortController || !currentOutlineGen.apAbortController) {
                contentBox.classList.remove('generating');
                if (currentOutlineGen.apAbortController === abortController) currentOutlineGen.apAbortController = null;
                window.setAPStatus?.('', false);
                window.setOGSendWorking?.(false);
                window.setAIPolishV1ButtonsWorking?.(false);
                window.setAPLockButton?.(window.isCurrentAIPolishSource?.(currentOutlineGen.apLockSourceChapterKey, currentOutlineGen.apLockSourceText) ? 'done' : 'idle');
            }
            requestKeys.forEach(function(key) {
                if (latestAIDetectRequestByChapter.get(key) === requestId) latestAIDetectRequestByChapter.delete(key);
            });
        }
    }

    window.ZHIYU_AI_DETECT_READY = true;
    window.ZHIYU_AI_DETECT = {
        clearAIDetectHighlights,
        getAIDetectParagraphs,
        getAIDetectSentences,
        collectAIDetectHits,
        cloneAIDetectHits,
        renderAIDetectHighlightHTML,
        renderAIDetectHighlights,
        buildAIDetectReport,
        getAIDetectHitSuggestion,
        getAIDetectSummary,
        renderAIDetectReportHtml,
        buildAIDetectAIPrompts,
        parseAIDetectAIResult,
        normalizeAIDetectMarkerLevel,
        buildAIDetectHitsFromMarkers,
        resolveAIDetectHits,
        renderAIDetectAIReportHtml,
        buildCurrentAIDetectChapterState,
        attachCurrentAIDetectStateToChapter,
        persistCurrentAIDetectStateToChapter,
        persistAIDetectResultToChapter,
        restoreAIDetectHighlightsForChapter,
        reapplyAIDetectHighlightsAfterRewrite,
        ensureAIDetectState,
        triggerAIDetect
    };
    window.clearAIDetectHighlights = clearAIDetectHighlights;
    window.cloneAIDetectHits = cloneAIDetectHits;
    window.renderAIDetectHighlightHTML = renderAIDetectHighlightHTML;
    window.renderAIDetectHighlights = renderAIDetectHighlights;
    window.buildAIDetectReport = buildAIDetectReport;
    window.getAIDetectHitSuggestion = getAIDetectHitSuggestion;
    window.getAIDetectSummary = getAIDetectSummary;
    window.renderAIDetectReportHtml = renderAIDetectReportHtml;
    window.buildAIDetectAIPrompts = buildAIDetectAIPrompts;
    window.parseAIDetectAIResult = parseAIDetectAIResult;
    window.normalizeAIDetectMarkerLevel = normalizeAIDetectMarkerLevel;
    window.buildAIDetectHitsFromMarkers = buildAIDetectHitsFromMarkers;
    window.renderAIDetectAIReportHtml = renderAIDetectAIReportHtml;
    window.buildAIDetectCompactMap = buildAIDetectCompactMap;
    window.findAIDetectSnippetRange = findAIDetectSnippetRange;
    window.reanchorAIDetectHitsToText = reanchorAIDetectHitsToText;
    window.buildCurrentAIDetectChapterState = buildCurrentAIDetectChapterState;
    window.attachCurrentAIDetectStateToChapter = attachCurrentAIDetectStateToChapter;
    window.persistCurrentAIDetectStateToChapter = persistCurrentAIDetectStateToChapter;
    window.persistAIDetectResultToChapter = persistAIDetectResultToChapter;
    window.restoreAIDetectHighlightsForChapter = restoreAIDetectHighlightsForChapter;
    window.reapplyAIDetectHighlightsAfterRewrite = reapplyAIDetectHighlightsAfterRewrite;
    window.ensureAIDetectState = ensureAIDetectState;
    window.triggerAIDetect = triggerAIDetect;
})(window, document);
