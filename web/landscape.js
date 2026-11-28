// Shared geometry rules: renderer, feet, shallow-water speed and construction
// all sample these same functions. The simulation remains a small bounded valley.
export const WATER_Y = 0.035;
export const BRIDGES = [0, -11];
export const riverX = z => 9.6 + Math.sin(z * 0.14) * 1.7;
export const riverWidth = z => 1.25 + Math.sin(z * 0.21 + 1) * 0.15;
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = v => { const t = clamp(v, 0, 1); return t * t * (3 - 2 * t); };

export function heightAt(x, z) {
  const r = Math.hypot(x, z);
  let h = 0.35 + Math.sin(x * 0.2) * Math.sin(z * 0.16) * 0.62
    + Math.cos(z * 0.22 + x * 0.08) * 0.18;
  // A gently levelled meadow protects the four existing crop plots.
  const garden = 1 - smooth(Math.max(Math.abs(x - 3) / 4, Math.abs(z - 5) / 4) - 0.5);
  h = h * (1 - garden) + 0.4 * garden;
  // Beyond the playable meadow the valley rises into wooded hills.
  h += smooth((r - 16) / 20) * (4.2 + Math.sin(x * 0.07 - z * 0.06) * 2.0);
  h += Math.exp(-((x + 24) ** 2 + (z + 22) ** 2) / 200) * 7;
  h += Math.exp(-((x - 30) ** 2 + (z + 35) ** 2) / 300) * 10;
  const d = Math.abs(x - riverX(z));
  // A broad river valley eases distant hills down to the banks; avoid carving
  // vertical cliff faces where the stream runs through the background hills.
  const approach = smooth((d - riverWidth(z) - 0.5) / 5);
  h = Math.min(h, 0.55 + (h + 0.5) * approach);
  const bed = 1 - smooth((d - riverWidth(z) * 0.72) / 0.95);
  return h * (1 - bed) - 0.38 * bed;
}
export function onBridge(x, z) {
  return BRIDGES.some(bz => Math.abs(z - bz) < 0.88 && Math.abs(x - riverX(bz)) < 2.65);
}
export function shallowWater(x, z) {
  return !onBridge(x, z) && Math.abs(x - riverX(z)) < riverWidth(z);
}
export function groundForFeet(x, z) {
  if (onBridge(x, z)) return 0.56;
  return heightAt(x, z);
}
export function foundationHeight(cell) {
  const x = cell[0] * 2, z = cell[1] * 2;
  return Math.max(...[-1, 1].flatMap(dx => [-1, 1].map(dz => heightAt(x + dx, z + dz)))) + 0.12;
}
