import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const manager=readFileSync(new URL("../src/manager-modal.ts",import.meta.url),"utf8");
const css=readFileSync(new URL("../styles.css",import.meta.url),"utf8");

test("compact manager retains keymap navigation, IME guard, and Enter activation",()=>{
  assert.match(manager,/this\.scope\.register\(\[\], "ArrowDown"/);
  assert.match(manager,/this\.scope\.register\(\[\], "ArrowUp"/);
  assert.match(manager,/this\.scope\.register\(\[\], "Enter"/);
  assert.match(manager,/event\.isComposing\|\|event\.keyCode===229/);
  assert.match(manager,/this\.itemButtons\[this\.selectedIndex\]\?\.click\(\)/);
  assert.match(manager,/button\.parentElement\?\.toggleClass\("fnm-selected",selected\)/);
});

test("manager shows groups only when populated, with count and clear empty state",()=>{
  assert.match(manager,/if\(opened\.length\) this\.addGroup\("已打开",opened\)/);
  assert.match(manager,/if\(tucked\.length\) this\.addGroup\("已收起",tucked\)/);
  assert.match(manager,/if\(recents\.length\) this\.addGroup\("最近使用",recents\.slice\(0,15\)\)/);
  assert.doesNotMatch(manager,/this\.resultCountEl/);
  assert.match(manager,/this\.renderEmpty\("没有找到匹配的笔记"/);
});

test("lightweight rows show only note titles; path stays searchable and available as tooltip",()=>{
  assert.match(manager,/title":file\.path/);
  assert.doesNotMatch(manager,/const parentPath=/);
  assert.match(manager,/labels\.createSpan\(\{cls:"fnm-row-title"/);
  assert.doesNotMatch(manager,/labels\.createSpan\(\{cls:"fnm-row-path"/);
  assert.match(manager,/this\.plugin\.windows\.pin\(file\.path/);
  assert.match(manager,/this\.plugin\.windows\.hide\(file\.path\)/);
  assert.match(manager,/this\.plugin\.openNote\(file\)/);
});

test("minimal UI omits redundant help, folder captions and destructive footer control",()=>{
  const windows=readFileSync(new URL("../src/window-manager.ts",import.meta.url),"utf8");
  assert.doesNotMatch(manager,/原生笔记 · 即时召回/);
  assert.doesNotMatch(manager,/↑↓ 选择/);
  assert.doesNotMatch(manager,/fnm-row-path/);
  assert.doesNotMatch(manager,/fnm-footer/);
  assert.doesNotMatch(css,/fnm-full-close-action/);
  assert.doesNotMatch(windows,/fnm-full-close-action|fullCloseButton/);
  assert.match(windows,/hiddenEvictionPaths\(candidates,this\.maxHidden\)/);
});

test("selected surface differs from hover; buttons appear on hover, selection or focus",()=>{
  assert.match(css,/\.fnm-manager \.fnm-row\.fnm-selected,/);
  assert.match(css,/background: var\(--fnm-selected-bg\) !important/);
  assert.match(css,/\.fnm-manager \.fnm-row:hover \.fnm-row-actions/);
  assert.match(css,/\.fnm-manager \.fnm-row\.fnm-selected \.fnm-row-actions/);
  assert.match(css,/\.fnm-manager \.fnm-row:focus-within \.fnm-row-actions/);
  assert.match(css,/\.fnm-manager \.fnm-new-button:focus-visible/);
});
