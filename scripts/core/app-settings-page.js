// Settings page local UI split from app-main.js.
// Keeps the original global function names used by the remaining legacy flows.
(function(window) {
    const document = window.document;
    const AppState = window.ZHIYU_APP_STATE || window.AppState || {};
    const APPEARANCE_DB_NAME = 'zhiyu-appearance-settings';
    const APPEARANCE_DB_VERSION = 1;
    const APPEARANCE_STATE_ID = 'wallpaper-state';
    const THEME_KEY = 'zhiyu_client_theme';
    const FONT_SIZE_KEY = 'zhiyu_font_size';
    const WALLPAPER_KEY = 'zhiyu_wallpaper_id';
    const WALLPAPER_OPACITY_KEY = 'zhiyu_wallpaper_opacity';
    const DEFAULT_THEME_ID = 'lake-graphite';
    const DEFAULT_WALLPAPER_ID = 'builtin:shanshui-sunrise';
    const MAX_CUSTOM_WALLPAPERS = 2;
    const MAX_WALLPAPER_BYTES = 10 * 1024 * 1024;
    const MAX_WALLPAPER_EDGE = 8192;
    const MAX_WALLPAPER_PIXELS = 16000000;

    const THEMES = [
        { id: 'forest-mint', name: '曜石黑', description: '沉稳清晰，适合专注写作与工具操作', swatches: ['#f7f7f8', '#1a1d2b', '#e5e7eb', '#6b7280'] },
        { id: 'moon-celadon', name: '月白青瓷', description: '清冷淡雅，适合长篇沉浸写作', swatches: ['#fbfdfc', '#6d9f96', '#eef6f4', '#b7d2cb'] },
        { id: 'pine-ink', name: '松烟墨绿', description: '沉稳内敛，适合谋略创作和剧情规划', swatches: ['#fbfdfc', '#3f6f5e', '#eef4f1', '#9dbcae'] },
        { id: 'mist-blue', name: '雾灰蓝调', description: '冷静克制，适合大纲管理与长文审查', swatches: ['#fbfcfe', '#5f80a8', '#eff4fa', '#acc1da'] },
        { id: 'warm-orange', name: '暖橙奶油', description: '温柔细腻，适合偏创作感的界面', swatches: ['#fffdfb', '#e98c55', '#fff5ed', '#f4c3a4'] },
        { id: 'tea-beige', name: '茶白咖灰', description: '温润耐看，带有纸张阅读感', swatches: ['#fdfbf8', '#9a7c63', '#f7f2ec', '#d4c0ae'] },
        { id: 'rose-mist', name: '玫瑰雾粉', description: '柔和精致，适合言情、治愈创作', swatches: ['#fffafb', '#bd7183', '#fbf0f3', '#e6acba'] },
        { id: 'purple-pearl', name: '雾紫梨白', description: '轻幻想、高级感，适合沉浸写作', swatches: ['#fcfbff', '#7a63c8', '#f4f0fd', '#c8bdec'] },
        { id: 'snow-purple', name: '雪紫银灰', description: '轻盈梦幻，适合仙侠、幻想写作', swatches: ['#fcfbfe', '#7b6cb5', '#f3f1fa', '#cbc5e2'] },
        { id: 'lake-graphite', name: '湖蓝石墨', description: '干净现代，适合 AI 工具密集界面', swatches: ['#fbfeff', '#4a91aa', '#edf7fa', '#a8d5e2'] }
    ];

    const BUILTIN_WALLPAPERS = [
        { id: 'none', name: '无壁纸', description: '纯白背景，让内容本身成为主角', src: '' },
        { id: 'builtin:shanshui-sunrise', name: '云岫初霁', description: '云开见日，清朗书写', src: './assets/wallpapers/shanshui-sunrise-optimized.jpg' }
    ];

    const LEGACY_WALLPAPERS = {};

    let appearanceDbPromise = null;
    let appearanceSnapshot = { state: { id: APPEARANCE_STATE_ID, customIds: [], selectedId: '' }, records: [] };
    let selectedWallpaperId = DEFAULT_WALLPAPER_ID;
    const customWallpaperUrls = new Map();

    function notifyAppearance(type, message) {
        const Toast = window.ZHIYU_TOAST || window.Toast;
        if (Toast && typeof Toast[type] === 'function') Toast[type](message);
    }

    function clampNumber(value, min, max, fallback) {
        if (value === null || value === undefined || value === '') return fallback;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
    }

    function openAppearanceDb() {
        if (appearanceDbPromise) return appearanceDbPromise;
        appearanceDbPromise = new Promise(function(resolve, reject) {
            if (!window.indexedDB) {
                reject(new Error('当前环境不支持本地图片存储'));
                return;
            }
            const request = window.indexedDB.open(APPEARANCE_DB_NAME, APPEARANCE_DB_VERSION);
            request.onupgradeneeded = function() {
                const db = request.result;
                if (!db.objectStoreNames.contains('customWallpapers')) db.createObjectStore('customWallpapers', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('appearanceState')) db.createObjectStore('appearanceState', { keyPath: 'id' });
            };
            request.onsuccess = function() { resolve(request.result); };
            request.onerror = function() { reject(request.error || new Error('无法打开本地图片存储')); };
        });
        return appearanceDbPromise;
    }

    async function readAppearanceSnapshot() {
        const db = await openAppearanceDb();
        return new Promise(function(resolve, reject) {
            const tx = db.transaction(['customWallpapers', 'appearanceState'], 'readonly');
            const recordsRequest = tx.objectStore('customWallpapers').getAll();
            const stateRequest = tx.objectStore('appearanceState').get(APPEARANCE_STATE_ID);
            let records = [];
            let state = null;
            recordsRequest.onsuccess = function() { records = Array.isArray(recordsRequest.result) ? recordsRequest.result : []; };
            stateRequest.onsuccess = function() { state = stateRequest.result || null; };
            tx.oncomplete = function() {
                const ids = records.map(function(record) { return record.id; });
                resolve({
                    records: records,
                    state: {
                        id: APPEARANCE_STATE_ID,
                        customIds: ids,
                        selectedId: state && typeof state.selectedId === 'string' ? state.selectedId : ''
                    }
                });
            };
            tx.onerror = function() { reject(tx.error || new Error('读取本地背景图失败')); };
            tx.onabort = function() { reject(tx.error || new Error('读取本地背景图已中止')); };
        });
    }

    async function writeSelectedWallpaperToDb(id) {
        const db = await openAppearanceDb();
        return new Promise(function(resolve, reject) {
            const tx = db.transaction('appearanceState', 'readwrite');
            const store = tx.objectStore('appearanceState');
            const request = store.get(APPEARANCE_STATE_ID);
            request.onsuccess = function() {
                const state = request.result || { id: APPEARANCE_STATE_ID, customIds: appearanceSnapshot.records.map(function(record) { return record.id; }) };
                state.customIds = appearanceSnapshot.records.map(function(record) { return record.id; });
                state.selectedId = id;
                store.put(state);
            };
            tx.oncomplete = resolve;
            tx.onerror = function() { reject(tx.error || new Error('保存壁纸选择失败')); };
            tx.onabort = function() { reject(tx.error || new Error('保存壁纸选择已中止')); };
        });
    }

    async function storeCustomWallpaper(record, replaceId) {
        const db = await openAppearanceDb();
        return new Promise(function(resolve, reject) {
            const tx = db.transaction(['customWallpapers', 'appearanceState'], 'readwrite');
            const wallpaperStore = tx.objectStore('customWallpapers');
            const stateStore = tx.objectStore('appearanceState');
            const stateRequest = stateStore.get(APPEARANCE_STATE_ID);
            stateRequest.onsuccess = function() {
                const state = stateRequest.result || { id: APPEARANCE_STATE_ID, customIds: [] };
                let customIds = Array.from(new Set(
                    (Array.isArray(state.customIds) ? state.customIds : [])
                        .concat(appearanceSnapshot.records.map(function(item) { return item.id; }))
                ));
                if (replaceId) {
                    wallpaperStore.delete(replaceId);
                    customIds = customIds.filter(function(id) { return id !== replaceId; });
                }
                if (customIds.length >= MAX_CUSTOM_WALLPAPERS) {
                    tx.abort();
                    return;
                }
                wallpaperStore.put(record);
                customIds.push(record.id);
                state.customIds = customIds;
                state.selectedId = record.id;
                stateStore.put(state);
            };
            tx.oncomplete = resolve;
            tx.onerror = function() { reject(tx.error || new Error('保存本地背景图失败')); };
            tx.onabort = function() { reject(tx.error || new Error('本地背景图数量已达到上限')); };
        });
    }

    async function removeCustomWallpaperFromDb(id) {
        const db = await openAppearanceDb();
        return new Promise(function(resolve, reject) {
            const tx = db.transaction(['customWallpapers', 'appearanceState'], 'readwrite');
            const wallpaperStore = tx.objectStore('customWallpapers');
            const stateStore = tx.objectStore('appearanceState');
            const stateRequest = stateStore.get(APPEARANCE_STATE_ID);
            stateRequest.onsuccess = function() {
                const state = stateRequest.result || { id: APPEARANCE_STATE_ID, customIds: [] };
                wallpaperStore.delete(id);
                state.customIds = (Array.isArray(state.customIds) ? state.customIds : []).filter(function(itemId) { return itemId !== id; });
                if (state.selectedId === id) state.selectedId = DEFAULT_WALLPAPER_ID;
                stateStore.put(state);
            };
            tx.oncomplete = resolve;
            tx.onerror = function() { reject(tx.error || new Error('删除本地背景图失败')); };
            tx.onabort = function() { reject(tx.error || new Error('删除本地背景图已中止')); };
        });
    }

    function getCustomWallpaperUrl(record, previewOnly) {
        if (!record || !record.blob) return '';
        const useThumbnail = Boolean(previewOnly && record.thumbnailBlob);
        const key = record.id + (useThumbnail ? ':thumbnail' : ':original');
        const blob = useThumbnail ? record.thumbnailBlob : record.blob;
        if (!customWallpaperUrls.has(key)) customWallpaperUrls.set(key, URL.createObjectURL(blob));
        return customWallpaperUrls.get(key);
    }

    function revokeCustomWallpaperUrl(id) {
        [id + ':original', id + ':thumbnail'].forEach(function(key) {
            const url = customWallpaperUrls.get(key);
            if (url) URL.revokeObjectURL(url);
            customWallpaperUrls.delete(key);
        });
    }

    function wallpaperById(id) {
        const builtin = BUILTIN_WALLPAPERS.find(function(item) { return item.id === id; });
        if (builtin) return builtin;
        const legacy = Object.values(LEGACY_WALLPAPERS).find(function(item) { return item.id === id; });
        if (legacy) return legacy;
        const record = appearanceSnapshot.records.find(function(item) { return item.id === id; });
        return record ? { id: record.id, name: record.name, src: getCustomWallpaperUrl(record), custom: true } : null;
    }

    function applyWallpaper(id) {
        const item = wallpaperById(id) || wallpaperById(DEFAULT_WALLPAPER_ID);
        selectedWallpaperId = item ? item.id : 'none';
        const root = document.documentElement;
        root.dataset.wallpaperId = selectedWallpaperId;
        const source = item && item.src
            ? (item.src.startsWith('blob:') ? item.src : new URL(item.src, document.baseURI).href)
            : '';
        root.style.setProperty('--writing-backdrop-image', source ? 'url("' + source + '")' : 'none');
    }

    function applyWallpaperOpacity(value) {
        const opacity = clampNumber(value, 0, 100, 50);
        document.documentElement.style.setProperty('--wallpaper-overlay-opacity', String(opacity / 100));
        const control = document.getElementById('wallpaperOpacity');
        const output = document.getElementById('wallpaperOpacityValue');
        if (control) control.value = String(opacity);
        if (output) output.textContent = opacity + '%';
        localStorage.setItem(WALLPAPER_OPACITY_KEY, String(opacity));
        return opacity;
    }

    function normalizeWallpaperId(value) {
        if (!value) return '';
        const direct = String(value).trim();
        if (BUILTIN_WALLPAPERS.some(function(item) { return item.id === direct; })) return direct;
        if (direct.startsWith('custom:') || direct.startsWith('legacy:')) return direct;
        const clean = direct.replace(/^url\(["']?/, '').replace(/["']?\)$/, '').replace(/\\/g, '/');
        const filename = clean.split('/').pop();
        return LEGACY_WALLPAPERS[filename] ? LEGACY_WALLPAPERS[filename].id : direct;
    }

    function showMigrationWarningOnce() {
        const key = 'zhiyu_wallpaper_migration_warned';
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, '1');
        notifyAppearance('warn', '旧壁纸设置无法识别，已恢复为默认壁纸');
    }

    function renderThemeCards() {
        const grid = document.getElementById('settingsThemeGrid');
        if (!grid) return;
        const selected = localStorage.getItem(THEME_KEY) || DEFAULT_THEME_ID;
        grid.replaceChildren();
        THEMES.forEach(function(theme) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'settings-theme-card' + (selected === theme.id ? ' active' : '');
            button.dataset.themeId = theme.id;
            button.setAttribute('aria-pressed', selected === theme.id ? 'true' : 'false');
            const swatches = document.createElement('span');
            swatches.className = 'settings-theme-card-swatches';
            theme.swatches.forEach(function(color) {
                const swatch = document.createElement('span');
                swatch.style.backgroundColor = color;
                swatches.appendChild(swatch);
            });
            const title = document.createElement('strong');
            title.textContent = theme.name;
            if (selected === theme.id) {
                const current = document.createElement('span');
                current.className = 'settings-theme-card-current';
                current.textContent = '当前使用';
                title.appendChild(current);
            }
            const description = document.createElement('small');
            description.textContent = theme.description;
            button.append(swatches, title, description);
            button.addEventListener('click', function() {
                document.documentElement.dataset.clientTheme = theme.id;
                localStorage.setItem(THEME_KEY, theme.id);
                renderThemeCards();
            });
            grid.appendChild(button);
        });
    }

    function renderWallpaperCards() {
        const grid = document.getElementById('settingsWallpaperGrid');
        if (!grid) return;
        const cards = BUILTIN_WALLPAPERS.slice();
        const legacy = Object.values(LEGACY_WALLPAPERS).find(function(item) { return item.id === selectedWallpaperId; });
        if (legacy) cards.push(legacy);
        appearanceSnapshot.records.forEach(function(record) {
            cards.push({ id: record.id, name: record.name, description: '本机导入', src: getCustomWallpaperUrl(record, true), custom: true });
        });
        grid.replaceChildren();
        cards.forEach(function(item) {
            const card = document.createElement('div');
            card.className = 'settings-wallpaper-card' + (selectedWallpaperId === item.id ? ' active' : '');
            card.dataset.wallpaperId = item.id;
            const selectButton = document.createElement('button');
            selectButton.type = 'button';
            selectButton.className = 'settings-wallpaper-select';
            selectButton.setAttribute('aria-pressed', selectedWallpaperId === item.id ? 'true' : 'false');
            const preview = document.createElement('div');
            preview.className = 'settings-wallpaper-preview';
            if (item.src) {
                const image = document.createElement('img');
                image.src = item.src;
                image.alt = '';
                preview.appendChild(image);
            } else {
                preview.textContent = '无壁纸';
            }
            const meta = document.createElement('div');
            meta.className = 'settings-wallpaper-card-meta';
            const title = document.createElement('strong');
            title.textContent = item.name;
            meta.appendChild(title);
            if (selectedWallpaperId === item.id) {
                const current = document.createElement('small');
                current.textContent = '当前使用';
                meta.appendChild(current);
            }
            selectButton.append(preview, meta);
            selectButton.addEventListener('click', function() { selectWallpaper(item.id); });
            card.appendChild(selectButton);
            if (item.custom) {
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'settings-wallpaper-delete';
                remove.textContent = '删除';
                remove.addEventListener('click', async function() {
                    await deleteCustomWallpaper(item.id);
                });
                card.appendChild(remove);
            }
            grid.appendChild(card);
        });
    }

    async function selectWallpaper(id) {
        const item = wallpaperById(id);
        if (!item) return;
        try {
            await writeSelectedWallpaperToDb(id);
            appearanceSnapshot.state.selectedId = id;
        } catch (err) {
            notifyAppearance('warn', '壁纸已切换，但本机存储暂时不可用');
        }
        localStorage.setItem(WALLPAPER_KEY, id);
        applyWallpaper(id);
        renderWallpaperCards();
    }

    async function fileDimensions(file) {
        if (typeof window.createImageBitmap === 'function') {
            const bitmap = await window.createImageBitmap(file);
            const dimensions = { width: bitmap.width, height: bitmap.height };
            if (typeof bitmap.close === 'function') bitmap.close();
            return dimensions;
        }
        return new Promise(function(resolve, reject) {
            const url = URL.createObjectURL(file);
            const image = new Image();
            image.onload = function() {
                URL.revokeObjectURL(url);
                resolve({ width: image.naturalWidth, height: image.naturalHeight });
            };
            image.onerror = function() {
                URL.revokeObjectURL(url);
                reject(new Error('图片无法解码'));
            };
            image.src = url;
        });
    }

    async function validateWallpaperFile(file) {
        if (!(file instanceof Blob)) throw new Error('没有读取到有效图片文件');
        if (file.size <= 0 || file.size > MAX_WALLPAPER_BYTES) throw new Error('图片大小必须在 10MB 以内');
        const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
        const declaredType = String(file.type || '').toLowerCase();
        if (!allowedTypes.includes(declaredType)) throw new Error('仅支持 PNG、JPEG 或 WebP 图片');
        const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
        const isPng = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
        const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
        const isWebp = bytes.length >= 12 && String.fromCharCode.apply(null, bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode.apply(null, bytes.slice(8, 12)) === 'WEBP';
        const actualType = isPng ? 'image/png' : (isJpeg ? 'image/jpeg' : (isWebp ? 'image/webp' : ''));
        if (!actualType || actualType !== declaredType) throw new Error('图片格式与文件内容不一致');
        let dimensions;
        try {
            dimensions = await fileDimensions(file);
        } catch (err) {
            throw new Error('图片已损坏或无法解码');
        }
        if (!dimensions.width || !dimensions.height || dimensions.width > MAX_WALLPAPER_EDGE || dimensions.height > MAX_WALLPAPER_EDGE || dimensions.width * dimensions.height > MAX_WALLPAPER_PIXELS) {
            throw new Error('图片最长边不能超过 8192 像素，总像素不能超过 1600 万');
        }
        return { mime: actualType, width: dimensions.width, height: dimensions.height };
    }

    async function createWallpaperThumbnail(file, dimensions) {
        const maxEdge = 480;
        const scale = Math.min(1, maxEdge / dimensions.width, maxEdge / dimensions.height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(dimensions.width * scale));
        canvas.height = Math.max(1, Math.round(dimensions.height * scale));
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('当前环境无法生成背景图缩略图');
        let bitmap = null;
        let image = null;
        let url = '';
        try {
            if (typeof window.createImageBitmap === 'function') {
                bitmap = await window.createImageBitmap(file);
                context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            } else {
                url = URL.createObjectURL(file);
                image = await new Promise(function(resolve, reject) {
                    const element = new Image();
                    element.onload = function() { resolve(element); };
                    element.onerror = function() { reject(new Error('背景图缩略图生成失败')); };
                    element.src = url;
                });
                context.drawImage(image, 0, 0, canvas.width, canvas.height);
            }
            return await new Promise(function(resolve, reject) {
                canvas.toBlob(function(blob) {
                    if (blob) resolve(blob);
                    else reject(new Error('背景图缩略图生成失败'));
                }, 'image/webp', 0.82);
            });
        } finally {
            if (bitmap && typeof bitmap.close === 'function') bitmap.close();
            if (url) URL.revokeObjectURL(url);
        }
    }

    function chooseWallpaperToReplace(records) {
        return new Promise(function(resolve) {
            const overlay = document.createElement('div');
            overlay.className = 'wallpaper-replace-overlay';
            const dialog = document.createElement('div');
            dialog.className = 'wallpaper-replace-dialog';
            const heading = document.createElement('h3');
            heading.textContent = '选择要替换的背景图';
            const description = document.createElement('p');
            description.textContent = '最多保存两张自定义背景图。新图片会替换你选择的这一张。';
            const options = document.createElement('div');
            options.className = 'wallpaper-replace-options';
            records.forEach(function(record) {
                const button = document.createElement('button');
                button.type = 'button';
                const image = document.createElement('img');
                image.src = getCustomWallpaperUrl(record, true);
                image.alt = '';
                const label = document.createElement('span');
                label.textContent = record.name;
                button.append(image, label);
                button.addEventListener('click', function() { finish(record.id); });
                options.appendChild(button);
            });
            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.className = 'btn btn-outline btn-sm';
            cancel.textContent = '取消';
            cancel.addEventListener('click', function() { finish(''); });
            function finish(value) {
                overlay.remove();
                resolve(value);
            }
            dialog.append(heading, description, options, cancel);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
        });
    }

    async function importCustomWallpaperFile(file) {
        const meta = await validateWallpaperFile(file);
        const thumbnailBlob = await createWallpaperThumbnail(file, meta);
        let replaceId = '';
        if (appearanceSnapshot.records.length >= MAX_CUSTOM_WALLPAPERS) {
            replaceId = await chooseWallpaperToReplace(appearanceSnapshot.records.slice(0, MAX_CUSTOM_WALLPAPERS));
            if (!replaceId) return false;
        }
        const record = {
            id: 'custom:' + Date.now() + ':' + (window.crypto && typeof window.crypto.randomUUID === 'function' ? window.crypto.randomUUID() : Math.random().toString(36).slice(2)),
            name: String(file.name || '自定义背景图').slice(0, 120),
            mime: meta.mime,
            width: meta.width,
            height: meta.height,
            createdAt: new Date().toISOString(),
            blob: file.slice(0, file.size, meta.mime),
            thumbnailBlob: thumbnailBlob
        };
        try {
            await storeCustomWallpaper(record, replaceId);
        } catch (err) {
            throw new Error('保存失败，本机存储空间可能不足；原有背景图未改变');
        }
        if (replaceId) revokeCustomWallpaperUrl(replaceId);
        appearanceSnapshot = await readAppearanceSnapshot();
        selectedWallpaperId = record.id;
        localStorage.setItem(WALLPAPER_KEY, record.id);
        applyWallpaper(record.id);
        renderWallpaperCards();
        notifyAppearance('success', replaceId ? '背景图已替换并应用' : '背景图已导入并应用');
        return true;
    }

    async function deleteCustomWallpaper(id) {
        const record = appearanceSnapshot.records.find(function(item) { return item.id === id; });
        if (!record) return false;
        const Confirm = window.ZHIYU_CONFIRM || window.Confirm || { show: function() { return Promise.resolve(false); } };
        const confirmed = await Confirm.show('只会删除软件内保存的副本，不会删除电脑中的原图。确定删除“' + record.name + '”吗？');
        if (!confirmed) return false;
        try {
            await removeCustomWallpaperFromDb(id);
            revokeCustomWallpaperUrl(id);
            appearanceSnapshot = await readAppearanceSnapshot();
            if (selectedWallpaperId === id) {
                selectedWallpaperId = DEFAULT_WALLPAPER_ID;
                localStorage.setItem(WALLPAPER_KEY, selectedWallpaperId);
                applyWallpaper(selectedWallpaperId);
            }
            renderWallpaperCards();
            notifyAppearance('success', '软件内的背景图副本已删除');
            return true;
        } catch (err) {
            notifyAppearance('error', '删除失败，本机存储暂时不可用；原有背景图未改变');
            return false;
        }
    }

    async function initAppearanceSettings() {
        const themeId = THEMES.some(function(theme) { return theme.id === localStorage.getItem(THEME_KEY); }) ? localStorage.getItem(THEME_KEY) : DEFAULT_THEME_ID;
        document.documentElement.dataset.clientTheme = themeId;
        localStorage.setItem(THEME_KEY, themeId);
        renderThemeCards();
        applyWallpaperOpacity(localStorage.getItem(WALLPAPER_OPACITY_KEY));
        try {
            appearanceSnapshot = await readAppearanceSnapshot();
        } catch (err) {
            appearanceSnapshot = { state: { id: APPEARANCE_STATE_ID, customIds: [], selectedId: '' }, records: [] };
            notifyAppearance('warn', '自定义背景图存储暂时不可用，仍可使用内置壁纸');
        }
        const oldValue = localStorage.getItem(WALLPAPER_KEY) || localStorage.getItem('writing_wallpaper') || localStorage.getItem('writingWallpaper');
        let storedId = normalizeWallpaperId(appearanceSnapshot.state.selectedId || oldValue);
        const validCustom = storedId.startsWith('custom:') && appearanceSnapshot.records.some(function(record) { return record.id === storedId; });
        const validBuiltin = BUILTIN_WALLPAPERS.some(function(item) { return item.id === storedId; });
        const validLegacy = Object.values(LEGACY_WALLPAPERS).some(function(item) { return item.id === storedId; });
        if (!storedId) storedId = DEFAULT_WALLPAPER_ID;
        else if (!validCustom && !validBuiltin && !validLegacy) {
            storedId = DEFAULT_WALLPAPER_ID;
            showMigrationWarningOnce();
        }
        selectedWallpaperId = storedId;
        localStorage.setItem(WALLPAPER_KEY, storedId);
        applyWallpaper(storedId);
        renderWallpaperCards();
        try {
            await writeSelectedWallpaperToDb(storedId);
        } catch (err) {
            // 内置壁纸仍可通过 localStorage 正常使用。
        }
    }

    function getApiSettings() {
        return typeof window.gA === 'function' ? window.gA() : {};
    }

    function saveApiSettings(api) {
        if (typeof window.sA === 'function') return window.sA(api);
        return Promise.resolve(false);
    }

    function getCustomModels() {
        if (typeof window.loadCustomModelsForCurrentUser === 'function') {
            return window.loadCustomModelsForCurrentUser();
        }
        try {
            const list = JSON.parse(localStorage.getItem('zhiyu_custom_models') || '[]');
            return Array.isArray(list) ? list : [];
        } catch (err) {
            return [];
        }
    }

    function setInputValue(id, value) {
        const el = document.getElementById(id);
        if (el) el.value = value || '';
    }

    function refreshSettings() {
        const api = getApiSettings();
        setInputValue('apiProvider', api.provider);
        setInputValue('apiKey', api.key);
        setInputValue('apiBase', api.base);
        setInputValue('apiModel', api.model);
        if (typeof window.syncCustomModelBaseInputForProvider === 'function') {
            window.syncCustomModelBaseInputForProvider(document.getElementById('apiBase'), api.provider);
        }

        // 如果设置页为空但模型选择器有配置，同步过来
        const settingsCustomModels = getCustomModels();
        if (!api.key && settingsCustomModels.length > 0) {
            const cm = settingsCustomModels[0];
            setInputValue('apiKey', cm.key);
            setInputValue('apiBase', typeof window.normalizeCustomModelBaseUrl === 'function' ? window.normalizeCustomModelBaseUrl(cm.base) : cm.base);
            setInputValue('apiModel', cm.name);
        }
        const apiStatus = document.getElementById('apiStatus');
        if (apiStatus && !api.key && window.ZHIYU_SECURE_STORE?.hasLegacyUnscopedConfig?.()) {
            apiStatus.textContent = '检测到旧版未分账号的 API 配置，已为安全起见停用；请在当前账号重新保存。';
        }

        if (typeof window.refreshWriteStats === 'function') window.refreshWriteStats();

        const loginStatusEl = document.getElementById('settingLoginStatus');
        const creditStatusEl = document.getElementById('settingCreditStatus');
        const memberStatusEl = document.getElementById('settingMemberStatus');
        const accountAction = document.getElementById('settingAccountAction');
        if (loginStatusEl) loginStatusEl.textContent = '本地身份';
        if (creditStatusEl) creditStatusEl.textContent = '由自备模型账户决定';
        if (memberStatusEl) memberStatusEl.textContent = '社区版';
        if (accountAction) accountAction.textContent = '无需账号';
    }

    function initSettingsMenu() {
        document.querySelectorAll('.settings-menu-item').forEach(function(btn) {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.settings-menu-item').forEach(function(item) { item.classList.remove('active'); });
                this.classList.add('active');
                document.querySelectorAll('.settings-section').forEach(function(section) {
                    const active = section.id === btn.dataset.target;
                    section.hidden = !active;
                    section.classList.toggle('active', active);
                });
            });
        });
    }

    function syncVersionInfo() {
        const version = window.ZHIYU_APP_VERSION || 'V3.2';
        const sidebarVersion = document.getElementById('sidebarVersion');
        const settingVersion = document.getElementById('settingVersionValue');
        if (sidebarVersion) sidebarVersion.textContent = version;
        if (settingVersion) settingVersion.textContent = version;
    }

    function getUpdateNotesText() {
        const notes = Array.isArray(window.ZHIYU_UPDATE_NOTES) ? window.ZHIYU_UPDATE_NOTES : [];
        if (!notes.length) return (window.ZHIYU_APP_VERSION || 'V3.2') + '\n暂无更新记录。';
        return notes.map(function(note) {
            const title = [note.version, note.title].filter(Boolean).join(' · ');
            const items = Array.isArray(note.items) ? note.items.map(function(item) { return '• ' + item; }).join('\n') : '';
            return title + (items ? '\n' + items : '');
        }).join('\n\n');
    }

    function splitFontSelectorList(selectorText) {
        const result = [];
        let start = 0;
        let roundDepth = 0;
        let squareDepth = 0;
        let quote = '';
        for (let index = 0; index < selectorText.length; index += 1) {
            const char = selectorText[index];
            if (quote) {
                if (char === quote && selectorText[index - 1] !== '\\') quote = '';
                continue;
            }
            if (char === '"' || char === "'") {
                quote = char;
                continue;
            }
            if (char === '(') roundDepth += 1;
            else if (char === ')') roundDepth = Math.max(0, roundDepth - 1);
            else if (char === '[') squareDepth += 1;
            else if (char === ']') squareDepth = Math.max(0, squareDepth - 1);
            else if (char === ',' && roundDepth === 0 && squareDepth === 0) {
                result.push(selectorText.slice(start, index).trim());
                start = index + 1;
            }
        }
        result.push(selectorText.slice(start).trim());
        return result.filter(Boolean);
    }

    function prefixFontSelector(selector) {
        if (/^html(?:\b|[.#[:])/.test(selector)) {
            return selector.replace(/^html/, 'html[data-font-size]');
        }
        if (/^:root(?:\b|[.#[:])/.test(selector)) {
            return selector.replace(/^:root/, 'html[data-font-size]');
        }
        return 'html[data-font-size] ' + selector;
    }

    function buildFontRuleOverrides(ruleList) {
        let output = '';
        Array.from(ruleList || []).forEach(function(rule) {
            if (rule.type === window.CSSRule.STYLE_RULE) {
                const value = String(rule.style && rule.style.fontSize || '').trim();
                const match = value.match(/^([1-9]\d*(?:\.\d+)?)px$/);
                if (!match || !rule.selectorText) return;
                const selectors = splitFontSelectorList(rule.selectorText).map(prefixFontSelector);
                if (!selectors.length) return;
                output += selectors.join(',') + '{font-size:calc(' + match[1] + 'px + var(--font-size-offset, 0px))!important;}';
                return;
            }
            if (!rule.cssRules || !rule.cssRules.length) return;
            const nested = buildFontRuleOverrides(rule.cssRules);
            if (!nested) return;
            if (rule.type === window.CSSRule.MEDIA_RULE) {
                output += '@media ' + rule.conditionText + '{' + nested + '}';
            } else if (rule.type === window.CSSRule.SUPPORTS_RULE) {
                output += '@supports ' + rule.conditionText + '{' + nested + '}';
            } else {
                output += nested;
            }
        });
        return output;
    }

    function ensureFontSizeOverrideRules() {
        if (document.getElementById('zhiyuFontSizeOverrides')) return;
        let cssText = '';
        Array.from(document.styleSheets || []).forEach(function(sheet) {
            const href = String(sheet.href || '');
            if (href.includes('/75-global-writing-backdrop.css')) return;
            try {
                cssText += buildFontRuleOverrides(sheet.cssRules);
            } catch (err) {
                // Ignore stylesheets that the browser does not permit reading.
            }
        });
        for (let size = 8; size <= 40; size += 1) {
            cssText += 'html[data-font-size] [style*="font-size:' + size + 'px"],'
                + 'html[data-font-size] [style*="font-size: ' + size + 'px"]'
                + '{font-size:calc(' + size + 'px + var(--font-size-offset, 0px))!important;}';
        }
        const style = document.createElement('style');
        style.id = 'zhiyuFontSizeOverrides';
        style.textContent = cssText;
        document.head.appendChild(style);
    }

    function initFontSize() {
        const supported = ['small', 'medium', 'large', 'xlarge'];
        const saved = localStorage.getItem(FONT_SIZE_KEY);
        const current = supported.includes(saved) ? saved : 'medium';
        ensureFontSizeOverrideRules();
        function apply(size) {
            document.documentElement.dataset.fontSize = size;
            localStorage.setItem(FONT_SIZE_KEY, size);
            document.querySelectorAll('[data-font-size]').forEach(function(button) {
                const active = button.dataset.fontSize === size;
                button.classList.toggle('active', active);
                button.setAttribute('aria-pressed', active ? 'true' : 'false');
            });
        }
        apply(current);
        document.querySelectorAll('[data-font-size]').forEach(function(button) {
            button.addEventListener('click', function() { apply(this.dataset.fontSize); });
        });
    }

    function initAccountAction() {
        document.getElementById('settingAccountAction')?.addEventListener('click', function() {
            const auth = AppState.auth || {};
            if (auth.isLoggedIn && typeof window.openUserPanel === 'function') window.openUserPanel();
            else if (window.Modal) window.Modal.open('authModal');
        });
    }

    function initApiSettings() {
        document.getElementById('btnSaveApi')?.addEventListener('click', async function() {
            const accountUid = window.AccountDataScope?.getActiveUid?.() || 'guest';
            const accountEpoch = window.getAccountScopeEpoch?.();
            const api = {};
            api.provider = document.getElementById('apiProvider')?.value || '';
            api.key = document.getElementById('apiKey')?.value || '';
            api.base = typeof window.normalizeCustomModelBaseUrl === 'function'
                ? window.normalizeCustomModelBaseUrl(document.getElementById('apiBase')?.value || '')
                : (document.getElementById('apiBase')?.value || '');
            api.model = document.getElementById('apiModel')?.value || '';
            if (window.ZHIYU_COMMUNITY_MODE === true && (api.base || api.model || api.key)) {
                if (!api.base) {
                    Toast.warn('请填写模型服务地址');
                    return;
                }
                try {
                    if (!window.ZHIYU_COMMUNITY_RUNTIME?.network?.requestProviderApproval?.(api.base)) return;
                } catch (error) {
                    Toast.warn(error?.message || '模型地址不符合社区版安全规则');
                    return;
                }
            }
            const syncedModel = typeof window.syncApiConfigToCustomModel === 'function'
                ? window.syncApiConfigToCustomModel(api)
                : null;
            const saved = await saveApiSettings(api);
            const sameAccount = (window.AccountDataScope?.getActiveUid?.() || 'guest') === accountUid
                && (accountEpoch === undefined || window.getAccountScopeEpoch?.() === accountEpoch);
            if (!sameAccount) return;
            if (syncedModel && typeof window.reloadModelStateForCurrentUser === 'function') {
                window.reloadModelStateForCurrentUser();
            }
            const status = document.getElementById('apiStatus');
            if (status) {
                status.textContent = saved === false ? 'API设置保存失败，请重试' : 'API设置已保存';
                setTimeout(function() { status.textContent = ''; }, 2000);
            }
        });

        document.getElementById('apiProvider')?.addEventListener('change', function() {
            if (typeof window.syncCustomModelBaseInputForProvider === 'function') {
                window.syncCustomModelBaseInputForProvider(document.getElementById('apiBase'), this.value);
            }
        });

        document.getElementById('toggleApiKeyVis')?.addEventListener('click', function() {
            const keyInput = document.getElementById('apiKey');
            if (!keyInput) return;
            if (keyInput.type === 'password') {
                keyInput.type = 'text';
                this.textContent = '隐藏';
                this.setAttribute('aria-label', '隐藏 API 密钥');
            } else {
                keyInput.type = 'password';
                this.textContent = '显示';
                this.setAttribute('aria-label', '显示 API 密钥');
            }
        });
    }

    function initBackupActions() {
        document.getElementById('btnExportAll')?.addEventListener('click', async function() {
            const Toast = window.ZHIYU_TOAST || window.Toast || { warn: function() {} };
            if (typeof window.openMultiBookBackupExportModal !== 'function') {
                Toast.warn('导出功能尚未初始化完成，请刷新页面后重试');
                return;
            }
            window.openMultiBookBackupExportModal();
        });

        document.getElementById('btnImportAll')?.addEventListener('click', function() {
            document.getElementById('importFilePicker')?.click();
        });

        document.getElementById('importFilePicker')?.addEventListener('change', async function(e) {
            const files = Array.from(e.target.files || []);
            if (!files.length) return;
            const Toast = window.ZHIYU_TOAST || window.Toast || { error: function() {}, warn: function() {} };
            try {
                for (const file of files) {
                    if (/\.zip$/i.test(file.name || '')) {
                        if (typeof window.zhiyuImportBookBackupFile !== 'function') {
                            Toast.warn('作品备份导入功能尚未初始化完成，请刷新页面后重试');
                            return;
                        }
                        await window.zhiyuImportBookBackupFile(file);
                    } else {
                        if (typeof window.zhiyuImportAnyLocalFile !== 'function') {
                            Toast.warn('导入功能尚未初始化完成，请刷新页面后重试');
                            return;
                        }
                        await window.zhiyuImportAnyLocalFile(file);
                    }
                }
            } catch (err) {
                Toast.error('导入失败：' + err.message);
            } finally {
                e.target.value = '';
            }
        });
    }

    function initTxtExport() {
        document.getElementById('btnExportTxt')?.addEventListener('click', function() {
            const bookName = document.getElementById('bookSel')?.value || AppState.chapter?.book || '';
            if (!bookName) { window.Toast.warn('请先在写作页选择一本书籍'); return; }
            if (typeof window.openCatalogTransferModal !== 'function') {
                window.Toast.warn('文件管理尚未初始化完成，请刷新页面后重试');
                return;
            }
            window.openCatalogTransferModal('export');
        });
    }

    function initDarkMode() {
        const darkToggle = document.getElementById('darkModeToggle');
        const sidebarToggle = document.getElementById('sidebarDarkModeToggle');
        if (!darkToggle && !sidebarToggle) return;
        const themeApi = window.ZHIYU_THEME;
        const savedTheme = themeApi?.readStored?.() || localStorage.getItem('novel_theme') || 'light';
        if (themeApi?.apply) themeApi.apply(savedTheme, { persist: false });
        else {
            document.documentElement.toggleAttribute('data-theme', savedTheme === 'dark');
            if (savedTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
            if (darkToggle) darkToggle.checked = savedTheme === 'dark';
        }
        if (darkToggle && darkToggle.dataset.themeBound !== 'true') {
            darkToggle.dataset.themeBound = 'true';
            darkToggle.addEventListener('change', function() {
                const nextTheme = this.checked ? 'dark' : 'light';
                if (themeApi?.apply) themeApi.apply(nextTheme);
                else {
                    if (nextTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
                    else document.documentElement.removeAttribute('data-theme');
                    localStorage.setItem('novel_theme', nextTheme);
                }
            });
        }
        if (sidebarToggle && sidebarToggle.dataset.themeBound !== 'true') {
            sidebarToggle.dataset.themeBound = 'true';
            sidebarToggle.addEventListener('click', function() {
                const current = themeApi?.get?.() || (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
                const nextTheme = current === 'dark' ? 'light' : 'dark';
                if (themeApi?.apply) themeApi.apply(nextTheme);
                else {
                    if (nextTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
                    else document.documentElement.removeAttribute('data-theme');
                    localStorage.setItem('novel_theme', nextTheme);
                }
            });
        }
    }

    function initAppearanceControls() {
        const opacity = document.getElementById('wallpaperOpacity');
        opacity?.addEventListener('input', function() { applyWallpaperOpacity(this.value); });
        document.getElementById('btnImportWallpaper')?.addEventListener('click', function() {
            document.getElementById('wallpaperFilePicker')?.click();
        });
        document.getElementById('wallpaperFilePicker')?.addEventListener('change', async function(event) {
            const file = event.target.files && event.target.files[0];
            if (!file) return;
            try {
                await importCustomWallpaperFile(file);
            } catch (err) {
                notifyAppearance('error', err.message || '背景图导入失败');
            } finally {
                event.target.value = '';
            }
        });
        document.getElementById('btnOpenUpdateNotes')?.addEventListener('click', function() {
            const Confirm = window.ZHIYU_CONFIRM || window.Confirm;
            Confirm?.show?.(getUpdateNotesText(), { acknowledgeOnly: true, confirmText: '关闭' });
        });
    }

    syncVersionInfo();
    initSettingsMenu();
    initFontSize();
    initAccountAction();
    initApiSettings();
    initBackupActions();
    initTxtExport();
    initDarkMode();
    initAppearanceControls();
    initAppearanceSettings();

    window.refreshSettings = refreshSettings;
    window.ZHIYU_APPEARANCE = {
        themes: THEMES.slice(),
        wallpapers: BUILTIN_WALLPAPERS.slice(),
        validateWallpaperFile: validateWallpaperFile,
        importCustomWallpaperFile: importCustomWallpaperFile,
        deleteCustomWallpaper: deleteCustomWallpaper,
        selectWallpaper: selectWallpaper,
        applyWallpaperOpacity: applyWallpaperOpacity,
        getSnapshot: function() { return appearanceSnapshot; },
        getSelectedWallpaperId: function() { return selectedWallpaperId; }
    };
    window.ZHIYU_SETTINGS_PAGE_READY = true;
})(window);
