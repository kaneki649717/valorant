/**
 * 涓诲叆鍙ｆ枃浠?- 绠€鍖栫増
 * 妯″潡鍖栭噸鏋勫悗鐨勪富绋嬪簭
 */

import { Store } from './core/Store.js';
import { GlitchText } from './components/GlitchText.js';
import {
    categoryMap,
    probePerformance,
    lowPerf
} from './config.js';
import {
    delay,
    getCategoryLabel,
    formatTimeAgo,
    showError,
    showSuccess,
    setButtonsBusy,
    triggerGlow,
    triggerSuccess,
    attachRipple,
    pickRandom
} from './utils.js';
import { apiGet, apiPost } from './api.js';
import {
    spawnParticles,
    spawnGlyphStorm,
    revealText,
    spawnDataStream,
    runDrawSequence
} from './effects.js';

// 搴旂敤鍒濆鍖栧嚱鏁?
async function initApp() {
    try {
        console.log('[Init] 寮€濮嬪垵濮嬪寲搴旂敤...');
        console.log('[Init] 瑙勫垯鏁版嵁:', window.injectedRulesData);
        console.log('[Init] API_BASE:', window.API_BASE);

        // 鍒濆鍖栨€ц兘妫€娴?
        probePerformance();

        // 鍒濆鍖?Store
        const rulesData = window.injectedRulesData || [];
        console.log('[Init] Store鍒濆鍖栵紝瑙勫垯鏁伴噺:', rulesData.length);
        const store = new Store(rulesData);
        console.log('[Init] Store鍒涘缓鎴愬姛锛宎llRules:', store.allRules.length);

        // DOM 鍏冪礌寮曠敤
        const elements = {
            resultTextEl: document.getElementById('result-text'),
            listContainer: document.getElementById('rules-list'),
            categoryLabel: document.getElementById('category-label'),
            scanLine: document.querySelector('.scan-line'),
            resultCard: document.querySelector('.result-card'),
            resultStage: document.querySelector('.result-stage'),
            drawOverlay: document.querySelector('.draw-overlay'),
            particleLayer: document.getElementById('particle-layer'),
            btnCopy: document.getElementById('btn-copy'),
            btnUndo: document.getElementById('btn-undo'),
            btnDraw: document.getElementById('btn-draw'),
            btnDraw2: document.getElementById('btn-draw-2'),
            historyList: document.getElementById('history-list'),
            historyStatus: document.getElementById('history-status'),
            statsToday: document.getElementById('stats-today'),
            statsTop: document.getElementById('stats-top'),
            rulesStats: document.getElementById('rules-stats'),
            categoryDropdown: document.getElementById('category-dropdown'),
            categoryTrigger: document.getElementById('category-trigger'),
            categoryMenu: document.getElementById('category-menu'),
            categoryValue: document.getElementById('category-value'),
            categoryItems: document.querySelectorAll('.category-dropdown-item'),
            filterBtns: document.querySelectorAll('.filter-btn'),
            allButtons: [
                document.getElementById('btn-draw'),
                document.getElementById('btn-draw-2'),
                document.getElementById('btn-copy'),
                document.getElementById('btn-undo')
            ]
        };

        // 鐘舵€佺鐞?
        const state = {
            isDrawing: false,
            lastDrawIds: [],
            drawCategory: 'all',
            drawWindowStart: 0,
            drawCount: 0,
            undoAt: 0
        };

        // 冷却限制：5 分钟窗口内裁决最多 3 次（执行+双重共享），撤销最多 1 次
        const DRAW_WINDOW_MS = 5 * 60 * 1000;
        // 冷却状态持久化：刷新页面不能重置 CD
        function loadCooldown() {
            try {
                const raw = localStorage.getItem('vp_cooldown');
                if (!raw) return;
                const cd = JSON.parse(raw);
                state.drawWindowStart = cd.drawWindowStart || 0;
                state.drawCount = cd.drawCount || 0;
                state.undoAt = cd.undoAt || 0;
            } catch (e) {}
        }
        function saveCooldown() {
            try {
                localStorage.setItem('vp_cooldown', JSON.stringify({
                    drawWindowStart: state.drawWindowStart,
                    drawCount: state.drawCount,
                    undoAt: state.undoAt
                }));
            } catch (e) {}
        }
        function canDrawNow() {
            const now = Date.now();
            if (state.drawWindowStart && now - state.drawWindowStart < DRAW_WINDOW_MS) {
                return state.drawCount < 3;
            }
            return true;
        }
        function recordDraw() {
            const now = Date.now();
            if (!state.drawWindowStart || now - state.drawWindowStart >= DRAW_WINDOW_MS) {
                state.drawWindowStart = now;
                state.drawCount = 0;
            }
            state.drawCount += 1;
            saveCooldown();
        }
        function canUndoNow() {
            return !state.undoAt || Date.now() - state.undoAt >= DRAW_WINDOW_MS;
        }
        function recordUndo() {
            state.undoAt = Date.now();
            saveCooldown();
        }

        // 鍒濆鍖?GlitchText
        const glitch = elements.resultTextEl ? new GlitchText(elements.resultTextEl) : null;

        // 性能恢复后把进场数据流补回来
        window.addEventListener('perf:ok', () => {
            spawnDataStream(elements.resultStage, store);
        });

        // 绉婚櫎 roulette-text
        const rouletteText = document.getElementById('roulette-text');
        if (rouletteText) rouletteText.remove();

        /**
         * 娓叉煋鍘嗗彶璁板綍鍒楄〃
         */
        function renderHistory(items) {
            if (!elements.historyList) return;
            if (!items || !items.length) {
                elements.historyList.innerHTML = '<div class="history-empty">暂无记录</div>';
                return;
            }
            elements.historyList.innerHTML = items.map((item, idx) => `
                <div class="history-row">
                    <div class="history-main">
                        <span class="history-index">#${idx + 1}</span>
                        <span class="history-id">[${item.rule_id}]</span>
                        <span class="history-text">${item.content}</span>
                    </div>
                    <div class="history-meta">
                        <span>${formatTimeAgo(item.timestamp)}</span>
                        <span>· ${categoryMap[item.category] || item.category}</span>
                    </div>
                </div>
            `).join('');
        }

        /**
         * 鏇存柊鍘嗗彶璁板綍
         */
        async function updateHistory() {
            if (!elements.historyList) return;
            try {
                const data = await apiGet('/api/history/list?limit=8', {
                    onStatusChange: (status) => {
                        if (elements.historyStatus) elements.historyStatus.textContent = status;
                    }
                });
                if (data && data.items) {
                    renderHistory(data.items);
                }
            } catch (err) {
                console.error('鏇存柊鍘嗗彶璁板綍澶辫触:', err);
                if (elements.historyStatus) elements.historyStatus.textContent = '鍔犺浇澶辫触';
            }
        }

        /**
         * 鏇存柊缁熻鏁版嵁
         */
        async function updateStats() {
            try {
                const data = await apiGet('/api/history/stats', {
                    onStatusChange: (status) => {
                        if (elements.historyStatus) elements.historyStatus.textContent = status;
                    }
                });
                if (!data) return;
                if (elements.statsToday) {
                    elements.statsToday.textContent = `今日裁决: ${data.today_count || 0} 次`;
                }
                if (elements.statsTop) {
                    const label = data.top_category ? (categoryMap[data.top_category] || data.top_category) : '—';
                    const pct = data.top_pct ? ` (${data.top_pct}%)` : '';
                    elements.statsTop.textContent = `最常出现: ${label}${pct}`;
                }
            } catch (err) {
                console.error('鏇存柊缁熻澶辫触:', err);
            }
        }

        /**
         * 鏇存柊鎵€鏈夐潰鏉?
         */
        async function updatePanels() {
            await updateHistory();
            await updateStats();
        }

        // 最近抽过的规则 ID 缓存：网络请求放后台刷，点击时不等它
        let recentIdsCache = [];
        let recentIdsLoaded = false;
        let recentIdsInflight = null;
        async function fetchRecentIds() {
            try {
                const data = await apiGet('/api/history/recent?limit=10');
                if (data && data.ids) {
                    recentIdsCache = data.ids;
                    recentIdsLoaded = true;
                }
            } catch (err) {
                console.error('获取最近ID失败:', err);
            }
            recentIdsInflight = null;
        }
        function refreshRecentIds() {
            if (!recentIdsInflight) recentIdsInflight = fetchRecentIds();
            return recentIdsInflight;
        }
        function getRecentIds() {
            return recentIdsCache;
        }

        /**
         * 鑾峰彇褰撳墠鎶藉彇姹?
         */
        function getDrawPool() {
            if (state.drawCategory === 'all') return store.allRules;
            return store.allRules.filter(r => r.category === state.drawCategory);
        }

        /**
         * 鍗曟潯鎶藉彇锛堝甫鍘婚噸锛?
         */
        async function pickOneWithDedup() {
            const pool = getDrawPool();
            if (!pool.length) return null;
            try {
                const recentIds = getRecentIds();
                const filtered = pool.filter(r => !recentIds.includes(r.id));
                const pickPool = filtered.length ? filtered : pool;
                return pickRandom(pickPool);
            } catch (err) {
                console.error('鎶藉彇澶辫触:', err);
                return pickRandom(pool);
            }
        }

        /**
         * 鍙岄噸鎶藉彇锛堝甫鍘婚噸锛?
         * 淇锛氫娇鐢ㄦ洿鍙潬鐨勭畻娉曠‘淇濅袱涓笉鍚岀殑绱㈠紩
         */
        async function pickTwoWithDedup() {
            const pool = getDrawPool();
            if (pool.length < 2) return null;
            try {
                const recentIds = getRecentIds();
                const filtered = pool.filter(r => !recentIds.includes(r.id));
                const pickPool = filtered.length >= 2 ? filtered : pool;
                
                // 淇锛氫娇鐢‵isher-Yates娲楃墝绠楁硶鍙栧墠涓や釜锛岀‘淇濅笉閲嶅
                const shuffled = [...pickPool];
                for (let i = shuffled.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                }
                return [shuffled[0], shuffled[1]];
            } catch (err) {
                console.error('鍙岄噸鎶藉彇澶辫触:', err);
                // 闄嶇骇鏂规锛氱畝鍗曢殢鏈哄彇涓や釜
                if (pool.length >= 2) {
                    const firstIndex = Math.floor(Math.random() * pool.length);
                    let secondIndex = Math.floor(Math.random() * (pool.length - 1));
                    if (secondIndex >= firstIndex) {
                        secondIndex += 1;
                    }
                    return [pool[firstIndex], pool[secondIndex]];
                }
                return null;
            }
        }

        /**
         * 娓叉煋瑙勫垯鍒楄〃
         */
        function renderList() {
            const rules = store.getRules();
            if (rules.length === 0) {
                elements.listContainer.innerHTML = '<div style="padding:10px; color:#666;">鏆傛棤瑙勫垯</div>';
                if (elements.rulesStats) {
                    elements.rulesStats.textContent = `${getCategoryLabel(store.currentCategory)} · 0 条规则`;
                }
                if (window.__resizeFrame) window.__resizeFrame();
                return;
            }

            elements.listContainer.innerHTML = rules.map((rule, idx) => `
                <div class="rule-card">
                    <span class="rule-card-index">#${idx + 1}</span>
                    <div class="rule-card-content">${rule.content}</div>
                    <span class="rule-card-id">${rule.id}</span>
                </div>
            `).join('');

            if (elements.rulesStats) {
                elements.rulesStats.textContent = `${getCategoryLabel(store.currentCategory)} · ${rules.length} 条规则`;
            }
            if (window.__resizeFrame) window.__resizeFrame();
        }

        /**
         * 璁剧疆鍒楄〃鍒嗙被
         */
        function setListCategory(cat) {
            store.setCategory(cat);
            elements.filterBtns.forEach(b => {
                b.classList.toggle('active', b.dataset.cat === cat);
            });
            renderList();
        }

        /**
         * 璁剧疆鎶藉彇鍒嗙被
         */
        function setDrawCategory(cat) {
            state.drawCategory = cat;
            // 直接用映射表取标签，不查 DOM——DOM 里根本没有 .category-option，
            // 旧实现会拿到空字符串，快速点击时 dropdown 关闭流程会把显示值盖回旧值
            if (elements.categoryValue) {
                elements.categoryValue.textContent = categoryMap[cat] || cat;
            }
            if (elements.categoryItems && elements.categoryItems.length) {
                elements.categoryItems.forEach(item => {
                    item.classList.toggle('active', item.dataset.value === cat);
                });
            }
        }

        /**
         * 璁剧疆鎸夐挳蹇欑鐘舵€?
         */
        function setBusy(busy) {
            setButtonsBusy(busy, elements.allButtons);
            if (elements.categoryTrigger) {
                elements.categoryTrigger.disabled = busy;
                elements.categoryTrigger.classList.toggle('is-busy', busy);
            }
            elements.filterBtns.forEach(btn => {
                btn.disabled = busy;
                btn.classList.toggle('is-busy', busy);
            });
        }

        // 浜嬩欢缁戝畾
        elements.filterBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                setListCategory(e.target.dataset.cat);
            });
        });


        if (elements.categoryItems && elements.categoryItems.length) {
            elements.categoryItems.forEach(item => {
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    setDrawCategory(item.dataset.value);
                    closeDropdown();
                });
            });
        }

        // 关闭菜单时加一道保险：关闭后的 300ms 内，落在菜单旧位置上的点击一律吞掉，
        // 否则淡出动画期间的误触会点到下面的"执行裁决"。
        let dropdownGuardUntil = 0;
        function closeDropdown() {
            if (!elements.categoryDropdown || !elements.categoryDropdown.classList.contains('open')) return;
            elements.categoryDropdown.classList.remove('open');
            dropdownGuardUntil = Date.now() + 300;
        }

        document.addEventListener('click', (e) => {
            if (elements.categoryDropdown && !elements.categoryDropdown.contains(e.target)) {
                closeDropdown();
            }
        }, true);

        document.addEventListener('click', (e) => {
            if (Date.now() < dropdownGuardUntil && elements.categoryDropdown &&
                !elements.categoryDropdown.contains(e.target) &&
                elements.btnDraw && elements.btnDraw.contains(e.target)) {
                e.stopPropagation();
                e.preventDefault();
            }
        }, true);

        if (elements.categoryTrigger && elements.categoryDropdown) {
            elements.categoryTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                if (elements.categoryDropdown.classList.contains('open')) {
                    closeDropdown();
                } else {
                    elements.categoryDropdown.classList.add('open');
                }
            });
        }

        document.querySelectorAll('.btn-draw, .filter-btn, .category-dropdown-trigger').forEach(attachRipple);

        // 鎵ц瑁佸喅鎸夐挳
        if (elements.btnDraw) {
            elements.btnDraw.addEventListener('click', async (e) => {
                try {
                    if (!canDrawNow()) return;
                    const result = await pickOneWithDedup();
                    if (!result) {
                        showError('褰撳墠鍒嗙被涓嬫病鏈夎鍒欙紒');
                        return;
                    }

                    const isDrawingRef = { value: state.isDrawing };
                    const ran = await runDrawSequence(
                        `Protocol: ${result.category.toUpperCase()} // ${result.id}`,
                        result.content,
                        getDrawPool(),
                        elements,
                        {
                            isDrawingRef,
                            setButtonsBusy: setBusy,
                            delay
                        }
                    );

                    if (!ran) return;
                    state.isDrawing = isDrawingRef.value;
                    recordDraw();

                    const addRes = await apiPost('/api/history/add', result, {
                        onStatusChange: (status) => {
                            if (elements.historyStatus) elements.historyStatus.textContent = status;
                        }
                    });

                    if (addRes && addRes.item && addRes.item.id) {
                        state.lastDrawIds = [addRes.item.id];
                    } else {
                        const latest = await apiGet('/api/history/list?limit=1');
                        state.lastDrawIds = (latest && latest.items && latest.items[0] && latest.items[0].id)
                            ? [latest.items[0].id]
                            : [];
                    }

                    refreshRecentIds();
                    await updatePanels();
                    triggerGlow(e.currentTarget);
                    triggerSuccess(e.currentTarget);
                    showSuccess('裁决已记录');
                } catch (err) {
                    console.error('鎵ц瑁佸喅澶辫触:', err);
                    showError('鎵ц瑁佸喅澶辫触锛岃閲嶈瘯');
                    setBusy(false);
                    state.isDrawing = false;
                }
            });
        }

        // 鍙岄噸瑁佸喅鎸夐挳
        if (elements.btnDraw2) {
            elements.btnDraw2.addEventListener('click', async (e) => {
                try {
                    if (!canDrawNow()) return;
                    const picks = await pickTwoWithDedup();
                    if (!picks) {
                        showError('当前分类规则不足两条！');
                        return;
                    }

                    const [a, b] = picks;
                    const isDrawingRef = { value: state.isDrawing };
                    const ran = await runDrawSequence(
                        `Protocol: ${a.category.toUpperCase()} // ${a.id} + ${b.id}`,
                        `${a.content} + ${b.content}`,
                        getDrawPool(),
                        elements,
                        {
                            isDrawingRef,
                            setButtonsBusy: setBusy,
                            delay
                        }
                    );

                    if (!ran) return;
                    state.isDrawing = isDrawingRef.value;
                    recordDraw();

                    const addA = await apiPost('/api/history/add', a, {
                        onStatusChange: (status) => {
                            if (elements.historyStatus) elements.historyStatus.textContent = status;
                        }
                    });
                    const addB = await apiPost('/api/history/add', b, {
                        onStatusChange: (status) => {
                            if (elements.historyStatus) elements.historyStatus.textContent = status;
                        }
                    });

                    state.lastDrawIds = [];
                    if (addA && addA.item && addA.item.id) state.lastDrawIds.push(addA.item.id);
                    if (addB && addB.item && addB.item.id) state.lastDrawIds.push(addB.item.id);

                    if (!state.lastDrawIds.length) {
                        const latest = await apiGet('/api/history/list?limit=2');
                        if (latest && latest.items) {
                            state.lastDrawIds = latest.items.map(i => i.id).filter(Boolean);
                        }
                    }

                    refreshRecentIds();
                    await updatePanels();
                    triggerGlow(e.currentTarget);
                    triggerSuccess(e.currentTarget);
                    showSuccess('双重裁决已记录');
                } catch (err) {
                    console.error('鍙岄噸瑁佸喅澶辫触:', err);
                    showError('鍙岄噸瑁佸喅澶辫触锛岃閲嶈瘯');
                    setBusy(false);
                    state.isDrawing = false;
                }
            });
        }

        // 澶嶅埗鎸夐挳
        if (elements.btnCopy) {
            elements.btnCopy.addEventListener('click', async (e) => {
                try {
                    const text = elements.resultTextEl?.innerText || '';
                    if (!text) {
                        showError('娌℃湁鍙鍒剁殑鍐呭');
                        return;
                    }
                    await navigator.clipboard.writeText(text);
                    triggerGlow(e.currentTarget);
                    triggerSuccess(e.currentTarget);
                    showSuccess('已复制到剪贴板');
                } catch (err) {
                    console.error('澶嶅埗澶辫触:', err);
                    showError('澶嶅埗澶辫触锛岃鎵嬪姩澶嶅埗');
                }
            });
        }

        // 鎾ら攢鎸夐挳
        if (elements.btnUndo) {
            elements.btnUndo.addEventListener('click', async (e) => {
                try {
                    if (!canUndoNow()) return;
                    if (!state.lastDrawIds.length) {
                        showError('暂无可撤销的本次裁决');
                        return;
                    }

                    const res = await apiPost('/api/history/undo', { ids: state.lastDrawIds }, {
                        onStatusChange: (status) => {
                            if (elements.historyStatus) elements.historyStatus.textContent = status;
                        }
                    });

                    if (!res || !res.ok) {
                        showError('鎾ら攢澶辫触锛岃閲嶈瘯');
                        return;
                    }

                    recordUndo();
                    state.lastDrawIds = [];
                    await updatePanels();

                    const latest = await apiGet('/api/history/list?limit=1');
                    if (latest && latest.items && latest.items.length) {
                        const item = latest.items[0];
                        elements.categoryLabel.innerText = `Protocol: ${item.category.toUpperCase()} // ${item.rule_id}`;
                        revealText(elements.resultTextEl, item.content, elements.resultStage);
                    } else {
                        elements.categoryLabel.innerText = 'SYSTEM READY';
                        revealText(elements.resultTextEl, '绛夊緟鎸囦护', elements.resultStage);
                    }

                    triggerGlow(e.currentTarget);
                    triggerSuccess(e.currentTarget);
                    showSuccess('已撤销本次裁决');
                } catch (err) {
                    console.error('鎾ら攢澶辫触:', err);
                    showError('鎾ら攢澶辫触锛岃閲嶈瘯');
                }
            });
        }

        // 鍒濆鍖?
        console.log('[Init] 寮€濮嬭缃垵濮嬬姸鎬?..');
        setDrawCategory('all');
        loadCooldown();
        refreshRecentIds();
        setListCategory('all');
        console.log('[Init] 鍒濆鐘舵€佽缃畬鎴愶紝寮€濮嬫覆鏌撳垪琛?..');
        renderList(); // 鐩存帴璋冪敤娓叉煋锛屼笉绛夊緟API
        console.log('[Init] 鍒楄〃娓叉煋瀹屾垚锛屽紑濮嬫洿鏂伴潰鏉?..');
        await updatePanels();
        console.log('[Init] 闈㈡澘鏇存柊瀹屾垚');

        setTimeout(() => {
            spawnDataStream(elements.resultStage, store);
        }, 500);

    } catch (err) {
        console.error('[Init] 鍒濆鍖栧け璐?', err);
    }
}

// 鍚姩搴旂敤 - 妫€鏌OM鏄惁宸插姞杞?
console.log('[Init] 鑴氭湰鍔犺浇锛孌OM鐘舵€?', document.readyState);
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    // DOM宸插姞杞斤紝鐩存帴鎵ц
    initApp();
}


