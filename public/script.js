async function apiRequest(url, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json'
        }
    };
    if (body) {
        options.body = JSON.stringify(body);
    }
    const response = await fetch(url, options);
    return response.json();
}

function showMessage(msg, isError = false) {
    const el = document.getElementById('message');
    if (el) {
        el.textContent = msg;
        el.style.color = isError ? 'red' : 'yellow';
        setTimeout(() => el.textContent = '', 5000);
    }
}

// Auth Logic
async function login(username, password) {
    const res = await apiRequest('/auth/login', 'POST', { username, password });
    if (res.error) {
        showMessage(res.error, true);
    } else if (res.redirect) {
        window.location.href = res.redirect;
    }
}

async function register(username, password) {
    const res = await apiRequest('/auth/register', 'POST', { username, password });
    if (res.error) {
        showMessage(res.error, true);
    } else if (res.redirect) {
        window.location.href = res.redirect;
    }
}

// Dashboard Logic
async function loadProfile() {
    const res = await apiRequest('/user/profile');
    if (res.error) return;

    document.getElementById('username-display').textContent = res.username;
    if (res.ssh_key) {
        document.getElementById('ssh-key').value = res.ssh_key;
    }
}

async function updateSSHKey() {
    const sshKey = document.getElementById('ssh-key').value;
    const res = await apiRequest('/user/ssh-key', 'POST', { sshKey });
    if (res.error) {
        showMessage(res.error, true);
    } else {
        showMessage(res.message);
    }
}

// --- Deploy Logic ---

let deployPollInterval = null;

async function loadDeployConfig() {
    const res = await apiRequest('/deploy/config');
    if (res.error) return;

    // Show/hide based on verification status
    const notVerified = document.getElementById('deploy-not-verified');
    const verified = document.getElementById('deploy-verified');

    if (res.isVerified) {
        notVerified.style.display = 'none';
        verified.style.display = 'block';
    } else {
        notVerified.style.display = 'block';
        verified.style.display = 'none';
        return;
    }

    // Fill form fields
    if (res.gitRepo) document.getElementById('deploy-repo').value = res.gitRepo;
    if (res.subdomain) document.getElementById('deploy-subdomain').value = res.subdomain;
    if (res.appPort) document.getElementById('deploy-port').value = res.appPort;

    // Update status display
    updateDeployUI(res.status, res.log);

    // Start polling if deploying
    if (res.status === 'deploying') {
        startDeployPolling();
    }
}

function updateDeployUI(status, log) {
    const indicator = document.getElementById('deploy-status-indicator');
    const startBtn = document.getElementById('deploy-start-btn');
    const stopBtn = document.getElementById('deploy-stop-btn');
    const analyzeBtn = document.getElementById('deploy-analyze-btn');
    const logContainer = document.getElementById('deploy-log-container');
    const logEl = document.getElementById('deploy-log');

    // Status indicator
    const statusMap = {
        'none': { text: 'Nicht deployt', color: '#666', dot: '#666' },
        'deploying': { text: 'Deployment läuft...', color: 'yellow', dot: 'yellow' },
        'running': { text: 'Läuft', color: '#0f0', dot: '#0f0' },
        'error': { text: 'Fehler', color: 'red', dot: 'red' },
        'stopped': { text: 'Gestoppt', color: '#666', dot: '#666' }
    };
    const s = statusMap[status] || statusMap['none'];
    indicator.innerHTML = `<span class="status-dot" style="background:${s.dot}; ${status === 'deploying' ? 'animation: pulse 1s infinite;' : ''}"></span> <span style="color:${s.color}">${s.text}</span>`;

    // Buttons
    startBtn.disabled = status === 'deploying';
    startBtn.textContent = status === 'deploying' ? 'DEPLOYING...' : (status === 'running' ? 'RE-DEPLOY' : 'DEPLOY');
    stopBtn.style.display = (status === 'running' || status === 'deploying') ? 'inline-block' : 'none';
    analyzeBtn.style.display = status === 'error' ? 'inline-block' : 'none';

    // Log
    if (log) {
        logContainer.style.display = 'block';
        logEl.textContent = log;
        logEl.scrollTop = logEl.scrollHeight;
    }
}

function startDeployPolling() {
    if (deployPollInterval) return;
    deployPollInterval = setInterval(async () => {
        const res = await apiRequest('/deploy/status');
        if (res.error) return;
        updateDeployUI(res.status, res.log);
        if (res.status !== 'deploying') {
            stopDeployPolling();
        }
    }, 2000);
}

function stopDeployPolling() {
    if (deployPollInterval) {
        clearInterval(deployPollInterval);
        deployPollInterval = null;
    }
}

async function saveDeployConfig() {
    const gitRepo = document.getElementById('deploy-repo').value;
    const subdomain = document.getElementById('deploy-subdomain').value;
    const appPort = document.getElementById('deploy-port').value;
    const aiApiKey = document.getElementById('deploy-ai-key').value;

    const res = await apiRequest('/deploy/config', 'POST', { gitRepo, subdomain, appPort, aiApiKey });
    if (res.error) {
        showMessage(res.error, true);
    } else {
        showMessage(res.message);
    }
}

async function startDeploy() {
    // Save config first
    await saveDeployConfig();

    const res = await apiRequest('/deploy/start', 'POST');
    if (res.error) {
        showMessage(res.error, true);
    } else {
        showMessage(res.message);
        updateDeployUI('deploying', 'Deployment gestartet...\n');
        startDeployPolling();
    }
}

