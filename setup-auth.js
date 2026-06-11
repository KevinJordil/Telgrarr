const fs = require('fs');
const path = require('path');
const readline = require('readline');
require('./src/load-env')();   // RD-1: honor .env for DATA_DIR (no .env => no-op)
const { hashNew } = require('./src/auth/credentials');
const writeFileAtomic = require('write-file-atomic');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const MIN_PASSWORD_LENGTH = 8;   // mirrors auth.routes change/recover (S7)

// Interactive (TTY): one reused readline interface; password prompts are echo-
// suppressed so the secret never renders and never lands in argv/ps/history (S7).
async function promptTTY() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  let muted = false;
  rl._writeToOutput = (str) => { if (!muted) process.stdout.write(str); };
  const ask = (query, hidden = false) => new Promise((resolve) => {
    muted = false;
    rl.question(query, (answer) => {
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    });
    if (hidden) muted = true;   // query already written; mute keystrokes only
  });
  const username = (await ask('Username: ')).trim();
  const password = await ask('Password: ', true);
  const confirm  = await ask('Confirm password: ', true);
  rl.close();
  return { username, password, confirm };
}

// Non-interactive (piped stdin): read it all, then take lines 1-3
// (username, password, confirm). Per-prompt reads race on a pipe.
function readPiped() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => {
      const lines = data.split(/\r?\n/);
      const username = (lines[0] || '').trim();
      const password = lines[1] || '';
      const confirm  = lines.length >= 3 ? lines[2] : password;
      resolve({ username, password, confirm });
    });
  });
}

async function main() {
  const { username, password, confirm } =
    process.stdin.isTTY ? await promptTTY() : await readPiped();

  if (!username) {
    console.error('❌  Error: username cannot be empty.');
    process.exit(1);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`❌  Error: password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    process.exit(1);
  }
  if (password !== confirm) {
    console.error('❌  Error: passwords do not match.');
    process.exit(1);
  }

  const authData = { username, ...hashNew(password) };
  const filePath = path.join(DATA_DIR, 'auth.json');
  fs.mkdirSync(DATA_DIR, { recursive: true });   // PR-1: fresh clone has no data/ (gitignored)
  writeFileAtomic.sync(filePath, JSON.stringify(authData, null, 2), { mode: 0o600 });   // PR-2: owner-only
  console.log(`\n✅  SUCCESS: Secure credentials generated and saved to ${filePath}`);
}

main().catch((err) => {
  console.error(`❌  Error: ${err.message}`);
  process.exit(1);
});
