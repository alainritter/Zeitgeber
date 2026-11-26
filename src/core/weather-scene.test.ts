/**
 * Validierung von Wetter-Szene und Lichtphasen-Überblendung (Spec §28, §12).
 */

import { describe, expect, it } from 'vitest';
import { phaseMix, sceneForCode, scrimAlpha, skyImage, starAlpha, WEATHER_SCENES } from './weather-scene';

describe('sceneForCode', () => {
  it.each([
    [0, 'clear'],
    [1, 'clear'],
    [2, 'partly'],
    [3, 'overcast'],
    [45, 'fog'],
    [53, 'rain'],
    [81, 'rain'],
    [73, 'snow'],
    [86, 'snow'],
    [95, 'storm'],
    [99, 'storm'],
  ])('Code %i → %s', (code, scene) => {
    expect(sceneForCode(code)).toBe(scene);
  });

  it('liefert nur bekannte Szenen', () => {
    for (let c = 0; c <= 99; c++) expect(WEATHER_SCENES).toContain(sceneForCode(c));
  });
});

describe('phaseMix', () => {
  it('Tag ab 6°, Nacht ab −12°', () => {
    expect(phaseMix(40)).toEqual({ from: 'day', to: 'day', t: 0 });
    expect(phaseMix(-30)).toEqual({ from: 'night', to: 'night', t: 0 });
  });

  it('überblendet stetig durch die Dämmerung', () => {
    expect(phaseMix(6)).toEqual({ from: 'day', to: 'day', t: 0 });
    const a = phaseMix(5.99);
    expect(a.from).toBe('day');
    expect(a.t).toBeGreaterThan(0);
    expect(phaseMix(-4)).toEqual({ from: 'day', to: 'twilight', t: 1 });
    const b = phaseMix(-4.01);
    expect(b.from).toBe('twilight');
    expect(b.t).toBeCloseTo(0, 1);
    expect(phaseMix(-11.99).t).toBeCloseTo(1, 1);
  });
});

describe('scrimAlpha', () => {
  it('ist am Tag schwach, in der Dämmerung stark und geht stetig dazwischen', () => {
    expect(scrimAlpha(phaseMix(40), 'overcast')).toBeCloseTo(0.2);
    expect(scrimAlpha(phaseMix(-4), 'overcast')).toBeCloseTo(0.5);
    expect(scrimAlpha(phaseMix(-30), 'overcast')).toBeCloseTo(0.3);
    const mid = scrimAlpha(phaseMix(1), 'overcast');
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.72);
  });

  it('deckt dunkle Tageshimmel stärker ab als helle', () => {
    expect(scrimAlpha(phaseMix(40), 'storm')).toBeGreaterThan(scrimAlpha(phaseMix(40), 'fog'));
    expect(scrimAlpha(phaseMix(40), 'rain')).toBeGreaterThan(scrimAlpha(phaseMix(40), 'snow'));
  });
});

describe('skyImage', () => {
  it('baut den Dateipfad', () => {
    expect(skyImage('storm', 'night')).toBe('weather/storm-night.webp');
  });
});

describe('starAlpha', () => {
  it('Sterne nur nachts und bei offenem Himmel', () => {
    expect(starAlpha(phaseMix(-30), 'clear')).toBe(1);
    expect(starAlpha(phaseMix(-30), 'partly')).toBe(0.5);
    expect(starAlpha(phaseMix(-30), 'overcast')).toBe(0);
    expect(starAlpha(phaseMix(40), 'clear')).toBe(0);
  });
  it('blendet mit der Dämmerung ein', () => {
    expect(starAlpha(phaseMix(-4), 'clear')).toBe(0);
    expect(starAlpha(phaseMix(-8), 'clear')).toBeCloseTo(0.5);
  });
});
