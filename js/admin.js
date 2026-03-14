// js/admin.js

class AdminApp {
    constructor() {
        this.app = null;
        this.auth = null;
        this.db = null;
        this.unsubscribeDB = null;

        document.addEventListener('DOMContentLoaded', () => this.init());
    }

    init() {
        // Initialize Firebase
        const initInterval = setInterval(() => {
            if (window.firebaseAdminApp && window.firebaseAdminAuth && window.firebaseAdminFirestore) {
                clearInterval(initInterval);
                this.app = window.firebaseAdminApp.initializeApp(window.appConfig.firebaseConfig);
                this.auth = window.firebaseAdminAuth.getAuth(this.app);
                this.db = window.firebaseAdminFirestore.getFirestore(this.app);
                this.setupAuthListener();
                this.bindEvents();
            }
        }, 100);
    }

    bindEvents() {
        document.getElementById('btn-login').addEventListener('click', () => this.handleLogin());
        document.getElementById('btn-logout').addEventListener('click', () => this.handleLogout());
        
        // Enter key for login
        document.getElementById('admin-password').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleLogin();
        });
    }

    setupAuthListener() {
        const { onAuthStateChanged } = window.firebaseAdminAuth;
        onAuthStateChanged(this.auth, (user) => {
            if (user) {
                this.showDashboard();
                this.fetchData();
            } else {
                this.showLogin();
                if (this.unsubscribeDB) {
                    this.unsubscribeDB();
                    this.unsubscribeDB = null;
                }
            }
        });
    }

    async handleLogin() {
        const email = document.getElementById('admin-email').value.trim();
        const pwd = document.getElementById('admin-password').value;
        const errEl = document.getElementById('login-error');
        const btn = document.getElementById('btn-login');

        if (!email || !pwd) return;

        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Logging in...';
        errEl.classList.add('hidden');

        try {
            const { signInWithEmailAndPassword } = window.firebaseAdminAuth;
            await signInWithEmailAndPassword(this.auth, email, pwd);
            // Listener will auto-show dashboard
        } catch (error) {
            console.error("Login failed:", error);
            errEl.classList.remove('hidden');
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Login';
        }
    }

    async handleLogout() {
        try {
            const { signOut } = window.firebaseAdminAuth;
            await signOut(this.auth);
        } catch (error) {
            console.error("Logout failed:", error);
        }
    }

    showLogin() {
        document.getElementById('dashboard-container').classList.add('hidden');
        document.getElementById('login-container').classList.remove('hidden');
        document.getElementById('admin-password').value = '';
    }

    showDashboard() {
        document.getElementById('login-container').classList.add('hidden');
        document.getElementById('dashboard-container').classList.remove('hidden');
        document.getElementById('dashboard-container').classList.add('flex');
    }

    fetchData() {
        const { collection, query, orderBy, onSnapshot } = window.firebaseAdminFirestore;
        const q = query(collection(this.db, "eidi_requests"), orderBy("initial_timestamp", "desc"));
        
        const loader = document.getElementById('table-loading');
        const emptyState = document.getElementById('table-empty');
        const tbody = document.getElementById('table-body');

        this.unsubscribeDB = onSnapshot(q, (snapshot) => {
            loader.classList.add('hidden');
            tbody.innerHTML = '';
            
            if (snapshot.empty) {
                emptyState.classList.remove('hidden');
                return;
            }
            
            emptyState.classList.add('hidden');

            snapshot.forEach((doc) => {
                const data = doc.data();
                this.renderRow(doc.id, data, tbody);
            });
        }, (error) => {
            console.error("Fetch DB error:", error);
            if (error.code === 'permission-denied') {
                // Not an admin or rules blocking
                alert("Permission denied. Are you sure you are an admin?");
                this.handleLogout();
            }
        });
    }

    renderRow(id, data, tbody) {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-pink-50/30 transition-colors group';

        // Format Date safely
        let dateStr = 'Unknown';
        if (data.initial_timestamp) {
            try {
                dateStr = data.initial_timestamp.toDate().toLocaleString('en-US', {
                    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                });
            } catch (e) { }
        }

        // Format Step Badge
        let stepBadge = `<span class="px-2 py-1 rounded bg-gray-100 text-gray-500 font-bold text-xs"><i class="fa-solid fa-shoe-prints"></i> ${data.step || '?'}</span>`;
        if (data.step === 4) {
            stepBadge = `<span class="px-2 py-1 rounded bg-emerald-100 text-emerald-600 font-bold text-xs"><i class="fa-solid fa-check-double"></i> Done (4)</span>`;
        }

        // Specific insights (Decisions/Scratch Details)
        let detailsHtml = '';
        if (data.decision) {
            detailsHtml += `<div class="text-xs text-gray-500">Decision: <b class="${data.decision === 'gamble' ? 'text-amber-500' : 'text-gray-400'}">${data.decision.toUpperCase()}</b></div>`;
        }
        if (data.scratch_result !== undefined) {
            detailsHtml += `<div class="text-xs text-gray-500">Scratch: <b class="text-pink-500">${data.scratch_result} TK</b></div>`;
        }

        tr.innerHTML = `
            <td class="p-4">
                <div class="font-bold text-gray-800 text-base">${data.name || 'Unknown'}</div>
                <div class="text-xs text-gray-400 font-mono">${id}</div>
                ${data.is_vvip ? '<span class="px-2 py-0.5 mt-1 inline-block rounded-full bg-amber-100 text-amber-700 font-bold text-[10px] tracking-wider uppercase"><i class="fa-solid fa-crown mr-1"></i>VVIP</span>' : ''}
            </td>
            <td class="p-4">
                <div class="flex flex-col items-start gap-1">
                    ${stepBadge}
                    <span class="text-xs text-gray-400 capitalize">${(data.phase || 'started').replace(/_/g, ' ')}</span>
                </div>
            </td>
            <td class="p-4">
                ${detailsHtml || '<span class="text-gray-300 italic text-xs">No extra actions</span>'}
            </td>
            <td class="p-4">
                ${data.amount !== undefined ? `<span class="font-black text-lg text-gray-800">${data.amount} <span class="text-xs text-gray-400">TK</span></span>` : '<span class="text-gray-300">-</span>'}
            </td>
            <td class="p-4">
                ${data.bkash_number ? `
                    <div class="font-bold text-violet-600 tracking-wider">${data.bkash_number}</div>
                    <div class="flex items-center gap-2 mt-1">
                        <div class="text-[10px] uppercase font-bold text-${data.status === 'done' ? 'emerald' : 'amber'}-500">${data.status || 'Unknown'}</div>
                        ${data.status !== 'done' ? `<button onclick="window.adminApp.markAsDone('${id}')" class="ml-auto bg-emerald-100 hover:bg-emerald-200 text-emerald-700 px-2 py-0.5 rounded text-[10px] uppercase font-bold shadow-sm transition-colors cursor-pointer"><i class="fa-solid fa-check mr-1"></i>Mark Done</button>` : ''}
                    </div>
                ` : '<span class="text-gray-300 italic text-xs">Not submitted</span>'}
            </td>
            <td class="p-4 text-sm text-gray-500 font-medium">
                ${dateStr}
                <button onclick="window.adminApp.deleteEntry('${id}')" class="mt-2 w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wide text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">
                    <i class="fa-solid fa-trash"></i>
                    Delete
                </button>
            </td>
        `;

        tbody.appendChild(tr);
    }
    
    async markAsDone(id) {
        if (!confirm('Are you certain you have sent the money and want to mark this request as done?')) return;
        const { doc, updateDoc } = window.firebaseAdminFirestore;
        try {
            await updateDoc(doc(this.db, "eidi_requests", id), { status: 'done' });
        } catch (e) {
            console.error("Failed to mark as done:", e);
            alert("Error: " + e.message);
        }
    }

    async deleteEntry(id) {
        if (!confirm('Delete this entry? This cannot be undone.')) return;
        const { doc, deleteDoc } = window.firebaseAdminFirestore;
        try {
            await deleteDoc(doc(this.db, "eidi_requests", id));
        } catch (e) {
            console.error("Failed to delete entry:", e);
            alert("Error: " + e.message);
        }
    }
}

window.adminApp = new AdminApp();
