import test from 'node:test';
import assert from 'node:assert/strict';
import { net } from './helpers.mjs';
import { haversineKm, nearestStations, interpretPosition, LocationService } from '../js/location/locationService.js';
import { JourneyTracker } from '../js/location/journeyTracker.js';
import { planRoutes } from '../js/routing/router.js';

test('does not touch geolocation until start() is called', () => {
  let calls = 0;
  const geo = { watchPosition() { calls++; return 1; }, clearWatch() {} };
  const svc = new LocationService(geo);
  assert.equal(calls, 0); assert.equal(svc.active, false);
  svc.start(); assert.equal(calls, 1); assert.equal(svc.active, true);
  svc.stop(); assert.equal(svc.active, false);
});

test('missing geolocation is reported, not thrown', () => {
  const svc = new LocationService(null); let err;
  svc.on('error', (e) => { err = e; });
  assert.equal(svc.start(), false); assert.equal(err.code, 'unsupported');
});

test('haversine is sensible: Dakshineswar to Esplanade is roughly 10 km', () => {
  const d = haversineKm(net.station('dakshineswar').geo, net.station('esplanade').geo);
  assert.ok(d > 9 && d < 12, String(d));
});

test('a fix on top of Esplanade finds Esplanade; a rough fix refuses to guess', () => {
  const g = net.station('esplanade').geo;
  const hit = interpretPosition(net, { ...g, accuracy: 20 });
  assert.equal(hit.nearest.id, 'esplanade'); assert.equal(hit.confidence, 'medium');
  assert.ok(/confirm/i.test(hit.note));
  const rough = interpretPosition(net, { ...g, accuracy: 900 });
  assert.equal(rough.kind, 'weak'); assert.equal(rough.nearest, undefined);
  assert.equal(interpretPosition(net, { lat: NaN, lng: 1, accuracy: 5 }).kind, 'none');
});

test('off-route hint appears only when far from every remaining station', () => {
  const route = planRoutes(net, 'dakshineswar', 'belgachhia').routes[0];
  const far = interpretPosition(net, { ...net.station('joka').geo, accuracy: 30 }, route, 0);
  assert.equal(far.offRoute, true);
  const on = interpretPosition(net, { ...net.station('dum-dum').geo, accuracy: 30 }, route, 0);
  assert.equal(on.offRoute, false);
});

test('tracker walks a two-change route and reports the right next action', () => {
  const route = planRoutes(net, 'howrah', 'dum-dum-cantonment').routes[0];
  const t = new JourneyTracker(net, route);
  let done = false; t.on('done', () => { done = true; });
  const actions = [];
  do { actions.push(t.status().action); } while (t.advance());
  actions.push(t.status().action);
  assert.ok(actions.includes('change') && actions.at(-1) === 'arrived' && done);
  assert.equal(actions.filter((a) => a === 'change').length, 2);
  assert.equal(t.advance(), false);
});

test('tracker can be corrected by checking in at a later station', () => {
  const route = planRoutes(net, 'dakshineswar', 'central').routes[0];
  const t = new JourneyTracker(net, route);
  assert.equal(t.checkIn('girish-park'), true); assert.equal(t.currentId, 'girish-park');
  assert.equal(t.checkIn('joka'), false);
});
