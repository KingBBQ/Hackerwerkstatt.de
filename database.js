const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'hackerwerkstatt.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Could not connect to database', err);
    } else {
        console.log('Connected to database');
    }
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        ssh_key TEXT,
        is_admin INTEGER DEFAULT 0,
        is_verified INTEGER DEFAULT 0,
        git_repo TEXT,
        subdomain TEXT,
        app_port INTEGER DEFAULT 80,
        deploy_status TEXT DEFAULT 'none',
        deploy_log TEXT DEFAULT '',
        ai_api_key TEXT
    )`);

    // Migrations for existing databases
    const migrations = [
        "ALTER TABLE users ADD COLUMN is_verified INTEGER DEFAULT 0",
        "ALTER TABLE users ADD COLUMN git_repo TEXT",
        "ALTER TABLE users ADD COLUMN subdomain TEXT",
        "ALTER TABLE users ADD COLUMN app_port INTEGER DEFAULT 80",
        "ALTER TABLE users ADD COLUMN deploy_status TEXT DEFAULT 'none'",
        "ALTER TABLE users ADD COLUMN deploy_log TEXT DEFAULT ''",
        "ALTER TABLE users ADD COLUMN ai_api_key TEXT"
    ];
    migrations.forEach(sql => {
        db.run(sql, (err) => {
            // Ignore "duplicate column" errors from re-runs
            if (err && !err.message.includes('duplicate column')) {
                console.error('Migration error:', err.message);
            }
        });
    });
});

module.exports = db;
