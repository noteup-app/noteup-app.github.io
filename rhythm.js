(function (root) {
  "use strict";

  // durations in ticks of 1/12 quarter (12 quarter, 6 eighth, 3 sixteenth, 4 triplet eighth, 18 dotted quarter …)
  const METERS = {
    "2/2": { length: 48, beat: 24 },  // alla breve: written like 4/4, counted and clicked in half notes
    "3/2": { length: 72, beat: 24 },
    "2/4": { length: 24, beat: 12 },
    "3/4": { length: 36, beat: 12 },
    "4/4": { length: 48, beat: 12 },
    "5/4": { length: 60, beat: 12 },
    "6/4": { length: 72, beat: 12 },
    "7/4": { length: 84, beat: 12 },
    "6/8": { length: 36, beat: 18 },  // compound meters: beat and tempo in dotted quarters
    "9/8": { length: 54, beat: 18 },
    "12/8": { length: 72, beat: 18 },
  };
  const SIMPLE = ["2/2", "3/2", "2/4", "3/4", "4/4", "5/4", "6/4", "7/4"], COMPOUND = ["6/8", "9/8", "12/8"];
  // cells are placed and rated on quarter beats, also when the half note is the beat
  const grid = m => m.beat === 24 ? { length: m.length, beat: 12, halves: true } : m;

  // cell: durations, "-" = rest, "~" = tied to the next note (also into the next cell or bar); [cell, weight, from difficulty]
  const BASIC = [["12", 3], ["-12", 0.8], ["6 6", 3], ["-6 6", 0.8], ["6 -6", 0.5]];
  const TIES = [["6 6~", 2.5], ["12~", 1.8], ["6 6~ 6 6", 1.5], ["6 6~ 12", 1], ["12~ 6 6", 1], ["18 6~", 1.2], ["24~", 0.6]];
  // compound meters (6/8, 9/8, 12/8) build on the dotted quarter: "18" one beat, "6 6 6" three eighths, "12 6" quarter and eighth
  const BASIC8 = [["18", 3], ["-18", 0.8], ["6 6 6", 3], ["12 6", 2.5], ["-6 6 6", 0.8]];
  const PLAIN = [...BASIC, ...BASIC8].map(([cell]) => cell);
  // saved attempts store the level index: never reorder. cells for simple meters, compound for compound ones. plain
  // cells are not what the level is about, every bar of a level with a plain list gets at least one other cell
  const LEVELS = [
    { name: { de: "Viertel und Halbe", en: "Quarter and half notes" },
      cells: [["12", 5], ["-12", 1.2], ["24", 2], ["-24", 0.4], ["36", 0.8], ["48", 0.6]],
      compound: [["18", 5], ["-18", 1.2], ["12 6", 2.5], ["36", 1.2], ["-36", 0.3]] },
    { name: { de: "Achtel", en: "Eighth notes" },
      cells: [["12", 3], ["-12", 1], ["6 6", 4], ["-6 6", 1.2], ["6 -6", 0.8], ["24", 0.8]],
      compound: [["18", 2], ["-18", 0.6], ["6 6 6", 4], ["12 6", 3], ["-6 6 6", 1], ["6 6 -6", 0.8], ["36", 0.5]],
      plain: ["12", "-12", "24", "18", "-18", "36"] },
    { name: { de: "Synkopen", en: "Syncopation" },
      cells: [...BASIC, ["18 6", 4], ["6 12 6", 3.5], ["-6 12 6", 1.5], ["6 18", 1.2], ["-6 18", 0.8], ["6 6~ 6 6", 1.2],
              ["12 18 6", 1.5], ["6 12 12 6", 1], ["18 18 12", 0.8, 3], ["24", 0.5]],
      // in 6/8 the dotted quarter is the beat: here the level is about syncopation, the hemiola and ties over the beat
      compound: [...BASIC8, ["6 12", 3], ["-6 12", 1.5], ["12 12 12", 1.5], ["6 12~ 6 12", 0.8], ["12 6~ 6 6 6", 1], ["36", 0.5]],
      plain: [...PLAIN, "24", "36"] },
    { name: { de: "Sechzehntel", en: "Sixteenth notes" },
      cells: [...BASIC, ["3 3 3 3", 3], ["6 3 3", 2.5], ["3 3 6", 2.5]],
      compound: [...BASIC8, ["3 3 6 6", 2], ["6 3 3 6", 2], ["6 6 3 3", 2], ["3 3 3 3 6", 1.5], ["3 3 3 3 3 3", 1.5], ["12 3 3", 1.2]],
      plain: PLAIN },
    { name: { de: "Punktierte Achtel", en: "Dotted eighths" },
      // the reversed dotting and 3+3+2 are harder to read than plain sixteenths, so a harder setting keeps the dots
      cells: [["12", 1], ["6 6", 1], ["3 3 3 3", 1], ["6 3 3", 1], ["3 3 6", 1], ["3 6 3", 1.2], ["-3 3 3 3", 0.8], ["-6 3 3", 0.6],
              ["9 3", 4], ["3 9", 1.5], ["9 9 6", 0.8, 3]],
      compound: [["18", 1], ["6 6 6", 1.5], ["3 3 6 6", 1], ["6 3 3 6", 1], ["12 3 3", 1], ["9 3 6", 3], ["9 3 3 3", 1.5], ["6 9 3", 1.5]],
      plain: ["12", "6 6", "3 3 3 3", "6 3 3", "3 3 6", "3 6 3", "-3 3 3 3", "-6 3 3", "18", "6 6 6", "3 3 6 6", "6 3 3 6", "12 3 3"] },
    { name: { de: "Achteltriolen", en: "Eighth-note triplets" },
      cells: [...BASIC, ["4 4 4", 4], ["8 4", 2], ["-4 4 4", 1], ["24", 0.4]],
      plain: [...PLAIN, "24"] },
    // 6/8 used to be a level of its own; now a meter for every level. Kept for saved attempts, not listed
    { name: { de: "6/8-Takt", en: "6/8 time" },
      compound: [["18", 2], ["6 6 6", 4], ["12 6", 3], ["6 12", 1.5], ["-6 6 6", 1], ["6 6 -6", 0.8], ["9 3 6", 2], ["-18", 0.4], ["36", 0.5]] },
    { name: { de: "Haltebögen", en: "Ties" },
      cells: [...BASIC, ["18 6", 1], ["6 12 6", 1], ...TIES],
      compound: [...BASIC8, ["6 12", 1], ["6 6 6~", 1.5], ["12 6~", 1.5], ["18~", 1.2], ["6 12~", 1], ["36~", 0.4]],
      plain: [...PLAIN, "18 6", "6 12 6", "6 12"] },
    { name: { de: "Alles gemischt", en: "Everything mixed" },
      cells: [...BASIC, ["18 6", 1.5], ["6 12 6", 1.2], ["3 3 3 3", 1.5], ["6 3 3", 1.2], ["3 3 6", 1.2], ["9 3", 1.5], ["3 6 3", 1], ["4 4 4", 1.5], ["8 4", 0.8], ["24", 0.5],
              ["6 6~", 1], ["12~", 0.8]],
      compound: [...BASIC8, ["6 12", 1], ["3 3 6 6", 1], ["6 3 3 6", 1], ["9 3 6", 1], ["12 3 3", 0.8], ["36", 0.4], ["6 6 6~", 0.6], ["12 6~", 0.6]] },
    // offbeats, anticipations tied over the beat or the bar line, Charleston "6 -12 6", syncopated quarters. From hard on
    // also quarter-note triplets, offbeat quarter chains, offbeat stabs, 3-3-2 across the bar and eighth-note triplets
    { name: { de: "Jazz-Phrasierung", en: "Jazz phrasing" },
      cells: [["12", 1.2], ["6 6", 2], ["-6 6", 2], ["6 -6", 1.2], ["-12", 0.5], ["6 12 6", 2], ["-6 12 6", 1.5], ["6 -12 6", 1.5], ["-6 18", 1],
              ["18 6", 1], ["6 6~", 1.6], ["-6 6~", 1.4], ["12 -6 6~", 1], ["6 12 12 12 6", 0.6],
              ["8 8 8", 1, 3], ["-6 12 12 12 6", 0.8, 3], ["-12 6 6~", 1, 3], ["-6 6 -6 6~", 1, 3], ["18 18 12", 0.6, 3], ["4 4 4", 0.8, 3],
              ["-6 18 18 6", 0.6, 4], ["-4 4 4", 0.6, 4]],
      plain: ["12", "6 6", "6 -6", "-12", "18 6"] },
    // whole bars of rest, then an entry after the rest. cells only fill the bars that are played
    { name: { de: "Pausen zählen", en: "Counting rests" }, rests: true,
      cells: [["12", 3], ["6 6", 3], ["24", 1.2], ["-12", 0.8], ["18 6", 0.8], ["6 12 6", 0.6], ["36", 0.4]],
      compound: [["18", 3], ["6 6 6", 3], ["12 6", 2.5], ["-18", 0.8], ["36", 0.6]] },
    // entries on the second and fourth sixteenth ("e" and "te") after a sixteenth rest, rests between sixteenths
    { name: { de: "Sechzehntelpausen", en: "Sixteenth rests" },
      cells: [...BASIC, ["3 3 3 3", 1.5], ["6 3 3", 1.2], ["3 3 6", 1.2], ["-6 3 3", 1],
              ["-3 3 3 3", 3], ["-3 3 6", 2], ["6 -3 3", 2.5], ["3 3 -3 3", 2], ["3 -3 3 3", 1.5], ["-6 -3 3", 1.5],
              ["-3 9", 1, 2], ["3 -3 3 -3", 1, 2], ["-3 3 -3 3", 1, 3], ["-3 6 3", 1, 3]],
      compound: [...BASIC8, ["3 3 6 6", 1.2], ["6 3 3 6", 1.2], ["6 6 3 3", 1.2],
                 ["-3 3 6 6", 2.5], ["6 -3 3 6", 2], ["6 6 -3 3", 2], ["-3 3 3 3 6", 1.5], ["3 -3 6 6", 1.2], ["-6 -3 3 6", 1, 2]],
      plain: [...PLAIN, "3 3 3 3", "6 3 3", "3 3 6", "-6 3 3", "3 3 6 6", "6 3 3 6", "6 6 3 3"] },
  ];
  // the level list: sixteenth rests, counting rests and jazz phrasing came later and are put in place, everything mixed
  // stays last, the old 6/8 level is left out
  const ORDER = [0, 1, 2, 3, 4, 11, 5, 7, 10, 9, 8];

  const meterOptions = level => [...(LEVELS[level].cells ? SIMPLE : []), ...(LEVELS[level].compound ? COMPOUND : [])];
  const meterFor = (level, wanted) => {
    const options = meterOptions(level);
    return options.includes(wanted) ? wanted : options.includes("4/4") ? "4/4" : options[0];
  };

  function parse(cell) {
    return cell.split(" ").map(t => ({ duration: Math.abs(parseInt(t, 10)), rest: t.startsWith("-"), tied: t.endsWith("~") }));
  }
  const cellLength = cell => parse(cell).reduce((s, n) => s + n.duration, 0);

  function fits(cell, pos, meter) {
    const l = cellLength(cell);
    if (pos % meter.beat || pos + l > meter.length) return false;
    if (l > 2 * meter.beat) return pos === 0;
    if (meter.halves && l === 2 * meter.beat) return pos % l === 0;
    // in 4/4, 6/4 and 12/8 two beats do not cross the middle of the bar
    const beats = meter.length / meter.beat, half = meter.length / 2;
    if (l === 2 * meter.beat && beats >= 4 && beats % 2 === 0) return Math.floor(pos / half) === Math.floor((pos + l - 1) / half);
    return true;
  }

  // how hard a cell is to read, per beat, after the syncopation measure of Longuet-Higgins and Lee: a note on a weak
  // position held (or followed by rests) over a stronger one counts by how much stronger that is. An offbeat entry after
  // a rest on the beat and every tie count too, notes on sixteenths or triplets a little.
  // Difficulty 1 favours easy cells, 2 keeps the level's weights, 3 and 4 favour hard ones and bring extra cells
  const SKEW = [-1, 0, 1, 2.2];
  function hardness(cell, meter) {
    const notes = parse(cell), beat = meter.beat, starts = [];
    // triplets run on their own grid: only the beat is stronger than them
    const half = notes.some(n => n.duration === 4 || n.duration === 8) ? beat : beat === 18 ? 6 : beat / 2;
    const strength = pos => pos % beat === 0 ? 0 : pos % half === 0 ? 1 : 2;
    let length = 0;
    for (const n of notes) { starts.push(length); length += n.duration; }
    const onset = j => !notes[j].rest && !notes[j - 1]?.tied;
    let score = 0;
    notes.forEach((n, i) => {
      const s = strength(starts[i]);
      if (n.tied) score += 0.5;
      if (n.rest) {
        if (s === 0 && notes[i + 1] && !notes[i + 1].rest && strength(starts[i + 1]) > 0) score += 0.5;
        return;
      }
      if (!onset(i)) return;
      if (s === 2) score += 0.3;
      let next = i + 1;
      while (next < notes.length && !onset(next)) next++;
      // a note tied out of the cell is still sounding on the next beat
      const end = next < notes.length ? starts[next] : length + Number(notes.at(-1).tied);
      let strongest = s;
      for (let q = starts[i] + 1; q < end; q++) strongest = Math.min(strongest, strength(q));
      score += s - strongest;
    });
    return score * beat / length;
  }

  function pick(list, random) {
    const total = list.reduce((s, [, w]) => s + w, 0);
    let r = random() * total;
    for (const [value, weight] of list) if ((r -= weight) < 0) return value;
    return list[list.length - 1][0];
  }

  // pickup: the chance that the rhythm starts with an upbeat bar before the first full one
  function generate({ level = 1, meter = "4/4", bars = 1, difficulty = 2, pickup = 0, random = Math.random } = {}) {
    const l = LEVELS[level];
    meter = meterFor(level, meter);
    const m = METERS[meter], g = grid(m), skew = SKEW[difficulty - 1] ?? 0;
    // capped, so the hardest cell does not crowd out all the others
    const cells = (m.beat === 18 ? l.compound : l.cells).filter(([, , from = 1]) => difficulty >= from)
      .map(([cell, weight]) => [cell, weight * Math.exp(skew * Math.min(1.2, hardness(cell, g)))]);
    const tripletCell = cell => parse(cell).some(n => n.duration === 4 || n.duration === 8);
    const endsTied = cell => Boolean(cell && parse(cell).at(-1).tied);
    // in alla breve the eighths of a half note share one beam, like in a part
    const beamable = cell => cellLength(cell) === 12 && parse(cell).every(n => !n.rest && n.duration === 6);
    let group = 0;
    const toNotes = (cells, start = 0) => {
      // two quarter rests on one half of a 4/4, 2/2 or 3/2 bar are written as a half rest
      const list = [];
      let at = start;
      for (const cell of cells) {
        if ((g.halves || meter === "4/4") && cell === "-12" && list.at(-1) === "-12" && at % 24 === 12) list[list.length - 1] = "-24";
        else list.push(cell);
        at += cellLength(cell);
      }
      const notes = [];
      let pos = start, previous = null;
      for (const cell of list) {
        const triplet = tripletCell(cell);
        if (!(m.beat === 24 && pos % 24 === 12 && previous && beamable(previous) && beamable(cell))) group++;
        for (const n of parse(cell)) { notes.push({ ...n, start: pos, group, triplet }); pos += n.duration; }
        previous = cell;
      }
      return notes;
    };
    const fill = (list, pos, options) => {
      while (pos < g.length) {
        const cell = pick(options.filter(([c]) => fits(c, pos, g)), random);
        list.push(cell);
        pos += cellLength(cell);
      }
      return list;
    };
    const result = [];
    if (l.rests) {
      // runs of whole-bar rests (longer from hard on), each followed by a bar that comes in after a rest: on a beat,
      // from medium on also on the "and". The rhythm never ends in rests.
      const [low, high] = [[1, 1], [1, 2], [1, 3], [2, 4]][difficulty - 1] ?? [1, 2];
      const kinds = [];
      while (kinds.length < bars) {
        const left = bars - kinds.length;
        if (left >= 2) for (let k = Math.min(left - 1, low + Math.floor(random() * (high - low + 1))); k > 0; k--) kinds.push("rest");
        kinds.push("entry");
        if (kinds.length < bars && random() < 0.4) kinds.push("play");
      }
      const beats = g.length / g.beat, play = cells.filter(([c]) => !parse(c)[0].rest);
      kinds.forEach((kind, b) => {
        if (kind === "rest") return result.push(toNotes([`-${g.length}`]));
        if (kind === "play") return result.push(toNotes(fill([], 0, cells)));
        const first = kinds[b - 1] === "rest" ? 0 : 1, beat = first + Math.floor(random() * (beats - first));
        const offbeat = difficulty >= 2 && random() < (difficulty >= 3 ? 0.65 : 0.4);
        const list = [];
        let pos = 0;
        while (pos < beat * g.beat) {
          const half = g.beat === 12 && beats % 2 === 0 && beats >= 4 && pos % 24 === 0 && beat * g.beat - pos >= 24;
          list.push(half ? "-24" : `-${g.beat}`);
          pos += half ? 24 : g.beat;
        }
        const entries = !offbeat ? play : g.beat === 18 ? [["-6 6 6", 2], ["-12 6", 1.5], ["-6 12", 1.5]] : [["-6 6", 3], ["-6 12 6", 1], ["-6 18", 0.6]];
        const entry = pick(entries.filter(([c]) => fits(c, pos, g)), random);
        list.push(entry);
        result.push(toNotes(fill(list, pos + cellLength(entry), cells)));
      });
      return { level, meter, bars: result };
    }
    let last = null;
    for (let b = 0; b < bars; b++) {
      // a bar is drawn again until it has the topic of the level and at least two notes to tap (one on the first level)
      for (let attempt = 0; ; attempt++) {
        const before = last, groupBefore = group, list = [];
        let pos = 0, topic = !l.plain;
        while (pos < g.length) {
          // after a tie the next cell starts with a note it can be tied to, from hard on the same cell rarely comes twice.
          // The last bar does not end in a tie.
          let options = cells.filter(([c]) => fits(c, pos, g) && !(b === bars - 1 && pos + cellLength(c) === g.length && endsTied(c)));
          const tieable = options.filter(([c]) => !parse(c)[0].rest && !tripletCell(c));
          if (endsTied(last) && tieable.length) options = tieable;
          const cell = pick(options.map(([c, w]) => [c, c === last && difficulty >= 3 ? 0.3 * w : w]), random);
          if (!l.plain?.includes(cell)) topic = true;
          last = cell;
          list.push(cell);
          pos += cellLength(cell);
        }
        const notes = toNotes(list);
        const tapped = notes.filter((n, i) => !n.rest && !(i ? notes[i - 1].tied : endsTied(before))).length;
        if ((topic && tapped >= (level === 0 ? 1 : 2)) || attempt > 50) { result.push(notes); break; }
        last = before;
        group = groupBefore;
      }
    }
    // a tie only into a note: not into a rest or a triplet
    const all = result.flat();
    all.forEach((n, i) => { if (n.tied && (!all[i + 1] || all[i + 1].rest || all[i + 1].triplet)) n.tied = false; });
    if (random() >= pickup) return { level, meter, bars: result };
    // the pickup is the end of a bar whose silent start is not drawn: an eighth, one beat or, with no sixteenths or
    // triplets around, two beats
    const dense = cells.some(([c]) => parse(c).some(n => [3, 4, 8, 9].includes(n.duration)));
    const length = pick([[6, level === 0 && g.beat === 12 ? 0 : 2], [g.beat, 2], [2 * g.beat, g.length >= 3 * g.beat && !dense ? 1 : 0]]
      .filter(([, w]) => w), random);
    const starts = cells.filter(([c]) => !parse(c)[0].rest && !endsTied(c));
    const list = length === 6 ? ["6"] : fill([], g.length - length, starts);
    const silent = { duration: g.length - length, rest: true, tied: false, start: 0, group: ++group, triplet: false, hidden: true };
    return { level, meter, bars: [[silent, ...toNotes(list, g.length - length)], ...result], pickup: length };
  }

  // swing: the eighth after the beat comes at two thirds of the beat (triplet feel), sixteenths in between follow,
  // triplets are left as written, compound meters do not swing
  function noteTick(n, meter, swing = false) {
    if (!swing || n.triplet || meter.beat === 18) return n.start;
    const within = n.start % 12, beat = n.start - within;
    return beat + (within <= 6 ? within * 4 / 3 : 8 + (within - 6) * 2 / 3);
  }

  function onsets(rhythm, swing = false) {
    const m = METERS[rhythm.meter], list = [];
    let previous = null;
    rhythm.bars.forEach((notes, bar) => notes.forEach((n, index) => {
      if (!n.rest && !previous?.tied) list.push({ bar, index, tick: bar * m.length + noteTick(n, m, swing) });
      previous = n;
    }));
    return list;
  }

  function tickDuration(meter, tempo) { return 60 / tempo / METERS[meter].beat; }

  // greedy matching: closest tap–note pairs first, each tap used once. A tap within exact is on time, up to allowed
  // it is close, further away it does not count.
  function evaluate(expected, taps, { exact = 0.06, allowed = 2.2 * exact } = {}) {
    let gap = Infinity;
    for (let i = 1; i < expected.length; i++) gap = Math.min(gap, expected[i] - expected[i - 1]);
    const tapWindow = Math.min(Math.max(exact, allowed), 0.45 * gap);
    const pairs = [];
    expected.forEach((e, i) => taps.forEach((t, j) => { if (Math.abs(t - e) <= tapWindow) pairs.push([Math.abs(t - e), i, j]); }));
    pairs.sort((a, b) => a[0] - b[0]);
    const tapOf = new Array(expected.length).fill(-1), used = new Set();
    for (const [, i, j] of pairs) if (tapOf[i] < 0 && !used.has(j)) { tapOf[i] = j; used.add(j); }

    const notes = expected.map((e, i) => {
      if (tapOf[i] < 0) return { expected: e, actual: null, deviation: null, verdict: "missed" };
      const actual = taps[tapOf[i]], deviation = actual - e;
      return { expected: e, actual, deviation, verdict: Math.abs(deviation) <= exact ? "exact" : "close" };
    });
    const extra = taps.filter((_, j) => !used.has(j));
    const deviations = notes.filter(n => n.actual !== null).map(n => n.deviation).sort((a, b) => a - b);
    const middle = deviations.length ? (deviations.length & 1 ? deviations[deviations.length >> 1]
      : (deviations[deviations.length / 2 - 1] + deviations[deviations.length / 2]) / 2) : null;
    const count = verdict => notes.filter(n => n.verdict === verdict).length;
    return {
      notes, extra, window: tapWindow,
      exact: count("exact"), close: count("close"), missed: count("missed"),
      correct: !count("missed") && !extra.length,
      biasMs: middle === null ? null : Math.round(middle * 1000),  // positive = late
    };
  }

  const Rhythm = { METERS, SIMPLE, LEVELS, ORDER, meterOptions, meterFor, generate, hardness, onsets, noteTick, tickDuration, evaluate, parse };
  if (typeof module === "object" && module.exports) module.exports = Rhythm;
  else root.Rhythm = Rhythm;
})(typeof window !== "undefined" ? window : globalThis);
