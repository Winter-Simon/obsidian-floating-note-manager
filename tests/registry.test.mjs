import test from "node:test";
import assert from "node:assert/strict";
import {touch,setPinned,renamePath,removePath,readRecords,MAX_RECENT,validateScratchFolder,validateScratchName,dropLegacyPreset} from "../src/registry.ts";

test("touch deduplicates and retains pin preference", () => {
  const first=touch([],"A.md",1);
  const pinned=setPinned(first,"A.md",true);
  const second=touch(pinned,"A.md",2);
  assert.equal(second.length,1);
  assert.deepEqual(second[0],{path:"A.md",pinned:true,lastOpenedAt:2});
});
test("rename changes path and removes conflicting duplicate",()=>{
  const records=[{path:"A.md",lastOpenedAt:2,pinned:true},{path:"B.md",lastOpenedAt:1,pinned:false}];
  assert.deepEqual(renamePath(records,"A.md","B.md"),[{path:"B.md",lastOpenedAt:2,pinned:true}]);
});
test("closing does not affect registry; deletion does",()=>{
  const records=touch([],"A.md",1);
  assert.deepEqual(removePath(records,"A.md"),[]);
  assert.equal(records.length,1);
});
test("invalid and duplicate data are discarded",()=>{
  assert.deepEqual(readRecords([{path:"A.md",pinned:true,lastOpenedAt:4},
    {path:"A.md",pinned:false,lastOpenedAt:3},{path:"secrets.txt"},{path:"B.md",lastOpenedAt:NaN}]),
    [{path:"A.md",pinned:true,lastOpenedAt:4},{path:"B.md",pinned:false,lastOpenedAt:0}]);
});
test("recent registry stays bounded",()=>{
  let items=[];
  for(let i=0;i<MAX_RECENT+20;i++) items=touch(items,`Note-${i}.md`,i);
  assert.equal(items.length,MAX_RECENT);
  assert.equal(items[0].path,`Note-${MAX_RECENT+19}.md`);
});
test("legacy startup snapshots are removed but real geometry stays",()=>{
  assert.equal(dropLegacyPreset({x:240,y:145,width:800,height:563}),null);
  assert.equal(dropLegacyPreset({x:240,y:145,width:800,height:560}),null);
  const custom={x:510,y:200,width:420,height:660};
  assert.deepEqual(dropLegacyPreset(custom),custom);
  assert.deepEqual(dropLegacyPreset({x:240,y:145,width:800,height:700}),
    {x:240,y:145,width:800,height:700});
});

test("new scratch names remain human-readable and are safe across Windows filesystems",()=>{
  assert.equal(validateScratchName("  两自旋耦合问题  "),"两自旋耦合问题");
  assert.equal(validateScratchName("  泡利算符.md "),"泡利算符");
  assert.equal(validateScratchName("实验 1"),"实验 1");
  for(const name of ["", " ", "/", "../逃逸", "NUL", "CON.md", "a<b", "a\\b",
    "笔记.", "." , "a".repeat(121)]) {
    assert.throws(()=>validateScratchName(name),{name:"Error"});
  }
});

test("saved extreme window sizes are not silently discarded",()=>{
  const raw=[{path:"Tiny.md",lastOpenedAt:15,pinned:false,
    bounds:{x:223,y:11,width:35,height:58}}];
  assert.deepEqual(readRecords(raw)[0].bounds,{x:223,y:11,width:35,height:58});
});

test("scratch folders are vault-relative, normalized only after validation",()=>{
  assert.equal(validateScratchFolder("  Notes\\Drafts/  "),"Notes/Drafts");
  assert.equal(validateScratchFolder(""),"");
  assert.equal(validateScratchFolder("Notes/My Drafts"),"Notes/My Drafts");
  for(const path of ["../outside","a/../outside","/absolute","C:\\Users\\test",
    "a//b","a/./b","a:<bad>","|bad|"]) {
    assert.throws(()=>validateScratchFolder(path),{name:"Error"}, path);
  }
});
