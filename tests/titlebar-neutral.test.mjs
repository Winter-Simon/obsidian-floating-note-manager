import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const css=readFileSync(new URL("../styles.css",import.meta.url),"utf8");

test("native floating editor header uses same neutral background as note content",()=>{
  const start=css.indexOf("body.fnm-managed-popout {");
  const end=css.indexOf("body.fnm-managed-popout .titlebar,",start);
  assert.ok(start>=0&&end>start);
  const scoped=css.slice(start,end);
  assert.match(scoped,/--fnm-chrome-background:\s*var\(--background-primary\)/);
  assert.match(scoped,/--titlebar-background:\s*var\(--fnm-chrome-background\)/);
  assert.match(scoped,/--titlebar-background-focused:\s*var\(--fnm-chrome-background\)/);
  assert.doesNotMatch(scoped,/--interactive-accent|color-mix/);
});

test("native OS titlebar/buttons keep their drag and click targets",()=>{
  assert.match(css,/body\.fnm-managed-popout \.titlebar,/);
  assert.match(css,/body\.fnm-managed-popout \.titlebar-button-container\.mod-right/);
  assert.match(css,/background-color:\s*var\(--fnm-chrome-background\) !important/);
  assert.match(css,/body\.fnm-managed-popout \.mod-root \.workspace-tab-header-container \{/);
  assert.match(css,/-webkit-app-region:\s*drag/);
  assert.match(css,/-webkit-app-region:\s*no-drag/);
  assert.match(css,/body\.fnm-managed-window \.fnm-pin-action/);
  assert.match(css,/body\.fnm-managed-popout \.titlebar-button-container\.mod-right \.titlebar-button:hover/);
});

test("scope does not recolor standalone global chooser or main Obsidian window",()=>{
  const start=css.indexOf("/* Floating editor chrome blends");
  const end=css.indexOf("/* Blue Topaz adds",start);
  assert.ok(start>=0&&end>start);
  const rules=css.slice(start,end);
  const selectors=rules.match(/(?:^|\n)([^\n{}]+)\s*\{/g)||[];
  assert.ok(selectors.length>0);
  for(const selector of selectors){
    if(selector.includes("/*"))continue;
    assert.match(selector,/body\.fnm-managed-popout/);
    assert.doesNotMatch(selector,/fnm-global-picker-window/);
  }
});
