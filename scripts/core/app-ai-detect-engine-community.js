// AI detection rule engine split from app-ai-detect-test.js.
// It only scans text and returns hit ranges; UI highlighting/reporting stays in app-ai-detect-test.js.
(function(window) {
    'use strict';

    const AI_DETECT_RULES = [
        { label: 'AI结构承接词', level: 'warning', pattern: /(?:首先|其次|最后|综上所述|总而言之|因此|此外|值得注意的是|由此可见|一方面|另一方面|与此同时|毫无疑问|不可否认|换句话说|从某种意义上来说|众所周知|事实上|显而易见)/g },
        { label: '空泛评价词', level: 'warning', pattern: /(?:复杂的情绪|难以言喻|无法形容|深深地|微微一愣|眼神复杂|心中一震|心头一紧|不由得|忍不住|微妙变化|不可名状|难以捕捉|复杂难辨)/g },
        { label: '微表情滥用', level: 'info', pattern: /(?:嘴角(?:上扬|勾起|抽动|抿起|微微一勾)|眼(?:里|底)(?:闪过|掠过|浮现|涌起)|眉头(?:微蹙|紧锁|舒展)|瞳孔(?:骤然?收缩|微缩|放大)|目光(?:微沉|微动|闪烁|一闪)|眸光一闪|脸色微变)/g },
        { label: '声线标签', level: 'warning', pattern: /(?:(?:低沉|沙哑|冰冷|微颤)地说|声音(?:沙哑|微颤|发紧|发沉)|语气(?:冰冷|低沉|复杂|平静)|带着[^。！？\n]{0,12}(?:口吻|语气)|声音里带着[^。！？\n]{0,12}|一字(?:一顿|一句))/g },
        { label: '生理反应模板', level: 'warning', pattern: /(?:心脏猛地一(?:缩|跳)|心脏漏跳一拍|呼吸一(?:窒|滞|紧)|血液(?:凝固|沸腾|逆流)|指尖(?:泛白|冰凉|发麻|微颤)|喉咙(?:发紧|发干|哽住)|后背发凉|脑海一片空白)/g },
        { label: '环境模板', level: 'info', pattern: /(?:夜幕降临|华灯初上|月光如水|空气(?:仿佛)?凝固|时间(?:仿佛)?静止|整个世界安静了|夕阳西下|晨曦微露)/g },
        { label: '比喻模板', level: 'warning', pattern: /(?:像一(?:把刀|记重锤|颗子弹)|仿佛[^。！？\n]{0,30}一般|宛如[^。！？\n]{0,30}|犹如[^。！？\n]{0,30}|好似[^。！？\n]{0,30}|如同[^。！？\n]{0,30}一般)/g },
        { label: '机械总结句式', level: 'critical', pattern: /(?:这不仅仅是[^。！？\n]{0,30}更是|不是[^。！？\n]{0,30}而是|既是[^。！？\n]{0,30}也是|与其[^。！？\n]{0,30}不如|既[^。！？\n]{0,18}又[^。！？\n]{0,18})/g },
        { label: '过度解释提示', level: 'critical', pattern: /(?:他知道，|她知道，|他明白，|她明白，|这意味着|这代表着|这说明了|原因很简单|换而言之|也就是说)/g },
        { label: '叙事预告腔', level: 'critical', pattern: /(?:那一刻|那一瞬间|从这一刻起|命运的齿轮|后来没有以后了|有些门打开了就关不上|殊不知|岂不知|他不知道的是|她不知道的是|真正的开始|再也不是从前的)/g }
    ];

    const AI_DETECT_STRUCTURE_TERMS = /(?:因为|所以|意味着|说明|代表|原因|可见|因此|由此可见|这也正是)/g;
    const AI_DETECT_ACTION_TERMS = /(?:嘴角|眼神|目光|眉头|瞳孔|呼吸|心脏|指尖|喉咙|拳头|脸色|眸光|后背|脑海)/g;

    function getAIDetectParagraphs(text) {
        var segments = [];
        var re = /[^\n]+/g;
        var m;
        while ((m = re.exec(text)) !== null) {
            var raw = m[0];
            var trimmed = raw.trim();
            if (!trimmed) continue;
            var offset = raw.indexOf(trimmed);
            segments.push({
                text: trimmed,
                start: m.index + offset,
                end: m.index + offset + trimmed.length
            });
        }
        return segments;
    }

    function getAIDetectSentences(paragraphText, paragraphStart) {
        var sentences = [];
        var re = /[^。！？!?；;\n]+[。！？!?；;]*/g;
        var m;
        while ((m = re.exec(paragraphText)) !== null) {
            var sentence = m[0].trim();
            if (!sentence) continue;
            var offset = m[0].indexOf(sentence);
            var start = paragraphStart + m.index + offset;
            var len = sentence.replace(/\s/g, '').length;
            sentences.push({
                text: sentence,
                start: start,
                end: start + sentence.length,
                len: len
            });
        }
        return sentences;
    }

    function countAIDetectMatches(text, pattern) {
        pattern.lastIndex = 0;
        var count = 0;
        var m;
        while ((m = pattern.exec(text)) !== null) {
            if (m[0]) count++;
            if (count > 20) break;
        }
        return count;
    }

    function makeAIDetectStructureHit(fullText, start, end, label, level, detail) {
        var markerEnd = Math.min(end, start + 80);
        return {
            start: start,
            end: markerEnd,
            text: fullText.slice(start, markerEnd),
            label: label,
            level: level,
            detail: detail
        };
    }

    function collectAIDetectStructureHits(text) {
        var hits = [];
        var paragraphs = getAIDetectParagraphs(text);
        paragraphs.forEach(function(paragraph, index) {
            if (paragraph.text.length >= 300) {
                hits.push(makeAIDetectStructureHit(text, paragraph.start, paragraph.end, '超长段落', 'warning', '第' + (index + 1) + '段超过300字，建议拆成2-3段。'));
            }
            var explainCount = countAIDetectMatches(paragraph.text, AI_DETECT_STRUCTURE_TERMS);
            if (explainCount >= 3) {
                hits.push(makeAIDetectStructureHit(text, paragraph.start, paragraph.end, '解释词密集', 'critical', '第' + (index + 1) + '段解释性词语偏多，建议改成动作、对话或具体细节。'));
            }
            var actionCount = countAIDetectMatches(paragraph.text, AI_DETECT_ACTION_TERMS);
            if (actionCount >= 4) {
                hits.push(makeAIDetectStructureHit(text, paragraph.start, paragraph.end, '动作表情堆叠', 'warning', '第' + (index + 1) + '段动作/表情标签偏密，建议保留最关键的1-2处。'));
            }
            var sentences = getAIDetectSentences(paragraph.text, paragraph.start);
            for (var i = 0; i <= sentences.length - 4; i++) {
                var group = sentences.slice(i, i + 4);
                var lens = group.map(function(s) { return s.len; });
                var minLen = Math.min.apply(null, lens);
                var maxLen = Math.max.apply(null, lens);
                if (minLen >= 18 && maxLen <= 32 && maxLen - minLen <= 8) {
                    hits.push(makeAIDetectStructureHit(text, group[0].start, group[group.length - 1].end, '句长过于均匀', 'warning', '第' + (index + 1) + '段连续4句长度接近，建议加入短句或拆开长句。'));
                    break;
                }
            }
        });
        return hits;
    }

    function collectAIDetectHits(text) {
        var hits = [];
        AI_DETECT_RULES.forEach(function(rule) {
            rule.pattern.lastIndex = 0;
            var m;
            while ((m = rule.pattern.exec(text)) !== null) {
                if (!m[0]) continue;
                hits.push({
                    start: m.index,
                    end: m.index + m[0].length,
                    text: m[0],
                    label: rule.label,
                    level: rule.level
                });
                if (hits.length >= 200) break;
            }
        });
        hits = hits.concat(collectAIDetectStructureHits(text));
        hits.sort(function(a, b) {
            return a.start - b.start || b.end - a.end;
        });
        var filtered = [];
        var lastEnd = -1;
        hits.forEach(function(hit) {
            if (hit.start >= lastEnd) {
                filtered.push(hit);
                lastEnd = hit.end;
            }
        });
        return filtered.slice(0, 200);
    }

    window.ZHIYU_AI_DETECT_ENGINE = {
        AI_DETECT_RULES,
        getAIDetectParagraphs,
        getAIDetectSentences,
        collectAIDetectStructureHits,
        collectAIDetectHits
    };
    window.ZHIYU_AI_DETECT_ENGINE_READY = true;
})(window);
