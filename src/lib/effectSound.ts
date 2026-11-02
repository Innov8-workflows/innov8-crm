// The ka-ching, made in the browser so there's no audio file to load. Two bright notes
// with a fast decay. Browsers refuse sound until the page has been clicked, which is
// fine: this fails silently and the rest of the celebration still plays.
import { soundsOn } from "./celebrate";

export function playKaching() {
  if (!soundsOn()) return;
  try {
    const ctx = new AudioContext();
    [[1319, 0], [1976, 0.09]].forEach(([freq, at]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + at;
      osc.type = "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.52);
    });
    window.setTimeout(() => { ctx.close().catch(() => {}); }, 900);
  } catch {}
}
