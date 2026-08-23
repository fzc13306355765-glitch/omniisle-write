(function(window) {
    'use strict';

    function isActionFullyVisible(actionTarget, spotlightTarget) {
        const rect = actionTarget.getBoundingClientRect();
        let bounds = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
        let ancestor = actionTarget.parentElement;
        while (ancestor) {
            const style = window.getComputedStyle(ancestor);
            if (ancestor === spotlightTarget || /(auto|scroll|hidden|clip)/.test(style.overflow + style.overflowX + style.overflowY)) {
                const ancestorRect = ancestor.getBoundingClientRect();
                bounds = {
                    left: Math.max(bounds.left, ancestorRect.left),
                    top: Math.max(bounds.top, ancestorRect.top),
                    right: Math.min(bounds.right, ancestorRect.right),
                    bottom: Math.min(bounds.bottom, ancestorRect.bottom)
                };
            }
            if (ancestor === spotlightTarget) break;
            ancestor = ancestor.parentElement;
        }
        return rect.left >= bounds.left && rect.top >= bounds.top && rect.right <= bounds.right && rect.bottom <= bounds.bottom;
    }

    function resolveSpotlightTarget(step, actionTarget, isVisible, focusSelector) {
        const configured = typeof step.spotlightTarget === 'function'
            ? step.spotlightTarget(actionTarget)
            : (step.spotlightTarget ? window.document.querySelector(step.spotlightTarget) : null);
        if (isVisible(configured)) return configured;
        const container = actionTarget?.closest?.(focusSelector);
        return isVisible(container) ? container : actionTarget;
    }

    function clearActionHighlight(runtime) {
        runtime.actionTarget?.classList.remove('outline-tutorial-action-target', 'outline-tutorial-info-target', 'is-wrong');
        runtime.actionTarget?.removeAttribute('data-tutorial-target-active');
        runtime.actionTarget = null;
        const ring = runtime.root?.querySelector('.outline-tutorial-action-ring');
        if (ring) ring.hidden = true;
    }

    function setActionHighlight(runtime, target, step) {
        clearActionHighlight(runtime);
        runtime.actionTarget = target;
        if (target) target.setAttribute('data-tutorial-target-active', 'true');
        if (!target || step.highlightAction === false) return;
        if (['click', 'input', 'change', 'selection'].includes(step.type)) target.classList.add('outline-tutorial-action-target');
        else if (target !== runtime.target) target.classList.add('outline-tutorial-info-target');
    }

    function ensureActionTargetVisible(actionTarget, spotlightTarget) {
        if (isActionFullyVisible(actionTarget, spotlightTarget)) return false;
        actionTarget.scrollIntoView({
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
            block: actionTarget === spotlightTarget ? 'center' : 'nearest',
            inline: 'nearest'
        });
        return true;
    }

    function positionActionRing(ring, actionTarget, actionRect) {
        const mode = actionTarget?.classList.contains('outline-tutorial-action-target')
            ? 'is-action'
            : (actionTarget?.classList.contains('outline-tutorial-info-target') ? 'is-info' : '');
        ring.hidden = !actionRect || !mode;
        ring.classList.toggle('is-action', mode === 'is-action');
        ring.classList.toggle('is-info', mode === 'is-info');
        if (ring.hidden) return;
        const padding = mode === 'is-action' ? 4 : 3;
        const left = Math.max(0, actionRect.left - padding);
        const top = Math.max(0, actionRect.top - padding);
        Object.assign(ring.style, {
            left: left + 'px',
            top: top + 'px',
            width: Math.max(0, Math.min(window.innerWidth, actionRect.right + padding) - left) + 'px',
            height: Math.max(0, Math.min(window.innerHeight, actionRect.bottom + padding) - top) + 'px',
            borderRadius: window.getComputedStyle(actionTarget).borderRadius || '8px'
        });
    }

    function positionNote(note, targetRect, frameRect) {
        const gap = 16;
        const margin = 12;
        const minimumSideWidth = 260;
        note.style.removeProperty('width');
        let width = Math.min(note.offsetWidth || 340, window.innerWidth - margin * 2);
        const sideWidth = Math.max(targetRect.left, window.innerWidth - targetRect.right) - gap - margin;
        if (!frameRect && sideWidth >= minimumSideWidth && sideWidth < width) {
            note.style.width = Math.floor(sideWidth) + 'px';
            width = note.offsetWidth;
        }
        const height = note.offsetHeight || 220;
        if (frameRect && frameRect.right - frameRect.left >= width + margin * 2 && frameRect.bottom - frameRect.top >= height + margin * 2) {
            const outsideFrame = [
                { side: 'frame-right', left: frameRect.right + gap, top: targetRect.top },
                { side: 'frame-left', left: frameRect.left - width - gap, top: targetRect.top },
                { side: 'frame-bottom', left: targetRect.left, top: frameRect.bottom + gap },
                { side: 'frame-top', left: targetRect.left, top: frameRect.top - height - gap }
            ].map(candidate => ({
                ...candidate,
                left: Math.max(margin, Math.min(candidate.left, window.innerWidth - width - margin)),
                top: Math.max(margin, Math.min(candidate.top, window.innerHeight - height - margin))
            })).filter(candidate => (
                candidate.left + width <= frameRect.left
                || candidate.left >= frameRect.right
                || candidate.top + height <= frameRect.top
                || candidate.top >= frameRect.bottom
            ));
            if (outsideFrame.length) {
                const targetCenterX = (targetRect.left + targetRect.right) / 2;
                const targetCenterY = (targetRect.top + targetRect.bottom) / 2;
                outsideFrame.sort((a, b) => {
                    const distance = candidate => Math.pow(candidate.left + width / 2 - targetCenterX, 2) + Math.pow(candidate.top + height / 2 - targetCenterY, 2);
                    return distance(a) - distance(b);
                });
                note.dataset.side = outsideFrame[0].side;
                note.style.left = outsideFrame[0].left + 'px';
                note.style.top = outsideFrame[0].top + 'px';
                return;
            }
            const corners = [
                { side: 'inside-top-left', left: frameRect.left + margin, top: frameRect.top + margin },
                { side: 'inside-top-right', left: frameRect.right - width - margin, top: frameRect.top + margin },
                { side: 'inside-bottom-left', left: frameRect.left + margin, top: frameRect.bottom - height - margin },
                { side: 'inside-bottom-right', left: frameRect.right - width - margin, top: frameRect.bottom - height - margin }
            ];
            const targetCenterX = (targetRect.left + targetRect.right) / 2;
            const targetCenterY = (targetRect.top + targetRect.bottom) / 2;
            const chosenCorner = corners.map(candidate => {
                const overlapWidth = Math.max(0, Math.min(candidate.left + width, targetRect.right) - Math.max(candidate.left, targetRect.left));
                const overlapHeight = Math.max(0, Math.min(candidate.top + height, targetRect.bottom) - Math.max(candidate.top, targetRect.top));
                return { ...candidate, overlap: overlapWidth * overlapHeight };
            }).sort((a, b) => {
                const distance = candidate => Math.pow(candidate.left + width / 2 - targetCenterX, 2) + Math.pow(candidate.top + height / 2 - targetCenterY, 2);
                return a.overlap - b.overlap || distance(b) - distance(a);
            })[0];
            if (chosenCorner.overlap <= 1) {
                note.dataset.side = chosenCorner.side;
                note.style.left = chosenCorner.left + 'px';
                note.style.top = chosenCorner.top + 'px';
                return;
            }
        }
        const spaces = [
            { side: 'right', value: window.innerWidth - targetRect.right, left: targetRect.right + gap, top: targetRect.top },
            { side: 'left', value: targetRect.left, left: targetRect.left - width - gap, top: targetRect.top },
            { side: 'bottom', value: window.innerHeight - targetRect.bottom, left: targetRect.left, top: targetRect.bottom + gap },
            { side: 'top', value: targetRect.top, left: targetRect.left, top: targetRect.top - height - gap }
        ].map(candidate => {
            const left = Math.max(margin, Math.min(candidate.left, window.innerWidth - width - margin));
            const top = Math.max(margin, Math.min(candidate.top, window.innerHeight - height - margin));
            const overlapWidth = Math.max(0, Math.min(left + width, targetRect.right) - Math.max(left, targetRect.left));
            const overlapHeight = Math.max(0, Math.min(top + height, targetRect.bottom) - Math.max(top, targetRect.top));
            const distance = Math.pow(left + width / 2 - (targetRect.left + targetRect.right) / 2, 2)
                + Math.pow(top + height / 2 - (targetRect.top + targetRect.bottom) / 2, 2);
            return { ...candidate, left, top, overlap: overlapWidth * overlapHeight, distance };
        }).sort((a, b) => a.overlap - b.overlap || b.distance - a.distance || b.value - a.value);
        const chosen = spaces[0];
        note.dataset.side = chosen.side;
        note.style.left = chosen.left + 'px';
        note.style.top = chosen.top + 'px';
    }

    window.ZHIYU_OUTLINE_TUTORIAL_POSITIONING = Object.freeze({
        clearActionHighlight,
        ensureActionTargetVisible,
        positionActionRing,
        positionNote,
        resolveSpotlightTarget,
        setActionHighlight
    });
})(window);
