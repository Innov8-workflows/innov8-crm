// The canvas behind every celebration and seasonal effect. One effect at a time. The
// loop only exists while an effect is running, is capped at 30fps, and stops by itself
// when the last particle has gone, so an idle CRM spends nothing here. Browsers pause
// requestAnimationFrame in a hidden tab and the clock only counts frames, so a hidden
// tab doesn't use up an effect.
//
// DELIBERATELY IGNORES prefers-reduced-motion. Jay's Windows has animations off, so
// honouring it meant he'd never see any of this. The Effects menu is the off switch.
import { SHAPES, type ShapeName } from "./effectShapes";

export type EffectKind = "snow" | "stars" | "gifts" | "hearts" | "spring" | "ghosts" | "fireworks" | "confetti";

interface Drift {
  shapes: ShapeName[];
  colours: string[];
  count: number;
  size: [number, number];
  speed: [number, number];              // px per second
  dir: "down" | "up" | "across";
  sway: number;                         // sideways px
  spin: number;                         // radians per second, either way
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  size: number; rot: number; spin: number;
  colour: string; phase: number; alpha: number;
  age: number; life: number;            // life 0 = lives until it leaves the screen
  shape?: ShapeName;
  burstAt?: number;                     // a rocket, which bursts at this height
}

const PARTY = ["#ea580c", "#fb923c", "#fbbf24", "#fde68a", "#ffffff"];
const SKY = ["#ef4444", "#fbbf24", "#22c55e", "#38bdf8", "#c084fc", "#fb923c"];

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

/** True on the light themes. Reads the ground colour rather than listing theme names. */
function lightGround(): boolean {
  const hex = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return false;
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 140;
}

function driftFor(kind: EffectKind): Drift | null {
  const ink = lightGround() ? "#94a3b8" : "#e2e8f0";    // white snow vanishes on Light
  switch (kind) {
    case "snow": return { shapes: ["snowflake"], colours: [ink], count: 40, size: [10, 20], speed: [28, 60], dir: "down", sway: 26, spin: 0.5 };
    case "stars": return { shapes: ["star"], colours: ["#fbbf24", "#fde68a", ink], count: 32, size: [9, 17], speed: [24, 50], dir: "down", sway: 20, spin: 0.5 };
    case "gifts": return { shapes: ["gift", "star"], colours: ["#ef4444", "#22c55e", "#fbbf24"], count: 32, size: [14, 24], speed: [40, 80], dir: "down", sway: 18, spin: 0.6 };
    case "hearts": return { shapes: ["heart"], colours: ["#f43f5e", "#fb7185", "#ec4899"], count: 34, size: [11, 22], speed: [30, 62], dir: "up", sway: 24, spin: 0.3 };
    case "spring": return { shapes: ["egg", "flower"], colours: ["#f9a8d4", "#fcd34d", "#86efac", "#93c5fd", "#c4b5fd"], count: 32, size: [13, 22], speed: [26, 54], dir: "down", sway: 22, spin: 0.7 };
    case "ghosts": return { shapes: ["ghost"], colours: [ink], count: 9, size: [24, 40], speed: [34, 70], dir: "across", sway: 22, spin: 0 };
    default: return null;
  }
}

