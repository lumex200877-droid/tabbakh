import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, WORLD, SAVE_KEY, newState, validState, buildable, loadGame, saveGame, clone, BUILD_RECIPES } from '../model.js';

const storage = () => {
  const data = new Map();
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
};
const byTree = game => { game.state.position = [WORLD.TREES[0][0] + 1, WORLD.TREES[0][1]]; };
const byPlot = game => { game.state.position = WORLD.PLOTS[0].map(n => n * 2); };

test('a fresh game has five seeds, no currency and valid state', () => {
  const g = new Game(); assert.equal(g.state.inventory.seed, 5); assert.equal(validState(g.state), true);
});
test('gathering enforces range and resource identity', () => {
  const g = new Game(); assert.equal(g.gather('tree_0'), false); assert.equal(g.gather('tree_999'), false);
  byTree(g); assert.equal(g.gather('tree_0'), true); assert.equal(g.state.inventory.wood, 1);
});
test('resources deplete after three interactions', () => {
  const g = new Game(); byTree(g);
  for (let i = 0; i < 3; i++) assert.equal(g.gather('tree_0'), true);
  assert.equal(g.gather('tree_0'), false); assert.equal(g.state.inventory.wood, 3);
});
test('full stacks never consume a resource or crafting input', () => {
  const g = new Game(); byTree(g); g.state.inventory.wood = 999;
  assert.equal(g.gather('tree_0'), false); assert.equal(g.state.gathered.tree_0, undefined);
  g.state.inventory.plank = 999; assert.equal(g.craft(), false); assert.equal(g.state.inventory.wood, 999);
});
test('crafting charges exactly two wood and records milestone', () => {
  const g = new Game(); assert.equal(g.craft(), false); g.state.inventory.wood = 2;
  assert.equal(g.craft(), true); assert.equal(g.state.inventory.wood, 0); assert.equal(g.state.inventory.plank, 1);
  assert.equal(g.state.milestones.crafted, true);
});
test('build validation reserves spawn, farms, resources and world edges', () => {
  for (const cell of [[0, 0], WORLD.PLOTS[0], [99, 0], [1.5, 2], null]) assert.equal(buildable(cell), false);
  assert.equal(buildable([3, 1]), true);
});
test('building requires resources, range, unique slot, and charges once', () => {
  const g = new Game(); g.state.position = [3, 2];
  assert.equal(g.build('floor', [3, 1], 0), false);
  g.state.inventory.plank = 4; g.state.inventory.stone = 3;
  assert.equal(g.build('floor', [3, 1], 5), true);
  assert.equal(g.state.inventory.plank, 2); assert.equal(g.state.inventory.stone, 2);
  assert.equal(g.state.buildings[0].rotation, 1);
  assert.equal(g.build('floor', [3, 1], 0), false); assert.equal(g.state.inventory.plank, 2);
  assert.equal(g.build('wall', [3, 1], 0), true); assert.equal(g.state.inventory.plank, 1);
  assert.equal(g.build('wall', [3, 1], 0), false);
  g.state.position = [-10, 0]; assert.equal(g.build('floor', [3, 2], 0), false);
});
test('farming requires proximity, seed, watering and active-play growth', () => {
  const g = new Game(), cell = WORLD.PLOTS[0];
  assert.equal(g.farm(null), false); assert.equal(g.farm(cell), false); byPlot(g);
  assert.equal(g.farm(cell), 'plant'); assert.equal(g.state.inventory.seed, 4);
  g.tick(40); assert.equal(g.state.crops[cell.join(',')].remaining, 30);
  assert.equal(g.farm(cell), 'water'); g.tick(29); assert.equal(g.farm(cell), false);
  g.tick(-100); g.tick(NaN); assert.equal(g.state.crops[cell.join(',')].remaining, 1);
  g.tick(1); assert.equal(g.farm(cell), 'harvest');
  assert.equal(g.state.inventory.crop, 2); assert.equal(g.state.inventory.seed, 6);
  assert.equal(g.state.milestones.harvested, true);
});
test('full inventory preserves a ripe crop', () => {
  const g = new Game(); byPlot(g); g.farm(WORLD.PLOTS[0]); g.farm(WORLD.PLOTS[0]); g.tick(30);
  g.state.inventory.crop = 999;
  assert.equal(g.farm(WORLD.PLOTS[0]), false); assert.equal(Object.keys(g.state.crops).length, 1);
});
test('walking slides around obstacles and cannot leave island or tunnel through a wall', () => {
  const g = new Game(); g.walk(100, 0); assert.ok(Math.hypot(...g.state.position) <= 17);
  g.state.position = [6, -1]; g.state.buildings.push({ kind: 'wall', cell: [3, 1], rotation: 0 });
  g.walk(0, 6); assert.ok(g.state.position[1] < 1.6);
  const before = [...g.state.position]; g.walk(NaN, 1); assert.deepEqual(g.state.position, before);
});
test('validation rejects malformed, non-finite and unsupported saves', () => {
  for (const s of [null, [], {}, { version: 2 }]) assert.equal(validState(s), false);
  const mutations = [
    s => { s.inventory.seed = -1; }, s => { s.inventory.wood = 0.5; },
    s => { s.yaw = Infinity; }, s => { s.position = [17, 17]; },
    s => { s.gathered.tree_999 = 1; }, s => { s.crops.unknown = { watered: true, remaining: 0 }; },
    s => { s.buildings = [{ kind: 'floor', cell: [3, 1], rotation: 0 }, { kind: 'floor', cell: [3, 1], rotation: 0 }]; },
    s => { s.crops[WORLD.PLOTS[0].join(',')] = { watered: false, remaining: 0 }; },
  ];
  for (const mutate of mutations) { const s = newState(); mutate(s); assert.equal(validState(s), false); }
});
test('constructor and serialization never alias caller state', () => {
  const s = newState(), g = new Game(s); s.inventory.wood = 99; assert.equal(g.state.inventory.wood, 0);
  assert.equal(validState(clone(g.state)), true);
});
test('browser storage saves newest state and recovers previous good state', () => {
  const st = storage(), g = new Game(); assert.equal(loadGame(st).status, 'new');
  saveGame(g, st); byTree(g); g.gather('tree_0'); saveGame(g, st);
  assert.equal(loadGame(st).game.state.inventory.wood, 1);
  st.setItem(SAVE_KEY, '{broken');
  const recovered = loadGame(st); assert.equal(recovered.status, 'recovered'); assert.equal(recovered.game.state.inventory.wood, 0);
  saveGame(recovered.game, st); assert.ok(JSON.parse(st.getItem(SAVE_KEY + '.bak')));
});
test('both corrupt files are reported and never automatically overwritten on load', () => {
  const st = storage(); st.setItem(SAVE_KEY, 'bad'); st.setItem(SAVE_KEY + '.bak', 'bad');
  assert.equal(loadGame(st).status, 'corrupt'); assert.equal(st.getItem(SAVE_KEY), 'bad');
});
test('denied or full storage is recoverable and never reports a successful save', () => {
  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  assert.equal(loadGame(denied).status, 'unavailable'); assert.equal(saveGame(new Game(), denied), false);
  const st = storage(), g = new Game(); saveGame(g, st); const before = st.getItem(SAVE_KEY);
  g.state.inventory.wood = -1; assert.equal(saveGame(g, st), false); assert.equal(st.getItem(SAVE_KEY), before);
});


