import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { api, ApiError, save } from '../src/services/api';
const original = globalThis.fetch;
const oldWindow = globalThis.window;
beforeEach(() => {
  globalThis.window = new EventTarget() as Window & typeof globalThis;
});
afterEach(() => {
  globalThis.fetch = original;
  globalThis.window = oldWindow;
});
describe('Go API client', () => {
  test('retains cookie authentication and cancellation signal', async () => {
    const controller = new AbortController();
    const fetcher = mock(async () => Response.json({ ready: true }));
    globalThis.fetch = fetcher as unknown as typeof fetch;
    expect(await api('/status', { signal: controller.signal })).toEqual({ ready: true });
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/status');
    expect(options.credentials).toBe('same-origin');
    expect(options.signal).toBe(controller.signal);
  });
  test('keeps validation errors without expiring the session', async () => {
    let expired = false;
    window.addEventListener('session-expired', () => (expired = true));
    globalThis.fetch = mock(async () =>
      Response.json({ error: 'Giá trị không hợp lệ' }, { status: 400 })
    ) as unknown as typeof fetch;
    try {
      await api('/settings');
      throw new Error('expected rejection');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).message).toBe('Giá trị không hợp lệ');
    }
    expect(expired).toBe(false);
  });
  test('only protected 401s clear the authenticated session', async () => {
    let count = 0;
    window.addEventListener('session-expired', () => count++);
    globalThis.fetch = mock(async () =>
      Response.json({ error: 'Đăng nhập lại' }, { status: 401 })
    ) as unknown as typeof fetch;
    await api('/login').catch(() => {});
    expect(count).toBe(0);
    await api('/settings').catch(() => {});
    expect(count).toBe(1);
  });
  test('serializes disabled schedules and preserves null fields', async () => {
    const fetcher = mock(async () => Response.json({ id: 'test' }));
    globalThis.fetch = fetcher as unknown as typeof fetch;
    await save('/schedules', { enabled: false, runAt: null }, 'POST');
    const [, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(options.method).toBe('POST');
    expect(JSON.parse(String(options.body))).toEqual({ enabled: false, runAt: null });
  });
});
