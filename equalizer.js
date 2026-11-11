/**
 * Высокотехнологичный круговой блочный эквалайзер.
 * Сегментированные пиксельные неоновые дорожки с распределением по местам в ТОПе.
 */

const EQ_BAR_COUNT = 120; // Количество радиальных палочек по кругу

class Equalizer {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.freqData = null;
        this.animationId = null;
        this.active = false;

        // Геометрия холста 300x300 пикселей
        this.centerX = 150;
        this.centerY = 150;
        this.innerRadius = 60;   // Компактный радиус ровно под размер аватарки 90px
        this.outerRadius = 140;  // Ограничение вылета лучей

        this.sectors = [];
        this.totalPoints = 0;
    }

    /**
     * Инициализация контекста отрисовки Canvas
     */
    init(canvasId, audioElement) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.warn('Equalizer: canvas не найден:', canvasId);
            return;
        }
        this.ctx = this.canvas.getContext('2d');
        
        // Разрешение холста под реальные размеры контейнера
        this.canvas.width = 400;
        this.canvas.height = 400;
        this.centerX = 200;
        this.centerY = 200;
        this.innerRadius = 90;   // Четкий внутренний радиус ровно под твою аватарку 90px
        this.outerRadius = 190;  // Максимальный вылет лучей баса, удерживающий их внутри холста


        // Если это ПК-версия стримера и передан плеер, цепляем локальный анализатор
        const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || ('ontouchstart' in window);
        if (!isMobileDevice && audioElement && window.analyser) {
            this.freqData = new Uint8Array(window.analyser.frequencyBinCount);
            console.log('Equalizer: ПК-клиент подключен к локальному window.analyser');
        }

        if (this.sectors.length === 0) {
            this.update([]);
        }

        if (!this.active) {
            this.active = true;
            this.draw();
        }
    }

    /**
     * Обновление секторов и их цветов на основе актуального ТОПа от сервера
     */
    update(scores) {
        const activeScores = (scores || []).filter(s => s.points > 0);
        this.totalPoints = activeScores.reduce((sum, s) => sum + (s.points || 0), 0);
        this.sectors = [];

        let start = 0;
        if (this.totalPoints > 0 && activeScores.length > 0) {
            activeScores.forEach((s) => {
                const sweep = (s.points / this.totalPoints) * 360;
                this.sectors.push({
                    startAngle: start,
                    endAngle: start + sweep,
                    color: s.color || '#ffffff'
                });
                start += sweep;
            });
        } else {
            // Если очков нет — один сплошной белый сектор на 360 градусов
            this.sectors.push({
                startAngle: 0,
                endAngle: 360,
                color: '#ffffff'
            });
        }
    }

    /**
     * Возвращает цвет для конкретного угла луча
     */
    colorForAngle(angleDeg) {
        let a = ((angleDeg % 360) + 360) % 360;
        for (const sector of this.sectors) {
            if (sector.startAngle <= sector.endAngle) {
                if (a >= sector.startAngle && a < sector.endAngle) return sector.color;
            } else {
                if (a >= sector.startAngle || a < sector.endAngle) return sector.color;
            }
        }
        return '#ffffff';
    }

    draw() {
        if (!this.ctx) return;
        this.animationId = requestAnimationFrame(() => this.draw());
        if (!this.active) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);


        // На ПК обновляем частоты из локального анализатора
        if (window.analyser && typeof window.IS_MOBILE !== 'undefined' && !window.IS_MOBILE) {
            if (!this.freqData || this.freqData.length !== window.analyser.frequencyBinCount) {
                this.freqData = new Uint8Array(window.analyser.frequencyBinCount);
            }
            window.analyser.getByteFrequencyData(this.freqData);
        }

        const stepAngle = (2 * Math.PI) / EQ_BAR_COUNT;

        // Рисуем внутренний технологический ободок
        this.ctx.beginPath();
        this.ctx.arc(this.centerX, this.centerY, this.innerRadius - 4, 0, Math.PI * 2);
        this.ctx.strokeStyle = 'rgba(0, 255, 255, 0.15)';
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();

        // Жесткая защита от рассинхрона буферов (256, 512, 1024)
        const dataLength = (this.freqData && this.freqData.length > 0) ? this.freqData.length : 256;

        for (let i = 0; i < EQ_BAR_COUNT; i++) {
            const angle = i * stepAngle - Math.PI / 2; // Старт на 12 часов

            const shiftedIndex = (i + Math.floor(EQ_BAR_COUNT / 2)) % EQ_BAR_COUNT;
            const binIndex = Math.floor((shiftedIndex / EQ_BAR_COUNT) * (dataLength * 0.6));
            const rawValue = (this.freqData && this.freqData[binIndex]) ? this.freqData[binIndex] : 0;

            const norm = Math.min(rawValue / 230, 1);

            const minLen = 6;
            const maxLen = 130; 
            const barLen = minLen + norm * maxLen;

            let angleDeg = (angle + Math.PI / 2) * (180 / Math.PI);
            const color = this.colorForAngle(angleDeg);

            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            const blockHeight = 5; // Высота одного кубика
            const gap = 3;         // Зазор между кубиками
            const totalEnd = this.innerRadius + barLen;

            // 1. МЯГКИЙ НЕОНОВЫЙ ОРЕОЛ (Вместо лагающего shadowBlur)
            this.ctx.save();
            this.ctx.globalAlpha = 0.2;
            this.ctx.lineWidth = 9;
            
            for (let r = this.innerRadius; r < totalEnd; r += (blockHeight + gap)) {
                if (r > this.innerRadius + 70 && norm > 0.55) {
                    this.ctx.strokeStyle = '#bc00ff';
                } else {
                    this.ctx.strokeStyle = color;
                }
                const startX = this.centerX + r * cos;
                const startY = this.centerY + r * sin;
                const endX = this.centerX + (r + blockHeight) * cos;
                const endY = this.centerY + (r + blockHeight) * sin;

                this.ctx.beginPath();
                this.ctx.moveTo(startX, startY);
                this.ctx.lineTo(endX, endY);
                this.ctx.stroke();
            }
            this.ctx.restore();

            // 2. ЧЕТКИЕ ПИКСЕЛЬНЫХ БЛОКИ
            this.ctx.save();
            this.ctx.globalAlpha = 1.0;
            this.ctx.lineWidth = 4;
            
            for (let r = this.innerRadius; r < totalEnd; r += (blockHeight + gap)) {
                if (r > this.innerRadius + 70 && norm > 0.55) {
                    this.ctx.strokeStyle = '#bc00ff';
                } else {
                    this.ctx.strokeStyle = color;
                }

                const startX = this.centerX + r * cos;
                const startY = this.centerY + r * sin;
                const endX = this.centerX + (r + blockHeight) * cos;
                const endY = this.centerY + (r + blockHeight) * sin;

                this.ctx.beginPath();
                this.ctx.moveTo(startX, startY);
                this.ctx.lineTo(endX, endY);
                this.ctx.stroke();
            }
            this.ctx.restore();
        }
    }
}

window.equalizer = new Equalizer();
