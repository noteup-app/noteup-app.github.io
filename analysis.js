(function (root) {
  "use strict";

  const VOICED = 0.8;        // clarity from which a frame counts as pitched (1 = perfectly periodic)
  const ONSET_WINDOW = 0.3;  // the onset must settle this soon after the attack, otherwise the early median counts
  const HOLD = 0.1;          // "clean" / "corrected" only once it stays so for 100 ms

  const NAMES_DE = ["c", "des", "d", "es", "e", "f", "fis", "g", "as", "a", "b", "h"];
  const NAMES_EN = ["C", "D♭", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
  const STAFF = [[0, ""], [1, "♭"], [1, ""], [2, "♭"], [2, ""], [3, ""], [3, "♯"], [4, ""], [5, "♭"], [5, ""], [6, "♭"], [6, ""]];

  const pitchClass = m => ((m % 12) + 12) % 12;

  function hzToMidi(hz, a4 = 440) { return 69 + 12 * Math.log2(hz / a4); }
  function midiToHz(midi, a4 = 440) { return a4 * 2 ** ((midi - 69) / 12); }

  function noteName(midi, lang = "de") {
    const m = Math.round(midi), octave = Math.floor(m / 12) - 1;
    if (lang === "en") return NAMES_EN[pitchClass(m)] + octave;
    const name = NAMES_DE[pitchClass(m)];
    if (octave >= 3) return name + (["", "′", "″", "‴"][octave - 3] ?? "");
    return name[0].toUpperCase() + name.slice(1) + (["₂", "₁", ""][octave] ?? "");
  }

  function staffStep(midi) {
    const m = Math.round(midi), [letter, accidental] = STAFF[pitchClass(m)];
    return { step: (Math.floor(m / 12) - 1) * 7 + letter, accidental };
  }

  // natural harmonics above the open fundamental (trombone B♭₁ = 34, trumpet written C3 = 48), the flat 7th left out
  const PARTIALS = { 1: 0, 2: 12, 3: 19, 4: 24, 5: 28, 6: 31, 8: 36, 9: 38, 10: 40, 12: 43 };

  // position 1–7 lowers the open series by 0–6 semitones: the slide positions, or the valve combinations of a trumpet
  function slidePositions(midi, fundamental = 34) {
    const found = [];
    for (let position = 1; position <= 7; position++)
      for (const [partial, semitones] of Object.entries(PARTIALS))
        if (fundamental - (position - 1) + semitones === midi) found.push({ position, partial: Number(partial) });
    return found;
  }

  // played on a position of the target, only another partial (missed with the lips, not the slide or valves)
  function partialNeighbor(target, played, fundamental = 34) {
    if (target === played) return false;
    return slidePositions(target, fundamental).some(({ position }) => slidePositions(played, fundamental).some(p => p.position === position));
  }

  class PitchDetector {
    constructor(sampleRate, { lowest = 50, highest = 1000, hop = 0.01 } = {}) {
      this.decimation = sampleRate >= 32000 ? 2 : 1;  // 24 kHz is plenty for a trombone and halves the work
      this.rate = sampleRate / this.decimation;
      this.tauMax = Math.ceil(this.rate / lowest);
      this.tauMin = Math.max(2, Math.floor(this.rate / highest));
      this.windowSize = this.tauMax + 32;
      this.hop = Math.round(this.rate * hop);
      this.levelSize = Math.round(this.rate * 0.02);
      // high limits (flute) make the YIN span shorter than the 20 ms level window, YIN then reads the newest part
      this.size = Math.max(this.windowSize + this.tauMax + 1, this.levelSize);
      this.offset = this.size - (this.windowSize + this.tauMax + 1);
      this.buffer = new Float32Array(this.size);
      this.pending = new Float32Array(this.hop);
      this.pendingCount = 0;
      this.total = 0;
      this.z0 = this.z1 = this.z2 = 0;
      this.counter = 0;
      this.diff = new Float64Array(this.tauMax + 2);
      this.norm = new Float64Array(this.tauMax + 2);
    }

    process(input) {
      const frames = [];
      for (let i = 0; i < input.length; i++) {
        let value = input[i];
        if (this.decimation === 2) {
          this.z2 = this.z1; this.z1 = this.z0; this.z0 = value;
          if (++this.counter & 1) continue;
          value = 0.25 * this.z2 + 0.5 * this.z1 + 0.25 * this.z0;
        }
        this.pending[this.pendingCount++] = value;
        this.total++;
        if (this.pendingCount === this.hop) {
          this.buffer.copyWithin(0, this.hop);
          this.buffer.set(this.pending, this.size - this.hop);
          this.pendingCount = 0;
          frames.push(this.frame());
        }
      }
      return frames;
    }

    frame() {
      const d = this.buffer;
      let sum = 0;
      for (let i = this.size - this.levelSize; i < this.size; i++) sum += d[i] * d[i];
      const level = 10 * Math.log10(sum / this.levelSize + 1e-12) + 3.01;  // full-scale sine = 0 dB
      const pitch = level > -80 ? this.yin() : null;
      return { t: this.total / this.rate, level, hz: pitch ? pitch.hz : 0, clarity: pitch ? pitch.clarity : 0 };
    }

    // YIN (de Cheveigné & Kawahara 2002)
    yin() {
      const x = this.buffer, o = this.offset, W = this.windowSize, tauMax = this.tauMax, diff = this.diff, norm = this.norm;
      let running = 0;
      norm[0] = 1;
      for (let tau = 1; tau <= tauMax; tau++) {
        let s = 0;
        for (let j = o; j < o + W; j++) { const u = x[j] - x[j + tau]; s += u * u; }
        diff[tau] = s;
        running += s;
        norm[tau] = running > 0 ? s * tau / running : 1;
      }
      let best = -1;
      for (let tau = this.tauMin; tau <= tauMax; tau++) {
        if (norm[tau] < 0.15) {
          while (tau < tauMax && norm[tau + 1] < norm[tau]) tau++;
          best = tau;
          break;
        }
      }
      if (best < 0) {
        let min = Infinity;
        for (let tau = this.tauMin; tau <= tauMax; tau++) if (norm[tau] < min) { min = norm[tau]; best = tau; }
        if (min > 0.35) return null;
      }
      // parabola through the raw difference for a fractional period, otherwise high notes are too coarse
      let period = best;
      if (best > 1 && best < tauMax) {
        const a = diff[best - 1], b = diff[best], c = diff[best + 1], denominator = a - 2 * b + c;
        if (denominator > 0) period = best + 0.5 * (a - c) / denominator;
      }
      return { hz: this.rate / period, clarity: 1 - norm[best] };
    }
  }

  const semitones = hz => 12 * Math.log2(hz / 440);
  const isVoiced = f => f.hz > 0 && f.clarity >= VOICED;

  function median(values) {
    if (!values.length) return null;
    const s = [...values].sort((a, b) => a - b), m = s.length >> 1;
    return s.length & 1 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  class OnsetDetector {
    constructor({ minLevel = -50, aboveNoise = 14, legato = null, minJump = 2 } = {}) {
      this.minLevel = minLevel;
      this.aboveNoise = aboveNoise;
      this.legato = legato;    // (oldHz, newHz) => true when the pitch jump already is the next note
      this.minJump = minJump;
      this.noiseFloor = null;
      this.state = "silent";
      this.note = null;
    }

    get onThreshold() { return Math.max(this.minLevel, (this.noiseFloor ?? -90) + this.aboveNoise); }
    get offThreshold() { return Math.max(this.onThreshold - 8, this.note ? this.note.peak - 35 : -Infinity); }
    get current() { return this.state === "tone" ? { t0: this.note.t0, frames: this.note.frames } : null; }

    reset() { this.state = "silent"; this.note = null; }

    // a steady background such as a drone becomes the noise floor at once, so it never counts as a note
    absorb(f) {
      this.reset();
      this.noiseFloor = this.noiseFloor === null ? f.level : this.noiseFloor + (f.level - this.noiseFloor) * 0.2;
    }

    frame(f) {
      const events = [];
      const voiced = isVoiced(f);
      switch (this.state) {
        case "silent":
          this.trackNoise(f.level, 0.01);
          if (f.level >= this.onThreshold) this.begin(f, voiced);
          break;
        case "noise":  // unpitched sound: wait for silence; if it persists it becomes the noise floor
          this.trackNoise(f.level, 0.003);
          if (f.level < this.onThreshold - 3) this.state = "silent";
          break;
        case "attack": {
          const note = this.note;
          note.frames.push(f);
          note.peak = Math.max(note.peak, f.level);
          if (voiced) note.voicedCount++;
          if (note.voicedCount >= 3) {
            this.state = "tone";
            events.push({ type: "start", t: note.t0 });
          } else if (f.level < this.offThreshold) {
            this.state = "silent"; this.note = null;
          } else if (f.t - note.t0 > 0.2) {
            this.state = "noise"; this.note = null;
          }
          break;
        }
        case "tone":
          this.sustain(f, voiced, events);
          break;
      }
      return events;
    }

    trackNoise(level, slow) {
      if (this.noiseFloor === null) this.noiseFloor = level;
      else this.noiseFloor += (level - this.noiseFloor) * (level < this.noiseFloor ? 0.2 : slow);
    }

    begin(f, voiced) {
      this.state = "attack";
      this.note = { t0: f.t, frames: [f], peak: f.level, voicedCount: voiced ? 1 : 0, quiet: 0, dip: null,
                    pitch: null, recent: [] };
    }

    sustain(f, voiced, events) {
      const note = this.note;
      note.frames.push(f);
      note.peak = Math.max(note.peak, f.level);

      if (f.level < this.offThreshold) {
        if (++note.quiet >= 5) {
          events.push(this.finish(note.frames.length - note.quiet));
          this.state = "silent"; this.note = null;
        }
        return;
      }
      note.quiet = 0;

      // re-tongued: the level dips by 10 dB and rises again by 6 dB
      const n = note.frames.length;
      if (note.dip) {
        const dip = note.dip;
        dip.min = Math.min(dip.min, f.level);
        if (f.level >= dip.min + 6 && f.level >= this.onThreshold) {
          events.push(this.finish(dip.index));
          this.begin(f, voiced);
          return;
        }
        if (f.t - dip.t > 0.25) note.dip = null;
      } else {
        let before = -Infinity;
        for (let i = Math.max(0, n - 16); i < n - 1; i++) before = Math.max(before, note.frames[i].level);
        if (f.level < before - 10) note.dip = { index: n - 1, t: f.t, min: f.level };
      }

      if (!this.legato) return;
      if (!voiced) { note.recent = []; return; }
      note.recent.push(n - 1);
      if (note.recent.length > 6) note.recent.shift();
      if (note.recent.length < 6) return;
      const pitches = note.recent.map(i => semitones(note.frames[i].hz));
      if (Math.max(...pitches) - Math.min(...pitches) > 0.35) return;
      const pitch = median(pitches);
      if (note.pitch === null || Math.abs(pitch - note.pitch) < this.minJump) { note.pitch = pitch; return; }
      if (!this.legato(440 * 2 ** (note.pitch / 12), 440 * 2 ** (pitch / 12))) { note.pitch = pitch; return; }
      // split right after the last frame still at the old pitch
      let split = note.recent[0];
      while (split > 1) {
        const v = note.frames[split - 1];
        if (isVoiced(v) && Math.abs(semitones(v.hz) - note.pitch) < 1) break;
        split--;
      }
      const rest = note.frames.slice(split);
      events.push(this.finish(split));
      this.state = "tone";
      this.note = { t0: rest[0].t, frames: rest, peak: Math.max(...rest.map(r => r.level)), voicedCount: 3, quiet: 0,
                    dip: null, pitch, recent: [] };
      events.push({ type: "start", t: this.note.t0 });
    }

    finish(until) {
      const note = this.note, frames = note.frames.slice(0, Math.max(1, until));
      const voiced = frames.filter(isVoiced).length;
      const t1 = frames[frames.length - 1].t;
      if (t1 - note.t0 < 0.1 || voiced < 5) return { type: "discarded", t: note.t0 };
      return { type: "end", note: { t0: note.t0, t1, frames } };
    }
  }

  // median of three smooths single outliers
  function curve(note, target, a4 = 440) {
    const raw = [];
    for (const f of note.frames)
      if (isVoiced(f)) raw.push({ t: f.t - note.t0, cents: (hzToMidi(f.hz, a4) - target) * 100 });
    return raw.map((p, i) => i === 0 || i === raw.length - 1 ? p
      : { t: p.t, cents: median([raw[i - 1].cents, p.cents, raw[i + 1].cents]) });
  }

  function since(points, ok, duration = HOLD) {
    let start = -1;
    for (let i = 0; i < points.length; i++) {
      if (!ok(points[i])) { start = -1; continue; }
      if (start < 0) start = i;
      if (points[i].t - points[start].t >= duration - 1e-6) return points[start].t;
    }
    return null;
  }

  function evaluate(note, target, { a4 = 440, tolerance = 15, fundamental = 34 } = {}) {
    const points = curve(note, target, a4);
    if (!points.length) return null;

    // onset = the first steady spot (30 ms within 30 cents), where the lips land first
    let onset = null;
    for (let i = 0; i + 2 < points.length && points[i].t <= ONSET_WINDOW; i++) {
      const three = [points[i].cents, points[i + 1].cents, points[i + 2].cents];
      if (Math.max(...three) - Math.min(...three) > 30 || points[i + 2].t - points[i].t > 0.035) continue;
      let j = i + 3;
      while (j < points.length && points[j].t - points[i].t <= 0.08 && Math.abs(points[j].cents - points[i].cents) <= 30) j++;
      onset = { t: points[i].t, cents: median(points.slice(i, j).map(p => p.cents)) };
      break;
    }
    if (!onset) {
      const early = points.filter(p => p.t <= ONSET_WINDOW);
      onset = { t: points[0].t, cents: median((early.length ? early : points.slice(0, 8)).map(p => p.cents)) };
    }

    const hit = Math.abs(onset.cents) < 50;
    const played = target + Math.round(onset.cents / 100);
    const cleanFrom = since(points, p => Math.abs(p.cents) <= tolerance);
    const correctFrom = hit ? onset.t : since(points, p => Math.abs(p.cents) < 50);
    const late = points.filter(p => p.t >= 0.3);
    const held = median((late.length >= 5 ? late : points.filter(p => p.t >= onset.t)).map(p => p.cents));
    const ms = s => s === null ? null : Math.round(s * 1000);

    return {
      target,
      played,
      onsetCents: Math.round(onset.cents),
      hit,
      clean: Math.abs(onset.cents) <= tolerance,
      partial: !hit && partialNeighbor(target, played, fundamental),
      cleanMs: ms(cleanFrom),
      correctedMs: hit ? null : ms(correctFrom),
      heldCents: Math.round(held),
      durationMs: ms(note.t1 - note.t0),
      points,
    };
  }

  const Analysis = {
    PitchDetector, OnsetDetector, evaluate, curve,
    hzToMidi, midiToHz, noteName, staffStep, slidePositions, partialNeighbor, median, VOICED,
  };
  if (typeof module === "object" && module.exports) module.exports = Analysis;
  else root.Analysis = Analysis;
})(typeof window !== "undefined" ? window : globalThis);
