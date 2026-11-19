// Small geometry helpers for polylines. Pure, so they can be unit tested.
export const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

export function cumulative(points) {
  const out = [0];
  for (let i = 1; i < points.length; i++) out.push(out[i - 1] + dist(points[i - 1], points[i]));
  return out;
}

/** Point and heading at distance d along a polyline (clamped to its ends). */
export function pointAt(points, cum, d) {
  const total = cum[cum.length - 1];
  const t = Math.max(0, Math.min(total, d));
  let i = 1;
  while (i < cum.length - 1 && cum[i] < t) i++;
  const seg = cum[i] - cum[i - 1] || 1;
  const f = (t - cum[i - 1]) / seg;
  const [x0, y0] = points[i - 1]; const [x1, y1] = points[i];
  return { x: x0 + (x1 - x0) * f, y: y0 + (y1 - y0) * f, angle: (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI };
}

export function toPath(points) {
  return points.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ');
}

/** Catmull-Rom spline through points as an SVG path (for the river). */
export function smoothPath(pts) {
  if (pts.length < 3) return toPath(pts);
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]; const p1 = pts[i]; const p2 = pts[i + 1]; const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0]} ${p2[1]}`;
  }
  return d;
}

export function bounds(points) {
  const xs = points.map((p) => p[0]); const ys = points.map((p) => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/** Polyline for a route: for each leg take the line's own vertices between the two stations. */
export function routePoints(net, route) {
  const pts = [];
  const stops = [];
  route.legs.forEach((leg) => {
    const geom = net.layout.lines[leg.lineId].points;
    const a = net.indexOf(leg.lineId, leg.stations[0]);
    const b = net.indexOf(leg.lineId, leg.stations.at(-1));
    const slice = a <= b ? geom.slice(a, b + 1) : geom.slice(b, a + 1).reverse();
    slice.forEach((p, k) => {
      const prev = pts.at(-1);
      if (prev && prev[0] === p[0] && prev[1] === p[1]) { return; }
      pts.push(p);
      void k;
    });
  });
  const cum = cumulative(pts);
  route.stationPath.forEach((id) => {
    const s = net.layout.stations[id];
    const idx = pts.findIndex((p) => p[0] === s.x && p[1] === s.y);
    stops.push({ id, dist: idx >= 0 ? cum[idx] : 0 });
  });
  return { points: pts, cum, stops };
}
