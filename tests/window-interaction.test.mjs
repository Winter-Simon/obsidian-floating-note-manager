import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {navigateIndex,pickerKeyboardAction} from "../src/keyboard-selection.ts";
import {matchWindowByBounds} from "../src/geometry.ts";
import {nativeFromChildWindow,nativeFromWorkspaceEvent,resolveNativeForChild,readManagedBounds,restoreNativeBoundsBeforeEditor,temporarilyHideNativePopout} from "../src/electron-adapter.ts";

test("selected note is visually distinct from hover and no post-open setBounds exists",()=>{
  const css=readFileSync(new URL("../styles.css",import.meta.url),"utf8");
  const windows=readFileSync(new URL("../src/window-manager.ts",import.meta.url),"utf8");
  assert.match(css,/\.fnm-manager \.fnm-row\.fnm-selected,/);
  assert.match(css,/--fnm-selected-bg: color-mix\(in srgb, var\(--interactive-accent\) 24%/);
  assert.match(css,/\.fnm-manager \.fnm-row:hover \{background: var\(--background-modifier-hover\);\}/);
  const beforeEditor=windows.slice(0,windows.indexOf("await leaf.openFile(file"));
  const afterEditor=windows.slice(windows.indexOf("await leaf.openFile(file"),
    windows.indexOf("private prepareInitialGeometry("));
  assert.match(beforeEditor,/this\.prepareInitialGeometry\(/);
  assert.doesNotMatch(afterEditor,/\.setBounds\s*\(/);
  assert.match(windows,/restoreNativeBoundsBeforeEditor\(native,desired\)/);
});

test("recalled popout hide occurs before note loading and show after setup, with error recovery",()=>{
  const source=readFileSync(new URL("../src/window-manager.ts",import.meta.url),"utf8");
  const start=source.indexOf("private async createPopout(");
  const end=source.indexOf("private prepareInitialGeometry(",start);
  const openFlow=source.slice(start,end);
  const hide=openFlow.indexOf("if(saved) revealWindow=temporarilyHideNativePopout(preparedNative)");
  const render=openFlow.indexOf("await leaf.openFile(file");
  const pin=openFlow.indexOf("this.pin(file.path, true, false)");
  const reveal=openFlow.indexOf("revealWindow?.();",pin);
  const errorRecovery=openFlow.indexOf("revealWindow?.();",reveal+1);
  assert.ok(hide>=0&&render>hide&&pin>render&&reveal>pin&&errorRecovery>reveal);
  assert.match(openFlow,/if\(!revealWindow && saved\)/);
});

test("early workspace window event reveals the exact child and rejects the main window",()=>{
  const parent={};
  const native={getBounds:()=>({x:2,y:3,width:400,height:500}),setAlwaysOnTop:()=>{}};
  const child={electronWindow:native};
  assert.equal(nativeFromWorkspaceEvent({win:child},child,parent),native);
  assert.equal(nativeFromWorkspaceEvent({win:child},parent,parent),null);
  assert.equal(nativeFromWorkspaceEvent({win:parent},child,parent),null);
});
test("native popout resolves directly from own electronWindow even when bounds lookup is unavailable",()=>{
  const native={
    getBounds:()=>({x:10,y:10,width:238,height:610}),
    setAlwaysOnTop:()=>{},hide:()=>{},show:()=>{},
    isDestroyed:()=>false,
  };
  const main={closed:false,electronWindow:{getBounds:()=>({}),setAlwaysOnTop:()=>{}}};
  const child={closed:false,electronWindow:native};
  assert.equal(nativeFromChildWindow(child,main),native);
  assert.equal(resolveNativeForChild(child,main).native,native);
  assert.equal(nativeFromChildWindow(main,main),null);
  assert.equal(nativeFromChildWindow({...child,electronWindow:main.electronWindow},main),null);
  assert.equal(nativeFromChildWindow({...child,closed:true},main),null);
  assert.equal(nativeFromChildWindow({...child,electronWindow:{...native,isDestroyed:()=>true}},main),null);
});
test("Esc rebind attempts direct child native handle and only warns once",()=>{
  const windows=readFileSync(new URL("../src/window-manager.ts",import.meta.url),"utf8");
  const section=windows.slice(windows.indexOf("  hide(path:string):boolean"),windows.indexOf("  private reveal(state:PopoutState)"));
  assert.match(section,/nativeFromChildWindow\(state\.win,this\.mainWindow\)/);
  assert.match(section,/this\.adoptNative\(state,exact\)/);
  assert.match(section,/resolveNativeForChild\(state\.win,this\.mainWindow\)/);
  assert.match(section,/if\(!state\.hideErrorReported\)/);
  assert.match(windows,/if\(this\.hide\(state\.path\)\) event\.preventDefault\(\)/);
});

test("new-window interception precedes openPopoutLeaf and is disposed synchronously",()=>{
  const source=readFileSync(new URL("../src/window-manager.ts",import.meta.url),"utf8");
  const start=source.indexOf("private async createPopout(");
  const end=source.indexOf("private prepareInitialGeometry(",start);
  const flow=source.slice(start,end);
  const subscribe=flow.indexOf('this.app.workspace.on("window-open"');
  const create=flow.indexOf("leaf=this.app.workspace.openPopoutLeaf(");
  const unsubscribe=flow.indexOf("this.app.workspace.offref(handle)");
  const render=flow.indexOf("await leaf.openFile(file");
  assert.ok(subscribe>=0&&create>subscribe&&unsubscribe>create&&render>unsubscribe);
  assert.match(flow,/nativeFromWorkspaceEvent\(workspaceWindow,domWindow,mainWindow\)/);
});

test("native frame remains hidden through initialization and is revealed exactly once",()=>{
  const events=[];
  let visible=true;
  let current={x:10,y:20,width:700,height:600};
  const native={
    hide:()=>{events.push("hide");visible=false;},
    show:()=>{events.push("show");visible=true;},
    isVisible:()=>visible,
    isDestroyed:()=>false,
    setAlwaysOnTop:()=>{},
    getBounds:()=>({...current}),
    setMinimumSize:()=>events.push("minimum"),
    setBounds:(b)=>{events.push("bounds");current={...b};},
  };
  const reveal=temporarilyHideNativePopout(native);
  assert.equal(typeof reveal,"function");
  const desired={x:10,y:20,width:238,height:600};
  const result=restoreNativeBoundsBeforeEditor(native,desired);
  assert.deepEqual(result.actual,desired);
  assert.equal(visible,false);
  reveal();reveal();
  assert.equal(visible,true);
  assert.deepEqual(events,["hide","minimum","bounds","show"]);
});
test("reveal handles an initially hidden window and unavailable native controls",()=>{
  let showCount=0;
  const native={hide:()=>{},show:()=>{showCount++;},isVisible:()=>false,setAlwaysOnTop:()=>{},getBounds:()=>({x:0,y:0,width:1,height:1})};
  const reveal=temporarilyHideNativePopout(native);
  assert.equal(typeof reveal,"function");
  reveal();reveal();
  assert.equal(showCount,1);
  assert.equal(temporarilyHideNativePopout({...native,show:undefined}),null);
});

test("opacity curtain hides the entire OS frame without interfering with show/focus",()=>{
  let opacity=0.8;
  const changes=[];
  const native={
    getBounds:()=>({x:0,y:0,width:600,height:400}),
    setAlwaysOnTop:()=>{},getOpacity:()=>opacity,
    setOpacity:(value)=>{opacity=value;changes.push(value);},
    hide:()=>{throw Error("hide should never be called");},
    show:()=>{throw Error("show should never be called");},
  };
  const reveal=temporarilyHideNativePopout(native);
  assert.equal(opacity,0);
  reveal();
  reveal();
  assert.deepEqual(changes,[0,0.8]);
  assert.equal(opacity,0.8);
});

test("native narrow restore lowers minimum before applying bounds",()=>{
  const events=[];
  let bounds={x:615,y:92,width:700,height:610};
  let minWidth=700;
  const native={
    getBounds:()=>({...bounds}),
    setAlwaysOnTop:()=>{},
    setMinimumSize:(w,h)=>{events.push("minimum");minWidth=w;},
    setBounds:(next)=>{
      events.push("bounds");
      bounds={...next,width:Math.max(minWidth,next.width)};
    },
  };
  const desired={x:535,y:92,width:365,height:610};
  const result=restoreNativeBoundsBeforeEditor(native,desired);
  assert.deepEqual(events,["minimum","bounds"]);
  assert.deepEqual(result.initial,{x:615,y:92,width:700,height:610});
  assert.deepEqual(result.actual,desired);
  assert.equal(result.corrected,true);
  events.length=0;
  assert.equal(restoreNativeBoundsBeforeEditor(native,desired).corrected,false);
  assert.deepEqual(events,["minimum"]);
});

test("native bounds win over delayed DOM dimensions after rapid resizing",()=>{
  const dom={x:626,y:117,width:700,height:609};
  const narrow={x:626,y:117,width:238,height:609};
  const native={getBounds:()=>narrow,setAlwaysOnTop:()=>{},isDestroyed:()=>false};
  assert.deepEqual(readManagedBounds(dom,native),narrow);
  assert.deepEqual(readManagedBounds(dom,{...native,isDestroyed:()=>true}),dom);
  assert.deepEqual(readManagedBounds(dom,{...native,getBounds:()=>{throw Error("closed");}}),dom);
});
test("post-open restoration completes before observers and persistence",()=>{
  const windows=readFileSync(new URL("../src/window-manager.ts",import.meta.url),"utf8");
  const after=windows.slice(windows.indexOf("await leaf.openFile(file"));
  const correction=after.indexOf("this.prepareInitialGeometry(state.native,desired,file.path)");
  const listeners=after.indexOf('win.addEventListener("resize", state.geometryHandler)');
  const persisting=after.indexOf("state.initializing = false");
  assert.ok(correction>=0&&listeners>correction&&persisting>listeners);
  assert.match(after,/state\.restorationMismatch = !sameBounds\(state\.lastObserved,desired\)/);
});

test("arrow keys traverse and wrap around a searchable result list", () => {
  assert.equal(navigateIndex(0, 3, 1), 1);
  assert.equal(navigateIndex(1, 3, 1), 2);
  assert.equal(navigateIndex(2, 3, 1), 0);
  assert.equal(navigateIndex(0, 3, -1), 2);
  assert.equal(navigateIndex(2, 3, -1), 1);
  assert.equal(navigateIndex(7, 0, 1), 0);
});

test("arrow navigation reaches recent rows even with new-scratch toolbar focused",()=>{
  assert.equal(pickerKeyboardAction("ArrowDown","toolbar",false,false),"next");
  assert.equal(pickerKeyboardAction("ArrowUp","modal",false,false),"previous");
  assert.equal(pickerKeyboardAction("Enter","toolbar",false,false),null);
  assert.equal(pickerKeyboardAction("Enter","toolbar",false,true),"activate");
  assert.equal(pickerKeyboardAction("Enter","search",false,false),"activate");
  assert.equal(pickerKeyboardAction("ArrowDown","search",true,false),null);
  assert.equal(pickerKeyboardAction("ArrowDown","other-input",false,true),null);
  assert.equal(pickerKeyboardAction("ArrowDown","outside",false,true),null);
});

test("electron popout matching identifies the unique child by screen bounds", () => {
  const main = {id:1,getBounds:() => ({x:0,y:0,width:1500,height:900})};
  const child = {id:2,getBounds:() => ({x:240,y:170,width:420,height:660})};
  assert.equal(matchWindowByBounds([main, child], {x:241,y:172,width:422,height:659}),child);
  assert.equal(matchWindowByBounds([main],{x:241,y:172,width:422,height:659}),null);
  const duplicate = {id:3,getBounds:child.getBounds};
  assert.equal(matchWindowByBounds([main,child,duplicate],child.getBounds()),null);
  assert.equal(matchWindowByBounds([child],undefined),null);
});
