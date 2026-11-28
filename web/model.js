import WORLD from './world-data.json' with { type: 'json' };
import { shallowWater, riverX } from './landscape.js';
export { WORLD };
export const ITEMS = ['wood', 'stone', 'plank', 'seed', 'crop'];
export const RESOURCES = [
  ...WORLD.TREES.map(([x, z], i) => ({ id: `tree_${i}`, kind: 'wood', x, z })),
  ...WORLD.ROCKS.map(([x, z], i) => ({ id: `rock_${i}`, kind: 'stone', x, z })),
];
// Preserve the original storage key so existing players retain progress.
export const SAVE_KEY = 'pocket-oasis.web.v1';
export const BUILD_RECIPES = Object.freeze({
  ...WORLD.COSTS, wall: { plank: 1, stone: 1 },
  door: { plank: 1, wood: 1 }, window: { plank: 1, stone: 1 }, roof: { plank: 2, wood: 1 },
});
export const BUILD_NAMES = { ...WORLD.BUILD_NAMES, door: 'مدخل مفتوح', window: 'حائط بشباك', roof: 'سقف قرميد' };
export const BUILD_KINDS = Object.keys(BUILD_RECIPES);
export const PANELS = ['wall', 'door', 'window'];
export function buildingSlot(b) {
  if (b.legacy) return `legacy:${key(b.cell)}`;
  if (b.kind === 'floor' || b.kind === 'roof') return `${b.kind}:${key(b.cell)}`;
  const a = b.rotation * Math.PI / 2;
  return `edge:${b.cell[0] * 2 - Math.round(Math.sin(a))},${b.cell[1] * 2 - Math.round(Math.cos(a))}:${b.rotation % 2}`;
}
export function hasFloor(buildings, cell) { return buildings.some(b => b.kind === 'floor' && key(b.cell) === key(cell)); }
export function supportedRoof(buildings, cell) {
  return hasFloor(buildings, cell) && buildings.filter(b => PANELS.includes(b.kind) && key(b.cell) === key(cell)).length >= 2;
}
export const key = ([x, z]) => `${x},${z}`;
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const whole = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const finite = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
export const clone = (value) => JSON.parse(JSON.stringify(value));

export function newState() {
  return {
    version: 2, inventory: { wood: 0, stone: 0, plank: 0, seed: 5, crop: 0 },
    gathered: {}, buildings: [], crops: {}, position: [0, 0], yaw: 0,
    playSeconds: 0, milestones: { crafted: false, built: false, harvested: false },
  };
}

export function buildable(cell) {
  if (!Array.isArray(cell) || cell.length !== 2 || !cell.every(n => whole(n, -8, 8))) return false;
  const point = cell.map(n => n * WORLD.GRID);
  if (Math.hypot(...point) > 14 || Math.hypot(...point) < 2.7) return false;
  if (WORLD.PLOTS.some(p => key(p) === key(cell))) return false;
  return RESOURCES.every(r => distance(point, [r.x, r.z]) >= 2.1);
}

export function validState(s) {
  if (!s || ![1, 2].includes(s.version) || !s.inventory || !s.milestones) return false;
  if (Object.keys(s.inventory).length !== ITEMS.length || !ITEMS.every(i => whole(s.inventory[i], 0, WORLD.STACK_LIMIT))) return false;
  if (!Array.isArray(s.position) || s.position.length !== 2 || !s.position.every(n => finite(n, -17, 17)) || Math.hypot(...s.position) > 17.001) return false;
  if (!finite(s.yaw, -Math.PI, Math.PI) || !finite(s.playSeconds, 0, 315360000)) return false;
  if (!['crafted', 'built', 'harvested'].every(k => typeof s.milestones[k] === 'boolean')) return false;
  if (!s.gathered || Array.isArray(s.gathered) || typeof s.gathered !== 'object') return false;
  if (!Object.entries(s.gathered).every(([id, n]) => RESOURCES.some(r => r.id === id) && whole(n, 0, 3))) return false;
  if (!Array.isArray(s.buildings) || s.buildings.length > WORLD.BUILD_LIMIT) return false;
  const occupied = new Set(), legacyCells = new Set();
  for (const b of s.buildings) {
    if (!b || !Object.hasOwn(s.version === 1 ? WORLD.COSTS : BUILD_RECIPES, b.kind) || !buildable(b.cell) || !whole(b.rotation, 0, 3)) return false;
    if (b.legacy !== undefined && (b.legacy !== true || !['wall', 'fence'].includes(b.kind))) return false;
    const slot = s.version === 1 ? key(b.cell) : buildingSlot(b);
    if (occupied.has(slot)) return false;
    occupied.add(slot);
    if (b.legacy) legacyCells.add(key(b.cell));
  }
  if (s.version === 2) {
    for (const b of s.buildings) {
      if (!b.legacy && legacyCells.has(key(b.cell))) return false;
      if (!b.legacy && PANELS.includes(b.kind) && !hasFloor(s.buildings, b.cell)) return false;
      if (b.kind === 'roof' && !supportedRoof(s.buildings, b.cell)) return false;
    }
  }
  if (!s.crops || typeof s.crops !== 'object' || Array.isArray(s.crops)) return false;
  for (const [id, c] of Object.entries(s.crops)) {
    if (!WORLD.PLOTS.some(p => key(p) === id) || !c || typeof c.watered !== 'boolean' || !finite(c.remaining, 0, WORLD.GROW_SECONDS)) return false;
    if (!c.watered && c.remaining !== WORLD.GROW_SECONDS) return false;
  }
  return true;
}

