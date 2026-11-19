import test from 'node:test';
import assert from 'node:assert/strict';
import { net } from './helpers.mjs';
import { cumulative, pointAt, routePoints } from '../js/map/geometry.js';
import { planRoutes } from '../js/routing/router.js';

test('pointAt interpolates and clamps', () => {
  const pts = [[0, 0], [10, 0], [10, 10]]; const cum = cumulative(pts);
  assert.deepEqual(pointAt(pts, cum, 5), { x: 5, y: 0, angle: 0 });
  assert.equal(pointAt(pts, cum, 15).y, 5);
  assert.equal(pointAt(pts, cum, 999).y, 10);
});

test('route geometry passes through every station of every route, in order', () => {
  const ids = net.stations.map((s) => s.id);
  for (const a of ids) for (const b of ids) {
    if (a === b) continue;
    const r = planRoutes(net, a, b); if (!r.ok) continue;
    const rp = routePoints(net, r.routes[0]);
    assert.equal(rp.stops.length, r.routes[0].stationPath.length);
    let last = -1;
    for (const s of rp.stops) { assert.ok(s.dist >= last, `${a}>${b} stops ascend`); last = s.dist; }
    assert.ok(rp.stops.at(-1).dist > 0 || rp.points.length === 1);
  }
});

test('every station has a layout position inside the canvas, and no two share a spot', () => {
  const { canvas, stations } = net.layout; const seen = new Set();
  for (const [id, p] of Object.entries(stations)) {
    assert.ok(p.x >= 0 && p.x <= canvas.w && p.y >= 0 && p.y <= canvas.h, id);
    const k = `${p.x},${p.y}`; assert.ok(!seen.has(k), `overlap at ${id}`); seen.add(k);
  }
});
