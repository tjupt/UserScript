// ==UserScript==
// @name         qBittorrent TJUPT 详情直达
// @namespace    https://github.com/tjupt/UserScript/tree/master/qbittorrent-tjupt
// @version      1.3.0
// @description  当种子 Tracker 包含 tjupt.org 时，在属性面板 Tab 栏末尾添加「种子详情」和「H&R 考核」快捷入口
// @author       Draven
// @icon         https://tjupt.org/favicon.ico
// @match        http://localhost:8080/*
// @match        http://127.0.0.1:8080/*
// -------------------------------------------------------
// 如果你的 qBittorrent WebUI 地址不是上面列出的，请在手动把你的地址加到 @match 里
// 例如：@match  http://192.168.1.182:8085/*
// -------------------------------------------------------
// @grant        none
// @run-at       document-idle
// @downloadURL  https://github.com/tjupt/UserScript/raw/refs/heads/master/qbittorrent-tjupt/qbittorrent-tjupt.user.js
// ==/UserScript==

(function () {
    'use strict';

    /* ================================================================
     * 配置区
     * ================================================================ */
    const CFG = {
        detailsBase : 'https://tjupt.org/details.php?id=',
        hnrBase     : 'https://tjupt.org/hnr_details.php?sid=',
        pollMs      : 800,   // 轮询间隔（毫秒）
        debounceMs  : 350,   // DOM 变化防抖时间
    };

    /* ================================================================
     * 内部状态
     * ================================================================ */
    let lastHash    = null;   // 上次处理的种子 hash
    let lastId      = null;   // 上次解析到的 tjupt 种子 ID
    let debTimer    = null;

    /* ================================================================
     * 工具：qBittorrent API
     * ================================================================ */
    async function apiGet(path) {
        try {
            const r = await fetch(path);
            if (!r.ok) return null;
            return await r.json();
        } catch {
            return null;
        }
    }

    const fetchTrackers   = h => apiGet(`/api/v2/torrents/trackers?hash=${h}`);
    const fetchProperties = h => apiGet(`/api/v2/torrents/properties?hash=${h}`);

    /* ================================================================
     * 获取当前选中种子的 hash
     * ================================================================ */
    function getSelectedHash() {
        const isHash = h => h && /^[0-9a-f]{40}$/i.test(h);

        // ① getCurrentTorrentID()：官方 WebUI 提供的专用方法
        try {
            const h = window.torrentsTable?.getCurrentTorrentID?.();
            if (isHash(h)) return h;
        } catch { /* ignore */ }

        // ② selectedRows 数组：多选时取首项
        try {
            const rows = window.torrentsTable?.selectedRows;
            if (Array.isArray(rows) && rows.length > 0 && isHash(rows[0])) return rows[0];
        } catch { /* ignore */ }

        // ③ DOM 兜底：选中行带 "selected" class，data-row-id 存 hash
        const selRow = document.querySelector('tr.torrentsTableContextMenuTarget.selected');
        if (selRow) {
            const h = selRow.dataset.rowId || selRow.id;
            if (isHash(h)) return h;
        }

        return null;
    }

    /* ================================================================
     * 检查是否 tjupt.org Tracker，并解析种子 ID
     * ================================================================ */
    async function resolveId(hash) {
        // Step 1: 先检查 Tracker 列表，确认是 tjupt 的种子
        const trackers = await fetchTrackers(hash);
        if (!trackers) return null;

        const hasTjupt = trackers.some(
            t => typeof t.url === 'string' && t.url.toLowerCase().includes('tjupt.org')
        );
        if (!hasTjupt) return null;

        // Step 2: 从 comment 字段解析种子 ID
        const props = await fetchProperties(hash);
        if (!props) return null;

        const comment = props.comment?.trim() || '';

        // 格式 1：/details.php?id=550251（无域名的相对路径）
        let m = comment.match(/\/details\.php\?id=(\d+)/i);
        if (m) return m[1];

        // 格式 2：完整 URL，如 https://tjupt.org/details.php?id=12345
        m = comment.match(/tjupt\.org\/details\.php[^"'\s]*[?&]id=(\d+)/i);
        if (m) return m[1];

        // 格式 3：裸参数，如 ?id=12345
        m = comment.match(/[?&]id=(\d+)/);
        if (m) return m[1];

        // 格式 4：comment 本身就是纯数字
        m = comment.match(/^(\d+)$/);
        if (m) return m[1];

        return null;
    }

    /* ================================================================
     * 寻找属性面板的 Tab 导航栏
     * 实测结构（qBittorrent 官方 WebUI）：
     *   <ul id="propertiesTabs" class="tab-menu">
     *     <li id="PropGeneralLink" class="selected"><a>普通</a></li>
     *     <li id="PropTrackersLink"><a>Tracker</a></li>
     *     ...
     *   </ul>
     * ================================================================ */
    function findTabNav() {
        // 首选：实测 ID
        const byId = document.getElementById('propertiesTabs');
        if (byId) return byId;

        // 备选：通过中文 Tab 文字定位（"Tracker" 在中英文版本均存在）
        for (const ul of document.querySelectorAll('ul')) {
            if (ul.textContent.includes('Tracker') && ul.children.length >= 3) {
                // 确认是属性面板（含"普通"/"General"之一）
                const t = ul.textContent;
                if (t.includes('普通') || t.includes('General')) return ul;
            }
        }

        return null;
    }

    /* ================================================================
     * Tab DOM 操作
     * ================================================================ */
    function removeTjuptTabs() {
        document.getElementById('tjupt-tab-details')?.remove();
        document.getElementById('tjupt-tab-hnr')?.remove();
    }

    function createTabLi(id, text, href, title) {
        // 实测结构：<li id="..."><a>文字</a></li>，无额外 class，样式全由 CSS 控制
        const li = document.createElement('li');
        li.id = id;

        const a = document.createElement('a');
        a.href        = href;
        a.target      = '_blank';
        a.rel         = 'noopener noreferrer';
        a.title       = title;
        a.textContent = text;

        li.appendChild(a);
        return li;
    }

    function addTjuptTabs(tabNav, id) {
        removeTjuptTabs(); // 防止重复

        tabNav.appendChild(createTabLi(
            'tjupt-tab-details',
            '🔎种子详情',
            CFG.detailsBase + id,
            `在 TJUPT 查看种子详情 (ID: ${id})`
        ));

        tabNav.appendChild(createTabLi(
            'tjupt-tab-hnr',
            '⌛️H&R考核',
            CFG.hnrBase + id,
            `在 TJUPT 查看 H&R 考核状态 (ID: ${id})`
        ));
    }

    /* ================================================================
     * 核心：检查选中种子 → 更新 Tab
     * ================================================================ */
    async function updateTabs() {
        const hash = getSelectedHash();

        if (!hash) {
            // 没有选中任何种子
            if (lastHash !== null) {
                lastHash = null;
                lastId   = null;
                removeTjuptTabs();
            }
            return;
        }

        if (hash === lastHash) {
            // 同一种子，但 tab 可能因 DOM 刷新消失，补回来
            if (lastId && !document.getElementById('tjupt-tab-details')) {
                const tabNav = findTabNav();
                if (tabNav) addTjuptTabs(tabNav, lastId);
            }
            return;
        }

        // 新的种子被选中
        lastHash = hash;
        lastId   = null;
        removeTjuptTabs();

        const id = await resolveId(hash);
        if (!id) return; // 不是 tjupt 种子 或 无法解析 ID

        lastId = id;

        const tabNav = findTabNav();
        if (tabNav) {
            addTjuptTabs(tabNav, id);
        } else {
            // 属性面板可能还没渲染，稍后重试
            setTimeout(async () => {
                const nav = findTabNav();
                if (nav && lastId === id) addTjuptTabs(nav, id);
            }, 800);
        }
    }

    /* ================================================================
     * 启动：MutationObserver（响应选中状态变化）+ 定时轮询（兜底）
     * ================================================================ */
    function init() {
        // MutationObserver 监听 class 属性变化（选中行的 class 会变为 "selected"）
        const observer = new MutationObserver(() => {
            clearTimeout(debTimer);
            debTimer = setTimeout(updateTabs, CFG.debounceMs);
        });

        observer.observe(document.body, {
            subtree         : true,
            childList       : true,
            attributes      : true,
            attributeFilter : ['class', 'data-hash'],
        });

        // 定时轮询，应对极少数 MutationObserver 漏报场景
        setInterval(updateTabs, CFG.pollMs);

        // 初次检查
        setTimeout(updateTabs, 1500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
