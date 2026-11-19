import { Emitter } from '../core/events.js';
import { evaluate } from './missions.js';
import { isIdShape } from '../core/sanitize.js';

const KEY = 'metrogame.progress.v1';
const MAX_KEYS = 4000; // guards against a hand-edited or corrupted save growing without limit

const blank = () => ({
  v: 1, xp: 0, awarded: {}, scouted: {}, stamped: {}, plans: {}, rides: {},
  trials: { count: 0, stars3: 0 }, lineRuns: { count: 0, clean: 0 },
  daily: { last: null, streak: 0, best: 0, done: {} }, missions: {},
});

const num = (v, max = 1e6) => (Number.isFinite(v) && v >= 0 ? Math.min(v, max) : 0);
function stampMap(obj, valid) {
  const out = {};
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj).slice(0, MAX_KEYS)) if (valid(k)) out[k] = num(v, 4e12) || 1;
  }
  return out;
}

/** Validate whatever came out of storage; never trust its shape. */
export function sanitizeState(raw, net) {
  const s = blank();
  if (!raw || typeof raw !== 'object' || raw.v !== 1) return s;
  const keyOk = (k) => typeof k === 'string' && k.length <= 120 && /^[a-z0-9:>~|.\-]+$/.test(k);
  s.xp = num(raw.xp);
  s.awarded = stampMap(raw.awarded, keyOk);
  s.scouted = stampMap(raw.scouted, (k) => isIdShape(k) && net.hasStation(k));
  s.stamped = stampMap(raw.stamped, (k) => isIdShape(k) && net.hasStation(k));
  s.rides = stampMap(raw.rides, keyOk);
  s.missions = stampMap(raw.missions, keyOk);
  if (raw.plans && typeof raw.plans === 'object') {
    for (const [k, v] of Object.entries(raw.plans).slice(0, MAX_KEYS)) {
      if (keyOk(k)) s.plans[k] = { interchanges: num(v?.interchanges, 20) };
    }
  }
  s.trials = { count: num(raw.trials?.count), stars3: num(raw.trials?.stars3) };
  s.lineRuns = { count: num(raw.lineRuns?.count), clean: num(raw.lineRuns?.clean) };
  const d = raw.daily ?? {};
  s.daily.last = /^\d{4}-\d{2}-\d{2}$/.test(d.last) ? d.last : null;
  s.daily.streak = num(d.streak, 3650);
  s.daily.best = num(d.best, 3650);
  s.daily.done = stampMap(d.done, (k) => /^\d{4}-\d{2}-\d{2}$/.test(k));
  return s;
}

export class Progress extends Emitter {
  constructor(net, game, storage = globalThis.localStorage) {
    super();
    this.net = net; this.game = game; this.storage = storage;
    this.state = this.#load();
    this.persistent = this.#probe();
  }

