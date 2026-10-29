/** Small, pure lifecycle helpers for cached native Obsidian popouts.
 * Never call window.close() while doing a reversible tuck-away. */
export interface CachedNativeWindow {
  hide?():void;
  show?():void;
  focus?():void;
  isDestroyed?():boolean;
}
export function hideCachedWindow(native:CachedNativeWindow|undefined):boolean {
  if(!native?.hide||!native.show||native.isDestroyed?.()) return false;
  try {
    native.hide();
    const verify=native as CachedNativeWindow&{isVisible?():boolean};
    return verify.isVisible?.()!==true;
  }catch{return false;}
}
export function showCachedWindow(native:CachedNativeWindow|undefined):boolean {
  if(!native?.show||native.isDestroyed?.()) return false;
  try {native.show();}catch{return false;}
  try {native.focus?.();}catch{/* Native window is already shown. */}
  return true;
}
export function hiddenEvictionPaths(
  states:readonly {path:string;hidden:boolean;hiddenOrder:number}[],limit:number,
):string[] {
  const hidden=states.filter(state=>state.hidden).sort((a,b)=>a.hiddenOrder-b.hiddenOrder);
  return hidden.slice(0,Math.max(0,hidden.length-Math.max(0,limit))).map(s=>s.path);
}
