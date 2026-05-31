'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
const releaseType = args[0]; // 'patch', 'minor', 'major', 'beta-bump'
const releasePath = path.join(__dirname, 'data', 'system-release.json');

if (!['patch', 'minor', 'major', 'beta-bump'].includes(releaseType)) {
  console.error("❌ Invalid type. Use: patch, minor, major, or beta-bump");
  process.exit(1);
}

const currentData = JSON.parse(fs.readFileSync(releasePath, 'utf8'));
const currentVersion = currentData.version;
let [core, beta] = currentVersion.split('-beta.');

let [major, minor, patch] = core.split('.').map(Number);
let betaNum = beta ? parseInt(beta) : 0;

if (releaseType === 'major') { major++; minor = 0; patch = 0; betaNum = 0; }
if (releaseType === 'minor') { minor++; patch = 0; betaNum = 0; }
if (releaseType === 'patch') { patch++; betaNum = 0; }
if (releaseType === 'beta-bump') { 
  if (!beta) { patch++; betaNum = 1; } else { betaNum++; }
}

let newVersion = `${major}.${minor}.${patch}`;
if (betaNum > 0 || releaseType === 'beta-bump') {
  newVersion += `-beta.${betaNum}`;
}

const timestamp = new Date().toISOString();

// Push current state to history ledger
currentData.history.push({
  version: currentVersion,
  timestamp: currentData.buildTimestamp || timestamp
});

// Update SSoT
currentData.version = newVersion;
currentData.tier = betaNum > 0 ? 'beta' : 'production';
currentData.buildTimestamp = timestamp;

fs.writeFileSync(releasePath, JSON.stringify(currentData, null, 2));

console.log(`\n✅ SYSTEM RELEASE MANAGER`);
console.log(`─────────────────────────────`);
console.log(`Old Version : ${currentVersion}`);
console.log(`New Version : ${newVersion}`);
console.log(`Tier        : ${currentData.tier}`);
console.log(`Timestamp   : ${timestamp}`);
console.log(`─────────────────────────────`);

try {
  console.log('🔄 Hot-reloading architecture via PM2...');
  execSync('pm2 reload telgrarr', { stdio: 'ignore' });
  console.log(`🚀 v${newVersion} is now live.`);
} catch (err) {
  console.error('⚠️ PM2 reload failed. Manual restart required.');
}