  #probe() {
    try { this.storage.setItem('metrogame.probe', '1'); this.storage.removeItem('metrogame.probe'); return true; } catch { return false; }
  }
  #load() {
    try { return sanitizeState(JSON.parse(this.storage.getItem(KEY)), this.net); } catch { return blank(); }
  }
  #save() { try { this.storage.setItem(KEY, JSON.stringify(this.state)); } catch { /* private mode or quota: keep playing in memory */ } }

  reset() { this.state = blank(); this.#save(); this.emit('change', {}); }

  /** XP is granted once per key. Replaying the same thing is free practice, not farming. */
  award(key, xp, label) {
    if (this.state.awarded[key] || xp <= 0) return 0;
    const before = this.rank();
    this.state.awarded[key] = Date.now();
    this.state.xp += xp;
    this.emit('xp', { xp, label });
    const after = this.rank();
    if (after.index > before.index) this.emit('rank', after);
    return xp;
  }

  #commit() {
    for (const m of evaluate(this.net, this.game, this.state)) {
      if (m.done && !this.state.missions[m.id]) {
        this.state.missions[m.id] = Date.now();
        this.award(`mission:${m.id}`, m.xp, m.title);
        this.emit('mission', m);
      }
    }
    this.#save();
    this.emit('change', {});
  }

  rank() {
    const ranks = this.game.ranks;
    let index = 0;
    ranks.forEach((r, i) => { if (this.state.xp >= r.min) index = i; });
    const cur = ranks[index]; const next = ranks[index + 1] ?? null;
    return {
      index, level: index + 1, title: cur.title, xp: this.state.xp,
      nextTitle: next?.title ?? null, into: this.state.xp - cur.min,
      span: next ? next.min - cur.min : 1, ratio: next ? (this.state.xp - cur.min) / (next.min - cur.min) : 1,
    };
  }

  isScouted(id) { return Boolean(this.state.scouted[id]); }
  isStamped(id) { return Boolean(this.state.stamped[id]); }

  scout(id) {
    if (!this.net.hasStation(id) || this.state.scouted[id]) return false;
    this.state.scouted[id] = Date.now();
    this.award(`scout:${id}`, this.game.xp.scout, 'Station scouted');
    this.emit('scouted', { id });
    this.#commit();
    return true;
  }
  stamp(id) {
    if (!this.net.hasStation(id) || this.state.stamped[id]) return false;
    this.scout(id);
    this.state.stamped[id] = Date.now();
    this.award(`stamp:${id}`, this.game.xp.stamp, 'Passport stamped');
    this.emit('stamped', { id });
    this.#commit();
    return true;
  }
  static pairKey(a, b) { return [a, b].sort().join('~'); }

  recordPlan(route) {
    const key = `plan:${Progress.pairKey(route.from, route.to)}`;
    const isNew = !this.state.plans[key];
    if (isNew) this.state.plans[key] = { interchanges: route.interchanges };
    const xp = this.award(key, this.game.xp.plan, 'Journey planned');
    this.#commit();
    return { isNew, xp };
  }
  recordRide(route) {
    const key = `ride:${Progress.pairKey(route.from, route.to)}`;
    const isNew = !this.state.rides[key];
    if (isNew) this.state.rides[key] = Date.now();
    const xp = this.award(key, this.game.xp.ride, 'Ride completed');
    this.#commit();
    return { isNew, xp };
  }
  recordTrial({ from, to, stars }) {
    this.state.trials.count += 1;
    if (stars === 3) this.state.trials.stars3 += 1;
    const x = this.game.xp;
    const xp = this.award(`trial:${Progress.pairKey(from, to)}`, x.trialBase + x.trialPerStar * stars, 'Route trial');
    this.#commit();
    return { xp };
  }
  recordLineRun({ lineId, startId, mistakes, stars }) {
    this.state.lineRuns.count += 1;
    if (mistakes === 0) this.state.lineRuns.clean += 1;
    const x = this.game.xp;
    const xp = this.award(`run:${lineId}:${startId}`, x.lineRunBase + x.lineRunPerStar * stars, 'Line run');
    this.#commit();
    return { xp };
  }
  dailyDone(date) { return Boolean(this.state.daily.done[date]); }
  recordDaily(date, previousDay, stars) {
    if (this.state.daily.done[date]) return { xp: 0, streak: this.state.daily.streak };
    const d = this.state.daily;
    d.streak = d.last === previousDay ? d.streak + 1 : 1;
    d.best = Math.max(d.best, d.streak);
    d.last = date;
    d.done[date] = stars;
    const x = this.game.xp;
    const xp = this.award(`daily:${date}`, x.dailyBase + x.dailyStreakStep * Math.min(d.streak, x.dailyStreakCap), 'Daily route');
    this.#commit();
    return { xp, streak: d.streak };
  }

  lineProgress(lineId) {
    const ids = this.net.line(lineId).stations;
    return { scouted: ids.filter((s) => this.state.scouted[s]).length, stamped: ids.filter((s) => this.state.stamped[s]).length, total: ids.length };
  }
  missions() { return evaluate(this.net, this.game, this.state); }
}
