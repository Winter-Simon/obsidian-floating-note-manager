/** Opt-in OS-wide shortcut registration. This module never uses
 * unregisterAll because Electron's global shortcuts are shared by all vaults. */
export interface GlobalShortcutAPI {
  register(accelerator:string,callback:()=>void):boolean;
  unregister(accelerator:string):void;
  isRegistered?(accelerator:string):boolean;
}
export type HotkeyResult =
  |{ok:true;accelerator:string}
  |{ok:false;reason:"disabled"|"invalid"|"unavailable"|"occupied"|"error"};
export const DEFAULT_GLOBAL_HOTKEY="Ctrl+Alt+Space";

const HOTKEY_MODIFIERS:Record<string,string> = {
  control:"Control",ctrl:"Control",commandorcontrol:"CommandOrControl",
  cmdorctrl:"CommandOrControl",alt:"Alt",option:"Alt",
  shift:"Shift",super:"Super",meta:"Super",command:"Super",
};

/** At least one modifier and one unambiguous key. Bare keys,
 * unknown Electron accelerators and reserved system keys are disallowed. */
export function normalizeHotkey(raw:string):string|null {
  if(typeof raw!=="string" || raw.length>90) return null;
  const parts=raw.split("+").map(s=>s.trim());
  if(parts.length<2 || parts.length>5 || parts.some(s=>s.length===0)) return null;
  const modifiers:string[]=[];
  let key:string|null=null;
  for(const part of parts) {
    const lowered=part.toLowerCase().replace(/\s/g,"");
    const modifier=HOTKEY_MODIFIERS[lowered];
    if(modifier){
      if(modifiers.includes(modifier))return null;
      modifiers.push(modifier);
    } else {
      if(key!==null)return null;
      if(lowered==="space") key="Space";
      else if(/^f([1-9]|1[0-2])$/.test(lowered)) key=lowered.toUpperCase();
      else if(/^[a-z0-9]$/.test(lowered)) key=lowered.toUpperCase();
      else return null;
    }
  }
  if(!key||modifiers.length<1||modifiers.length!==parts.length-1)return null;
  if(modifiers.includes("Control")&&modifiers.includes("CommandOrControl"))return null;
  if(modifiers.includes("Super")&&modifiers.includes("CommandOrControl"))return null;
  const ordered=["CommandOrControl","Control","Alt","Shift","Super"];
  return [...ordered.filter(mod=>modifiers.includes(mod)),key].join("+");
}

export class GlobalShortcutController {
  private api:GlobalShortcutAPI|null=null;
  private accelerator:string|null=null;
  private readonly resolve:()=>GlobalShortcutAPI|null;
  private readonly invoke:()=>void;
  constructor(resolve:()=>GlobalShortcutAPI|null,invoke:()=>void){
    this.resolve=resolve;
    this.invoke=invoke;
  }
  get registered():string|null{return this.accelerator;}
  configure(enabled:boolean,chord:string):HotkeyResult {
    if(!enabled){
      this.dispose();
      return {ok:false,reason:"disabled"};
    }
    const accelerator=normalizeHotkey(chord);
    if(!accelerator) return {ok:false,reason:"invalid"};
    if(this.accelerator===accelerator) return {ok:true,accelerator};
    let candidate:GlobalShortcutAPI|null;
    try {candidate=this.resolve();}catch{return {ok:false,reason:"unavailable"};}
    if(!candidate)return {ok:false,reason:"unavailable"};
    // Register new before releasing old: on conflicts or failures preserve
    // the known-working shortcut and avoid leaving the user without access.
    try {
      if(candidate.isRegistered?.(accelerator))return {ok:false,reason:"occupied"};
      if(candidate.register(accelerator,()=>this.invoke())!==true)
        return {ok:false,reason:"occupied"};
    }catch{return {ok:false,reason:"error"};}
    this.dispose();
    this.api=candidate;
    this.accelerator=accelerator;
    return {ok:true,accelerator};
  }
  dispose():void {
    const api=this.api,accelerator=this.accelerator;
    this.api=null;this.accelerator=null;
    if(api&&accelerator){
      try{api.unregister(accelerator);}
      catch(error){console.warn("[浮动笔记] 注销全局快捷键失败",error);}
    }
  }
}
