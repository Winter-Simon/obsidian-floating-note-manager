import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DEFAULT_GLOBAL_HOTKEY,GlobalShortcutController,normalizeHotkey} from "../src/global-hotkey.ts";
import {findMainProcessGlobalShortcut} from "../src/electron-global-hotkey.ts";

test("shortcut parser accepts one or more modifiers and rejects bare keys",()=>{
  assert.equal(DEFAULT_GLOBAL_HOTKEY,"Ctrl+Alt+Space");
  assert.equal(normalizeHotkey(" ctrl + alt + Space "),"Control+Alt+Space");
  assert.equal(normalizeHotkey("Shift+Ctrl+F9"),"Control+Shift+F9");
  assert.equal(normalizeHotkey("CommandOrControl+Alt+N"),"CommandOrControl+Alt+N");
  assert.equal(normalizeHotkey("Alt+W"),"Alt+W");
  assert.equal(normalizeHotkey("alt + w"),"Alt+W");
  assert.equal(normalizeHotkey("Ctrl+N"),"Control+N");
  assert.equal(normalizeHotkey("Shift+F7"),"Shift+F7");
  assert.equal(normalizeHotkey("Super+R"),"Super+R");
  for(const key of ["", "N", "Alt", "Alt+", "+W", "Ctrl+Alt+Delete",
    "Ctrl+Alt+Space+N","Ctrl+Ctrl+Space","Ctrl+CommandOrControl+R",
    "Alt+Shift+Tab","Control+Alt+Space+","Alt+Shift+F13"]) {
    assert.equal(normalizeHotkey(key),null,key);
  }
});

test("opt-in register triggers callback, safe reconfigure and unload own key",()=>{
  const actions=[];
  const bindings=new Map();
  const api={
    register:(key,callback)=>{actions.push("register:"+key);if(bindings.has(key))return false;bindings.set(key,callback);return true;},
    unregister:key=>{actions.push("unregister:"+key);bindings.delete(key);},
    isRegistered:key=>bindings.has(key),
  };
  let invoked=0;
  const ctl=new GlobalShortcutController(()=>api,()=>{invoked++;});
  assert.deepEqual(ctl.configure(false,"Ctrl+Alt+Space"),{ok:false,reason:"disabled"});
  assert.equal(bindings.size,0);
  assert.deepEqual(ctl.configure(true,"Ctrl+Alt+Space"),{ok:true,accelerator:"Control+Alt+Space"});
  bindings.get("Control+Alt+Space")();
  assert.equal(invoked,1);
  assert.deepEqual(ctl.configure(true,"Ctrl+Alt+Space"),{ok:true,accelerator:"Control+Alt+Space"});
  assert.equal(actions.filter(x=>x.startsWith("register:")).length,1);
  assert.deepEqual(ctl.configure(true,"Ctrl+Shift+F9"),{ok:true,accelerator:"Control+Shift+F9"});
  assert.deepEqual([...bindings.keys()],["Control+Shift+F9"]);
  assert.equal(ctl.registered,"Control+Shift+F9");
  ctl.dispose();ctl.dispose();
  assert.equal(bindings.size,0);
  assert.equal(actions.filter(x=>x.startsWith("unregister:")).length,2);
});

test("single-modifier Alt+W registers, invokes and cleans up",()=>{
  let listener;
  const log=[];
  const api={
    register:(key,callback)=>{log.push("register:"+key);listener=callback;return true;},
    unregister:(key)=>log.push("unregister:"+key),
    isRegistered:()=>false,
  };
  let count=0;
  const ctl=new GlobalShortcutController(()=>api,()=>count++);
  assert.deepEqual(ctl.configure(true,"Alt+W"),{ok:true,accelerator:"Alt+W"});
  listener();
  assert.equal(count,1);
  ctl.dispose();
  assert.deepEqual(log,["register:Alt+W","unregister:Alt+W"]);
});

test("occupied combination or unavailable main-process bridge preserves the old binding",()=>{
  const shortcuts=new Map();
  let fail=false;
  const api={
    register:(k,c)=>{if(fail)return false;shortcuts.set(k,c);return true;},
    unregister:k=>shortcuts.delete(k),
    isRegistered:k=>k==="Control+Alt+X"||shortcuts.has(k),
  };
  const ctl=new GlobalShortcutController(()=>api,()=>{});
  assert.equal(ctl.configure(true,"Ctrl+Alt+Space").ok,true);
  assert.deepEqual(ctl.configure(true,"Ctrl+Alt+X"),{ok:false,reason:"occupied"});
  fail=true;
  assert.deepEqual(ctl.configure(true,"Ctrl+Alt+Y"),{ok:false,reason:"occupied"});
  assert.equal(ctl.registered,"Control+Alt+Space");
  assert.deepEqual(ctl.configure(true,"not a shortcut"),{ok:false,reason:"invalid"});
  assert.equal(ctl.registered,"Control+Alt+Space");
  ctl.dispose();
  const missing=new GlobalShortcutController(()=>null,()=>{});
  assert.deepEqual(missing.configure(true,"Ctrl+Alt+Space"),{ok:false,reason:"unavailable"});
});

test("global shortcut bridge uses only remote MAIN-process API",()=>{
  const api={register:()=>true,unregister:()=>{}};
  const win={require:(name)=>{
    if(name==="@electron/remote")return {globalShortcut:api};
    throw Error("unexpected");
  }};
  assert.equal(findMainProcessGlobalShortcut(win),api);
  const remoteViaRequire={require:name=>name==="electron"?{globalShortcut:api}:null};
  const parent={electron:{remote:remoteViaRequire}};
  assert.equal(findMainProcessGlobalShortcut(parent),api);
  // Merely importing renderer electron.globalShortcut must never be enough.
  const bad={require:name=>name==="electron"?{globalShortcut:api}:{}};
  assert.equal(findMainProcessGlobalShortcut(bad),null);
});

test("global hotkey must never restore or focus the main Obsidian window",()=>{
  const main=readFileSync(new URL("../src/main.ts",import.meta.url),"utf8");
  const adapter=readFileSync(new URL("../src/electron-global-hotkey.ts",import.meta.url),"utf8");
  assert.doesNotMatch(main,/activateObsidianMain/);
  assert.doesNotMatch(adapter,/activateObsidianMain|\.restore\(|main\.focus\(/);
  assert.match(main,/void this\.showGlobalPicker\(\)/);
  assert.match(main,/this\.app\.workspace\.openPopoutLeaf\(/);
  assert.match(main,/leaf\.setViewState\(\{type:GLOBAL_PICKER_VIEW_TYPE/);
});

test("no application-wide unregisterAll and normal Obsidian commands remain",()=>{
  const source=readFileSync(new URL("../src/global-hotkey.ts",import.meta.url),"utf8");
  const main=readFileSync(new URL("../src/main.ts",import.meta.url),"utf8");
  const settings=readFileSync(new URL("../src/settings.ts",import.meta.url),"utf8");
  assert.doesNotMatch(source,/\.unregisterAll\s*\(/);
  assert.match(main,/id:"open-manager"/);
  assert.match(main,/id:"recall-recent"/);
  assert.match(main,/this\.globalHotkey\?\.dispose\(\)/);
  assert.match(settings,/globalHotkeyEnabled:false/);
});
