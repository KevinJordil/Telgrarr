import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { retryWithBackoff, JITTER_RATIO } = require('../src/utils/retry.js');

const retryable = (msg = 'retry') => Object.assign(new Error(msg), { retryable: true });
const fatal = (msg = 'fatal') => Object.assign(new Error(msg), { retryable: false });
const shouldRetry = (e) => e.retryable === true;

describe('retryWithBackoff — pure retry primitive (WR-10 / C-GUARD)', () => {
  it('returns the result without retrying on first success (no sleep)', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const sleepFn = vi.fn().mockResolvedValue();
    await expect(retryWithBackoff(fn, { shouldRetry, sleepFn })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleepFn).not.toHaveBeenCalled();
  });

  it('does not retry a non-retryable error (one attempt, no sleep)', async () => {
    const fn = vi.fn().mockRejectedValue(fatal());
    const sleepFn = vi.fn().mockResolvedValue();
    await expect(retryWithBackoff(fn, { shouldRetry, sleepFn, jitter: false }))
      .rejects.toThrow('fatal');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleepFn).not.toHaveBeenCalled();
  });

  it('retries a retryable error then succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(retryable())
      .mockRejectedValueOnce(retryable())
      .mockResolvedValue('ok');
    const sleepFn = vi.fn().mockResolvedValue();
    await expect(retryWithBackoff(fn, { shouldRetry, sleepFn, jitter: false, maxAttempts: 4 }))
      .resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleepFn).toHaveBeenCalledTimes(2);
  });

  it('caps total attempts at maxAttempts and throws the last error', async () => {
    const fn = vi.fn().mockRejectedValue(retryable('boom'));
    const sleepFn = vi.fn().mockResolvedValue();
    await expect(retryWithBackoff(fn, { shouldRetry, sleepFn, jitter: false, maxAttempts: 3 }))
      .rejects.toThrow('boom');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleepFn).toHaveBeenCalledTimes(2); // no sleep after final failure
  });

  it('honors getRetryAfterMs literally — even when greater than maxDelayMs', async () => {
    const fn = vi.fn().mockRejectedValueOnce(retryable()).mockResolvedValue('ok');
    const sleepFn = vi.fn().mockResolvedValue();
    await retryWithBackoff(fn, {
      shouldRetry, sleepFn, jitter: false,
      baseDelayMs: 100, maxDelayMs: 1000,
      getRetryAfterMs: () => 5000,
    });
    expect(sleepFn).toHaveBeenCalledWith(5000);
  });

  it('falls back to exponential backoff when getRetryAfterMs returns undefined', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(retryable())
      .mockRejectedValueOnce(retryable())
      .mockResolvedValue('ok');
    const sleepFn = vi.fn().mockResolvedValue();
    await retryWithBackoff(fn, {
      shouldRetry, sleepFn, jitter: false,
      baseDelayMs: 100, maxDelayMs: 10000,
      getRetryAfterMs: () => undefined,
    });
    expect(sleepFn.mock.calls.map((c) => c[0])).toEqual([100, 200]);
  });

  it('caps exponential backoff at maxDelayMs', async () => {
    const fn = vi.fn().mockRejectedValue(retryable());
    const sleepFn = vi.fn().mockResolvedValue();
    await retryWithBackoff(fn, {
      shouldRetry, sleepFn, jitter: false,
      baseDelayMs: 1000, maxDelayMs: 1500, maxAttempts: 4,
    }).catch(() => {});
    expect(sleepFn.mock.calls.map((c) => c[0])).toEqual([1000, 1500, 1500]);
  });

  it('adds additive jitter bounded to +JITTER_RATIO * base (upper bound)', async () => {
    const fn = vi.fn().mockRejectedValueOnce(retryable()).mockResolvedValue('ok');
    const sleepFn = vi.fn().mockResolvedValue();
    await retryWithBackoff(fn, {
      shouldRetry, sleepFn, jitter: true, random: () => 1,
      baseDelayMs: 200, maxDelayMs: 1000,
    });
    expect(sleepFn.mock.calls[0][0]).toBe(200 * (1 + JITTER_RATIO));
  });

  it('jitter at random()=0 equals base exactly (lower bound — never shorter)', async () => {
    const fn = vi.fn().mockRejectedValueOnce(retryable()).mockResolvedValue('ok');
    const sleepFn = vi.fn().mockResolvedValue();
    await retryWithBackoff(fn, {
      shouldRetry, sleepFn, jitter: true, random: () => 0,
      baseDelayMs: 200, maxDelayMs: 1000,
    });
    expect(sleepFn.mock.calls[0][0]).toBe(200);
  });

  it('throws TypeError when fn is not a function', () => {
    expect(() => retryWithBackoff(null, { shouldRetry })).toThrow(TypeError);
  });
});
