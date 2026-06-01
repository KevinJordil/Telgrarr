const fs = require('fs');
const path = require('path');
require('./src/load-env')();   // RD-1: honor .env for DATA_DIR (no .env => no-op)
const { hashNew } = require('./src/auth/credentials');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');

const username = process.argv[2];
const password = process.argv[3];

if (!username || !password) {
  console.error('❌ Error: You must provide a username and password.');
  console.log('Usage: node setup-auth.js <username> <password>');
  process.exit(1);
}


const authData = { username, ...hashNew(password) };
const filePath = path.join(DATA_DIR, 'auth.json');

fs.writeFileSync(filePath, JSON.stringify(authData, null, 2));
console.log(`\n✅ SUCCESS: Secure credentials generated and saved to ${filePath}`);
