/**
 * 工具函数集合
 */

import { categoryMap } from './config.js';

/**
 * 延迟函数
 */
export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 从数组中随机选取一个元素
 */
export function pickRandom(pool) {
    return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * 获取分类标签文本
 */
export function getCategoryLabel(cat) {
    const label = document.querySelector(`.category-option[data-value="${cat}"]`);
    return label ? label.textContent : (categoryMap[cat] || cat);
}

/**
 * 格式化相对时间
 */
export function formatTimeAgo(ts) {
    const time = new Date(ts);
    const diff = Date.now() - time.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins}分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    return `${days}天前`;
}

/**
 * 解析 URL 查询参数
 */
export function parseQuery(path) {
    const query = path.split('?')[1] || '';
    return new URLSearchParams(query);
}

/**
 * 显示错误提示（替代 alert）
 */
export function showError(message, duration = 3000) {
    const existing = document.querySelector('.error-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'error-toast';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(255, 70, 85, 0.95);
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 14px;
        z-index: 10000;
        animation: slideDown 0.3s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideUp 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

/**
 * 显示成功提示
 */
export function showSuccess(message, duration = 2000) {
    const existing = document.querySelector('.success-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'success-toast';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(46, 204, 113, 0.95);
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 14px;
        z-index: 10000;
        animation: slideDown 0.3s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideUp 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

/**
 * 按钮状态管理
 */
export function setButtonsBusy(busy, buttons) {
    buttons.forEach(btn => {
        if (!btn) return;
        btn.disabled = busy;
        btn.classList.toggle('is-busy', busy);
    });
}

/**
 * 触发元素发光效果
 */
export function triggerGlow(el) {
    if (!el || !el.classList) return;
    el.classList.remove('glow');
    void el.offsetWidth;
    el.classList.add('glow');
}

/**
 * 触发按钮成功动画
 */
export function triggerSuccess(el) {
    if (!el || !el.classList) return;
    el.classList.remove('btn-success');
    void el.offsetWidth;
    el.classList.add('btn-success');
}

/**
 * 添加按钮波纹效果
 */
export function attachRipple(el) {
    if (!el) return;
    el.addEventListener('click', (ev) => {
        const rect = el.getBoundingClientRect();
        const ripple = document.createElement('span');
        ripple.className = 'ripple';
        const size = Math.max(rect.width, rect.height);
        ripple.style.width = ripple.style.height = `${size}px`;
        ripple.style.left = `${ev.clientX - rect.left - size / 2}px`;
        ripple.style.top = `${ev.clientY - rect.top - size / 2}px`;
        el.appendChild(ripple);
        setTimeout(() => ripple.remove(), 700);
    });
}
