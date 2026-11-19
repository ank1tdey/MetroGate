import { h } from '../core/dom.js';
import { cleanQuery } from '../core/sanitize.js';

const SUGGESTED = ['howrah', 'sealdah', 'esplanade', 'dum-dum', 'jai-hind', 'salt-lake-sector-v', 'kalighat', 'dakshineswar'];
let uid = 0;
const isTouch = () => globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;

/** Full-screen chooser for touch devices. It is sized to the *visible* viewport, so the
 *  list always fits above the on-screen keyboard and scrolls normally. */
function openChooser({ net, title, current, onPick }) {
  const vv = globalThis.visualViewport;
  const input = h('input', { type: 'search', class: 'field-input', placeholder: 'Scroll to browse, or tap here to search', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'search', inputmode: 'search', maxlength: 40, 'aria-label': 'Search stations', name: 'metro-station-search' });
  const list = h('ul', { class: 'chooser-list' });
  const prevFocus = document.activeElement;
  const close = () => {
    vv?.removeEventListener('resize', fit); vv?.removeEventListener('scroll', fit);
    document.removeEventListener('keydown', onKey); ov.remove(); document.body.classList.remove('chooser-open');
    prevFocus?.blur?.();
  };
  const pick = (st) => { close(); onPick(st); };
  const row = (st) => {
    const alias = (st.aliases ?? []).filter((a) => a.toLowerCase() !== st.name.toLowerCase()).slice(0, 2).join(', ');
    const btn = h('button', { type: 'button', class: `chooser-opt${st.id === current ? ' is-current' : ''}`, 'aria-current': st.id === current ? 'true' : null, onClick: () => pick(st) },
      h('span', { class: 'mini-bars', 'aria-hidden': 'true' }, st.lines.map((l) => h('i', { style: { '--c': net.line(l).color } }))),
      h('span', { class: 'combo-name' }, st.name), alias ? h('span', { class: 'combo-alias' }, `also ${alias}`) : null,
      st.id === current ? h('span', { class: 'chooser-now' }, 'Selected') : null);
    return h('li', null, btn);
  };
  const render = () => {
    const q = cleanQuery(input.value);
    if (q) {
      const items = net.search(q, 25);
      list.replaceChildren(...(items.length ? items.map(row) : [h('li', { class: 'chooser-empty' }, 'No station matches that. Try a local name such as Tollygunge or Airport.')]));
      return;
    }
    const groups = [{ title: 'Popular places', ids: SUGGESTED }, ...net.lines.map((l) => ({ title: `${l.name}, in order`, ids: l.stations, color: l.color }))];
    list.replaceChildren(...groups.flatMap((g) => [
      h('li', { class: 'chooser-head', style: { '--c': g.color ?? 'var(--ink)' } }, g.title),
      ...g.ids.map((id) => row(net.station(id))),
    ]));
    list.querySelector('.is-current')?.scrollIntoView({ block: 'center' });
  };
  const ov = h('div', { class: 'chooser', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'chooser-top' }, h('p', { class: 'chooser-title' }, title), h('button', { type: 'button', class: 'btn-text', onClick: close }, 'Cancel')),
    h('div', { class: 'chooser-search' }, input), list);
  function fit() { if (!vv) return; ov.style.height = `${vv.height}px`; ov.style.transform = `translateY(${vv.offsetTop}px)`; }
  function onKey(e) { if (e.key === 'Escape') close(); }
  input.addEventListener('input', render);
  document.addEventListener('keydown', onKey);
  vv?.addEventListener('resize', fit); vv?.addEventListener('scroll', fit);
  document.body.append(ov); document.body.classList.add('chooser-open');
  fit(); render(); ov.tabIndex = -1; ov.focus({ preventScroll: true }); // no keyboard until the search box is tapped
}

