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
    if (res.error) return; // Not authorized or error

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

async function loadAdminData() {
    // Check if user is admin first
    const me = await apiRequest('/auth/me');
    if (me.isAdmin !== 1) {
        const adminSection = document.getElementById('admin-section');
        if (adminSection) adminSection.style.display = 'none'; // Hide if not admin
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
        li.innerHTML = `<strong>${u.username}</strong> ${u.is_admin ? '<span class="admin-badge">[ADMIN]</span>' : ''}<br>Key: ${u.ssh_key ? 'Present' : 'Missing'}`;
        list.appendChild(li);
    });
}

function downloadScript() {
    window.location.href = '/admin/download-script';
}

// Init
document.addEventListener('DOMContentLoaded', async () => {
    // Check path to run correct logic
    const path = window.location.pathname;

    if (path.includes('dashboard')) {
        const me = await apiRequest('/auth/me');
        if (!me.loggedIn) {
            window.location.href = '/index.html';
            return;
        }
        loadProfile();
        loadAdminData();

        document.getElementById('logout-btn').addEventListener('click', async () => {
            await apiRequest('/auth/logout', 'POST');
            window.location.href = '/index.html';
        });

        document.getElementById('save-key-btn').addEventListener('click', updateSSHKey);

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
