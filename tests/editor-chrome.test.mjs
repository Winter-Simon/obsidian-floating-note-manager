import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const css=readFileSync(new URL("../styles.css",import.meta.url),"utf8");
const manifest=JSON.parse(readFileSync(new URL("../manifest.json",import.meta.url),"utf8"));

test("native floating note titlebar uses the editor background, not theme accent",()=>{
  assert.equal(manifest.version,"0.1.25");
  const start=css.indexOf("/* Floating editor chrome blends into its content");
  const end=css.indexOf("/* Blue Topaz adds a tinted background",start);
  assert.ok(start>=0 && end>start,"managed popout chrome block must be present");
  const chrome=css.slice(start,end);
  assert.match(chrome,/body\.fnm-managed-popout\s*\{\s*--fnm-chrome-background:\s*var\(--background-primary\);/);
  assert.match(chrome,/--titlebar-background:\s*var\(--fnm-chrome-background\)/);
  assert.match(chrome,/--titlebar-background-focused:\s*var\(--fnm-chrome-background\)/);
  assert.doesNotMatch(chrome,/color-mix\(|interactive-accent|#[0-9a-f]{3,8}\b/i);
  assert.match(chrome,/\.titlebar-button-container\.mod-right/);
  assert.match(chrome,/-webkit-app-region:\s*no-drag/);
});

test("chrome fix is scoped to managed editor and preserves native drag and pin",()=>{
  assert.match(css,/body\.fnm-managed-popout \.mod-root \.workspace-tab-header-container \{/);
  assert.match(css,/-webkit-app-region:\s*drag/);
  assert.match(css,/body\.fnm-managed-window \.fnm-pin-action \{/);
  assert.match(css,/body\.fnm-managed-popout \.titlebar-button-container\.mod-right \.titlebar-button:hover/);
  assert.doesNotMatch(css,/^\s*body\s*\{\s*--fnm-chrome-background:/m);
  assert.match(css,/body\.fnm-global-picker-window/);
});
