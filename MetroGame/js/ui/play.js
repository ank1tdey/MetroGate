import { h, add } from '../core/dom.js';
import { makeRouteTrial, makeLineRun, starsFor } from '../game/trials.js';
import { mulberry32, hashString, localDateString, previousDate } from '../core/rng.js';

const pips = (n) => h('span', { class: 'pips', role: 'img', 'aria-label': `${n} of 3 stars` }, [1, 2, 3].map((i) => h('i', { class: i <= n ? 'on' : '' })));
const fmt = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

export function createPlay(app, host) {
  const { net, progress, map, toast } = app;
  let timer = null;
  const reset = () => { app.stationFile?.close(); clearInterval(timer); map.clearPins(); map.setHighlight([]); map.clearRoute(); };

  function home() {
    reset(); map.fit();
    const date = localDateString(); const done = progress.dailyDone(date);
    const row = (title, text, meta, onClick, label) => h('li', { class: 'mode' }, h('div', null, h('h3', null, title), h('p', null, text), meta), h('button', { type: 'button', class: 'btn', onClick }, label));
    host.replaceChildren(
      h('h2', { class: 'pane-title' }, 'Play'),
      h('p', { class: 'lede' }, 'Three short games. Each one trains a skill you need on a real platform: choosing a line, reading the direction sign, and knowing the order of stops.'),
      h('ul', { class: 'modes' },
        row('Daily route', 'One route, the same for everyone today. Keep your streak going.', h('p', { class: 'meta' }, done ? `Done today with ${progress.state.daily.done[date]} stars. Streak: ${progress.state.daily.streak}.` : `Streak: ${progress.state.daily.streak}.`), () => trial({ daily: true }), done ? 'Replay for practice' : 'Play today\'s route'),
        row('Route trial', 'A random journey. Pick the right line, direction and change station, then watch the train take the answer.', null, () => trial({}), 'Start a trial'),
        row('Line run', 'Tap six stations in the order a train reaches them.', null, lineRun, 'Start a run')));
  }

  function shell(title, sub) {
    const body = h('div', { class: 'game' });
    host.replaceChildren(...[h('button', { type: 'button', class: 'btn-text', onClick: home }, 'Back to games'), h('h2', { class: 'pane-title' }, title), sub ? h('p', { class: 'lede' }, sub) : null, body].filter(Boolean));
    return body;
  }

  function trial({ daily }) {
    reset();
    const date = localDateString();
    const rng = daily ? mulberry32(hashString(`metrogate:${date}`)) : mulberry32((Math.random() * 2 ** 32) >>> 0);
    const t = makeRouteTrial(net, rng);
    const body = shell(daily ? 'Daily route' : 'Route trial', `From ${net.station(t.from).name} to ${net.station(t.to).name}. The map marks them A and B.`);
    map.setPins(t.from, t.to); map.focusPoints([[net.layout.stations[t.from].x, net.layout.stations[t.from].y], [net.layout.stations[t.to].x, net.layout.stations[t.to].y]], { pad: 260, maxK: 1.3 });
    app.sheetFor('game');
    let qi = 0; let mistakes = 0;
    const ask = () => {
      const q = t.questions[qi]; let missed = false;
      const fb = h('p', { class: 'check-fb', role: 'status' });
      const next = h('button', { type: 'button', class: 'btn btn-primary', hidden: true, onClick: () => { qi += 1; qi < t.questions.length ? ask() : finish(); } }, qi === t.questions.length - 1 ? 'See result' : 'Next question');
      const row = h('div', { class: 'choices' }, q.options.map((o) => {
        const b = h('button', { type: 'button', class: 'choice' }, o.label);
        b.addEventListener('click', () => {
          if (o.id === q.answerId) { row.querySelectorAll('button').forEach((x) => { x.disabled = true; }); b.classList.add('right'); fb.textContent = q.explain; next.hidden = false; next.focus(); }
          else { b.disabled = true; b.classList.add('wrong'); fb.textContent = 'Not quite. Try another option.'; if (!missed) { missed = true; mistakes += 1; } }
        });
        return b;
      }));
      body.replaceChildren(h('p', { class: 'q-count' }, `Question ${qi + 1} of ${t.questions.length}`), h('div', { class: 'bar thin' }, h('i', { style: { width: `${(qi / t.questions.length) * 100}%` } })), h('p', { class: 'check-q' }, q.prompt), row, fb, next);
    };
    const finish = () => {
      const stars = starsFor(mistakes);
      let xp = 0; let extra = '';
      if (daily) { const r = progress.recordDaily(date, previousDate(date), stars); xp = r.xp; extra = r.streak ? ` Streak: ${r.streak}.` : ''; }
      xp += progress.recordTrial({ from: t.from, to: t.to, stars }).xp;
      body.replaceChildren(h('p', { class: 'result-title' }, stars === 3 ? 'Flawless' : stars === 2 ? 'Well navigated' : 'You got there'), pips(stars),
        h('p', null, `${mistakes === 0 ? 'No wrong answers.' : `${mistakes} question${mistakes === 1 ? '' : 's'} needed a second try.`}${extra}`),
        h('p', { class: 'fine' }, xp ? `+${xp} XP` : 'No XP this time: you have already earned it for this route.'),
        h('div', { class: 'ticket-actions' }, h('button', { type: 'button', class: 'btn', onClick: () => trial({}) }, 'Another trial'), h('button', { type: 'button', class: 'btn btn-ghost', onClick: home }, 'Back to games')));
      if (xp) toast.show(`+${xp} XP Route trial`, 'xp');
      map.clearPins(); map.showRoute(t.route); setTimeout(() => map.playTrain(t.route, { onStation: (i, id) => progress.scout(id) }), 1200);
    };
    ask();
  }

  function lineRun() {
    reset();
    const r = makeLineRun(net, mulberry32((Math.random() * 2 ** 32) >>> 0));
    const line = net.line(r.lineId);
    const body = shell('Line run', `On the ${line.name}, heading towards ${net.station(r.towardId).name}. Tap the stations in the order the train reaches them.`);
    map.focusPoints(r.ids.map((id) => [net.layout.stations[id].x, net.layout.stations[id].y]), { pad: 240, maxK: 1.3 });
    map.setHighlight(r.ids); app.sheetFor('game');
    let n = 0; let mistakes = 0; const t0 = performance.now();
    const clock = h('p', { class: 'clock', role: 'timer' }, '0:00');
    timer = setInterval(() => { clock.textContent = fmt(performance.now() - t0); }, 250);
    const fb = h('p', { class: 'check-fb', role: 'status' }, 'Which station comes first?');
    const order = h('ol', { class: 'run-order' });
    const grid = h('div', { class: 'choices run-grid' }, r.shuffled.map((id) => {
      const b = h('button', { type: 'button', class: 'choice' }, net.station(id).name);
      b.addEventListener('click', () => {
        if (id === r.ids[n]) {
          n += 1; b.disabled = true; b.classList.add('right'); order.append(h('li', { style: { '--c': line.color } }, net.station(id).name)); map.pulse(id); progress.scout(id);
          fb.textContent = n < r.ids.length ? 'Right. And the next one?' : '';
          if (n === r.ids.length) done();
        } else { mistakes += 1; b.classList.add('wrong'); setTimeout(() => b.classList.remove('wrong'), 450); fb.textContent = `Not ${net.station(id).name}. Think about the direction of travel.`; }
      });
      return b;
    }));
    body.append(clock, grid, fb, order);
    const done = () => {
      clearInterval(timer); const ms = performance.now() - t0; const stars = starsFor(mistakes);
      const { xp } = progress.recordLineRun({ lineId: r.lineId, startId: r.startId, mistakes, stars });
      if (xp) toast.show(`+${xp} XP Line run`, 'xp');
      grid.remove();
      add(body, h('p', { class: 'result-title' }, mistakes === 0 ? 'Clean run' : 'Run complete'), pips(stars), h('p', null, `${fmt(ms)} with ${mistakes} wrong ${mistakes === 1 ? 'tap' : 'taps'}.`),
        xp ? null : h('p', { class: 'fine' }, 'No XP this time: you have already earned it for this stretch.'),
        h('div', { class: 'ticket-actions' }, h('button', { type: 'button', class: 'btn', onClick: lineRun }, 'Another run'), h('button', { type: 'button', class: 'btn btn-ghost', onClick: home }, 'Back to games')));
    };
  }

  return { home, stop: reset };
}
