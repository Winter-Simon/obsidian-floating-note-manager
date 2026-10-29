/** Keyboard navigation independent of DOM focus and available result sections. */
export function navigateIndex(current:number,count:number,direction:-1|1):number {
  if(!Number.isFinite(count)||count<=0) return 0;
  return (Math.max(0,Math.min(count-1,current))+direction+count)%count;
}
export type PickerFocus="search"|"result"|"toolbar"|"modal"|"other-input"|"outside";
/** Arrows work throughout the open manager; Enter on the toolbar is left
 * alone unless an arrow key has explicitly entered list-selection mode. */
export function pickerKeyboardAction(
  key:string,focus:PickerFocus,composing:boolean,keyboardSelecting:boolean,
):"next"|"previous"|"activate"|null {
  if(composing||focus==="outside"||focus==="other-input") return null;
  if(key==="ArrowDown") return "next";
  if(key==="ArrowUp") return "previous";
  if(key==="Enter"&&(keyboardSelecting||focus==="search"||focus==="result"))
    return "activate";
  return null;
}
