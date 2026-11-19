import { h } from '../core/dom.js';

export function createToaster(host) {
  return {
    show(text, tone = 'plain', ms = 3000) {
      const t = h('div', { class: `toast toast-${tone}` }, text);
      host.append(t);
      while (host.children.length > 3) host.firstElementChild.remove();
      setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, ms);
    },
  };
}
