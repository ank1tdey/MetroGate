import { h, add } from '../core/dom.js';
import { stationCheck } from '../game/quiz.js';
import { mulberry32, hashString } from '../core/rng.js';

/** The overlay that appears when a station is selected on the map. */
export function createStationFile(app, host) {
  const { net, progress, map, toast } = app;
  let currentId = null; let attempt = 0;

  function close() { currentId = null; host.hidden = true; host.replaceChildren(); map.select(null); app.onStationClosed?.(); }

  function lineRow(s) {
    return s.lines.map((lid) => {
      const l = net.line(lid); const i = net.indexOf(lid, s.id);
      const closed = !net.isActiveOnLine(lid, s.id);
      return h('li', { class: 'file-line', style: { '--c': l.color } },
        h('span', { class: 'file-bar' }),
        h('span', null, h('strong', null, l.name), ` station ${i + 1} of ${l.stations.length}`, closed ? ' (platforms closed)' : ''));
    });
  }

  function checkBlock(s) {
    const box = h('div', { class: 'check' });
    const render = () => {
      box.replaceChildren();
      const q = stationCheck(net, s.id, mulberry32(hashString(`${s.id}:${attempt}:${Date.now() >> 10}`)));
      const fb = h('p', { class: 'check-fb', role: 'status' });
      box.append(h('p', { class: 'check-q' }, q.prompt));
      const row = h('div', { class: 'choices' });
      q.options.forEach((o) => {
        const b = h('button', { type: 'button', class: 'choice' }, o.label);
        b.addEventListener('click', () => {
          if (o.id === q.answerId) {
            row.querySelectorAll('button').forEach((x) => { x.disabled = true; });
            b.classList.add('right'); fb.textContent = q.explain;
            progress.stamp(s.id); map.stampFx(s.id); toast.show(`Passport stamped: ${s.name}`, 'stamp');
            setTimeout(() => show(s.id), 1600);
          } else {
            b.disabled = true; b.classList.add('wrong'); fb.textContent = 'Not that one. Try another option.';
          }
        });
        row.append(b);
      });
      box.append(row, fb);
    };
    render();
    return box;
  }

  function stampGate(s) {
    const gate = h('div', { class: 'check-gate' });
    const btn = h('button', { type: 'button', class: 'btn btn-primary', onClick: () => { gate.replaceChildren(checkBlock(s)); } }, 'Earn the stamp');
    gate.append(btn);
    return gate;
  }

  function show(id) {
    const s = net.station(id); if (!s) return;
    currentId = id; attempt += 1;
    host.hidden = false; host.replaceChildren();
    const ix = net.interchange(id);
    const alias = (s.aliases ?? []).filter((a) => a.toLowerCase() !== s.name.toLowerCase());
    const scouted = progress.isScouted(id); const stamped = progress.isStamped(id);
    const head = h('header', { class: 'file-head' },
      h('div', null, h('h2', { class: 'file-title' }, s.name), alias.length ? h('p', { class: 'file-alias' }, `Also known as ${alias.join(', ')}`) : null),
      h('button', { type: 'button', class: 'btn-quiet', onClick: close, 'aria-label': 'Close station details' }, 'Close'));
    const status = h('p', { class: `file-status ${stamped ? 'is-stamped' : scouted ? 'is-scouted' : ''}` }, stamped ? 'Stamped in your passport' : 'Scouted. Answer one question to earn the stamp.');
    const facts = h('ul', { class: 'file-lines' }, lineRow(s));
    const notes = [];
    if (ix) notes.push(h('p', { class: `file-note ${ix.status !== 'open' ? 'is-warn' : ''}` }, ix.status === 'open' ? `Interchange: ${ix.lines.map((l) => net.line(l).name).join(' and ')}.` : ix.note));
    (s.railConnections ?? []).forEach((r) => notes.push(h('p', { class: 'file-note' }, `Also connects to ${r}.`)));
    const nav = h('div', { class: 'file-nav' });
    for (const lid of s.lines) {
      const { prev, next } = net.neighbours(lid, id);
      [prev, next].filter(Boolean).forEach((nid) => nav.append(h('button', { type: 'button', class: 'chip', style: { '--c': net.line(lid).color }, onClick: () => app.selectStation(nid) }, net.station(nid).name)));
    }
    const actions = h('div', { class: 'file-actions' },
      h('button', { type: 'button', class: 'btn', onClick: () => app.planner.setFrom(id, true) }, 'Start journey here'),
      h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => app.planner.setTo(id, true) }, 'Go to here'));
    add(host, head, status, facts, ...notes, nav.children.length ? h('p', { class: 'file-sub' }, 'Neighbouring stations') : null, nav.children.length ? nav : null, actions, stamped ? null : stampGate(s));
  }

  return { show, close, get currentId() { return currentId; } };
}