/** Runs one effect. durationMs null = until stopped. Returns a function that stops it now. */
export function startEffect(canvas: HTMLCanvasElement, kind: EffectKind, durationMs: number | null, onEnd: () => void): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) { onEnd(); return () => {}; }

  const drift = driftFor(kind);
  const paths = new Map<ShapeName, Path2D>();
  const pathFor = (s: ShapeName) => {
    let p = paths.get(s);
    if (!p) { p = new Path2D(SHAPES[s].d); paths.set(s, p); }
    return p;
  };

  let w = 0, h = 0;
  const fit = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  fit();

  // A first run spreads particles out beyond the edge, so they arrive over time.
  const seed = (p: Particle, first: boolean) => {
    if (!drift) return;
    const speed = rand(...drift.speed);
    if (drift.dir === "across") {
      p.x = first ? rand(-w, -40) : -60; p.y = rand(h * 0.05, h * 0.8); p.vx = speed; p.vy = 0;
    } else {
      const start = first ? rand(0, h) : 0;
      p.x = rand(0, w);
      p.y = drift.dir === "down" ? -30 - start : h + 30 + start;
      p.vx = 0; p.vy = drift.dir === "down" ? speed : -speed;
    }
  };

  let parts: Particle[] = [];
  let sparks: Particle[] = [];          // from rockets bursting during a frame
  if (drift) {
    parts = Array.from({ length: drift.count }, () => {
      const p: Particle = {
        x: 0, y: 0, vx: 0, vy: 0, size: rand(...drift.size), rot: rand(-0.4, 0.4), spin: rand(-drift.spin, drift.spin),
        colour: pick(drift.colours), phase: rand(0, 6.28), alpha: rand(0.45, 0.85), age: 0, life: 0, shape: pick(drift.shapes),
      };
      seed(p, true);
      return p;
    });
  }

  const confettiVolley = (n: number) => {
    for (let i = 0; i < n; i++) {
      const left = i % 2 === 0;
      const angle = rand(0.9, 1.35);
      const speed = rand(h * 0.9, h * 1.5);
      parts.push({
        x: left ? -10 : w + 10, y: h * 0.75, vx: Math.cos(angle) * speed * (left ? 0.7 : -0.7), vy: -Math.sin(angle) * speed,
        size: rand(5, 10), rot: rand(0, 6.28), spin: rand(-9, 9), colour: pick(PARTY), phase: rand(0, 6.28), alpha: 1, age: 0, life: 0,
      });
    }
  };
  const rocket = () => {
    parts.push({
      x: rand(w * 0.12, w * 0.88), y: h + 10, vx: rand(-30, 30), vy: -rand(h * 0.75, h),
      size: 2.5, rot: 0, spin: 0, colour: "#fde68a", phase: 0, alpha: 1, age: 0, life: 0, burstAt: rand(h * 0.12, h * 0.45),
    });
  };
  const burst = (x: number, y: number) => {
    const colour = pick(SKY);
    for (let i = 0; i < 46; i++) {
      const angle = rand(0, 6.28), speed = rand(40, 240);
      sparks.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: rand(1.5, 3), rot: 0, spin: 0, colour, phase: 0, alpha: 1, age: 0, life: rand(0.9, 1.5) });
    }
  };

  const move = (p: Particle, dt: number) => {
    if (p.burstAt !== undefined) {
      p.x += p.vx * dt; p.y += p.vy * dt;
    } else if (kind === "confetti") {
      p.vy += 900 * dt;
      p.vx *= 0.985; p.vy *= 0.985;
      p.x += (p.vx + Math.sin(p.age * 5 + p.phase) * 40) * dt; p.y += p.vy * dt;
      p.rot += p.spin * dt;
    } else if (kind === "fireworks") {
      p.vy += 110 * dt;
      p.vx *= 0.97; p.vy *= 0.97;
      p.x += p.vx * dt; p.y += p.vy * dt;
    } else {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
  };

  const offScreen = (p: Particle) => {
    if (kind === "confetti") return p.y > h + 20;
    if (!drift) return false;
    if (drift.dir === "across") return p.x > w + 60;
    return drift.dir === "up" ? p.y < -40 : p.y > h + 40;
  };

  const draw = (p: Particle) => {
    ctx.globalAlpha = p.life ? p.alpha * (1 - p.age / p.life) : p.alpha;
    if (p.shape && drift) {
      const sway = Math.sin(p.age * 0.9 + p.phase) * drift.sway;
      const k = p.size / 24;
      ctx.save();
      if (drift.dir === "across") ctx.translate(p.x, p.y + sway);
      else ctx.translate(p.x + sway, p.y);
      ctx.rotate(p.rot);
      ctx.scale(k, k);
      ctx.translate(-12, -12);
      const path = pathFor(p.shape);
      if (SHAPES[p.shape].fill) {
        ctx.fillStyle = p.colour;
        ctx.globalAlpha *= 0.35;
        ctx.fill(path);
        ctx.globalAlpha /= 0.35;
      }
      ctx.strokeStyle = p.colour;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke(path);
      ctx.restore();
    } else if (kind === "confetti") {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.colour;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    } else {
      ctx.fillStyle = p.colour;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, 6.29);
      ctx.fill();
    }
  };

  let elapsed = 0, last = 0, raf = 0, nextVolley = 0, volleys = 0, nextRocket = 0;
  let stopped = false;
  canvas.dataset.effect = kind;

  const finish = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    ctx.clearRect(0, 0, w, h);
    delete canvas.dataset.effect;
  };

  const frame = (ts: number) => {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    if (ts - last < 32) return;
    const dt = Math.min((ts - last) / 1000, 0.1);
    last = ts;
    elapsed += dt * 1000;
    const ending = durationMs !== null && elapsed > durationMs;
    fit();
    ctx.clearRect(0, 0, w, h);

    if (kind === "ghosts" && !ending) {
      const dim = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
      dim.addColorStop(0, "rgba(0,0,0,0)");
      dim.addColorStop(1, "rgba(0,0,0,0.3)");
      ctx.fillStyle = dim;
      ctx.fillRect(0, 0, w, h);
    }
    if (kind === "confetti" && volleys < 3 && elapsed >= nextVolley) { confettiVolley(60); volleys++; nextVolley += 550; }
    if (kind === "fireworks" && !ending && elapsed >= nextRocket) { rocket(); nextRocket += rand(700, 1500); }

    const alive: Particle[] = [];
    for (const p of parts) {
      p.age += dt;
      move(p, dt);
      if (p.burstAt !== undefined && p.y <= p.burstAt) { burst(p.x, p.y); continue; }
      if (p.life && p.age >= p.life) continue;
      if (offScreen(p)) {
        if (ending || !drift) continue;
        seed(p, false);
      }
      alive.push(p);
      draw(p);
    }
    ctx.globalAlpha = 1;
    parts = alive.concat(sparks);
    sparks = [];

    if (ending && parts.length === 0) { finish(); onEnd(); }
  };

  raf = requestAnimationFrame((ts) => { last = ts; frame(ts); });
  return finish;
}
