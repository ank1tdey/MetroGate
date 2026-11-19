// Turns a route into plain-language steps. No platform numbers or timings are invented:
// the dataset has none, so each step points the rider at the "towards" sign instead.
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function buildSteps(net, route) {
  const name = (id) => net.station(id).name;
  const steps = [];
  const first = route.legs[0];
  steps.push({
    kind: 'start', lineId: first.lineId, stationId: route.from,
    title: `Start at ${name(route.from)}`,
    detail: `Follow signs for the ${net.line(first.lineId).name}.`,
  });
  route.legs.forEach((leg, i) => {
    const line = net.line(leg.lineId);
    const mid = leg.stations.slice(1, -1).map(name);
    steps.push({
      kind: 'ride', lineId: leg.lineId, stationId: leg.stations[0], stations: leg.stations,
      title: `Take the ${line.name} towards ${name(leg.towardId)}`,
      detail: `Ride ${plural(leg.stops, 'stop', 'stops')} to ${name(leg.stations.at(-1))}. Platform numbers are not in this dataset, so check the sign for trains towards ${name(leg.towardId)}.`,
      via: mid,
    });
    if (leg.usesSuspended) {
      steps.push({ kind: 'warning', lineId: leg.lineId, title: 'Part of this leg is currently suspended', detail: 'This route is shown to explain the network. Trains do not run on the suspended section today.' });
    }
    const change = route.changes[i];
    if (change) {
      const next = net.line(change.toLine);
      steps.push({
        kind: change.suspended ? 'warning' : 'change', lineId: change.toLine, stationId: change.stationId,
        title: `Change at ${name(change.stationId)} to the ${next.name}`,
        detail: change.suspended
          ? (net.interchange(change.stationId)?.note ?? 'This interchange is currently unavailable.')
          : 'Leave the train and follow the interchange signs. Walking time and platform are not in this dataset.',
      });
    }
  });
  steps.push({ kind: 'arrive', lineId: route.legs.at(-1).lineId, stationId: route.to, title: `Get off at ${name(route.to)}`, detail: 'Follow the exit signs.' });
  return steps;
}

export function describeRoute(net, route) {
  const lines = route.legs.map((l) => net.line(l.lineId).name).join(', then ');
  return `${plural(route.stops, 'stop', 'stops')}, ${route.interchanges === 0 ? 'no changes' : plural(route.interchanges, 'change', 'changes')}. ${lines}.`;
}
