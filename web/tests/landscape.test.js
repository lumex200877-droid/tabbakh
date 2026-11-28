import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heightAt, riverX, groundForFeet, shallowWater, foundationHeight } from '../landscape.js';
import { Game } from '../model.js';
test('valley terrain is finite and repeatable across the world',()=>{
  for(let x=-80;x<=80;x+=2)for(let z=-80;z<=80;z+=2){assert.ok(Number.isFinite(heightAt(x,z)));assert.equal(heightAt(x,z),heightAt(x,z));}
});
test('river has a carved bed and bridges give dry footing',()=>{
  assert.ok(heightAt(riverX(4),4)<0);
  assert.equal(shallowWater(riverX(4),4),true);
  assert.equal(shallowWater(riverX(0),0),false);
  assert.equal(groundForFeet(riverX(0),0),.56);
  assert.ok(foundationHeight([3,1])>=heightAt(6,2));
});
test('wading slows motion but crossing the bridge keeps normal speed',()=>{
  const wet=new Game(),dry=new Game();wet.state.position=[riverX(4),4];dry.state.position=[riverX(0),0];
  const a=wet.state.position[0],b=dry.state.position[0];wet.walk(.1,0);dry.walk(.1,0);
  assert.ok(wet.state.position[0]-a<dry.state.position[0]-b);
  wet.state.position=[6,4];assert.equal(wet.canBuild('floor',[5,2],0),false);
});
