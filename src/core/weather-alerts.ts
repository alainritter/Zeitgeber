/**
 * weather-alerts — Wetter-Hinweise aus einer Kurzfrist-Vorhersage (Spec §28).
 *
 * Rein und ohne Netzwerk-Zugriff, damit derselbe Kern im Client (Hinweiszeile)
 * und im Cron (Web Push, api/cron.ts) läuft. Nur der Abruf selbst liegt außerhalb.
 * Rein beschreibend, keine Warnung im amtlichen Sinn (dafür gibt es civil-warnings).
 */

import { sceneForCode } from './weather-scene';

export interface WeatherSnapshot {
  code: number; // WMO-Wettercode
  cloudCover: number; // %
  gustKmh: number;
  precipMm: number; // mm in 15 min
  isDay: boolean;
}

export interface NowcastStep {
  at: Date;
  code: number;
  cloudCover: number;
  gustKmh: number;
  precipMm: number;
}

export interface Nowcast {
  now: WeatherSnapshot;
  nowAt: Date;
  steps: NowcastStep[];
  utcOffsetSeconds: number;
}

type WeatherAlertType = 'sun' | 'wind' | 'storm' | 'rain';

export interface WeatherAlert {
  type: WeatherAlertType;
  /** Zeitpunkt des Ereignisses (Beginn des Regens, erste Sturmböe, …). */
  at: Date;
  gustKmh?: number;
  msgKey: string;
}

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';

/** 15-Minuten-Schritte: 8 Stück decken die nächsten 2 Stunden ab. */
const STEPS = 8;

export function nowcastUrl(latitude: number, longitude: number): string {
  return (
    `${OPEN_METEO}?latitude=${latitude.toFixed(4)}&longitude=${longitude.toFixed(4)}` +
    `&current=weather_code,cloud_cover,wind_gusts_10m,precipitation,is_day` +
    `&minutely_15=weather_code,cloud_cover,wind_gusts_10m,precipitation&forecast_minutely_15=${STEPS}` +
    `&timezone=auto&timeformat=unixtime`
  );
}

interface NowcastJson {
  utc_offset_seconds?: number;
  current?: { time: number; weather_code: number; cloud_cover: number; wind_gusts_10m: number; precipitation: number; is_day: number };
  minutely_15?: {
    time: number[];
    weather_code: (number | null)[];
    cloud_cover: (number | null)[];
    wind_gusts_10m: (number | null)[];
    precipitation: (number | null)[];
  };
}

/** Antwort von `nowcastUrl` in das interne Format übersetzen; null, wenn sie unbrauchbar ist. */
export function parseNowcast(data: unknown): Nowcast | null {
  const d = data as NowcastJson | null;
  const c = d?.current;
  const m = d?.minutely_15;
  if (!c || !m || !Array.isArray(m.time)) return null;
  // Ohne Wettercode oder Niederschlag würde „klar und trocken“ erfunden und ein falscher Hinweis ausgelöst.
  if (c.weather_code == null || c.precipitation == null) return null;
  const steps: NowcastStep[] = m.time.map((t, i) => ({
    at: new Date(t * 1000),
    code: m.weather_code[i] ?? 0,
    cloudCover: m.cloud_cover[i] ?? 0,
    gustKmh: m.wind_gusts_10m[i] ?? 0,
    precipMm: m.precipitation[i] ?? 0,
  }));
  return {
    now: {
      code: c.weather_code ?? 0,
      cloudCover: c.cloud_cover ?? 0,
      gustKmh: c.wind_gusts_10m ?? 0,
      precipMm: c.precipitation ?? 0,
      isDay: c.is_day === 1,
    },
    nowAt: new Date(c.time * 1000),
    steps,
    utcOffsetSeconds: d?.utc_offset_seconds ?? 0,
  };
}

const MIN = 60_000;
const isThunder = (code: number): boolean => code >= 95;

/**
 * Alle zutreffenden Hinweise für die nächsten 2 Stunden ab `at`. Entdopplung,
 * Ruhezeit und Abklingzeit sind Sache des Aufrufers (siehe `applyQuietPolicy`).
 */
export function detectWeatherAlerts(now: WeatherSnapshot, steps: NowcastStep[], at: Date): WeatherAlert[] {
  const t0 = at.getTime();
  const ahead = steps.filter((s) => s.at.getTime() >= t0 - 15 * MIN && s.at.getTime() <= t0 + 120 * MIN);
  const alerts: WeatherAlert[] = [];

  const stormStep = ahead.find((s) => isThunder(s.code) || s.gustKmh >= 75);
  if (stormStep || isThunder(now.code) || now.gustKmh >= 75) {
    alerts.push({ type: 'storm', at: stormStep?.at ?? at, gustKmh: Math.max(now.gustKmh, ...ahead.map((s) => s.gustKmh)), msgKey: 'weatherAlert.storm' });
  }

  const maxGust = Math.max(0, ...ahead.map((s) => s.gustKmh));
  if (maxGust >= 50 && now.gustKmh < 40) {
    const first = ahead.find((s) => s.gustKmh >= 50);
    alerts.push({ type: 'wind', at: first?.at ?? at, gustKmh: maxGust, msgKey: 'weatherAlert.wind' });
  }

  const dryNow = now.precipMm < 0.1 && !['rain', 'snow', 'storm'].includes(sceneForCode(now.code));
  const hour = ahead.filter((s) => s.at.getTime() <= t0 + 60 * MIN);
  const rainStep = hour.find((s) => s.precipMm >= 0.2);
  if (dryNow && rainStep) {
    alerts.push({ type: 'rain', at: rainStep.at, msgKey: 'weatherAlert.rain' });
  }

  const gloomyNow = now.cloudCover >= 75 || now.precipMm > 0;
  const lastOfHour = hour[hour.length - 1];
  if (now.isDay && gloomyNow && lastOfHour && lastOfHour.cloudCover <= 35 && lastOfHour.precipMm === 0) {
    alerts.push({ type: 'sun', at: lastOfHour.at, msgKey: 'weatherAlert.sun' });
  }

  return alerts;
}

/** Ortszeit-Stunde (0–23) für `at`; bevorzugt die IANA-Zone, sonst der UTC-Versatz. */
export function localHour(at: Date, timeZone?: string, utcOffsetSeconds = 0): number {
  if (timeZone) {
    try {
      const h = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(at);
      return Number(h);
    } catch {
      /* ungültige Zone → Versatz */
    }
  }
  return new Date(at.getTime() + utcOffsetSeconds * 1000).getUTCHours();
}

/** Nachts (23–6 Uhr Ortszeit) nur Sturm; Sturm schlägt Wind. */
export function applyQuietPolicy(alerts: WeatherAlert[], hour: number): WeatherAlert[] {
  const quiet = hour >= 23 || hour < 6;
  const hasStorm = alerts.some((a) => a.type === 'storm');
  return alerts.filter((a) => (quiet ? a.type === 'storm' : !(hasStorm && a.type === 'wind')));
}

/** Wichtigster Hinweis für die Anzeige (Reihenfolge: Sturm, Wind, Regen, Sonne). */
export function topAlert(alerts: WeatherAlert[]): WeatherAlert | null {
  const order: WeatherAlertType[] = ['storm', 'wind', 'rain', 'sun'];
  for (const type of order) {
    const a = alerts.find((x) => x.type === type);
    if (a) return a;
  }
  return null;
}
