import { svg, clear } from '../core/dom.js';
import { cumulative, pointAt, toPath, smoothPath, bounds, routePoints } from './geometry.js';

const K_MAX = 4;
const reduceMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);

export class MapView {
  constructor(container, net, handlers = {}) {
    this.el = container; this.net = net; this.handlers = handlers;
    this.t = { k: 1, x: 0, y: 0 };
    this.size = { w: 800, h: 600 };
    this.selected = null; this.lineFocus = null; this.route = null;
    this.stationEls = new Map(); this.lineEls = new Map();
    this.insets = { t: 64, r: 64, b: 24, l: 16 }; this.userMoved = false;
    this.ambient = []; this.ambientOn = true; this.train = null; this.frame = 0; this.dragged = false;
    this.build();
    this.observe();
    this.bindGestures();
    this.bindKeys();
    this.startAmbient();
  }

  // ---------- build ----------
  build() {
    const { net } = this; const L = net.layout;
    this.svg = svg('svg', { class: 'map-svg', role: 'group', 'aria-label': 'Schematic Kolkata Metro map. Drag to pan, scroll or pinch to zoom.', 'data-zoom': 'mid', xmlns: 'http://www.w3.org/2000/svg' });
    const defs = svg('defs', null,
      svg('pattern', { id: 'grid', width: 50, height: 50, patternUnits: 'userSpaceOnUse' }, svg('path', { d: 'M50 0H0V50', class: 'grid-line' })),
      svg('path', { id: 'river-path', d: smoothPath(L.river) }));
    this.world = svg('g', { class: 'world' });
    const chart = svg('rect', { class: 'chart', x: 0, y: 0, width: L.canvas.w, height: L.canvas.h });
    const grid = svg('rect', { class: 'chart-grid', x: 0, y: 0, width: L.canvas.w, height: L.canvas.h, fill: 'url(#grid)' });
    const river = svg('g', { class: 'river' },
      svg('use', { href: '#river-path', class: 'river-wide' }), svg('use', { href: '#river-path', class: 'river-core' }),
      svg('text', { class: 'river-label' }, svg('textPath', { href: '#river-path', startOffset: '38%' }, 'Hooghly')));
    this.linesG = svg('g', { class: 'lines' });
    net.lines.forEach((line, li) => this.#drawLine(line, li));
    this.routeG = svg('g', { class: 'route-layer' });
    this.stationsG = svg('g', { class: 'stations' });
    net.stations.forEach((s, i) => this.#drawStation(s, i));
    this.fxG = svg('g', { class: 'fx-layer' });
    this.trainG = svg('g', { class: 'train-layer' });
    this.world.append(chart, grid, river, this.linesG, this.routeG, this.trainG, this.stationsG, this.fxG);
    this.svg.append(defs, this.world);
    clear(this.el).append(this.svg);
    this.svg.classList.add('intro');
    setTimeout(() => this.svg.classList.remove('intro'), 2600);
  }

  #drawLine(line, li) {
    const pts = this.net.layout.lines[line.id].points;
    const g = svg('g', { class: 'line', 'data-line': line.id, style: { '--i': li, '--c': line.color, '--ink': line.ink } });
    const d = toPath(pts);
    g.append(svg('path', { d, class: 'line-casing', pathLength: 1 }), svg('path', { d, class: 'line-body', pathLength: 1 }));
    for (const sec of line.sections ?? []) {
      if (sec.status !== 'suspended') continue;
      const a = this.net.indexOf(line.id, sec.from); const b = this.net.indexOf(line.id, sec.to);
      const slice = pts.slice(Math.min(a, b), Math.max(a, b) + 1);
      g.append(svg('path', { d: toPath(slice), class: 'line-mask' }), svg('path', { d: toPath(slice), class: 'line-suspended' }));
    }
    this.lineEls.set(line.id, g);
    this.linesG.append(g);
  }

  #drawStation(s, i) {
    const pos = this.net.layout.stations[s.id];
    const hub = this.net.isInterchange(s.id);
    const ix = this.net.interchange(s.id);
    const first = this.net.line(s.lines[0]);
    const lines = s.lines.map((l) => this.net.line(l).name).join(' and ');
    const label = (() => {
      const c = { r: [14, 4, 'start', 0], l: [-14, 4, 'end', 0], lt: [-14, -12, 'end', 0], bc: [0, 26, 'middle', 0], tc: [0, -18, 'middle', 0], t: [6, -10, 'start', -40], b: [6, 16, 'start', 40] }[pos.side] ?? [14, 4, 'start', 0];
      const hubPush = hub && (pos.side === 'r' || pos.side === 'l') ? 4 : 0;
      const x = c[0] + (pos.side === 'r' ? hubPush : pos.side === 'l' ? -hubPush : 0);
      const text = svg('text', { class: 'lbl', 'text-anchor': c[2], x, y: c[1], transform: c[3] ? `rotate(${c[3]})` : null }, s.name);
      return text;
    })();
    const ring = svg('circle', { class: 'st-ring', r: hub ? 11 : 6.5 });
    const dot = svg('circle', { class: 'st-dot', r: hub ? 5.5 : 3.2 });
    const g = svg('g', {
      class: `station${hub ? ' hub' : ''}${hub && ix.status !== 'open' ? ' hub-suspended' : ''}`,
      transform: `translate(${pos.x} ${pos.y})`, tabindex: 0, role: 'button', 'data-id': s.id,
      'aria-label': `${s.name}, ${lines}${hub ? ', interchange' : ''}`, 'aria-pressed': 'false',
      style: { '--c': first.color, '--ink': first.ink, '--d': `${0.5 + i * 0.03}s` },
    }, svg('circle', { class: 'st-halo', r: 16 }), svg('circle', { class: 'st-stamp', r: hub ? 16 : 11 }), svg('circle', { class: 'hit', r: 18 }), ring, dot, label);
    const ends = this.net.lines.some((l) => { const e = this.net.endsOf(l.id, false); return e.first === s.id || e.last === s.id; });
    if (hub) g.classList.add('lbl-always');
    if (ends) g.classList.add('lbl-end');
    g.addEventListener('click', (e) => {
      if (this.dragged) { e.preventDefault(); return; }
      this.handlers.onSelect?.(s.id);
    });
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.handlers.onSelect?.(s.id); }
    });
    this.stationEls.set(s.id, g);
    this.stationsG.append(g);
  }

  // ---------- state ----------
  refreshStates(progress) {
    for (const [id, el] of this.stationEls) {
      el.classList.toggle('scouted', progress.isScouted(id));
      el.classList.toggle('stamped', progress.isStamped(id));
    }
  }
  select(id, { focus = true } = {}) {
    if (this.selected) { const p = this.stationEls.get(this.selected); p?.classList.remove('selected'); p?.setAttribute('aria-pressed', 'false'); }
    this.selected = id;
    if (!id) return;
    const el = this.stationEls.get(id); if (!el) return;
    el.classList.add('selected'); el.setAttribute('aria-pressed', 'true');
    this.stationsG.append(el);
    if (focus) this.focusPoints([this.#pt(id)], { pad: 0, minK: 1.1, maxK: 1.35 });
  }
  focusLine(lineId) {
    this.lineFocus = this.lineFocus === lineId ? null : lineId;
    const f = this.lineFocus;
    this.svg.classList.toggle('line-focus', Boolean(f));
    for (const [id, g] of this.lineEls) g.classList.toggle('focus', id === f);
    for (const s of this.net.stations) this.stationEls.get(s.id).classList.toggle('in-focus', Boolean(f) && s.lines.includes(f));
    if (f) this.focusPoints(this.net.line(f).stations.map((id) => this.#pt(id)), { pad: 70 });
    return this.lineFocus;
  }
  pulse(id) {
    const pos = this.net.layout.stations[id]; if (!pos || reduceMotion()) return;
    const ring = svg('circle', { class: 'ping', cx: pos.x, cy: pos.y, r: 8 });
    this.fxG.append(ring);
    ring.addEventListener('animationend', () => ring.remove());
  }
  stampFx(id) {
    const pos = this.net.layout.stations[id]; if (!pos) return;
    const g = svg('g', { class: 'stamp-fx', transform: `translate(${pos.x} ${pos.y})` },
      svg('g', { class: 'stamp-fx-inner' }, svg('circle', { r: 30, class: 'stamp-disc' }), svg('circle', { r: 24, class: 'stamp-ring' }), svg('text', { class: 'stamp-word', y: 5, 'text-anchor': 'middle' }, 'Stamped')));
    this.fxG.append(g);
    setTimeout(() => g.remove(), 2200);
  }
  setMarker(id, label) {
    this.marker?.remove(); this.marker = null;
    if (!id) return;
    const pos = this.net.layout.stations[id];
    this.marker = svg('g', { class: 'you-marker', transform: `translate(${pos.x} ${pos.y})` }, svg('circle', { class: 'you-pulse', r: 14 }), svg('circle', { class: 'you-dot', r: 6 }));
    if (label) this.marker.append(svg('title', null, label));
    this.fxG.append(this.marker);
  }

  // ---------- route ----------
  showRoute(route, { animate = true, fit = true } = {}) {
    this.clearRoute();
    this.route = route;
    const rp = routePoints(this.net, route);
    this.routeGeom = rp;
    const d = toPath(rp.points);
    const lastLine = this.net.line(route.legs[0].lineId);
    const casing = svg('path', { d, class: 'route-casing', pathLength: 1 });
    const ink = svg('path', { d, class: 'route-ink', pathLength: 1, style: { '--c': lastLine.color } });
    this.routeG.append(casing, ink);
    this.svg.classList.add('has-route');
    const on = new Set(route.stationPath);
    for (const [id, el] of this.stationEls) el.classList.toggle('on-route', on.has(id));
    for (const stop of rp.stops) { void stop; }
    if (animate && !reduceMotion()) {
      for (const p of [casing, ink]) { p.style.strokeDasharray = '1'; p.style.strokeDashoffset = '1'; }
      void ink.getBoundingClientRect();
      for (const p of [casing, ink]) { p.style.transition = 'stroke-dashoffset 1.15s cubic-bezier(.65,.05,.25,1)'; p.style.strokeDashoffset = '0'; }
    }
    if (fit) this.focusPoints(rp.points, { pad: 150 });
  }
  clearRoute() {
    this.stopTrain();
    clear(this.routeG); this.route = null; this.routeGeom = null;
    this.svg.classList.remove('has-route');
    for (const el of this.stationEls.values()) el.classList.remove('on-route', 'passed');
  }

  /** Animate a train along the shown route, pausing at each station. */
  playTrain(route, { onStation, onDone } = {}) {
    this.stopTrain();
    const rp = routePoints(this.net, route);
    if (!this.routeGeom) this.showRoute(route, { animate: false });
    const total = rp.cum.at(-1);
    const color = this.net.line(route.legs[0].lineId).ink;
    const body = svg('g', { class: 'train', style: { '--ink': color } }, svg('rect', { x: -15, y: -6, width: 30, height: 12, rx: 3, class: 'train-body' }), svg('rect', { x: -9, y: -3, width: 6, height: 5, class: 'train-win' }), svg('rect', { x: 0, y: -3, width: 6, height: 5, class: 'train-win' }), svg('rect', { x: 9, y: -3, width: 4, height: 6, class: 'train-nose' }));
    this.trainG.append(body);
    const stops = rp.stops;
    let pos = 0; let idx = 0; let pause = 0; let last = performance.now(); let alive = true;
    const place = (d) => { const p = pointAt(rp.points, rp.cum, d); body.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.angle.toFixed(1)})`); };
    const arrive = (i) => { this.stationEls.get(stops[i].id)?.classList.add('passed'); this.pulse(stops[i].id); onStation?.(i, stops[i].id); };
    place(0); arrive(0); idx = 1; pause = 500;
    const speed = Math.max(170, total / 9);
    if (reduceMotion()) {
      let i = 1;
      const step = () => { if (!alive) return; if (i >= stops.length) { onDone?.(); return; } place(stops[i].dist); arrive(i); i += 1; this.train.timer = setTimeout(step, 700); };
      this.train = { stop: () => { alive = false; clearTimeout(this.train?.timer); body.remove(); } };
      this.train.timer = setTimeout(step, 700);
      return this.train;
    }
    const tick = (now) => {
      if (!alive) return;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (pause > 0) { pause -= dt * 1000; } else {
        pos += speed * dt;
        const target = stops[idx]?.dist ?? total;
        if (pos >= target) { pos = target; place(pos); arrive(idx); idx += 1; pause = 420; if (idx >= stops.length) { alive = false; setTimeout(() => { body.classList.add('arrived'); onDone?.(); }, 300); return; } } else place(pos);
      }
      this.train.raf = requestAnimationFrame(tick);
    };
    this.train = { stop: () => { alive = false; cancelAnimationFrame(this.train?.raf); body.remove(); } };
    this.train.raf = requestAnimationFrame(tick);
    return this.train;
  }
  stopTrain() { this.train?.stop(); this.train = null; clear(this.trainG); for (const el of this.stationEls.values()) el.classList.remove('passed'); this.startAmbient(); }

  // ---------- ambient trains ----------
  startAmbient() {
    if (this.ambient.length) return;
    if (!this.ambientTrains) {
      this.ambientTrains = this.net.lines.map((line, i) => {
        const e = this.net.endsOf(line.id, false);
        const a = this.net.indexOf(line.id, e.first); const b = this.net.indexOf(line.id, e.last);
        const pts = this.net.layout.lines[line.id].points.slice(a, b + 1);
        const cum = cumulative(pts);
        const g = svg('g', { class: 'ambient', style: { '--ink': line.ink } }, svg('rect', { x: -8, y: -3.5, width: 16, height: 7, rx: 2, class: 'amb-body' }));
        return { g, pts, cum, total: cum.at(-1), offset: (i * 0.37) % 1, speed: 28 + i * 4 };
      });
    }
    this.ambient = this.ambientTrains;
    for (const a of this.ambient) this.trainG.append(a.g);
    this.#ambientLoop();
  }
  #ambientLoop() {
    cancelAnimationFrame(this.frame);
    if (reduceMotion() || !this.ambientOn) { for (const a of this.ambient) { const p = pointAt(a.pts, a.cum, a.total * a.offset); a.g.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${p.angle})`); } return; }
    const t0 = performance.now();
    const loop = (now) => {
      if (!this.ambient.length || this.train) return;
      const s = (now - t0) / 1000;
      for (const a of this.ambient) {
        const span = a.total * 2; let d = (a.offset * span + s * a.speed) % span; let flip = 0;
        if (d > a.total) { d = span - d; flip = 180; }
        const p = pointAt(a.pts, a.cum, d);
        a.g.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${(p.angle + flip).toFixed(1)})`);
      }
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }
  setAmbient(on) { this.ambientOn = on; this.svg.classList.toggle('calm', !on); this.#ambientLoop(); }

  // ---------- pins and highlights (used by games) ----------
  setPins(a, b) {
    this.clearPins();
    this.pins = svg('g', { class: 'pins' });
    [['A', a], ['B', b]].forEach(([letter, id]) => {
      const p = this.net.layout.stations[id];
      this.pins.append(svg('g', { class: 'pin', transform: `translate(${p.x} ${p.y})` }, svg('circle', { r: 17, class: 'pin-disc' }), svg('text', { class: 'pin-letter', y: 6, 'text-anchor': 'middle' }, letter)));
    });
    this.fxG.append(this.pins);
  }
  clearPins() { this.pins?.remove(); this.pins = null; }
  setHighlight(ids) {
    const on = new Set(ids);
    this.svg.classList.toggle('has-route', on.size > 0);
    for (const [id, el] of this.stationEls) el.classList.toggle('on-route', on.has(id));
  }

  // ---------- camera ----------
  #pt(id) { const p = this.net.layout.stations[id]; return [p.x, p.y]; }
  observe() {
    const ro = new ResizeObserver(() => {
      const r = this.el.getBoundingClientRect(); if (!r.width || !r.height) return;
      const first = !this.sized;
      this.size = { w: r.width, h: r.height }; this.sized = true;
      this.svg.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
      this.minK = this.fitK() * 0.8;
      if (first) this.fit(false); else this.apply();
    });
    ro.observe(this.el);
  }
  view() {
    const { t, r, b, l } = this.insets;
    return { x: l, y: t, w: Math.max(120, this.size.w - l - r), h: Math.max(120, this.size.h - t - b) };
  }
  fitK() {
    const c = this.net.layout.canvas; const v = this.view();
    return Math.min(v.w / c.w, v.h / c.h);
  }
  fit(animate = true) {
    const c = this.net.layout.canvas; const k = this.fitK(); const v = this.view();
    this.moveTo({ k, x: v.x + (v.w - c.w * k) / 2, y: v.y + (v.h - c.h * k) / 2 }, animate);
  }
  setInsets(insets, { refit = true } = {}) {
    this.insets = { ...this.insets, ...insets };
    this.minK = this.fitK() * 0.8;
    if (refit && !this.userMoved && !this.routeGeom && !this.selected) this.fit(false);
  }
  focusPoints(points, { pad = 80, minK = 0, maxK = K_MAX * 0.8 } = {}) {
    const b = bounds(points); const v = this.view();
    const w = Math.max(60, b.maxX - b.minX); const h = Math.max(60, b.maxY - b.minY);
    let k = Math.min((v.w - pad) / w, (v.h - pad) / h, maxK);
    k = Math.max(k, minK, this.minK ?? 0.2);
    this.moveTo({ k, x: v.x + v.w / 2 - ((b.minX + b.maxX) / 2) * k, y: v.y + v.h / 2 - ((b.minY + b.maxY) / 2) * k });
  }
  zoomBy(f) {
    const cx = this.size.w / 2; const cy = this.size.h / 2;
    const k = Math.min(K_MAX, Math.max(this.minK, this.t.k * f)); const r = k / this.t.k;
    this.moveTo({ k, x: cx - (cx - this.t.x) * r, y: cy - (cy - this.t.y) * r });
  }
  moveTo(target, animate = true) {
    cancelAnimationFrame(this.tween);
    const to = this.#clamp(target);
    if (!animate || reduceMotion()) { this.t = to; this.apply(); return; }
    const from = { ...this.t }; const t0 = performance.now(); const dur = 520;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur); const e = ease(p);
      this.t = { k: from.k + (to.k - from.k) * e, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
      this.apply();
      if (p < 1) this.tween = requestAnimationFrame(step);
    };
    this.tween = requestAnimationFrame(step);
  }
  #clamp({ k, x, y }) {
    const c = this.net.layout.canvas; const keep = 140;
    k = Math.min(K_MAX, Math.max(this.minK ?? 0.2, k));
    x = Math.min(this.size.w - keep, Math.max(keep - c.w * k, x));
    y = Math.min(this.size.h - keep, Math.max(keep - c.h * k, y));
    return { k, x, y };
  }
  apply() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      const { k, x, y } = this.t;
      this.world.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${k.toFixed(4)})`);
      this.svg.dataset.zoom = k < 0.5 ? 'far' : k < 1.5 ? 'mid' : 'near';
      this.svg.style.setProperty('--ls', String(Math.min(1.7, Math.max(1, 11.5 / (13 * k))).toFixed(3)));
      this.svg.style.setProperty('--inv', String((1 / k).toFixed(3)));
      this.handlers.onZoom?.(k);
    });
  }

  // ---------- input ----------
  bindGestures() {
    const pts = new Map(); let drag = null; let pinch = null;
    const stopTween = () => cancelAnimationFrame(this.tween);
    this.svg.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      stopTween(); this.userMoved = true; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); this.dragged = false;
      if (pts.size === 1) drag = { x: e.clientX, y: e.clientY, tx: this.t.x, ty: this.t.y, id: e.pointerId };
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: this.t.k, t: { ...this.t } }; drag = null; }
    });
    this.svg.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const rect = this.svg.getBoundingClientRect();
      if (pinch && pts.size >= 2) {
        const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        const cx = (a.x + b.x) / 2 - rect.left; const cy = (a.y + b.y) / 2 - rect.top;
        const k = Math.min(K_MAX, Math.max(this.minK, pinch.k * (d / pinch.d))); const r = k / pinch.t.k;
        this.t = this.#clamp({ k, x: cx - (cx - pinch.t.x) * r, y: cy - (cy - pinch.t.y) * r }); this.dragged = true; this.apply(); return;
      }
      if (drag) {
        const dx = e.clientX - drag.x; const dy = e.clientY - drag.y;
        if (!this.dragged && Math.hypot(dx, dy) > 6) { this.dragged = true; this.svg.setPointerCapture?.(e.pointerId); this.svg.classList.add('dragging'); }
        if (this.dragged) { this.t = this.#clamp({ ...this.t, x: drag.tx + dx, y: drag.ty + dy }); this.apply(); }
      }
    });
    const end = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 0) { drag = null; this.svg.classList.remove('dragging'); setTimeout(() => { this.dragged = false; }, 0); }
    };
    this.svg.addEventListener('pointerup', end); this.svg.addEventListener('pointercancel', end);
    this.svg.addEventListener('wheel', (e) => {
      e.preventDefault(); stopTween(); this.userMoved = true;
      const rect = this.svg.getBoundingClientRect(); const cx = e.clientX - rect.left; const cy = e.clientY - rect.top;
      const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0016));
      const k = Math.min(K_MAX, Math.max(this.minK, this.t.k * f)); const r = k / this.t.k;
      this.t = this.#clamp({ k, x: cx - (cx - this.t.x) * r, y: cy - (cy - this.t.y) * r }); this.apply();
    }, { passive: false });
    this.svg.addEventListener('dblclick', (e) => { if (e.target.closest?.('.station')) return; this.zoomBy(1.6); });
  }
  bindKeys() {
    this.el.addEventListener('keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const step = 70; const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
      if (moves[e.key]) { e.preventDefault(); this.moveTo({ ...this.t, x: this.t.x + moves[e.key][0], y: this.t.y + moves[e.key][1] }, false); }
      else if (e.key === '+' || e.key === '=') { e.preventDefault(); this.zoomBy(1.3); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); this.zoomBy(1 / 1.3); }
      else if (e.key === '0') { e.preventDefault(); this.fit(); }
    });
  }
}
