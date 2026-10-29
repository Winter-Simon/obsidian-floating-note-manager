import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {hideCachedWindow,showCachedWindow,hiddenEvictionPaths} from "../src/window-cache.ts";
import {centerSavedSize} from "../src/geometry.ts";

test("Esc/X cache hides native frame but never calls close, hot recall shows same instance",()=>{
  const events=[];
  let hidden=false;
  const native={
    hide:()=>{hidden=true;events.push("hide");},
    show:()=>{hidden=false;events.push("show");},
    focus:()=>events.push("focus"),
    close:()=>events.push("close"),
    isDestroyed:()=>false,
  };
  assert.equal(hideCachedWindow(native),true);
  assert.equal(hidden,true);
  assert.deepEqual(events,["hide"]);
  assert.equal(showCachedWindow(native),true);
  assert.deepEqual(events,["hide","show","focus"]);
  assert.equal(hidden,false);
  assert.equal(events.includes("close"),false);
});

test("unsupported or destroyed native child never becomes invisibly cached",()=>{
  assert.equal(hideCachedWindow(undefined),false);
  assert.equal(hideCachedWindow({hide:()=>{},isDestroyed:()=>true}),false);
  assert.equal(showCachedWindow({show:()=>{throw Error("no");}}),false);
});

test("never tuck a window without a way to show it again, and verify hide response",()=>{
  let visible=true;
  const native={
    hide:()=>{visible=false;},show:()=>{visible=true;},isVisible:()=>visible,
  };
  assert.equal(hideCachedWindow(native),true);
  assert.equal(visible,false);
  assert.equal(showCachedWindow(native),true);
  assert.equal(visible,true);
  assert.equal(hideCachedWindow({hide:()=>{}}),false);
  assert.equal(hideCachedWindow({hide:()=>{},show:()=>{},isVisible:()=>true}),false);
  assert.equal(showCachedWindow({show:()=>{},focus:()=>{throw Error("focus");}}),true);
});

test("LRU evicts oldest hidden windows, not visible notes",()=>{
  const windows=[
    {path:"a",hidden:true,hiddenOrder:1},
    {path:"b",hidden:false,hiddenOrder:0},
    {path:"c",hidden:true,hiddenOrder:3},
    {path:"d",hidden:true,hiddenOrder:2},
  ];
  assert.deepEqual(hiddenEvictionPaths(windows,2),["a"]);
  assert.deepEqual(hiddenEvictionPaths(windows,1),["a","d"]);
  assert.deepEqual(hiddenEvictionPaths(windows,5),[]);
});

test("cold open centers saved size and discards historical window coordinates",()=>{
  const area={x:0,y:0,width:1480,height:900};
  assert.deepEqual(centerSavedSize({x:1200,y:-920,width:238,height:609},area),
    {x:621,y:146,width:238,height:609});
  assert.deepEqual(centerSavedSize({x:10,y:20,width:238,height:609},area),
    {x:621,y:146,width:238,height:609});
});

test("UI wiring: titlebar and Esc tuck, cached instances clean up without footer control",()=>{
  const windows=readFileSync(new URL("../src/window-manager.ts",import.meta.url),"utf8");
  const manager=readFileSync(new URL("../src/manager-modal.ts",import.meta.url),"utf8");
  assert.match(windows,/this\.closePermanently\(state\.path\)/);
  assert.match(windows,/this\.hide\(state\.path\)/);
  assert.match(windows,/native\.on\("close",callback\)/);
  assert.doesNotMatch(windows,/destroy\.textContent="彻底关闭"/);
  assert.match(windows,/this\.closePermanently\(path\)/);
  assert.match(manager,/if\(tucked\.length\) this\.addGroup\("已收起",tucked\)/);
  assert.match(windows,/if\(existing\.hidden&&!this\.reveal\(existing\)\)/);
});
