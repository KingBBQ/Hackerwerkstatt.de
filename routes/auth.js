const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../database');
const router = express.Router();

// Register Route
router.post('/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const stmt = db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)");
        stmt.run(username, hashedPassword, function (err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ error: 'Username already exists' });
                }
                return res.status(500).json({ error: 'Database error' });
            }
            // Auto login after register
            req.session.userId = this.lastID;
            req.session.username = username;
            req.session.isAdmin = 0; // Default not admin
            res.json({ message: 'Registration successful', redirect: '/dashboard.html' });
        });
        stmt.finalize();

    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Login Route
router.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const match = await bcrypt.compare(password, user.password_hash);
        if (match) {
            req.session.userId = user.id;
            req.session.username = user.username;
            req.session.isAdmin = user.is_admin;
            res.json({ message: 'Login successful', redirect: '/dashboard.html' });
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    });
});

// Logout Route
router.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: 'Logged out', redirect: '/index.html' });
});

// Get Current User (for frontend state)
router.get('/me', (req, res) => {
    if (req.session.userId) {
        res.json({
            loggedIn: true,
            username: req.session.username,
            isAdmin: req.session.isAdmin
        });
    } else {
        res.json({ loggedIn: false });
    }
});

module.exports = router;
