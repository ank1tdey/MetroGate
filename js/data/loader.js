import { Network } from './network.js';

async function getJson(path) {
  const res = await fetch(new URL(path, import.meta.url));
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  return res.json();
}

export async function loadAll() {
  const [raw, layout, game] = await Promise.all([
    getJson('../../data/network.json'),
    getJson('../../data/layout.json'),
    getJson('../../data/game.json'),
  ]);
  return { net: new Network(raw, layout), game };
}
