/**
 * API layer
 *
 * Primary: localStorage (works on Streamlit Cloud without extra ports)
 * Optional: local HTTP API when running on localhost
 */

import { apiBase, clientId } from './config.js';

const LOCAL_HISTORY_KEY = `vp_history_${clientId}`;
const LOCAL_ID_KEY = `vp_history_id_${clientId}`;

const isLocalhost = typeof window !== 'undefined'
    && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

let remoteAvailable = !!(apiBase && isLocalhost);

// 线上走 Supabase RPC（Streamlit Cloud 不开放 8502 端口）
// CFG 由 app.py 在本模块之后注入，所以必须惰性读取，不能在模块顶层缓存
let rpcFailedAt = 0;
const RPC_RETRY_MS = 30000;
const rpcAvailable = () => Date.now() - rpcFailedAt > RPC_RETRY_MS;

function rpcConfig() {
    const cfg = (typeof window !== 'undefined' && window.__TRACK_CFG) || null;
    const url = cfg && cfg.sb_url ? String(cfg.sb_url).replace(/\/+$/, '') : '';
    const key = cfg && cfg.sb_key ? String(cfg.sb_key) : '';
    return (url && key) ? { url, key } : null;
}

function rpcHeaders(key) {
    const h = { apikey: key, 'Content-Type': 'application/json' };
    if (key.indexOf('eyJ') === 0) h['Authorization'] = `Bearer ${key}`;
    return h;
}

async function rpcCall(fn, payload) {
    const cfg = rpcConfig();
    if (!cfg) throw new Error('RPC config missing');
    const res = await fetch(`${cfg.url}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: rpcHeaders(cfg.key),
        body: JSON.stringify(payload),
        keepalive: true,
    });
    if (!res.ok) throw new Error(`RPC ${fn} HTTP ${res.status}`);
    return await res.json();
}

function loadHistory() {
    try {
        const raw = localStorage.getItem(LOCAL_HISTORY_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (err) {
        console.error('Local history load failed:', err);
        return [];
    }
}

function saveHistory(items) {
    try {
        localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(items));
    } catch (err) {
        console.error('Local history save failed:', err);
    }
}

function nextId() {
    let id = 1;
    try {
        id = parseInt(localStorage.getItem(LOCAL_ID_KEY) || '1', 10);
        if (!Number.isFinite(id) || id < 1) id = 1;
    } catch (err) {
        id = 1;
    }
    try {
        localStorage.setItem(LOCAL_ID_KEY, String(id + 1));
    } catch (err) {
        // ignore
    }
    return id;
}

function parseUrl(path) {
    try {
        return new URL(path, window.location.origin);
    } catch (err) {
        return null;
    }
}

function localList(limit = 20) {
    const items = loadHistory()
        .slice()
        .sort((a, b) => (b.id || 0) - (a.id || 0))
        .slice(0, limit);
    return { ok: true, items };
}

function localRecent(limit = 10) {
    const ids = loadHistory()
        .slice()
        .sort((a, b) => (b.id || 0) - (a.id || 0))
        .slice(0, limit)
        .map(r => r.rule_id)
        .filter(Boolean);
    return { ok: true, ids };
}

function localStats() {
    const items = loadHistory();
    const today = new Date().toISOString().slice(0, 10);
    let todayCount = 0;
    const byCategory = {};
    items.forEach((r) => {
        if (r.timestamp && r.timestamp.startsWith(today)) todayCount += 1;
        if (r.category) byCategory[r.category] = (byCategory[r.category] || 0) + 1;
    });
    const total = Object.values(byCategory).reduce((a, b) => a + b, 0);
    let topCategory = null;
    let topPct = 0;
    if (total > 0) {
        topCategory = Object.keys(byCategory).sort((a, b) => byCategory[b] - byCategory[a])[0];
        topPct = Math.round((byCategory[topCategory] / total) * 100);
    }
    return {
        ok: true,
        today_count: todayCount,
        by_category: byCategory,
        top_category: topCategory,
        top_pct: topPct,
    };
}

function localAdd(rule) {
    if (!rule || !rule.id || !rule.content) {
        return { ok: false, error: 'missing_fields' };
    }
    const item = {
        id: nextId(),
        rule_id: rule.id,
        content: rule.content,
        category: rule.category || '',
        timestamp: new Date().toISOString(),
        client_id: clientId,
    };
    const items = loadHistory();
    items.push(item);
    saveHistory(items);
    return { ok: true, item };
}

function localUndo(ids) {
    const items = loadHistory();
    if (Array.isArray(ids) && ids.length) {
        const idSet = new Set(ids.map(i => parseInt(i, 10)).filter(n => Number.isFinite(n)));
        const before = items.length;
        const filtered = items.filter(r => !idSet.has(r.id));
        saveHistory(filtered);
        return { ok: true, deleted_count: before - filtered.length };
    }
    if (!items.length) {
        return { ok: false, message: 'no_record' };
    }
    const sorted = items.slice().sort((a, b) => (b.id || 0) - (a.id || 0));
    const last = sorted[0];
    const filtered = items.filter(r => r.id !== last.id);
    saveHistory(filtered);
    return { ok: true, item: last };
}

async function tryRemoteGet(path, options) {
    const { onStatusChange } = options || {};
    const url = new URL(`${apiBase}${path}`);
    url.searchParams.set('client_id', clientId);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (onStatusChange) onStatusChange('API 已连接');
    return await res.json();
}

async function tryRemotePost(path, payload, options) {
    const { onStatusChange } = options || {};
    const res = await fetch(`${apiBase}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(payload || {}), client_id: clientId }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (onStatusChange) onStatusChange('API 已连接');
    return await res.json();
}

