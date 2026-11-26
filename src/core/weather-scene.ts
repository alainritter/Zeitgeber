/**
 * weather-scene — Szene und Lichtphase für den Wetterhimmel (Spec §28, §12).
 *
 * Rein berechnet: WMO-Code → Szene, Sonnenhöhe → Gewichte der drei Bildphasen.
 * Die Zonengrenzen stammen aus der Theme-Engine, hier wird nur überblendet.
 */

export type WeatherScene = 'clear' | 'partly' | 'overcast' | 'fog' | 'rain' | 'snow' | 'storm';
export type LightPhase = 'day' | 'twilight' | 'night';

export const WEATHER_SCENES: WeatherScene[] = ['clear', 'partly', 'overcast', 'fog', 'rain', 'snow', 'storm'];

/** WMO-Wettercode (Open-Meteo `weather_code`) auf eine der sieben Szenen abgebildet. */
export function sceneForCode(code: number): WeatherScene {
  if (code <= 1) return 'clear';
  if (code === 2) return 'partly';
  if (code === 3) return 'overcast';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'overcast';
}

export interface PhaseMix {
  /** Die beiden Phasen, zwischen denen überblendet wird. */
  from: LightPhase;
  to: LightPhase;
  /** 0 = nur `from`, 1 = nur `to`. */
  t: number;
}

// Stützstellen der Sonnenhöhe (Grad): ab DAY_FROM voller Tag, bei TWILIGHT_MID reine
// Dämmerung, ab NIGHT_FROM volle Nacht. Dazwischen linear (Spec §11.4 „weicher Verlauf“).
const DAY_FROM = 6;
const TWILIGHT_MID = -4;
const NIGHT_FROM = -12;

export function phaseMix(elevationDeg: number): PhaseMix {
  if (elevationDeg >= DAY_FROM) return { from: 'day', to: 'day', t: 0 };
  if (elevationDeg <= NIGHT_FROM) return { from: 'night', to: 'night', t: 0 };
  if (elevationDeg >= TWILIGHT_MID) {
    return { from: 'day', to: 'twilight', t: (DAY_FROM - elevationDeg) / (DAY_FROM - TWILIGHT_MID) };
  }
  return { from: 'twilight', to: 'night', t: (TWILIGHT_MID - elevationDeg) / (TWILIGHT_MID - NIGHT_FROM) };
}

// Deckkraft des Scrims über dem Bild je Lichtphase: in der Dämmerung stark (der Himmel ist dort
// heller als die Dämmerungs-Palette, die Schrift verliert sonst Kontrast), nachts mittel.
// Am Tag hängt sie vom Himmel ab: helle Szenen schwach (sonst wirken sie weiß und
// ausgebleicht), dunkle (Regen, Sturm, tiefes Blau) stärker, weil die Tagschrift dunkel ist.
const SCRIM_OTHER = { twilight: 0.5, night: 0.3 };
const SCRIM_DAY: Record<WeatherScene, number> = {
  clear: 0.25,
  partly: 0.15,
  overcast: 0.2,
  fog: 0,
  rain: 0.4,
  snow: 0.15,
  storm: 0.4,
};

export function scrimAlpha(mix: PhaseMix, scene: WeatherScene): number {
  const of = (p: LightPhase): number => (p === 'day' ? SCRIM_DAY[scene] : SCRIM_OTHER[p]);
  return of(mix.from) + (of(mix.to) - of(mix.from)) * mix.t;
}

export const skyImage = (scene: WeatherScene, phase: LightPhase): string => `weather/${scene}-${phase}.webp`;

// Sterne nur bei offenem Himmel: klar voll, teils bewölkt halb (zwischen Wolken). Gewicht der
// Nachtphase in der Überblendung, damit sie mit der Dämmerung auftauchen und morgens verschwinden.
const STAR_SCENES: Partial<Record<WeatherScene, number>> = { clear: 1, partly: 0.5 };

export function starAlpha(mix: PhaseMix, scene: WeatherScene): number {
  const night = mix.from === 'night' ? 1 - mix.t : mix.to === 'night' ? mix.t : 0;
  return night * (STAR_SCENES[scene] ?? 0);
}
