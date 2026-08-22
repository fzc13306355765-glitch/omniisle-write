// 拆分项目提示词模板页面模块。
// 模板页只读取本机模板库，不访问线上模板市场。
(function(window) {
    'use strict';

    const CONFIG = window.ZHIYU_CONFIG || {};
    const Utils = window.ZHIYU_UTILS || {};
    const Toast = window.ZHIYU_TOAST;
    const Confirm = window.ZHIYU_CONFIRM;
    const Modal = window.ZHIYU_MODAL;
    const StorageService = window.ZHIYU_STORAGE_SERVICE || window.StorageService;
    const AppState = window.ZHIYU_APP_STATE || window.AppState || {};
    const getCurrentUserId = window.getCurrentUserId || function() { return ''; };
    const getCurrentUserName = window.getCurrentUserName || function() { return '用户'; };
    const gTPublic = window.gTPublic || function() { return []; };
    const sT = window.sT || function() {};
    const getTemplateLikeCount = window.getTemplateLikeCount || function(t) { return Number(t?.likes || t?.likeCount || 0); };
    const getTemplateUsageCount = window.getTemplateUsageCount || function(t) { return Number(t?.usageCount || 0); };
    const renderTemplateMetrics = window.renderTemplateMetrics || function(t) {
        return `👍 ${getTemplateLikeCount(t)} 🔥 ${getTemplateUsageCount(t)}`;
    };
    const createTemplateAuthorAvatar = window.createTemplateAuthorAvatar;

    function compareTemplateDateDesc(a, b) {
        return String(b?.updatedAt || b?.createdAt || '').localeCompare(String(a?.updatedAt || a?.createdAt || ''));
    }

    function compareTemplateHeatDesc(a, b) {
        return getTemplateUsageCount(b) - getTemplateUsageCount(a) || compareTemplateDateDesc(a, b);
    }

        // =================== Link memory selector module entry ===================
        // Linked-memory and reference-chapter selector UI lives in scripts/core/app-link-memory-selector.js.
        var getCurrentChapterNumberForMemory = window.getCurrentChapterNumberForMemory;
        var findCurrentFineOutlineFile = window.findCurrentFineOutlineFile;
        var openLinkMemorySelector = window.openLinkMemorySelector;
        var openRefChapterSelector = window.openRefChapterSelector;
        var renderRefChapterList = window.renderRefChapterList;
        var refreshMemoryLinkTree = window.refreshMemoryLinkTree;
        var updateLinkedMemoryCount = window.updateLinkedMemoryCount;

        async function _fetchPublicTemplates() {
            return gTPublic();
        }

        function refreshTemplatePage(){
            _fetchPublicTemplates().then(() => refreshTemplateGrid());
        }

        function resetTemplatePage(){
            if (!AppState.template) return;
            AppState.template.page = 1;
        }

        function getTemplatePageSize(){
            const grid = document.getElementById('templateGrid');
            const page = document.getElementById('page-template');
            if (!grid || !page) return 12;
            const gridWidth = grid.clientWidth || 1200;
            const minCardWidth = 280;
            const gap = 20;
            const cols = Math.max(1, Math.floor((gridWidth + gap) / (minCardWidth + gap)));
            // 一页固定为三行；卡片随可用高度收缩，避免最后一行被分页栏遮住。
            const rowGap = 12;
            const fallbackGridHeight = 504;
            const usableHeight = grid.clientHeight || fallbackGridHeight;
            const cardHeight = Math.max(124, Math.min(168, Math.floor((usableHeight - rowGap * 2) / 3)));
            grid.style.setProperty('--template-card-height', cardHeight + 'px');
            return Math.max(cols, cols * 3);
        }

        function renderTemplatePagination(total, totalPages){
            const pager = document.getElementById('templatePagination');
            if (!pager) return;
            const current = Math.max(1, AppState.template.page || 1);
            if (total <= 0) {
                pager.innerHTML = '';
                return;
            }
            const pageSize = AppState.template.pageSize || 12;
            const start = (current - 1) * pageSize + 1;
            const end = Math.min(total, current * pageSize);
            pager.innerHTML = '<button class="template-page-btn" data-page="' + (current - 1) + '"' + (current <= 1 ? ' disabled' : '') + '>上一页</button>'
                + '<span class="template-page-info">第 ' + current + ' / ' + totalPages + ' 页 · 显示 ' + start + '-' + end + ' 个，共 ' + total + ' 个</span>'
                + '<button class="template-page-btn" data-page="' + (current + 1) + '"' + (current >= totalPages ? ' disabled' : '') + '>下一页</button>';
            pager.querySelectorAll('.template-page-btn').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    if (this.disabled) return;
                    const next = parseInt(this.dataset.page, 10);
                    if (!Number.isFinite(next)) return;
                    AppState.template.page = Math.max(1, Math.min(totalPages, next));
                    refreshTemplateGrid();
                });
            });
        }

        function refreshTemplateGrid(){
            const templates = gTPublic();
            const grid=document.getElementById('templateGrid');
            if(!grid)return;
            const searchQ=document.getElementById('templateSearch')?.value?.toLowerCase()||'';
            const sortBy=document.getElementById('templateSort')?.value||'综合';
            let filtered=[...templates];
            // 标签页筛选
            if(AppState.template.listTab==='fav'){
                filtered=filtered.filter(t=>t.favorited);
            } else if(AppState.template.listTab==='used'){
                filtered=filtered.filter(t=>getTemplateUsageCount(t)>0);
            }
            // 篇幅类型筛选（多选）
            if(AppState.template.lengthCats.length>0){
                filtered=filtered.filter(t=>{
                    const len=t.lengthCategory||'general';
                    return AppState.template.lengthCats.includes(len);
                });
            }
            // 模板分类筛选（多选）
            if(AppState.template.subCats.length>0){
                filtered=filtered.filter(t=>{
                    const cat=t.category||'';
                    return AppState.template.subCats.includes(cat);
                });
            }
            // 搜索过滤
            if(searchQ){
                filtered=filtered.filter(t=>t.title.toLowerCase().includes(searchQ)||(t.tags||[]).some(tag=>tag.toLowerCase().includes(searchQ)));
            }
            if(sortBy==='热门'){
                filtered.sort((a,b)=>getTemplateLikeCount(b)-getTemplateLikeCount(a)||compareTemplateDateDesc(a,b));
            } else if(sortBy==='最新'){
                filtered.sort(compareTemplateDateDesc);
            } else if(sortBy==='榜单'){
                filtered.sort(compareTemplateHeatDesc);
            } else {
                filtered.sort(compareTemplateHeatDesc);
            }
            const total=filtered.length;
            AppState.template.pageSize=getTemplatePageSize();
            const pageSize=AppState.template.pageSize||12;
            const totalPages=Math.max(1,Math.ceil(total/pageSize));
            if(!AppState.template.page || AppState.template.page<1) AppState.template.page=1;
            if(AppState.template.page>totalPages) AppState.template.page=totalPages;
            const start=(AppState.template.page-1)*pageSize;
            const pageItems=filtered.slice(start,start+pageSize);
            grid.innerHTML='';
            if(total===0){
                grid.innerHTML='<div class="template-empty">暂无符合条件的模版</div>';
            }
            pageItems.forEach(t=>{
                const card=document.createElement('div');
                card.className='template-card';
                const head = document.createElement('div');
                head.className = 'template-card-head';
                const title = document.createElement('div');
                title.className = 't-title';
                title.textContent = t.title || '未命名模板';
                head.appendChild(title);
                if (typeof createTemplateAuthorAvatar === 'function') {
                    head.appendChild(createTemplateAuthorAvatar(t));
                }
                const description = document.createElement('div');
                description.className = 't-desc';
                description.textContent = t.description || '';
                const meta = document.createElement('div');
                meta.className = 't-meta';
                const metrics = document.createElement('span');
                metrics.innerHTML = renderTemplateMetrics(t);
                const author = document.createElement('span');
                author.className = 'template-card-author-name';
                author.textContent = t.builtIn ? '内置' : (t.author || '本机用户');
                meta.appendChild(metrics);
                meta.appendChild(author);
                card.appendChild(head);
                card.appendChild(description);
                card.appendChild(meta);
                card.addEventListener('click', function(){ if (typeof window.openTemplateDetail === 'function') window.openTemplateDetail(t.id); });
                grid.appendChild(card);
            });
            const count=document.getElementById('templateCount');
            if(count)count.textContent=`共找到 ${total} 个模版`;
            renderTemplatePagination(total,totalPages);
        }

        // 使用提示词已通过模板选择弹窗的「应用」按钮实现，无需在此重复绑定

    window._fetchPublicTemplates = _fetchPublicTemplates;
    window.refreshTemplatePage = refreshTemplatePage;
    window.resetTemplatePage = resetTemplatePage;
    window.getTemplatePageSize = getTemplatePageSize;
    window.renderTemplatePagination = renderTemplatePagination;
    window.refreshTemplateGrid = refreshTemplateGrid;
    window.addEventListener('resize', (Utils.debounce || function(fn) { return fn; })(function() {
        if (document.getElementById('page-template')?.classList.contains('active')) refreshTemplateGrid();
    }, 120));
})(window);

