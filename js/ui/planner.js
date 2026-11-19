import { h, add } from '../core/dom.js';
import { planRoutes } from '../routing/router.js';
import { buildSteps } from '../routing/itinerary.js';
import { createStationPicker } from './combobox.js';
import { JourneyTracker } from '../location/journeyTracker.js';
import { LocationService, interpretPosition } from '../location/locationService.js';

const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

export function createPlanner(app, host) {
  const { net, progress, map, toast } = app;
  const st = { from: null, to: null, include: false, result: null, sel: 0, tracker: null, location: null };
  const from = createStationPicker({ net, label: 'From', onFocus: () => app.sheetFor('input'), onChange: (id) => { st.from = id; } });
  const to = createStationPicker({ net, label: 'To', onFocus: () => app.sheetFor('input'), onChange: (id) => { st.to = id; } });
  const pickBtn = (which) => h('button', { type: 'button', class: 'btn-text', onClick: () => app.startPick(which) }, 'Choose on map');
  const swap = h('button', { type: 'button', class: 'btn-text', onClick: () => { const a = st.from; const b = st.to; from.set(b); to.set(a); } }, 'Swap');
  const incl = h('input', { type: 'checkbox', id: 'incl-susp', onChange: (e) => { st.include = e.target.checked; if (st.from && st.to) plan(); } });
  const live = h('p', { class: 'status-line', role: 'status' });
  const results = h('div', { class: 'results' });
  const trackHost = h('div', { class: 'track-host' });
  const closures = net.lines.flatMap((l) => (l.sections ?? []).filter((s) => s.status === 'suspended').map((s) => ({ line: l, ...s })));

  const form = h('form', { class: 'plan-form', novalidate: true, onSubmit: (e) => { e.preventDefault(); plan(); } },
    h('div', { class: 'pick-row' }, from.el, pickBtn('from')),
    h('div', { class: 'swap-row' }, swap),
    h('div', { class: 'pick-row' }, to.el, pickBtn('to')),
    h('div', { class: 'toggle' }, incl, h('label', { for: 'incl-susp' }, 'Also show routes that use suspended sections')),
    h('button', { type: 'submit', class: 'btn btn-primary' }, 'Find routes'));

  const status = h('details', { class: 'net-status' }, h('summary', null, 'Network status'),
    closures.length ? h('ul', null, closures.map((c) => h('li', null, h('strong', null, `${c.line.name}: `), c.note))) : h('p', null, 'No suspended sections are listed in this dataset.'),
    h('p', { class: 'fine' }, `Data checked ${net.meta.asOf}. ${net.meta.caveats[0]}`));

  host.append(
    h('h2', { class: 'pane-title' }, 'Plan a journey'),
    h('p', { class: 'lede' }, 'Pick any two stations. Names people actually use work too, such as Tollygunge, Dharmatala or Airport.'),
    form, live, trackHost, results, status);

  function setFrom(id, focusTab) { from.set(id); if (focusTab) app.showTab('plan'); if (st.to) plan(); }
  function setTo(id, focusTab) { to.set(id); if (focusTab) app.showTab('plan'); if (st.from) plan(); }

  function plan({ silent = false } = {}) {
    const okA = from.validate(); const okB = to.validate();
    if (!okA || !okB) { live.textContent = 'Choose both stations to continue.'; return; }
    stopAll();
    const res = planRoutes(net, st.from, st.to, { includeSuspended: st.include, limit: 3 });
    st.result = res; st.sel = 0; results.replaceChildren();
    const a = net.station(st.from).name; const b = net.station(st.to).name;
    if (!res.ok) { renderFailure(res, a, b); map.clearRoute(); return; }
    live.textContent = `${plural(res.routes.length, 'route', 'routes')} from ${a} to ${b}.`;
    res.routes.forEach((r, i) => results.append(ticket(r, i)));
    select(0);
    history.replaceState(null, '', `#plan?from=${st.from}&to=${st.to}`);
    if (!silent) {
      const r = progress.recordPlan(res.routes[0]);
      app.sheetFor('route');
      requestAnimationFrame(() => results.scrollIntoView({ block: 'start', behavior: 'smooth' }));
      if (r.xp) toast.show(`+${r.xp} XP Journey planned`, 'xp');
    }
  }

  function renderFailure(res, a, b) {
    const msg = { same: 'Your start and destination are the same station.', unknown: 'One of those stations is not in the network data.', unreachable: `There is no way to ride from ${a} to ${b} on today's network.` }[res.reason];
    live.textContent = msg;
    if (res.reason !== 'unreachable') return;
    const box = h('div', { class: 'notice' }, h('p', null, 'The two stations are on parts of the network that are not connected right now.'));
    if (res.hint) {
      const c = res.hint.changes.find((x) => x.suspended);
      box.append(h('p', null, c ? `They would connect at ${net.station(c.stationId).name}, but that link is suspended.` : 'They would connect if a suspended section reopens.'),
        h('button', { type: 'button', class: 'btn', onClick: () => { incl.checked = true; st.include = true; plan(); } }, 'Show it anyway, as a network guide'));
    } else {
      box.append(h('p', null, 'No planned connection exists in this dataset, so this is not a missing setting. Check official sources for any bus or rail option between them.'));
    }
    results.append(box);
  }

  function ticket(route, i) {
    const steps = buildSteps(net, route);
    const el = h('article', { class: 'ticket', 'data-i': i });
    const head = h('header', { class: 'ticket-head' },
      h('h3', null, `${plural(route.stops, 'stop', 'stops')}, ${route.interchanges ? plural(route.interchanges, 'change', 'changes') : 'no changes'}`),
      route.tags?.length ? h('p', { class: 'tags' }, route.tags.join(', ')) : null);
    const legs = h('ol', { class: 'legs' });
    route.legs.forEach((leg, k) => {
      const line = net.line(leg.lineId);
      legs.append(h('li', { class: 'leg', style: { '--c': line.color } }, h('span', { class: 'leg-bar' }),
        h('div', null, h('strong', null, `${line.name} towards ${net.station(leg.towardId).name}`), h('span', { class: 'leg-sub' }, `${net.station(leg.stations[0]).name} to ${net.station(leg.stations.at(-1)).name}, ${plural(leg.stops, 'stop', 'stops')}`))));
      if (route.changes[k]) legs.append(h('li', { class: 'change-note' }, `Change at ${net.station(route.changes[k].stationId).name}`));
    });
    if (route.usesSuspended) el.classList.add('has-warning');
    const warn = route.usesSuspended ? h('p', { class: 'warn' }, 'This route uses a suspended section. Trains do not run on it today.') : null;
    const stepList = h('ol', { class: 'steps', hidden: true }, steps.map((s) => h('li', { class: `step step-${s.kind}`, style: { '--c': net.line(s.lineId).color } }, h('strong', null, s.title), h('span', null, s.detail), s.via?.length ? h('span', { class: 'via' }, `Passing: ${s.via.join(', ')}`) : null)));
    const rideStatus = h('p', { class: 'ride-status', role: 'status' });
    const stepBtn = h('button', { type: 'button', class: 'btn btn-ghost', 'aria-expanded': 'false', onClick: () => { stepList.hidden = !stepList.hidden; stepBtn.setAttribute('aria-expanded', String(!stepList.hidden)); stepBtn.textContent = stepList.hidden ? 'Show steps' : 'Hide steps'; } }, 'Show steps');
    const rideBtn = h('button', { type: 'button', class: 'btn', onClick: () => toggleRide(route, rideBtn, rideStatus) }, 'Preview ride');
    const trackBtn = h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => startTracking(route) }, 'Track my ride');
    const showBtn = h('button', { type: 'button', class: 'btn-text', onClick: () => select(i) }, 'Show on map');
    const copy = h('button', { type: 'button', class: 'btn-text', onClick: () => { navigator.clipboard?.writeText(location.href).then(() => toast.show('Link copied')).catch(() => toast.show('Copy the address bar to share this route')); } }, 'Copy link');
    add(el, head, legs, warn, h('div', { class: 'ticket-actions' }, stepBtn, rideBtn, trackBtn), h('div', { class: 'ticket-links' }, showBtn, copy), rideStatus, stepList);
    return el;
  }

  function select(i) {
    st.sel = i;
    results.querySelectorAll('.ticket').forEach((t, k) => t.classList.toggle('selected', k === i));
    map.showRoute(st.result.routes[i]);
    app.planner.current = st.result.routes[i];
  }

  function stopAll() { map.stopTrain(); map.setMarker(null); st.tracker = null; trackHost.replaceChildren(); st.location?.stop(); st.location = null; results.querySelectorAll('.ride-status').forEach((p) => { p.textContent = ''; }); results.querySelectorAll('.btn').forEach((b) => { if (b.dataset.riding) { b.textContent = 'Preview ride'; delete b.dataset.riding; } }); }

  function toggleRide(route, btn, out) {
    if (btn.dataset.riding) { map.stopTrain(); btn.textContent = 'Preview ride'; delete btn.dataset.riding; out.textContent = ''; return; }
    select(st.result.routes.indexOf(route));
    btn.textContent = 'Stop preview'; btn.dataset.riding = '1';
    map.playTrain(route, {
      onStation: (i, id) => { out.textContent = i === 0 ? `Departing ${net.station(id).name}` : `Now at ${net.station(id).name}`; if (progress.scout(id)) { /* discovery fx handled by event */ } },
      onDone: () => { const r = progress.recordRide(route); out.textContent = `Arrived at ${net.station(route.to).name}.`; btn.textContent = 'Preview ride'; delete btn.dataset.riding; if (r.xp) toast.show(`+${r.xp} XP Ride completed`, 'xp'); },
    });
  }

  // ----- tracking -----
  function startTracking(route) {
    stopAll(); select(st.result.routes.indexOf(route));
    const tr = new JourneyTracker(net, route); st.tracker = tr;
    const body = h('section', { class: 'tracker' });
    trackHost.replaceChildren(body);
    const render = () => {
      body.replaceChildren();
      const s = tr.status(); const cur = net.station(tr.currentId);
      map.setMarker(tr.currentId, `You are at ${cur.name}`);
      const line = net.line(s.leg.lineId);
      let msg;
      if (s.action === 'arrived') msg = `You have arrived at ${cur.name}.`;
      else if (s.action === 'change') msg = `Change here to the ${net.line(s.change.toLine).name}. Follow the interchange signs.`;
      else msg = `Stay on the ${line.name} towards ${net.station(s.leg.towardId).name}. ${plural(s.stopsLeft, 'stop', 'stops')} to ${net.station(s.leg.stations.at(-1)).name}.`;
      add(body, h('h3', null, 'Tracking your ride'), h('p', { class: 'track-now' }, `Now at ${cur.name}`), h('p', { class: 'track-msg', role: 'status' }, msg),
        tr.nextId ? h('p', { class: 'track-next' }, `Next station: ${net.station(tr.nextId).name}`) : null);
      const row = h('div', { class: 'ticket-actions' });
      if (tr.nextId) row.append(h('button', { type: 'button', class: 'btn btn-primary', onClick: () => tr.advance() }, `I am at ${net.station(tr.nextId).name}`));
      row.append(h('button', { type: 'button', class: 'btn btn-ghost', onClick: stopAll }, 'Stop tracking'));
      add(body, row);
      const sel = h('select', { class: 'field-input', 'aria-label': 'Correct my position', onChange: (e) => { tr.checkIn(e.target.value); } }, h('option', { value: '' }, 'Missed a tap? Pick where you are'), tr.path.map((id) => h('option', { value: id }, net.station(id).name)));
      add(body, sel, locationBlock());
    };
    tr.on('move', ({ stationId }) => { progress.scout(stationId); render(); });
    tr.on('done', () => { const r = progress.recordRide(route); if (r.xp) toast.show(`+${r.xp} XP Journey finished`, 'xp'); });
    render();
  }

  function locationBlock() {
    const box = h('div', { class: 'loc' });
    const out = h('p', { class: 'loc-out', role: 'status' });
    const svc = st.location ?? (st.location = new LocationService());
    const note = h('p', { class: 'fine' }, 'Optional. Your phone\'s GPS usually cannot see underground platforms and can be off by hundreds of metres even above ground, so treat it as a hint. Your position stays on this device and is not saved.');
    const btn = h('button', { type: 'button', class: 'btn btn-ghost' }, svc.active ? 'Turn location off' : 'Use my location');
    btn.addEventListener('click', () => {
      if (svc.active) { svc.stop(); btn.textContent = 'Use my location'; out.textContent = ''; return; }
      svc.on('position', (pos) => {
        const hint = interpretPosition(net, pos, st.tracker.route, st.tracker.index);
        out.replaceChildren(hint.note, ' ');
        if (hint.nearest && st.tracker.path.includes(hint.nearest.id)) out.append(h('button', { type: 'button', class: 'btn-text', onClick: () => st.tracker.checkIn(hint.nearest.id) }, `Yes, I am at ${hint.nearest.name}`));
      });
      svc.on('error', (e) => { out.textContent = e.message; btn.textContent = 'Use my location'; });
      if (svc.start()) { btn.textContent = 'Turn location off'; out.textContent = 'Waiting for a position. You will be asked for permission now.'; }
    });
    box.append(h('h4', null, 'Location (optional)'), note, btn, out);
    return box;
  }

  return { setFrom, setTo, plan, from, to, current: null, stop: stopAll, get state() { return st; } };
}
