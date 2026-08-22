(function(window) {
    'use strict';

        function limitContinuityText(value, maxLen) {
            const text = String(value || '').replace(/\s+/g, ' ').replace(/\|/g, '｜').trim();
            if (!text || text === '无' || text === '暂无') return '—';
            return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
        }

        function extractJSONBlock(text) {
            const raw = String(text || '').trim();
            if (!raw) return null;
            try { return JSON.parse(raw); } catch (e) {}
            const match = raw.match(/\{[\s\S]*\}/);
            if (!match) return null;
            try { return JSON.parse(match[0]); } catch (e) { return null; }
        }

        function normalizeContinuityData(data) {
            return {
                lastScene: limitContinuityText(data?.lastScene, 30),
                unfinishedAction: limitContinuityText(data?.unfinishedAction, 30),
                location: limitContinuityText(data?.location, 20),
                presentCharacters: limitContinuityText(data?.presentCharacters, 30),
                characterState: limitContinuityText(data?.characterState, 40),
                emotionAftertaste: limitContinuityText(data?.emotionAftertaste, 30),
                openingSuggestion: limitContinuityText(data?.openingSuggestion, 40),
                doNotOpenWith: limitContinuityText(data?.doNotOpenWith, 40)
            };
        }

        function createContinuityCardSkeleton(todayStr) {
            return `# 承接卡

> 记录上一章结尾和下一章开场承接点，单次更新会自动限长。

## 当前承接
- 最后画面：—
- 未完成动作：—
- 当前位置：—
- 在场角色：—
- 角色即时状态：—
- 情绪余波：—
- 下一章开场建议：—
- 下一章避免：—

## 最近20章承接
| 章 | 章名 | 最后画面 | 未完成动作 | 下一章开场 |
|----|------|----------|------------|------------|
`;
        }

        function updateContinuityCardContent(file, chapterNum, chapterName, data) {
            const safe = normalizeContinuityData(data);
            const currentBlock = `## 当前承接
- 最后画面：${safe.lastScene}
- 未完成动作：${safe.unfinishedAction}
- 当前位置：${safe.location}
- 在场角色：${safe.presentCharacters}
- 角色即时状态：${safe.characterState}
- 情绪余波：${safe.emotionAftertaste}
- 下一章开场建议：${safe.openingSuggestion}
- 下一章避免：${safe.doNotOpenWith}`;

            let content = file.content || createContinuityCardSkeleton(new Date().toISOString().slice(0, 10));
            if (!content.includes('## 当前承接')) content += '\n\n' + currentBlock + '\n';
            else content = content.replace(/## 当前承接[\s\S]*?(?=\n## 最近20章承接|\n## 最近承接记录|$)/, currentBlock + '\n');

            const tableHeader = '## 最近20章承接\n| 章 | 章名 | 最后画面 | 未完成动作 | 下一章开场 |\n|----|------|----------|------------|------------|';
            if (!content.includes('## 最近20章承接')) content += '\n' + tableHeader + '\n';

            const row = `| 第${chapterNum}章 | ${limitContinuityText(chapterName, 18)} | ${safe.lastScene} | ${safe.unfinishedAction} | ${safe.openingSuggestion} |`;
            const lines = content.split('\n');
            const tableIdx = lines.findIndex(line => line.trim() === '## 最近20章承接');
            if (tableIdx >= 0) {
                const before = lines.slice(0, tableIdx + 3);
                const after = lines.slice(tableIdx + 3);
                const rows = after.filter(line => !new RegExp(`^\\|\\s*第${chapterNum}章\\s*\\|`).test(line.trim()) && /^\|\s*第.+章\s*\|/.test(line.trim()));
                rows.push(row);
                content = before.join('\n') + '\n' + rows.slice(-20).join('\n') + '\n';
            } else {
                content += '\n' + row + '\n';
            }

            file.content = content.trim() + '\n';
            file.updatedAt = new Date().toISOString();
        }


    window.limitContinuityText = limitContinuityText;
    window.extractJSONBlock = extractJSONBlock;
    window.normalizeContinuityData = normalizeContinuityData;
    window.createContinuityCardSkeleton = createContinuityCardSkeleton;
    window.updateContinuityCardContent = updateContinuityCardContent;
    window.ZHIYU_CONTINUITY_CARD_READY = true;
})(window);
