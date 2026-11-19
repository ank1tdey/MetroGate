// Journey planner. Pure functions: give it a Network, get routes back. No DOM, no globals.
// Graph nodes are "station@line" pairs, so riding a line and changing lines are different edge types.

export const COSTS = Object.freeze({ ride: 1, transfer: 4 });
const SRC = '#source';
const SNK = '#sink';
const nodeKey = (stationId, lineId) => `${stationId}@${lineId}`;
const splitKey = (key) => { const [s, l] = key.split('@'); return { stationId: s, lineId: l }; };

function buildGraph(net, includeSuspended) {
  const adj = new Map();
  const add = (a, b, cost, kind) => {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push({ to: b, cost, kind });
    adj.get(b).push({ to: a, cost, kind });
  };
  for (const line of net.lines) {
    line.stations.forEach((sid, i) => {
      adj.set(nodeKey(sid, line.id), adj.get(nodeKey(sid, line.id)) || []);
      if (i === 0) return;
      if (!includeSuspended && net.segmentSuspended(line.id, i - 1)) return;
      add(nodeKey(line.stations[i - 1], line.id), nodeKey(sid, line.id), COSTS.ride, 'ride');
    });
  }
  for (const ix of net.interchangeById.values()) {
    if (!includeSuspended && ix.status !== 'open') continue;
    for (let a = 0; a < ix.lines.length; a++) {
      for (let b = a + 1; b < ix.lines.length; b++) {
        add(nodeKey(ix.station, ix.lines[a]), nodeKey(ix.station, ix.lines[b]), COSTS.transfer, 'transfer');
      }
    }
  }
  return adj;
}

function dijkstra(adj, from, to, blockedNodes = new Set(), blockedEdges = new Set()) {
  const dist = new Map([[from, 0]]);
  const prev = new Map();
  const done = new Set();
  for (;;) {
    let u = null; let best = Infinity;
    for (const [k, d] of dist) if (!done.has(k) && d < best) { best = d; u = k; }
    if (u === null) return null;
    if (u === to) break;
    done.add(u);
    for (const e of adj.get(u) ?? []) {
      if (blockedNodes.has(e.to) || blockedEdges.has(`${u}>${e.to}`) || done.has(e.to)) continue;
      const nd = best + e.cost;
      if (nd < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, nd); prev.set(e.to, u); }
    }
  }
  const nodes = [to];
  while (nodes[0] !== from) nodes.unshift(prev.get(nodes[0]));
  return { nodes, cost: dist.get(to) };
}

function pathCost(adj, nodes) {
  let total = 0;
  for (let i = 0; i < nodes.length - 1; i++) {
    total += Math.min(...adj.get(nodes[i]).filter((e) => e.to === nodes[i + 1]).map((e) => e.cost));
  }
  return total;
}

/** Yen's algorithm: the k cheapest loopless paths. */
function kShortest(adj, from, to, k) {
  const first = dijkstra(adj, from, to);
  if (!first) return [];
  const found = [first];
  const candidates = [];
  for (let n = 1; n < k; n++) {
    const last = found[n - 1].nodes;
    for (let i = 0; i < last.length - 1; i++) {
      const spur = last[i];
      const root = last.slice(0, i + 1);
      const blockedEdges = new Set();
      for (const p of found) {
        if (root.every((node, idx) => p.nodes[idx] === node)) blockedEdges.add(`${p.nodes[i]}>${p.nodes[i + 1]}`);
      }
      const blockedNodes = new Set(root.slice(0, -1));
      const tail = dijkstra(adj, spur, to, blockedNodes, blockedEdges);
      if (!tail) continue;
      const nodes = [...root.slice(0, -1), ...tail.nodes];
      const key = nodes.join('|');
      if (!found.some((p) => p.nodes.join('|') === key) && !candidates.some((p) => p.nodes.join('|') === key)) {
        candidates.push({ nodes, cost: pathCost(adj, nodes) });
      }
    }
    if (!candidates.length) break;
    candidates.sort((a, b) => a.cost - b.cost);
    found.push(candidates.shift());
  }
  return found;
}

