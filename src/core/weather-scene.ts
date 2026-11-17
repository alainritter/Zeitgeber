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

export const skyImage = (scene: WeatherScene, phase: LightPhase): string => `weather/${scene}-${phase}.webp`;
