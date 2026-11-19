import { h } from '../core/dom.js';

export function createAbout(app) {
  const { net } = app;
  const dlg = h('dialog', { class: 'about', 'aria-labelledby': 'about-title' });
  const close = h('button', { type: 'button', class: 'btn', onClick: () => dlg.close() }, 'Close');
  dlg.append(
    h('h2', { id: 'about-title' }, 'About this data'),
    h('p', null, net.meta.summary),
    h('p', null, h('strong', null, 'Checked: '), net.meta.asOf),
    h('h3', null, 'Sources'), h('ul', null, net.meta.sources.map((s) => h('li', null, s))),
    h('h3', null, 'What is not included'), h('ul', null, net.meta.caveats.map((s) => h('li', null, s))),
    h('h3', null, 'Privacy'),
    h('p', null, 'No account, no tracking and no server. Your progress is stored in this browser only. Location is never requested unless you press the location button while tracking a ride, and it is never saved or sent anywhere.'),
    h('p', { class: 'fine' }, 'Version 1.1, build 4.'),
    h('p', { class: 'fine' }, 'MetroGate is an independent project, not affiliated with Metro Railway, Kolkata.'),
    close);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  return { open: () => (dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', '')), el: dlg };
}
