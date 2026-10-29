import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const main=readFileSync(new URL("../src/main.ts",import.meta.url),"utf8");
const picker=readFileSync(new URL("../src/global-picker-view.ts",import.meta.url),"utf8");
const adapter=readFileSync(new URL("../src/electron-global-hotkey.ts",import.meta.url),"utf8");
const styles=readFileSync(new URL("../styles.css",import.meta.url),"utf8");
const manifest=JSON.parse(readFileSync(new URL("../manifest.json",import.meta.url),"utf8"));

test("community-directory-compliant identity and version",()=>{
  assert.equal(manifest.name,"Floating Note Manager");
  assert.equal(manifest.id,"floating-note-manager");
  assert.equal(manifest.version,"0.1.24");
});

test("system hotkey invokes only a standalone native popout picker; main stays untouched",()=>{
  const callback=main.slice(main.indexOf("this.globalHotkey=new GlobalShortcutController("),
    main.indexOf("if(this.settings.globalHotkeyEnabled)"));
  assert.match(callback,/void this\.showGlobalPicker\(\)/);
  assert.doesNotMatch(callback,/showManager\(\)|activateObsidianMain|\.restore\(|\.show\(|\.focus\(/);
  assert.doesNotMatch(adapter,/activateObsidianMain|\.restore\(|main\.focus\(/);
  assert.match(main,/this\.app\.workspace\.openPopoutLeaf\(\{size:/);
  assert.match(main,/leaf\.setViewState\(\{type:GLOBAL_PICKER_VIEW_TYPE/);
  assert.match(main,/existing\.activate\(\)/);
  assert.match(main,/this\.globalPickerLeaf\?\.detach\(\)/);
});

test("picker uses authoritative WorkspaceWindow instead of fragile DOM equality",()=>{
  assert.match(picker,/this\.leaf\.getContainer\(\)/);
  assert.match(picker,/container instanceof WorkspaceWindow/);
  assert.doesNotMatch(picker,/if\(!child\|\|child===main\)/);
  assert.match(picker,/doc\.body\.classList\.add\("fnm-global-picker-window"\)/);
  assert.match(picker,/\.classList\.remove\("fnm-global-picker-window"\)/);
  assert.match(picker,/installPickerWindowStyles\(doc\)/);
  assert.match(picker,/isReady\(\):boolean/);
  assert.match(main,/!view\.isReady\(\)/);
});

test("Esc hides chooser, reactivating reuses it, picking note opens only its native editor",()=>{
  assert.match(picker,/this\.keyboardCapture\.attach\(\)/);
  assert.match(picker,/this\.keyboardCapture\?\.detach\(\)/);
  assert.match(picker,/new PickerKeyCapture\(container\.win,this\.searchEl/);
  assert.match(picker,/this\.keyboardActive=true/);
  assert.doesNotMatch(picker,/this\.app\.keymap\.pushScope\(/);
  assert.match(picker,/if\(event\.key==="Escape"\)/);
  assert.match(picker,/if\(hideCachedWindow\(native\)\)/);
  assert.match(picker,/showCachedWindow\(native\)/);
  assert.match(picker,/this\.dismiss\(\);\s*void this\.plugin\.openNote\(file\)/);
  assert.doesNotMatch(picker,/showManager\(|new FloatingNoteManagerModal\(/);
});

test("standalone chooser uses one input for searching and creating, with default create action",()=>{
  assert.match(picker,/this\.addCreateRow\(this\.searchEl\.value\.trim\(\)\)/);
  const render=picker.slice(picker.indexOf("  private render():void"),picker.indexOf("  private group("));
  assert.ok(render.indexOf("this.addCreateRow(")<render.indexOf("this.group("),
    "create action must precede existing note matches");
  assert.match(picker,/this\.buttons\.push\(main\); \/\/ Always the first keyboard\/Enter action/);
  assert.match(picker,/name\?"创建「"\+name\+"」":"新建笔记"/);
  assert.match(picker,/main\.addEventListener\("click",\(\)=>\{void this\.submitScratch\(\);\}\)/);
  assert.match(picker,/const name=this\.searchEl\.value\.trim\(\)/);
  assert.match(picker,/this\.plugin\.createScratchNamed\(name\)/);
  assert.match(picker,/this\.plugin\.openNote\(file\)/);
  assert.doesNotMatch(picker,/scratchMode/);
});

test("Enter activates first create row by default, arrows still reach existing notes",()=>{
  assert.match(picker,/this\.selectedIndex=0;\s*this\.render\(\)/);
  assert.match(picker,/this\.buttons\[this\.selectedIndex\]\?\.click\(\)/);
  assert.match(picker,/pickerKeyboardAction\(event\.key,"search",false,true\)/);
  assert.match(picker,/navigateIndex\(this\.selectedIndex,this\.buttons\.length/);
  assert.match(picker,/this\.group\("搜索结果",results\)/);
  assert.match(picker,/this\.group\("最近使用",recents\.slice\(0,15\)\)/);
});

test("standalone key routing returns handled=true for Enter, arrows and Esc",()=>{
  const start=picker.indexOf("  private handleKey(event:KeyboardEvent):boolean");
  const stop=picker.indexOf("  private startScratch():void");
  const source=picker.slice(start,stop);
  assert.ok(start>=0&&stop>start);
  assert.match(source,/if\(event\.key==="Escape"\)/);
  assert.match(source,/this\.buttons\[this\.selectedIndex\]\?\.click\(\)/);
  assert.match(source,/return true/);
  assert.match(source,/navigateIndex\(this\.selectedIndex,this\.buttons\.length/);
  assert.match(picker,/this\.keyboardActive=false/);
});

test("Chinese IME confirmation does not accidentally create, duplicate guard remains",()=>{
  const main=readFileSync(new URL("../src/main.ts",import.meta.url),"utf8");
  assert.match(picker,/this\.composing\|\|this\.createPending/);
  assert.match(picker,/event\.isComposing\|\|event\.keyCode===229/);
  assert.match(picker,/addEventListener\("compositionstart"/);
  assert.match(picker,/addEventListener\("compositionend"/);
  assert.match(picker,/if\(this\.createPending\)return/);
  assert.match(main,/validateScratchName\(rawName\)/);
  assert.match(main,/if \(occupied \|\| this\.app\.vault\.getAbstractFileByPath\(path\)\)/);
});

test("picker CSS is isolated to its native child and native window X remains reachable",()=>{
  assert.match(styles,/body\.fnm-global-picker-window \.mod-root \.workspace-tab-header-container/);
  assert.match(styles,/body\.fnm-global-picker-window \.fnm-global-picker/);
  assert.doesNotMatch(styles,/body\.fnm-global-picker-window .*titlebar-button-container.*display:\s*none/);
  assert.match(main,/temporarilyHideNativePopout\(native\)/);
  assert.match(main,/const reveal=releaseCurtain/);
});
