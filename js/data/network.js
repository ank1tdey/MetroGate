import { fold, cleanQuery } from '../core/sanitize.js';

/** Validates the raw JSON and exposes lookups used by routing, map, game and UI. */
export class Network {
  constructor(raw, layout) {
    Network.validate(raw, layout);
    this.meta = raw.meta;
    this.layout = layout;
    this.lines = raw.lines;
    this.stations = raw.stations;
    this.linesById = new Map(raw.lines.map((l) => [l.id, l]));
    this.stationsById = new Map(raw.stations.map((s) => [s.id, s]));
    this.interchangeById = new Map(raw.interchanges.map((i) => [i.station, i]));
    this.indexOnLine = new Map(raw.lines.map((l) => [l.id, new Map(l.stations.map((s, i) => [s, i]))]));
    this.suspendedSegments = new Map(raw.lines.map((l) => [l.id, this.#suspendedFlags(l)]));
    this.#searchIndex = raw.stations.map((s) => ({
      station: s,
      terms: [s.name, ...(s.aliases || [])].map(fold),
    }));
  }

  #searchIndex;

  static validate(raw, layout) {
    const fail = (msg) => { throw new Error(`Network data problem: ${msg}`); };
    if (!raw || raw.schema !== 2) fail('unsupported schema');
    if (!Array.isArray(raw.lines) || !Array.isArray(raw.stations)) fail('missing lines or stations');
    const ids = new Set(raw.stations.map((s) => s.id));
    if (ids.size !== raw.stations.length) fail('duplicate station ids');
    for (const l of raw.lines) {
      if (new Set(l.stations).size !== l.stations.length) fail(`line ${l.id} repeats a station`);
      for (const s of l.stations) if (!ids.has(s)) fail(`line ${l.id} references unknown station ${s}`);
      if (!/^#[0-9a-fA-F]{6}$/.test(l.color)) fail(`line ${l.id} has an invalid colour`);
    }
    for (const s of raw.stations) {
      if (!layout?.stations?.[s.id]) fail(`no map position for ${s.id}`);
    }
  }

  #suspendedFlags(line) {
    const flags = Array(Math.max(0, line.stations.length - 1)).fill(false);
    for (const section of line.sections || []) {
      if (section.status !== 'suspended') continue;
      const a = line.stations.indexOf(section.from);
      const b = line.stations.indexOf(section.to);
      for (let i = Math.min(a, b); i < Math.max(a, b); i++) flags[i] = true;
    }
    return flags;
  }

  station(id) { return this.stationsById.get(id); }
  line(id) { return this.linesById.get(id); }
  hasStation(id) { return this.stationsById.has(id); }
  isInterchange(id) { return this.interchangeById.has(id); }
  interchange(id) { return this.interchangeById.get(id); }
  indexOf(lineId, stationId) { return this.indexOnLine.get(lineId)?.get(stationId); }
  segmentSuspended(lineId, i) { return this.suspendedSegments.get(lineId)?.[i] === true; }

  /** Lines serving a station. When includeSuspended is false, lines whose only connections are closed are skipped. */
  linesAt(stationId, includeSuspended = true) {
    const s = this.station(stationId);
    if (!s) return [];
    return s.lines.filter((lineId) => includeSuspended || this.isActiveOnLine(lineId, stationId));
  }

  isActiveOnLine(lineId, stationId) {
    const line = this.line(lineId);
    const i = this.indexOf(lineId, stationId);
    if (i === undefined) return false;
    if (line.stations.length === 1) return true;
    const before = i > 0 && !this.segmentSuspended(lineId, i - 1);
    const after = i < line.stations.length - 1 && !this.segmentSuspended(lineId, i);
    return before || after;
  }

  /** Contiguous run of open stations around index i, as [startIndex, endIndex]. */
  runAround(lineId, i, includeSuspended = false) {
    const last = this.line(lineId).stations.length - 1;
    let a = i; let b = i;
    if (includeSuspended) return [0, last];
    while (a > 0 && !this.segmentSuspended(lineId, a - 1)) a--;
    while (b < last && !this.segmentSuspended(lineId, b)) b++;
    return [a, b];
  }

  /** Terminus stations reached by trains in each direction, given current suspensions. */
  endsOf(lineId, includeSuspended = false) {
    const line = this.line(lineId);
    let best = [0, line.stations.length - 1];
    if (!includeSuspended) {
      best = null;
      let i = 0;
      while (i < line.stations.length) {
        const run = this.runAround(lineId, i, false);
        if (!best || run[1] - run[0] > best[1] - best[0]) best = run;
        i = run[1] + 1;
      }
    }
    return { first: line.stations[best[0]], last: line.stations[best[1]] };
  }

  neighbours(lineId, stationId) {
    const line = this.line(lineId);
    const i = this.indexOf(lineId, stationId);
    return { prev: i > 0 ? line.stations[i - 1] : null, next: i < line.stations.length - 1 ? line.stations[i + 1] : null };
  }

  /** Search by name or any known local/former name. */
  search(query, limit = 8) {
    const q = fold(query);
    if (!q) return [];
    const scored = [];
    for (const { station, terms } of this.#searchIndex) {
      let best = Infinity;
      terms.forEach((t, idx) => {
        let score = Infinity;
        if (t === q) score = 0;
        else if (t.startsWith(q)) score = 1;
        else if (t.split(' ').some((w) => w.startsWith(q))) score = 2;
        else if (t.includes(q)) score = 3;
        if (score < Infinity) best = Math.min(best, score + (idx > 0 ? 0.5 : 0));
      });
      if (best < Infinity) scored.push({ station, score: best });
    }
    return scored.sort((a, b) => a.score - b.score || a.station.name.localeCompare(b.station.name)).slice(0, limit).map((x) => x.station);
  }

  /** Resolve free text to exactly one station, or null when ambiguous or unknown. */
  resolve(text) {
    const q = fold(text);
    if (!q) return null;
    const exact = this.stations.find((s) => [s.name, ...(s.aliases || [])].some((n) => fold(n) === q));
    if (exact) return exact;
    const hits = this.search(cleanQuery(text), 2);
    return hits.length === 1 ? hits[0] : null;
  }

  /** Connected groups of stations given current suspensions. Used to explain "no route". */
  components(includeSuspended = false) {
    const parent = new Map(this.stations.map((s) => [s.id, s.id]));
    const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    const join = (a, b) => parent.set(find(a), find(b));
    for (const l of this.lines) {
      l.stations.forEach((s, i) => {
        if (i && (includeSuspended || !this.segmentSuspended(l.id, i - 1))) join(l.stations[i - 1], s);
      });
    }
    const groups = new Map();
    for (const s of this.stations) {
      const root = find(s.id);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(s.id);
    }
    return [...groups.values()];
  }
}
