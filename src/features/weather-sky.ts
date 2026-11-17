/**
 * Fähigkeit `weather-sky` — Wetterhimmel als abschaltbare Hintergrundebene (Spec §28, §12).
 *
 * Ein Standbild je Wetterszene und Lichtphase (public/weather/*.webp), langsam
 * verschoben (CSS), dazu leichte Live-Effekte: Regen, Schnee und Blitz auf einem
 * Canvas, Nebel als CSS. Die Lichtphase folgt der Sonnenhöhe (core/weather-scene).
 *
 * Leicht gehalten (§8): Der Canvas läuft nur bei Regen/Schnee/Sturm, mit 30 fps,
 * gedeckeltem Pixelverhältnis und pausiert bei verstecktem Tab. Bei „Bewegung
 * reduzieren" (§13) bleibt alles statisch. Fehlt ein Bild (z. B. offline und nicht
 * im Cache), bleibt die normale Theme-Fläche stehen — nie eine leere Ansicht (§10).
 */

import { phaseMix, skyImage, type LightPhase, type WeatherScene } from '../core/weather-scene';

export interface SkyState {
  scene: WeatherScene;
  /** Sonnenhöhe in Grad. */
  elevation: number;
  gustKmh: number;
  /** Niederschlag in mm je 15 min. */
  precipMm: number;
}

const FADE_MS = 2000;
const FRAME_MS = 1000 / 30;
const FX_SCENES: WeatherScene[] = ['rain', 'snow', 'storm'];

interface Stage {
  el: HTMLElement;
  imgs: Record<LightPhase, HTMLImageElement>;
  scene: WeatherScene;
}

interface Particle {
  x: number;
  y: number;
  v: number; // px/s
  len: number; // Regenstrich bzw. Flockenradius
  phase: number;
}

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

export class WeatherSky {
  private root: HTMLElement;
  private stageHost: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private stage: Stage | null = null;
  private state: SkyState | null = null;
  private particles: Particle[] = [];
  private raf: number | null = null;
  private lastFrame = 0;
  private flash = 0;
  private afterFlash = false;
  private nextFlashAt = 0;
  private reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private size = { w: 0, h: 0, dpr: 1 };

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'wsky';
    this.root.setAttribute('aria-hidden', 'true');
    this.root.hidden = true;
    this.stageHost = document.createElement('div');
    this.stageHost.className = 'wsky__stages';
    const fog = document.createElement('div');
    fog.className = 'wsky__fog';
    fog.innerHTML = '<span></span><span></span>';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'wsky__fx';
    const scrim = document.createElement('div');
    scrim.className = 'wsky__scrim';
    this.root.append(this.stageHost, fog, this.canvas, scrim);
    parent.prepend(this.root);
    this.ctx = this.canvas.getContext('2d');

