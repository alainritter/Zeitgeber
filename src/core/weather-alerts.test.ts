/**
 * Validierung der Wetter-Hinweise (Spec §28).
 */

import { describe, expect, it } from 'vitest';
import {
  applyQuietPolicy,
  detectWeatherAlerts,
  localHour,
  nowcastUrl,
  parseNowcast,
  topAlert,
  type NowcastStep,
  type WeatherSnapshot,
} from './weather-alerts';

const T0 = new Date('2026-06-01T12:00:00Z');
const step = (min: number, o: Partial<NowcastStep> = {}): NowcastStep => ({
  at: new Date(T0.getTime() + min * 60_000),
  code: 3,
  cloudCover: 90,
  gustKmh: 20,
  precipMm: 0,
  ...o,
});
const steps = (o: (i: number) => Partial<NowcastStep> = () => ({})): NowcastStep[] =>
  Array.from({ length: 8 }, (_, i) => step(i * 15, o(i)));
const base: WeatherSnapshot = { code: 3, cloudCover: 90, gustKmh: 20, precipMm: 0, isDay: true };
const types = (a: { type: string }[]): string[] => a.map((x) => x.type);

describe('detectWeatherAlerts', () => {
  it('meldet nichts bei ruhigem Wetter', () => {
    expect(detectWeatherAlerts(base, steps(), T0)).toEqual([]);
  });

  it('sun: Wolken jetzt, in einer Stunde klar und trocken', () => {
    const s = steps((i) => (i >= 3 ? { cloudCover: 20, code: 1 } : {}));
    expect(types(detectWeatherAlerts(base, s, T0))).toContain('sun');
  });

  it('sun: nicht bei Nacht und nicht, wenn es schon klar ist', () => {
    const s = steps((i) => (i >= 3 ? { cloudCover: 20, code: 1 } : {}));
    expect(types(detectWeatherAlerts({ ...base, isDay: false }, s, T0))).not.toContain('sun');
    expect(types(detectWeatherAlerts({ ...base, cloudCover: 30 }, s, T0))).not.toContain('sun');
  });

  it('wind: Böen ab 50 km/h bei ruhigem Jetzt', () => {
    const s = steps((i) => (i === 4 ? { gustKmh: 55 } : {}));
    const a = detectWeatherAlerts(base, s, T0);
    expect(types(a)).toEqual(['wind']);
    expect(a[0].gustKmh).toBe(55);
  });

  it('wind: nicht, wenn es jetzt schon böig ist', () => {
    const s = steps((i) => (i === 4 ? { gustKmh: 55 } : {}));
    expect(types(detectWeatherAlerts({ ...base, gustKmh: 45 }, s, T0))).not.toContain('wind');
  });

  it('storm: Gewitter-Code oder Böen ab 75 km/h', () => {
    expect(types(detectWeatherAlerts(base, steps((i) => (i === 5 ? { code: 95 } : {})), T0))).toContain('storm');
    expect(types(detectWeatherAlerts(base, steps((i) => (i === 2 ? { gustKmh: 80 } : {})), T0))).toContain('storm');
  });

  it('rain: trocken jetzt, Regen innerhalb einer Stunde, mit Zeitpunkt', () => {
    const s = steps((i) => (i >= 2 ? { precipMm: 0.4, code: 61 } : {}));
    const a = detectWeatherAlerts(base, s, T0).find((x) => x.type === 'rain');
    expect(a?.at.getTime()).toBe(T0.getTime() + 30 * 60_000);
  });

  it('rain: nicht, wenn es schon regnet oder erst nach über einer Stunde', () => {
    const wet = steps((i) => (i >= 2 ? { precipMm: 0.4 } : {}));
    expect(types(detectWeatherAlerts({ ...base, precipMm: 0.5, code: 61 }, wet, T0))).not.toContain('rain');
    const late = steps((i) => (i >= 6 ? { precipMm: 0.4 } : {}));
    expect(types(detectWeatherAlerts(base, late, T0))).not.toContain('rain');
  });
});

describe('applyQuietPolicy', () => {
  const storm = { type: 'storm' as const, at: T0, msgKey: 'x' };
  const wind = { type: 'wind' as const, at: T0, msgKey: 'x' };
  const sun = { type: 'sun' as const, at: T0, msgKey: 'x' };

  it('Sturm schlägt Wind', () => {
    expect(types(applyQuietPolicy([wind, storm], 12))).toEqual(['storm']);
  });
  it('nachts nur Sturm', () => {
    expect(types(applyQuietPolicy([sun, wind, storm], 23))).toEqual(['storm']);
    expect(types(applyQuietPolicy([sun, wind], 3))).toEqual([]);
    expect(types(applyQuietPolicy([sun, wind], 6))).toEqual(['sun', 'wind']);
  });
});

describe('localHour', () => {
  it('nutzt die IANA-Zone', () => {
    expect(localHour(new Date('2026-06-01T12:00:00Z'), 'Asia/Tokyo')).toBe(21);
    expect(localHour(new Date('2026-06-01T12:00:00Z'), 'Australia/Sydney')).toBe(22);
  });
  it('fällt auf den UTC-Versatz zurück', () => {
    expect(localHour(new Date('2026-06-01T12:00:00Z'), undefined, 7200)).toBe(14);
    expect(localHour(new Date('2026-06-01T12:00:00Z'), 'Kein/Ort', -3600)).toBe(11);
  });
});

describe('topAlert', () => {
  it('ordnet Sturm vor Wind vor Regen vor Sonne', () => {
    const mk = (type: 'sun' | 'rain' | 'wind' | 'storm') => ({ type, at: T0, msgKey: 'x' });
    expect(topAlert([mk('sun'), mk('rain')])?.type).toBe('rain');
    expect(topAlert([mk('sun'), mk('wind'), mk('storm')])?.type).toBe('storm');
    expect(topAlert([])).toBeNull();
  });
});

describe('parseNowcast', () => {
  const json = {
    utc_offset_seconds: 7200,
    current: { time: 1794934800, weather_code: 3, cloud_cover: 100, wind_gusts_10m: 37.1, precipitation: 0, is_day: 0 },
    minutely_15: {
      time: [1794934800, 1794935700],
      weather_code: [3, null],
      cloud_cover: [100, 98],
      wind_gusts_10m: [37.1, 37.4],
      precipitation: [0, 0.2],
    },
  };
  it('übersetzt die Antwort und füllt null mit 0', () => {
    const n = parseNowcast(json)!;
    expect(n.now).toEqual({ code: 3, cloudCover: 100, gustKmh: 37.1, precipMm: 0, isDay: false });
    expect(n.steps).toHaveLength(2);
    expect(n.steps[1].code).toBe(0);
    expect(n.steps[0].at.getTime()).toBe(1794934800_000);
    expect(n.utcOffsetSeconds).toBe(7200);
  });
  it('liefert null bei unbrauchbarer Antwort', () => {
    expect(parseNowcast(null)).toBeNull();
    expect(parseNowcast({ current: json.current })).toBeNull();
  });
  it('baut eine URL mit Unixzeit und Zeitzone auto', () => {
    const u = nowcastUrl(-33.87, 151.21);
    expect(u).toContain('latitude=-33.8700');
    expect(u).toContain('timeformat=unixtime');
    expect(u).toContain('timezone=auto');
  });
});
