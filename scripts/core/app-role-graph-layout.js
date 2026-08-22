// Deterministic layout helpers for the role-relation graph.
(function(window) {
    'use strict';

    function relationLabelBoxesOverlap(a, b) {
        if (!a || !b) return false;
        return Math.abs(a.x - b.x) < (a.width + b.width) / 2 + 4
            && Math.abs(a.y - b.y) < (a.height + b.height) / 2 + 4;
    }

    function pointOnCurve(start, end, curve, progress) {
        const t = Math.max(0.12, Math.min(0.88, Number(progress) || 0.5));
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.max(1, Math.hypot(dx, dy));
        const nx = -dy / length;
        const ny = dx / length;
        const control = {
            x: (start.x + end.x) / 2 + nx * curve,
            y: (start.y + end.y) / 2 + ny * curve
        };
        const inverse = 1 - t;
        return {
            x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
            y: inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y
        };
    }

    function clampRelationCurveToBounds(start, end, curve, bounds, padding) {
        const area = bounds || { width: 9999, height: 9999 };
        const inset = Math.max(0, Number(padding) || 0);
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.max(1, Math.hypot(dx, dy));
        const normal = { x: -dy / length, y: dx / length };
        const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
        let minimum = Number.NEGATIVE_INFINITY;
        let maximum = Number.POSITIVE_INFINITY;
        const constrainAxis = function(base, coefficient, lower, upper) {
            if (Math.abs(coefficient) < 0.000001) return base >= lower && base <= upper;
            const first = (lower - base) / coefficient;
            const second = (upper - base) / coefficient;
            minimum = Math.max(minimum, Math.min(first, second));
            maximum = Math.min(maximum, Math.max(first, second));
            return minimum <= maximum;
        };
        const maxX = Math.max(inset, Number(area.width) - inset);
        const maxY = Math.max(inset, Number(area.height) - inset);
        if (!constrainAxis(midpoint.x, normal.x, inset, maxX)
            || !constrainAxis(midpoint.y, normal.y, inset, maxY)) return 0;
        const requested = Number(curve) || 0;
        return Math.max(minimum, Math.min(maximum, requested));
    }

    function resolveRelationLabelLayout(start, end, baseCurve, labelWidth, occupied, bounds) {
        const width = Math.max(28, Number(labelWidth) || 28);
        const height = 20;
        const area = bounds || { width: 9999, height: 9999 };
        const occupiedBoxes = Array.isArray(occupied) ? occupied : [];
        const curveOffsets = [0];
        for (let distance = 26; distance <= 520; distance += 26) {
            curveOffsets.push(distance, -distance);
        }
        const progressOffsets = [0.5];
        for (let distance = 0.05; distance <= 0.4; distance += 0.05) {
            progressOffsets.push(0.5 - distance, 0.5 + distance);
        }
        let fallback = null;
        for (const progress of progressOffsets) {
            for (const offset of curveOffsets) {
                const curve = clampRelationCurveToBounds(
                    start,
                    end,
                    (Number(baseCurve) || 0) + offset,
                    area,
                    14
                );
                const point = pointOnCurve(start, end, curve, progress);
                const candidate = {
                    x: Math.max(width / 2 + 8, Math.min(point.x, area.width - width / 2 - 8)),
                    y: Math.max(height / 2 + 8, Math.min(point.y, area.height - height / 2 - 8)),
                    width,
                    height,
                    curve,
                    progress,
                    visible: true
                };
                fallback = candidate;
                if (!occupiedBoxes.some(function(box) { return relationLabelBoxesOverlap(box, candidate); })) return candidate;
            }
        }
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const lengthSquared = Math.max(1, dx * dx + dy * dy);
        const length = Math.sqrt(lengthSquared);
        const nx = -dy / length;
        const ny = dx / length;
        const horizontalStep = Math.max(width + 18, 104);
        const verticalStep = height + 14;
        for (let y = height / 2 + 8; y <= area.height - height / 2 - 8; y += verticalStep) {
            for (let x = width / 2 + 8; x <= area.width - width / 2 - 8; x += horizontalStep) {
                const projection = ((x - start.x) * dx + (y - start.y) * dy) / lengthSquared;
                const progress = Math.max(0.12, Math.min(0.88, projection));
                const baseX = start.x + dx * progress;
                const baseY = start.y + dy * progress;
                const normalDistance = (x - baseX) * nx + (y - baseY) * ny;
                const curve = clampRelationCurveToBounds(
                    start,
                    end,
                    normalDistance / Math.max(0.08, 2 * progress * (1 - progress)),
                    area,
                    14
                );
                const point = pointOnCurve(start, end, curve, progress);
                const candidate = {
                    x: Math.max(width / 2 + 8, Math.min(point.x, area.width - width / 2 - 8)),
                    y: Math.max(height / 2 + 8, Math.min(point.y, area.height - height / 2 - 8)),
                    width,
                    height,
                    curve,
                    progress,
                    visible: true
                };
                if (!occupiedBoxes.some(function(box) { return relationLabelBoxesOverlap(box, candidate); })) return candidate;
            }
        }
        return fallback
            ? { ...fallback, visible: false }
            : { x: width / 2 + 8, y: height / 2 + 8, width, height, curve: baseCurve || 0, progress: 0.5, visible: false };
    }

    function getGridColumnCount(count, width, height) {
        if (count <= 1) return 1;
        const aspect = Math.max(0.72, Math.min(2.2, Number(width) / Math.max(1, Number(height) || 1)));
        return Math.min(count, Math.max(2, Math.ceil(Math.sqrt(count * aspect))));
    }

    function getLayoutColumnCount(count, width, height) {
        if (count <= 1) return 1;
        const preferredColumns = getGridColumnCount(count, width, height);
        const maxColumnsForLabels = Math.max(2, Math.floor(Math.max(1, width - 128) / 132) + 1);
        return Math.min(preferredColumns, maxColumnsForLabels, count);
    }

    function getRecommendedGraphHeight(nodeCount, edgeCount, viewportHeight, canvasWidth) {
        const count = Math.max(0, Number(nodeCount) || 0);
        const edges = Math.max(0, Number(edgeCount) || 0);
        const width = Math.max(240, Number(canvasWidth) || 920);
        const outerCount = Math.max(0, count - 1);
        const rings = Math.max(1, Math.ceil(outerCount / 10));
        const radialHeight = Math.max(460, Math.round(width * 0.58), 420 + Math.max(0, rings - 1) * 210);
        const compactMarginX = 72;
        const compactMarginY = 82;
        const compactGap = 106;
        const compactColumns = Math.max(1, Math.floor(Math.max(0, width - compactMarginX * 2) / compactGap) + 1);
        const compactRows = Math.max(1, Math.ceil(Math.max(0, count - 1) / compactColumns) + 2);
        const compactGridHeight = compactMarginY * 2 + Math.max(0, compactRows - 1) * compactGap;
        const denseRelationExtra = Math.ceil(Math.max(0, edges - 42) / 24) * 24;
        return Math.max(
            360,
            Number(viewportHeight) || 0,
            radialHeight + denseRelationExtra,
            width <= 480 && count > 1 ? compactGridHeight : 0
        );
    }

    function pickPrimaryRoleName(names, profiles, degreeMap) {
        const roleNames = Array.isArray(names) ? names : [];
        const profileMap = profiles && typeof profiles === 'object' ? profiles : {};
        const explicitCandidates = roleNames.map(function(name) {
            const profile = profileMap[name] || {};
            const identity = String(profile.identity || '').trim();
            const text = [
                profile.intro,
                profile.goal,
                profile.arc,
                profile.current,
                profile.note
            ].filter(Boolean).join(' ');
            let score = 0;
            if (/^(?:第一|核心|本书|男|女)?(?:主角|主人公|男主|女主)(?:$|[（(、，,:：/\s])/.test(identity)) score += 1200;
            if (/(?:^|[，。；;：:\s])(?:本书|故事|核心|第一)?(?:主角|主人公|男主|女主)(?:$|[，。；;：:\s])/.test(text)) score += 1000;
            if (/主视角|故事核心|核心人物/.test(text)) score += 500;
            if (/配角|反派|敌人|路人|炮灰/.test(identity)) score -= 600;
            score += Math.min(200, Number(degreeMap?.[name]) || 0);
            return { name, score };
        }).filter(item => item.score >= 500);
        if (explicitCandidates.length) {
            explicitCandidates.sort(function(a, b) {
                return b.score - a.score || String(a.name).localeCompare(String(b.name));
            });
            return explicitCandidates[0].name;
        }
        const firstProfileRole = Object.keys(profileMap).find(name => roleNames.includes(name));
        if (firstProfileRole) return firstProfileRole;
        return roleNames.slice().sort(function(a, b) {
            return (degreeMap?.[b] || 0) - (degreeMap?.[a] || 0) || String(a).localeCompare(String(b));
        })[0] || '';
    }

    function createInitialNodes(names, degreeMap, width, height, preferredCenterName) {
        const ordered = (Array.isArray(names) ? names : []).slice().sort(function(a, b) {
            if (a === preferredCenterName) return -1;
            if (b === preferredCenterName) return 1;
            return (degreeMap?.[b] || 0) - (degreeMap?.[a] || 0) || String(a).localeCompare(String(b));
        });
        const w = Math.max(240, Number(width) || 640);
        const h = Math.max(240, Number(height) || 420);
        const cx = w / 2;
        const cy = h / 2;
        if (w <= 480 && ordered.length > 1) {
            const marginX = 72;
            const marginY = 82;
            const minimumGap = 106;
            const columns = Math.max(1, Math.min(
                ordered.length,
                Math.floor(Math.max(0, w - marginX * 2) / minimumGap) + 1
            ));
            const rows = Math.max(1, Math.ceil((ordered.length - 1) / columns) + 2);
            const slots = [];
            for (let row = 0; row < rows; row += 1) {
                for (let column = 0; column < columns; column += 1) {
                    slots.push({
                        x: columns === 1
                            ? cx
                            : marginX + column * (w - marginX * 2) / (columns - 1),
                        y: rows === 1
                            ? cy
                            : marginY + row * (h - marginY * 2) / (rows - 1)
                    });
                }
            }
            const centerRadius = Math.min(32, (ordered.length > 24 ? 20 : (ordered.length > 14 ? 22 : 25)) + 6);
            const availableSlots = slots.filter(function(slot) {
                return Math.hypot(slot.x - cx, slot.y - cy) >= centerRadius + 28 + 40;
            }).sort(function(a, b) {
                return Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy)
                    || a.y - b.y
                    || a.x - b.x;
            });
            return ordered.map(function(name, index) {
                const radius = Math.min(
                    28,
                    (ordered.length > 24 ? 20 : 22) + Math.min(2, Math.floor((degreeMap?.[name] || 0) / 4))
                );
                if (index === 0) {
                    return { id: name, name, x: cx, y: cy, r: Math.min(32, radius + 4) };
                }
                const slot = availableSlots[index - 1] || slots[index - 1] || { x: cx, y: cy };
                return {
                    id: name,
                    name,
                    x: slot.x,
                    y: slot.y,
                    r: radius
                };
            });
        }
        const nodes = ordered.map(function(name, index) {
            const baseRadius = ordered.length > 24 ? 20 : (ordered.length > 14 ? 22 : 25);
            const radius = Math.min(28, baseRadius + Math.min(2, Math.floor((degreeMap?.[name] || 0) / 4)));
            if (index === 0) return { id: name, name, x: cx, y: cy, r: Math.min(32, radius + 4) };
            const ring = Math.floor((index - 1) / 10);
            const offset = (index - 1) % 10;
            const ringSize = Math.min(10, Math.max(1, ordered.length - 1 - ring * 10));
            const angle = (Math.PI * 2 * offset / ringSize) - Math.PI / 2 + ring * 0.34;
            const ringRadiusX = Math.min(w * 0.43, 185 + ring * 145);
            const ringRadiusY = Math.min(h * 0.42, 150 + ring * 145);
            return {
                id: name,
                name,
                x: cx + ringRadiusX * Math.cos(angle),
                y: cy + ringRadiusY * Math.sin(angle),
                r: radius
            };
        });
        for (let loop = 0; loop < 70; loop += 1) {
            for (let left = 0; left < nodes.length; left += 1) {
                for (let right = left + 1; right < nodes.length; right += 1) {
                    const a = nodes[left];
                    const b = nodes[right];
                    const dx = b.x - a.x;
                    const dy = b.y - a.y;
                    const distance = Math.max(1, Math.hypot(dx, dy));
                    const required = a.r + b.r + 58;
                    if (distance >= required) continue;
                    const push = (required - distance) * 0.38;
                    if (left === 0) {
                        // 主角保持画布中心，外围节点承担完整位移，避免中等宽度下头像压住主角。
                        b.x += dx / distance * push * 2;
                        b.y += dy / distance * push * 2;
                    } else {
                        a.x -= dx / distance * push;
                        a.y -= dy / distance * push;
                        b.x += dx / distance * push;
                        b.y += dy / distance * push;
                    }
                }
            }
            nodes.forEach(function(node, index) {
                if (index === 0) return;
                node.x = Math.max(node.r + 64, Math.min(w - node.r - 64, node.x));
                node.y = Math.max(node.r + 72, Math.min(h - node.r - 72, node.y));
            });
        }
        return nodes;
    }

    function buildPairCurvePlan(edges) {
        const groups = new Map();
        (Array.isArray(edges) ? edges : []).forEach(function(edge, index) {
            const pairKey = [edge.from, edge.to].sort().join('||');
            if (!groups.has(pairKey)) groups.set(pairKey, []);
            groups.get(pairKey).push({ edge, index });
        });
        const curves = new Map();
        groups.forEach(function(group) {
            const directionCounts = new Map();
            group.forEach(function(item) {
                const key = item.edge.from + '→' + item.edge.to;
                directionCounts.set(key, (directionCounts.get(key) || 0) + 1);
            });
            const hasTwoDirections = directionCounts.size > 1;
            const directionIndexes = new Map();
            group.forEach(function(item) {
                const directionKey = item.edge.from + '→' + item.edge.to;
                const sameDirectionTotal = directionCounts.get(directionKey) || 1;
                const sameDirectionIndex = directionIndexes.get(directionKey) || 0;
                directionIndexes.set(directionKey, sameDirectionIndex + 1);
                const laneOffset = (sameDirectionIndex - (sameDirectionTotal - 1) / 2) * 28;
                // Reverse edges start from the other endpoint; the same signed curve therefore lands on the opposite side.
                curves.set(item.index, (hasTwoDirections ? 42 : 0) + laneOffset);
            });
        });
        return curves;
    }

    window.ZHIYU_ROLE_GRAPH_LAYOUT = Object.freeze({
        relationLabelBoxesOverlap,
        resolveRelationLabelLayout,
        clampRelationCurveToBounds,
        getLayoutColumnCount,
        getRecommendedGraphHeight,
        pickPrimaryRoleName,
        createInitialNodes,
        buildPairCurvePlan,
        pointOnCurve
    });
})(window);
