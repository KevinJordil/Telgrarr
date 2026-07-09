import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

describe('Docker RESTART_CAPABLE parity (FA-57 / F13g)', () => {
  const compose = fs.readFileSync(path.join(ROOT, 'docker-compose.yml'), 'utf8');
  const dockerfile = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8');
  const envExample = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');

  describe('docker-compose.yml', () => {
    it('still declares the real Docker restart policy', () => {
      expect(compose).toMatch(/^\s*restart:\s*unless-stopped\s*$/m);
    });

    it('bakes RESTART_CAPABLE on by default via interpolation, not a hardcoded literal', () => {
      expect(compose).toMatch(/^\s*RESTART_CAPABLE:\s*"\$\{RESTART_CAPABLE:-1\}"\s*$/m);
    });

    it('wires the restart policy and the capability default into the SAME service block', () => {
      const serviceBlock = compose.slice(compose.indexOf('services:'), compose.indexOf('\nvolumes:'));
      expect(serviceBlock).toContain('restart: unless-stopped');
      expect(serviceBlock).toContain('RESTART_CAPABLE: "${RESTART_CAPABLE:-1}"');
    });
  });

  describe('Dockerfile', () => {
    it('pairs --restart and RESTART_CAPABLE together in the documented bare docker run example', () => {
      const runBlock = dockerfile.slice(dockerfile.indexOf('# Run:'), dockerfile.indexOf('# Init:'));
      expect(runBlock).toContain('--restart unless-stopped');
      expect(runBlock).toContain('-e RESTART_CAPABLE=1');
    });

    it('leaves the baked image ENV block free of a hardcoded RESTART_CAPABLE default', () => {
      const envBlock = dockerfile.slice(dockerfile.indexOf('ENV NODE_ENV'), dockerfile.indexOf('VOLUME'));
      expect(envBlock).not.toContain('RESTART_CAPABLE');
    });
  });

  describe('.env.example', () => {
    it('documents that the shipped docker-compose.yml already sets RESTART_CAPABLE by default', () => {
      expect(envExample).toMatch(/Docker via the shipped docker-compose\.yml\s*-> already set/);
    });

    it('still documents the systemd / bare-docker-run manual path', () => {
      expect(envExample).toMatch(/systemd \(Restart=always\)\s*-> RESTART_CAPABLE=1/);
    });
  });
});
