import test from 'node:test';
import assert from 'node:assert/strict';
import { net } from './helpers.mjs';
import { planRoutes } from '../js/routing/router.js';
import { buildSteps } from '../js/routing/itinerary.js';

test('dataset shape: 55 unique stations, 58 line entries, 3 interchanges', () => {
  assert.equal(net.stations.length, 55);
  assert.equal(net.lines.reduce((n, l) => n + l.stations.length, 0), 58);
  assert.deepEqual([...net.interchangeById.keys()].sort(), ['esplanade', 'kavi-subhash', 'noapara']);
});

test('same line, no change, stop count matches index distance', () => {
  const r = planRoutes(net, 'dakshineswar', 'esplanade');
  assert.equal(r.ok, true);
  assert.equal(r.routes[0].interchanges, 0);
  assert.equal(r.routes[0].stops, net.indexOf('blue', 'esplanade'));
  assert.equal(r.routes[0].legs[0].towardId, 'shahid-khudiram'); // Kavi Subhash is closed: trains turn back earlier
});

test('direction flips on the way back', () => {
  const r = planRoutes(net, 'esplanade', 'dakshineswar').routes[0];
  assert.equal(r.legs[0].towardId, 'dakshineswar');
});

test('one change: Howrah to Dum Dum Cantonment changes at Esplanade then Noapara', () => {
  const r = planRoutes(net, 'howrah', 'dum-dum-cantonment').routes[0];
  assert.deepEqual(r.changes.map((c) => c.stationId), ['esplanade', 'noapara']);
  assert.deepEqual(r.legs.map((l) => l.lineId), ['green', 'blue', 'yellow']);
  assert.equal(r.interchanges, 2);
  assert.equal(r.usesSuspended, false);
});

test('station order has no duplicate at interchanges', () => {
  const r = planRoutes(net, 'howrah-maidan', 'jai-hind').routes[0];
  assert.equal(new Set(r.stationPath).size, r.stationPath.length);
});

test('Purple Line is not connected to the rest of today\'s network', () => {
  const r = planRoutes(net, 'joka', 'esplanade');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'unreachable');
  assert.equal(r.hint, null); // no suspended link would fix it
});

test('Orange Line is cut off only because Kavi Subhash (Blue) is suspended', () => {
  const now = planRoutes(net, 'beleghata', 'esplanade');
  assert.equal(now.ok, false);
  assert.ok(now.hint, 'offers the full-network route as a hint');
  assert.equal(now.hint.usesSuspended, true);
  const full = planRoutes(net, 'beleghata', 'esplanade', { includeSuspended: true });
  assert.equal(full.ok, true);
  assert.deepEqual(full.routes[0].changes.map((c) => c.stationId), ['kavi-subhash']);
  assert.equal(full.routes[0].usesSuspended, true);
});

test('Blue Line southern end: Kavi Subhash is only reachable via Orange today', () => {
  assert.equal(planRoutes(net, 'esplanade', 'kavi-subhash').ok, false);
  assert.equal(planRoutes(net, 'satyajit-ray', 'kavi-subhash').ok, true);
  assert.equal(planRoutes(net, 'esplanade', 'shahid-khudiram').ok, true);
});

test('every pair of stations is symmetric in stops and changes', () => {
  const ids = net.stations.map((s) => s.id);
  let pairs = 0;
  for (const a of ids) for (const b of ids) {
    if (a >= b) continue;
    const ab = planRoutes(net, a, b); const ba = planRoutes(net, b, a);
    assert.equal(ab.ok, ba.ok, `${a}-${b} reachability`);
    if (ab.ok) {
      assert.equal(ab.routes[0].stops, ba.routes[0].stops, `${a}-${b} stops`);
      assert.equal(ab.routes[0].interchanges, ba.routes[0].interchanges, `${a}-${b} changes`);
      pairs++;
    }
  }
  assert.ok(pairs > 600, `expected many routable pairs, got ${pairs}`);
});

test('connected components match what the planner can reach', () => {
  const sizes = net.components(false).map((c) => c.length).sort((a, b) => b - a);
  // Blue(25 open)+Green(12)+Yellow(4) share Esplanade and Noapara => 39; Orange(9) incl. Kavi Subhash; Purple(7)
  assert.deepEqual(sizes, [39, 9, 7]);
});

test('steps never invent timings or platforms', () => {
  const r = planRoutes(net, 'howrah', 'dum-dum-cantonment').routes[0];
  const text = buildSteps(net, r).map((s) => `${s.title} ${s.detail}`).join(' ').toLowerCase();
  assert.ok(!/platform \d|minutes|min\b|₹|rs\./.test(text));
});

test('search finds stations by local and former names', () => {
  assert.equal(net.search('tollygunge')[0].id, 'mahanayak-uttam-kumar');
  assert.equal(net.search('airport')[0].id, 'jai-hind');
  assert.equal(net.search('dharmatala')[0].id, 'esplanade');
  assert.equal(net.resolve('  ESPLANADE ').id, 'esplanade');
  assert.equal(net.resolve('zzzz'), null);
});
