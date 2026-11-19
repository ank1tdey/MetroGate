import { Emitter } from '../core/events.js';

/**
 * Optional location support. Nothing here runs until start() is called from a button press.
 * Positions stay on the device: they are never stored and never sent anywhere.
 *
 * Reality check built into the numbers below: GPS often cannot see underground platforms, and
 * even above ground a phone's fix can be hundreds of metres off. Results are suggestions only.
 */
export const LIMITS = Object.freeze({ maxAccuracyM: 150, nearKm: 0.6, offRouteKm: 1.4 });

export function haversineKm(a, b) {
  const R = 6371; const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad; const dLng = (b.lng - a.lng) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Stations (that have approximate coordinates) within range, nearest first. */
export function nearestStations(net, pos, maxKm = LIMITS.nearKm) {
  return net.stations
    .filter((s) => s.geo)
    .map((s) => ({ station: s, km: haversineKm(pos, s.geo) }))
    .filter((x) => x.km <= maxKm)
    .sort((a, b) => a.km - b.km);
}

/**
 * Turn a position into a cautious hint. Never claims certainty and never moves the rider
 * automatically: the UI asks them to confirm.
 */
export function interpretPosition(net, pos, route = null, atIndex = 0) {
  if (!pos || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lng)) return { kind: 'none', note: 'No usable position yet.' };
  if (pos.accuracy > LIMITS.maxAccuracyM) {
    return { kind: 'weak', note: `Your location is only accurate to about ${Math.round(pos.accuracy)} m, too rough to name a station. This is normal near and under stations.` };
  }
  const near = nearestStations(net, pos);
  const result = { kind: near.length ? 'near' : 'far', nearest: near[0]?.station ?? null, km: near[0]?.km ?? null, confidence: 'low' };
  if (near.length) result.confidence = pos.accuracy <= 60 && near[0].km <= 0.25 ? 'medium' : 'low';
  result.note = near.length
    ? `You may be near ${near[0].station.name}, about ${Math.round(near[0].km * 1000)} m away. Confirm it yourself before relying on this.`
    : 'No known station within a few hundred metres of this position.';
  if (route) {
    const remaining = route.stationPath.slice(atIndex).map((id) => net.station(id)).filter((s) => s.geo);
    if (remaining.length) {
      const closest = Math.min(...remaining.map((s) => haversineKm(pos, s.geo)));
      result.offRoute = closest > LIMITS.offRouteKm;
      if (result.offRoute) result.note += ' You look some way from your planned route. If that is right, plan again from where you are.';
    }
  }
  return result;
}

export class LocationService extends Emitter {
  #watchId = null;
  constructor(geo = globalThis.navigator?.geolocation) { super(); this.geo = geo ?? null; this.last = null; }
  get supported() { return Boolean(this.geo); }
  get active() { return this.#watchId !== null; }

  /** Call only from an explicit user action. */
  start() {
    if (!this.supported) { this.emit('error', { code: 'unsupported', message: 'This browser does not offer location.' }); return false; }
    if (this.active) return true;
    this.#watchId = this.geo.watchPosition(
      (p) => { this.last = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, ts: p.timestamp }; this.emit('position', this.last); },
      (err) => {
        const messages = { 1: 'Location permission was declined. Everything else still works.', 2: 'Your position could not be determined here. Underground this is expected.', 3: 'Finding your position took too long.' };
        this.emit('error', { code: err.code, message: messages[err.code] ?? 'Location is unavailable.' });
        if (err.code === 1) this.stop();
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 },
    );
    return true;
  }
  stop() {
    if (this.#watchId !== null) this.geo?.clearWatch(this.#watchId);
    this.#watchId = null; this.last = null; this.emit('stopped', {});
  }
}
