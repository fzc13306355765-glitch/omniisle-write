// 拆分项目提示词模板管理模块。
// “我的模板”只读写当前设备；显示开关不会把提示词上传到任何服务器。
(function(window) {
    'use strict';

    const StorageService = window.ZHIYU_STORAGE_SERVICE || window.StorageService;
    const AppState = window.ZHIYU_APP_STATE || window.AppState || {};
    const Confirm = window.ZHIYU_CONFIRM;
    const Toast = window.ZHIYU_TOAST;
    const Modal = window.ZHIYU_MODAL;
    const getCurrentUserName = window.getCurrentUserName || function() { return '用户'; };
    const sT = window.sT || function() {};
    const getTemplateLikeCount = window.getTemplateLikeCount || function(t) { return Number(t?.likes || t?.likeCount || 0); };
    const getTemplateUsageCount = window.getTemplateUsageCount || function(t) { return Number(t?.usageCount || 0); };
    const renderTemplateMetrics = window.renderTemplateMetrics || function(t) {
        return `👍 ${getTemplateLikeCount(t)} 🔥 ${getTemplateUsageCount(t)}`;
    };
    const Utils = window.ZHIYU_UTILS || {};
    const createTemplateAuthorAvatar = window.createTemplateAuthorAvatar;

    function getCurrentTemplateAuthorAvatar() {
        return String(AppState?.auth?.avatar || '').trim();
    }

    function getMyCreatorId() {
        if (AppState.auth.isLoggedIn && AppState.auth.uid) return AppState.auth.uid;
        let cid = localStorage.getItem('zhiyu_creator_id');
        if (!cid) { cid = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2,6); localStorage.setItem('zhiyu_creator_id', cid); }
        return cid;
    }

    function setManageTemplateListVisible(visible) {
        const list = document.getElementById('manageTplList');
        const count = document.getElementById('manageTplCount');
        if (list) list.style.display = visible ? 'flex' : 'none';
        if (count) count.style.display = visible ? '' : 'none';
    }

    async function refreshManageTplList() {
        const list = document.getElementById('manageTplList');
        list.innerHTML = '<div style="width:100%;text-align:center;padding:40px;color:#888;">加载中...</div>';
        try {
            const cid = getMyCreatorId();
            const allTemplates = StorageService.getTemplates() || [];
            let data = allTemplates.filter(t => String(t?.creatorId || '') === String(cid) && t?.deleted !== true);
            document.getElementById('manageTplCount').textContent = `共 ${data.length || 0} 个模版`;
            if (!data || data.length === 0 || data.error) {
                list.innerHTML = '<div style="width:100%;text-align:center;padding:40px;color:#888;">暂无模版，点击「创建模版」添加</div>';
                return;
            }
            data = [...data].sort((a, b) => {
                const usageDiff = getTemplateUsageCount(b) - getTemplateUsageCount(a);
                if (usageDiff) return usageDiff;
                return String(b?.updatedAt || b?.createdAt || '').localeCompare(String(a?.updatedAt || a?.createdAt || ''));
            });
            list.innerHTML = '';
            data.forEach(t => {
                const card = document.createElement('div');
                card.className = 'template-manage-card' + (t.isPublic ? ' is-public' : '');
                card.style.cssText = 'width:280px;padding:16px;background:#ebf5ff;border-radius:12px;border:1px solid #c8e4f8;display:flex;flex-direction:column;gap:8px;transition:transform 0.2s,box-shadow 0.2s;cursor:pointer;' + (t.isPublic ? 'border-color:#4caf50;border-width:2px;' : '');
                card.onmouseenter = () => { card.style.transform = 'translateY(-4px)'; card.style.boxShadow = '0 10px 28px rgba(0,0,0,0.10)'; card.style.borderColor = t.isPublic ? '#66bb6a' : '#a0d8f0'; };
                card.onmouseleave = () => { card.style.transform = ''; card.style.boxShadow = ''; card.style.borderColor = t.isPublic ? '#4caf50' : '#c8e4f8'; };
                const pubLabel = t.isPublic ? '<span style="color:#2e7d32;font-size:13px;font-weight:700;">● 模板页显示</span>' : '<span style="color:#999;font-size:11px;">○ 仅选择器可见</span>';
                card.innerHTML = `
                    <div style="display:flex;justify-content:space-between;align-items:start;gap:10px;">
                        <div class="template-manage-avatar-slot"></div>
                        <div style="flex:1;min-width:0;">
                            <div class="template-manage-title" style="font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${Utils.escapeHtml(t.title)}</div>
                            <div style="margin-top:2px;">${pubLabel}</div>
                        </div>
                    </div>
                    <div class="template-manage-description" style="font-size:12px;color:#666;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${Utils.escapeHtml(t.description||'暂无简介')}</div>
                    <div class="template-manage-tags" style="display:flex;gap:4px;flex-wrap:wrap;">
                        ${(t.tags||[]).slice(0,3).map(tg=>`<span style="font-size:10px;padding:2px 8px;background:#e8ebf2;color:#5a5d6b;border-radius:10px;">${Utils.escapeHtml(tg)}</span>`).join('')}
                    </div>
                    <details class="template-manage-prompt" style="font-size:12px;">
                        <summary style="cursor:pointer;color:#1976d2;">查看提示词</summary>
                        <div style="background:#fff;border:1px solid #e2e5ea;border-radius:6px;padding:10px;margin-top:4px;white-space:pre-wrap;max-height:120px;overflow-y:auto;font-size:11px;">${Utils.escapeHtml(t.systemPrompt||'')}</div>
                    </details>
                    <div style="font-size:11px;color:#999;">${renderTemplateMetrics(t)}</div>
                    <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:auto;padding-top:4px;">
                        <button class="btn-card-act tpl-edit-btn" data-id="${t.id}">编辑</button>
                        <button class="btn-card-act tpl-pub-btn" data-id="${t.id}" data-pub="${t.isPublic}">${t.isPublic?'从模板页隐藏':'在模板页显示'}</button>
                        <button class="btn-card-act tpl-del-btn" data-id="${t.id}">删除</button>
                    </div>`;
                const avatarSlot = card.querySelector('.template-manage-avatar-slot');
                if (avatarSlot && typeof createTemplateAuthorAvatar === 'function') {
                    avatarSlot.replaceWith(createTemplateAuthorAvatar(Object.assign({}, t, {
                        author: t.author || getCurrentUserName(),
                        authorAvatar: t.authorAvatar || getCurrentTemplateAuthorAvatar()
                    })));
                }
                list.appendChild(card);

                card.querySelector('.tpl-edit-btn').addEventListener('click', function() {
                    document.getElementById('newTemplateName').value = t.title || '';
                    document.getElementById('newTemplateDesc').value = t.description || '';
                    document.getElementById('newTemplatePrompt').value = t.systemPrompt || '';
                    document.getElementById('newTemplateLength').value = t.length || 'general';
                    document.getElementById('newTemplateCategory').value = t.category || '通用';
                    window._tmpTags = [...(t.tags || [])];
                    if (typeof window.renderTempTags === 'function') window.renderTempTags();
                    if (typeof window.updateTemplatePromptPreview === 'function') {
                        window.updateTemplatePromptPreview(t.systemPrompt || '');
                    } else {
                        document.getElementById('newTemplatePreview').textContent = t.systemPrompt || '';
                    }
                    window._editingTplId = t.id;
                    window._editingTpl = t;
                    document.getElementById('btnSubmitTemplate').textContent = '保存';
                    document.getElementById('btnToggleCreateForm').textContent = '收起';
                    document.getElementById('createFormSection').style.display = 'block';
                    setManageTemplateListVisible(false);
                    document.getElementById('createFormSection').scrollIntoView({ behavior: 'smooth' });
                });

                card.querySelector('.tpl-pub-btn').addEventListener('click', async function() {
                    const id = this.dataset.id;
                    const newPub = this.dataset.pub === 'true' ? false : true;
                    try {
                        const allTpl = StorageService.getTemplates() || [];
                        const tpl = allTpl.find(t => String(t?.id || '') === String(id));
                        if (tpl) {
                            tpl.isPublic = newPub;
                            tpl.author = getCurrentUserName();
                            const saved = await Promise.resolve(sT(allTpl));
                            if (saved === false) throw new Error('本机模板显示状态保存失败');
                        }
                        await refreshManageTplList();
                    } catch(error) {
                        Toast.error(error?.message || '模板显示状态更新失败');
                    }
                });

                card.querySelector('.tpl-del-btn').addEventListener('click', async function() {
                    const ok = await Confirm.show('确定删除这个模版？');
                    if (!ok) return;
                    const id = this.dataset.id;
                    try {
                        const allTpl = StorageService.getTemplates() || [];
                        const nextTemplates = allTpl.filter(function(template) {
                            return String(template?.id || '') !== String(id);
                        });
                        const saved = await Promise.resolve(sT(nextTemplates));
                        if (saved === false) throw new Error('本机模板删除失败');
                        await refreshManageTplList();
                    } catch(error) {
                        Toast.error(error?.message || '模板删除失败');
                    }
                });
            });
        } catch(e) {
            list.innerHTML = '<div style="width:100%;text-align:center;padding:40px;color:#e74c3c;">加载失败：' + e.message + '</div>';
        }
    }

    document.getElementById('btnManageTemplates')?.addEventListener('click', async function() {
        Modal.open('manageTemplatesModal');
        setManageTemplateListVisible(document.getElementById('createFormSection')?.style.display !== 'block');
        await refreshManageTplList();
    });

    window.getMyCreatorId = getMyCreatorId;
    window.setManageTemplateListVisible = setManageTemplateListVisible;
    window.refreshManageTplList = refreshManageTplList;
    window.bindTemplateManagement = true;
})(window);
