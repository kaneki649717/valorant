export class GlitchText {
    constructor(element) {
        this.el = element;
        this.chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@$%&*+=-<>';
        this._timers = [];
    }

    _clearTimers() {
        if (!this._timers || !this._timers.length) return;
        this._timers.forEach(t => clearTimeout(t));
        this._timers = [];
    }

    _randomChar() {
        return this.chars[Math.floor(Math.random() * this.chars.length)];
    }

    animateTo(finalText, options = {}) {
        if (!this.el) return;

        const {
            mode = 'default',
            duration = 1000,
            interval = 40,
            intensity = 0.7,
            onProgress,
            onComplete,
            sound = true
        } = options;

        this._clearTimers();

        if (typeof lowPerf !== 'undefined' && lowPerf) {
            this.el.textContent = finalText;
            if (onComplete) onComplete();
            return;
        }

        const chars = Array.from(finalText || '');
        const total = chars.length;
        let done = 0;

        this.el.classList.add('glitching');
        this.el.textContent = '';

        if (sound && typeof playTone === 'function') {
            playTone(480, 0.06, 'square', 0.03);
        }

        const spans = chars.map(() => {
            const span = document.createElement('span');
            span.className = 'glitch-char';
            span.textContent = '';
            this.el.appendChild(span);
            return span;
        });

        const baseInterval = Math.max(20, interval);
        let baseDuration = duration;
        if (mode === 'fast') baseDuration = Math.max(280, Math.floor(duration * 0.5));

        const finalize = (span, char) => {
            span.textContent = char;
            span.classList.add('decoded', 'final');
            done += 1;
            if (onProgress) onProgress(done / Math.max(1, total));
            if (done >= total) {
                const endTimer = setTimeout(() => {
                    if (this.el) this.el.classList.remove('glitching');
                    if (sound && typeof playTone === 'function') {
                        playTone(240, 0.08, 'sine', 0.04);
                    }
                    if (onComplete) onComplete();
                }, 120);
                this._timers.push(endTimer);
            }
        };

        spans.forEach((span, i) => {
            const char = chars[i];
            const startDelay = mode === 'sequential'
                ? i * Math.max(24, baseInterval)
                : Math.floor(Math.random() * 60);

            const startTimer = setTimeout(() => {
                if (char === ' ') {
                    finalize(span, ' ');
                    return;
                }
                let elapsed = 0;
                const tick = setInterval(() => {
                    elapsed += baseInterval;
                    if (elapsed >= baseDuration) {
                        clearInterval(tick);
                        finalize(span, char);
                        return;
                    }
                    span.textContent = Math.random() > intensity ? char : this._randomChar();
                }, baseInterval);
                this._timers.push(tick);
            }, startDelay);
            this._timers.push(startTimer);
        });
    }
}
