import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(f)=>readFileSync(new URL("../"+f,import.meta.url),"utf8");
test("settings headings must not duplicate plugin display name",()=>{
  const source=read("src/settings.ts");
  assert.doesNotMatch(source,/setName\(["']Floating Note Manager["']\)\.setHeading/);
  assert.match(source,/setName\(["']通用设置["']\)\.setHeading/);
});
test("native popout geometry hides via a temporary CSS class, never direct style assignment",()=>{
  const source=read("src/window-manager.ts"),css=read("styles.css");
  assert.doesNotMatch(source,/\.style\.visibility\s*=/);
  assert.match(source,/root\.addClass\("fnm-geometry-restoring"\)/);
  assert.match(source,/finally\s*\{[^}]*root\.removeClass\("fnm-geometry-restoring"\)/);
  assert.match(css,/html\.fnm-geometry-restoring\s*\{\s*visibility:\s*hidden;/);
});
test("commands have concise, plugin-name-free names",()=>{
  const src=read("src/main.ts");
  assert.match(src,/id:"open-manager",name:"打开笔记管理器"/);
  assert.doesNotMatch(src,/id:"open-manager",name:"打开 Floating Note Manager"/);
});
