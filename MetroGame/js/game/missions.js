// Missions are data (data/game.json). Progress is *derived* from saved state each time,
// so it can never drift out of sync and nothing is double counted.
export function allMissions(net, game) {
  const lineMissions = net.lines.map((l) => ({
    id: `line-${l.id}`, title: `${l.name} complete`,
    text: `Scout every station on the ${l.name}.`,
    type: 'lineScouted', line: l.id, target: l.stations.length,
    xp: Math.min(120, l.stations.length * 3),
  }));
  return [...game.missions, ...lineMissions];
}

export function measure(mission, state, net) {
  switch (mission.type) {
    case 'plans': return Object.keys(state.plans).length;
    case 'interchangePlans': return Object.values(state.plans).filter((p) => p.interchanges > 0).length;
    case 'scouted': return Object.keys(state.scouted).length;
    case 'stamped': return Object.keys(state.stamped).length;
    case 'hubsScouted': return [...net.interchangeById.keys()].filter((id) => state.scouted[id]).length;
    case 'rides': return Object.keys(state.rides).length;
    case 'trials': return state.trials.count;
    case 'trialStars3': return state.trials.stars3;
    case 'lineRuns': return state.lineRuns.count;
    case 'cleanLineRuns': return state.lineRuns.clean;
    case 'dailyDone': return Object.keys(state.daily.done).length;
    case 'dailyStreak': return state.daily.best;
    case 'lineScouted': return net.line(mission.line).stations.filter((s) => state.scouted[s]).length;
    default: return 0;
  }
}

export function evaluate(net, game, state) {
  return allMissions(net, game).map((m) => {
    const value = Math.min(measure(m, state, net), m.target);
    return { ...m, value, done: value >= m.target };
  });
}
