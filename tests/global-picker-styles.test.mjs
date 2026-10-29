import test from "node:test";
import assert from "node:assert/strict";
import {existsSync,readFileSync} from "node:fs";

const css=readFileSync(new URL("../styles.css",import.meta.url),"utf8");
const view=readFileSync(new URL("../src/global-picker-view.ts",import.meta.url),"utf8");

test("picker CSS lives in Obsidian-managed styles.css, not runtime-injected style elements",()=>{
  assert.equal(existsSync(new URL("../src/global-picker-styles.ts",import.meta.url)),false);
  assert.doesNotMatch(view,/installPickerWindowStyles|removePickerWindowStyles|PICKER_WINDOW_CSS/);
  assert.doesNotMatch(view,/create(?:El|Element)\(["']style["']/);
  assert.match(css,/The global picker uses the standard plugin styles\.css/);
});

test("picker chrome and UI styling only apply to marked independent child windows",()=>{
  const first=css.indexOf("/* The global picker uses the standard plugin styles.css");
  const last=css.indexOf("/* Only style managed native popouts:",first);
  assert.ok(first>=0 && last>first);
  const scoped=css.slice(first,last);
  assert.match(scoped,/body\.fnm-global-picker-window \.workspace-tab-header-container/);
  assert.match(scoped,/body\.fnm-global-picker-window \.workspace-tab-header-container-inner/);
  assert.match(scoped,/body\.fnm-global-picker-window \.view-header/);
  assert.match(scoped,/body\.fnm-global-picker-window \.fnm-global-picker/);
  assert.match(scoped,/body\.fnm-global-picker-window \.fnm-global-picker \.fnm-row\.fnm-selected/);
  assert.match(scoped,/-webkit-app-region:\s*drag/);
  assert.match(scoped,/-webkit-app-region:\s*no-drag/);
  assert.doesNotMatch(scoped,/(^|\n)\s*body\s*\{/);
  assert.doesNotMatch(scoped,/(^|\n)\s*\.titlebar-button-container[^\n]*display:\s*none/);
});

test("picker lifecycle marks only the child doc and removes its body class",()=>{
  assert.match(view,/const doc=container\.doc/);
  assert.match(view,/doc\.body\.classList\.add\("fnm-global-picker-window"\)/);
  assert.match(view,/doc\.body\.classList\.remove\("fnm-global-picker-window"\)/);
});
