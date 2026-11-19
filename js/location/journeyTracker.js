import { Emitter } from '../core/events.js';

/**
 * Follows a rider along a planned route. It is driven by the rider tapping "I'm at the next station"
 * today, and can accept location hints later without changing the interface.
 */
export class JourneyTracker extends Emitter {
  constructor(net, route) {
    super();
    this.net = net; this.route = route; this.index = 0; this.finished = false;
  }
  get path() { return this.route.stationPath; }
  get currentId() { return this.path[this.index]; }
  get nextId() { return this.path[this.index + 1] ?? null; }

  /** Where the rider is in the leg structure, and what to do next. */
  status() {
    const { legs, changes } = this.route;
    let seen = 0; let legIndex = 0;
    for (let i = 0; i < legs.length; i++) {
      const last = seen + legs[i].stops;
      if (this.index <= last) { legIndex = i; break; }
      seen = last;
    }
    const leg = legs[legIndex];
    const posInLeg = this.index - seen;
    const stopsLeft = leg.stops - posInLeg;
    let action = 'ride';
    if (this.index === this.path.length - 1) action = 'arrived';
    else if (stopsLeft === 0 && changes[legIndex]) action = 'change';
    return { legIndex, leg, stopsLeft, action, change: stopsLeft === 0 ? changes[legIndex] : null };
  }

  /** Rider confirms the next station. Returns false if there is nowhere to go. */
  advance() {
    if (this.finished || this.index >= this.path.length - 1) return false;
    this.index += 1;
    this.#after();
    return true;
  }
  /** Rider says they are at a specific station of the route (correcting a missed tap). */
  checkIn(stationId) {
    const i = this.path.indexOf(stationId);
    if (i < 0 || this.finished) return false;
    this.index = i;
    this.#after();
    return true;
  }
  #after() {
    this.emit('move', { index: this.index, stationId: this.currentId });
    if (this.index === this.path.length - 1) { this.finished = true; this.emit('done', {}); }
  }
}
