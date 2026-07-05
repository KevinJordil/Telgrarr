import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// FU-1 / O5 producer guard: emby.refreshLibrary refreshes (true, one POST) ONLY when
// refreshUrl AND apiKey are set; otherwise it skips (false, no POST). Idiom matches
// the other suites: deps injected into require.cache before emby is required.

const cfg = { emby: { refreshUrl: '', apiKey: '' } };
let posts = [];
let postCalls = [];
let nextError = null;

function stub(spec, exports) {
  const r = require.resolve(spec);
  require.cache[r] = { id: r, filename: r, loaded: true, exports };
}
stub('../src/config.js', cfg);
stub('axios', {
  post: async (u, data, options) => {
    postCalls.push({ url: u, data, options });
    if (nextError) { const err = nextError; nextError = null; throw err; }
    posts.push(u);
    return { status: 200 };
  },
});

const { refreshLibrary } = require('../src/emby.js');

beforeEach(() => { posts = []; postCalls = []; nextError = null; cfg.emby.refreshUrl = ''; cfg.emby.apiKey = ''; });

describe('emby.refreshLibrary (FU-1 / O5 — refresh only when fully configured)', () => {
  it('skips (false, no POST) when refreshUrl set but apiKey empty', async () => {
    cfg.emby.refreshUrl = 'http://emby/refresh';
    expect(await refreshLibrary()).toBe(false);
    expect(posts).toHaveLength(0);
  });

  it('skips (false, no POST) when refreshUrl empty', async () => {
    cfg.emby.apiKey = 'k';
    expect(await refreshLibrary()).toBe(false);
    expect(posts).toHaveLength(0);
  });

  it('passes a 10s timeout to axios.post (FA-43)', async () => {
    cfg.emby.refreshUrl = 'http://emby/refresh';
    cfg.emby.apiKey = 'k';
    await refreshLibrary();
    expect(postCalls).toHaveLength(1);
    expect(postCalls[0].options).toMatchObject({ timeout: 10000 });
  });

  it('propagates a hang/timeout rejection instead of swallowing it (FA-43)', async () => {
    cfg.emby.refreshUrl = 'http://emby/refresh';
    cfg.emby.apiKey = 'k';
    const timeoutErr = Object.assign(new Error('timeout of 10000ms exceeded'), { code: 'ECONNABORTED' });
    nextError = timeoutErr;
    await expect(refreshLibrary()).rejects.toThrow('timeout of 10000ms exceeded');
  });

  it('refreshes (true, one POST carrying api_key) when both set', async () => {
    cfg.emby.refreshUrl = 'http://emby/refresh';
    cfg.emby.apiKey = 'k';
    expect(await refreshLibrary()).toBe(true);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toContain('api_key=k');
  });
});
