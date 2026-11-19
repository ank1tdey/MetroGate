import { loadAll } from './data/loader.js';
import { h, $ } from './core/dom.js';
import { parseHashParams } from './core/sanitize.js';
import { Progress } from './game/progress.js';
import { MapView } from './map/mapView.js';
import { createToaster } from './ui/toast.js';
import { createPlanner } from './ui/planner.js';
import { createStationFile } from './ui/stationFile.js';
import { createPassport, createMissions } from './ui/passport.js';
import { createPlay } from './ui/play.js';
import { createAbout } from './ui/about.js';

const TABS = ['plan', 'play', 'missions', 'passport'];

async function boot() {
  const mapHost = $('#map');
  let data;
  try { data = await loadAll(); } catch (err) {
    console.error(err);
    mapHost.replaceChildren(h('div', { class: 'fatal' }, h('h2', null, 'MetroGate could not start'), h('p', null, location.protocol === 'file:' ? 'Browsers block data files when a page is opened directly from disk. Run a small local server instead, for example: python3 -m http.server 8000, then open http://localhost:8000.' : `The data files could not be loaded. ${err.message}`)));
    return;
  }
  const { net, game } = data;
  const progress = new Progress(net, game);
  const toast = createToaster($('#toasts'));
  const app = { net, game, progress, toast, pick: null };

  // ----- map -----
  const map = new MapView(mapHost, net, { onSelect: (id) => app.selectStation(id) });
  app.map = map;

  // ----- sheet (mobile bottom panel) -----
  const panel = $('#panel');
  const handle = $('#sheet-handle');
  const setSheet = (s) => { panel.dataset.sheet = s; handle.textContent = s === 'peek' ? 'Show panel' : s === 'half' ? 'Expand' : 'Show map'; };
  handle.addEventListener('click', () => setSheet(panel.dataset.sheet === 'peek' ? 'half' : panel.dataset.sheet === 'half' ? 'full' : 'peek'));
  const mobile = () => matchMedia('(max-width: 819px), (max-width: 1000px) and (orientation: portrait)').matches;
  app.sheetFor = (reason) => { if (!mobile()) return; setSheet(reason === 'station' ? 'peek' : 'half'); };
  setSheet('half');

  // ----- tabs -----
  const panes = Object.fromEntries(TABS.map((t) => [t, $(`#pane-${t}`)]));
  const tabBtns = Object.fromEntries(TABS.map((t) => [t, $(`#tab-${t}`)]));
  app.showTab = (name) => {
    TABS.forEach((t) => { const on = t === name; panes[t].hidden = !on; tabBtns[t].setAttribute('aria-selected', String(on)); tabBtns[t].tabIndex = on ? 0 : -1; });
    if (name === 'passport') passport.render(); if (name === 'missions') missions.render();
    if (name === 'play') play.home(); else if (app.activeTab === 'play') play.stop();
    app.activeTab = name;
    if (mobile() && panel.dataset.sheet === 'peek') setSheet('half');
  };
  TABS.forEach((t, i) => {
    tabBtns[t].addEventListener('click', () => app.showTab(t));
    tabBtns[t].addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return;
      const n = TABS[(i + d + TABS.length) % TABS.length]; app.showTab(n); tabBtns[n].focus();
    });
  });

  // ----- panes -----
  const stationFile = createStationFile(app, $('#station-file'));
  app.stationFile = stationFile;
  const passport = createPassport(app, panes.passport);
  const missions = createMissions(app, panes.missions);
  const play = createPlay(app, panes.play);
  app.planner = createPlanner(app, panes.plan);
  const about = createAbout(app); document.body.append(about.el);
  $('#about-btn').addEventListener('click', about.open);

  // ----- station selection and pick mode -----
  const banner = $('#pick-banner');
  app.startPick = (which) => {
    app.pick = which; banner.hidden = false;
    $('#pick-text').textContent = which === 'from' ? 'Tap a station on the map to set your start.' : 'Tap a station on the map to set your destination.';
    if (mobile()) setSheet('peek');
  };
  const endPick = () => { app.pick = null; banner.hidden = true; };
  $('#pick-cancel').addEventListener('click', endPick);
  app.selectStation = (id) => {
    if (!net.hasStation(id)) return;
    if (app.pick) { const w = app.pick; endPick(); app.showTab('plan'); (w === 'from' ? app.planner.setFrom : app.planner.setTo)(id); map.select(id, { focus: false }); app.sheetFor('route'); return; }
    map.select(id); progress.scout(id);
    stationFile.show(id); app.sheetFor('station');
  };

  // ----- game events to feedback -----
  progress.on('xp', ({ xp, label }) => { if (!['Journey planned', 'Ride completed', 'Route trial', 'Line run', 'Daily route'].includes(label)) toast.show(`+${xp} XP ${label}`, 'xp'); });
  progress.on('scouted', ({ id }) => map.pulse(id));
  progress.on('mission', (m) => toast.show(`Mission complete: ${m.title}`, 'mission', 4200));
  progress.on('rank', (r) => toast.show(`New rank: ${r.title}`, 'rank', 4800));
  progress.on('change', () => { refreshHud(); map.refreshStates(progress); if (!panes.passport.hidden) passport.render(); if (!panes.missions.hidden) missions.render(); });

  // ----- keep the map clear of overlays (legend, controls, bottom sheet) -----
  const stageEl = $('.stage');
  function updateInsets() {
    const st = stageEl.getBoundingClientRect(); const lg = $('#legend').getBoundingClientRect();
    const top = Math.max(0, lg.bottom - st.top) + 12;
    if (mobile()) map.setInsets({ t: top, r: 56, l: 8, b: Math.max(0, st.bottom - panel.getBoundingClientRect().top) + 12 });
    else map.setInsets({ t: top, r: 70, l: 16, b: 24 });
  }
  new ResizeObserver(updateInsets).observe(panel); new ResizeObserver(updateInsets).observe(stageEl);
  panel.addEventListener('transitionend', (e) => { if (e.propertyName === 'height') updateInsets(); });

  // ----- hud: rank strip, legend, zoom, motion -----
  const rankTitle = $('#rank-title'); const rankBar = $('#rank-bar'); const rankXp = $('#rank-xp');
  const legend = $('#legend');
  function refreshHud() {
    const r = progress.rank();
    rankTitle.textContent = r.title; rankXp.textContent = `${r.xp} XP`;
    rankBar.style.width = `${Math.round(r.ratio * 100)}%`; rankBar.parentElement.setAttribute('aria-valuenow', String(Math.round(r.ratio * 100)));
    legend.replaceChildren(...net.lines.map((l) => {
      const p = progress.lineProgress(l.id);
      const b = h('button', { type: 'button', class: `legend-item${map.lineFocus === l.id ? ' on' : ''}`, style: { '--c': l.color }, 'aria-pressed': String(map.lineFocus === l.id), onClick: () => { map.focusLine(l.id); refreshHud(); } },
        h('i', { class: 'swatch' }), h('span', { class: 'legend-name' }, l.name.replace(' Line', '')), h('span', { class: 'legend-count' }, `${p.scouted}/${p.total}`));
      return b;
    }));
  }
  $('#zoom-in').addEventListener('click', () => map.zoomBy(1.4));
  $('#zoom-out').addEventListener('click', () => map.zoomBy(1 / 1.4));
  $('#zoom-fit').addEventListener('click', () => { map.fit(); if (map.lineFocus) { map.focusLine(map.lineFocus); refreshHud(); } });
  const motion = $('#motion-btn'); let calm = false;
  try { calm = localStorage.getItem('metrogame.calm') === '1'; } catch { /* storage blocked */ }
  const applyMotion = () => { map.setAmbient(!calm); motion.textContent = calm ? 'Trains: off' : 'Trains: on'; motion.setAttribute('aria-pressed', String(calm)); };
  motion.addEventListener('click', () => { calm = !calm; try { localStorage.setItem('metrogame.calm', calm ? '1' : '0'); } catch { /* ignore */ } applyMotion(); });
  applyMotion();
  const zoomLabel = $('#zoom-note'); map.handlers.onZoom = (k) => { zoomLabel.hidden = k >= 0.5; };

  // ----- start -----
  map.refreshStates(progress); refreshHud(); updateInsets(); app.showTab('plan');
  const params = parseHashParams(location.hash);
  if (net.hasStation(params.from) && net.hasStation(params.to)) { app.planner.from.set(params.from); app.planner.to.set(params.to); app.planner.plan({ silent: true }); }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('dialog[open]')) { if (app.pick) endPick(); else if (stationFile.currentId) stationFile.close(); } });
  window.metrogate = app; // handy for experimenting in the console
}

boot();
