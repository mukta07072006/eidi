// js/app.js
// Main application logic for fluid UI

class EidiApp {
    constructor() {
        this.lang = 'bn';
        this.state = {
            name: '',
            cleanNameId: '',
            multiplier: null,
            baseResult: 0,
            finalAmount: 0,
            isVVIP: false,
            phase: 1,
        };

        this.db = null;
        this.unsubscribeStatus = null;

        document.addEventListener('DOMContentLoaded', () => this.init());
    }

    async init() {
        this.initFirebase();

        const hasPlayed = localStorage.getItem('eidi_played');
        const storedName = localStorage.getItem('user_name');

        this.lang = 'bn'; // Only bangla
        this.applyLanguage();

        this.showWelcomeModalIfFirstTime();

        if (hasPlayed === 'true' && storedName) {
            this.state.cleanNameId = storedName;
            await this.waitForDb();
            document.getElementById('main-header').style.display = 'none'; // hide generic header
            this.goToPhase(5);
            this.setupStatusListener();
        } else {
            this.goToPhase(1);
        }

        this.bindEvents();
    }

    initFirebase() {
        try {
            let attempts = 0;
            const checkReady = setInterval(() => {
                if (window.firebaseApp && window.firebaseFirestore) {
                    clearInterval(checkReady);
                    const app = window.firebaseApp.initializeApp(window.appConfig.firebaseConfig);
                    this.db = window.firebaseFirestore.getFirestore(app);
                } else if (attempts > 50) {
                    clearInterval(checkReady);
                    console.error("Firebase SDK timeout.");
                }
                attempts++;
            }, 100);
        } catch (e) {
            console.error("Firebase init failed", e);
        }
    }

    waitForDb() {
        return new Promise((resolve) => {
            if (this.db) return resolve(true);
            let attempts = 0;
            const check = setInterval(() => {
                if (this.db) {
                    clearInterval(check);
                    resolve(true);
                } else if (attempts > 50) { // 5 seconds
                    clearInterval(check);
                    resolve(false);
                }
                attempts++;
            }, 100);
        });
    }

    bindEvents() {
        // Phase 2
        document.getElementById('btn-coward').addEventListener('click', () => {
            this.state.finalAmount = this.state.baseResult;
            
            // Step Tracking: Decision Coward
            this.trackStep({
                decision: 'coward',
                amount_taken: this.state.finalAmount,
                step: 2,
                phase: 'decision_made'
            });

            this.goToPhase(4);
        });
        document.getElementById('btn-gamble').addEventListener('click', () => {
            // Step Tracking: Decision Gamble
            this.trackStep({
                decision: 'gamble',
                step: 2,
                phase: 'decision_made'
            });
            this.goToPhase(3);
        });

        // Phase 3
        document.getElementById('btn-next-p4').addEventListener('click', () => this.goToPhase(4));

        // Phase 4
        document.getElementById('btn-request-eidi').addEventListener('click', () => this.handleSubmit());
    }

    // Checking inputs naturally rather than using form next buttons
    checkPhase1Ready() {
        const val = document.getElementById('user-name').value.trim();
        const loyContainer = document.getElementById('loyalty-container');
        if (val.length > 2) {
            loyContainer.classList.remove('opacity-0', 'pointer-events-none');
            loyContainer.style.transform = 'translateY(0)';
        } else {
            loyContainer.classList.add('opacity-0', 'pointer-events-none');
        }
    }

