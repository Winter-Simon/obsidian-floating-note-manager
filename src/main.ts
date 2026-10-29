import {Menu, Notice, Plugin, TAbstractFile, TFile, TFolder, type WorkspaceLeaf} from "obsidian";
import {FloatingNoteManagerModal} from "./manager-modal";
import {NewScratchModal} from "./new-scratch-modal";
import {DEFAULT_SETTINGS, FloatingNoteSettings, FloatingNoteSettingTab} from "./settings";
import {dropLegacyPreset, readBounds, readRecords, removePath, renamePath, setNoteBounds, setPinned, touch, validateScratchFolder, validateScratchName} from "./registry";
import {FloatingWindowManager} from "./window-manager";
import {findMainProcessGlobalShortcut} from "./electron-global-hotkey";
import {GlobalNotePickerView,GLOBAL_PICKER_VIEW_TYPE} from "./global-picker-view";
import {nativeFromWorkspaceEvent,temporarilyHideNativePopout} from "./electron-adapter";
import {GlobalShortcutController,normalizeHotkey,DEFAULT_GLOBAL_HOTKEY,type HotkeyResult} from "./global-hotkey";

export default class FloatingNotePlugin extends Plugin {
  declare settings: FloatingNoteSettings;
  windows!: FloatingWindowManager;
  private globalHotkey:GlobalShortcutController|null=null;
  private globalPickerLeaf:WorkspaceLeaf|null=null;
  private globalPickerView:GlobalNotePickerView|null=null;
  private globalPickerOpening:Promise<void>|null=null;
  private saveQueue: Promise<void> = Promise.resolve();

  async onload(): Promise<void> {
    const raw = await this.loadData() as Partial<FloatingNoteSettings> | null;
    // 0.1.1 sometimes persisted its initial 800×560 frame, not the later
    // manually resized window. In this one-time migration discard ONLY the
    // recognizable old preset, not a user's other custom window geometries.
    const migratingLegacy = raw?.defaultWidth === 800 && raw?.defaultHeight === 560;
    const oldRecents=readRecords(raw?.recent);
    const recents = oldRecents.map((item) => {
      const bounds = migratingLegacy ? dropLegacyPreset(readBounds(item.bounds)) : readBounds(item.bounds);
      const {bounds: _old, ...rest} = item;
      return {...rest, ...(bounds ? {bounds:{...bounds,x:0,y:0}} : {})};
    });
    const savedLast = migratingLegacy ? dropLegacyPreset(readBounds(raw?.lastBounds)) : readBounds(raw?.lastBounds);
    this.settings = {...DEFAULT_SETTINGS, ...raw, recent: recents,
      lastBounds: undefined,
      defaultWidth: migratingLegacy ? DEFAULT_SETTINGS.defaultWidth :
        (Number.isInteger(raw?.defaultWidth) && raw!.defaultWidth! >= 420 && raw!.defaultWidth! <= 1600
          ? raw!.defaultWidth! : DEFAULT_SETTINGS.defaultWidth),
      defaultHeight: migratingLegacy ? DEFAULT_SETTINGS.defaultHeight :
        (Number.isInteger(raw?.defaultHeight) && raw!.defaultHeight! >= 300 && raw!.defaultHeight! <= 1200
          ? raw!.defaultHeight! : DEFAULT_SETTINGS.defaultHeight),
      rememberWindowBounds: raw?.rememberWindowBounds !== false,
      globalHotkeyEnabled:raw?.globalHotkeyEnabled===true,
      globalHotkeyAccelerator:typeof raw?.globalHotkeyAccelerator==="string" ?
        raw.globalHotkeyAccelerator:DEFAULT_GLOBAL_HOTKEY};
    // Do not keep coordinates from earlier versions in data.json.
    if(migratingLegacy || !!savedLast ||
      oldRecents.some(item=>!!item.bounds&&(item.bounds.x!==0||item.bounds.y!==0)))
      await this.persist();
    this.windows = new FloatingWindowManager(this.app, {
      onOpen: async(path) => {
        this.settings.recent = touch(this.settings.recent, path);
        await this.persist();
      },
      onPin: async(path, enabled) => {
        this.settings.recent = setPinned(this.settings.recent, path, enabled);
        await this.persist();
      },
      preferredPin: (path) => this.getPinned(path) || this.settings.pinNewNotes,
      minimalChrome: () => this.settings.minimalChrome,
      closeOnEscape: () => this.settings.closeOnEscape,
      defaultSize: () => ({width:this.settings.defaultWidth,height:this.settings.defaultHeight}),
      // New notes always open centered. Reuse only the *same note's* saved
      // geometry; lastBounds is retained solely for backward compatibility.
      getBounds: (path) => this.settings.rememberWindowBounds
        ? this.settings.recent.find(item=>item.path===path)?.bounds : undefined,
      onBounds: async (path,bounds) => {
        if (!this.settings.rememberWindowBounds) return;
        const verified = readBounds(bounds);
        if (!verified) return;
        const previous = this.settings.recent.find((item) => item.path === path)?.bounds;
        if (previous && previous.width === verified.width &&
            previous.height === verified.height) return;
        const sizeOnly={...verified,x:0,y:0};
        this.settings.lastBounds=undefined;
        this.settings.recent=setNoteBounds(this.settings.recent,path,sizeOnly);
        await this.persist();
      },
    });

    this.registerView(GLOBAL_PICKER_VIEW_TYPE,leaf=>new GlobalNotePickerView(leaf,this));
    this.addRibbonIcon("panels-top-left", "Floating Note Manager", () => this.showManager());
    this.addCommand({id:"open-manager",name:"打开笔记管理器",
      callback:() => this.showManager()});
    this.addCommand({id:"float-current",name:"将当前笔记浮动打开",
      checkCallback:(checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) void this.openNote(file).catch(this.reportError);
        return true;
      }});
    this.addCommand({id:"reset-active-window",name:"重置最近浮动笔记的尺寸",
      callback:() => { void this.resetRecentGeometry(); }});
    this.addCommand({id:"scratch",name:"新建浮动草稿",
      callback:() => this.showNewScratchPrompt()});
    this.addCommand({id:"recall-recent",name:"召回最近的浮动笔记",
      callback:() => { void this.recallRecent().catch(this.reportError); }});
    this.addCommand({id:"hide-current",name:"收起当前浮动笔记（保留窗口）",
      callback:() => {
        if (!this.windows.hideActive()) new Notice("当前没有可收起的浮动笔记");
      }});
    const hostWindow=this.app.workspace.containerEl.ownerDocument.defaultView??window;
    this.globalHotkey=new GlobalShortcutController(
      ()=>findMainProcessGlobalShortcut(hostWindow),
      ()=>{
        // OS-wide hotkey must NEVER restore, maximize, show or focus the
        // main Obsidian window. The picker is a separate native popout.
        void this.showGlobalPicker().catch(error=>this.reportError(error));
      },
    );
    if(this.settings.globalHotkeyEnabled){
      const result=this.globalHotkey.configure(true,this.settings.globalHotkeyAccelerator);
      if(!result.ok) this.reportHotkeyError(result);
    }
    this.addSettingTab(new FloatingNoteSettingTab(this.app,this));

