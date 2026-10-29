import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const manifest=JSON.parse(readFileSync(new URL("../manifest.json",import.meta.url),"utf8"));
const versions=JSON.parse(readFileSync(new URL("../versions.json",import.meta.url),"utf8"));
test("Obsidian community submission manifest satisfies identifier rules",()=>{
  assert.match(manifest.id,/^[a-z-]+$/);
  assert.ok(!manifest.id.includes("obsidian"));
  assert.ok(!manifest.id.endsWith("plugin"));
  assert.equal(manifest.name,"Floating Note Manager");
  assert.equal(manifest.version,"0.1.24");
  assert.equal(versions[manifest.version],manifest.minAppVersion);
  assert.equal(manifest.isDesktopOnly,true);
  assert.ok(manifest.description.length<=250);
  assert.ok(manifest.description.endsWith("."));
});
test("MIT license is included in the source tree",()=>{
  const license=readFileSync(new URL("../LICENSE",import.meta.url),"utf8");
  assert.match(license,/^MIT License/);
  assert.match(license,/Copyright \(c\) 2026 WinterSimon/);
});
