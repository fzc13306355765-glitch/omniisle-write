// 拆分项目提示词模板创建表单模块。
// 创建、编辑和导入的提示词只保存在当前设备，不会上传到任何服务器。
(function(window) {
    'use strict';

    const Utils = window.ZHIYU_UTILS || {};
    const Toast = window.ZHIYU_TOAST;
    const Confirm = window.ZHIYU_CONFIRM;
    const StorageService = window.ZHIYU_STORAGE_SERVICE || window.StorageService;
    const getCurrentUserName = window.getCurrentUserName || function() { return '用户'; };
    const sT = window.sT || function() {};
    const TEMPLATE_TAG_GROUPS = Object.freeze([
        { label: '内容', tags: ['正文', '大纲', '细纲', '开篇', '角色', '对话', '场景', '分镜', '拆书'] },
        { label: '操作', tags: ['生成', '续写', '改写', '扩写', '缩写', '润色', '分析', '提炼', '校对'] },
        { label: '题材', tags: ['玄幻', '仙侠', '都市', '言情', '悬疑', '科幻', '历史', '武侠', '现实', '同人'] },
        { label: '风格', tags: ['爽文', '群像', '强冲突', '快节奏', '慢节奏', '悬念', '反转', '情感', '幽默', '沉浸'] },
        { label: '篇幅', tags: ['超短篇', '短篇', '中篇', '长篇', '剧本'] }
    ]);
    const TEMPLATE_PRESET_TAGS = new Set(TEMPLATE_TAG_GROUPS.flatMap(group => group.tags));
    let pendingPresetTags = new Set();

    function getCurrentTemplateAuthorAvatar() {
        const AppState = window.ZHIYU_APP_STATE || window.AppState || {};
        return String(AppState?.auth?.avatar || '').trim();
    }

    function refreshTemplateGrid() {
        if (typeof window.refreshTemplateGrid === 'function') window.refreshTemplateGrid();
    }

    function refreshManageTplList() {
        if (typeof window.refreshManageTplList === 'function') window.refreshManageTplList();
    }

    function setManageTemplateListVisible(visible) {
        if (typeof window.setManageTemplateListVisible === 'function') {
            window.setManageTemplateListVisible(visible);
        }
    }

    function getMyCreatorId() {
        if (typeof window.getMyCreatorId === 'function') return window.getMyCreatorId();
        let cid = localStorage.getItem('zhiyu_creator_id');
        if (!cid) {
            cid = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
            localStorage.setItem('zhiyu_creator_id', cid);
        }
        return cid;
    }

    function clearCreateForm() {
        document.getElementById('newTemplateName').value = '';
        document.getElementById('newTemplateTagsInput').value = '';
        document.getElementById('newTemplateDesc').value = '';
        document.getElementById('newTemplatePrompt').value = '';
        document.getElementById('newTemplateLength').value = 'general';
        document.getElementById('newTemplateCategory').value = '通用';
        window._tmpTags = [];
        renderTempTags();
        updateTemplatePromptPreview('');
        closeTemplateTagPicker();
    }

    function renderTempTags() {
        const container = document.getElementById('newTemplateTags');
        if (!container) return;
        container.replaceChildren();
        [...new Set(window._tmpTags || [])].forEach(function(tagValue) {
            const tag = document.createElement('span');
            tag.className = 'tag-item';
            tag.append(document.createTextNode(tagValue));
            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.className = 'tag-item-remove';
            removeButton.setAttribute('aria-label', `移除标签 ${tagValue}`);
            removeButton.textContent = '×';
            removeButton.addEventListener('click', function() {
                window._tmpTags = (window._tmpTags || []).filter(item => item !== tagValue);
                renderTempTags();
            });
            tag.appendChild(removeButton);
            container.appendChild(tag);
        });
    }

    function addTemplateTag(value) {
        const tag = String(value || '').trim().slice(0, 12);
        if (!tag) return false;
        const tags = [...new Set(window._tmpTags || [])];
        if (tags.includes(tag)) return false;
        window._tmpTags = [...tags, tag];
        renderTempTags();
        return true;
    }

    function updateTemplatePromptPreview(value) {
        const preview = document.getElementById('newTemplatePreview');
        if (preview) preview.textContent = String(value || '');
    }

    function renderTemplateTagPicker() {
        const groupsContainer = document.getElementById('templateTagPickerGroups');
        if (!groupsContainer) return;
        groupsContainer.replaceChildren();
        TEMPLATE_TAG_GROUPS.forEach(function(group) {
            const section = document.createElement('section');
            section.className = 'template-tag-picker-group';
            const title = document.createElement('div');
            title.className = 'template-tag-picker-group-title';
            title.textContent = group.label;
            const options = document.createElement('div');
            options.className = 'template-tag-picker-options';
            group.tags.forEach(function(tagValue) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'template-tag-option';
                button.textContent = tagValue;
                button.dataset.tag = tagValue;
                const selected = pendingPresetTags.has(tagValue);
                button.classList.toggle('is-selected', selected);
                button.setAttribute('aria-pressed', String(selected));
                button.addEventListener('click', function() {
                    if (pendingPresetTags.has(tagValue)) pendingPresetTags.delete(tagValue);
                    else pendingPresetTags.add(tagValue);
                    const active = pendingPresetTags.has(tagValue);
                    button.classList.toggle('is-selected', active);
                    button.setAttribute('aria-pressed', String(active));
                });
                options.appendChild(button);
            });
            section.append(title, options);
            groupsContainer.appendChild(section);
        });
    }

    function openTemplateTagPicker() {
        const picker = document.getElementById('templateTagPicker');
        if (!picker) return;
        pendingPresetTags = new Set((window._tmpTags || []).filter(tag => TEMPLATE_PRESET_TAGS.has(tag)));
        renderTemplateTagPicker();
        picker.hidden = false;
        document.getElementById('btnCloseTemplateTags')?.focus();
    }

    function closeTemplateTagPicker() {
        const picker = document.getElementById('templateTagPicker');
        if (picker) picker.hidden = true;
    }

    function applyTemplateTagSelection() {
        const customTags = (window._tmpTags || []).filter(tag => !TEMPLATE_PRESET_TAGS.has(tag));
        window._tmpTags = [...customTags, ...pendingPresetTags];
        renderTempTags();
        closeTemplateTagPicker();
    }

    function bindTemplateCreateForm() {
        document.getElementById('newTemplateTagsInput')?.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const val = this.value.trim();
                if (!val) return;
                if (addTemplateTag(val)) this.value = '';
            }
        });

        document.getElementById('btnOpenTemplateTags')?.addEventListener('click', openTemplateTagPicker);
        document.getElementById('btnCloseTemplateTags')?.addEventListener('click', closeTemplateTagPicker);
        document.getElementById('btnCancelTemplateTags')?.addEventListener('click', closeTemplateTagPicker);
        document.getElementById('btnApplyTemplateTags')?.addEventListener('click', applyTemplateTagSelection);
        document.getElementById('templateTagPicker')?.addEventListener('click', function(event) {
            if (event.target === this) closeTemplateTagPicker();
        });
        document.addEventListener('keydown', function(event) {
            if (event.key === 'Escape' && !document.getElementById('templateTagPicker')?.hidden) {
                closeTemplateTagPicker();
            }
        });

        document.getElementById('btnToggleCreateForm')?.addEventListener('click', function() {
            const form = document.getElementById('createFormSection');
            if (form.style.display === 'none' || !form.style.display) {
                clearCreateForm();
                form.style.display = 'block';
                this.textContent = '收起';
                setManageTemplateListVisible(false);
            } else {
                form.style.display = 'none';
                this.textContent = '创建模版';
                setManageTemplateListVisible(true);
            }
        });

        document.getElementById('btnCancelCreate')?.addEventListener('click', function() {
            document.getElementById('createFormSection').style.display = 'none';
            document.getElementById('btnToggleCreateForm').textContent = '创建模版';
            document.getElementById('btnSubmitTemplate').textContent = '创建模板';
            window._editingTplId = null;
            window._editingTpl = null;
            clearCreateForm();
            setManageTemplateListVisible(true);
        });

        document.getElementById('newTemplatePrompt')?.addEventListener('input', function() {
            updateTemplatePromptPreview(this.value);
        });

        document.getElementById('btnSubmitTemplate')?.addEventListener('click', async function() {
            const name = document.getElementById('newTemplateName').value.trim();
            if (!name) { Toast.warn('请输入模板名称'); return; }
            const desc = document.getElementById('newTemplateDesc').value.trim();
            const prompt = document.getElementById('newTemplatePrompt').value;
            const category = document.getElementById('newTemplateCategory').value;
            const length = document.getElementById('newTemplateLength').value;
            const tags = [...new Set(window._tmpTags || [])];

            const templates = StorageService.getTemplates() || [];
            const editingId = window._editingTplId;
            const editingTpl = window._editingTpl;
            const creatorId = getMyCreatorId();
            try {
                const existing = editingTpl || templates.find(function(template) {
                    return template?.id === editingId;
                }) || null;
                const canonicalId = String(existing?.id || editingId
                    || ('local_template_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)));
                const now = new Date().toISOString();
                const nextTemplate = {
                    ...(existing || {}),
                    id: canonicalId,
                    title: name,
                    description: desc,
                    systemPrompt: prompt,
                    category,
                    length,
                    tags,
                    builtIn: false,
                    localOnly: true,
                    creatorId,
                    author: getCurrentUserName(),
                    authorAvatar: existing?.authorAvatar || getCurrentTemplateAuthorAvatar(),
                    usageCount: Number(existing?.usageCount || 0),
                    favorited: existing?.favorited === true,
                    likes: Number(existing?.likes || 0),
                    rating: Number(existing?.rating || 0),
                    ratingCount: Number(existing?.ratingCount || 0),
                    comments: Array.isArray(existing?.comments) ? existing.comments : [],
                    isPublic: existing?.isPublic !== false,
                    createdAt: existing?.createdAt || now,
                    updatedAt: now
                };
                const nextTemplates = templates.filter(function(template) {
                    const localId = String(template?.id || '');
                    return localId !== String(editingId || '')
                        && localId !== canonicalId;
                });
                nextTemplates.push(nextTemplate);
                const localSaved = await Promise.resolve(sT(nextTemplates));
                if (localSaved === false) throw new Error('本机模板保存失败，请检查浏览器存储空间');
                window._editingTplId = null;
                window._editingTpl = null;
                Toast.success(editingId ? '模板已更新！' : '模板创建成功！');
            } catch(error) {
                Toast.error(error?.message || '模板保存失败，请检查本机存储');
                return;
            }

            document.getElementById('createFormSection').style.display = 'none';
            document.getElementById('btnToggleCreateForm').textContent = '创建模版';
            document.getElementById('btnSubmitTemplate').textContent = '创建模板';
            setManageTemplateListVisible(true);
            refreshTemplateGrid();
            refreshManageTplList();
            clearCreateForm();
        });

        document.getElementById('btnImportPromptFile')?.addEventListener('click', async function() {
            document.getElementById('promptFilePicker').click();
        });

        document.getElementById('promptFilePicker')?.addEventListener('change', function(e) {
            const files = Array.from(e.target.files);
            if (!files.length) return;
            const file = files[0];
            const reader = new FileReader();
            reader.onload = async function(ev) {
                const textarea = document.getElementById('newTemplatePrompt');
                if (textarea.value) {
                    const _cf = await Confirm.show('导入文件将覆盖现有内容，确定继续吗？'); if (!_cf) return;
                }
                textarea.value = ev.target.result;
                updateTemplatePromptPreview(ev.target.result);
                e.target.value = '';
            };
            reader.readAsText(file);
        });
    }

    bindTemplateCreateForm();

    window.clearCreateForm = clearCreateForm;
    window.renderTempTags = renderTempTags;
    window.updateTemplatePromptPreview = updateTemplatePromptPreview;
    window.ZHIYU_TEMPLATE_TAG_GROUPS = TEMPLATE_TAG_GROUPS;
    window.bindTemplateCreateForm = true;
})(window);
