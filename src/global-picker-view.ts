import {ItemView,Notice,setIcon,TFile,WorkspaceLeaf,WorkspaceWindow} from "obsidian";
import type FloatingNotePlugin from "./main";
import {navigateIndex,pickerKeyboardAction} from "./keyboard-selection";
import {hideCachedWindow,showCachedWindow} from "./window-cache";
import {resolveNativeForChild,type NativePopoutWindow} from "./electron-adapter";
import {installPickerWindowStyles,removePickerWindowStyles} from "./global-picker-styles";
import {PickerKeyCapture} from "./global-picker-keyboard";

/** Dedicated Obsidian-native child window. Never attaches a Modal to the
 * main Obsidian window, so invoking the OS hotkey does not wake the main UI. */
export const GLOBAL_PICKER_VIEW_TYPE="floating-note-manager-global-picker";

export class GlobalNotePickerView extends ItemView {
  private searchEl!:HTMLInputElement;
  private listEl!:HTMLDivElement;
  private buttons:HTMLButtonElement[]=[];
  private selectedIndex=0;
  private keyboardCapture:PickerKeyCapture|null=null;
  private keyboardActive=false;
  private hidden=false;
  private native:NativePopoutWindow|undefined;
  private createPending=false;
  private composing=false;
  private compositionTimer:number|undefined;
  private pickerDoc:Document|null=null;
  isReady():boolean {
    return !!this.searchEl && !!this.listEl &&
      this.contentEl.contains(this.searchEl) &&
      this.contentEl.contains(this.listEl);
  }
  constructor(leaf:WorkspaceLeaf,private readonly plugin:FloatingNotePlugin) {
    super(leaf);
    this.navigation=false;
    // Child windows have their own keyboard event pipeline; main Obsidian
    // keymap Scope does not reliably receive Enter/arrow/Escape there.
  }
  getViewType():string{return GLOBAL_PICKER_VIEW_TYPE;}
  getDisplayText():string{return "Floating Note Manager";}
  getIcon():string{return "notebook-pen";}

  async onOpen():Promise<void> {
    // WorkspaceLeaf.getContainer() is the authoritative Obsidian popout
    // identity. Comparing view DOM windows with workspace.containerEl can
    // reject a valid popout during view initialization and leave a blank tab.
    const container=this.leaf.getContainer();
    if(!(container instanceof WorkspaceWindow)) {
      const error=new Error("独立选择器没有获得 WorkspaceWindow 容器。");
      console.error("[Floating Note Manager] Picker setup rejected",error);
      throw error;
    }
    const doc=container.doc;
    this.pickerDoc=doc;
    doc.body.classList.add("fnm-global-picker-window");
    installPickerWindowStyles(doc);
    this.containerEl.addClass("fnm-global-picker-leaf");
    this.contentEl.empty();
    try {
    const ui=this.contentEl.createDiv({cls:"fnm-manager fnm-global-picker"});
    const header=ui.createDiv({cls:"fnm-global-picker-header"});
    const icon=header.createSpan({cls:"fnm-title-icon"});
    setIcon(icon,"notebook-pen");
    header.createSpan({text:"Floating Note Manager"});
    const plus=header.createEl("button",{
      cls:"fnm-new-button clickable-icon",
      attr:{"aria-label":"新建浮动笔记","title":"新建浮动笔记"},
    });
    setIcon(plus,"plus");
    plus.addEventListener("click",()=>this.startScratch());
    const searchBox=ui.createDiv({cls:"fnm-search-box"});
    const searchIcon=searchBox.createSpan({cls:"fnm-search-icon"});
    setIcon(searchIcon,"search");
    this.searchEl=searchBox.createEl("input",{
      type:"search",cls:"fnm-search",placeholder:"搜索笔记名称或路径…",
      attr:{"aria-label":"搜索笔记","autocomplete":"off"},
    });
    this.searchEl.addEventListener("compositionstart",()=>{
      this.composing=true;
      if(this.compositionTimer!==undefined)doc.defaultView?.clearTimeout(this.compositionTimer);
    });
    this.searchEl.addEventListener("compositionend",()=>{
      // Windows IME can dispatch the confirmation Enter after compositionend.
      // Keep it guarded through this event turn; the next deliberate Enter works.
      this.compositionTimer=doc.defaultView?.setTimeout(()=>{
        this.composing=false;
        this.compositionTimer=undefined;
      },0);
    });
    this.searchEl.addEventListener("input",()=>{
      this.selectedIndex=0;
      this.render();
    });
    this.listEl=ui.createDiv({cls:"fnm-list",attr:{"role":"list","aria-label":"浮动笔记"}});
    this.render();
    this.keyboardCapture=new PickerKeyCapture(container.win,this.searchEl,
      event=>this.handleKey(event));
    this.keyboardCapture.attach();
    }catch(error) {
      // Show a meaningful error INSIDE the child popout rather than leave
      // the default empty Obsidian editor tab. Never open a main-window Modal.
      console.error("[Floating Note Manager] Picker view failed to render",error);
      this.contentEl.empty();
      this.contentEl.createDiv({cls:"fnm-picker-error",
        text:"选择器无法加载，请重新加载 Floating Note Manager。"});
      throw error;
    }
  }

