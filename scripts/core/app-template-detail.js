// Split project template detail modal logic.
// Keeps template detail display, comments, ratings and favorites outside the main template page module.
(function(window) {
    'use strict';

    const Utils = window.ZHIYU_UTILS || {};
    const AppState = window.ZHIYU_APP_STATE || window.AppState || {};
    const StorageService = window.ZHIYU_STORAGE_SERVICE || window.StorageService;
    const gTPublic = window.gTPublic || function() { return []; };
    const sT = window.sT || function() {};
    const getTemplateLikeCount = window.getTemplateLikeCount || function(t) { return Number(t?.likes || t?.likeCount || 0); };
    const getTemplateUsageCount = window.getTemplateUsageCount || function(t) { return Number(t?.usageCount || 0); };
    const createTemplateAuthorAvatar = window.createTemplateAuthorAvatar;

    if (!AppState.template) AppState.template = {};
    if (!AppState.auth) AppState.auth = {};

    function openTemplateDetail(id) {
        AppState.template.viewingId = id;
        const templates = gTPublic();
        const t = templates.find(x => x.id === id);
        if (!t) return;

        document.getElementById('tplDetailTitle').textContent = t.title;
        document.getElementById('tplDetailTags').innerHTML = (t.tags || []).map(tag =>
            `<span style="background:#e8ebf2;color:#5a5d6b;padding:2px 10px;border-radius:10px;margin-right:4px;font-size:11px;">${Utils.escapeHtml(tag)}</span>`
        ).join('');
        document.getElementById('tplDetailDesc').textContent = t.description || '暂无简介';
        const author = document.getElementById('tplDetailAuthor');
        author.textContent = `${t.author || '未知'}`;
        const authorBox = author.closest('.template-detail-author');
        if (authorBox && typeof createTemplateAuthorAvatar === 'function') {
            authorBox.querySelector('.template-author-avatar')?.remove();
            authorBox.prepend(createTemplateAuthorAvatar(t));
        }
        document.getElementById('tplDetailRating').textContent = `评分：${(t.rating || 0).toFixed(1)}`;
        document.getElementById('tplDetailLikes').textContent = `👍 ${getTemplateLikeCount(t)}`;
        document.getElementById('tplDetailUsage').textContent = `🔥 使用 ${getTemplateUsageCount(t)} 次`;
        document.getElementById('tplDetailCreated').textContent = `创建：${Utils.formatDate(t.createdAt || new Date())}`;
        document.getElementById('tplDetailUpdated').textContent = `更新：${Utils.formatDate(t.updatedAt || new Date())}`;

        const favBtn = document.getElementById('tplFavBtn');
        favBtn.textContent = t.favorited ? '⭐' : '☆';
        favBtn.style.color = t.favorited ? '#f0b400' : '#9a9ca6';
        favBtn.title = t.favorited ? '取消收藏' : '收藏';

        renderTemplateComments(t);
        renderTemplateRating(t);
        document.getElementById('tplDetailModal').style.display = 'flex';
    }

    function renderTemplateComments(t) {
        const list = document.getElementById('tplCommentList');
        list.innerHTML = '';
        (t.comments || []).forEach(c => {
            const item = document.createElement('div');
            item.className = 'comment-item';
            const auth = AppState.auth || {};
            const authorName = c.author || auth.displayName || auth.username || '用户';
            const avatarChar = authorName.charAt(0).toUpperCase();
            item.innerHTML = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg, #667eea, #764ba2);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;flex-shrink:0;">${avatarChar}</div>
                <span class="comment-author">${Utils.escapeHtml(authorName)}</span>
                <span style="font-size:11px;color:var(--text-muted);">${Utils.formatDate(c.createdAt)}</span>
            </div><div class="comment-content">${Utils.escapeHtml(c.content)}</div>`;
            list.appendChild(item);
        });
    }

    function renderTemplateRating(t) {
        const stars = document.querySelectorAll('#tplRatingStars .star');
        const rating = t?.userRating || 0;
        stars.forEach((s, i) => {
            s.classList.remove('active', 'half');
            if (i < Math.floor(rating)) s.classList.add('active');
            else if (i === Math.floor(rating) && rating - Math.floor(rating) >= 0.5) s.classList.add('half', 'active');
        });
    }

    function toggleFavTemplate() {
        const templates = gTPublic();
        const t = templates.find(x => x.id === AppState.template.viewingId);
        if (!t) return;

        t.favorited = !t.favorited;
        if (t.favorited) t.favoriteTime = Date.now();
        else t.favoriteTime = 0;
        sT(StorageService.getTemplates() || []);

        const favBtn = document.getElementById('tplFavBtn');
        favBtn.textContent = t.favorited ? '⭐' : '☆';
        favBtn.style.color = t.favorited ? '#f0b400' : '#9a9ca6';
        favBtn.title = t.favorited ? '取消收藏' : '收藏';
    }

    document.querySelectorAll('#tplRatingStars .star').forEach((star, idx) => {
        star.addEventListener('click', function() {
            const rating = idx + 1;
            const templates = gTPublic();
            const t = templates.find(x => x.id === AppState.template.viewingId);
            if (t) {
                t.userRating = rating;
                sT(StorageService.getTemplates() || []);
                renderTemplateRating(t);
            }
        });
        star.addEventListener('mousemove', function(e) {
            const rect = this.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const half = x < rect.width / 2;
            const stars = document.querySelectorAll('#tplRatingStars .star');
            stars.forEach((s, i) => {
                s.classList.remove('active', 'half');
                if (i < idx + 1) s.classList.add('active');
                else if (i === idx && half) s.classList.add('half', 'active');
            });
        });
        star.addEventListener('mouseleave', function() {
            renderTemplateRating(gTPublic().find(x => x.id === AppState.template.viewingId));
        });
    });

    document.getElementById('tplCommentSubmit')?.addEventListener('click', function() {
        const content = document.getElementById('tplCommentInput').value.trim();
        if (!content) return;

        const auth = AppState.auth || {};
        const author = auth.displayName || auth.username || '用户';
        const templates = gTPublic();
        const t = templates.find(x => x.id === AppState.template.viewingId);
        if (!t) return;

        if (!t.comments) t.comments = [];
        t.comments.push({ author, content, createdAt: new Date().toISOString() });
        sT(StorageService.getTemplates() || []);
        renderTemplateComments(t);
        document.getElementById('tplCommentInput').value = '';
    });

    window.openTemplateDetail = openTemplateDetail;
    window.renderTemplateComments = renderTemplateComments;
    window.renderTemplateRating = renderTemplateRating;
    window.toggleFavTemplate = toggleFavTemplate;
    window.bindTemplateDetail = true;
})(window);
