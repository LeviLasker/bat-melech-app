document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = '/api';
    const STORAGE_KEY = 'batMelechActivitiesV3';

    const serverStatusBadge = document.getElementById('server-status');
    const loginBox = document.getElementById('login-box');
    const dashboardBox = document.getElementById('dashboard-box');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const welcomeName = document.getElementById('welcome-name');
    const logoutBtn = document.getElementById('logout-btn');

    const activityForm = document.getElementById('activity-form');
    const submitBtn = document.getElementById('submit-btn');
    const extraPartsContainer = document.getElementById('extra-parts-container');
    const addPartBtn = document.getElementById('add-part-btn');
    const activitiesContainer = document.getElementById('activities-container');
    const filterGroup = document.getElementById('filter-group');

    let currentLeader = null;
    let activities = [];

    // פונקציית עזר להמרת קובץ ל-Base64 (Data URL)
    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = (error) => reject(error);
            reader.readAsDataURL(file);
        });
    }

    // פונקציית עזר לפתיחת קובץ לצפייה בטאב חדש (תומך ב-PDF ותמונות)
    function openFileInNewTab(dataUrl) {
        try {
            const arr = dataUrl.split(',');
            const mime = arr[0].match(/:(.*?);/)[1];
            const bstr = atob(arr[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) {
                u8arr[n] = bstr.charCodeAt(n);
            }
            const blob = new Blob([u8arr], { type: mime });
            const blobUrl = URL.createObjectURL(blob);
            window.open(blobUrl, '_blank');
        } catch (err) {
            console.error('שגיאה בפתיחת הקובץ:', err);
            alert('לא ניתן לפתוח קובץ זה לצפייה ישירה, נסי ללחוץ על כפתור ההורדה.');
        }
    }

    // =========================================================================
    // שכבת תקשורת מול השרת (Render + Neon PostgreSQL)
    // =========================================================================
    const apiService = {
        async login(username, password) {
            const response = await fetch(`${API_BASE_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'שגיאה בהתחברות');
            }
            return data;
        },

        async getActivities() {
            try {
                const response = await fetch(`${API_BASE_URL}/activities`);
                if (!response.ok) throw new Error('Server error');
                const data = await response.json();
                setServerOnline(true);
                return data;
            } catch (err) {
                setServerOnline(false);
                return getLocalActivities();
            }
        },

        async createActivity(activityData) {
            try {
                const response = await fetch(`${API_BASE_URL}/activities`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(activityData)
                });
                if (!response.ok) throw new Error('Server error');
                const created = await response.json();
                setServerOnline(true);
                return created;
            } catch (err) {
                setServerOnline(false);
                const localList = getLocalActivities();
                localList.unshift(activityData);
                saveLocalActivities(localList);
                return activityData;
            }
        },

        async deleteActivity(id) {
            try {
                const response = await fetch(`${API_BASE_URL}/activities/${id}`, {
                    method: 'DELETE'
                });
                if (!response.ok) throw new Error('Server error');
                setServerOnline(true);
                return true;
            } catch (err) {
                setServerOnline(false);
                const localList = getLocalActivities().filter(a => a.id !== id);
                saveLocalActivities(localList);
                return true;
            }
        }
    };

    function setServerOnline(isOnline) {
        if (!serverStatusBadge) return;
        if (isOnline) {
            serverStatusBadge.textContent = 'מחובר לענן (Render + Neon DB) 🟢';
            serverStatusBadge.className = 'status-badge status-online';
        } else {
            serverStatusBadge.textContent = 'מצב לא מקוון (שמירה מקומית) 🟡';
            serverStatusBadge.className = 'status-badge status-local';
        }
    }

    function getLocalActivities() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    }

    function saveLocalActivities(list) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        } catch (err) {}
    }

    // =========================================================================
    // ניהול התחברות (מאומת מול השרת בלבד!)
    // =========================================================================
    function getLoggedLeader() {
        try {
            return sessionStorage.getItem('loggedLeader') || currentLeader;
        } catch {
            return currentLeader;
        }
    }

    function setLoggedLeader(name) {
        currentLeader = name;
        try {
            if (name) sessionStorage.setItem('loggedLeader', name);
            else sessionStorage.removeItem('loggedLeader');
        } catch (err) {}
    }

    async function checkAuthState() {
        const loggedLeader = getLoggedLeader();
        if (loggedLeader) {
            loginBox.classList.add('hidden');
            dashboardBox.classList.remove('hidden');
            logoutBtn.classList.remove('hidden');
            welcomeName.textContent = loggedLeader;
            await loadAndRenderActivities();
        } else {
            loginBox.classList.remove('hidden');
            dashboardBox.classList.add('hidden');
            logoutBtn.classList.add('hidden');
            apiService.getActivities();
        }
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const leaderName = document.getElementById('leader-name').value.trim();
            const codeInput = document.getElementById('branch-code').value.trim();

            try {
                const result = await apiService.login(leaderName, codeInput);
                setLoggedLeader(result.leaderName);
                loginError.classList.add('hidden');
                loginForm.reset();
                checkAuthState();
            } catch (err) {
                loginError.textContent = err.message || 'שם המשתמש או הקוד שגויים, נסו שוב.';
                loginError.classList.remove('hidden');
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            setLoggedLeader(null);
            checkAuthState();
        });
    }

    // =========================================================================
    // הוספת חלקים נוספים באופן דינמי בטופס
    // =========================================================================
    if (addPartBtn) {
        addPartBtn.addEventListener('click', () => {
            const wrapper = document.createElement('div');
            wrapper.className = 'extra-part-wrapper';
            wrapper.innerHTML = `
                <div class="stars-divider">****</div>
                <div class="template-section">
                    <button type="button" class="remove-part-btn">הסרת חלק ✖</button>
                    <h5>חלק נוסף (לימוד / הקראה / סרטון / חידות / תחרות)</h5>
                    <div class="form-group">
                        <label class="label-pink">משחק / יצירה / סיפור / תוכן נוסף:</label>
                        <textarea class="extra-desc" rows="2" placeholder="פרטי את החלק הנוסף..." required></textarea>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="label-pink">מסר מהחלק הנוסף:</label>
                            <input type="text" class="extra-msg" placeholder="מה המסר שהבנות ייקחו?" required>
                        </div>
                        <div class="form-group">
                            <label class="label-pink">כמה זמן יקח?</label>
                            <input type="text" class="extra-time" placeholder="לדוגמה: 15 דקות" required>
                        </div>
                    </div>
                </div>
            `;

            wrapper.querySelector('.remove-part-btn').addEventListener('click', () => {
                wrapper.remove();
            });

            extraPartsContainer.appendChild(wrapper);
        });
    }

    // =========================================================================
    // שמירה, טעינה והצגת מערכי פעילות (כולל המרת והורדת קבצים)
    // =========================================================================
    if (activityForm) {
        activityForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const fileInput = document.getElementById('act-file');
            const fileObj = (fileInput && fileInput.files.length > 0) ? fileInput.files[0] : null;

            // בדיקת גודל קובץ (עד 8MB)
            if (fileObj && fileObj.size > 8 * 1024 * 1024) {
                alert('הקובץ גדול מדי (מקסימום 8MB). נא לבחור קובץ קטן יותר.');
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = 'שומר מערך פעילות... ⏳';

            let base64File = null;
            if (fileObj) {
                try {
                    base64File = await fileToBase64(fileObj);
                } catch (err) {
                    console.error('שגיאה בקריאת הקובץ:', err);
                }
            }

            const extraParts = [];
            document.querySelectorAll('.extra-part-wrapper').forEach(wrapper => {
                extraParts.push({
                    title: wrapper.querySelector('.extra-desc').value.trim(),
                    message: wrapper.querySelector('.extra-msg').value.trim(),
                    duration: wrapper.querySelector('.extra-time').value.trim()
                });
            });

            const newActivity = {
                id: Date.now(),
                actNumber: Number(document.getElementById('act-number').value),
                date: document.getElementById('act-date').value.trim(),
                group: document.getElementById('act-group').value,
                leader: getLoggedLeader() || 'מדריכה',
                topic: document.getElementById('act-topic').value.trim(),
                topicReveal: document.getElementById('act-topic-reveal').value.trim(),
                game1: {
                    description: document.getElementById('act-game1').value.trim(),
                    message: document.getElementById('act-game1-msg').value.trim(),
                    duration: document.getElementById('act-game1-time').value.trim()
                },
                part2: {
                    description: document.getElementById('act-part2').value.trim(),
                    message: document.getElementById('act-part2-msg').value.trim(),
                    duration: document.getElementById('act-part2-time').value.trim()
                },
                extraParts: extraParts,
                fileName: fileObj ? fileObj.name : null,
                fileData: base64File
            };

            await apiService.createActivity(newActivity);
            await loadAndRenderActivities();

            activityForm.reset();
            extraPartsContainer.innerHTML = '';
            submitBtn.disabled = false;
            submitBtn.textContent = 'שמירת מערך פעילות ✨';
        });
    }

    async function loadAndRenderActivities() {
        activities = await apiService.getActivities();
        renderActivities();
    }

    function renderActivities() {
        const selectedGroup = filterGroup ? filterGroup.value : 'all';
        activitiesContainer.innerHTML = '';

        const filtered = selectedGroup === 'all' 
            ? activities 
            : activities.filter(act => act.group === selectedGroup);

        if (filtered.length === 0) {
            activitiesContainer.innerHTML = '<p>לא נמצאו מערכי פעילות לשכבה זו.</p>';
            return;
        }

        filtered.forEach(act => {
            const item = document.createElement('div');
            item.className = 'activity-item';

            // יצירת אזור צפייה והורדה לקובץ המצורף
            let fileSectionHTML = '';
            if (act.fileName && act.fileData) {
                fileSectionHTML = `
                    <div class="file-attachment-box">
                        <span class="file-name-label">📎 <strong>קובץ מצורף:</strong> ${escapeHTML(act.fileName)}</span>
                        <div class="file-actions">
                            <button type="button" class="btn-file view-file-btn" data-id="${act.id}">צפייה בקובץ 👁️</button>
                            <a href="${act.fileData}" download="${escapeHTML(act.fileName)}" class="btn-file download-file-btn">הורדה ⬇️</a>
                        </div>
                    </div>
                `;
            } else if (act.fileName) {
                fileSectionHTML = `<div class="activity-meta" style="margin-top:8px;">📎 <strong>קובץ מצורף:</strong> ${escapeHTML(act.fileName)} (ללא תוכן שמור)</div>`;
            }

            const extraPartsHTML = (act.extraParts && act.extraParts.length > 0)
                ? act.extraParts.map((part, idx) => `
                    <div class="part-block">
                        <div><strong>חלק נוסף ${idx + 1}:</strong> ${escapeHTML(part.title)}</div>
                        <div>🎯 <strong>מסר:</strong> ${escapeHTML(part.message)} | ⏱️ <strong>זמן:</strong> ${escapeHTML(part.duration)}</div>
                    </div>
                `).join('')
                : '';

            item.innerHTML = `
                <button class="delete-btn" data-id="${act.id}">מחיקה ✖</button>
                <h5>פעילות מספר ${escapeHTML(act.actNumber)}: ${escapeHTML(act.topic)}</h5>
                <div class="activity-meta">
                    <span>שכבה: <strong>${escapeHTML(act.group)}</strong></span> | 
                    <span>תאריך: ${escapeHTML(act.date)}</span> | 
                    <span>מדריכה: ${escapeHTML(act.leader)}</span>
                </div>
                <div class="part-block">
                    💡 <strong>איך מגלים ומסבירים את הנושא:</strong><br>${escapeHTML(act.topicReveal)}
                </div>
                <div class="part-block">
                    <div>🎲 <strong>משחק:</strong> ${escapeHTML(act.game1?.description)}</div>
                    <div>🎯 <strong>מסר מהמשחק:</strong> ${escapeHTML(act.game1?.message)} | ⏱️ <strong>זמן:</strong> ${escapeHTML(act.game1?.duration)}</div>
                </div>
                <div class="part-block">
                    <div>🎨 <strong>משחק / יצירה / סיפור:</strong> ${escapeHTML(act.part2?.description)}</div>
                    <div>🎯 <strong>מסר:</strong> ${escapeHTML(act.part2?.message)} | ⏱️ <strong>זמן:</strong> ${escapeHTML(act.part2?.duration)}</div>
                </div>
                ${extraPartsHTML}
                ${fileSectionHTML}
            `;

            activitiesContainer.appendChild(item);
        });

        // האזנה לכפתורי צפייה בקובץ
        document.querySelectorAll('.view-file-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const actId = Number(e.target.getAttribute('data-id'));
                const found = activities.find(a => Number(a.id) === actId);
                if (found && found.fileData) {
                    openFileInNewTab(found.fileData);
                }
            });
        });

        // האזנה לכפתורי מחיקה
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const idToDelete = Number(e.target.getAttribute('data-id'));
                await apiService.deleteActivity(idToDelete);
                await loadAndRenderActivities();
            });
        });
    }

    if (filterGroup) {
        filterGroup.addEventListener('change', renderActivities);
    }

    function escapeHTML(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    checkAuthState();
});