    this.registerEvent(this.app.workspace.on("file-menu",(menu: Menu, file: TAbstractFile) => {
      if (file instanceof TFile && file.extension === "md") {
        menu.addItem((item) => item.setTitle("在浮动窗口中打开")
          .setIcon("panels-top-left")
          .onClick(() => { void this.openNote(file).catch(this.reportError); }));
      }
    }));
    this.registerEvent(this.app.vault.on("rename",(file, oldPath) => {
      if (!(file instanceof TFile) || file.extension !== "md") return;
      this.settings.recent = renamePath(this.settings.recent,oldPath,file.path);
      this.windows.rename(oldPath,file.path);
      void this.persist();
    }));
    this.registerEvent(this.app.vault.on("delete",(file) => {
      if (!(file instanceof TFile)) return;
      this.settings.recent = removePath(this.settings.recent,file.path);
      this.windows.closePermanently(file.path);
      void this.persist();
    }));
  }

  onunload(): void {
    this.globalHotkey?.dispose();
    this.globalPickerLeaf?.detach();
    this.globalPickerLeaf=null;
    this.globalPickerView=null;
    this.windows.dispose();
  }

  /** Global-only selector, with its own real popout and keyboard scope.
   * No main-window Modal and no main BrowserWindow.show()/restore()/focus().
   * Reuse the same hidden chooser on subsequent hotkey presses. */
  async showGlobalPicker():Promise<void>{
    if(this.globalPickerOpening)return this.globalPickerOpening;
    const existing=this.globalPickerView;
    if(existing&&existing.containerEl.isConnected){
      if(existing.activate())return;
      // The OS refused to show a previously hidden native picker.
      // Release only that child leaf and create another one.
      existing.leaf.detach();
      this.globalPickerView=null;
      this.globalPickerLeaf=null;
    }
    const opening=(async()=>{
      // Conceal the native frame during first creation. On subsequent hotkey
      // invocations reuse the already-initialized hidden child picker.
      const mainWin=this.app.workspace.containerEl.ownerDocument.defaultView;
      let releaseCurtain:(()=>void)|null=null;
      const event=this.app.workspace.on("window-open",(host,child)=>{
        if(releaseCurtain||!mainWin||child===mainWin)return;
        const native=nativeFromWorkspaceEvent(host,child,mainWin);
        if(native)releaseCurtain=temporarilyHideNativePopout(native);
      });
      let leaf:WorkspaceLeaf;
      try{
        leaf=this.app.workspace.openPopoutLeaf({size:{width:500,height:490}});
      }finally{
        this.app.workspace.offref(event);
      }
      this.globalPickerLeaf=leaf;
      try{
        await leaf.setViewState({type:GLOBAL_PICKER_VIEW_TYPE,active:true});
        const view=leaf.view;
        if(!(view instanceof GlobalNotePickerView)||!view.isReady())
          throw new Error("独立选择器内容尚未初始化，已取消空白窗口。");
        this.globalPickerView=view;
        if(!view.activate())
          throw new Error("独立选择器未能显示，请重新载入插件。");
      }catch(error){
        this.globalPickerLeaf=null;
        this.globalPickerView=null;
        leaf.detach();
        throw error;
      }finally{
        const reveal=releaseCurtain as (()=>void)|null;
        reveal?.();
      }
    })();
    this.globalPickerOpening=opening;
    try{await opening;}finally{this.globalPickerOpening=null;}
  }

  onGlobalPickerClosed(view:GlobalNotePickerView):void{
    if(this.globalPickerView===view){
      this.globalPickerView=null;
      this.globalPickerLeaf=null;
    }
  }

  private reportHotkeyError(result:HotkeyResult):void {
    if(result.ok||result.reason==="disabled")return;
    const message={
      invalid:"快捷键格式无效：请使用至少一个修饰键，例如 Alt+W。",
      unavailable:"当前 Obsidian 版本没有提供可用的 Electron 主进程全局快捷键接口。",
      occupied:"系统快捷键已被占用，请更换组合。",
      error:"注册系统快捷键时发生错误，请查看控制台。",
    }[result.reason];
    // The visible Notice already explains registration failures.
    new Notice(message);
  }

  async configureGlobalHotkey(enabled:boolean,chord:string):Promise<void> {
    if(!this.globalHotkey)return;
    const normalized=normalizeHotkey(chord);
    if(enabled && !normalized){
      this.reportHotkeyError({ok:false,reason:"invalid"});
      return;
    }
    const result=this.globalHotkey.configure(enabled,normalized??chord);
    if(!result.ok && result.reason!=="disabled") {
      this.reportHotkeyError(result);
      return;
    }
    this.settings.globalHotkeyEnabled=enabled;
    this.settings.globalHotkeyAccelerator=normalized??chord;
    await this.persist();
  }

  private reportError(error: unknown): void {
    console.error("[Floating Note Manager]",error);
    new Notice("浮动笔记管理器：" + (error instanceof Error ? error.message : String(error)));
  }

  async persist(): Promise<void> {
    // Serialize saves so multiple window/focus events cannot reorder persistent writes.
    const snapshot = JSON.parse(JSON.stringify(this.settings)) as FloatingNoteSettings;
    this.saveQueue = this.saveQueue.catch(() => undefined).then(() => this.saveData(snapshot));
    await this.saveQueue;
  }

  getPinned(path: string): boolean {
    return this.settings.recent.find((item) => item.path === path)?.pinned ?? false;
  }

  private async resetRecentGeometry(): Promise<void> {
    const recent=this.settings.recent[0];
    if(!recent) {new Notice("暂无可重置的浮动笔记。");return;}
    if(this.windows.hasWindow(recent.path)) {
      new Notice("请先彻底关闭这篇浮动笔记，再重置尺寸。");
      return;
    }
    this.settings.recent=this.settings.recent.map(record=>{
      if(record.path!==recent.path) return record;
      const {bounds: _ignored,...rest}=record;
      return rest;
    });
    await this.persist();
    new Notice("已重置最近笔记的尺寸，下次冷启动将使用默认宽高。");
  }

  showManager(): void { new FloatingNoteManagerModal(this.app,this).open(); }
  showNewScratchPrompt(): void {new NewScratchModal(this.app,this).open();}

  async openNote(file: TFile): Promise<void> {
    if (file.extension !== "md") throw new Error("只支持 Markdown 笔记");
    // Resolve a current vault file, so stale references cannot create misleading windows.
    const current = this.app.vault.getAbstractFileByPath(file.path);
    if (!(current instanceof TFile)) throw new Error("笔记已不存在于当前库中");
    await this.windows.open(current);
  }

  async createScratchNamed(rawName: string): Promise<TFile> {
    const name = validateScratchName(rawName);
    const folder = validateScratchFolder(this.settings.scratchFolder);
    // Create nested directories safely without replacing existing vault files.
    if (folder) {
      let current = "";
      for (const segment of folder.split("/")) {
        current = current ? current + "/" + segment : segment;
        const existing = this.app.vault.getAbstractFileByPath(current);
        if (existing && !(existing instanceof TFolder)) {
          throw new Error("草稿文件夹与已有文件冲突：" + current);
        }
        if (!existing) await this.app.vault.createFolder(current);
      }
    }
    const base = folder ? folder + "/" : "";
    const path = base + name + ".md";
    // On Windows the vault filesystem is usually case-insensitive.
    const occupied = this.app.vault.getFiles().some((file) =>
      file.path.toLocaleLowerCase() === path.toLocaleLowerCase());
    if (occupied || this.app.vault.getAbstractFileByPath(path)) {
      throw new Error("同名笔记已存在，请换一个名称。");
    }
    return this.app.vault.create(path,"");
  }

  private async recallRecent(): Promise<void> {
    for (const record of this.settings.recent) {
      const file = this.app.vault.getAbstractFileByPath(record.path);
      if (file instanceof TFile) { await this.openNote(file); return; }
    }
    this.showManager();
  }
}
