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

// 系统主动要求减少动效、或设备确实弱，才一开始就降级。
// 开机后第一次打开浏览器的卡顿不能算数，交给 probePerformance 现场判断，而且允许恢复。
export let lowPerf = !!(lowDevice || prefersReducedMotion);

let perfFlagged = false;

function applyPerfClass() {
    if (document.documentElement) {
        document.documentElement.classList.toggle('low-perf', lowPerf);
    }
    if (lowPerf) {
        const ds = document.querySelector('.datastream-layer');
        if (ds) ds.remove();
    }
}

// 连续采样若干帧，返回帧间隔的中位数和 p90。
// 前 6 帧直接丢掉：页面刚挂载时第一帧可能卡几百毫秒，不能拿它当“机器很慢”的证据。
function sampleFrames(frames = 48) {
    return new Promise((resolve) => {
        const deltas = [];
        let prev = 0;
        let count = 0;

        function tick(now) {
            if (prev) deltas.push(now - prev);
            prev = now;
            count += 1;
            if (count <= frames) {
                requestAnimationFrame(tick);
                return;
            }
            const clean = deltas.slice(6).sort((a, b) => a - b);
            if (!clean.length) {
                resolve({ median: 16.7, p90: 16.7 });
                return;
            }
            resolve({
                median: clean[Math.floor(clean.length * 0.5)],
                p90: clean[Math.min(clean.length - 1, Math.floor(clean.length * 0.9))],
            });
        }

        requestAnimationFrame(tick);
    });
}

function looksSlow(sample) {
    // 中位数 > 30ms 表示长期低于 33fps；或中位数一般但尾巴拖得很长。
    return sample.median > 30 || (sample.median > 24 && sample.p90 > 55);
}

// 运行时性能探测：两段采样都慢才降级；降级后 8 秒还会再测一次，恢复就自动解除。
export async function probePerformance() {
    applyPerfClass();

    if (prefersReducedMotion || lowDevice) return lowPerf;

    // 等首屏布局稳定，别在资源还在加载时测
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (document.hidden) return lowPerf;

    if (!looksSlow(await sampleFrames(48))) {
        return lowPerf;
    }

    // 冷启动前一秒本来就卡，隔两秒再测一次，两次都慢才真正降级。
    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (document.hidden) return lowPerf;

    if (looksSlow(await sampleFrames(48))) {
        lowPerf = true;
        perfFlagged = true;
        applyPerfClass();

        setTimeout(async () => {
            if (!perfFlagged || document.hidden) return;
            if (!looksSlow(await sampleFrames(40))) {
                lowPerf = false;
                perfFlagged = false;
                applyPerfClass();
                window.dispatchEvent(new Event('perf:ok'));
            }
        }, 8000);

        return lowPerf;
    }

    if (perfFlagged) {
        lowPerf = false;
        perfFlagged = false;
        applyPerfClass();
        window.dispatchEvent(new Event('perf:ok'));
    }
    return lowPerf;
}

