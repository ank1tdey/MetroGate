import { pick, shuffle } from '../core/rng.js';

const label = (net, id) => net.station(id).name;
const uniqueOptions = (opts) => { const seen = new Set(); return opts.filter((o) => (seen.has(o.id) ? false : seen.add(o.id))); };

/** One station check for the passport: built from the data, so it is always consistent with the map. */
export function stationCheck(net, stationId, rng) {
  const s = net.station(stationId);
  const types = ['line'];
  if (net.isInterchange(stationId)) types.push('hub', 'hub');
  const hasNext = s.lines.some((l) => net.neighbours(l, stationId).next || net.neighbours(l, stationId).prev);
  if (hasNext) types.push('next', 'next');
  const type = pick(rng, types);

  if (type === 'hub') {
    const ix = net.interchange(stationId);
    const [a, b] = ix.lines.map((l) => net.line(l).name);
    const hubs = [...net.interchangeById.keys()];
    const regular = net.stations.filter((x) => !net.isInterchange(x.id) && x.lines.every((l) => !ix.lines.includes(l) || true));
    const options = uniqueOptions([...hubs, ...shuffle(rng, regular).slice(0, 2).map((x) => x.id)].map((id) => ({ id, label: label(net, id) })));
    return { type, prompt: `Which station lets you change between the ${a} and the ${b}?`, options: shuffle(rng, options), answerId: stationId,
      explain: `${s.name} is where the ${a} and ${b} meet.` };
  }

  if (type === 'next') {
    const lineId = pick(rng, s.lines.filter((l) => net.neighbours(l, stationId).next || net.neighbours(l, stationId).prev));
    const line = net.line(lineId);
    const { prev, next } = net.neighbours(lineId, stationId);
    const forward = next && (!prev || rng() > 0.5);
    const target = forward ? next : prev;
    const endId = forward ? line.stations.at(-1) : line.stations[0];
    const others = shuffle(rng, line.stations.filter((x) => x !== stationId && x !== target)).slice(0, 3);
    const options = uniqueOptions([target, ...others].map((id) => ({ id, label: label(net, id) })));
    return { type, prompt: `On the ${line.name}, which station is next after ${s.name} when heading towards ${label(net, endId)}?`,
      options: shuffle(rng, options), answerId: target, explain: `${label(net, target)} comes right after ${s.name} on the ${line.name}.` };
  }

  const serving = s.lines;
  const answer = pick(rng, serving);
  const distractors = shuffle(rng, net.lines.filter((l) => !serving.includes(l.id)).map((l) => l.id)).slice(0, 3);
  const options = [answer, ...distractors].map((id) => ({ id, label: net.line(id).name }));
  return { type: 'line', prompt: serving.length > 1 ? `Which of these lines stops at ${s.name}?` : `Which line serves ${s.name}?`,
    options: shuffle(rng, options), answerId: answer,
    explain: serving.length > 1 ? `${s.name} is served by ${serving.map((l) => net.line(l).name).join(' and ')}.` : `${s.name} is on the ${net.line(answer).name}.` };
}