async function stopDeploy() {
    if (!confirm('Projekt wirklich stoppen?')) return;
    const res = await apiRequest('/deploy/stop', 'POST');
    if (res.error) {
        showMessage(res.error, true);
    } else {
        showMessage(res.message);
        stopDeployPolling();
        // Refresh status
        const status = await apiRequest('/deploy/status');
        updateDeployUI(status.status, status.log);
    }
}

async function analyzeError() {
    showMessage('KI-Analyse läuft...');
    const res = await apiRequest('/deploy/analyze', 'POST');
    if (res.error) {
        showMessage(res.error, true);
    } else {
        showMessage('KI-Analyse abgeschlossen.');
        // Refresh log
        const status = await apiRequest('/deploy/status');
        updateDeployUI(status.status, status.log);
    }
}

// --- Admin Logic ---

async function loadAdminData() {
    const me = await apiRequest('/auth/me');
    if (me.isAdmin !== 1) {
        const adminSection = document.getElementById('admin-section');
        if (adminSection) adminSection.style.display = 'none';
        return;
    }

    const res = await apiRequest('/admin/users');
    if (res.error) {
        showMessage(res.error, true);
        return;
    }

    const list = document.getElementById('user-list');
    list.innerHTML = '';
    res.forEach(u => {
        const li = document.createElement('li');

        const statusColors = {
            'running': '#0f0',
            'deploying': 'yellow',
            'error': 'red',
            'stopped': '#666',
            'none': '#444'
        };
        const deployColor = statusColors[u.deploy_status] || '#444';
        const deployText = u.deploy_status || 'none';

        li.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; width:100%; flex-wrap: wrap; gap: 5px;">
                <span>
                    <strong>${u.username}</strong>
                    ${u.is_admin ? '<span class="admin-badge">[ADMIN]</span>' : ''}
                    ${u.is_verified ? '<span style="color:#0f0;margin-left:5px;">[VERIFIED]</span>' : '<span style="color:orange;margin-left:5px;">[UNVERIFIED]</span>'}
                    <br>
                    <small>Key: ${u.ssh_key ? 'Present' : 'Missing'}</small>
                    ${u.subdomain ? `<small> | Deploy: <span style="color:${deployColor}">${deployText}</span> | ${u.subdomain}.hackerwerkstatt.de</small>` : ''}
                </span>
                <span style="display:flex; gap:5px;">
                    ${!u.is_verified ? `<button onclick="verifyUser(${u.id}, true)" style="background:#001a00; border-color:#0f0; color:#0f0; padding:5px 10px;">Verify</button>` : `<button onclick="verifyUser(${u.id}, false)" style="background:#1a1a00; border-color:orange; color:orange; padding:5px 10px;">Unverify</button>`}
                    <button onclick="deleteUser(${u.id})" style="background:darkred; color:white; border:none; padding:5px 10px; cursor:pointer;">Delete</button>
                </span>
            </div>
        `;
        list.appendChild(li);
    });
}

async function verifyUser(id, verified) {
    const res = await apiRequest(`/admin/users/${id}/verify`, 'POST', { verified });
    if (res.error) {
        showMessage(res.error, true);
    } else {
        showMessage(res.message);
        loadAdminData();
    }
}

async function deleteUser(id) {
    if (!confirm('Are you sure you want to delete this user? This cannot be undone.')) return;

    const res = await apiRequest(`/admin/users/${id}`, 'DELETE');
    if (res.error) {
        showMessage(res.error, true);
    } else {
        showMessage(res.message);
        loadAdminData();
    }
}

function downloadScript() {
    window.location.href = '/admin/download-script';
}

function copyToClipboard(btn) {
    const container = btn.closest('.code-block-container');
    const codeBlock = container.querySelector('.code-block');
    const text = codeBlock.innerText || codeBlock.textContent;

    navigator.clipboard.writeText(text).then(() => {
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = originalText, 2000);
    }).catch(err => {
        console.error('Failed to copy: ', err);
        showMessage('Failed to copy to clipboard', true);
    });
}

// Init
document.addEventListener('DOMContentLoaded', async () => {
    const path = window.location.pathname;

    if (path.includes('dashboard')) {
        const me = await apiRequest('/auth/me');
        if (!me.loggedIn) {
            window.location.href = '/index.html';
            return;
        }
        loadProfile();
        loadDeployConfig();
        loadAdminData();

        document.getElementById('logout-btn').addEventListener('click', async () => {
            await apiRequest('/auth/logout', 'POST');
            window.location.href = '/index.html';
        });

        document.getElementById('save-key-btn').addEventListener('click', updateSSHKey);

        // Deploy buttons
        document.getElementById('deploy-save-btn').addEventListener('click', saveDeployConfig);
        document.getElementById('deploy-start-btn').addEventListener('click', startDeploy);
        document.getElementById('deploy-stop-btn').addEventListener('click', stopDeploy);
        document.getElementById('deploy-analyze-btn').addEventListener('click', analyzeError);

        const dlBtn = document.getElementById('download-script-btn');
        if (dlBtn) dlBtn.addEventListener('click', downloadScript);

    } else {
        // Login/Register Page
        const loginForm = document.getElementById('login-form');
        const registerForm = document.getElementById('register-form');

        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const u = document.getElementById('login-username').value;
                const p = document.getElementById('login-password').value;
                login(u, p);
            });
        }

        if (registerForm) {
            registerForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const u = document.getElementById('reg-username').value;
                const p = document.getElementById('reg-password').value;
                register(u, p);
            });
        }
    }
});
