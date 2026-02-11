/**
 * 视觉效果和动画
 */

import { lowPerf } from './config.js';

// 音频上下文
let audioCtx = null;

// 乱码字符集
const GLYPH_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@$%&*+=-<>';

/**
 * 播放音效
 */
export function playTone(freq = 420, duration = 0.08, type = 'sine', gainValue = 0.05) {
    if (lowPerf) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = gainValue;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.stop(audioCtx.currentTime + duration);
}

/**
 * 生成粒子效果
 */
export function spawnParticles(particleLayer, count = 16) {
    if (!particleLayer) return;
    const finalCount = lowPerf ? Math.max(6, Math.floor(count * 0.4)) : count;
    for (let i = 0; i < finalCount; i++) {
        const p = document.createElement('span');
        p.className = 'particle';
        const angle = Math.random() * Math.PI * 2;
        const radius = 80 + Math.random() * 120;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        p.style.setProperty('--x', `${x}px`);
        p.style.setProperty('--y', `${y}px`);
        p.style.setProperty('--d', `${600 + Math.random() * 600}ms`);
        p.style.setProperty('--s', `${4 + Math.random() * 6}px`);
        particleLayer.appendChild(p);
        setTimeout(() => p.remove(), 1200);
    }
}

/**
 * 生成随机乱码字符
 */
function getRandomGlyph() {
    return GLYPH_CHARSET[Math.floor(Math.random() * GLYPH_CHARSET.length)];
}

/**
 * 生成字符风暴效果（已禁用）
 */
export function spawnGlyphStorm(particleLayer, duration = 700, count = 64) {
    if (!particleLayer) return;
    const finalCount = lowPerf ? Math.max(10, Math.floor(count * 0.35)) : count;
    const finalDuration = lowPerf ? Math.max(420, Math.floor(duration * 0.7)) : duration;

    for (let i = 0; i < finalCount; i++) {
        const p = document.createElement('span');
        p.className = 'glyph-particle';
        p.textContent = getRandomGlyph();
        const angle = Math.random() * Math.PI * 2;
        const radius = 40 + Math.random() * 160;
        const endX = Math.cos(angle) * radius;
        const endY = Math.sin(angle) * radius;
        const size = 12 + Math.random() * 14;
        const hue = 190 + Math.random() * 70;
        const delay = Math.random() * 120;
        const opacity = 0.55 + Math.random() * 0.35;

        p.style.setProperty('--end-x', `${endX}px`);
        p.style.setProperty('--end-y', `${endY}px`);
        p.style.setProperty('--size', `${size}px`);
        p.style.setProperty('--hue', `${hue}`);
        p.style.setProperty('--duration', `${finalDuration + Math.random() * 220}ms`);
        p.style.setProperty('--delay', `${delay}ms`);
        p.style.setProperty('--opacity', `${opacity}`);

        particleLayer.appendChild(p);
        const lifetime = finalDuration + 300;
        setTimeout(() => p.remove(), lifetime);
    }
}

/**
 * 文字逐字揭示效果
 */
export function revealText(resultTextEl, finalText, resultStage, options = {}) {
    if (!resultTextEl) return;

    const {
        duration = 900,
        interval = 40,
        intensity = 0.75,
        waveDelay = 28
    } = options;

    if (resultTextEl._revealTimers && resultTextEl._revealTimers.length) {
        resultTextEl._revealTimers.forEach(t => clearTimeout(t));
    }
    if (resultTextEl._revealIntervals && resultTextEl._revealIntervals.length) {
        resultTextEl._revealIntervals.forEach(t => clearInterval(t));
    }
    resultTextEl._revealTimers = [];
    resultTextEl._revealIntervals = [];

    const chars = Array.from(finalText || '');
    const total = chars.length;
    let done = 0;

    resultTextEl.classList.remove('glitching');
    resultTextEl.classList.add('decoding');
    if (resultStage) resultStage.classList.add('grid-breath');
    resultTextEl.textContent = '';

    const spans = chars.map(() => {
        const span = document.createElement('span');
        span.className = 'decode-char';
        span.textContent = '';
        resultTextEl.appendChild(span);
        return span;
    });

    if (lowPerf) {
        spans.forEach((span, i) => {
            span.textContent = chars[i];
            span.classList.add('decoded', 'final');
        });
        resultTextEl.classList.remove('decoding');
        if (resultStage) resultStage.classList.remove('grid-breath');
        return;
    }

    const perCharDuration = Math.max(240, Math.floor(duration * 0.7));
    spans.forEach((span, i) => {
        const char = chars[i];
        const delay = i * waveDelay;
        const startTimer = setTimeout(() => {
            if (char === ' ') {
                span.textContent = ' ';
                span.classList.add('decoded', 'final');
                done += 1;
                return;
            }
            let elapsed = 0;
            const tick = setInterval(() => {
                elapsed += interval;
                if (elapsed >= perCharDuration) {
                    clearInterval(tick);
                    span.textContent = char;
                    span.classList.add('decoded', 'final');
                    done += 1;
                    if (done >= total) {
                        const endTimer = setTimeout(() => {
                            if (resultTextEl) resultTextEl.classList.remove('decoding');
                            if (resultStage) resultStage.classList.remove('grid-breath');
                        }, 160);
                        resultTextEl._revealTimers.push(endTimer);
                    }
                    return;
                }
                span.textContent = Math.random() > intensity ? char : getRandomGlyph();
            }, interval);
            resultTextEl._revealIntervals.push(tick);
        }, delay);
        resultTextEl._revealTimers.push(startTimer);
    });
}

