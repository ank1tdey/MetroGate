import { h } from '../core/dom.js';

export function createPassport(app, host) {
  const { net, progress } = app;
  function corridor(l) {
    const e = net.endsOf(l.id, false); const nm = (id) => net.station(id).name;
    const base = `${nm(l.stations[0])} to ${nm(l.stations.at(-1))}, ${l.stations.length} stations`;
    return e.first === l.stations[0] && e.last === l.stations.at(-1) ? base : `${base}. Trains currently run ${nm(e.first)} to ${nm(e.last)}.`;
  }
  function nextTarget() {
    let best = null;
    for (const l of net.lines) {
      const p = progress.lineProgress(l.id);
      if (p.scouted === p.total) continue;
      const lastIdx = Math.max(-1, ...l.stations.map((s, i) => (progress.isScouted(s) ? i : -1)));
      const cand = l.stations.find((s, i) => i > lastIdx && !progress.isScouted(s)) ?? l.stations.find((s) => !progress.isScouted(s));
      const ratio = p.scouted / p.total;
      if (!best || ratio > best.ratio) best = { id: cand, line: l, ratio };
    }
    return best;
  }
  function render() {
    const r = progress.rank(); const s = progress.state;
    const total = net.stations.length;
    host.replaceChildren(
      h('h2', { class: 'pane-title' }, 'Passport'),
      h('section', { class: 'rank-block' },
        h('p', { class: 'rank-level' }, `Level ${r.level}`), h('p', { class: 'rank-title' }, r.title),
        h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(r.ratio * 100), 'aria-label': 'Progress to next rank' }, h('i', { style: { width: `${Math.round(r.ratio * 100)}%` } })),
        h('p', { class: 'fine' }, r.nextTitle ? `${r.span - r.into} XP to ${r.nextTitle}` : 'Top rank reached.')),
      h('dl', { class: 'stats' },
        h('div', null, h('dt', null, 'Scouted'), h('dd', null, `${Object.keys(s.scouted).length} of ${total}`)),
        h('div', null, h('dt', null, 'Stamped'), h('dd', null, `${Object.keys(s.stamped).length} of ${total}`)),
        h('div', null, h('dt', null, 'Routes planned'), h('dd', null, String(Object.keys(s.plans).length))),
        h('div', null, h('dt', null, 'Daily streak'), h('dd', null, String(s.daily.streak)))),
      (() => { const t = nextTarget(); return t ? h('div', { class: 'next-target' }, h('p', null, h('strong', null, 'Next target: '), `${net.station(t.id).name} on the ${t.line.name}.`), h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => app.selectStation(t.id) }, 'Show on map')) : h('p', { class: 'next-target' }, 'Every station is scouted. Stamp the rest to finish your passport.'); })(),
      ...net.lines.map((l) => {
        const p = progress.lineProgress(l.id);
        return h('section', { class: 'chapter', style: { '--c': l.color, '--ink': l.ink } },
          h('header', null, h('h3', null, l.name), h('p', null, `${p.scouted} of ${p.total} scouted, ${p.stamped} stamped`), p.scouted === p.total ? h('span', { class: 'complete' }, 'Line complete') : null),
          h('p', { class: 'corridor' }, corridor(l)),
          h('button', { type: 'button', class: 'btn-text', onClick: () => { app.map.lineFocus = null; app.map.focusLine(l.id); app.sheetFor('station'); } }, 'Show line on map'),
          h('ul', { class: 'chips' }, l.stations.map((sid) => h('li', null, h('button', { type: 'button', class: `chip ${progress.isStamped(sid) ? 'stamped' : progress.isScouted(sid) ? 'scouted' : ''}`, onClick: () => app.selectStation(sid) }, net.station(sid).name)))));
      }),
      h('p', { class: 'fine' }, progress.persistent ? 'Progress is saved in this browser only.' : 'Your browser is blocking storage, so progress will reset when you close this page.'),
      h('button', { type: 'button', class: 'btn-text danger', onClick: () => { if (confirm('Reset all progress on this device?')) progress.reset(); } }, 'Reset progress'));
  }
  return { render };
}

export function createMissions(app, host) {
  const { progress } = app;
  function render() {
    const list = progress.missions().sort((a, b) => Number(a.done) - Number(b.done) || b.value / b.target - a.value / a.target);
    const done = list.filter((m) => m.done).length;
    host.replaceChildren(
      h('h2', { class: 'pane-title' }, 'Missions'),
      h('p', { class: 'lede' }, `${done} of ${list.length} complete. Each one teaches something you will use on a real journey.`),
      h('ul', { class: 'missions' }, list.map((m) => h('li', { class: `mission ${m.done ? 'done' : ''}` },
        h('div', { class: 'mission-main' }, h('h3', null, m.title), h('p', null, m.text),
          h('div', { class: 'bar thin', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': m.target, 'aria-valuenow': m.value, 'aria-label': `${m.title} progress` }, h('i', { style: { width: `${Math.round((m.value / m.target) * 100)}%` } }))),
        h('div', { class: 'mission-side' }, h('strong', null, m.done ? 'Done' : `${m.value}/${m.target}`), h('span', null, `${m.xp} XP`))))));
  }
  return { render };
}
