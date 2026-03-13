// js/scratch.js
// Handles the HTML5 Canvas scratch card mechanic

class ScratchCard {
    constructor(canvasId, resultHtmlCallback, onCompleteCallback) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.resultHtmlCallback = resultHtmlCallback;
        this.onCompleteCallback = onCompleteCallback;
        this.isDrawing = false;
        this.isRevealed = false;
        
        // Canvas dimensions relative to container
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        // Fill with a festive golden coat
        this.fillCanvas();

        // Bind events
        this.bindEvents();
    }

    resizeCanvas() {
        if (!this.canvas) return;
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        if (!this.isRevealed) {
            this.fillCanvas();
        } else {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    fillCanvas() {
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        // Create golden gradient
        const gradient = this.ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#fcd34d'); // amber-300
        gradient.addColorStop(0.5, '#fbbf24'); // amber-400
        gradient.addColorStop(1, '#f59e0b'); // amber-500
        
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, width, height);
        
        // Add sparkle pattern/noise
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        for (let i = 0; i < 70; i++) {
            this.ctx.beginPath();
            // Tiny stars/circles
            const r = Math.random() * 3;
            this.ctx.arc(Math.random() * width, Math.random() * height, r, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // Add text instruction
        this.ctx.fillStyle = '#78350f'; // amber-900 (dark brown text for contrast)
        this.ctx.font = '900 24px Outfit, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.shadowColor = 'rgba(255,255,255,0.5)';
        this.ctx.shadowBlur = 4;
        this.ctx.fillText('SCRATCH TO REVEAL', width / 2, height / 2);
        this.ctx.shadowBlur = 0; // reset
    }

    getPointerPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    }

    bindEvents() {
        const startDraw = (e) => {
            if (this.isRevealed) return;
            this.isDrawing = true;
            const pos = this.getPointerPos(e);
            this.scratch(pos.x, pos.y);
            // Before starting, inject the result so it lays beneath
            if(this.resultHtmlCallback) this.resultHtmlCallback();
        };

        const draw = (e) => {
            if (!this.isDrawing || this.isRevealed) return;
            e.preventDefault(); // Prevent scrolling on mobile while scratching
            const pos = this.getPointerPos(e);
            this.scratch(pos.x, pos.y);
            this.checkReveal();
        };

        const stopDraw = () => {
            this.isDrawing = false;
        };

        this.canvas.addEventListener('mousedown', startDraw);
        this.canvas.addEventListener('mousemove', draw);
        this.canvas.addEventListener('mouseup', stopDraw);
        this.canvas.addEventListener('mouseleave', stopDraw);

        this.canvas.addEventListener('touchstart', startDraw, { passive: false });
        this.canvas.addEventListener('touchmove', draw, { passive: false });
        this.canvas.addEventListener('touchend', stopDraw);
    }

    scratch(x, y) {
        this.ctx.globalCompositeOperation = 'destination-out';
        this.ctx.beginPath();
        // Larger brush for mobile ease
        this.ctx.arc(x, y, 35, 0, Math.PI * 2); 
        this.ctx.fill();
    }

    checkReveal() {
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const pixels = imageData.data;
        let transparentPixels = 0;
        
        // Step by 16 to improve performance
        for (let i = 3; i < pixels.length; i += 16) {
            if (pixels[i] < 128) {
                transparentPixels++;
            }
        }

        const totalPixelsToCheck = pixels.length / 16;
        const percentCleared = (transparentPixels / totalPixelsToCheck) * 100;

        if (percentCleared > 40) { // Reveal if 40% cleared
            this.revealAll();
        }
    }

    revealAll() {
        if (this.isRevealed) return;
        this.isRevealed = true;
        
        // Fade out canvas
        this.canvas.style.transition = 'opacity 0.6s ease-out';
        this.canvas.style.opacity = '0';
        
        setTimeout(() => {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.canvas.style.display = 'none'; // hide completely
            if (this.onCompleteCallback) this.onCompleteCallback();
        }, 600);
    }
}

window.ScratchCard = ScratchCard;
