const express = require('express');
const db = require('../database');
const router = express.Router();

// Middleware to check if logged in
const isAuthenticated = (req, res, next) => {
    if (req.session.userId) {
        return next();
    }
    res.status(401).json({ error: 'Unauthorized' });
};

// Get User Profile (SSH Key)
router.get('/profile', isAuthenticated, (req, res) => {
    db.get("SELECT username, ssh_key FROM users WHERE id = ?", [req.session.userId], (err, row) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(row);
    });
});

// Update SSH Key
router.post('/ssh-key', isAuthenticated, (req, res) => {
    const { sshKey } = req.body;

    // Basic validation for SSH key format could be added here
    if (!sshKey || !sshKey.trim().startsWith('ssh-')) {
        return res.status(400).json({ error: 'Invalid SSH key format. Must start with ssh-rsa, ssh-ed25519, etc.' });
    }

    const stmt = db.prepare("UPDATE users SET ssh_key = ? WHERE id = ?");
    stmt.run(sshKey.trim(), req.session.userId, function (err) {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ message: 'SSH key updated successfully' });
    });
    stmt.finalize();
});

module.exports = router;
