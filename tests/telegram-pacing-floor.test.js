import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('telegram pacing floor', () => {

  describe('schema validation', () => {
    it('rejects values below the 5000ms floor', async () => {
      const { validateSettings } = await import('../src/settings/validator.js');
      for (const bad of [500, 3000, 4999]) {
        const errors = validateSettings({ telegram: { delayMs: bad } });
        expect(errors.find(e => e.field === 'telegram.delayMs'),
          `expected rejection for ${bad}`).toBeTruthy();
      }
    });

    it('accepts values within the valid 5000-10000 range', async () => {
      const { validateSettings } = await import('../src/settings/validator.js');
      for (const good of [5000, 6000, 10000]) {
        const errors = validateSettings({ telegram: { delayMs: good } });
        expect(errors.find(e => e.field === 'telegram.delayMs'),
          `unexpected rejection for ${good}`).toBeFalsy();
      }
    });

    it('rejects values above the 10000ms ceiling', async () => {
      const { validateSettings } = await import('../src/settings/validator.js');
      const errors = validateSettings({ telegram: { delayMs: 10500 } });
      expect(errors.find(e => e.field === 'telegram.delayMs')).toBeTruthy();
    });
  });

  describe('boot migration', () => {
    let dir;
    const saved = {};
    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-pace-'));
      for (const k of ['DATA_DIR', 'LOGS_DIR', 'WEBHOOK_SECRET']) saved[k] = process.env[k];
      process.env.DATA_DIR = dir;
      process.env.LOGS_DIR = os.tmpdir();
      process.env.WEBHOOK_SECRET = 'test-fixture-secret';
      vi.resetModules();
    });
    afterEach(() => {
      for (const k of ['DATA_DIR', 'LOGS_DIR', 'WEBHOOK_SECRET']) {
        if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
      }
      fs.rmSync(dir, { recursive: true, force: true });
    });
    const load = async () => (await import('../src/config.js')).default;
    const cfgFile = () => path.join(dir, 'config.json');

    it('clamps a legacy sub-floor delayMs (500) to the schema minimum on boot', async () => {
      fs.writeFileSync(cfgFile(), JSON.stringify({ telegram: { delayMs: 500 } }));
      const config = await load();
      expect(config.telegram.delayMs).toBe(5000);
      const disk = JSON.parse(fs.readFileSync(cfgFile(), 'utf8'));
      expect(disk.telegram.delayMs).toBe(5000);
    });

    it('clamps the old default (3000) to the schema minimum on boot', async () => {
      fs.writeFileSync(cfgFile(), JSON.stringify({ telegram: { delayMs: 3000 } }));
      const config = await load();
      expect(config.telegram.delayMs).toBe(5000);
      const disk = JSON.parse(fs.readFileSync(cfgFile(), 'utf8'));
      expect(disk.telegram.delayMs).toBe(5000);
    });

    it('is a no-op when delayMs is already at or above the floor', async () => {
      fs.writeFileSync(cfgFile(), JSON.stringify({
        webhookSecret: 'pre-set',
        telegram: { delayMs: 7000 }
      }));
      const config = await load();
      expect(config.telegram.delayMs).toBe(7000);
      const disk = JSON.parse(fs.readFileSync(cfgFile(), 'utf8'));
      expect(disk.telegram.delayMs).toBe(7000);
    });

    it('fresh install (no config.json) gets the new 6000ms default', async () => {
      const config = await load();
      expect(config.telegram.delayMs).toBe(6000);
    });
  });

});
