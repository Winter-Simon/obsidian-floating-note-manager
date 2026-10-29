import test from "node:test";
import assert from "node:assert/strict";
import {DEFAULT_WINDOW_SIZE,placeBounds,validBounds,sameBounds,selectDisplay} from "../src/geometry.ts";

test("new compact window centered at 420 × 660 on a normal screen",()=>{
  assert.deepEqual(placeBounds(undefined,{x:0,y:0,width:1920,height:1040}),
    {x:750,y:190,width:420,height:660});
  assert.deepEqual(DEFAULT_WINDOW_SIZE,{width:420,height:660});
});
test("remembered window bounds are reused when visible",()=>{
  assert.deepEqual(placeBounds({x:300,y:180,width:720,height:480},
    {x:0,y:0,width:1600,height:900}),{x:300,y:180,width:720,height:480});
});
test("disconnected display coordinates get recentered",()=>{
  assert.deepEqual(placeBounds({x:2500,y:300,width:720,height:480},
    {x:0,y:0,width:1600,height:900}),{x:440,y:210,width:720,height:480});
});
test("small screens constrain the size",()=>{
  const b=placeBounds({x:0,y:0,width:1600,height:1200},{x:0,y:0,width:680,height:510});
  assert.deepEqual(b,{x:0,y:0,width:680,height:510});
});
test("new notes center; narrow resized bounds survive; offscreen notes recenter",()=>{
  const main={x:100,y:40,width:1200,height:780};
  assert.deepEqual(placeBounds(undefined,main),{x:490,y:100,width:420,height:660});
  assert.deepEqual(placeBounds({x:260,y:130,width:235,height:300},main),
    {x:260,y:130,width:235,height:300});
  assert.deepEqual(placeBounds({x:260,y:130,width:90,height:200},main),
    {x:260,y:130,width:90,height:200});
  assert.deepEqual(placeBounds({x:260,y:130,width:38,height:79},main),
    {x:260,y:130,width:38,height:79});
  assert.deepEqual(placeBounds({x:-3000,y:130,width:420,height:660},main),
    {x:490,y:100,width:420,height:660});
});
test("partly clipped narrow window preserves its width while moving onscreen",()=>{
  const visible={x:0,y:0,width:900,height:800};
  const narrow={x:700,y:100,width:365,height:610};
  assert.deepEqual(placeBounds(narrow,visible),
    {x:535,y:100,width:365,height:610});
  // A fully disconnected window is centered; its dimensions remain unchanged.
  assert.deepEqual(placeBounds({...narrow,x:1900},visible),
    {x:268,y:95,width:365,height:610});
});

test("any positive native size retains exact saved geometry without plugin minima",()=>{
  const area={x:0,y:0,width:1600,height:1000};
  for(const [w,h] of [[1,1],[28,34],[92,161],[375,602],[1599,984]]) {
    const saved={x:0,y:0,width:w,height:h};
    assert.deepEqual(validBounds(saved),saved);
    assert.deepEqual(placeBounds(saved,area),saved);
  }
});

test("connected monitor selection restores notes on second display",()=>{
  const a={x:0,y:0,width:1920,height:1040};
  const b={x:1920,y:0,width:1280,height:720};
  assert.deepEqual(selectDisplay({x:2200,y:60,width:420,height:500},[a,b],a),b);
  assert.deepEqual(selectDisplay({x:6000,y:60,width:420,height:500},[a,b],a),a);
  assert.deepEqual(selectDisplay(undefined,[a,b],a),a);
});

test("real size/position changes are detected without redundant writes",()=>{
  const saved={x:520,y:160,width:420,height:660};
  assert.equal(sameBounds(saved,{...saved}),true);
  assert.equal(sameBounds(saved,{...saved,width:430}),false);
  assert.equal(sameBounds(saved,{...saved,x:522}),false);
  assert.equal(sameBounds(undefined,saved),false);
});

test("invalid stored bounds never reach native window API",()=>{
  for (const raw of [null,undefined,{x:0,y:0,width:NaN,height:400},
    {x:0,y:0,width:0,height:10},{x:Infinity,y:0,width:600,height:500},
    {x:1e7,y:0,width:600,height:500}]) assert.equal(validBounds(raw),undefined);
  assert.deepEqual(validBounds({x:10.4,y:22.7,width:801.3,height:550.9}),
    {x:10,y:23,width:801,height:551});
});
