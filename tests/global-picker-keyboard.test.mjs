import test from "node:test";
import assert from "node:assert/strict";
import {PickerKeyCapture} from "../src/global-picker-keyboard.ts";

const eventFor=(key,options={})=>{
  const ev=new Event("keydown",{bubbles:true,cancelable:true});
  Object.defineProperties(ev,{
    key:{value:key},
    keyCode:{value:options.keyCode??0},
    isComposing:{value:options.isComposing??false},
    altKey:{value:options.altKey??false},
    ctrlKey:{value:options.ctrlKey??false},
    metaKey:{value:options.metaKey??false},
    shiftKey:{value:options.shiftKey??false},
  });
  return ev;
};

test("Enter delivered to the actual child Window triggers first create action",()=>{
  const child=new EventTarget(),input=new EventTarget(),actions=[];
  const capture=new PickerKeyCapture(child,input,e=>{
    if(e.key==="Enter"){actions.push("create");return true;}
    return false;
  });
  capture.attach();
  const enter=eventFor("Enter");
  child.dispatchEvent(enter);
  assert.deepEqual(actions,["create"]);
  assert.equal(enter.defaultPrevented,true);
  // A duplicate input listener sees the SAME event once, not twice.
  input.dispatchEvent(enter);
  assert.deepEqual(actions,["create"]);
  capture.detach();
  child.dispatchEvent(eventFor("Enter"));
  assert.deepEqual(actions,["create"]);
});

test("input fallback receives Enter directly, even when no global keymap Scope dispatches",()=>{
  const child=new EventTarget(),input=new EventTarget(),actions=[];
  const capture=new PickerKeyCapture(child,input,e=>{
    if(e.key==="Enter"){actions.push(e.key);return true;}
    return false;
  });
  capture.attach();
  const event=eventFor("Enter");
  input.dispatchEvent(event);
  assert.deepEqual(actions,["Enter"]);
  assert.equal(event.defaultPrevented,true);
  capture.detach();
});

test("window capture sees Up/Down/Escape, unhandled input and IME are not blocked",()=>{
  const child=new EventTarget(),input=new EventTarget(),actions=[];
  const capture=new PickerKeyCapture(child,input,e=>{
    if(e.isComposing||e.keyCode===229)return false;
    if(["ArrowDown","ArrowUp","Escape"].includes(e.key)){
      actions.push(e.key);return true;
    }
    return false;
  });
  capture.attach();
  for(const key of ["ArrowDown","ArrowUp","Escape"]){
    const e=eventFor(key);
    child.dispatchEvent(e);
    assert.equal(e.defaultPrevented,true);
  }
  assert.deepEqual(actions,["ArrowDown","ArrowUp","Escape"]);
  for(const e of [eventFor("Enter",{isComposing:true}),eventFor("Enter",{keyCode:229}),eventFor("A")]){
    child.dispatchEvent(e);
    assert.equal(e.defaultPrevented,false);
  }
  capture.detach();
});

test("multiple activations do not register the same handler twice",()=>{
  const child=new EventTarget(),input=new EventTarget();let count=0;
  const capture=new PickerKeyCapture(child,input,()=>{count++;return true;});
  capture.attach();
  capture.attach();
  child.dispatchEvent(eventFor("Enter"));
  assert.equal(count,1);
  capture.detach();
  capture.detach();
  capture.attach();
  child.dispatchEvent(eventFor("Enter"));
  assert.equal(count,2);
  capture.detach();
});
