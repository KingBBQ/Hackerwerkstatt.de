const db = require('./database');

const username = process.argv[2];

if (!username) {
    console.error('Please provide a username.');
    console.error('Usage: node make_admin.js <username>');
    process.exit(1);
}

db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
    if (err) {
        console.error('Error querying database:', err.message);
        process.exit(1);
    }
    if (!row) {
        console.error(`User '${username}' not found.`);
        process.exit(1);
    }

    db.run('UPDATE users SET is_admin = 1 WHERE username = ?', [username], function (err) {
        if (err) {
            console.error('Error updating user:', err.message);
            process.exit(1);
        }
        console.log(`Successfully promoted user '${username}' to admin.`);
        // Close db connection if needed, though process exit handles it.
    });
});