export class Game {
  constructor(state = newState()) {
    if (!validState(state)) throw new Error('Invalid world state');
    this.state = clone(state);
    if (this.state.version === 1) {
      this.state.version = 2;
      // Old wall/fence centers are retained exactly, not silently moved to edges.
      this.state.buildings = this.state.buildings.map(b => b.kind === 'floor' ? b : { ...b, legacy: true });
    }
  }
  canAfford(cost) { return Object.entries(cost).every(([i, n]) => this.state.inventory[i] >= n); }
  gather(id) {
    const r = RESOURCES.find(r => r.id === id);
    if (!r || distance(this.state.position, [r.x, r.z]) > 2.8 || (this.state.gathered[id] || 0) >= 3 || this.state.inventory[r.kind] >= WORLD.STACK_LIMIT) return false;
    this.state.inventory[r.kind]++;
    this.state.gathered[id] = (this.state.gathered[id] || 0) + 1;
    return true;
  }
  craft() {
    const i = this.state.inventory;
    if (i.wood < 2 || i.plank >= WORLD.STACK_LIMIT) return false;
    i.wood -= 2; i.plank++;
    this.state.milestones.crafted = true;
    return true;
  }
  buildReason(kind, cell, rotation = 0) {
    if (!Object.hasOwn(BUILD_RECIPES, kind) || !buildable(cell)) return 'مكان محجوز أو خارج منطقة البناء';
    if (!whole(rotation, 0, 3)) return 'اتجاه غير صالح';
    if (Math.abs(cell[0]*2-riverX(cell[1]*2))<2.5) return 'اترك مجرى النهر والجسر خاليين';
    const d = distance(this.state.position, cell.map(n => n * WORLD.GRID));
    if (d < 1.5 || d > 4.8) return 'اختر مكانًا أمام الشخصية';
    if (this.state.buildings.length >= WORLD.BUILD_LIMIT) return 'وصلت لحد قطع البناء في النموذج';
    if (this.state.buildings.some(b => b.legacy && key(b.cell) === key(cell))) return 'هنا قطعة محفوظة من النسخة السابقة';
    const candidate = { kind, cell, rotation };
    if (this.state.buildings.some(b => buildingSlot(b) === buildingSlot(candidate))) return 'هذه المساحة أو حافة البناء مشغولة';
    if (PANELS.includes(kind) && !hasFloor(this.state.buildings, cell)) return 'ضع أرضية أولًا، ثم الحائط على حافتها';
    if (kind === 'roof' && !supportedRoof(this.state.buildings, cell)) return 'السقف يحتاج أرضية وحائطين على الأقل';
    if (!this.canAfford(BUILD_RECIPES[kind])) return 'موارد ناقصة — اجمع واصنع ألواحًا';
    return '';
  }
  canBuild(kind, cell, rotation = 0) { return this.buildReason(kind, cell, rotation) === ''; }
  build(kind, cell, rotation) {
    if (!Number.isInteger(rotation)) return false;
    const turn = ((rotation % 4) + 4) % 4;
    if (!this.canBuild(kind, cell, turn)) return false;
    for (const [i, n] of Object.entries(BUILD_RECIPES[kind])) this.state.inventory[i] -= n;
    this.state.buildings.push({ kind, cell: [...cell], rotation: turn });
    this.state.milestones.built = true;
    return true;
  }
  farm(cell) {
    if (!Array.isArray(cell) || cell.length !== 2 || !cell.every(Number.isInteger)) return false;
    if (!WORLD.PLOTS.some(p => key(p) === key(cell)) || distance(this.state.position, cell.map(n => n * WORLD.GRID)) > 2.8) return false;
    const id = key(cell), crop = this.state.crops[id], i = this.state.inventory;
    if (!crop) {
      if (i.seed <= 0) return false;
      i.seed--; this.state.crops[id] = { watered: false, remaining: WORLD.GROW_SECONDS };
      return 'plant';
    }
    if (!crop.watered) { crop.watered = true; return 'water'; }
    if (crop.remaining > 0 || i.crop > WORLD.STACK_LIMIT - 2 || i.seed > WORLD.STACK_LIMIT - 2) return false;
    i.crop += 2; i.seed += 2;
    delete this.state.crops[id];
    this.state.milestones.harvested = true;
    return 'harvest';
  }
  tick(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.state.playSeconds += dt;
    for (const c of Object.values(this.state.crops)) if (c.watered) c.remaining = Math.max(0, c.remaining - dt);
  }
  nearest() {
    let result = null, best = 2.8;
    for (const r of RESOURCES) {
      const d = distance(this.state.position, [r.x, r.z]);
      if (d < best && (this.state.gathered[r.id] || 0) < 3) { best = d; result = { type: 'resource', ...r }; }
    }
    for (const cell of WORLD.PLOTS) {
      const d = distance(this.state.position, cell.map(n => n * WORLD.GRID));
      if (d < best) { best = d; result = { type: 'plot', cell, crop: this.state.crops[key(cell)] }; }
    }
    return result;
  }
  blocked(x, z) {
    if (Math.hypot(x, z) > WORLD.WORLD_RADIUS) return true;
    for (const r of RESOURCES) {
      if ((this.state.gathered[r.id] || 0) >= 3) continue;
      if (distance([x, z], [r.x, r.z]) < (r.kind === 'wood' ? 0.65 : 0.95)) return true;
    }
    for (const b of this.state.buildings) {
      if (b.kind === 'floor' || b.kind === 'roof') continue;
      const a = b.rotation * Math.PI / 2;
      const cx = b.cell[0] * 2 - (b.legacy ? 0 : Math.round(Math.sin(a)));
      const cz = b.cell[1] * 2 - (b.legacy ? 0 : Math.round(Math.cos(a)));
      const dx = Math.abs(x - cx), dz = Math.abs(z - cz);
      const along = b.rotation % 2 === 0 ? dx : dz;
      const across = b.rotation % 2 === 0 ? dz : dx;
      if (b.kind === 'door' && along < 0.27) continue;
      if (along < 1.22 && across < 0.38) return true;
    }
    return false;
  }
  walk(dx, dz) {
    if (![dx, dz].every(Number.isFinite)) return;
    // A stream crossing is shallow wading, not swimming. Bridges restore dry speed.
    if (shallowWater(...this.state.position)) { dx *= 0.55; dz *= 0.55; }
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.15));
    for (let n = 0; n < Math.min(steps, 1000); n++) {
      const [x, z] = this.state.position;
      if (!this.blocked(x + dx / steps, z)) this.state.position[0] += dx / steps;
      if (!this.blocked(this.state.position[0], z + dz / steps)) this.state.position[1] += dz / steps;
    }
  }
}

function parse(text) {
  try { const s = JSON.parse(text); return validState(s) ? s : null; } catch { return null; }
}
export function loadGame(storage) {
  try {
    const primary = storage.getItem(SAVE_KEY), backup = storage.getItem(SAVE_KEY + '.bak');
    const state = parse(primary);
    if (state) return { game: new Game(state), status: 'loaded' };
    const old = parse(backup);
    if (old) return { game: new Game(old), status: 'recovered' };
    return { game: new Game(), status: primary || backup ? 'corrupt' : 'new' };
  } catch { return { game: new Game(), status: 'unavailable' }; }
}
export function saveGame(game, storage) {
  if (!validState(game.state)) return false;
  try {
    const current = storage.getItem(SAVE_KEY);
    if (parse(current)) storage.setItem(SAVE_KEY + '.bak', current);
    storage.setItem(SAVE_KEY, JSON.stringify(game.state));
    return true;
  } catch { return false; }
}
