import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// H5.0 (SD-11/SD-1): webhook secret is auto-generated + persisted on FIRST boot only
// when neither env nor the config.json file tier supplies one. env-set wins and is
// never persisted; an existing file secret is left untouched (idempotent).
describe('webhook secret first-boot auto-gen', () => {
  let dir;
  const saved = {};
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-h50-'));
    for (const k of ['DATA_DIR', 'LOGS_DIR', 'WEBHOOK_SECRET']) saved[k] = process.env[k];
    process.env.DATA_DIR = dir;
    process.env.LOGS_DIR = os.tmpdir();
    delete process.env.WEBHOOK_SECRET;
    vi.resetModules();
  });
  afterEach(() => {
    for (const k of ['DATA_DIR', 'LOGS_DIR', 'WEBHOOK_SECRET']) {
      if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const load = async () => (await import('../src/config.js')).default;
  const file = () => path.join(dir, 'config.json');

  it('env-set: no generation, nothing persisted, env value is effective', async () => {
    process.env.WEBHOOK_SECRET = 'env-secret-fixture';
    vi.resetModules();
    const config = await load();
    expect(fs.existsSync(file())).toBe(false);
    expect(config.webhookSecret).toBeUndefined();
    expect(config.WEBHOOK_SECRET).toBe('env-secret-fixture');
  });

  it('both empty: generates a 256-bit base64url secret, persists it, effective matches', async () => {
    const config = await load();
    expect(fs.existsSync(file())).toBe(true);
    const disk = JSON.parse(fs.readFileSync(file(), 'utf8'));
    expect(disk.webhookSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(config.WEBHOOK_SECRET).toBe(disk.webhookSecret);
  });

  it('existing file secret: untouched (idempotent), no regeneration', async () => {
    fs.writeFileSync(file(), JSON.stringify({ webhookSecret: 'preexisting-fixture-secret' }));
    const config = await load();
    const disk = JSON.parse(fs.readFileSync(file(), 'utf8'));
    expect(disk.webhookSecret).toBe('preexisting-fixture-secret');
    expect(config.WEBHOOK_SECRET).toBe('preexisting-fixture-secret');
  });

  // H5.1 - rotation surface
  it('rotation: generateWebhookSecret is 256-bit base64url, unique per call', async () => {
    const mod = await import('../src/auth/webhook-token.js');
    const g = mod.generateWebhookSecret ?? mod.default.generateWebhookSecret;
    const a = g(), b = g();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it('rotation: policy flags a changed webhookSecret as restart-required', async () => {
    const config = await load();
    const pol = await import('../src/settings/policy.js');
    const needsRestart = pol.needsRestart ?? pol.default.needsRestart;
    expect(needsRestart({ webhookSecret: 'rotated-value' })).toBe(true);
    expect(needsRestart({ webhookSecret: config.webhookSecret })).toBe(false);
    expect(needsRestart({})).toBe(false);
  });

  it('rotation: save({ webhookSecret }) persists the new secret to the file tier', async () => {
    const config = await load();
    expect(config.webhookSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await config.save({ webhookSecret: 'rotated-fixture-secret' });
    const disk = JSON.parse(fs.readFileSync(file(), 'utf8'));
    expect(disk.webhookSecret).toBe('rotated-fixture-secret');
  });
});
