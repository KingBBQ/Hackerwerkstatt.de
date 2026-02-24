const express = require('express');
const db = require('../database');
const router = express.Router();

// Middleware to check if admin
const isAdmin = (req, res, next) => {
    if (req.session.userId && req.session.isAdmin === 1) {
        return next();
    }
    res.status(403).json({ error: 'Access denied: Admins only' });
};

// Get all users (for admin dashboard)
router.get('/users', isAdmin, (req, res) => {
    db.all("SELECT id, username, ssh_key, is_admin, is_verified, git_repo, subdomain, deploy_status FROM users", (err, rows) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(rows);
    });
});

// Verify/unverify a user
router.post('/users/:id/verify', isAdmin, (req, res) => {
    const userId = req.params.id;
    const { verified } = req.body;
    const value = verified ? 1 : 0;

    db.run("UPDATE users SET is_verified = ? WHERE id = ?", [value, userId], function (err) {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ message: verified ? 'User verifiziert.' : 'Verifizierung entzogen.' });
    });
});

// Delete user
router.delete('/users/:id', isAdmin, (req, res) => {
    const userId = req.params.id;

    // Prevent self-deletion
    if (parseInt(userId) === req.session.userId) {
        return res.status(400).json({ error: 'Cannot delete yourself' });
    }

    db.run("DELETE FROM users WHERE id = ?", [userId], function (err) {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ message: 'User deleted successfully' });
    });
});

// Generate setup script
router.get('/download-script', isAdmin, (req, res) => {
    db.all("SELECT username, ssh_key FROM users", (err, rows) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }

        let scriptContent = `#!/bin/bash
# Auto-generated setup script for Hackerwerkstatt
# Run as root

echo "Starting user setup..."

`;

        rows.forEach(user => {
            // Sanitize username to be safe for filenames/system users (basic alphanumeric)
            const safeUsername = user.username.replace(/[^a-z0-9]/gi, '').toLowerCase();

            if (safeUsername !== user.username) {
                scriptContent += `# Note: Username '${user.username}' converted to lowercase '${safeUsername}' for system compatibility.\n`;
                // We continue using safeUsername
            }

            scriptContent += `
# Setup for user: ${safeUsername}
if id "${safeUsername}" &>/dev/null; then
    echo "User ${safeUsername} already exists"
else
    echo "Creating user ${safeUsername}..."
    useradd -m -s /bin/bash ${safeUsername}
    # Add to sudo group (adjust 'sudo' or 'wheel' depending on distro, ubuntu uses sudo)
    usermod -aG sudo ${safeUsername} || usermod -aG wheel ${safeUsername}
fi

`;
            if (user.ssh_key) {
                scriptContent += `
# Setup SSH key for ${safeUsername}
mkdir -p /home/${safeUsername}/.ssh
echo "${user.ssh_key}" > /home/${safeUsername}/.ssh/authorized_keys
chown -R ${safeUsername}:${safeUsername} /home/${safeUsername}/.ssh
chmod 700 /home/${safeUsername}/.ssh
chmod 600 /home/${safeUsername}/.ssh/authorized_keys
echo "SSH access configured for ${safeUsername}"
`;
            } else {
                scriptContent += `# No SSH key provided for ${safeUsername}\n`;
            }
        });

        scriptContent += `
echo "Setup complete!"
`;

        res.setHeader('Content-Type', 'application/x-sh');
        res.setHeader('Content-Disposition', 'attachment; filename=setup_users.sh');
        res.send(scriptContent);
    });
});

module.exports = router;
