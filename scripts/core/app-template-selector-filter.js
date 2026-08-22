// Prompt-template selector filtering split from app-template-selector.js.
// Only decides which templates should be visible in the selector modal.
(function(window) {
    'use strict';

    const getTemplateLikeCount = window.getTemplateLikeCount || function(t) {
        return Number((t && (t.likes || t.likeCount)) || 0);
    };
    const getTemplateUsageCount = window.getTemplateUsageCount || function(t) {
        return Number((t && t.usageCount) || 0);
    };

    function safeLower(value) {
        return String(value || '').toLowerCase();
    }

    function filterTemplateSelectorItems(templates, options) {
        const opts = options || {};
        const list = Array.isArray(templates) ? templates.slice() : [];
        const tab = opts.tab || 'public';
        const subCategory = opts.subCategory || 'all';
        const subCategories = Array.isArray(opts.subCategories)
            ? opts.subCategories.filter(Boolean)
            : (subCategory !== 'all' ? [subCategory] : []);
        const sort = opts.sort || '综合';
        const currentUserId = opts.currentUserId || '';
        const search = safeLower(opts.search).trim();

        let filtered = list;

        if (tab === 'fav') {
            filtered = filtered.filter(t => t && t.favorited);
        } else if (tab === 'custom') {
            filtered = filtered.filter(t => t && !t.builtIn && t.creatorId === currentUserId);
        }

        if (subCategories.length) {
            filtered = filtered.filter(t => t && subCategories.some(function(category) {
                return t.subCategory === category || t.category === category;
            }));
        }

        if (search) {
            filtered = filtered.filter(t => {
                if (!t) return false;
                return safeLower(t.title).includes(search) ||
                    safeLower(t.description).includes(search) ||
                    (Array.isArray(t.tags) && t.tags.some(tag => safeLower(tag).includes(search)));
            });
        }

        if (sort === '热门') {
            filtered.sort((a, b) => getTemplateLikeCount(b) - getTemplateLikeCount(a));
        } else if (sort === '最新') {
            filtered.sort((a, b) => String((b && b.createdAt) || '').localeCompare(String((a && a.createdAt) || '')));
        } else {
            filtered.sort((a, b) => getTemplateUsageCount(b) - getTemplateUsageCount(a));
        }

        return filtered;
    }

    window.filterTemplateSelectorItems = filterTemplateSelectorItems;
    window.ZHIYU_TEMPLATE_SELECTOR_FILTER_READY = true;
})(window);
