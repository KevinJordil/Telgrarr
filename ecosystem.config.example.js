// ecosystem.config.example.js — PM2 process definition (TEMPLATE).
// Copy to ecosystem.config.js (git-ignored) and adjust for your host:
//     cp ecosystem.config.example.js ecosystem.config.js && pm2 start ecosystem.config.js
// PM2 is OPTIONAL: `npm start` (= node src/index.js) runs with no manager at all.
// Portability (D-A): NO machine-specific paths or interpreters in shipped code.
module.exports = {
  apps: [
    {
      name:          'telgrarr',
      script:        'src/index.js',
      // cwd = this config file's directory (project root). No absolute path.
      cwd:           __dirname,
      // interpreter intentionally omitted: PM2 uses `node` from PATH (nvm, system,
      // Docker all work). Pin a path here only if your host requires a specific node.
      watch:         false,
      autorestart:   true,
      restart_delay: 5000,
      max_restarts:  10,
      env: {
        NODE_ENV: 'production',
        // --- TELGRARR env (uncomment + set as needed) ------------------------
        // Precedence: real env (set here by PM2) > .env > data/config.json > defaults.
        // Leave unset for safe defaults (see .env.example).
        // DATA_DIR:       '/absolute/path/to/data',  // default: <root>/data
        // PORT:           '3400',                     // default: 3400
        // HOST:           '0.0.0.0',                  // default: 0.0.0.0
        // CORS_ORIGIN:    '',                         // default: '' (same-origin only)
        // TRUST_PROXY:    '',                         // default: '' (off); 'true' behind one proxy
        // WEBHOOK_SECRET: '',                         // consumed in Phase C (webhook auth)
        // COOKIE_SECURE:  'auto',                     // consumed in Phase C (cookie Secure)
      },
    },
  ],
};