    new ResizeObserver(() => this.resize()).observe(this.root);
    document.addEventListener('visibilitychange', () => this.syncLoop());
    this.reduceMotion.addEventListener('change', () => this.syncLoop());
  }

  setEnabled(on: boolean): void {
    this.root.hidden = !on;
    if (!on) this.stopLoop();
    else {
      this.resize();
      this.syncLoop();
    }
  }

  get enabled(): boolean {
    return !this.root.hidden;
  }

  /** Neuen Zustand übernehmen; billig genug für einen Aufruf pro Sekunde. */
  update(next: SkyState): void {
    if (!this.enabled) return;
    const sceneChanged = this.state?.scene !== next.scene;
    this.state = next;
    if (sceneChanged || !this.stage) this.swapStage(next.scene);
    this.applyMix(next.elevation);
    this.root.dataset.scene = next.scene;
    this.root.style.setProperty('--wsky-drift', `${next.gustKmh > 40 ? 45 : 90}s`);
    if (sceneChanged) this.buildParticles();
    this.syncLoop();
  }

  // --- Bilder ---------------------------------------------------------------

  private swapStage(scene: WeatherScene): void {
    const el = document.createElement('div');
    el.className = 'wsky__stage';
    const imgs = {} as Record<LightPhase, HTMLImageElement>;
    for (const phase of ['day', 'twilight', 'night'] as LightPhase[]) {
      const img = document.createElement('img');
      img.alt = '';
      img.decoding = 'async';
      img.style.opacity = '0';
      // Fehlt das Bild, bleibt die Ebene leer und die Theme-Fläche scheint durch (§10).
      img.addEventListener('error', () => img.remove());
      img.src = `${import.meta.env.BASE_URL}${skyImage(scene, phase)}`;
      imgs[phase] = img;
      el.appendChild(img);
    }
    el.style.opacity = '0';
    this.stageHost.appendChild(el);
    const old = this.stage;
    this.stage = { el, imgs, scene };
    // Zwei Frames später einblenden, damit die Transition anspringt.
    requestAnimationFrame(() => requestAnimationFrame(() => (el.style.opacity = '1')));
    if (old) window.setTimeout(() => old.el.remove(), FADE_MS + 200);
  }

  private applyMix(elevation: number): void {
    if (!this.stage) return;
    const { from, to, t } = phaseMix(elevation);
    for (const [phase, img] of Object.entries(this.stage.imgs) as [LightPhase, HTMLImageElement][]) {
      let o = 0;
      if (from === to) o = phase === from ? 1 : 0;
      else if (phase === from) o = 1 - t;
      else if (phase === to) o = t;
      const s = o.toFixed(3);
      if (img.style.opacity !== s) img.style.opacity = s;
    }
  }

  // --- Effekte --------------------------------------------------------------

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    this.size = { w, h, dpr };
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    if (this.state) this.buildParticles();
  }

  private buildParticles(): void {
    this.particles = [];
    const s = this.state;
    if (!s || !FX_SCENES.includes(s.scene)) return;
    const area = this.size.w * this.size.h;
    const intensity = s.scene === 'storm' ? 3 : Math.min(Math.max(s.precipMm, 0.2), 3);
    if (s.scene === 'snow') {
      const n = Math.round((area / 5000) * Math.min(Math.max(s.precipMm * 4, 1.5), 4));
      for (let i = 0; i < n; i++) {
        this.particles.push({ x: rand(0, this.size.w), y: rand(0, this.size.h), v: rand(40, 90), len: rand(1, 3), phase: rand(0, 6.28) });
      }
      return;
    }
    const n = Math.round((area / 9000) * (1 + intensity * 1.2));
    for (let i = 0; i < n; i++) {
      this.particles.push({ x: rand(0, this.size.w), y: rand(0, this.size.h), v: rand(700, 1100), len: rand(10, 22), phase: 0 });
    }
  }

  private active(): boolean {
    return (
      this.enabled &&
      !document.hidden &&
      !this.reduceMotion.matches &&
      !!this.state &&
      FX_SCENES.includes(this.state.scene) &&
      this.size.w > 0
    );
  }

  private syncLoop(): void {
    if (this.active()) {
      if (this.raf == null) {
        this.lastFrame = 0;
        this.raf = requestAnimationFrame((t) => this.frame(t));
      }
    } else {
      this.stopLoop();
    }
  }

  private stopLoop(): void {
    if (this.raf != null) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private frame(now: number): void {
    this.raf = requestAnimationFrame((t) => this.frame(t));
    if (now - this.lastFrame < FRAME_MS) return;
    const dt = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, 0.1) : FRAME_MS / 1000;
    this.lastFrame = now;
    const s = this.state;
    const ctx = this.ctx;
    if (!s || !ctx) return;
    const { w, h, dpr } = this.size;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Wind neigt den Regen (bis ca. 35°); Schnee driftet seitlich.
    const slant = Math.min(s.gustKmh / 60, 1) * 0.6;
    if (s.scene === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (const p of this.particles) {
        p.y += p.v * dt;
        p.x += Math.sin(now / 1500 + p.phase) * 20 * dt + slant * 60 * dt;
        if (p.y > h) (p.y = -4), (p.x = rand(0, w));
        if (p.x > w) p.x = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.len, 0, 6.2832);
        ctx.fill();
      }
    } else {
      ctx.strokeStyle = 'rgba(205,218,238,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const p of this.particles) {
        p.y += p.v * dt;
        p.x += p.v * slant * dt;
        if (p.y > h || p.x > w) (p.y = -p.len), (p.x = rand(-h * slant, w));
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.len * slant, p.y - p.len);
      }
      ctx.stroke();
    }

    if (s.scene === 'storm') this.drawLightning(ctx, now, dt);
  }

  /** Blitz: Aufhellung der ganzen Fläche, alle 8–20 s, kurz doppelt. */
  private drawLightning(ctx: CanvasRenderingContext2D, now: number, dt: number): void {
    if (this.nextFlashAt === 0) this.nextFlashAt = now + rand(8000, 20000);
    if (now >= this.nextFlashAt) {
      this.flash = 0.55;
      this.afterFlash = true;
      this.nextFlashAt = now + rand(8000, 20000);
    }
    if (this.flash > 0.01) {
      ctx.fillStyle = `rgba(235,240,255,${this.flash.toFixed(3)})`;
      ctx.fillRect(0, 0, this.size.w, this.size.h);
      this.flash *= Math.pow(0.001, dt); // klingt in ~0,3 s ab
      if (this.flash < 0.12 && this.afterFlash && Math.random() < 0.3) {
        this.flash = 0.4; // genau ein Nachblitz
        this.afterFlash = false;
      }
    }
  }
}