/**
 * 生成数据流背景
 */
export function spawnDataStream(resultStage, store) {
    if (!resultStage || lowPerf) return;
    const layer = document.createElement('div');
    layer.className = 'datastream-layer';
    const rules = (store && store.allRules) ? store.allRules.slice(0, 33) : [];
    rules.forEach((rule) => {
        const line = document.createElement('div');
        line.className = 'datastream-line datastream-line-x';
        line.textContent = `${rule.id} ${rule.content}`;
        line.style.top = `${5 + Math.random() * 90}%`;
        line.style.setProperty('--delay', `${Math.random() * 900}ms`);
        line.style.setProperty('--dur', `${5200 + Math.random() * 2200}ms`);
        layer.appendChild(line);
    });
    resultStage.appendChild(layer);
    setTimeout(() => layer.remove(), 9000);
}

/**
 * 抽取序列动画
 */
export async function runDrawSequence(
    label,
    finalText,
    pool,
    elements,
    callbacks
) {
    const {
        resultTextEl,
        resultStage,
        drawOverlay,
        scanLine,
        resultCard,
        particleLayer,
        categoryLabel
    } = elements;

    const { onStart, onEnd, isDrawingRef, setButtonsBusy, delay } = callbacks;

    if (isDrawingRef.value) return false;
    isDrawingRef.value = true;
    setButtonsBusy(true);

    playTone(520, 0.08, 'square', 0.04);

    if (resultStage) resultStage.classList.add('focus-mode');
    if (drawOverlay) {
        drawOverlay.classList.add('active');
        drawOverlay.classList.add('scan-active');
    }

    if (scanLine) {
        scanLine.classList.remove('anim-scan');
        scanLine.style.opacity = '1';
        scanLine.style.top = '-6px';
        void scanLine.offsetWidth;
        scanLine.classList.add('anim-scan');
        setTimeout(() => {
            scanLine.classList.remove('anim-scan');
            scanLine.style.opacity = '0';
            scanLine.style.top = '-6px';
        }, 480);
    }

    const dataLayer = document.querySelector('.datastream-layer');
    if (dataLayer) dataLayer.remove();

    await delay(150);

    if (categoryLabel) categoryLabel.innerText = label;

    // 启动字符风暴效果
    spawnGlyphStorm(particleLayer, 800, 48);

    // 启动文字解码揭示动画
    revealText(resultTextEl, finalText, resultStage);

    if (resultCard) {
        resultCard.classList.remove('result-flash');
        void resultCard.offsetWidth;
        resultCard.classList.add('result-flash');
    }

    // 等待解码动画完成
    await delay(1400);

    if (drawOverlay) {
        drawOverlay.classList.remove('scan-active');
        drawOverlay.classList.remove('active');
    }

    if (resultStage) {
        resultStage.classList.remove('grid-pulse');
        void resultStage.offsetWidth;
        resultStage.classList.add('grid-pulse');
    }

    spawnParticles(particleLayer, 18);
    playTone(220, 0.12, 'sawtooth', 0.05);

    // 提前释放按钮状态，让用户可以更快进行下一次操作
    if (resultStage) resultStage.classList.remove('focus-mode');
    setButtonsBusy(false);
    isDrawingRef.value = false;

    return true;
}
