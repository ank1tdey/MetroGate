import { h } from '../core/dom.js';
import { cleanQuery } from '../core/sanitize.js';

const SUGGESTED = ['howrah', 'sealdah', 'esplanade', 'dum-dum', 'jai-hind', 'salt-lake-sector-v', 'kalighat', 'dakshineswar'];
let uid = 0;

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
  function suggestions() {
    const q = cleanQuery(input.value);
    if (q) return net.search(q, 12);
    const rest = net.stations.filter((x) => !SUGGESTED.includes(x.id)).sort((a, b) => a.name.localeCompare(b.name));
    return [...SUGGESTED.map((x) => net.station(x)), ...rest];
  }

  list.addEventListener('touchstart', () => { touching = true; }, { passive: true });
  list.addEventListener('touchend', () => { setTimeout(() => { touching = false; }, 300); }, { passive: true });
  input.addEventListener('focus', () => { onFocus?.(); open(suggestions()); setTimeout(() => wrap.scrollIntoView({ block: 'start', behavior: 'smooth' }), 120); });
  input.addEventListener('input', () => { value = null; onChange?.(null); open(suggestions()); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden) open(suggestions()); mark(Math.min(results.length - 1, active + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); mark(Math.max(0, active - 1)); }
    else if (e.key === 'Enter' && !list.hidden && results.length) { e.preventDefault(); choose(results[active >= 0 ? active : 0]); }
    else if (e.key === 'Escape') close();
  });
  input.addEventListener('blur', () => {
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
