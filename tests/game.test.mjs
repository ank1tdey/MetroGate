import test from 'node:test';
import assert from 'node:assert/strict';
import { net, game } from './helpers.mjs';
import { Progress, sanitizeState } from '../js/game/progress.js';
import { evaluate } from '../js/game/missions.js';
import { stationCheck } from '../js/game/quiz.js';
import { makeRouteTrial, makeLineRun, starsFor } from '../js/game/trials.js';
import { mulberry32, hashString, previousDate } from '../js/core/rng.js';
import { planRoutes } from '../js/routing/router.js';

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

test('XP is granted once per action, so repeating does not farm points', () => {
  const p = new Progress(net, game, mem());
  p.scout('esplanade'); const a = p.state.xp;
  p.scout('esplanade');
  assert.equal(p.state.xp, a);
  const r = planRoutes(net, 'howrah', 'dum-dum').routes[0];
  const first = p.recordPlan(r).xp; const again = p.recordPlan(r).xp;
  assert.ok(first > 0); assert.equal(again, 0);
});

test('ranks advance with XP and report progress to the next rank', () => {
  const p = new Progress(net, game, mem());
  assert.equal(p.rank().title, 'Fresh ticket');
  p.state.xp = 260;
  assert.equal(p.rank().title, 'Line reader');
  assert.ok(p.rank().ratio > 0 && p.rank().ratio < 1);
});

test('missions complete from state and award their XP exactly once', () => {
  const p = new Progress(net, game, mem());
  ['dakshineswar', 'baranagar', 'noapara', 'dum-dum', 'belgachhia'].forEach((s) => p.scout(s));
  assert.ok(p.state.missions['scout-5']);
  const xp = p.state.xp;
  p.scout('shyambazar');
  assert.equal(p.state.xp, xp + game.xp.scout);
  const m = evaluate(net, game, p.state).find((x) => x.id === 'line-yellow');
  assert.equal(m.target, 4);
});

test('line completion mission needs every station on the line', () => {
  const p = new Progress(net, game, mem());
  net.line('yellow').stations.forEach((s) => p.scout(s));
  assert.ok(p.state.missions['line-yellow']);
  assert.ok(!p.state.missions['line-blue']);
});

test('daily streak continues across consecutive days and resets after a gap', () => {
  const p = new Progress(net, game, mem());
  p.recordDaily('2026-11-16', previousDate('2026-11-16'), 3);
  p.recordDaily('2026-11-17', previousDate('2026-11-17'), 2);
  assert.equal(p.state.daily.streak, 2);
  p.recordDaily('2026-11-20', previousDate('2026-11-20'), 3);
  assert.equal(p.state.daily.streak, 1);
  assert.equal(p.state.daily.best, 2);
  const again = p.recordDaily('2026-11-20', previousDate('2026-11-20'), 3);
  assert.equal(again.xp, 0);
});

test('corrupted or hostile saved data is sanitised', () => {
  const dirty = { v: 1, xp: -5, scouted: { esplanade: 1, '<img onerror=x>': 1, nowhere: 1 }, plans: { 'plan:a~b': { interchanges: 99999 } }, daily: { last: 'x', streak: 'lots', done: { 'not-a-date': 1 } } };
  const s = sanitizeState(dirty, net);
  assert.equal(s.xp, 0);
  assert.deepEqual(Object.keys(s.scouted), ['esplanade']);
  assert.ok(s.plans['plan:a~b'].interchanges <= 20);
  assert.equal(s.daily.last, null);
  assert.deepEqual(s.daily.done, {});
  assert.equal(sanitizeState('garbage', net).xp, 0);
  const bad = mem(); bad.setItem('metrogame.progress.v1', '{not json');
  assert.equal(new Progress(net, game, bad).state.xp, 0);
});

test('works when storage is unavailable', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() {} };
  const p = new Progress(net, game, broken);
  assert.equal(p.persistent, false);
  p.scout('howrah'); assert.ok(p.isScouted('howrah'));
});

test('station checks always contain exactly one correct option from the data', () => {
  for (const s of net.stations) for (let seed = 0; seed < 8; seed++) {
    const q = stationCheck(net, s.id, mulberry32(hashString(s.id) + seed));
    assert.ok(q.options.length >= 2, `${s.id} has options`);
    assert.equal(q.options.filter((o) => o.id === q.answerId).length, 1, `${s.id}/${q.type}`);
    assert.equal(new Set(q.options.map((o) => o.id)).size, q.options.length);
  }
});

test('route trials are valid, solvable and deterministic for a seed', () => {
  const a = makeRouteTrial(net, mulberry32(hashString('2026-11-18')));
  const b = makeRouteTrial(net, mulberry32(hashString('2026-11-18')));
  assert.deepEqual(a.questions.map((q) => q.prompt), b.questions.map((q) => q.prompt));
  for (let i = 0; i < 40; i++) {
    const t = makeRouteTrial(net, mulberry32(i + 1));
    assert.ok(t.questions.length >= 3);
    for (const q of t.questions) {
      assert.equal(q.options.filter((o) => o.id === q.answerId).length, 1, `${t.from}>${t.to} ${q.id}`);
      assert.ok(q.options.length >= 2);
    }
  }
});

test('line runs: shuffled differs from the answer and stays on one open run', () => {
  for (let i = 0; i < 60; i++) {
    const r = makeLineRun(net, mulberry32(i + 7));
    assert.notDeepEqual(r.shuffled, r.ids);
    assert.deepEqual([...r.shuffled].sort(), [...r.ids].sort());
    const idx = r.ids.map((s) => net.indexOf(r.lineId, s));
    const step = idx[1] - idx[0];
    assert.ok(Math.abs(step) === 1 && idx.every((v, k) => k === 0 || v - idx[k - 1] === step));
    assert.ok(!(r.lineId === 'blue' && r.ids.includes('kavi-subhash')), 'does not use the suspended section');
  }
});

test('star rating', () => { assert.deepEqual([0, 1, 2, 5].map(starsFor), [3, 2, 1, 1]); });
