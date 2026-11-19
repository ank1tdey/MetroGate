import { pick, shuffle } from '../core/rng.js';
import { planRoutes } from '../routing/router.js';

const name = (net, id) => net.station(id).name;
const opts = (list) => { const seen = new Set(); return list.filter((o) => (seen.has(o.id) ? false : seen.add(o.id))); };

function mainComponent(net) {
  return net.components(false).sort((a, b) => b.length - a.length)[0];
}

/** A route trial: the same questions a first-time passenger needs to answer at the platform. */
export function makeRouteTrial(net, rng, { wantChange = true } = {}) {
  const pool = mainComponent(net);
  let chosen = null;
  for (let tries = 0; tries < 60 && !chosen; tries++) {
    const from = pick(rng, pool); const to = pick(rng, pool);
    if (from === to) continue;
    const r = planRoutes(net, from, to, { limit: 1 });
    if (!r.ok) continue;
    const route = r.routes[0];
    if (route.stops < 4) continue;
    if (wantChange && route.interchanges === 0 && tries < 40) continue;
    chosen = route;
  }
  if (!chosen) throw new Error('Could not build a trial from this network');
  return { from: chosen.from, to: chosen.to, route: chosen, questions: routeQuestions(net, chosen, rng) };
}

function routeQuestions(net, route, rng) {
  const qs = [];
  const first = route.legs[0];
  const lineOpts = (inc) => shuffle(rng, opts([...inc, ...net.lines.map((l) => l.id)].slice(0, 12).map((id) => ({ id, label: net.line(id).name })))).slice(0, 4);

  const here = net.linesAt(route.from, false);
  const boardOptions = shuffle(rng, opts([...here, ...shuffle(rng, net.lines.map((l) => l.id).filter((l) => !here.includes(l)))].slice(0, 4).map((id) => ({ id, label: net.line(id).name }))));
  qs.push({ id: 'board', prompt: `You are at ${name(net, route.from)} and heading to ${name(net, route.to)}. Which line do you board first?`,
    options: boardOptions.length >= 2 ? boardOptions : lineOpts([first.lineId]), answerId: first.lineId,
    explain: `Board the ${net.line(first.lineId).name} at ${name(net, route.from)}.` });

  const ends = net.endsOf(first.lineId, false);
  const otherEnds = shuffle(rng, net.lines.filter((l) => l.id !== first.lineId).map((l) => net.endsOf(l.id, false).last));
  qs.push({ id: 'direction', prompt: `Which destination should the train show on its display?`,
    options: shuffle(rng, opts([ends.first, ends.last, ...otherEnds.slice(0, 2)].map((id) => ({ id, label: name(net, id) })))),
    answerId: first.towardId, explain: `Trains going your way on the ${net.line(first.lineId).name} head towards ${name(net, first.towardId)}.` });

  route.changes.slice(0, 2).forEach((c, i) => {
    const leg = route.legs[i];
    const others = shuffle(rng, leg.stations.filter((s) => s !== c.stationId && s !== leg.stations[0])).slice(0, 3);
    const fill = shuffle(rng, net.stations.map((s) => s.id).filter((s) => s !== c.stationId && !others.includes(s))).slice(0, 3 - others.length);
    qs.push({ id: `change-${i}`, prompt: `Where do you change from the ${net.line(c.fromLine).name} to the ${net.line(c.toLine).name}?`,
      options: shuffle(rng, opts([c.stationId, ...others, ...fill].map((id) => ({ id, label: name(net, id) })))), answerId: c.stationId,
      explain: `Change at ${name(net, c.stationId)}, where the two lines meet.` });
  });

  const total = route.stops;
  const spread = new Set([total]);
  for (const d of shuffle(rng, [-3, -2, -1, 1, 2, 3])) { if (spread.size >= 4) break; if (total + d > 0) spread.add(total + d); }
  qs.push({ id: 'count', prompt: `How many stops is the whole ride? Count every station after ${name(net, route.from)}, including ${name(net, route.to)}, and do not count the change itself.`,
    options: shuffle(rng, [...spread].map((n) => ({ id: String(n), label: String(n) }))), answerId: String(total),
    explain: `${total} stops in total.` });
  return qs;
}

export function starsFor(mistakes) { return mistakes === 0 ? 3 : mistakes <= 1 ? 2 : 1; }

/** Tap stations in order. Segment length adapts to short lines. */
export function makeLineRun(net, rng) {
  const lines = net.lines.filter((l) => {
    const e = net.endsOf(l.id, false);
    return net.indexOf(l.id, e.last) - net.indexOf(l.id, e.first) + 1 >= 5;
  });
  const line = pick(rng, lines);
  const ends = net.endsOf(line.id, false);
  const lo = net.indexOf(line.id, ends.first); const hi = net.indexOf(line.id, ends.last);
  const size = Math.min(6, hi - lo + 1);
  const start = lo + Math.floor(rng() * (hi - lo + 2 - size));
  let ids = line.stations.slice(start, start + size);
  const forward = rng() > 0.5;
  if (!forward) ids = [...ids].reverse();
  let shuffled = shuffle(rng, ids);
  if (shuffled.join() === ids.join()) shuffled = [...shuffled].reverse();
  return { lineId: line.id, ids, shuffled, startId: ids[0], towardId: forward ? ends.last : ends.first };
}
