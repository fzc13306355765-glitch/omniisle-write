// 拆分项目总览页帮助模块。
// 负责 B 站教程弹窗；社区版仅在用户确认后打开外部教程页。
(function(window) {
    'use strict';

    const Toast = window.ZHIYU_TOAST;
    const Modal = window.ZHIYU_MODAL;

const OVERVIEW_TUTORIALS = [
            {
                id: "basic-interface-guide",
                title: "知屿写作界面操作教程",
                desc: "从作品工作台、写作页到记忆库，快速熟悉长篇创作流程。",
                badge: "B站",
                cover: "https://i1.hdslb.com/bfs/archive/2dc2ccd10c5493abf3c60eac7d2082faaa1e88dc.jpg",
                url: "https://www.bilibili.com/video/BV15sVz6iENp/",
                embedUrl: "https://player.bilibili.com/player.html?isOutside=true&bvid=BV15sVz6iENp&page=1&autoplay=0&danmaku=0"
            },
            {
                id: "new-version-full-guide",
                title: "AI小说写作上手教程：知屿写作新版本完整实操",
                desc: "从创建作品到大纲、细纲、正文、AI检测和记忆库，按真实写作流程完整演示。",
                badge: "B站",
                cover: "https://i2.hdslb.com/bfs/archive/c8a4a94b027d6b4dba0987d1e22b8bbeed8fb090.jpg",
                url: "https://www.bilibili.com/video/BV1Bojq62EDP/",
                embedUrl: "https://player.bilibili.com/player.html?isOutside=true&bvid=BV1Bojq62EDP&page=1&autoplay=0&danmaku=0"
            }
        ];

function openOverviewTutorial() {
            if (!Array.isArray(OVERVIEW_TUTORIALS) || !OVERVIEW_TUTORIALS.length) {
                Toast.warn('B站教程链接待配置');
                return;
            }
            renderOverviewTutorialCards();
            const frame = document.getElementById('overviewTutorialFrame');
            if (frame) frame.src = '';
            const link = document.getElementById('overviewTutorialOpenLink');
            if (link) {
                link.href = OVERVIEW_TUTORIALS[0].url || '#';
                link.hidden = window.ZHIYU_COMMUNITY_MODE === true;
            }
            const hint = document.getElementById('overviewTutorialHint');
            if (hint) hint.textContent = '先选择上方教程卡片，再开始观看。';
            const videoBox = document.getElementById('overviewTutorialVideoBox');
            if (videoBox) videoBox.classList.remove('active');
            Modal.open('overviewTutorialModal');
        }

        function renderOverviewTutorialCards() {
            const list = document.getElementById('overviewTutorialList');
            if (!list) return;
            list.innerHTML = '';
            if (!Array.isArray(OVERVIEW_TUTORIALS) || !OVERVIEW_TUTORIALS.length) {
                list.innerHTML = '<div class="overview-tutorial-empty">教程正在整理中</div>';
                return;
            }
            OVERVIEW_TUTORIALS.forEach(function(tutorial) {
                const card = document.createElement('button');
                card.type = 'button';
                card.className = 'overview-tutorial-card';
                card.dataset.tutorialId = tutorial.id;

                const cover = document.createElement('div');
                cover.className = 'overview-tutorial-cover';
                if (tutorial.cover && window.ZHIYU_COMMUNITY_MODE !== true) {
                    const img = document.createElement('img');
                    img.src = tutorial.cover;
                    img.alt = tutorial.title || 'B站教程封面';
                    img.loading = 'lazy';
                    img.onerror = function() {
                        img.style.display = 'none';
                        cover.classList.add('is-fallback');
                    };
                    cover.appendChild(img);
                } else {
                    cover.classList.add('is-fallback');
                }
                const badge = document.createElement('span');
                badge.className = 'overview-tutorial-badge';
                badge.textContent = tutorial.badge || 'B站';
                cover.appendChild(badge);

                const body = document.createElement('div');
                body.className = 'overview-tutorial-card-body';
                const title = document.createElement('h4');
                title.className = 'overview-tutorial-card-title';
                title.textContent = tutorial.title || '未命名教程';
                const desc = document.createElement('p');
                desc.className = 'overview-tutorial-card-desc';
                desc.textContent = tutorial.desc || '点击观看教程';
                body.appendChild(title);
                body.appendChild(desc);

                card.appendChild(cover);
                card.appendChild(body);
                card.addEventListener('click', function() {
                    selectOverviewTutorial(tutorial.id);
                });
                list.appendChild(card);
            });
        }

        function selectOverviewTutorial(tutorialId) {
            const tutorial = (OVERVIEW_TUTORIALS || []).find(function(item) { return item.id === tutorialId; });
            if (!tutorial || !tutorial.embedUrl) {
                Toast.warn('教程链接无效');
                return;
            }
            if (window.ZHIYU_COMMUNITY_MODE === true) {
                const targetUrl = tutorial.url || tutorial.embedUrl;
                const approved = typeof window.confirm === 'function' && window.confirm(
                    '即将在新窗口打开 B 站教程：\n' + targetUrl + '\n\n这会连接 B 站，确认继续吗？'
                );
                if (!approved) return;
                const opened = window.open(targetUrl, '_blank', 'noopener,noreferrer');
                if (opened) opened.opener = null;
                return;
            }
            document.querySelectorAll('.overview-tutorial-card').forEach(function(card) {
                card.classList.toggle('active', card.dataset.tutorialId === tutorialId);
            });
            const frame = document.getElementById('overviewTutorialFrame');
            if (frame) frame.src = tutorial.embedUrl;
            const link = document.getElementById('overviewTutorialOpenLink');
            if (link) link.href = tutorial.url || tutorial.embedUrl;
            const hint = document.getElementById('overviewTutorialHint');
            if (hint) hint.textContent = tutorial.title ? '正在观看：' + tutorial.title : '正在观看教程';
            const videoBox = document.getElementById('overviewTutorialVideoBox');
            if (videoBox) videoBox.classList.add('active');
        }

        function closeOverviewTutorial() {
            const frame = document.getElementById('overviewTutorialFrame');
            if (frame) frame.src = '';
            const videoBox = document.getElementById('overviewTutorialVideoBox');
            if (videoBox) videoBox.classList.remove('active');
            Modal.close('overviewTutorialModal');
        }

    window.ZHIYU_OVERVIEW_TUTORIALS = OVERVIEW_TUTORIALS;
    window.openOverviewTutorial = openOverviewTutorial;
    window.renderOverviewTutorialCards = renderOverviewTutorialCards;
    window.selectOverviewTutorial = selectOverviewTutorial;
    window.closeOverviewTutorial = closeOverviewTutorial;
})(window);