    async selectLoyalty(mult, btnEl) {
        this.state.multiplier = mult;

        // Highlight logic
        const pills = document.querySelectorAll('.pill-option');
        pills.forEach(p => p.classList.remove('selected'));
        btnEl.classList.add('selected');

        const nameInput = document.getElementById('user-name').value.trim();
        this.state.name = nameInput;
        this.state.cleanNameId = nameInput.toLowerCase().replace(/\s+/g, '');
        this.state.isVVIP = window.appConfig.vvipNames.includes(nameInput.toLowerCase());
        
        // Security Check 1: Have they already played under THIS name?
        if (this.db) {
            const { doc, getDoc, collection, query, where, getDocs } = window.firebaseFirestore;
            const docRef = doc(this.db, "eidi_requests", this.state.cleanNameId);
            try {
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.status) { // They already reached Phase 4
                        this.showToast('তুমি তো অলরেডি নিয়েছো!', 'error');
                        
                        // Restore state and redirect to Phase 5
                        this.state.finalAmount = data.amount || 0;
                        localStorage.setItem('eidi_played', 'true');
                        localStorage.setItem('user_name', this.state.cleanNameId);
                        
                        document.getElementById('main-header').style.display = 'none';
                        this.goToPhase(5);
                        this.setupStatusListener();
                        return; // Stop the flow
                    }
                }

                // Security Check 2: Strict Device Fingerprint (Has this specific device played under ANY name?)
                const fp = await this.getDeviceFingerprint();
                const q = query(
                    collection(this.db, "eidi_requests"), 
                    where("device_fingerprint", "==", fp)
                );
                const querySnapshot = await getDocs(q);
                
                let deviceUsedAlready = false;
                querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    // If the device has a completed/processing status under a DIFFERENT name
                    if (data.status && doc.id !== this.state.cleanNameId) {
                        deviceUsedAlready = true;
                    }
                });

                if (deviceUsedAlready) {
                    this.showToast('তুমি তো অন্য নামে অলরেডি নিয়েছো! চালাকি চলবে না।', 'error');
                    
                    // Force them into a fake done state so they can't play again
                    localStorage.setItem('eidi_played', 'true');
                    document.getElementById('main-header').style.display = 'none';
                    this.goToPhase(5);
                    return; 
                }

            } catch (e) {
                console.error("Security checks failed:", e);
            }
        }
        
        // VVIPs see exactly 100TK on Phase 2, others see 10 * mult
        this.state.baseResult = this.state.isVVIP ? 100 : (window.appConfig.baseAmount * mult);

        // Step 1 Tracking: Name and Time selected + Fingerprint
        const currentFp = await this.getDeviceFingerprint();
        this.trackStep({
            name: this.state.name,
            multiplier_chosen: mult,
            is_vvip: this.state.isVVIP,
            device_fingerprint: currentFp,
            step: 1,
            phase: 'time_selected'
        }, true); // true = use setDoc with merge

        setTimeout(() => {
            this.goToPhase(2);
        }, 400); // slight delay after tap feels natural
    }

    checkPhase4Ready() {
        const val = document.getElementById('bkash-number').value.trim();
        const submitContainer = document.getElementById('p4-submit-container');
        if (val.length === 11 && val.startsWith('01')) {
            submitContainer.classList.remove('opacity-0', 'pointer-events-none');
        } else {
            submitContainer.classList.add('opacity-0', 'pointer-events-none');
        }
    }

    showWelcomeModalIfFirstTime() {
        const key = 'eidi_welcome_shown';
        if (localStorage.getItem(key) === 'true') return;

        const modal = document.getElementById('welcome-modal');
        const closeBtn = document.getElementById('welcome-close-btn');
        const okBtn = document.getElementById('welcome-ok-btn');

        const hide = () => {
            modal.classList.add('opacity-0', 'pointer-events-none');
            localStorage.setItem(key, 'true');
            if (this._welcomeConfettiInterval) clearInterval(this._welcomeConfettiInterval);
        };

        closeBtn?.addEventListener('click', hide);
        okBtn?.addEventListener('click', hide);

        requestAnimationFrame(() => {
            modal.classList.remove('opacity-0', 'pointer-events-none');
        });

        // Confetti burst for ~2 seconds
        const duration = 2000;
        const end = Date.now() + duration;
        this._welcomeConfettiInterval = setInterval(() => {
            if (Date.now() > end) {
                clearInterval(this._welcomeConfettiInterval);
                return;
            }
            confetti({
                particleCount: 25,
                spread: 80,
                origin: { x: Math.random(), y: Math.random() * 0.3 },
                colors: ['#ec4899', '#f59e0b', '#10b981', '#3b82f6'],
            });
        }, 200);
    }

    t(key) {
        return window.i18n[this.lang][key] || key;
    }

    setLanguage(langCode) {
        // Obsolete function, language is always BN now.
    }

    applyLanguage() {
        // Obsolete bindings as we put translations directly in HTML for better fluidity
        // but keeping dynamic ones mapping here.
        const mappings = {
            't-hero-subtitle': 'hero-subtitle',
            't-p1-name-label': 'p1-name-label',
            't-p1-dropdown-label': 'p1-dropdown-label',
            't-opt-7days': 'opt-7days',
            't-opt-2weeks': 'opt-2weeks',
            't-opt-1month': 'opt-1month',
            't-opt-ghost': 'opt-ghost',

            't-p2-owes': 'p2-owes',
            't-btn-coward': 'btn-coward',
            't-btn-gamble': 'btn-gamble',

            't-p3-title': 'p3-title',
            't-p3-subtitle': 'p3-subtitle',
            't-btn-next': 'btn-next',

            't-p4-final': 'p4-final',
            't-p4-bkash-label': 'p4-bkash-label',
            't-btn-request': 'btn-request',

            't-status-p-title': 'status-p-title',
            't-status-d-title': 'status-d-title',
            'status-message': this.state.finalAmount > 0 && document.getElementById('status-done').style.opacity === "1" ? 'status-done-msg' : 'status-processing-msg',
        };

        for (const [domId, i18nKey] of Object.entries(mappings)) {
            const el = document.getElementById(domId);
            if (el && this.t(i18nKey)) el.textContent = this.t(i18nKey);
        }

        // Placeholders styling
        const nameInput = document.getElementById('user-name');
        if (nameInput) nameInput.placeholder = 'তোমার নাম দাও';

        const bkashInput = document.getElementById('bkash-number');
        if (bkashInput) bkashInput.placeholder = '০১৭••••••••';
    }

    goToPhase(phaseNum) {
        document.querySelectorAll('.phase-section').forEach(el => {
            el.classList.remove('active');
            // Move inactive ones slightly up and out of way via CSS
            if (parseInt(el.id.replace('phase-', '')) < phaseNum) {
                el.style.transform = 'translateY(-20px)';
                el.style.position = 'absolute';
            } else {
                el.style.transform = 'translateY(20px)';
                el.style.position = 'absolute';
            }
        });

        const target = document.getElementById(`phase-${phaseNum}`);
        if (target) {
            target.classList.add('active');
            target.style.position = 'relative'; // Active phase centers
            target.style.transform = 'translateY(0)';
        }

        this.state.phase = phaseNum;

        // Specific setups
        if (phaseNum == 2) {
            document.getElementById('main-header').style.display = 'none'; // Fade out title for cleaner canvas
            document.getElementById('calculated-amount').textContent = this.state.baseResult.toFixed(2);

            const gambleBtn = document.getElementById('t-btn-gamble');
            if (this.state.isVVIP) {
                gambleBtn.textContent = this.t('btn-gamble-vvip');

                // VVIP Celebration Mode
                setTimeout(() => {
                    const duration = 2 * 1000;
                    const end = Date.now() + duration;

                    (function frame() {
                        confetti({
                            particleCount: 5,
                            angle: 60,
                            spread: 55,
                            origin: { x: 0 },
                            colors: ['#ec4899', '#fbbf24']
                        });
                        confetti({
                            particleCount: 5,
                            angle: 120,
                            spread: 55,
                            origin: { x: 1 },
                            colors: ['#ec4899', '#fbbf24']
                        });

                        if (Date.now() < end) {
                            requestAnimationFrame(frame);
                        }
                    }());

                    const modal = document.getElementById('vvip-modal');
                    const modalMsg = document.getElementById('vvip-modal-message');
                    const modalContent = document.getElementById('vvip-modal-content');

                    modalMsg.textContent = this.t(`msg-${this.state.cleanNameId}`) || 'ভিভিআইপি সম্মান!';
                    
                    modal.classList.remove('opacity-0', 'pointer-events-none');
                    modalContent.classList.replace('scale-50', 'scale-100');
                    
                }, 300);

            } else {
                gambleBtn.textContent = this.t('btn-gamble');
            }

        } else if (phaseNum == 3) {
            this.initScratchGame();
        } else if (phaseNum == 4) {
            document.getElementById('final-amount').textContent = this.state.finalAmount.toFixed(2);
        } else if (phaseNum == 5) {
            document.getElementById('status-name').textContent = this.state.name || localStorage.getItem('user_name') || 'User';
        }
    }

    initScratchGame() {
        const canvas = document.getElementById('scratch-canvas');
        canvas.style.display = 'block';
        canvas.style.opacity = '1';

        document.getElementById('scratch-icon').classList.add('opacity-0', 'scale-50');
        document.getElementById('scratch-amount-display').classList.add('opacity-0', 'translate-y-4');
        document.getElementById('scratch-message').classList.add('opacity-0');
        document.getElementById('p3-action-container').classList.add('opacity-0', 'pointer-events-none');

        const resultCallback = () => {
            this.calculateScratchResult();
        };

        const completeCallback = () => {
            document.getElementById('p3-action-container').classList.remove('opacity-0', 'pointer-events-none');
            // Animate result inside the frame
            document.getElementById('scratch-icon').classList.remove('opacity-0', 'scale-50');
            document.getElementById('scratch-amount-display').classList.remove('opacity-0', 'translate-y-4');
            document.getElementById('scratch-message').classList.remove('opacity-0');
        };

        // Initialize golden ScratchCard
        new window.ScratchCard('scratch-canvas', resultCallback, completeCallback);
    }

    calculateScratchResult() {
        if (this.state.finalAmount > 0) return;

        let won100 = false;
        let message = "";

        if (this.state.isVVIP) {
            // VVIP gets 50 instead of 100, message: "লোভ ভালো না" 
            won100 = false;
            this.state.finalAmount = 50.00;
            message = this.t('scratch-lose-vvip');
        } else {
            const roll = Math.random();
            if (roll <= 0.10) {
                won100 = true;
                this.state.finalAmount = 100.00;
                message = this.t('scratch-win-normal');
            } else {
                won100 = false;
                this.state.finalAmount = 0.50;
                message = this.t('scratch-lose');
            }
        }

        // Step Tracking: Scratch Result
        this.trackStep({
            scratch_result: this.state.finalAmount,
            won_grand_prize: won100,
            step: 3,
            phase: 'scratch_completed'
        });

        const iconEl = document.getElementById('scratch-icon');
        const amountEl = document.getElementById('scratch-amount-display');
        const msgEl = document.getElementById('scratch-message');

        amountEl.textContent = `${this.state.finalAmount.toFixed(2)} TK`;
        msgEl.textContent = message;

        if (won100) {
            iconEl.innerHTML = '<i class="fa-solid fa-crown text-amber-500"></i>';
            amountEl.classList.remove('text-gray-800');
            amountEl.classList.add('text-pink-600');
            msgEl.classList.add('text-pink-600');
        } else {
            iconEl.innerHTML = '<i class="fa-regular fa-face-sad-tear text-slate-400"></i>';
            amountEl.classList.remove('text-pink-600');
            amountEl.classList.add('text-gray-500');
            msgEl.classList.add('text-gray-500');
        }
    }


    async handleSubmit() {
        const bkashStr = document.getElementById('bkash-number').value.trim();
        const btn = document.getElementById('btn-request-eidi');
        const spinner = document.getElementById('btn-request-spinner');

        btn.disabled = true;
        spinner.classList.remove('hidden');

        await this.waitForDb();

        if (!this.db) {
            this.showToast('Firebase integration is pending configuration.', 'error');
            btn.disabled = false;
            spinner.classList.add('hidden');
            return;
        }

        const { doc, getDoc, setDoc, updateDoc, serverTimestamp } = window.firebaseFirestore;
        const docRef = doc(this.db, "eidi_requests", this.state.cleanNameId);

        try {
            await updateDoc(docRef, {
                bkash_number: bkashStr,
                amount: this.state.finalAmount,
                status: 'processing',
                step: 4,
                phase: 'completed_request',
                final_timestamp: serverTimestamp()
            });

            localStorage.setItem('eidi_played', 'true');
            localStorage.setItem('user_name', this.state.cleanNameId);
            localStorage.setItem('eidi_lang', this.lang);

            // Auto-download static card right after request is sent
            await this.downloadStaticCard();

            this.goToPhase(5);
            this.setupStatusListener();

        } catch (error) {
            console.error(error);
            if (error.message === "ALREADY_EXISTS" || error.code === 'permission-denied') {
                this.showToast(this.t('err-already-participated'), 'error');
            } else {
                this.showToast(this.t('err-general'), 'error');
            }
        } finally {
            btn.disabled = false;
            spinner.classList.add('hidden');
        }
    }

    async trackStep(data, isInitial = false) {
        if (!this.db || !this.state.cleanNameId) return;
        
        const { doc, setDoc, updateDoc, serverTimestamp } = window.firebaseFirestore;
        const docRef = doc(this.db, "eidi_requests", this.state.cleanNameId);

        try {
            if (isInitial) {
                // Initial creation, use setDoc with merge so we don't overwrite if they refresh
                await setDoc(docRef, {
                    ...data,
                    initial_timestamp: serverTimestamp(),
                    last_updated: serverTimestamp()
                }, { merge: true });
            } else {
                // Update existing
                await updateDoc(docRef, {
                    ...data,
                    last_updated: serverTimestamp()
                });
            }
        } catch (e) {
            console.error("Tracking error:", e);
        }
    }

    async getDeviceFingerprint() {
        if (this._fpCache) return this._fpCache;
        
        return new Promise((resolve) => {
            // Combine screen, language, color depth, and canvas traits into a hash string
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = 200;
                canvas.height = 50;
                
                // Text with font fallback to draw unique anti-aliasing pixels
                ctx.textBaseline = "top";
                ctx.font = "14px 'Arial'";
                ctx.textBaseline = "alphabetic";
                ctx.fillStyle = "#f60";
                ctx.fillRect(125,1,62,20);
                
                ctx.fillStyle = "#069";
                ctx.fillText("http://muktadir.eidi.2026", 2, 15);
                ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
                ctx.fillText("http://muktadir.eidi.2026", 4, 17);
                
                const canvasData = canvas.toDataURL();

                // Core metrics
                const rawComponents = [
                    navigator.userAgent,
                    navigator.language,
                    screen.colorDepth,
                    screen.width + 'x' + screen.height,
                    new Date().getTimezoneOffset(),
                    canvasData
                ].join('///');

                // Simple hash function for the string
                let hash = 0;
                for (let i = 0; i < rawComponents.length; i++) {
                    const char = rawComponents.charCodeAt(i);
                    hash = ((hash << 5) - hash) + char;
                    hash = hash & hash; // Convert to 32bit int
                }
                
                // Return positive hex string
                this._fpCache = (hash >>> 0).toString(16);
                resolve(this._fpCache);

            } catch(e) {
                // Fallback using random if somehow canvas fails totally (rare)
                console.warn('Fingerprint failed, using basic string');
                resolve(navigator.userAgent.replace(/[^a-zA-Z0-9]/g, '').substring(0, 16));
            }
        });
    }

    setupStatusListener() {
        if (!this.db) return;

        const { doc, onSnapshot } = window.firebaseFirestore;
        const docRef = doc(this.db, "eidi_requests", this.state.cleanNameId);

        this.unsubscribeStatus = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                this.updateStatusUI(data.status, data.amount);
            }
        }, (error) => {
            console.error("Listen failed:", error);
        });
    }

    updateStatusUI(status, amount) {
        document.getElementById('status-amount').textContent = amount !== undefined ? amount.toFixed(2) : this.state.finalAmount.toFixed(2);

        const pIcon = document.getElementById('status-processing');
        const dIcon = document.getElementById('status-done');
        const msg = document.getElementById('status-message');

        if (status === 'done') {
            pIcon.classList.add('opacity-0', 'scale-50');
            setTimeout(() => { pIcon.style.display = 'none'; }, 500);

            dIcon.classList.remove('opacity-0', 'scale-50');
            dIcon.style.opacity = '1';

            msg.textContent = this.t('status-done-msg');
        } else {
            msg.textContent = this.t('status-processing-msg');
        }
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast px-5 py-4 rounded-full shadow-lg text-white font-bold text-sm flex items-center gap-3 ${type === 'error' ? 'bg-gradient-to-r from-rose-500 to-pink-500' : 'bg-gradient-to-r from-violet-500 to-fuchsia-500'}`;
        toast.innerHTML = `<i class="fa-solid fa-${type === 'error' ? 'circle-exclamation' : 'bell'} text-xl"></i> <span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('hiding');
            toast.addEventListener('animationend', () => toast.remove());
        }, 3000);
    }

    async downloadStaticCard() {
        const nameInput = document.getElementById('user-name');
        // Auto-download static card without adding name - called after request submission
        try {
            // Create blob and download directly without canvas manipulation
            fetch('assets/card.jpg')
                .then(res => res.blob())
                .then(blob => {
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.download = `Eid_Mobarak_${nameInput}.jpg`;
                    link.href = url;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                    
                    // Show celebration confetti
                    if (window.confetti) {
                        confetti({
                            particleCount: 50,
                            spread: 60,
                            origin: { y: 0.8 },
                            colors: ['#f59e0b', '#fbbf24']
                        });
                    }
                })
                .catch(err => {
                    console.error('Download failed:', err);
                    this.showToast('ডাউনলোড ব্যর্থ হয়েছে!', 'error');
                });
        } catch (err) {
            console.error('Download failed:', err);
            this.showToast('ডাউনলোড ব্যর্থ হয়েছে!', 'error');
        }
    }

    async downloadCard() {
        const btn = document.getElementById('btn-download-card');
        const originalContent = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
        btn.disabled = true;

        try {
            // Call the static card download function
            await this.downloadStaticCard();
            
        } catch (err) {
            console.error('Download failed:', err);
            this.showToast('ডাউনলোড ব্যর্থ হয়েছে!', 'error');
        } finally {
            btn.innerHTML = originalContent;
            btn.disabled = false;
        }
    }
}

window.app = new EidiApp();
