/**
 * Cron-Zweig der Wetter-Hinweise (Kategorie `weather`): Zustellung, Entdopplung,
 * Ruhezeit — mit gemocktem Redis, Web-Push und Open-Meteo.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();
const sendNotification = vi.fn(async () => undefined);

vi.mock('./_shared.js', () => ({
  ensureVapid: () => true,
  hashEndpoint: (e: string) => e,
  subKey: (h: string) => `sub:${h}`,
  sentKey: (h: string, id: string) => `sent:${h}:${id}`,
  SUBS_SET: 'subs',
  webpush: { sendNotification: (...a: unknown[]) => sendNotification(...(a as [])) },
  redis: {
    smembers: async () => ['h1'],
    get: async (k: string) => store.get(k) ?? null,
    set: async (k: string, v: unknown, opts?: { nx?: boolean }) => {
      if (opts?.nx && store.has(k)) return null;
      store.set(k, v);
      return 'OK';
    },
    del: async (k: string) => store.delete(k),
    srem: async () => 1,
  },
}));

import handler from './cron';

const NOW = new Date('2026-06-01T12:00:00Z');

function nowcastJson(gusts: number[], code = 3) {
  const t0 = Math.floor(NOW.getTime() / 1000);
  return {
    utc_offset_seconds: 7200,
    current: { time: t0, weather_code: code, cloud_cover: 90, wind_gusts_10m: 20, precipitation: 0, is_day: 1 },
    minutely_15: {
      time: gusts.map((_, i) => t0 + i * 900),
      weather_code: gusts.map(() => code),
      cloud_cover: gusts.map(() => 90),
      wind_gusts_10m: gusts,
      precipitation: gusts.map(() => 0),
    },
  };
}

const res = () => {
  const r = { code: 0, body: undefined as unknown, status(c: number) { r.code = c; return r; }, json(b: unknown) { r.body = b; } };
  return r;
};

const sub = (tz = 'Europe/Berlin') => ({
  endpoint: 'h1',
  keys: { p256dh: 'p', auth: 'a' },
  lat: 49.87,
  lon: 8.65,
  tz,
  lang: 'de',
  categories: ['weather'],
  createdAt: 0,
});

beforeEach(() => {
  store.clear();
  sendNotification.mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  process.env.CRON_SECRET = 's';
});

function run() {
  const r = res();
  return handler({ headers: { authorization: 'Bearer s' }, query: {} } as never, r as never).then(() => r);
}

describe('cron weather', () => {
  it('stellt einen Windhinweis zu und entdoppelt beim zweiten Lauf', async () => {
    store.set('sub:h1', sub());
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(nowcastJson([20, 20, 20, 20, 55, 55, 55, 55])))));

    const first = await run();
    expect(sendNotification).toHaveBeenCalledTimes(1);
    const payload = JSON.parse((sendNotification.mock.calls[0] as unknown[])[1] as string);
    expect(payload.body).toBe('Achtung, es wird windig – Böen bis 55 km/h.');
    expect((first.body as { sent: number }).sent).toBe(1);

    await run();
    expect(sendNotification).toHaveBeenCalledTimes(1); // innerhalb der 3 h kein zweites Mal
  });

  it('ruft den Wetterdienst nur einmal je gerundetem Ort ab', async () => {
    store.set('sub:h1', sub());
    const f = vi.fn(async () => new Response(JSON.stringify(nowcastJson([20, 20, 20, 20, 20, 20, 20, 20]))));
    vi.stubGlobal('fetch', f);
    await run();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('schweigt nachts außer bei Sturm', async () => {
    // 12:00 UTC ist in Honolulu 2 Uhr nachts: Ruhezeit, nur Sturm darf durch.
    store.set('sub:h1', sub('Pacific/Honolulu'));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(nowcastJson([20, 20, 20, 20, 55, 55, 55, 55])))));
    await run();
    expect(sendNotification).not.toHaveBeenCalled();

    store.clear();
    store.set('sub:h1', sub('Pacific/Honolulu'));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(nowcastJson([20, 20, 20, 20, 90, 90, 90, 90])))));
    await run();
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(JSON.parse((sendNotification.mock.calls[0] as unknown[])[1] as string).body).toBe('Ein Sturm zieht auf.');
  });

  it('räumt ein totes Abo (410) auf', async () => {
    store.set('sub:h1', sub());
    sendNotification.mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(nowcastJson([20, 20, 20, 20, 55, 55, 55, 55])))));
    const r = await run();
    expect((r.body as { pruned: number }).pruned).toBe(1);
    expect(store.has('sub:h1')).toBe(false);
  });
});