test('a complete walk-in house layers floor, four distinct edges and a roof', () => {
  const g = new Game(); g.state.position = [3, 2];
  g.state.inventory = {wood: 2, plank: 8, stone: 4, seed: 5, crop: 0};
  const cell = [3, 1];
  assert.equal(g.build('wall', cell, 0), false, 'unsupported wall');
  assert.equal(g.build('roof', cell, 0), false, 'unsupported roof');
  for(const [kind, turn] of [['floor',0],['wall',0],['wall',1],['window',2],['door',3],['roof',0]]) {
    assert.equal(g.build(kind,cell,turn),true, `${kind} can be placed`);
    assert.equal(validState(g.state),true, `${kind} serializes correctly`);
  }
  assert.equal(g.state.buildings.length,6);
  const loaded = new Game(clone(g.state)); assert.deepEqual(loaded.state,g.state);
  // The east doorway is traversable, while its jamb and the north wall collide.
  assert.equal(g.blocked(7,2),false); assert.equal(g.blocked(7,2.6),true); assert.equal(g.blocked(6,1),true);
  assert.equal(Object.keys(BUILD_RECIPES).length,6);
});
test('shared neighboring edges cannot be double-charged or duplicated', () => {
  const g = new Game();g.state.position=[3,0];g.state.inventory.plank=30;g.state.inventory.stone=30;
  assert.equal(g.build('floor',[3,1],0),true);assert.equal(g.build('floor',[3,0],0),true);
  assert.equal(g.build('wall',[3,1],0),true);
  const before=clone(g.state.inventory);
  assert.equal(g.build('window',[3,0],2),false);assert.deepEqual(g.state.inventory,before);
});
test('version one saves migrate without moving or losing old walls and fences', () => {
  const old = newState(); old.version=1;old.inventory.wood=7;
  old.buildings=[{kind:'wall',cell:[3,1],rotation:0},{kind:'fence',cell:[-2,-2],rotation:1}];
  assert.equal(validState(old),true);
  const g=new Game(old);assert.equal(g.state.version,2);assert.equal(g.state.inventory.wood,7);
  assert.ok(g.state.buildings.every(b=>b.legacy));assert.deepEqual(g.state.buildings[0].cell,[3,1]);
  assert.equal(g.blocked(6,2),true);assert.equal(validState(g.state),true);
  const st=storage();assert.equal(saveGame(g,st),true);assert.deepEqual(loadGame(st).game.state,g.state);
});
test('unsupported roofs, walls, duplicate edges and unknown parts reject corrupt saves', () => {
  const floor={kind:'floor',cell:[3,1],rotation:0},wall={kind:'wall',cell:[3,1],rotation:0};
  for(const buildings of [[wall],[floor,{...wall,kind:'roof'}],[floor,wall,{...wall,kind:'window'}],[{...floor,kind:'castle'}]]) {
    const s=newState();s.buildings=buildings;assert.equal(validState(s),false);
  }
});