function toRoute(net, nodes, includeSuspended) {
  const legs = [];
  let leg = null;
  for (let i = 0; i < nodes.length; i++) {
    const { stationId, lineId } = splitKey(nodes[i]);
    if (!leg || leg.lineId !== lineId) {
      if (leg) legs.push(leg);
      leg = { lineId, stations: [stationId] };
    } else {
      leg.stations.push(stationId);
    }
  }
  legs.push(leg);
  const finished = legs.filter((l) => l.stations.length > 1 || legs.length === 1).map((l) => {
    const a = net.indexOf(l.lineId, l.stations[0]);
    const b = net.indexOf(l.lineId, l.stations.at(-1));
    const dir = b > a ? 1 : -1;
    const [lo, hi] = net.runAround(l.lineId, a, includeSuspended);
    const line = net.line(l.lineId);
    let usesSuspended = false;
    for (let i = Math.min(a, b); i < Math.max(a, b); i++) if (net.segmentSuspended(l.lineId, i)) usesSuspended = true;
    return {
      ...l,
      stops: l.stations.length - 1,
      direction: dir,
      towardId: line.stations[dir === 1 ? hi : lo],
      usesSuspended,
    };
  });
  const stationPath = finished.flatMap((l, i) => (i ? l.stations.slice(1) : l.stations));
  const changes = [];
  for (let i = 1; i < finished.length; i++) {
    const at = finished[i].stations[0];
    changes.push({ stationId: at, fromLine: finished[i - 1].lineId, toLine: finished[i].lineId, suspended: net.interchange(at)?.status !== 'open' });
  }
  return {
    legs: finished,
    changes,
    stationPath,
    from: stationPath[0],
    to: stationPath.at(-1),
    stops: finished.reduce((n, l) => n + l.stops, 0),
    interchanges: changes.length,
    usesSuspended: finished.some((l) => l.usesSuspended) || changes.some((c) => c.suspended),
    key: finished.map((l) => `${l.lineId}:${l.stations[0]}>${l.stations.at(-1)}`).join('|'),
  };
}

/**
 * @returns {{ok:boolean, routes:object[], reason?:string, hint?:object}}
 */
export function planRoutes(net, fromId, toId, { includeSuspended = false, limit = 3 } = {}) {
  if (!net.hasStation(fromId) || !net.hasStation(toId)) return { ok: false, routes: [], reason: 'unknown' };
  if (fromId === toId) return { ok: false, routes: [], reason: 'same' };

  const search = (flag) => {
    const adj = buildGraph(net, flag);
    for (const line of net.lines) {
      for (const sid of line.stations) {
        const k = nodeKey(sid, line.id);
        if (sid === fromId) { adj.set(SRC, [...(adj.get(SRC) ?? []), { to: k, cost: 0, kind: 'virtual' }]); }
        if (sid === toId) { adj.get(k).push({ to: SNK, cost: 0, kind: 'virtual' }); }
      }
    }
    adj.set(SNK, adj.get(SNK) ?? []);
    adj.get(SRC) ?? adj.set(SRC, []);
    const paths = kShortest(adj, SRC, SNK, Math.max(limit * 3, 6));
    const routes = [];
    const seen = new Set();
    for (const p of paths) {
      const r = toRoute(net, p.nodes.slice(1, -1), flag);
      if (new Set(r.stationPath).size !== r.stationPath.length) continue; // revisits a station: not a sensible alternative
      if (seen.has(r.key)) continue;
      seen.add(r.key);
      routes.push(r);
    }
    return routes.slice(0, limit);
  };

  const routes = search(includeSuspended);
  if (routes.length) {
    tagRoutes(routes);
    return { ok: true, routes };
  }
  const hint = includeSuspended ? [] : search(true);
  return { ok: false, routes: [], reason: 'unreachable', hint: hint[0] ?? null };
}

function tagRoutes(routes) {
  if (routes.length === 1) { routes[0].tags = ['Only route on the network']; return; }
  const minStops = Math.min(...routes.map((r) => r.stops));
  const minChanges = Math.min(...routes.map((r) => r.interchanges));
  routes.forEach((r) => {
    r.tags = [];
    if (r.interchanges === minChanges) r.tags.push('Fewest changes');
    if (r.stops === minStops) r.tags.push('Fewest stops');
  });
}