  private currentNative():NativePopoutWindow|undefined {
    const container=this.leaf.getContainer();
    if(!(container instanceof WorkspaceWindow)) return undefined;
    const win=container.win;
    const main=this.app.workspace.containerEl.ownerDocument.defaultView;
    if(!win||win.closed)return undefined;
    const resolved=resolveNativeForChild(win,main);
    if(resolved.ok) this.native=resolved.native;
    return this.native&&!this.native.isDestroyed?.()?this.native:undefined;
  }

  /** Called by the registered global shortcut: only focus THIS popout. */
  activate():boolean {
    const native=this.currentNative();
    // A stale hidden chooser must be rebuilt rather than becoming stuck
    // invisible on subsequent system-wide shortcut presses.
    if(this.hidden && !showCachedWindow(native))return false;
    this.hidden=false;
    this.composing=false;
    if(this.compositionTimer!==undefined)
      this.pickerDoc?.defaultView?.clearTimeout(this.compositionTimer);
    this.compositionTimer=undefined;
    this.selectedIndex=0;
    if(this.searchEl) {
      this.searchEl.value="";
      this.render();
    }
    this.keyboardActive=true;
    const container=this.leaf.getContainer();
    if(container instanceof WorkspaceWindow) container.win.focus(); // Child only.
    this.searchEl?.focus();
    return true;
  }
  dismiss():void {
    this.keyboardActive=false;
    const native=this.currentNative();
    if(hideCachedWindow(native)){
      this.hidden=true;
      return;
    }
    // Native hide unavailable: close ONLY the chooser popout. Never call
    // window.close() on the main vault window.
    this.leaf.detach();
  }
  private handleKey(event:KeyboardEvent):boolean {
    if(!this.keyboardActive||this.hidden||this.composing||this.createPending||
       event.isComposing||event.keyCode===229||
       event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return false;
    if(event.key==="Escape"){
      this.dismiss();
      return true;
    }
    const action=pickerKeyboardAction(event.key,"search",false,true);
    if(!action||!this.buttons.length)return false;
    if(action==="activate"){
      this.buttons[this.selectedIndex]?.click();
      return true;
    }
    this.selectedIndex=navigateIndex(this.selectedIndex,this.buttons.length,
      action==="next"?1:-1);
    this.applySelection();
    return true;
  }

  private startScratch():void {
    // The search field doubles as the name input. Do not switch to a second
    // mode that clears the results or requires an extra Enter.
    this.searchEl.value="";
    this.selectedIndex=0;
    this.render();
    this.searchEl.focus();
  }
  private async submitScratch():Promise<void> {
    const name=this.searchEl.value.trim();
    if(!name){
      this.searchEl.placeholder="输入名称，Enter 创建笔记";
      this.searchEl.focus();
      return;
    }
    if(this.createPending)return;
    this.createPending=true;
    let created=false;
    try{
      // createScratchNamed validates illegal names and refuses overwrites.
      const file=await this.plugin.createScratchNamed(name);
      created=true;
      this.dismiss();
      await this.plugin.openNote(file);
    }catch(error){
      new Notice((created?"打开失败：":"新建失败：")+String(error));
      if(!created)this.searchEl.focus();
    }finally{
      this.createPending=false;
    }
  }

  private addCreateRow(name:string):void {
    const row=this.listEl.createDiv({cls:"fnm-row fnm-create-row",attr:{"role":"listitem"}});
    const main=row.createEl("button",{
      cls:"fnm-row-main",attr:{
        "aria-label":name?"创建新笔记："+name:"创建新笔记",
        "title":name?"创建「"+name+"」":"创建新笔记",
      },
    });
    const icon=main.createSpan({cls:"fnm-file-icon"});
    setIcon(icon,"plus");
    const labels=main.createSpan({cls:"fnm-row-labels"});
    labels.createSpan({cls:"fnm-row-title",text:name?"创建「"+name+"」":"新建笔记"});
    this.buttons.push(main); // Always the first keyboard/Enter action.
    main.addEventListener("click",()=>{void this.submitScratch();});
  }
  private applySelection():void {
    this.selectedIndex=Math.min(this.selectedIndex,Math.max(0,this.buttons.length-1));
    this.buttons.forEach((button,i)=>{
      const selected=i===this.selectedIndex;
      button.parentElement?.toggleClass("fnm-selected",selected);
      button.toggleClass("fnm-selected",selected);
      if(selected) button.setAttribute("aria-current","true");
      else button.removeAttribute("aria-current");
    });
    this.buttons[this.selectedIndex]?.scrollIntoView({block:"nearest"});
  }
  private render():void {
    if(!this.listEl)return;
    this.searchEl.placeholder="搜索或输入新笔记名称…";
    this.listEl.empty();
    this.buttons=[];
    this.addCreateRow(this.searchEl.value.trim());
    const map=new Map(this.app.vault.getMarkdownFiles().map(file=>[file.path,file]));
    const shown=this.plugin.windows.listOpen().map(p=>map.get(p)).filter((f):f is TFile=>!!f);
    const tucked=this.plugin.windows.listHidden().map(p=>map.get(p)).filter((f):f is TFile=>!!f);
    const taken=new Set([...shown,...tucked].map(f=>f.path));
    const recents=this.plugin.settings.recent.map(r=>map.get(r.path))
      .filter((f):f is TFile=>!!f&&!taken.has(f.path));
    const needle=this.searchEl.value.trim().toLocaleLowerCase();
    if(needle){
      const rank=new Map(this.plugin.settings.recent.map((r,i)=>[r.path,i]));
      const openSet=new Set(shown.map(f=>f.path));
      const hiddenSet=new Set(tucked.map(f=>f.path));
      const results=[...map.values()].filter(f=>f.path.toLocaleLowerCase().includes(needle))
        .sort((a,b)=>{
          const x=openSet.has(a.path)?0:hiddenSet.has(a.path)?1:2;
          const y=openSet.has(b.path)?0:hiddenSet.has(b.path)?1:2;
          return x-y||(rank.get(a.path)??100000)-(rank.get(b.path)??100000)
            ||a.basename.localeCompare(b.basename,"zh-CN");
        }).slice(0,60);
      this.group("搜索结果",results);
    }else{
      this.group("已打开",shown);
      this.group("已收起",tucked);
      this.group("最近使用",recents.slice(0,15));
    }
    this.applySelection();
  }
  private group(title:string,files:TFile[]):void {
    if(!files.length)return;
    const section=this.listEl.createDiv({cls:"fnm-group",attr:{"role":"group","aria-label":title}});
    const heading=section.createDiv({cls:"fnm-group-title"});
    heading.createSpan({text:title});
    heading.createSpan({cls:"fnm-count",text:String(files.length)});
    for(const file of files){
      const row=section.createDiv({cls:"fnm-row",attr:{"role":"listitem"}});
      const main=row.createEl("button",{
        cls:"fnm-row-main",attr:{"aria-label":"打开："+file.basename,"title":file.path},
      });
      const icon=main.createSpan({cls:"fnm-file-icon"});
      setIcon(icon,"file-text");
      const labels=main.createSpan({cls:"fnm-row-labels"});
      labels.createSpan({cls:"fnm-row-title",text:file.basename});
      this.buttons.push(main);
      main.addEventListener("click",()=>{
        this.dismiss();
        void this.plugin.openNote(file).catch(error=>new Notice("打开失败："+String(error)));
      });
      if(this.plugin.windows.isHidden(file.path)){
        row.addClass("fnm-tucked");
        const state=row.createSpan({cls:"fnm-row-state",attr:{"title":"已收起"}});
        setIcon(state,"moon");
      }
      if(this.plugin.windows.isOpen(file.path)){
        row.addClass("fnm-has-actions");
        const actions=row.createDiv({cls:"fnm-row-actions"});
        const pin=actions.createEl("button",{cls:"fnm-icon-button clickable-icon",attr:{"aria-label":"切换置顶"}});
        setIcon(pin,this.plugin.windows.isPinned(file.path)?"pin":"pin-off");
        pin.addEventListener("click",()=>{
          this.plugin.windows.pin(file.path,!this.plugin.windows.isPinned(file.path));
          this.render();
        });
        const close=actions.createEl("button",{cls:"fnm-icon-button clickable-icon",attr:{"aria-label":"收起笔记"}});
        setIcon(close,"x");
        close.addEventListener("click",()=>{this.plugin.windows.hide(file.path);this.render();});
      }
    }
  }
  async onClose():Promise<void>{
    this.keyboardActive=false;
    this.keyboardCapture?.detach();
    this.keyboardCapture=null;
    if(this.compositionTimer!==undefined)
      this.pickerDoc?.defaultView?.clearTimeout(this.compositionTimer);
    this.compositionTimer=undefined;
    this.composing=false;
    this.native=undefined;
    const doc=this.pickerDoc;
    if(doc) {
      doc.body.classList.remove("fnm-global-picker-window");
      removePickerWindowStyles(doc);
    }
    this.pickerDoc=null;
    this.plugin.onGlobalPickerClosed(this);
    this.contentEl.empty();
  }
}