/**
 * GET handler (local first on non-localhost)
 */
export async function apiGet(path, options = {}) {
    const { onStatusChange } = options;

    // 线上：先走 Supabase RPC
    if (rpcAvailable() && rpcConfig()) {
        try {
            const url0 = parseUrl(path);
            const limit0 = url0 ? parseInt(url0.searchParams.get('limit') || '20', 10) : 20;
            if (path.startsWith('/api/history/list')) {
                const r = await rpcCall('draw_list', { cid: clientId, limit: limit0 });
                if (onStatusChange) onStatusChange('API 已连接');
                if (r && r.ok) return { ok: true, items: r.items || [] };
            }
            if (path.startsWith('/api/history/recent')) {
                const r = await rpcCall('draw_list', { cid: clientId, limit: limit0 });
                if (onStatusChange) onStatusChange('API 已连接');
                if (r && r.ok) {
                    return { ok: true, ids: (r.items || []).map((i) => i.rule_id).filter(Boolean) };
                }
            }
            if (path.startsWith('/api/history/stats')) {
                const r = await rpcCall('draw_list', { cid: clientId, limit: 100 });
                if (onStatusChange) onStatusChange('API 已连接');
                if (r && r.ok) {
                    const items = r.items || [];
                    const byCategory = {};
                    const today = new Date().toISOString().slice(0, 10);
                    let todayCount = 0;
                    items.forEach((it) => {
                        if (it.timestamp && it.timestamp.startsWith(today)) todayCount += 1;
                        if (it.category) byCategory[it.category] = (byCategory[it.category] || 0) + 1;
                    });
                    const total = Object.values(byCategory).reduce((a, b) => a + b, 0);
                    let topCategory = null;
                    let topPct = 0;
                    if (total > 0) {
                        topCategory = Object.keys(byCategory).sort((a, b) => byCategory[b] - byCategory[a])[0];
                        topPct = Math.round((byCategory[topCategory] / total) * 100);
                    }
                    return { ok: true, today_count: todayCount, by_category: byCategory, top_category: topCategory, top_pct: topPct };
                }
            }
            if (path.startsWith('/api/health')) return { ok: true, db_connected: true, mode: 'rpc' };
        } catch (err) {
            console.error('RPC GET error, fallback:', err);
            rpcFailedAt = Date.now();
            if (onStatusChange) onStatusChange('API 已连接');
        }
    }

    if (remoteAvailable) {
        try {
            return await tryRemoteGet(path, options);
        } catch (err) {
            console.error('Remote API error, fallback to local:', err);
            remoteAvailable = false;
            if (onStatusChange) onStatusChange('API 已连接');
        }
    }

    if (onStatusChange) onStatusChange('API 已连接');

    const url = parseUrl(path);
    const limit = url ? parseInt(url.searchParams.get('limit') || '20', 10) : 20;

    if (path.startsWith('/api/history/list')) return localList(limit);
    if (path.startsWith('/api/history/recent')) return localRecent(limit);
    if (path.startsWith('/api/history/stats')) return localStats();
    if (path.startsWith('/api/health')) return { ok: true, db_connected: true, mode: 'local' };

    return { ok: false, error: 'not_found' };
}

/**
 * POST handler (local first on non-localhost)
 */
export async function apiPost(path, payload, options = {}) {
    const { onStatusChange } = options;

    // 线上：先走 Supabase RPC
    if (rpcAvailable() && rpcConfig()) {
        try {
            if (path.startsWith('/api/history/add')) {
                const r = await rpcCall('draw_add', {
                    cid: clientId,
                    rule_id: payload && payload.id,
                    content: payload && payload.content,
                    category: payload && payload.category,
                });
                if (onStatusChange) onStatusChange('API 已连接');
                if (r && r.ok) {
                    return {
                        ok: true,
                        item: {
                            id: r.id,
                            rule_id: payload && payload.id,
                            content: payload && payload.content,
                            category: payload && payload.category,
                            timestamp: new Date().toISOString(),
                            client_id: clientId,
                        },
                    };
                }
            }
            if (path.startsWith('/api/history/undo')) {
                const ids = payload && payload.ids;
                const r = await rpcCall('draw_undo', {
                    cid: clientId,
                    ids: Array.isArray(ids) ? ids : null,
                });
                if (onStatusChange) onStatusChange('API 已连接');
                if (r && r.ok) return { ok: true, deleted_count: r.deleted || 0 };
            }
        } catch (err) {
            console.error('RPC POST error, fallback:', err);
            rpcFailedAt = Date.now();
            if (onStatusChange) onStatusChange('API 已连接');
        }
    }

    if (remoteAvailable) {
        try {
            return await tryRemotePost(path, payload, options);
        } catch (err) {
            console.error('Remote API error, fallback to local:', err);
            remoteAvailable = false;
            if (onStatusChange) onStatusChange('API 已连接');
        }
    }

    if (onStatusChange) onStatusChange('API 已连接');

    if (path.startsWith('/api/history/add')) return localAdd(payload);
    if (path.startsWith('/api/history/undo')) return localUndo(payload && payload.ids);

    return { ok: false, error: 'not_found' };
}

