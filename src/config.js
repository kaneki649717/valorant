/**
 * 全局配置和常量
 */

// 分类映射
export const categoryMap = {
    all: '全部',
    tactical: '战术',
    weaponry: '器械',
    social: '社交',
    contract: '契约',
};

// API 配置 - 仅从后端获取API_BASE
export const apiBase = window.API_BASE || '';

// 客户端 ID 管理 - 使用更安全的随机生成方式
const clientIdKey = 'vp_client_id';

function generateSecureClientId() {
    // 使用 crypto.getRandomValues 替代 Math.random
    const array = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(array);
    } else {
        // 降级方案：使用Date.now和Math.random的组合（不适用于安全场景，仅用于标识符）
        for (let i = 0; i < 16; i++) {
            array[i] = Math.floor(Math.random() * 256);
        }
    }
    const hex = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    return `cid_${Date.now()}_${hex}`;
}

export let clientId = localStorage.getItem(clientIdKey);
if (!clientId) {
    clientId = generateSecureClientId();
    localStorage.setItem(clientIdKey, clientId);
}

// 性能检测
export const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const lowDevice = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)
    || (navigator.deviceMemory && navigator.deviceMemory <= 4);
export let lowPerf = !!lowDevice;

// 运行时性能探测
export function probePerformance() {
    if (document.documentElement) {
        document.documentElement.classList.toggle('low-perf', lowPerf);
    }

    return new Promise((resolve) => {
        let frames = 0;
        let start = performance.now();

        function tick(now) {
            frames += 1;
            if (frames < 30) {
                requestAnimationFrame(tick);
                return;
            }
            const avg = (now - start) / frames;
            if (avg > 20) {
                lowPerf = true;
                if (document.documentElement) {
                    document.documentElement.classList.add('low-perf');
                }
                const ds = document.querySelector('.datastream-layer');
                if (ds) ds.remove();
            }
            resolve(lowPerf);
        }
        requestAnimationFrame(tick);
    });
}

