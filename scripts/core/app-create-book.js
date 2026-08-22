// New-work flow: collects optional book metadata without changing existing import behavior.
(function(window, document) {
    'use strict';

    const AppState = window.ZHIYU_APP_STATE || window.AppState;
    const STATUS = window.ZHIYU_STATUS || { ACTIVE: 'active' };
    const Toast = window.ZHIYU_TOAST || window.Toast || {
        warn: function() {},
        success: function() {},
        error: function() {}
    };
    const Modal = window.ZHIYU_MODAL || window.Modal || {
        open: function() {},
        close: function() {}
    };
    const state = {
        mode: 'create',
        editingBookName: '',
        bookId: '',
        gender: '',
        genres: [],
        cover: '',
        coverDownload: ''
    };
    const AI_REQUEST_TIMEOUT_MS = 120000;
    const LOCAL_COVER_MAX_FILE_BYTES = 10 * 1024 * 1024;
    const LOCAL_COVER_MAX_WIDTH = 1200;
    const LOCAL_COVER_MAX_HEIGHT = 1600;
    const LOCAL_COVER_MAX_DATA_URL_LENGTH = 320000;
    let synopsisRequestController = null;
    let coverRequestController = null;
    let localCoverReadToken = 0;
    let localCoverReadPromise = null;
    let localCoverConfirmWasDisabled = false;

    function getElement(id) {
        return document.getElementById(id);
    }

    function createTimedAiRequest(timeoutMessage) {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(function() {
            const timeoutError = new Error(timeoutMessage);
            timeoutError.name = 'TimeoutError';
            controller.abort(timeoutError);
        }, AI_REQUEST_TIMEOUT_MS);
        return {
            controller: controller,
            clear: function() { window.clearTimeout(timeoutId); }
        };
    }

    function cancelAiRequest(controller, message) {
        if (!controller || controller.signal.aborted) return;
        const cancelError = new Error(message);
        cancelError.name = 'AbortError';
        controller.abort(cancelError);
    }

    function getBooks() {
        return typeof window.gB === 'function' ? window.gB() || {} : {};
    }

    function saveBooks(books) {
        return typeof window.sB === 'function' ? window.sB(books) : undefined;
    }

    function ensureStableBookId(book) {
        if (typeof window.ensureBookStableId === 'function') {
            return window.ensureBookStableId(book);
        }
        if (/^bk_[A-Za-z0-9_-]{8,100}$/.test(String(book?._bid || ''))) return book._bid;
        const raw = window.crypto?.randomUUID
            ? window.crypto.randomUUID().replace(/-/g, '')
            : (Date.now().toString(36) + Math.random().toString(36).slice(2, 16));
        book._bid = 'bk_' + raw.slice(0, 80);
        return book._bid;
    }

    function getGenres(gender) {
        return gender === 'female'
            ? (window.OUTLINE_GENRES_FEMALE || [])
            : (window.OUTLINE_GENRES_MALE || []);
    }

    function getGenreProfile(genre) {
        return window.GENRE_PROFILES?.[genre] || null;
    }

    function updateChannelButtons() {
        getElement('createBookChannel')?.querySelectorAll('[data-gender]').forEach(function(button) {
            const active = button.dataset.gender === state.gender;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        });
    }

    function updateGenreCount() {
        const count = getElement('createBookGenreCount');
        if (count) count.textContent = state.genres.length ? ('已选择 ' + state.genres.length + '/3') : '最多选择 3 个';
    }

    function renderGenreColumn(containerId, gender) {
        const container = getElement(containerId);
        if (!container) return;
        container.replaceChildren();
        const genres = getGenres(gender);
        genres.forEach(function(genre) {
            const profile = getGenreProfile(genre);
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'create-book-genre-tag' + (state.genres.includes(genre) ? ' active' : '');
            button.textContent = genre;
            button.setAttribute('aria-pressed', String(state.genres.includes(genre)));
            if (profile) button.title = profile.direction + ' ' + profile.notes;
            button.addEventListener('click', function() {
                if (state.genres.includes(genre)) {
                    state.genres = state.genres.filter(function(item) { return item !== genre; });
                } else {
                    if (state.genres.length >= 3) {
                        Toast.warn('最多选择 3 个题材');
                        return;
                    }
                    state.genres = state.genres.concat(genre);
                }
                renderGenreOptions();
                updateGenreCount();
            });
            container.appendChild(button);
        });
    }

    function renderGenreOptions() {
        renderGenreColumn('createBookGenreMale', 'male');
        renderGenreColumn('createBookGenreFemale', 'female');
        updateGenreCount();
    }

    function setGender(gender) {
        const next = gender === 'female' ? 'female' : 'male';
        state.gender = next;
        updateChannelButtons();
    }

    function updateDialogMode(mode) {
        const editing = mode === 'edit';
        state.mode = editing ? 'edit' : 'create';
        const title = getElement('createBookTitle');
        const subtitle = getElement('createBookSubtitle');
        const nameInput = getElement('createBookName');
        const confirmButton = getElement('btnConfirmCreateBook');
        const closeButton = getElement('btnCloseCreateBook');
        if (title) title.textContent = editing ? '编辑作品' : '新建作品';
        if (subtitle) {
            subtitle.textContent = editing
                ? '修改作品封面、频道、题材和简介；作品名称不可修改。'
                : '填写基础资料后创建，除作品名称外均可留空。';
        }
        if (nameInput) {
            nameInput.readOnly = editing;
            nameInput.setAttribute('aria-readonly', String(editing));
        }
        if (confirmButton) confirmButton.textContent = editing ? '保存修改' : '创建作品';
        if (closeButton) closeButton.setAttribute('aria-label', editing ? '关闭编辑作品弹窗' : '关闭新建作品弹窗');
    }

    function updateCoverPreview(source) {
        const cover = getElement('createBookCoverPreview');
        const empty = getElement('createBookCoverEmpty');
        const downloadButton = getElement('btnDownloadBookCover');
        const hasCover = /^data:image\//i.test(String(source || '').trim());
        if (cover) {
            cover.src = hasCover ? source : 'LOGO-256.png';
            cover.classList.toggle('is-placeholder', !hasCover);
        }
        if (empty) empty.hidden = hasCover;
        if (downloadButton) downloadButton.hidden = !hasCover;
    }

    function readLocalCoverFile(file) {
        return new Promise(function(resolve, reject) {
            const reader = new FileReader();
            reader.onload = function() { resolve(String(reader.result || '')); };
            reader.onerror = function() { reject(new Error('本地封面读取失败，请重新选择')); };
            reader.readAsDataURL(file);
        });
    }

    function loadLocalCoverImage(source) {
        return new Promise(function(resolve, reject) {
            const image = new Image();
            image.onload = function() { resolve(image); };
            image.onerror = function() { reject(new Error('图片格式无法识别，请换一张图片')); };
            image.src = source;
        });
    }

    function renderLocalCoverDataUrl(image, maxWidth, maxHeight, quality) {
        const width = Number(image.naturalWidth || image.width || 0);
        const height = Number(image.naturalHeight || image.height || 0);
        if (!width || !height) throw new Error('图片尺寸无效，请换一张图片');
        const scale = Math.min(1, maxWidth / width, maxHeight / height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('当前浏览器无法处理封面图片');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', quality);
    }

    async function normalizeLocalCover(file) {
        const mimeType = String(file?.type || '').trim();
        const fileName = String(file?.name || '').trim();
        const hasSupportedMime = /^image\/(?:jpeg|png|webp)$/i.test(mimeType);
        const hasSupportedExtension = /\.(?:jpe?g|png|webp)$/i.test(fileName);
        if (!file || (mimeType ? !hasSupportedMime : !hasSupportedExtension)) {
            throw new Error('请选择 JPG、PNG 或 WebP 图片');
        }
        if (Number(file.size || 0) > LOCAL_COVER_MAX_FILE_BYTES) {
            throw new Error('封面原图不能超过 10MB');
        }
        const source = await readLocalCoverFile(file);
        const image = await loadLocalCoverImage(source);
        let normalized = renderLocalCoverDataUrl(
            image,
            LOCAL_COVER_MAX_WIDTH,
            LOCAL_COVER_MAX_HEIGHT,
            0.86
        );
        if (normalized.length > LOCAL_COVER_MAX_DATA_URL_LENGTH) {
            normalized = renderLocalCoverDataUrl(image, 900, 1200, 0.76);
        }
        if (normalized.length > LOCAL_COVER_MAX_DATA_URL_LENGTH) {
            normalized = renderLocalCoverDataUrl(image, 720, 960, 0.68);
        }
        if (normalized.length > LOCAL_COVER_MAX_DATA_URL_LENGTH) {
            normalized = renderLocalCoverDataUrl(image, 540, 720, 0.6);
        }
        if (normalized.length > LOCAL_COVER_MAX_DATA_URL_LENGTH) {
            throw new Error('封面压缩后仍然过大，请换一张图片');
        }
        return normalized;
    }

    function openLocalCoverPicker() {
        getElement('createBookCoverFile')?.click();
    }

    function setLocalCoverProcessing(active) {
        const picker = getElement('createBookCoverPicker');
        const confirmButton = getElement('btnConfirmCreateBook');
        if (active) {
            picker?.setAttribute('aria-busy', 'true');
            picker?.classList.add('is-loading');
            if (confirmButton && confirmButton.dataset.coverProcessing !== 'true') {
                localCoverConfirmWasDisabled = confirmButton.disabled;
                confirmButton.dataset.coverProcessing = 'true';
                confirmButton.disabled = true;
            }
            return;
        }
        picker?.removeAttribute('aria-busy');
        picker?.classList.remove('is-loading');
        if (confirmButton?.dataset.coverProcessing === 'true') {
            delete confirmButton.dataset.coverProcessing;
            confirmButton.disabled = localCoverConfirmWasDisabled;
        }
        localCoverConfirmWasDisabled = false;
    }

    async function handleLocalCoverFile(event) {
        const input = event.currentTarget;
        const file = input?.files?.[0];
        if (input) input.value = '';
        if (!file) return;
        const token = ++localCoverReadToken;
        const readPromise = normalizeLocalCover(file);
        localCoverReadPromise = readPromise;
        setLocalCoverProcessing(true);
        try {
            const source = await readPromise;
            if (token !== localCoverReadToken) return;
            state.cover = source;
            state.coverDownload = source;
            updateCoverPreview(source);
            Toast.success(state.mode === 'edit'
                ? '本地封面已选择，点击“保存修改”后生效'
                : '本地封面已选择，创建作品后生效');
        } catch (error) {
            if (token === localCoverReadToken) {
                Toast.error(error?.message || '本地封面处理失败，请重新选择');
            }
        } finally {
            if (token === localCoverReadToken) {
                localCoverReadPromise = null;
                setLocalCoverProcessing(false);
            }
        }
    }

    function resetCreateBookForm() {
        localCoverReadToken += 1;
        localCoverReadPromise = null;
        setLocalCoverProcessing(false);
        state.editingBookName = '';
        state.bookId = ensureStableBookId({});
        state.gender = '';
        state.genres = [];
        state.cover = '';
        state.coverDownload = '';
        ['createBookName', 'createBookSynopsis', 'createBookSynopsisRequirement', 'createBookSynopsisPreviewText'].forEach(function(id) {
            const element = getElement(id);
            if (element) element.value = '';
        });
        updateDialogMode('create');
        updateChannelButtons();
        renderGenreOptions();
        updateCoverPreview('');
    }

    function openCreateBookModal() {
        resetCreateBookForm();
        Modal.open('createBookModal');
        window.setTimeout(function() { getElement('createBookName')?.focus(); }, 0);
    }

    function openEditBookModal(bookName) {
        const normalizedName = String(bookName || '').trim();
        const book = getBooks()[normalizedName];
        if (!normalizedName || !book) {
            Toast.warn('作品不存在，无法编辑');
            return false;
        }
        resetCreateBookForm();
        state.editingBookName = normalizedName;
        state.bookId = ensureStableBookId(book);
        state.gender = book.genreGender === 'female' ? 'female' : (book.genreGender === 'male' ? 'male' : '');
        state.genres = Array.isArray(book.genres)
            ? [...new Set(book.genres.map(function(item) { return String(item || '').trim(); }).filter(Boolean))].slice(0, 3)
            : [];
        state.cover = /^data:image\//i.test(String(book.cover || '').trim()) ? String(book.cover).trim() : '';
        state.coverDownload = state.cover;
        getElement('createBookName').value = normalizedName;
        getElement('createBookSynopsis').value = String(book.synopsis || '');
        updateDialogMode('edit');
        updateChannelButtons();
        renderGenreOptions();
        updateCoverPreview(state.cover);
        Modal.open('createBookModal');
        window.setTimeout(function() { getElement('createBookSynopsis')?.focus(); }, 0);
        return true;
    }

    function closeCreateBookModal() {
        cancelAiRequest(synopsisRequestController, '作品简介生成已取消');
        cancelAiRequest(coverRequestController, '封面生成已取消');
        Modal.close('createBookSynopsisModal');
        Modal.close('createBookModal');
    }

    function closeSynopsisGenerator() {
        cancelAiRequest(synopsisRequestController, '作品简介生成已取消');
        Modal.close('createBookSynopsisModal');
    }

    function getSynopsisContext() {
        const name = String(getElement('createBookName')?.value || '').trim();
        const gender = state.gender === 'female' ? '女频' : (state.gender === 'male' ? '男频' : '未选择频道');
        const genres = state.genres.length ? state.genres.join('、') : '未选择题材';
        return { name: name, gender: gender, genres: genres };
    }

    function openSynopsisGenerator() {
        const context = getSynopsisContext();
        if (!context.name) {
            Toast.warn('请先填写作品名称');
            getElement('createBookName')?.focus();
            return;
        }
        const contextText = getElement('createBookSynopsisContext');
        if (contextText) contextText.textContent = '作品：' + context.name + '；频道：' + context.gender + '；题材：' + context.genres;
        getElement('createBookSynopsisPreviewText').value = String(getElement('createBookSynopsis')?.value || '');
        Modal.open('createBookSynopsisModal');
        window.setTimeout(function() { getElement('createBookSynopsisRequirement')?.focus(); }, 0);
    }

    function getNormalModelConfig() {
        return window.getActionModelConfig?.() || window.getSelectedModelConfig?.() || null;
    }

    function getNormalModelCandidates() {
        const model = getNormalModelConfig();
        return model?.base && model?.model ? [model] : [];
    }

    function cleanSynopsis(text) {
        const normalized = String(text || '')
            .replace(/^```(?:text|markdown)?\s*/i, '')
            .replace(/\s*```$/i, '')
            .replace(/^\s*(?:作品简介|简介)\s*[：:]\s*/i, '')
            .replace(/^[“"]|[”"]$/g, '')
            .trim();
        const characters = Array.from(normalized);
        if (characters.length <= 240) return normalized;
        const limited = characters.slice(0, 240).join('');
        const sentenceBoundary = Math.max(
            limited.lastIndexOf('。'),
            limited.lastIndexOf('！'),
            limited.lastIndexOf('？'),
            limited.lastIndexOf('\n')
        );
        return (sentenceBoundary >= 168 ? limited.slice(0, sentenceBoundary + 1) : limited).trim();
    }

    async function requestSynopsis(options) {
        if (typeof window.callLLMAPI !== 'function') throw new Error('AI 生成组件尚未加载');
        const requestOptions = options || {};
        const context = getSynopsisContext();
        if (!context.name) throw new Error('请先填写作品名称');
        const requirement = String(getElement('createBookSynopsisRequirement')?.value || '').trim();
        const systemPrompt = `你是网文小说简介策划。根据【作品频道】【题材标签】【主角信息】【作品设定】生成小说简介。

要求：

1. 全文不超过240个汉字，分3至5个短段，只输出简介。
2. 前两句交代主角身份、初始处境和核心事件；中段突出世界规则、主要冲突、金手指或独特优势；结尾落在长期目标、核心悬念或最大爽点。
3. 频道决定包装方向：男频侧重目标、破局、成长、力量与事业；女频侧重人物处境、主动选择、关系张力、秘密与成长。只有言情标签才强化感情线。
4. 主角姓名、身份和性别必须以用户信息为准。男频不等于男主，女频不等于女主；无法确认性别时使用姓名或身份称呼，不得乱用“他/她”。
5. 最多三个题材标签，以第一个为主，其余自然融合，不得逐项罗列标签。
6. 玄幻、仙侠、高武突出力量体系与成长路线；都市、种田、日常突出职业、生活目标和现实冲突；悬疑、灵异突出异常事件、危险规则和未解谜团；科幻、末世、无限流突出世界危机、生存规则和主角优势；古言、历史、权谋突出时代身份、利益冲突和人物抉择；西幻突出魔法、种族、身份或世界冲突。
7. 明确朝代就按该朝代写；标明架空则保持架空。不得编造用户没有提供的人物、能力、剧情和结局。
8. 简介要突出作品最独特的设定反差，不写大纲，不堆等级、势力和配角，不使用“且看主角如何”“命运齿轮转动”等空话。`;
        const userPrompt = [
            '【作品名称】\n' + context.name,
            '【作品频道】\n' + context.gender,
            '【题材标签】\n' + context.genres,
            '【主角信息与作品设定】\n' + (requirement || '未提供，请不要编造缺失信息。')
        ].join('\n\n');
        const candidates = getNormalModelCandidates();
        if (!candidates.length) throw new Error('请先添加并选择一个自备模型');
        let lastError = null;
        for (let index = 0; index < candidates.length; index += 1) {
            try {
                const response = await window.callLLMAPI(
                    { key: '', base: '', model: '' },
                    systemPrompt,
                    userPrompt,
                    candidates[index],
                    { signal: requestOptions.signal }
                );
                const synopsis = cleanSynopsis(response?.content?.[0]?.text);
                if (synopsis) return synopsis;
                const emptyError = new Error('模型没有返回有效简介');
                emptyError.code = 'EMPTY_RESPONSE';
                throw emptyError;
            } catch (error) {
                if (window.isAbortLikeError?.(error) || window.isAuthExpiredError?.(error)) throw error;
                lastError = error;
                const retryable = typeof window.shouldRetryMemoryAnalysis === 'function'
                    && window.shouldRetryMemoryAnalysis(error);
                if (!retryable || index >= candidates.length - 1) throw error;
            }
        }
        throw lastError || new Error('作品简介生成失败');
    }

    async function generateSynopsis() {
        const button = getElement('btnGenerateBookSynopsis');
        if (!button || button.disabled) return;
        const idleText = button.textContent;
        button.disabled = true;
        button.textContent = '生成中...';
        const preview = getElement('createBookSynopsisPreviewText');
        preview?.classList.add('is-generating');
        const request = createTimedAiRequest('作品简介生成等待超时，请重试');
        synopsisRequestController = request.controller;
        window.Utils?.appendLog?.(null, '正在生成作品简介', 'progress');
        try {
            preview.value = await requestSynopsis({
                signal: request.controller.signal
            });
            Toast.success('简介已生成，确认后才会填入作品信息');
            window.Utils?.appendLog?.(null, '✅ 作品简介生成完成', 'success');
        } catch (error) {
            const message = typeof window.formatAiErrorForDisplay === 'function'
                ? window.formatAiErrorForDisplay(error, '简介生成失败')
                : String(error?.message || error || '简介生成失败');
            Toast.error(message);
            window.Utils?.appendLog?.(null, message, 'error');
        } finally {
            request.clear();
            if (synopsisRequestController === request.controller) synopsisRequestController = null;
            preview?.classList.remove('is-generating');
            button.disabled = false;
            button.textContent = idleText;
        }
    }

    function applySynopsis() {
        const preview = cleanSynopsis(getElement('createBookSynopsisPreviewText')?.value);
        if (!preview) {
            Toast.warn('请先生成或填写简介预览');
            return;
        }
        getElement('createBookSynopsis').value = preview;
        closeSynopsisGenerator();
    }

    async function requestBookCover(input) {
        void input;
        throw new Error('社区版不提供在线封面生成，请上传当前设备中的封面图片');
    }

    async function generateCover() {
        const generator = window.ZHIYU_BOOK_COVER_GENERATOR || { generate: requestBookCover };
        const context = getSynopsisContext();
        if (!context.name) {
            Toast.warn('请先填写作品名称');
            getElement('createBookName')?.focus();
            return;
        }
        const button = getElement('btnGenerateBookCover');
        const idleText = button.textContent;
        button.disabled = true;
        button.textContent = '生成中...';
        const request = createTimedAiRequest('封面生成等待超时，请重试');
        coverRequestController = request.controller;
        window.Utils?.appendLog?.(null, '正在生成作品封面', 'progress');
        try {
            if (state.mode === 'edit') {
                const books = getBooks();
                const editingBook = books[state.editingBookName];
                if (!editingBook) throw new Error('作品不存在，无法生成封面');
                const previousId = String(editingBook._bid || '');
                state.bookId = ensureStableBookId(editingBook);
                if (previousId !== state.bookId) {
                    const saved = await Promise.resolve(saveBooks(books));
                    if (saved === false) throw new Error('作品编号保存失败，请稍后重试');
                }
            }
            const cover = await generator.generate({
                name: context.name,
                bookId: state.bookId,
                synopsis: String(getElement('createBookSynopsis')?.value || '').trim(),
                gender: state.gender,
                genres: state.genres.slice(),
                signal: request.controller.signal
            });
            const source = String(cover?.dataUrl || cover?.url || cover || '').trim();
            if (!/^data:image\//i.test(source)) throw new Error('社区版只接受当前设备中的封面图片');
            state.cover = source;
            state.coverDownload = String(cover?.dataUrl || source).trim();
            const preview = getElement('createBookCoverPreview');
            if (preview) {
                preview.src = source;
                preview.classList.remove('is-placeholder');
            }
            getElement('createBookCoverEmpty').hidden = true;
            const downloadButton = getElement('btnDownloadBookCover');
            if (downloadButton) downloadButton.hidden = false;
            Toast.success('封面已生成');
            window.Utils?.appendLog?.(null, '✅ 作品封面生成完成', 'success');
        } catch (error) {
            const message = typeof window.formatAiErrorForDisplay === 'function'
                ? window.formatAiErrorForDisplay(error, '封面生成失败')
                : String(error?.message || error || '封面生成失败');
            Toast.error(message);
            window.Utils?.appendLog?.(null, message, 'error');
        } finally {
            request.clear();
            if (coverRequestController === request.controller) coverRequestController = null;
            button.disabled = false;
            button.textContent = idleText;
        }
    }

    function getCoverExtension(source, mimeType) {
        const mime = String(mimeType || '').toLowerCase();
        if (mime.includes('jpeg')) return 'jpg';
        if (mime.includes('webp')) return 'webp';
        if (mime.includes('gif')) return 'gif';
        if (mime.includes('png')) return 'png';
        const pathMatch = String(source || '').match(/\.([a-z0-9]{2,5})(?:[?#]|$)/i);
        return pathMatch ? pathMatch[1].toLowerCase().replace('jpeg', 'jpg') : 'png';
    }

    function getCoverDownloadName(extension) {
        const name = String(getElement('createBookName')?.value || '作品')
            .trim()
            .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
            .slice(0, 80) || '作品';
        return name + '_封面.' + extension;
    }

    async function downloadCover() {
        const source = String(state.coverDownload || state.cover || '').trim();
        if (!source) {
            Toast.warn('请先生成封面');
            return;
        }
        const button = getElement('btnDownloadBookCover');
        if (!button || button.disabled) return;
        const idleText = button.textContent;
        button.disabled = true;
        button.textContent = '下载中...';
        let objectUrl = '';
        try {
            let href = source;
            let mimeType = '';
            if (/^https?:\/\//i.test(source)) {
                throw new Error('社区版只下载当前设备中的封面图片');
            } else {
                const mimeMatch = source.match(/^data:([^;,]+)/i);
                mimeType = mimeMatch?.[1] || '';
            }
            const link = document.createElement('a');
            link.href = href;
            link.download = getCoverDownloadName(getCoverExtension(source, mimeType));
            link.rel = 'noopener';
            document.body.appendChild(link);
            link.click();
            link.remove();
            Toast.success('封面原图已开始下载');
        } catch (error) {
            Toast.error('封面下载失败：' + (error.message || '请稍后重试'));
        } finally {
            if (objectUrl) window.setTimeout(function() { URL.revokeObjectURL(objectUrl); }, 1000);
            button.disabled = false;
            button.textContent = idleText;
        }
    }

    async function createBook() {
        const button = getElement('btnConfirmCreateBook');
        if (!button || button.disabled) return;
        const name = String(getElement('createBookName')?.value || '').trim();
        if (!name) {
            Toast.warn('请输入作品名称');
            getElement('createBookName')?.focus();
            return;
        }
        if (typeof window.findBookNameConflict === 'function' && window.findBookNameConflict(name)) {
            if (typeof window.warnBookNameConflict === 'function') window.warnBookNameConflict();
            else Toast.warn('作品名已存在，请换一个名称');
            return;
        }
        const books = getBooks();
        if (books[name]) {
            Toast.warn('作品名已存在，请换一个名称');
            return;
        }
        button.disabled = true;
        const idleText = button.textContent;
        button.textContent = '创建中...';
        try {
            window.unmarkBookDeleted?.(name);
            books[name] = {
                _bid: state.bookId || ensureStableBookId({}),
                status: STATUS.ACTIVE,
                createdAt: new Date().toISOString(),
                volumes: [{ name: '第一卷', chapters: [] }],
                currentVol: 0,
                wordCount: 0,
                synopsis: String(getElement('createBookSynopsis')?.value || '').trim(),
                genreGender: state.gender,
                genres: state.genres.slice(),
                cover: state.cover
            };
            const saved = await Promise.resolve(saveBooks(books));
            if (saved === false) throw new Error('本地保存失败，请检查浏览器存储空间后重试');
            window.refreshOverview?.();
            window.refreshBookSelect?.();
            closeCreateBookModal();
            Toast.success('作品「' + name + '」已创建');
        } catch (error) {
            delete books[name];
            Toast.error('创建失败：' + (error.message || '请稍后重试'));
        } finally {
            button.disabled = false;
            button.textContent = idleText;
        }
    }

    async function saveExistingBook() {
        const button = getElement('btnConfirmCreateBook');
        if (!button || button.disabled) return;
        const bookName = state.editingBookName;
        const books = getBooks();
        const originalBook = books[bookName];
        if (!bookName || !originalBook) {
            Toast.warn('作品不存在，无法保存');
            closeCreateBookModal();
            return;
        }
        const visibleName = String(getElement('createBookName')?.value || '').trim();
        if (visibleName !== bookName) {
            Toast.warn('作品名称不可修改');
            getElement('createBookName').value = bookName;
            return;
        }
        button.disabled = true;
        const idleText = button.textContent;
        button.textContent = '保存中...';
        books[bookName] = {
            ...originalBook,
            _bid: state.bookId || ensureStableBookId(originalBook),
            synopsis: String(getElement('createBookSynopsis')?.value || '').trim(),
            genreGender: state.gender,
            genres: state.genres.slice(),
            cover: state.cover,
            updatedAt: new Date().toISOString()
        };
        try {
            const saved = await Promise.resolve(saveBooks(books));
            if (saved === false) throw new Error('本地保存失败，请检查浏览器存储空间后重试');
            window.refreshOverview?.();
            window.refreshBookSelect?.();
            closeCreateBookModal();
            Toast.success('作品信息已保存');
        } catch (error) {
            books[bookName] = originalBook;
            Toast.error('保存失败：' + (error.message || '请稍后重试'));
        } finally {
            button.disabled = false;
            button.textContent = idleText;
        }
    }

    function submitBookForm() {
        if (localCoverReadPromise) {
            Toast.warn('封面正在处理中，请稍候再保存');
            return;
        }
        return state.mode === 'edit' ? saveExistingBook() : createBook();
    }

    function bindCreateBookFlow() {
        getElement('createBookCard')?.addEventListener('click', openCreateBookModal);
        getElement('createBookChannel')?.addEventListener('click', function(event) {
            const button = event.target.closest('[data-gender]');
            if (button) setGender(button.dataset.gender);
        });
        getElement('btnOpenBookSynopsisGenerator')?.addEventListener('click', openSynopsisGenerator);
        getElement('btnGenerateBookSynopsis')?.addEventListener('click', generateSynopsis);
        getElement('btnApplyBookSynopsis')?.addEventListener('click', applySynopsis);
        getElement('btnGenerateBookCover')?.addEventListener('click', generateCover);
        getElement('btnDownloadBookCover')?.addEventListener('click', downloadCover);
        getElement('createBookCoverPicker')?.addEventListener('click', openLocalCoverPicker);
        getElement('createBookCoverPicker')?.addEventListener('keydown', function(event) {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            openLocalCoverPicker();
        });
        getElement('createBookCoverFile')?.addEventListener('change', handleLocalCoverFile);
        getElement('btnConfirmCreateBook')?.addEventListener('click', submitBookForm);
        ['btnCloseCreateBook', 'btnCancelCreateBook'].forEach(function(id) {
            getElement(id)?.addEventListener('click', closeCreateBookModal);
        });
        ['btnCloseBookSynopsisGenerator', 'btnCancelBookSynopsisGenerator'].forEach(function(id) {
            getElement(id)?.addEventListener('click', closeSynopsisGenerator);
        });
        getElement('createBookModal')?.addEventListener('click', function(event) {
            if (event.target === this) closeCreateBookModal();
        });
        getElement('createBookSynopsisModal')?.addEventListener('click', function(event) {
            if (event.target === this) closeSynopsisGenerator();
        });
    }

    bindCreateBookFlow();

    window.ZHIYU_CREATE_BOOK = {
        open: openCreateBookModal,
        openEdit: openEditBookModal,
        close: closeCreateBookModal,
        cleanSynopsis: cleanSynopsis,
        requestSynopsis: requestSynopsis,
        requestBookCover: requestBookCover,
        downloadCover: downloadCover,
        getState: function() {
            return { gender: state.gender, genres: state.genres.slice(), cover: state.cover };
        }
    };
})(window, document);