/** Accessible station picker: type any current, local or former name. */
export function createStationPicker({ net, label, hint, onChange, onFocus }) {
  const id = `picker-${++uid}`;
  let value = null; let active = -1; let results = []; let touching = false;
  const input = h('input', { id, type: 'text', class: 'field-input', autocomplete: 'off', spellcheck: 'false', maxlength: 40, role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': `${id}-list`, placeholder: 'Type a station or local name' });
  const list = h('ul', { id: `${id}-list`, class: 'combo-list', role: 'listbox', hidden: true, 'aria-label': `${label} suggestions` });
  const error = h('p', { class: 'field-error', id: `${id}-err`, role: 'alert' });
  input.setAttribute('aria-describedby', `${id}-err`);
  const wrap = h('div', { class: 'field' }, h('label', { for: id, class: 'field-label' }, label), hint ? h('p', { class: 'field-hint' }, hint) : null, input, list, error);

  const stationLabel = (s) => s.name;
  const bars = (s) => h('span', { class: 'mini-bars', 'aria-hidden': 'true' }, s.lines.map((l) => h('i', { style: { '--c': net.line(l).color } })));
  function open(items) {
    results = items; active = -1; list.replaceChildren();
    items.forEach((s, i) => {
      const alias = (s.aliases ?? []).filter((a) => a.toLowerCase() !== s.name.toLowerCase()).slice(0, 2).join(', ');
      const li = h('li', { id: `${id}-o${i}`, role: 'option', class: 'combo-opt', 'aria-selected': 'false' }, bars(s), h('span', { class: 'combo-name' }, s.name), alias ? h('span', { class: 'combo-alias' }, `also ${alias}`) : null);
      li.addEventListener('mousedown', (e) => e.preventDefault()); // keep input focus on desktop
      li.addEventListener('click', () => choose(s)); // a tap selects; a scroll gesture does not
      list.append(li);
    });
    list.hidden = items.length === 0; input.setAttribute('aria-expanded', String(items.length > 0));
  }
  function close() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); }
  function mark(i) {
    [...list.children].forEach((li, k) => li.setAttribute('aria-selected', String(k === i)));
    active = i; if (i >= 0) { input.setAttribute('aria-activedescendant', `${id}-o${i}`); list.children[i].scrollIntoView({ block: 'nearest' }); }
  }
  function choose(s) { value = s.id; input.value = stationLabel(s); error.textContent = ''; wrap.classList.remove('invalid'); close(); onChange?.(value); }
  function suggestions(forceAll = false) {
    const q = forceAll ? '' : cleanQuery(input.value);
    if (q) return net.search(q, 12);
    const rest = net.stations.filter((x) => !SUGGESTED.includes(x.id)).sort((a, b) => a.name.localeCompare(b.name));
    return [...SUGGESTED.map((x) => net.station(x)), ...rest];
  }

  list.addEventListener('touchstart', () => { touching = true; }, { passive: true });
  list.addEventListener('touchend', () => { setTimeout(() => { touching = false; }, 300); }, { passive: true });
  const useChooser = () => isTouch();
  if (useChooser()) { input.readOnly = true; input.setAttribute('inputmode', 'none'); input.placeholder = 'Tap to choose a station'; input.setAttribute('aria-haspopup', 'dialog'); input.removeAttribute('role'); input.removeAttribute('aria-expanded'); input.removeAttribute('aria-controls'); input.removeAttribute('aria-autocomplete'); }
  input.addEventListener('click', () => { if (useChooser()) openChooser({ net, title: label === 'From' ? 'Choose your start' : 'Choose your destination', current: value, onPick: choose }); });
  input.addEventListener('focus', () => { if (useChooser()) return; onFocus?.(); open(suggestions(Boolean(value))); if (value) { input.select(); const k = results.findIndex((x) => x.id === value); if (k >= 0) mark(k); } setTimeout(() => wrap.scrollIntoView({ block: 'start', behavior: 'smooth' }), 120); });
  input.addEventListener('click', () => { if (!useChooser() && list.hidden) open(suggestions(Boolean(value))); });
  input.addEventListener('input', () => { if (useChooser()) return; value = null; onChange?.(null); open(suggestions()); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden) open(suggestions()); mark(Math.min(results.length - 1, active + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); mark(Math.max(0, active - 1)); }
    else if (e.key === 'Enter' && !list.hidden && results.length) { e.preventDefault(); choose(results[active >= 0 ? active : 0]); }
    else if (e.key === 'Escape') close();
  });
  input.addEventListener('blur', () => {
    if (useChooser()) return;
    if (touching) { input.focus({ preventScroll: true }); return; }
    close();
    const text = cleanQuery(input.value);
    if (!text || value) return;
    const hit = net.resolve(text);
    if (hit) choose(hit); else { error.textContent = 'Choose a station from the list.'; wrap.classList.add('invalid'); }
  });

  return {
    el: wrap, input,
    get value() { return value; },
    set(idValue) { const s = idValue && net.station(idValue); if (s) choose(s); else { value = null; input.value = ''; onChange?.(null); } },
    validate() { if (value) return true; const hit = net.resolve(input.value); if (hit) { choose(hit); return true; } error.textContent = input.value ? 'Choose a station from the list.' : 'Pick a station first.'; wrap.classList.add('invalid'); return false; },
    focus() { input.focus(); },
  };
}
