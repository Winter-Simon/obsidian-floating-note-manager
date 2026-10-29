/** Keyboard events in an Obsidian popout belong to its own Window.
 * The main vault's keymap Scope is not guaranteed to receive them.
 * Handle capture in the child's DOM instead; never attach to main Window. */
export class PickerKeyCapture {
  private active=false;
  private handled=new WeakSet<Event>();
  private readonly listener=(event:Event):void=>{
    if(!this.active||this.handled.has(event))return;
    this.handled.add(event); // Do not process twice if input is also listening.
    if(this.handle(event as KeyboardEvent)){
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  private readonly childWindow:EventTarget;
  private readonly searchInput:EventTarget;
  private readonly handle:(event:KeyboardEvent)=>boolean;
  constructor(childWindow:EventTarget,searchInput:EventTarget,
    handle:(event:KeyboardEvent)=>boolean){
    this.childWindow=childWindow;
    this.searchInput=searchInput;
    this.handle=handle;
  }
  attach():void {
    if(this.active)return;
    this.active=true;
    // Window capture runs before Obsidian input/keymap handlers.
    this.childWindow.addEventListener("keydown",this.listener,true);
    // Redundant input capture supports builds where window events differ.
    this.searchInput.addEventListener("keydown",this.listener,true);
  }
  detach():void {
    if(!this.active)return;
    this.active=false;
    this.childWindow.removeEventListener("keydown",this.listener,true);
    this.searchInput.removeEventListener("keydown",this.listener,true);
  }
}
