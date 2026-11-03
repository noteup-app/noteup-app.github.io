(function (root) {
  "use strict";

  const NATURAL = [0, 2, 4, 5, 7, 9, 11];
  const LETTERS = { de: ["c", "d", "e", "f", "g", "a", "h"], en: ["C", "D", "E", "F", "G", "A", "B"] };
  const GLYPHS = { "-2": "𝄫", "-1": "♭", 0: "", 1: "♯", 2: "𝄪" };

  // steps: semitones up to the octave; descending: the scale used going down; lowercase: German title "a-Moll"
  const TYPES = {
    major: { name: { de: "Dur", en: "major" }, steps: [2, 2, 1, 2, 2, 2, 1] },
    dorian: { name: { de: "Dorisch", en: "Dorian" }, steps: [2, 1, 2, 2, 2, 1, 2] },
    phrygian: { name: { de: "Phrygisch", en: "Phrygian" }, steps: [1, 2, 2, 2, 1, 2, 2] },
    lydian: { name: { de: "Lydisch", en: "Lydian" }, steps: [2, 2, 2, 1, 2, 2, 1] },
    mixolydian: { name: { de: "Mixolydisch", en: "Mixolydian" }, steps: [2, 2, 1, 2, 2, 1, 2] },
    minor: { name: { de: "Moll", en: "minor" }, steps: [2, 1, 2, 2, 1, 2, 2], lowercase: true },
    locrian: { name: { de: "Lokrisch", en: "Locrian" }, steps: [1, 2, 2, 1, 2, 2, 2] },
    harmonicMinor: { name: { de: "Moll harmonisch", en: "harmonic minor" }, steps: [2, 1, 2, 2, 1, 3, 1], lowercase: true },
    melodicMinor: { name: { de: "Moll melodisch", en: "melodic minor" }, steps: [2, 1, 2, 2, 2, 2, 1], descending: "minor", lowercase: true },
  };

  const TONICS = [-1, 0, 1].flatMap(accidental => LETTERS.en.map((_, letter) => ({ letter, accidental })));

  function pitchName({ letter, accidental }, lang = "de") {
    if (lang === "en") return LETTERS.en[letter] + GLYPHS[accidental];
    const l = LETTERS.de[letter];
    if (accidental >= 0) return l + "is".repeat(accidental);
    if (l === "h") return accidental === -1 ? "b" : "heses";
    if (l === "e" || l === "a") return l + "s" + "es".repeat(-accidental - 1);
    return l + "es".repeat(-accidental);
  }

  // octave of the written letter (so C♭4 is midi 59) and the accidental in semitones
  function spell(midi, letter) {
    const octave = Math.round((midi - NATURAL[letter]) / 12) - 1;
    return { octave, accidental: midi - (12 * (octave + 1) + NATURAL[letter]) };
  }

  function spelled(midi, letter) {
    const { octave, accidental } = spell(midi, letter);
    return { midi, letter, step: octave * 7 + letter, accidental: GLYPHS[accidental] };
  }

  function noteLabel(midi, letter, lang = "de") {
    const { octave, accidental } = spell(midi, letter), name = pitchName({ letter, accidental }, lang);
    if (lang === "en") return name + octave;
    return octave >= 3 ? name + (["", "′", "″", "‴"][octave - 3] ?? "")
      : name[0].toUpperCase() + name.slice(1) + (["₂", "₁", ""][octave] ?? "");
  }

  function title(tonic, type, lang = "de") {
    const t = TYPES[type], name = pitchName(tonic, lang);
    if (lang === "en") return `${name} ${t.name.en}`;
    return `${t.lowercase ? name : name[0].toUpperCase() + name.slice(1)}-${t.name.de}`;
  }

  function chord(third, fifth, seventh) {
    if (third === 3 && fifth === 6 && seventh === 10) return "m7♭5";
    const minor = third === 3 ? "m" : "";
    return minor + (seventh === 11 ? (minor ? "(maj7)" : "maj7") : "7") + (fifth === 6 ? "♭5" : fifth === 8 ? "♯5" : "");
  }

  // up to the ninth, back down to the root, then the seventh chord of the scale up and down
  function exercise(tonic, type, root) {
    const degrees = steps => steps.reduce((list, s) => [...list, list.at(-1) + s], [0]).concat([12 + steps[0]]);
    const { steps, descending } = TYPES[type];
    const up = degrees(steps), down = degrees(descending ? TYPES[descending].steps : steps);
    const note = (degree, interval, part) => ({ ...spelled(root + interval, (tonic.letter + degree) % 7), part });
    const notes = [];
    for (let d = 0; d <= 8; d++) notes.push(note(d, up[d], "up"));
    for (let d = 7; d >= 0; d--) notes.push(note(d, down[d], "down"));
    for (const d of [0, 2, 4, 6, 7, 6, 4, 2, 0]) notes.push(note(d, up[d], "chord"));
    return { tonic, type, root, chord: chord(up[2], up[4], up[6]), notes };
  }

  function accidentals(tonic, type) {
    const pitches = new Map(exercise(tonic, type, 48 + NATURAL[tonic.letter] + tonic.accidental).notes
      .map(n => [`${n.step % 7}${n.accidental}`, n.accidental]));
    return [...pitches.values()].reduce((sum, a) => sum + (a === "𝄪" || a === "𝄫" ? 2 : a ? 1 : 0), 0);
  }

  const pitchClass = ({ letter, accidental }) => ((NATURAL[letter] + accidental) % 12 + 12) % 12;

  // on the lowest root from `lowest` up (F major on low F), only on the given tonics. When none of them fits any of the
  // types, a tonic is written the other way (A♯ major as B♭ major)
  function randomScale({ types = ["major", "mixolydian", "dorian"], tonics = TONICS, maxAccidentals = 7, lowest = 40, highest = 70, random = Math.random } = {}) {
    const fits = type => t => accidentals(t, type) <= maxAccidentals;
    const usable = types.filter(type => tonics.some(fits(type)));
    const pool = usable.length ? usable : types;
    const type = pool[Math.floor(random() * pool.length)];
    const fitting = usable.length ? tonics.filter(fits(type))
      : TONICS.filter(t => fits(type)(t) && tonics.some(r => pitchClass(r) === pitchClass(t)));
    const tonic = fitting[Math.floor(random() * fitting.length)];
    return exercise(tonic, type, lowest + ((pitchClass(tonic) - lowest) % 12 + 12) % 12);
  }

  function higher(previous, highest) {
    const e = exercise(previous.tonic, previous.type, previous.root + 12);
    return Math.max(...e.notes.map(n => n.midi)) <= highest ? e : null;
  }

  function tonicCode({ letter, accidental }) {
    return LETTERS.en[letter] + (accidental > 0 ? "#".repeat(accidental) : "b".repeat(-accidental));
  }

  function parseTonicCode(code) {
    const m = /^([A-G])(#{0,2}|b{0,2})$/.exec(String(code ?? ""));
    if (!m) return null;
    return { letter: LETTERS.en.indexOf(m[1]), accidental: m[2].length * (m[2][0] === "b" ? -1 : 1) };
  }

  const Scales = {
    TYPES, TONICS, pitchName, pitchClass, spelled, noteLabel, title, chord, exercise, accidentals,
    random: randomScale, higher, tonicCode, parseTonicCode,
  };
  if (typeof module === "object" && module.exports) module.exports = Scales;
  else root.Scales = Scales;
})(typeof window !== "undefined" ? window : globalThis);
