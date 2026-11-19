import { readFileSync } from 'node:fs';
import { Network } from '../js/data/network.js';
const read = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
export const net = new Network(read('network.json'), read('layout.json'));
export const game = read('game.json');
