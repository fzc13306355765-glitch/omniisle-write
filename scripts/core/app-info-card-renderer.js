// Info card Markdown preview and relation canvas renderer split from app-tree-render.js.
(function(window) {
    'use strict';

    const document = window.document;
    const Utils = window.ZHIYU_UTILS || window.Utils || {};

    const RoleGraphLayout = window.ZHIYU_ROLE_GRAPH_LAYOUT || {};
    const relationLabelBoxesOverlap = RoleGraphLayout.relationLabelBoxesOverlap || function() { return false; };
    const resolveRelationLabelLayout = RoleGraphLayout.resolveRelationLabelLayout || function(start, end, curve, width) {
        return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2, width, height: 20, curve, progress: 0.5, visible: true };
    };
    const clampRelationCurveToBounds = RoleGraphLayout.clampRelationCurveToBounds || function(start, end, curve) {
        return Number(curve) || 0;
    };
    const InfoCardRenderer = {
        parse(md) {
            if (!md) return { factions: '', locations: [], locationTable: '', profiles: '', relations: [], items: '', head: '' };
            const lines = md.split('\n');
            let section = 'head', locationMode = 'tree', fl = [], ll = [], pl = [], rl = [], il = [], hl = [];
            for (const line of lines) {
                const t = line.trim();
                if (t === '## 势力') { section = 'factions'; continue; }
                if (t === '## 地点树') { section = 'locations'; locationMode = 'tree'; continue; }
                if (t === '## 地点') { section = 'locations'; locationMode = 'table'; continue; }
                if (t === '## 角色资料' || t === '## 角色写作画像') { section = 'profiles'; continue; }
                if (t === '## 角色关系网' || t === '## 角色关系') { section = 'relations'; continue; }
                if (t === '## 物品栏' || t === '## 物品') { section = 'items'; continue; }
                if (t.startsWith('## ')) { section = 'other'; hl.push(line); continue; }
                if (section === 'factions') fl.push(line);
                else if (section === 'locations') ll.push(line);
                else if (section === 'profiles') pl.push(line);
                else if (section === 'relations') rl.push(line);
                else if (section === 'items') il.push(line);
                else if (section === 'head') hl.push(line);
            }
            return {
                factions: fl.join('\n'),
                locations: locationMode === 'tree' ? ll.filter(l => l.trim() && !/^[（(]待/.test(l.trim())).map(l => l.trim()) : [],
                locationTable: locationMode === 'table' ? ll.join('\n') : '',
                profiles: pl.join('\n'),
                relations: rl.filter(l => l.trim() && !/^[（(]待/.test(l.trim())).map(l => l.trim()),
                items: il.join('\n'),
                head: hl.join('\n')
            };
        },
        buildTree(paths) {
            const root = {};
            for (const p of paths) {
                const parts = p.split('>').map(s => s.trim()).filter(Boolean);
                let node = root;
                for (const part of parts) { if (!node[part]) node[part] = {}; node = node[part]; }
            }
            return root;
        },
        renderTree(tree, prefix) {
            prefix = prefix || '';
            const entries = Object.entries(tree);
            let r = '';
            for (let i = 0; i < entries.length; i++) {
                const [name, children] = entries[i];
                const last = i === entries.length - 1;
                r += prefix + (last ? '└── ' : '├── ') + name + '\n';
                if (Object.keys(children).length > 0) r += this.renderTree(children, prefix + (last ? '    ' : '│   '));
            }
            return r;
        },
        relationColor(label) {
            const text = String(label || '');
            if (/仇|敌|冲突|对立|追杀|背叛/.test(text)) return '#ef4444';
            if (/情侣|夫妻|暧昧|爱|亲密/.test(text)) return '#ec4899';
            if (/师|徒|恩|亲|父|母|兄|姐|妹|弟/.test(text)) return '#f59e0b';
            if (/盟|友|合作|同伴|队友|伙伴/.test(text)) return '#10b981';
            return '#64748b';
        },
        normalizeRoleLookupKey(value) {
            return String(value || '').trim().replace(/\s+/g, '').replace(/[·•・]/g, '').toLowerCase();
        },
        appendRoleLookupAliases(target, value) {
            String(value || '').split(/[，,、；;／/]/).forEach(alias => {
                const cleaned = String(alias || '').trim();
                if (cleaned) target.push(cleaned);
            });
        },
        appendNamedRoleLookupAliases(target, value) {
            const text = String(value || '');
            const markers = Array.from(text.matchAll(/(本名|化名|别名|又名|曾用名|代号|称号|乳名|身份|状态|时期|阶段|前期|后期|主角|配角|反派)[：:]?\s*/g));
            let found = false;
            markers.forEach((marker, index) => {
                if (!/^(?:本名|化名|别名|又名|曾用名|代号|称号|乳名)$/.test(marker[1])) return;
                const start = Number(marker.index || 0) + marker[0].length;
                const end = index + 1 < markers.length ? Number(markers[index + 1].index || text.length) : text.length;
                this.appendRoleLookupAliases(target, text.slice(start, end).replace(/^[，,、；;\s]+|[，,、；;\s]+$/g, ''));
                found = true;
            });
            return found;
        },
        getRoleLookupAliases(value) {
            const cleaned = String(value || '').trim();
            if (!cleaned) return [];
            const aliases = [cleaned];
            const parenthetical = cleaned.match(/^(.+?)\s*[（(]([^）)]+)[）)]\s*$/);
            if (parenthetical) {
                this.appendRoleLookupAliases(aliases, parenthetical[1]);
                const foundNamedAlias = this.appendNamedRoleLookupAliases(aliases, parenthetical[2]);
                if (!foundNamedAlias && !/(?:身份|状态|时期|阶段|前期|后期|主角|配角|反派)/.test(parenthetical[2])) {
                    this.appendRoleLookupAliases(aliases, parenthetical[2]);
                }
            } else {
                this.appendRoleLookupAliases(aliases, cleaned);
            }
            return Array.from(new Set(aliases.map(alias => this.normalizeRoleLookupKey(alias)).filter(Boolean)));
        },
        buildProfileRoleLookup(profileNames) {
            const lookup = new Map();
            (Array.isArray(profileNames) ? profileNames : []).forEach(name => {
                this.getRoleLookupAliases(name).forEach(alias => {
                    if (!lookup.has(alias)) lookup.set(alias, name);
                    else if (lookup.get(alias) !== name) lookup.set(alias, null);
                });
            });
            return lookup;
        },
        resolveProfileRoleName(value, lookup) {
            const matches = Array.from(new Set(this.getRoleLookupAliases(value)
                .map(alias => lookup.get(alias)).filter(Boolean)));
            return matches.length === 1 ? matches[0] : '';
        },
        alignRelationsToProfiles(relationData, profiles) {
            const names = Object.keys(profiles || {});
            if (!names.length) return relationData;
            const lookup = this.buildProfileRoleLookup(names);
            const edges = (relationData?.edges || []).map(edge => {
                const from = this.resolveProfileRoleName(edge.from, lookup);
                const to = this.resolveProfileRoleName(edge.to, lookup);
                return from && to && from !== to ? { ...edge, from, to } : null;
            }).filter(Boolean);
            return { nodes: names.slice(), edges };
        },
        dedupeDirectedRelations(edges) {
            const deduped = [];
            const seen = new Set();
            (Array.isArray(edges) ? edges : []).forEach(edge => {
                const key = String(edge?.from || '') + '||' + String(edge?.to || '')
                    + '||' + String(edge?.label || '').replace(/\s+/g, '');
                if (seen.has(key)) return;
                seen.add(key);
                deduped.push(edge);
            });
            return deduped;
        },
        findRoleRelationSeparator(value) {
            const text = String(value || '');
            let depth = 0;
            for (let index = 0; index < text.length; index += 1) {
                if (text[index] === '（' || text[index] === '(') depth += 1;
                else if (text[index] === '）' || text[index] === ')') depth = Math.max(0, depth - 1);
                else if (depth === 0 && (text[index] === '：' || text[index] === ':')) return index;
            }
            return -1;
        },
        splitRoleRelationParts(value) {
            const parts = [];
            let depth = 0;
            let start = 0;
            const text = String(value || '');
            for (let index = 0; index < text.length; index += 1) {
                if (text[index] === '（' || text[index] === '(') depth += 1;
                else if (text[index] === '）' || text[index] === ')') depth = Math.max(0, depth - 1);
                else if (depth === 0 && /[，,；;、]/.test(text[index])) {
                    parts.push(text.slice(start, index));
                    start = index + 1;
                }
            }
            parts.push(text.slice(start));
            return parts.map(part => part.trim()).filter(Boolean);
        },
        parseRoleRelationPart(value) {
            const text = String(value || '').trim().replace(/[。.!！；;]+$/, '');
            const arrows = Array.from(text.matchAll(/→|->|=>/g));
            if (arrows.length !== 1) return null;
            const arrow = arrows[0];
            const labelSource = text.slice(0, arrow.index).trim();
            const prefix = labelSource.match(/^([—\-–>]+)\s*/);
            if (prefix && prefix[1].length !== 1) return null;
            const label = labelSource.replace(/^[—\-–>]\s*/, '').replace(/\s+/g, '').trim();
            const to = text.slice(Number(arrow.index || 0) + arrow[0].length).trim();
            if (!label || !to || label.length > 14 || to.length > 20 || /[：:→]/.test(label)) return null;
            return { label, to };
        },
        parseRelations(lines) {
            const nodeSet = new Set(), edges = [];
            for (const line of lines) {
                const idx = this.findRoleRelationSeparator(line);
                if (idx === -1) continue;
                const from = line.substring(0, idx).trim();
                if (!from || from.length > 20) continue;
                const parts = this.splitRoleRelationParts(line.substring(idx + 1));
                const lineEdges = [];
                let lineIsValid = parts.length > 0;
                for (const part of parts) {
                    const relation = this.parseRoleRelationPart(part);
                    if (!relation) {
                        lineIsValid = false;
                        break;
                    }
                    lineEdges.push({ from, to: relation.to, label: relation.label });
                }
                if (!lineIsValid) continue;
                for (const edge of lineEdges) {
                    nodeSet.add(edge.from);
                    nodeSet.add(edge.to);
                    edges.push(edge);
                }
            }
            return { nodes: [...nodeSet], edges };
        },
        parseProfileMap(markdown) {
            const profileMap = {};
            let headers = [];
            String(markdown || '').split(/\r?\n/).forEach(line => {
                const text = line.trim();
                if (!text.startsWith('|') || /^\|\s*-/.test(text)) return;
                const cells = text.split('|').slice(1, -1).map(cell => cell.trim());
                if (cells[0] === '角色') { headers = cells; return; }
                if (cells.length < 4 || /^[（(]待/.test(cells[0])) return;
                const indexOf = function(name, fallback) {
                    const index = headers.indexOf(name);
                    return index >= 0 ? index : fallback;
                };
                profileMap[cells[0]] = {
                    gender: cells[indexOf('性别', 1)] || '',
                    identity: cells[indexOf('身份/定位', 1)] || '',
                    affiliation: cells[indexOf('所属势力', 2)] || '',
                    goal: cells[indexOf('核心目标', 3)] || '',
                    voice: cells[indexOf('对话风格', 4)] || '',
                    arc: cells[indexOf('人物弧线', 5)] || '',
                    intro: cells[indexOf('人物简介', 6)] || '',
                    current: cells[indexOf('当前状态', 7)] || '',
                    note: cells[indexOf('写作提醒', 8)] || ''
                };
            });
            return profileMap;
        },
        getOutlineContent(bookName) {
            const memBooks = typeof window.getMemBooks === 'function' ? window.getMemBooks() : {};
            for (const folder of Object.keys(memBooks[bookName] || {})) {
                const found = (memBooks[bookName][folder] || []).find(file => {
                    const name = String(file.name || '').replace(/\.md$/i, '');
                    return name === '大纲' || name === bookName + '_大纲';
                });
                if (found) return found.content || '';
            }
            return '';
        },
        getRoleListFile(bookName) {
            return typeof window.getRoleListFile === 'function' ? window.getRoleListFile(bookName) : null;
        },
        normalizeProfileValue(value, maxLength) {
            const text = String(value || '').replace(/\s+/g, ' ').replace(/\|/g, '/').trim();
            return maxLength && text.length > maxLength ? text.slice(0, maxLength) : text;
        },
        parseGeneratedProfiles(raw) {
            const text = String(raw || '').trim();
            const start = text.indexOf('[');
            const end = text.lastIndexOf(']');
            if (start < 0 || end <= start) throw new Error('AI 没有按人物简介 JSON 返回，请重试。');
            const data = JSON.parse(text.slice(start, end + 1));
            if (!Array.isArray(data)) throw new Error('AI 返回的人物简介格式不正确。');
            return data.map(item => ({
                role: this.normalizeProfileValue(item.角色 || item.name || item.role, 24),
                identity: this.normalizeProfileValue(item.身份 || item['身份/定位'] || item.identity, 40),
                voice: this.normalizeProfileValue(item.对话方式 || item.对话风格 || item.voice, 30),
                arc: this.normalizeProfileValue(item.人物弧线 || item['人物弧线/变化'] || item.arc, 30),
                intro: this.normalizeProfileValue(item.人物简介 || item.简介 || item.intro, 30),
                note: this.normalizeProfileValue(item.写作提醒 || item.note, 40)
            })).filter(item => item.role && !/^[（(]待/.test(item.role));
        },
        profileRow(item) {
            return '| ' + [item.role, item.gender, item.identity, item.affiliation, item.goal, item.voice,
                item.arc, item.intro, item.current, item.note].map(value => this.normalizeProfileValue(value, 0)).join(' | ') + ' |';
        },
        updateProfileSection(markdown, generatedRows) {
            const current = String(markdown || '');
            const rows = new Map();
            const profiles = this.parseProfileMap(this.parse(current).profiles);
            Object.keys(profiles).forEach(role => rows.set(role, { role, ...profiles[role] }));
            generatedRows.forEach(row => {
                const previous = rows.get(row.role) || { role: row.role };
                const nonEmpty = Object.fromEntries(Object.entries(row).filter(([key, value]) => key === 'role' || String(value || '').trim()));
                rows.set(row.role, { ...previous, ...nonEmpty, role: row.role });
            });
            const section = '## 角色资料\n'
                + '| 角色 | 性别 | 身份/定位 | 所属势力 | 核心目标 | 对话风格 | 人物弧线 | 人物简介 | 当前状态 | 写作提醒 |\n'
                + '| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n'
                + (rows.size ? Array.from(rows.values()).map(row => this.profileRow(row)).join('\n') : '| （待章节展开） | | | | | | | | | |');
            const profileReg = /## (?:角色写作画像|角色资料)\n[\s\S]*?(?=\n## |\s*$)/;
            if (profileReg.test(current)) return current.replace(profileReg, section);
            const relationReg = /\n## (?:角色关系网|角色关系)/;
            if (relationReg.test(current)) return current.replace(relationReg, '\n\n' + section + '\n\n## 角色关系');
            return current.trimEnd() + '\n\n' + section + '\n';
        },
        async generateCharacterProfiles(container, characterNames) {
            const names = Array.from(new Set((Array.isArray(characterNames) ? characterNames : [characterNames])
                .map(name => String(name || '').trim()).filter(name => name && !/^[（(]待/.test(name))));
            if (!names.length) return 0;
            const stateBook = window.AppState?.chapter?.book || window.ZHIYU_APP_STATE?.chapter?.book || '';
            const storageKey = window.AccountDataScope?.key ? window.AccountDataScope.key('novel_current_book') : 'novel_current_book';
            const bookName = container.dataset.editingRefBookName || stateBook || window.localStorage?.getItem(storageKey) || '';
            const roleRef = this.getRoleListFile(bookName);
            const fileName = roleRef?.name || (bookName ? bookName + '_角色列表' : '角色列表');
            const folderName = roleRef?.folder || container.dataset.infoCardFolder || '';
            const currentMd = container.dataset.infoCardOriginalMd || roleRef?.content || '';
            if (!bookName || !currentMd) throw new Error('请先生成或打开当前作品的角色列表。');
            const systemPrompt = [
                '你是小说角色列表整理助手，只负责给已有角色补充人物简介。',
                '必须参考大纲、角色关系和已有角色列表，不要新增不存在的角色。',
                '每个字段必须短：对话方式、人物弧线、人物简介都不超过30个汉字。',
                '只输出 JSON 数组，不要输出解释、Markdown 或代码块。'
            ].join('\n');
            const userMessage = ['作品：' + bookName, '需要生成简介的角色：' + names.join('、'), '', '请按以下 JSON 字段返回：',
                '[{"角色":"角色名","身份":"身份/定位","对话方式":"不超过30字","人物弧线":"不超过30字","人物简介":"不超过30字","写作提醒":"不超过40字"}]',
                '', '【大纲】', this.getOutlineContent(bookName).slice(0, 12000) || '（未找到大纲，只能根据当前角色列表生成）',
                '', '【当前角色列表】', currentMd.slice(0, 12000)].join('\n');
            const result = await window.requestMemoryAnalysisWithFallback(null, systemPrompt, userMessage, {
                label: '人物简介', fallback: '人物简介生成失败', requestFeature: 'analysis', requestUnits: 1,
                requestIdPrefix: 'analysis_character_profile', maxTokens: Math.min(8192, Math.max(2048, names.length * 420))
            });
            const allowed = new Set(names);
            const rows = this.parseGeneratedProfiles(result).filter(row => allowed.has(row.role));
            if (!rows.length) throw new Error('AI 没有返回有效的人物简介。');
            const newMd = this.updateProfileSection(currentMd, rows);
            if (!window.saveRefFileContent?.(bookName, fileName, newMd, folderName)) throw new Error('人物简介已生成，但保存角色列表失败。');
            container.dataset.infoCardOriginalMd = newMd;
            container.dataset.infoCardFolder = folderName;
            container.dataset.roleRelationOriginalMd = newMd;
            container.innerHTML = this.render(newMd, { bookName, forceRelationGraph: true });
            container.setAttribute('contenteditable', 'false');
            setTimeout(() => InfoCardRenderer.drawCanvas(container), 50);
            window.Toast?.success?.('已更新 ' + rows.length + ' 个角色的人物简介');
            return rows.length;
        },
        async saveCharacterProfile(container, roleName, values) {
            const name = String(roleName || '').trim();
            if (!name) throw new Error('没有选中角色。');
            const stateBook = window.AppState?.chapter?.book || window.ZHIYU_APP_STATE?.chapter?.book || '';
            const storageKey = window.AccountDataScope?.key ? window.AccountDataScope.key('novel_current_book') : 'novel_current_book';
            const bookName = container.dataset.editingRefBookName || stateBook || window.localStorage?.getItem(storageKey) || '';
            const roleRef = this.getRoleListFile(bookName);
            const fileName = roleRef?.name || (bookName ? bookName + '_角色列表' : '角色列表');
            const folderName = roleRef?.folder || container.dataset.infoCardFolder || '';
            const currentMd = container.dataset.infoCardOriginalMd || roleRef?.content || '';
            if (!bookName || !currentMd) throw new Error('请先打开当前作品的角色列表。');
            const next = { role: name, ...(values || {}) };
            const newMd = this.updateProfileSection(currentMd, [next]);
            if (!window.saveRefFileContent?.(bookName, fileName, newMd, folderName)) throw new Error('人物名片保存失败。');
            container.dataset.infoCardOriginalMd = newMd;
            container.dataset.infoCardFolder = folderName;
            container.dataset.roleRelationOriginalMd = newMd;
            container.innerHTML = this.render(newMd, { bookName, forceRelationGraph: true });
            container.setAttribute('contenteditable', 'false');
            setTimeout(() => InfoCardRenderer.drawCanvas(container), 50);
            window.Toast?.success?.('人物名片已保存');
            return true;
        },
        render(md, options) {
            const s = this.parse(md);
            const profiles = this.parseProfileMap(s.profiles);
            const isRoleListView = !!options?.forceRelationGraph || /^#\s*角色列表/m.test(s.head);
            const isPureRelationGraph = !s.factions.trim()
                && !s.locations.length
                && !s.locationTable.trim()
                && !s.items.trim()
                && isRoleListView;
            let html = '';
            if (s.head.trim() && !isPureRelationGraph) html += '<div style="font-size:14px;line-height:1.8;margin-bottom:14px;">' + Utils.mdToHtml(s.head) + '</div>';
            if (s.factions.trim() && s.factions.includes('|')) {
                html += '<h4 style="margin:12px 0 6px;padding:6px 10px;background:#e8ebf0;color:#333;border-left:4px solid #32364a;font-size:14px;font-weight:700;">势力</h4>';
                html += Utils.mdToHtml(s.factions);
            }
            if (s.locations.length > 0) {
                const tree = this.buildTree(s.locations);
                html += '<h4 style="margin:12px 0 6px;padding:6px 10px;background:#e8ebf0;color:#333;border-left:4px solid #32364a;font-size:14px;font-weight:700;">地点树</h4>';
                html += '<pre style="background:#f8f9fb;border:1px solid #e2e5ea;border-radius:8px;padding:14px 16px;font-size:13px;line-height:1.9;overflow-x:auto;font-family:\'Microsoft YaHei Mono\',\'Consolas\',\'Monaco\',monospace;">' + Utils.escapeHtml(this.renderTree(tree)) + '</pre>';
            }
            if (s.locationTable.trim() && s.locationTable.includes('|')) {
                html += '<h4 style="margin:12px 0 6px;padding:6px 10px;background:#e8ebf0;color:#333;border-left:4px solid #32364a;font-size:14px;font-weight:700;">地点</h4>';
                html += Utils.mdToHtml(s.locationTable);
            }
            if (s.profiles.trim() && s.profiles.includes('|')) {
                if (isRoleListView) {
                    // 角色原文保留在 resultBox.dataset 中供保存与 AI 调用，不在关系图页面重复展示。
                } else {
                    html += '<h4 style="margin:12px 0 6px;padding:6px 10px;background:#e8ebf0;color:#333;border-left:4px solid #32364a;font-size:14px;font-weight:700;">人物简介</h4>';
                    html += Utils.mdToHtml(s.profiles);
                }
            }
            if (s.relations.length > 0 || (options?.forceRelationGraph && Object.keys(profiles).length > 0)) {
                let rel = this.parseRelations(s.relations);
                rel = this.alignRelationsToProfiles(rel, profiles);
                Object.keys(profiles).forEach(name => { if (!rel.nodes.includes(name)) rel.nodes.push(name); });
                const characterNodes = rel.nodes.filter(name => typeof window.isCharacterName !== 'function'
                    || window.isCharacterName(name, profiles[name]));
                const characterSet = new Set(characterNodes);
                rel.nodes = characterNodes;
                rel.edges = rel.edges.filter(edge => characterSet.has(edge.from) && characterSet.has(edge.to));
                if (!isPureRelationGraph) html += '<h4 style="margin:12px 0 6px;padding:6px 10px;background:#e8ebf0;color:#333;border-left:4px solid #32364a;font-size:14px;font-weight:700;">角色关系网</h4>';
                if (rel.nodes.length > 0) {
                    const viewportHeight = Math.max(360, Number(options?.viewportHeight || 520) - 24);
                    const graphHeight = typeof RoleGraphLayout.getRecommendedGraphHeight === 'function'
                        ? RoleGraphLayout.getRecommendedGraphHeight(rel.nodes.length, rel.edges.length, viewportHeight, options?.viewportWidth)
                        : Math.max(viewportHeight, 360 + Math.ceil(Math.max(0, rel.edges.length - 12) / 10) * 80);
                    html += '<div class="info-card-canvas-wrap" data-graph-viewport-height="' + viewportHeight + '" style="height:' + graphHeight + 'px;background:#fff;border:1px solid #d8dee8;border-radius:8px;overflow:hidden;position:relative;">';
                    html += '<button type="button" class="info-card-generate-profiles" title="为当前角色列表一键补齐人物简介" style="position:absolute;right:46px;top:8px;z-index:5;border:1px solid #cbd5e1;border-radius:6px;background:#fff;padding:5px 10px;cursor:pointer;">一键生成简介</button>';
                    html += '<button type="button" class="info-card-graph-reset" title="重置关系图的位置和缩放" aria-label="重置关系图的位置和缩放" style="position:absolute;right:10px;top:8px;z-index:5;width:28px;height:28px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;color:#475569;font-size:18px;line-height:1;cursor:pointer;">↺</button>';
                    html += '<div class="info-card-graph-hint">点击角色或关系线聚焦 · 点击空白恢复</div>';
                    html += '<canvas class="info-card-canvas" style="width:100%;height:100%;display:block;cursor:grab;" data-nodes="' + Utils.escapeHtml(JSON.stringify(rel.nodes)) + '" data-edges="' + Utils.escapeHtml(JSON.stringify(rel.edges)) + '" data-profiles="' + Utils.escapeHtml(JSON.stringify(profiles)) + '"></canvas>';
                    html += '</div>';
                }
                if (!isRoleListView) {
                    html += '<details style="margin-top:6px;"><summary style="cursor:pointer;color:#888;font-size:12px;">📋 关系原文</summary>';
                    html += '<pre style="background:#f0f1f4;padding:8px 12px;border-radius:6px;font-size:12px;line-height:1.6;margin-top:4px;">' + Utils.escapeHtml(s.relations.join('\n')) + '</pre>';
                    html += '</details>';
                }
            }
            if (isRoleListView && s.profiles.trim()) {
                html += '<details class="info-card-raw-details"><summary title="展开查看角色列表的原始表格内容">查看角色列表原内容</summary>';
                html += '<div class="info-card-raw-content">' + Utils.mdToHtml(s.profiles) + '</div></details>';
            }
            if (isRoleListView && s.relations.length > 0) {
                html += '<details class="info-card-raw-details"><summary title="展开查看角色关系的原始文字内容">查看角色关系原文</summary>';
                html += '<pre class="info-card-raw-content">' + Utils.escapeHtml(s.relations.join('\n')) + '</pre></details>';
            }
            if (s.items.trim() && s.items.includes('|')) {
                html += '<h4 style="margin:12px 0 6px;padding:6px 10px;background:#e8ebf0;color:#333;border-left:4px solid #32364a;font-size:14px;font-weight:700;">物品栏</h4>';
                html += Utils.mdToHtml(s.items);
            }
            return html || Utils.mdToHtml(md);
        },
        drawCanvas(container) {
            const canvas = container.querySelector('.info-card-canvas');
            if (!canvas) return;
            if (typeof canvas._graphCleanup === 'function') canvas._graphCleanup();
            const nodes = JSON.parse(canvas.dataset.nodes || '[]');
            const edges = JSON.parse(canvas.dataset.edges || '[]');
            const profiles = JSON.parse(canvas.dataset.profiles || '{}');
            const profileButton = container.querySelector('.info-card-generate-profiles');
            const resetButton = container.querySelector('.info-card-graph-reset');
            if (profileButton) profileButton.onclick = async () => {
                profileButton.disabled = true;
                profileButton.textContent = '生成中...';
                try {
                    await InfoCardRenderer.generateCharacterProfiles(container, nodes);
                } catch (error) {
                    profileButton.disabled = false;
                    profileButton.textContent = '一键生成简介';
                    const message = typeof window.formatAiErrorForDisplay === 'function'
                        ? window.formatAiErrorForDisplay(error, '人物简介生成失败')
                        : String(error?.message || error || '人物简介生成失败');
                    Utils.appendLog?.(null, message, 'error');
                    window.Toast?.error?.(message);
                }
            };
            if (nodes.length === 0) return;
            const wrap = canvas.parentElement || container;
            const dpr = window.devicePixelRatio || 1;
            let rect = wrap.getBoundingClientRect();
            let w = rect.width;
            // 去重：只合并完全相同的同向关系；反向关系有不同语义，必须保留箭头和独立曲线。
            const deduped = this.dedupeDirectedRelations(edges);
            let h = Math.max(360, Math.round(rect.height || 520));
            const viewportHeight = Math.max(360, Number(wrap.dataset.graphViewportHeight) || 520);
            const requiredHeight = typeof RoleGraphLayout.getRecommendedGraphHeight === 'function'
                ? RoleGraphLayout.getRecommendedGraphHeight(nodes.length, deduped.length, viewportHeight, w)
                : h;
            if (Math.abs(requiredHeight - h) > 1) {
                wrap.style.height = requiredHeight + 'px';
                rect = wrap.getBoundingClientRect();
                w = rect.width;
                h = Math.max(360, Math.round(rect.height || requiredHeight));
            }
            canvas.width = w * dpr;
            canvas.height = h * dpr;
            canvas.style.height = h + 'px';
            const ctx = canvas.getContext('2d');
            const degreeMap = {};
            deduped.forEach(e => {
                degreeMap[e.from] = (degreeMap[e.from] || 0) + 1;
                degreeMap[e.to] = (degreeMap[e.to] || 0) + 1;
            });
            const avatarPools = {
                heroMale: Array.from({ length: 6 }, (_, i) => 'assets/character-avatars/classified/hero-male-' + String(i + 1).padStart(2, '0') + '.webp'),
                heroFemale: Array.from({ length: 5 }, (_, i) => 'assets/character-avatars/classified/hero-female-' + String(i + 1).padStart(2, '0') + '.webp'),
                villainMale: Array.from({ length: 4 }, (_, i) => 'assets/character-avatars/classified/villain-male-' + String(i + 1).padStart(2, '0') + '.webp'),
                villainFemale: Array.from({ length: 5 }, (_, i) => 'assets/character-avatars/classified/villain-female-' + String(i + 1).padStart(2, '0') + '.webp')
            };
            const relationMap = {};
            deduped.forEach(e => {
                if (!relationMap[e.from]) relationMap[e.from] = [];
                if (!relationMap[e.to]) relationMap[e.to] = [];
                relationMap[e.from].push({ name: e.to, label: e.label, dir: 'out' });
                relationMap[e.to].push({ name: e.from, label: e.label, dir: 'in' });
            });
            function hashText(text) {
                let hash = 0;
                String(text || '').split('').forEach(ch => { hash = (hash * 31 + ch.charCodeAt(0)) >>> 0; });
                return hash;
            }
            function getProfileText(name) {
                const profile = profiles[name] || {};
                return [name, profile.gender, profile.identity, profile.affiliation, profile.goal, profile.voice, profile.arc, profile.intro, profile.current, profile.note].filter(Boolean).join(' ');
            }
            function inferRoleGender(name) {
                const text = getProfileText(name);
                let female = 0;
                let male = 0;
                if (/(女主|女性|女人|女子|少女|姑娘|小姐|夫人|妻子|母亲|皇后|娘娘|师姐|师妹|姐姐|妹妹|侍女|丫鬟|女侠|女帝|女王|女官|妃|公主)/.test(text)) female += 3;
                if (/(男主|男性|男人|男子|少年|青年|中年|老人|公子|书生|侠客|剑客|武者|皇帝|皇子|父亲|师父|太子|先生|师兄|师弟|哥哥|弟弟|将军|侯|王爷)/.test(text)) male += 3;
                return female > male ? 'female' : 'male';
            }
            function inferRoleAlignment(name) {
                const text = getProfileText(name);
                const rels = relationMap[name] || [];
                let hero = 0;
                let villain = 0;
                if (/(主角|男主|女主|正派|同伴|队友|好友|挚友|知己|盟友|合作|保护|守护|恩师|善良|忠义|仁善)/.test(text)) hero += 4;
                if (/(反派|仇敌|敌对|敌人|追杀|背叛|陷害|利用|党争|阴谋|阴狠|狠毒|腹黑|冷厉|黑化|邪修|魔修|恶人|夺权|篡位)/.test(text)) villain += 4;
                rels.forEach(r => {
                    const label = String(r.label || '');
                    if (/(好友|挚友|知己|同伴|队友|盟友|合作|保护|守护|师徒|恩师)/.test(label)) hero += 2;
                    if (/(利用|陷害|背叛|追杀|拉拢|党争|阴谋)/.test(label) && r.dir === 'out') villain += 2;
                    if (/(仇敌|敌对)/.test(label)) villain += 1;
                });
                return villain > hero ? 'villain' : 'hero';
            }
            const avatarTaken = new Set();
            const avatarMap = {};
            function chooseAvatarFromPool(poolKey, name) {
                const preferredKey = avatarPools[poolKey] ? poolKey : 'heroMale';
                const genderSuffix = preferredKey.endsWith('Female') ? 'Female' : 'Male';
                const remainingKeys = Object.keys(avatarPools).filter(key => key !== preferredKey);
                const poolOrder = [preferredKey]
                    .concat(remainingKeys.filter(key => key.endsWith(genderSuffix)))
                    .concat(remainingKeys.filter(key => !key.endsWith(genderSuffix)));
                for (const key of poolOrder) {
                    const pool = avatarPools[key];
                    let idx = hashText(key + '|' + name) % pool.length;
                    for (let step = 0; step < pool.length; step++) {
                        const avatar = pool[(idx + step) % pool.length];
                        if (!avatarTaken.has(avatar)) {
                            avatarTaken.add(avatar);
                            return avatar;
                        }
                    }
                }
                const fallback = avatarPools[preferredKey];
                return fallback[hashText(poolKey + '|' + name) % fallback.length];
            }
            nodes.slice().sort().forEach(name => {
                const side = inferRoleAlignment(name) === 'villain' ? 'villain' : 'hero';
                const gender = inferRoleGender(name) === 'female' ? 'Female' : 'Male';
                avatarMap[name] = chooseAvatarFromPool(side + gender, name);
            });
            const avatarCache = canvas._avatarCache || {};
            canvas._avatarCache = avatarCache;
            function getAvatarImage(name) {
                const src = avatarMap[name];
                if (!src) return null;
                if (!avatarCache[src]) {
                    const img = new Image();
                    avatarCache[src] = { img, loaded: false, failed: false };
                    img.onload = function() { avatarCache[src].loaded = true; draw(); };
                    img.onerror = function() { avatarCache[src].failed = true; draw(); };
                    img.src = src;
                }
                const item = avatarCache[src];
                return item.loaded && !item.failed ? item.img : null;
            }
            function makeInitialGraph() {
                const primaryRoleName = typeof RoleGraphLayout.pickPrimaryRoleName === 'function'
                    ? RoleGraphLayout.pickPrimaryRoleName(nodes, profiles, degreeMap)
                    : '';
                const graphNodes = typeof RoleGraphLayout.createInitialNodes === 'function'
                    ? RoleGraphLayout.createInitialNodes(nodes, degreeMap, w, h, primaryRoleName)
                    : nodes.map(function(name, index) { return { id: name, name, x: w / 2 + index * 12, y: h / 2, r: 22 }; });
                return {
                    signature: nodes.join('|') + '::' + deduped.length + '::' + primaryRoleName,
                    primaryRoleName,
                    layoutWidth: w,
                    layoutHeight: h,
                    userPositioned: false,
                    nodes: graphNodes,
                    scale: 1,
                    offsetX: 0,
                    offsetY: 0,
                    hoverNode: null,
                    selectedNode: null,
                    hoverEdgeIndex: null,
                    selectedEdgeIndex: null,
                    pendingEdgeIndex: null,
                    showAllRelations: true,
                    dragNode: null,
                    panStart: null,
                    dragOffsetX: 0,
                    dragOffsetY: 0,
                    downX: 0,
                    downY: 0,
                    moved: false,
                    labelHits: [],
                    edgeHits: [],
                    renderedNodes: [],
                    focusedNodeIds: [],
                    focusedEdgeIndexes: [],
                    edgeRoutesWithinBounds: true
                };
            }
            let graphState = canvas._roleGraphState;
            const primaryRoleName = typeof RoleGraphLayout.pickPrimaryRoleName === 'function'
                ? RoleGraphLayout.pickPrimaryRoleName(nodes, profiles, degreeMap)
                : '';
            const signature = nodes.join('|') + '::' + deduped.length + '::' + primaryRoleName;
            const needsResponsiveRelayout = graphState
                && !graphState.userPositioned
                && (graphState.layoutWidth !== w || graphState.layoutHeight !== h);
            if (!graphState || graphState.signature !== signature || needsResponsiveRelayout) graphState = makeInitialGraph();
            graphState.showAllRelations = true;
            canvas._roleGraphState = graphState;
            if (resetButton) resetButton.onclick = function() {
                graphState = makeInitialGraph();
                canvas._roleGraphState = graphState;
                const existingDetail = wrap.querySelector('.info-card-graph-detail');
                if (existingDetail) existingDetail.style.display = 'none';
                draw();
            };
            const nodeMap = () => Object.fromEntries(graphState.nodes.map(n => [n.id, n]));
            function worldToScreen(p) {
                return { x: p.x * graphState.scale + graphState.offsetX, y: p.y * graphState.scale + graphState.offsetY };
            }
            function screenToWorld(x, y) {
                return { x: (x - graphState.offsetX) / graphState.scale, y: (y - graphState.offsetY) / graphState.scale };
            }
            function getMinimumSafeScale() {
                let minimum = 0.65;
                for (let i = 0; i < graphState.nodes.length; i += 1) {
                    for (let j = i + 1; j < graphState.nodes.length; j += 1) {
                        const a = graphState.nodes[i];
                        const b = graphState.nodes[j];
                        const distance = Math.hypot(a.x - b.x, a.y - b.y);
                        if (!distance) continue;
                        const requiredDistance = a.r + b.r + 40;
                        minimum = Math.max(minimum, requiredDistance / distance);
                    }
                }
                return Math.min(1, minimum);
            }
            function roundRect(x, y, rw, rh, r) {
                ctx.beginPath();
                ctx.moveTo(x + r, y);
                ctx.arcTo(x + rw, y, x + rw, y + rh, r);
                ctx.arcTo(x + rw, y + rh, x, y + rh, r);
                ctx.arcTo(x, y + rh, x, y, r);
                ctx.arcTo(x, y, x + rw, y, r);
                ctx.closePath();
            }
            function fitCanvasText(text, maxWidth) {
                let value = String(text || '').trim();
                if (!value) return '';
                if (ctx.measureText(value).width <= maxWidth) return value;
                while (value.length > 1 && ctx.measureText(value + '..').width > maxWidth) value = value.slice(0, -1);
                return value + '..';
            }
            function drawGrid() {
                ctx.save();
                ctx.strokeStyle = 'rgba(15,23,42,0.055)';
                ctx.lineWidth = 1;
                const step = Math.max(28, 40 * graphState.scale);
                const ox = graphState.offsetX % step;
                const oy = graphState.offsetY % step;
                for (let x = ox; x < w; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
                for (let y = oy; y < h; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
                ctx.restore();
            }
            function draw() {
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                ctx.clearRect(0, 0, w, h);
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, w, h);
                drawGrid();
                const pos = nodeMap();
                const selectedEdgeIndex = Number.isInteger(graphState.selectedEdgeIndex)
                    ? graphState.selectedEdgeIndex
                    : null;
                const hoverEdgeIndex = selectedEdgeIndex === null && !graphState.selectedNode && Number.isInteger(graphState.hoverEdgeIndex)
                    ? graphState.hoverEdgeIndex
                    : null;
                const focusedNode = graphState.selectedNode
                    || (selectedEdgeIndex === null ? graphState.hoverNode : null);
                const focusedEdgeIndexes = new Set();
                const relatedNodeIds = new Set();
                const singleEdgeIndex = selectedEdgeIndex === null ? hoverEdgeIndex : selectedEdgeIndex;
                if (singleEdgeIndex !== null && deduped[singleEdgeIndex]) {
                    focusedEdgeIndexes.add(singleEdgeIndex);
                    relatedNodeIds.add(deduped[singleEdgeIndex].from);
                    relatedNodeIds.add(deduped[singleEdgeIndex].to);
                } else if (focusedNode) {
                    relatedNodeIds.add(focusedNode.id);
                    deduped.forEach(function(edge, edgeIndex) {
                        if (edge.from !== focusedNode.id && edge.to !== focusedNode.id) return;
                        focusedEdgeIndexes.add(edgeIndex);
                        relatedNodeIds.add(edge.from);
                        relatedNodeIds.add(edge.to);
                    });
                }
                const hasFocus = focusedEdgeIndexes.size > 0 || relatedNodeIds.size > 0;
                graphState.focusedNodeIds = Array.from(relatedNodeIds);
                graphState.focusedEdgeIndexes = Array.from(focusedEdgeIndexes);
                const visibleEdges = deduped;
                const curvePlan = typeof RoleGraphLayout.buildPairCurvePlan === 'function'
                    ? RoleGraphLayout.buildPairCurvePlan(visibleEdges)
                    : new Map();
                graphState.labelHits = [];
                graphState.edgeHits = [];
                graphState.renderedNodes = [];
                graphState.edgeRoutesWithinBounds = true;
                const occupiedLabels = graphState.nodes.map(function(node) {
                    const point = worldToScreen(node);
                    const radius = node.r + 18;
                    return { x: point.x, y: point.y, width: radius * 2, height: radius * 2 + 28 };
                });
                const edgeLayouts = visibleEdges.map(function(e, edgeIndex) {
                    const a0 = pos[e.from], b0 = pos[e.to];
                    if (!a0 || !b0) return null;
                    const a = worldToScreen(a0), b = worldToScreen(b0);
                    const dx = b.x - a.x, dy = b.y - a.y;
                    const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
                    const ux = dx / len, uy = dy / len;
                    const fromR = a0.r + 5;
                    const toR = b0.r + 7;
                    const sx = a.x + ux * fromR, sy = a.y + uy * fromR;
                    const tx = b.x - ux * toR, ty = b.y - uy * toR;
                    const baseCurve = curvePlan.get(edgeIndex) || 0;
                    const label = String(e.label || '').trim();
                    ctx.font = 'bold 12px "Microsoft YaHei","PingFang SC",sans-serif';
                    const shown = label.length > 12 ? label.slice(0, 12) + '..' : label;
                    const textWidth = Math.min(164, ctx.measureText(shown).width + 16);
                    const labelLayout = label
                        ? resolveRelationLabelLayout({ x: sx, y: sy }, { x: tx, y: ty }, baseCurve, textWidth, occupiedLabels, { width: w, height: h })
                        : null;
                    if (labelLayout) occupiedLabels.push(labelLayout);
                    const curve = clampRelationCurveToBounds(
                        { x: sx, y: sy },
                        { x: tx, y: ty },
                        labelLayout ? labelLayout.curve : baseCurve,
                        { width: w, height: h },
                        14
                    );
                    const mx = (sx + tx) / 2, my = (sy + ty) / 2;
                    const cx2 = mx - uy * curve, cy2 = my + ux * curve;
                    graphState.edgeRoutesWithinBounds = graphState.edgeRoutesWithinBounds
                        && cx2 >= 14 && cx2 <= w - 14 && cy2 >= 14 && cy2 <= h - 14;
                    return { e, edgeIndex, a0, b0, sx, sy, tx, ty, cx2, cy2, label, shown, textWidth, labelLayout, color: InfoCardRenderer.relationColor(e.label) };
                }).filter(Boolean);
                edgeLayouts.forEach(function(layout) {
                    const e = layout.e;
                    const focusedEdge = focusedEdgeIndexes.has(layout.edgeIndex);
                    ctx.save();
                    ctx.strokeStyle = layout.color;
                    ctx.globalAlpha = hasFocus ? (focusedEdge ? 0.96 : 0.12) : 0.76;
                    ctx.lineWidth = focusedEdge ? 2.8 : 1.2;
                    ctx.beginPath();
                    ctx.moveTo(layout.sx, layout.sy);
                    ctx.quadraticCurveTo(layout.cx2, layout.cy2, layout.tx, layout.ty);
                    ctx.stroke();
                    const arrowAngle = Math.atan2(layout.ty - layout.cy2, layout.tx - layout.cx2);
                    ctx.fillStyle = layout.color;
                    ctx.globalAlpha = hasFocus ? (focusedEdge ? 0.98 : 0.14) : 0.82;
                    ctx.beginPath();
                    ctx.moveTo(layout.tx, layout.ty);
                    ctx.lineTo(layout.tx - Math.cos(arrowAngle - 0.48) * 10, layout.ty - Math.sin(arrowAngle - 0.48) * 10);
                    ctx.lineTo(layout.tx - Math.cos(arrowAngle + 0.48) * 10, layout.ty - Math.sin(arrowAngle + 0.48) * 10);
                    ctx.closePath();
                    ctx.fill();
                    ctx.globalAlpha = 1;
                    if (layout.label && layout.labelLayout?.visible !== false) {
                        const lx = layout.labelLayout.x;
                        const ly = layout.labelLayout.y;
                        ctx.font = 'bold 12px "Microsoft YaHei","PingFang SC",sans-serif';
                        const tw = layout.textWidth;
                        const labelAlpha = hasFocus ? (focusedEdge ? 1 : 0.18) : 1;
                        ctx.globalAlpha = labelAlpha;
                        roundRect(lx - tw / 2, ly - 11, tw, 22, 11);
                        ctx.fillStyle = '#ffffff';
                        ctx.fill();
                        ctx.strokeStyle = layout.color;
                        ctx.stroke();
                        ctx.fillStyle = '#111827';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(layout.shown, lx, ly);
                        graphState.labelHits.push({ edgeIndex: layout.edgeIndex, x: lx, y: ly, w: tw, h: 24, text: e.from + ' → ' + e.to + '：' + layout.label });
                    }
                    ctx.restore();
                    const points = [];
                    for (let step = 0; step <= 20; step += 1) {
                        const progress = step / 20;
                        const inverse = 1 - progress;
                        points.push({
                            x: inverse * inverse * layout.sx + 2 * inverse * progress * layout.cx2 + progress * progress * layout.tx,
                            y: inverse * inverse * layout.sy + 2 * inverse * progress * layout.cy2 + progress * progress * layout.ty
                        });
                    }
                    graphState.edgeHits.push({ edgeIndex: layout.edgeIndex, points, text: e.from + ' → ' + e.to + (layout.label ? '：' + layout.label : '') });
                });
                graphState.nodes.forEach(n => {
                    const p = worldToScreen(n);
                    const r = n.r;
                    const active = graphState.selectedNode === n || graphState.hoverNode === n
                        || (selectedEdgeIndex !== null && relatedNodeIds.has(n.id));
                    ctx.save();
                    ctx.globalAlpha = hasFocus && !relatedNodeIds.has(n.id) ? 0.2 : 1;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, r + (active ? 11 : 7), 0, Math.PI * 2);
                    ctx.fillStyle = active ? 'rgba(37,99,235,0.16)' : 'rgba(148,163,184,0.14)';
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
                    ctx.fillStyle = '#fff';
                    ctx.fill();
                    const avatarImg = getAvatarImage(n.name);
                    if (avatarImg) {
                        ctx.save();
                        ctx.beginPath();
                        ctx.arc(p.x, p.y, Math.max(1, r - 2), 0, Math.PI * 2);
                        ctx.clip();
                        ctx.drawImage(avatarImg, p.x - r, p.y - r, r * 2, r * 2);
                        ctx.restore();
                    } else {
                        ctx.fillStyle = '#32364a';
                        ctx.fill();
                        ctx.fillStyle = '#fff';
                        ctx.font = 'bold ' + Math.max(11, Math.min(14, r * 0.46)) + 'px "Microsoft YaHei","PingFang SC",sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(n.name.length > 3 ? n.name.slice(0, 3) : n.name, p.x, p.y);
                    }
                    ctx.lineWidth = active ? 3 : 2;
                    ctx.strokeStyle = active ? '#1d4ed8' : '#ffffff';
                    ctx.stroke();
                    ctx.font = 'bold 12px "Microsoft YaHei","PingFang SC",sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    const shownName = fitCanvasText(n.name, 104);
                    const lw = Math.max(44, Math.min(120, ctx.measureText(shownName).width + 14));
                    roundRect(p.x - lw / 2, p.y + r + 8, lw, 22, 6);
                    ctx.fillStyle = '#fff';
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(148,163,184,0.65)';
                    ctx.stroke();
                    ctx.fillStyle = '#1f2937';
                    ctx.fillText(shownName, p.x, p.y + r + 19);
                    ctx.restore();
                    graphState.renderedNodes.push({ id: n.id, x: p.x, y: p.y, r });
                });
            }
            // ---- hover tooltip（省略文字的小圆点悬停显示完整关系）----
            const oldTip = wrap.querySelector('.canvas-tooltip');
            if (oldTip) oldTip.remove();
            if (!wrap.style.position || wrap.style.position === 'static') wrap.style.position = 'relative';
            const tip = document.createElement('div');
            tip.className = 'canvas-tooltip';
            tip.style.cssText = 'position:absolute;display:none;background:rgba(0,0,0,0.82);color:#fff;padding:5px 12px;border-radius:6px;font-size:12px;pointer-events:none;z-index:999;white-space:nowrap;line-height:1.5;';
            wrap.appendChild(tip);
            const oldDetail = wrap.querySelector('.info-card-graph-detail');
            if (oldDetail) oldDetail.remove();
            const detail = document.createElement('div');
            detail.className = 'info-card-graph-detail';
            detail.style.cssText = 'position:absolute;right:10px;bottom:10px;width:min(340px,calc(100% - 20px));max-height:66%;overflow:auto;display:none;background:rgba(255,255,255,0.97);border:1px solid #d8dee8;border-radius:8px;box-shadow:0 14px 34px rgba(15,23,42,0.16);padding:10px 14px 12px;z-index:998;color:#1f2937;font-size:12px;line-height:1.65;';
            wrap.appendChild(detail);
            const esc = value => Utils.escapeHtml(String(value || '').trim());
            function getEventPoint(ev) {
                const cr = canvas.getBoundingClientRect();
                return { x: ev.clientX - cr.left, y: ev.clientY - cr.top };
            }
            function hitNode(x, y) {
                for (let i = graphState.nodes.length - 1; i >= 0; i--) {
                    const n = graphState.nodes[i];
                    const p = worldToScreen(n);
                    const r = n.r + 8;
                    if (Math.hypot(x - p.x, y - p.y) <= r) return n;
                }
                return null;
            }
            function pointToSegmentDistance(point, start, end) {
                const dx = end.x - start.x;
                const dy = end.y - start.y;
                const lengthSquared = dx * dx + dy * dy;
                if (!lengthSquared) return Math.hypot(point.x - start.x, point.y - start.y);
                const progress = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
                return Math.hypot(point.x - (start.x + dx * progress), point.y - (start.y + dy * progress));
            }
            function hitRelation(x, y) {
                for (const label of graphState.labelHits || []) {
                    if (Math.abs(x - label.x) <= label.w / 2 && Math.abs(y - label.y) <= label.h / 2) return label;
                }
                for (const edge of graphState.edgeHits || []) {
                    for (let index = 1; index < edge.points.length; index += 1) {
                        if (pointToSegmentDistance({ x, y }, edge.points[index - 1], edge.points[index]) <= 9) return edge;
                    }
                }
                return null;
            }
            function profileField(key, value, placeholder) {
                return '<div contenteditable="true" data-profile-field="' + esc(key) + '" style="min-height:22px;border:1px solid #e2e8f0;border-radius:6px;padding:4px 6px;background:#fff;outline:none;">' + esc(value || placeholder || '') + '</div>';
            }
            function bindDetailDrag() {
                const title = detail.querySelector('.info-card-detail-title');
                if (!title) return;
                title.onpointerdown = function(ev) {
                    if (ev.button !== undefined && ev.button !== 0) return;
                    ev.preventDefault();
                    ev.stopPropagation();
                    const wrapRect = wrap.getBoundingClientRect();
                    const detailRect = detail.getBoundingClientRect();
                    const shiftX = ev.clientX - detailRect.left;
                    const shiftY = ev.clientY - detailRect.top;
                    detail.style.right = 'auto';
                    detail.style.bottom = 'auto';
                    function setDetailPos(clientX, clientY) {
                        const maxLeft = Math.max(0, wrap.clientWidth - detail.offsetWidth - 8);
                        const maxTop = Math.max(0, wrap.clientHeight - detail.offsetHeight - 8);
                        const left = Math.max(8, Math.min(maxLeft, clientX - wrapRect.left - shiftX));
                        const top = Math.max(8, Math.min(maxTop, clientY - wrapRect.top - shiftY));
                        detail.style.left = left + 'px';
                        detail.style.top = top + 'px';
                    }
                    setDetailPos(ev.clientX, ev.clientY);
                    const onMove = function(moveEv) {
                        moveEv.preventDefault();
                        setDetailPos(moveEv.clientX, moveEv.clientY);
                    };
                    const onUp = function(upEv) {
                        upEv.preventDefault();
                        window.removeEventListener?.('pointermove', onMove);
                        window.removeEventListener?.('pointerup', onUp);
                    };
                    window.addEventListener?.('pointermove', onMove);
                    window.addEventListener?.('pointerup', onUp, { once: true });
                };
            }
            function positionDetailAtPointer(pointerEvent) {
                if (!pointerEvent) return;
                const wrapRect = wrap.getBoundingClientRect();
                const detailWidth = detail.offsetWidth;
                const detailHeight = detail.offsetHeight;
                const pointerX = pointerEvent.clientX - wrapRect.left;
                const pointerY = pointerEvent.clientY - wrapRect.top;
                const roomOnRight = wrap.clientWidth - pointerX;
                const left = roomOnRight >= detailWidth + 24
                    ? pointerX + 16
                    : pointerX - detailWidth - 16;
                detail.style.right = 'auto';
                detail.style.bottom = 'auto';
                detail.style.left = Math.max(8, Math.min(wrap.clientWidth - detailWidth - 8, left)) + 'px';
                detail.style.top = Math.max(8, Math.min(wrap.clientHeight - detailHeight - 8, pointerY - 12)) + 'px';
            }
            function showDetail(node, pointerEvent) {
                if (!node) return;
                const profile = profiles[node.name] || {};
                const rels = relationMap[node.name] || [];
                const relList = rels.length ? '<ul style="margin:0;padding-left:16px;">' + rels.slice(0, 12).map(r => '<li>' + esc(r.dir === 'out' ? '→ ' : '← ') + esc(r.name) + (r.label ? '：' + esc(r.label) : '') + '</li>').join('') + '</ul>' : '<div style="color:#94a3b8;">暂无关系记录</div>';
                detail.innerHTML =
                    '<button type="button" class="info-card-graph-close" title="关闭人物名片" style="position:absolute;right:8px;top:7px;border:0;background:transparent;color:#64748b;font-size:18px;line-height:1;cursor:pointer;">×</button>' +
                    '<button type="button" class="info-card-profile-one" title="只为当前角色生成简介" style="position:absolute;right:34px;top:7px;border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:14px;padding:3px 9px;font-size:12px;line-height:18px;cursor:pointer;">生成简介</button>' +
                    '<button type="button" class="info-card-profile-save" title="保存当前人物名片修改" style="position:absolute;right:102px;top:7px;border:1px solid #93c5fd;background:#eff6ff;color:#1d4ed8;border-radius:14px;padding:3px 9px;font-size:12px;line-height:18px;cursor:pointer;">保存修改</button>' +
                    '<div class="info-card-detail-title" title="按住这里可拖动人物名片" style="min-height:28px;padding-right:194px;margin-bottom:6px;cursor:move;user-select:none;"><div style="font-size:15px;font-weight:800;color:#0f172a;line-height:26px;">' + esc(node.name) + '</div></div>' +
                    '<div style="display:grid;grid-template-columns:72px 1fr;gap:5px 8px;margin-bottom:10px;align-items:center;">' +
                    '<b>身份</b>' + profileField('identity', profile.identity, '身份/定位') +
                    '<b>所属势力</b>' + profileField('affiliation', profile.affiliation, '所属势力') +
                    '<b>核心目标</b>' + profileField('goal', profile.goal, '核心目标') +
                    '<b>对话方式</b>' + profileField('voice', profile.voice, '对话风格') +
                    '<b>人物弧线</b>' + profileField('arc', profile.arc, '人物变化') +
                    '<b>人物简介</b>' + profileField('intro', profile.intro, '简短简介') +
                    '<b>当前状态</b>' + profileField('current', profile.current, '当前状态') +
                    '<b>写作提醒</b>' + profileField('note', profile.note, '写作提醒') +
                    '</div>' +
                    '<div style="font-weight:700;color:#0f172a;margin:8px 0 4px;">人物关系</div>' + relList;
                bindDetailDrag();
                const closeBtn = detail.querySelector('.info-card-graph-close');
                if (closeBtn) closeBtn.onclick = function() {
                    detail.style.display = 'none';
                    graphState.selectedNode = null;
                    graphState.selectedEdgeIndex = null;
                    draw();
                };
                const genBtn = detail.querySelector('.info-card-profile-one');
                if (genBtn) genBtn.onclick = async function(ev) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    genBtn.disabled = true;
                    genBtn.textContent = '生成中';
                    try {
                        await InfoCardRenderer.generateCharacterProfiles(container, [node.name]);
                    } catch (err) {
                        genBtn.disabled = false;
                        genBtn.textContent = '生成简介';
                        const message = typeof window.formatAiErrorForDisplay === 'function'
                            ? window.formatAiErrorForDisplay(err, '人物简介生成失败')
                            : String(err?.message || err || '人物简介生成失败');
                        Utils.appendLog?.(null, message, 'error');
                        window.Toast?.error?.(message);
                    }
                };
                const saveBtn = detail.querySelector('.info-card-profile-save');
                if (saveBtn) saveBtn.onclick = async function(ev) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    saveBtn.disabled = true;
                    saveBtn.textContent = '保存中';
                    const values = {};
                    detail.querySelectorAll('[data-profile-field]').forEach(field => {
                        values[field.dataset.profileField] = field.textContent.trim();
                    });
                    try {
                        await InfoCardRenderer.saveCharacterProfile(container, node.name, values);
                    } catch (err) {
                        saveBtn.disabled = false;
                        saveBtn.textContent = '保存修改';
                        window.Toast?.error?.(err.message || '人物名片保存失败');
                    }
                };
                detail.style.display = 'block';
                positionDetailAtPointer(pointerEvent);
                draw();
            }
            canvas.onwheel = function(ev) {
                ev.preventDefault();
                const point = getEventPoint(ev);
                const before = graphState.scale;
                const next = Math.max(getMinimumSafeScale(), Math.min(2.4, before * (ev.deltaY < 0 ? 1.16 : 1 / 1.16)));
                if (next === before) return;
                const anchoredWorld = screenToWorld(point.x, point.y);
                graphState.scale = next;
                graphState.offsetX = point.x - anchoredWorld.x * next;
                graphState.offsetY = point.y - anchoredWorld.y * next;
                draw();
            };
            canvas.onpointerdown = function(ev) {
                const p = getEventPoint(ev);
                const hit = hitNode(p.x, p.y);
                const relationHit = hit ? null : hitRelation(p.x, p.y);
                graphState.downX = p.x;
                graphState.downY = p.y;
                graphState.moved = false;
                if (hit) {
                    graphState.dragNode = hit;
                    const world = screenToWorld(p.x, p.y);
                    graphState.dragOffsetX = world.x - hit.x;
                    graphState.dragOffsetY = world.y - hit.y;
                    graphState.selectedNode = hit;
                    graphState.selectedEdgeIndex = null;
                    graphState.pendingEdgeIndex = null;
                    canvas.style.cursor = 'grabbing';
                } else if (relationHit) {
                    graphState.pendingEdgeIndex = relationHit.edgeIndex;
                    graphState.selectedNode = null;
                    graphState.panStart = null;
                    canvas.style.cursor = 'pointer';
                    detail.style.display = 'none';
                } else {
                    graphState.panStart = { x: ev.clientX, y: ev.clientY, ox: graphState.offsetX, oy: graphState.offsetY };
                    graphState.selectedNode = null;
                    graphState.selectedEdgeIndex = null;
                    graphState.pendingEdgeIndex = null;
                    canvas.style.cursor = 'grabbing';
                    detail.style.display = 'none';
                }
                try {
                    canvas.setPointerCapture?.(ev.pointerId);
                } catch (_error) {
                    // The click still works when the browser has already cancelled pointer capture.
                }
                draw();
            };
            const onPointerMove = function(ev) {
                const p = getEventPoint(ev);
                if (graphState.dragNode) {
                    const world = screenToWorld(p.x, p.y);
                    graphState.dragNode.x = Math.max(graphState.dragNode.r + 32, Math.min(w - graphState.dragNode.r - 32, world.x - graphState.dragOffsetX));
                    graphState.dragNode.y = Math.max(graphState.dragNode.r + 32, Math.min(h - graphState.dragNode.r - 46, world.y - graphState.dragOffsetY));
                    graphState.moved = graphState.moved || Math.hypot(p.x - graphState.downX, p.y - graphState.downY) > 4;
                    if (graphState.moved) graphState.userPositioned = true;
                    draw();
                    return;
                }
                if (graphState.panStart) {
                    graphState.offsetX = graphState.panStart.ox + ev.clientX - graphState.panStart.x;
                    graphState.offsetY = graphState.panStart.oy + ev.clientY - graphState.panStart.y;
                    graphState.moved = true;
                    graphState.userPositioned = true;
                    draw();
                    return;
                }
                const foundNode = hitNode(p.x, p.y);
                graphState.hoverNode = foundNode;
                const found = foundNode ? null : hitRelation(p.x, p.y);
                graphState.hoverEdgeIndex = found ? found.edgeIndex : null;
                canvas.style.cursor = foundNode ? 'grab' : (found ? 'pointer' : 'default');
                if (found) {
                    const tipX = Number.isFinite(found.x) ? found.x : p.x;
                    const tipY = Number.isFinite(found.y) ? found.y : p.y;
                    tip.style.display = 'block';
                    tip.style.left = Math.min(tipX + 12, w - 180) + 'px';
                    tip.style.top = (tipY - 28) + 'px';
                    tip.textContent = found.text;
                } else if (foundNode) {
                    tip.style.display = 'block';
                    tip.style.left = Math.min(p.x + 12, w - 120) + 'px';
                    tip.style.top = (p.y - 30) + 'px';
                    tip.textContent = foundNode.name;
                } else {
                    tip.style.display = 'none';
                }
                draw();
            };
            const onPointerUp = function(ev) {
                const clicked = graphState.dragNode && !graphState.moved ? graphState.dragNode : null;
                const clickedEdgeIndex = !graphState.moved && Number.isInteger(graphState.pendingEdgeIndex)
                    ? graphState.pendingEdgeIndex
                    : null;
                graphState.dragNode = null;
                graphState.panStart = null;
                graphState.pendingEdgeIndex = null;
                canvas.style.cursor = 'grab';
                if (clicked) {
                    showDetail(clicked, ev);
                } else if (clickedEdgeIndex !== null) {
                    graphState.selectedEdgeIndex = graphState.selectedEdgeIndex === clickedEdgeIndex ? null : clickedEdgeIndex;
                    graphState.selectedNode = null;
                    detail.style.display = 'none';
                    draw();
                }
            };
            const onPointerCancel = function() {
                graphState.dragNode = null;
                graphState.panStart = null;
                graphState.pendingEdgeIndex = null;
                graphState.moved = false;
                canvas.style.cursor = 'grab';
                draw();
            };
            window.addEventListener?.('pointerup', onPointerUp);
            canvas.onpointerup = onPointerUp;
            canvas.onpointercancel = onPointerCancel;
            canvas.onlostpointercapture = onPointerCancel;
            canvas.onpointermove = onPointerMove;
            canvas.onmouseleave = function() {
                tip.style.display = 'none';
                graphState.hoverNode = null;
                graphState.hoverEdgeIndex = null;
                draw();
            };
            const onResize = function() {
                if (canvas.isConnected === false) {
                    canvas._graphCleanup?.();
                    return;
                }
                InfoCardRenderer.drawCanvas(container);
            };
            window.addEventListener?.('resize', onResize);
            canvas._graphCleanup = function() {
                if (window.removeEventListener) {
                    window.removeEventListener('resize', onResize);
                    window.removeEventListener('pointerup', onPointerUp);
                }
                canvas.onpointermove = null;
                canvas.onmouseleave = null;
                canvas.onwheel = null;
                canvas.onpointerdown = null;
                canvas.onpointerup = null;
                canvas.onpointercancel = null;
                canvas.onlostpointercapture = null;
                tip.remove?.();
                detail.remove?.();
                canvas._graphCleanup = null;
            };
            draw();
        }
    };

    function escapeInfoCardRegExp(text) {
        return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function getInfoCardSection(content, heading) {
        const pattern = new RegExp('(^|\\n)##\\s*' + escapeInfoCardRegExp(heading) + '\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)');
        const match = String(content || '').match(pattern);
        return match ? (match[2] || '').trim() : '';
    }

    function replaceInfoCardSection(content, heading, sectionWithHeading) {
        const text = String(content || '');
        const section = String(sectionWithHeading || '').trim().startsWith('##')
            ? String(sectionWithHeading || '').trim()
            : '## ' + heading + '\n' + String(sectionWithHeading || '').trim();
        const pattern = new RegExp('(^|\\n)##\\s*' + escapeInfoCardRegExp(heading) + '\\s*\\n[\\s\\S]*?(?=\\n##\\s|$)');
        if (pattern.test(text)) {
            return text.replace(pattern, function(match, prefix) {
                return (prefix || '') + section;
            });
        }
        return (text.replace(/\s+$/, '') + '\n\n' + section + '\n').trim();
    }

    function getInfoCardUsefulLines(sectionText) {
        return String(sectionText || '')
            .split(/\r?\n/)
            .map(function(line) { return line.trim(); })
            .filter(function(line) {
                if (!line) return false;
                if (line.indexOf('待章节展开') >= 0) return false;
                if (/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/.test(line)) return false;
                if (/^（?(无|暂无|无新增|无新信息)/.test(line)) return false;
                return true;
            });
    }

    function getRelationshipOwner(line) {
        const text = String(line || '').trim();
        const idx = text.search(/[：:]/);
        return idx > 0 ? text.slice(0, idx).trim() : '';
    }

    function getInfoCardRelationHeading(content) {
        const text = String(content || '');
        if (/(^|\n)##\s*角色关系网\s*\n/.test(text)) return '角色关系网';
        if (/(^|\n)##\s*人物关系\s*\n/.test(text)) return '人物关系';
        return '角色关系网';
    }

    function protectInfoCardChapterMerge(existingInfoCard, newInfoCard, meta) {
        const oldText = String(existingInfoCard || '');
        const nextText = String(newInfoCard || '');
        if (!oldText.trim() || !nextText.trim()) return nextText;
        const isChapterUpdate = !meta || meta.sourceType === 'chapter' || meta.chapterNum || meta.chapterName;
        if (!isChapterUpdate) return nextText;

        const heading = getInfoCardRelationHeading(oldText);
        const oldLines = getInfoCardUsefulLines(getInfoCardSection(oldText, heading));
        const newLines = getInfoCardUsefulLines(getInfoCardSection(nextText, heading));
        if (oldLines.length < 3 || newLines.length >= Math.ceil(oldLines.length * 0.7)) return nextText;

        const merged = [];
        const ownerIndex = new Map();
        oldLines.concat(newLines).forEach(function(line) {
            const owner = getRelationshipOwner(line) || line;
            if (ownerIndex.has(owner)) {
                merged[ownerIndex.get(owner)] = line;
            } else {
                ownerIndex.set(owner, merged.length);
                merged.push(line);
            }
        });
        return replaceInfoCardSection(nextText, heading, '## ' + heading + '\n' + merged.join('\n'));
    }

    window.InfoCardRenderer = InfoCardRenderer;
    window.resolveRelationLabelLayout = resolveRelationLabelLayout;
    window.relationLabelBoxesOverlap = relationLabelBoxesOverlap;
    window.relationColor = InfoCardRenderer.relationColor;
    window.escapeInfoCardRegExp = escapeInfoCardRegExp;
    window.getInfoCardSection = getInfoCardSection;
    window.replaceInfoCardSection = replaceInfoCardSection;
    window.getInfoCardUsefulLines = getInfoCardUsefulLines;
    window.getRelationshipOwner = getRelationshipOwner;
    window.protectInfoCardChapterMerge = protectInfoCardChapterMerge;
    window.ZHIYU_INFO_CARD_RENDERER_READY = true;
})(window);
