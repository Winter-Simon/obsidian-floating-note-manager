import test from "node:test";
import assert from "node:assert/strict";
import {PICKER_STYLE_ID,PICKER_WINDOW_CSS,installPickerWindowStyles,removePickerWindowStyles}
  from "../src/global-picker-styles.ts";

test("independent child picker has scoped fallback CSS for tab chrome and UI",()=>{
  assert.equal(PICKER_STYLE_ID,"fnm-global-picker-window-styles");
  assert.match(PICKER_WINDOW_CSS,/body\.fnm-global-picker-window \.workspace-tab-header-container-inner/);
  assert.match(PICKER_WINDOW_CSS,/body\.fnm-global-picker-window \.view-header/);
  assert.match(PICKER_WINDOW_CSS,/body\.fnm-global-picker-window \.fnm-global-picker/);
  assert.match(PICKER_WINDOW_CSS,/\.fnm-row\.fnm-selected/);
  assert.doesNotMatch(PICKER_WINDOW_CSS,/^\s*body\s*\{/m);
});

test("child styles are inserted once and cleanly released on view close",()=>{
  const elements=new Map();
  const head={appendChild(el){elements.set(el.id,el)}};
  const doc={
    head,
    getElementById:id=>elements.get(id)??null,
    createElement(tag){
      assert.equal(tag,"style");
      return {id:"",textContent:"",remove(){elements.delete(this.id)}};
    },
  };
  installPickerWindowStyles(doc);
  assert.equal(elements.size,1);
  const first=elements.get(PICKER_STYLE_ID);
  assert.equal(first.textContent,PICKER_WINDOW_CSS);
  installPickerWindowStyles(doc);
  assert.equal(elements.get(PICKER_STYLE_ID),first);
  removePickerWindowStyles(doc);
  assert.equal(elements.size,0);
  removePickerWindowStyles(doc);
  assert.equal(elements.size,0);
});
