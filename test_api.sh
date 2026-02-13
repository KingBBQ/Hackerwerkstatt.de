#!/bin/bash

BASE_URL="http://localhost:3000"
COOKIE_JAR="cookies.txt"

echo "Testing Registration..."
curl -s -c $COOKIE_JAR -b $COOKIE_JAR -X POST "$BASE_URL/auth/register" \
    -H "Content-Type: application/json" \
    -d '{"username": "testuser", "password": "password123"}' | grep "Registration successful" || echo "Registration FAILED"

echo "Testing Login..."
curl -s -c $COOKIE_JAR -b $COOKIE_JAR -X POST "$BASE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"username": "testuser", "password": "password123"}' | grep "Login successful" || echo "Login FAILED"

echo "Testing SSH Key Upload..."
curl -s -c $COOKIE_JAR -b $COOKIE_JAR -X POST "$BASE_URL/user/ssh-key" \
    -H "Content-Type: application/json" \
    -d '{"sshKey": "ssh-ed25519 AAAAC3NzaC1FAKEKEY"}' | grep "SSH key updated" || echo "SSH Key Upload FAILED"

echo "Testing Admin Access (Should Fail)..."
curl -s -c $COOKIE_JAR -b $COOKIE_JAR -X GET "$BASE_URL/admin/users" | grep "Access denied" || echo "Admin Access Restriction FAILED (or unexpectedly succeeded)"

# Make user admin manually
echo "Promoting user to admin via DB..."
# Make user admin manually using Node.js
echo "Promoting user to admin via DB..."
node -e 'const db = require("./database"); setTimeout(() => { db.run("UPDATE users SET is_admin = 1 WHERE username = ?", ["testuser"], (err) => { if(err) console.error(err); else console.log("Promoted user to admin"); }); }, 1000);'


echo "Testing Admin Access (Should Succeed)..."
# Re-login to update session
curl -s -c $COOKIE_JAR -b $COOKIE_JAR -X POST "$BASE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"username": "testuser", "password": "password123"}' > /dev/null

curl -s -c $COOKIE_JAR -b $COOKIE_JAR -X GET "$BASE_URL/admin/users" | grep "testuser" || echo "Admin Access FAILED"

echo "Testing Script Download..."
curl -s -c $COOKIE_JAR -b $COOKIE_JAR -X GET "$BASE_URL/admin/download-script" | head -n 5 || echo "Script Download FAILED"

rm $COOKIE_JAR
