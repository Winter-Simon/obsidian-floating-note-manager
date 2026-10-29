import {App, Notice, setIcon, TFile, WorkspaceLeaf} from "obsidian";
import {centerSavedSize, sameBounds, type WindowBounds, type ScreenArea} from "./geometry";
import {identifyNativePopout, nativeFromChildWindow, nativeFromWorkspaceEvent, resolveNativeForChild, readManagedBounds, restoreNativeBoundsBeforeEditor, temporarilyHideNativePopout, type NativePopoutWindow} from "./electron-adapter";
import {hideCachedWindow,showCachedWindow,hiddenEvictionPaths} from "./window-cache";

export interface PopoutState {
  path: string;
  leaf: WorkspaceLeaf;
  win: Window;
  pinned: boolean;
  hidden: boolean;
  hiddenOrder: number;
  hideErrorReported?:boolean;
  permanentlyClosing: boolean;
  nativeCloseHandler?: (event:{preventDefault():void})=>void;
  titlebarCloseHandler?: (event:MouseEvent)=>void;
  native?: NativePopoutWindow;
  initializing: boolean;
  lastObserved?: WindowBounds;
  requestedBounds?: WindowBounds;
  restorationMismatch: boolean;
  closeHandler: () => void;
  escapeHandler: (event: KeyboardEvent) => void;
  geometryHandler: () => void;
  focusLossHandler: () => void;
  pinButton?: HTMLButtonElement;
  geometryTimer?: number;
  pollTimer?: number;
}

export interface WindowCallbacks {
  onOpen(path: string): Promise<void>;
  onPin(path: string, enabled: boolean): Promise<void>;
  preferredPin(path: string): boolean;
  minimalChrome(): boolean;
  closeOnEscape(): boolean;
  getBounds(path: string): WindowBounds | undefined;
  defaultSize(): {width: number; height: number};
  onBounds(path: string, bounds: WindowBounds): Promise<void>;
}

/** Uses Obsidian's native note views; only popout window behavior is managed here. */
export class FloatingWindowManager {
  private readonly openWindows = new Map<string, PopoutState>();
  private readonly opening = new Map<string, Promise<void>>();
  private hiddenSequence=0;
  private readonly maxHidden=5;
  private readonly mainWindow:Window|null;
  private readonly onMainUnload=():void=>{this.dispose();};
  constructor(private readonly app: App, private readonly callbacks: WindowCallbacks) {
    this.mainWindow=app.workspace.containerEl.ownerDocument.defaultView;
    this.mainWindow?.addEventListener("beforeunload",this.onMainUnload);
  }

  isOpen(path: string): boolean {
    const state = this.openWindows.get(path);
    return Boolean(state && !state.win.closed && !state.hidden);
  }
  isHidden(path:string):boolean {
    const state=this.openWindows.get(path);
    return Boolean(state&&!state.win.closed&&state.hidden);
  }
  hasWindow(path:string):boolean {
    const state=this.openWindows.get(path);
    return Boolean(state&&!state.win.closed);
  }
  listOpen(): string[] {
    return [...this.openWindows.keys()].filter((path) => this.isOpen(path));
  }
  listHidden(): string[] {
    return [...this.openWindows.keys()].filter((path) => this.isHidden(path));
  }
  isPinned(path: string): boolean {
    const state=this.openWindows.get(path);
    if(!state) return false;
    try {
      if(state.native && !state.native.isDestroyed?.() && state.native.isAlwaysOnTop)
        state.pinned=state.native.isAlwaysOnTop();
    }catch {/* last verified state still useful */}
    return state.pinned;
  }

  async open(file: TFile): Promise<void> {
    const existing = this.openWindows.get(file.path);
    if (existing && !existing.win.closed) {
      if(existing.hidden&&!this.reveal(existing))
        throw new Error("此窗口已收起，但当前 Electron 环境无法重新显示它。");
      existing.win.focus();
      await this.callbacks.onOpen(file.path);
      return;
    }
    if (this.opening.has(file.path)) return this.opening.get(file.path);
    const task = this.createPopout(file);
    this.opening.set(file.path, task);
    try {await task;} finally {this.opening.delete(file.path);}
  }

  private async createPopout(file: TFile): Promise<void> {
    // The public API accepts *suggested* size at creation, but Electron's
    // default minimum width may still paint a larger frame initially.
    const mainWindow = this.app.workspace.containerEl.ownerDocument.defaultView;
    const saved=this.callbacks.getBounds(file.path);
    const fallback=mainWindow ? this.displayArea(mainWindow) : {x:0,y:0,width:1280,height:800};
    const desired=centerSavedSize(saved,fallback,this.callbacks.defaultSize());
    // The window-open event is emitted while openPopoutLeaf is still creating
    // the child. Handle it before the method returns: on narrow windows the
    // default Electron frame was ALREADY visible by our old post-return hook.
    let preparedNative:NativePopoutWindow|undefined;
    let eventWindow:Window|undefined;
    let revealWindow:(()=>void)|null=null;
    const handle=this.app.workspace.on("window-open",(workspaceWindow,domWindow)=>{
      if(preparedNative||!mainWindow||domWindow===mainWindow) return;
      const native=nativeFromWorkspaceEvent(workspaceWindow,domWindow,mainWindow);
      if(!native) return;
      eventWindow=domWindow;
      preparedNative=native;
      if(saved) revealWindow=temporarilyHideNativePopout(native);
      this.prepareInitialGeometry(native,desired,file.path);
    });
    let leaf:WorkspaceLeaf;
    try {
      leaf=this.app.workspace.openPopoutLeaf({
        x:desired.x,y:desired.y,
        size:{width:desired.width,height:desired.height},
      });
    } finally {
      this.app.workspace.offref(handle);
    }
    try {
      const provisionalWin=leaf.view.containerEl.ownerDocument.defaultView;
      if(eventWindow&&provisionalWin!==eventWindow) {
        // Reject any event that was not for the leaf we just created.
        // The listener runs synchronously inside openPopoutLeaf, but TS
        // cannot see assignments made by the event callback.
        const pendingReveal=revealWindow as (()=>void)|null;
        pendingReveal?.();
        revealWindow=null;
        preparedNative=undefined;
        eventWindow=undefined;
      }
      if(!preparedNative&&provisionalWin&&provisionalWin!==mainWindow) {
        const resolution=identifyNativePopout(provisionalWin);
        if(resolution.ok) {
          preparedNative=resolution.native;
          if(saved) revealWindow=temporarilyHideNativePopout(preparedNative);
          this.prepareInitialGeometry(preparedNative,desired,file.path);
          console.info("[浮动笔记管理器] 原生窗口仅能在创建后绑定",file.path);
        } else {
          console.info("[浮动笔记管理器] 创建阶段无法绑定原生窗口",{
            path:file.path,reason:resolution.reason,desired,
          });
        }
      }
      await leaf.openFile(file,{active:true});
      const win = leaf.view.containerEl.ownerDocument.defaultView;
      if (!win || win === this.app.workspace.containerEl.ownerDocument.defaultView) {
        throw new Error("无法确认独立浮动窗口，已取消窗口调整。");
      }
      const state: PopoutState = {
        path: file.path, leaf, win, pinned: false, initializing: true,
        hidden:false,hiddenOrder:0,permanentlyClosing:false,
        requestedBounds: desired, restorationMismatch: false,
        closeHandler: () => this.release(win),
        escapeHandler: (event) => this.handleEscape(event, win),
        geometryHandler: () => this.scheduleGeometry(win),
        focusLossHandler: () => this.captureByWindow(win),
      };
      this.openWindows.set(file.path, state);
      // Obsidian can override initial window dimensions DURING openFile().
      // Verify the actual native bounds after its editor has mounted, before
      // observers/geometry persistence start. Earlier code only set a minimum
      // here, leaving the window wider than the saved user dimension.
      // At this point Obsidian has attached electronWindow to this exact
      // child. It is safer than the provisional/bounds-based handle.
      state.native=nativeFromChildWindow(win,this.mainWindow)??(
        preparedNative&&!preparedNative.isDestroyed?.()?preparedNative:undefined);
      if(!state.native) {
        const resolution=resolveNativeForChild(win,this.mainWindow);
        if(resolution.ok) state.native=resolution.native;
      }
      if(state.native) {
        const nativeBounds=this.currentGeometry(win,state.native);
        if(!sameBounds(nativeBounds,desired)) {
          // The native window (frame included) must be hidden during the
          // correction. This is the second Obsidian initialization pass.
          if(!revealWindow && saved) {
            revealWindow=temporarilyHideNativePopout(state.native);
          } else if(revealWindow && state.native.isVisible?.() &&
              state.native.getOpacity?.()!==0) {
            // Only re-hide a fallback hide()/show() window that Obsidian
            // showed during rendering. An opacity-guarded window must NOT
            // be hidden here: its reveal restores opacity, not visibility.
            try {state.native.hide?.();} catch{/* reveal below regardless */}
          }
          // If native hide is unavailable, avoid editor reflow artifacts;
          // real OS frame flicker cannot be eliminated on that platform.
          const root=win.document.documentElement;
          const needsTemporaryHide=!revealWindow &&
            !root.hasClass("fnm-geometry-restoring");
          if(needsTemporaryHide) root.addClass("fnm-geometry-restoring");
          try {
            this.prepareInitialGeometry(state.native,desired,file.path);
          } finally {
            // Restore the original class state even when native resizing fails.
            if(needsTemporaryHide) root.removeClass("fnm-geometry-restoring");
          }
        }
      }
      win.addEventListener("beforeunload", state.closeHandler);
      win.addEventListener("keydown", state.escapeHandler, true);
      win.addEventListener("resize", state.geometryHandler);
      win.addEventListener("move", state.geometryHandler);
      win.addEventListener("blur", state.focusLossHandler);
      this.applyChrome(state);
      this.attachCloseInterception(state);
      await this.callbacks.onOpen(file.path);
      state.lastObserved = this.currentGeometry(win,state.native);
      state.restorationMismatch = !sameBounds(state.lastObserved,desired);
      state.initializing = false;
      // Do not overwrite the user's stored narrow dimensions with the host's
      // default size merely because Obsidian failed to honor the restore.
      if(state.restorationMismatch) {
        console.warn("[浮动笔记管理器] 恢复尺寸尚未匹配，保留用户记录",{
          path:state.path,requested:desired,actual:state.lastObserved});
      }
      this.startGeometryPolling(state);
      if (this.callbacks.preferredPin(file.path)) this.pin(file.path, true, false);
      // Single reveal AFTER geometry, editor, chrome and settings are ready.
      revealWindow?.();
      revealWindow=null;
      win.focus();
    } catch (error) {
      // Never leave a native child window permanently hidden after failure.
      revealWindow?.();
      leaf.detach();
      throw error;
    }
  }

  private prepareInitialGeometry(
    native:NativePopoutWindow, desired:WindowBounds, path:string,
  ):void {
    try {
      const result=restoreNativeBoundsBeforeEditor(native,desired);
      if(result.corrected || !sameBounds(result.actual,desired)) {
        console.info("[浮动笔记管理器] 创建阶段原生尺寸修正", {
          path,requested:desired,...result,
        });
      }
    }catch(error){
      console.info("[浮动笔记管理器] 创建阶段原生尺寸修正失败",{
        path,requested:desired,error,
      });
    }
  }

  private displayArea(win: Window): ScreenArea {
    const screen = win.screen as Screen & {availLeft?: number; availTop?: number};
    return {x: screen.availLeft ?? 0, y: screen.availTop ?? 0,
      width: screen.availWidth, height: screen.availHeight};
  }

  private currentGeometry(win: Window, native?:NativePopoutWindow): WindowBounds | undefined {
    return readManagedBounds({
      x:win.screenX,y:win.screenY,width:win.outerWidth,height:win.outerHeight,
    },native);
  }

  private startGeometryPolling(state: PopoutState): void {
    // Chromium may not emit a DOM "move" event for an Electron BrowserWindow.
    // The low-frequency poll catches such changes even if the user never blurs.
    state.pollTimer = state.win.setInterval(() => {
      if (!state.win.closed) this.captureGeometry(state);
    }, 2200);
  }

  private captureByWindow(win: Window): void {
    const state = [...this.openWindows.values()].find((entry) => entry.win === win);
    if (state) this.captureGeometry(state);
  }

  private captureGeometry(state: PopoutState): void {
    if (state.initializing) return;
    const bounds = this.currentGeometry(state.win,state.native);
    if (!bounds || sameBounds(state.lastObserved, bounds)) return;
    if(state.restorationMismatch) {
      // A host resize as the window finishes opening is not a user resize.
      // Once the user actually resizes/moves it, the event handler clears this.
      return;
    }
    state.lastObserved = bounds;
    // Persist now rather than relying only on beforeunload, whose asynchronous
    // tasks may be interrupted when the native child window is torn down.
    void this.callbacks.onBounds(state.path, bounds);
  }

  private scheduleGeometry(win: Window): void {
    const state = [...this.openWindows.values()].find((entry) => entry.win === win);
    if (!state || state.initializing) return;
    state.restorationMismatch=false;
    if (state.geometryTimer !== undefined) win.clearTimeout(state.geometryTimer);
    state.geometryTimer = win.setTimeout(() => {
      state.geometryTimer = undefined;
      this.captureGeometry(state);
    }, 180);
  }

  pin(path: string, enabled: boolean, notify = true): boolean {
    const state=this.openWindows.get(path);
    if(!state||state.win.closed) return false;
    // Bind once by unique geometry, then retain that native window handle even
    // after the user moves or resizes it. This is critical for reliable unpin.
    if(state.native?.isDestroyed?.()) state.native=undefined;
    if(!state.native) {
      const resolution=identifyNativePopout(state.win);
      if(resolution.ok) state.native=resolution.native;
      else {
        console.info("[浮动笔记管理器] 窗口识别诊断",resolution.reason,{
          path:state.path,x:state.win.screenX,y:state.win.screenY,
          width:state.win.outerWidth,height:state.win.outerHeight});
        if(notify) new Notice(resolution.reason==="remote-unavailable"
          ? "未获取到 Electron 窗口接口，无法改变置顶状态。"
          : resolution.reason==="ambiguous"
          ? "多个窗口位置重叠，无法确认目标；请移动其中一个后重试。"
          : "暂时无法匹配此浮窗，请移动窗口后重试。");
        return false;
      }
    }
    const native=state.native;
    try {
      const prior=native.isAlwaysOnTop?.();
      if(prior!==enabled) native.setAlwaysOnTop(enabled);
      const actual=native.isAlwaysOnTop?.();
      if(typeof actual==="boolean"&&actual!==enabled) {
        state.pinned=actual;
        this.updatePinButton(state);
        if(notify) new Notice("系统未确认置顶状态已改变。");
        return false;
      }
      state.pinned=actual??enabled;
      this.updatePinButton(state);
      void this.callbacks.onPin(path,state.pinned);
      return true;
    }catch(error) {
      console.warn("[浮动笔记管理器] 切换置顶失败",error);
      state.native=undefined;
      if(notify) new Notice("切换置顶失败，详细原因已记录到开发者控制台。");
      return false;
    }
  }

  /** Esc, titlebar X and manager's close control tuck away the same leaf. */
  hide(path:string):boolean {
    const state=this.openWindows.get(path);
    if(!state||state.win.closed) return false;
    if(state.hidden) return true;
    this.captureGeometry(state);
    // Retry using this exact popout's own electronWindow. Older builds
    // only matched BrowserWindows by geometry during initialization, which
    // often left state.native undefined after a narrow-window restore.
    const exact=nativeFromChildWindow(state.win,this.mainWindow);
    if(exact && exact!==state.native) this.adoptNative(state,exact);
    let tucked=hideCachedWindow(state.native);
    if(!tucked) {
      const resolution=resolveNativeForChild(state.win,this.mainWindow);
      if(resolution.ok && resolution.native!==state.native) {
        this.adoptNative(state,resolution.native);
        tucked=hideCachedWindow(state.native);
      }
      if(!tucked) {
        console.warn("[浮动笔记管理器] 无法收起原生浮窗",{
          path:state.path,
          reason:resolution.ok?"native-hide-failed":resolution.reason,
          hasNative:!!state.native,
          hasHide:typeof state.native?.hide==="function",
        });
        if(!state.hideErrorReported) {
          state.hideErrorReported=true;
          new Notice("收起失败：无法访问此浮窗的原生隐藏接口。");
        }
        return false;
      }
    }
    state.hideErrorReported=false;
    state.hidden=true;
    state.hiddenOrder=++this.hiddenSequence;
    this.evictHidden();
    return true;
  }

  private reveal(state:PopoutState):boolean {
    if(!state.hidden) return true;
    const exact=nativeFromChildWindow(state.win,this.mainWindow);
    if(exact && exact!==state.native) this.adoptNative(state,exact);
    if(!showCachedWindow(state.native)) {
      const resolution=resolveNativeForChild(state.win,this.mainWindow);
      if(!resolution.ok || resolution.native===state.native) return false;
      this.adoptNative(state,resolution.native);
      if(!showCachedWindow(state.native)) return false;
    }
    state.hidden=false;
    state.hiddenOrder=0;
    state.hideErrorReported=false;
    return true;
  }

  /** Internal cache eviction / plugin cleanup; never deletes the .md file. */
  closePermanently(path:string):boolean {
    const state=this.openWindows.get(path);
    if(!state||state.win.closed) return false;
    this.captureGeometry(state);
    state.permanentlyClosing=true;
    // The close interceptor checks permanentlyClosing and allows this close.
    // Keep beforeunload listeners until the native close actually succeeds.
    try {
      if(state.native?.close && !state.native.isDestroyed?.()) state.native.close();
      else state.win.close();
      if(this.openWindows.get(path)===state) {
        this.detach(state);
        this.openWindows.delete(path);
      }
      return true;
    }catch(error) {
      console.warn("[浮动笔记管理器] 彻底关闭失败",error);
      state.permanentlyClosing=false;
      return false;
    }
  }

  private evictHidden():void {
    const candidates=[...this.openWindows.values()].filter(s=>!s.win.closed);
    for(const path of hiddenEvictionPaths(candidates,this.maxHidden))
      this.closePermanently(path);
  }

  private adoptNative(state:PopoutState,native:NativePopoutWindow):void {
    if(state.native===native) return;
    if(state.nativeCloseHandler && state.native?.removeListener) {
      try {state.native.removeListener("close",state.nativeCloseHandler);}
      catch {/* stale handle */}
    }
    state.nativeCloseHandler=undefined;
    state.native=native;
    this.attachNativeCloseInterception(state);
  }

  private attachNativeCloseInterception(state:PopoutState):void {
    // Prevent destruction only AFTER hide succeeds; otherwise let Obsidian's
    // ordinary close proceed instead of trapping the user in a broken popout.
    if(state.nativeCloseHandler || !state.native?.on || !state.native.removeListener) return;
    const callback=(event:{preventDefault():void}):void=>{
      if(state.permanentlyClosing) return;
      if(this.hide(state.path)) event.preventDefault();
    };
    try {
      state.native.on("close",callback);
      state.nativeCloseHandler=callback;
    }catch(error){console.info("[浮动笔记管理器] 原生关闭事件不可用",error);}
  }

  private attachCloseInterception(state:PopoutState):void {
    this.attachNativeCloseInterception(state);
    // Obsidian's frameless custom titlebar is also a DOM element in some
    // builds. Capture before its default click handler as an additional path.
    const handler=(event:MouseEvent):void=>{
      const target=event.target;
      // Cross-window DOM elements use their own JS realm; instanceof Element
      // from the main Obsidian window can reject a legitimate child target.
      if(!target || typeof (target as Element).closest!=="function") return;
      if(!(target as Element).closest(".titlebar-button.mod-close, .titlebar-button-container .mod-close")) return;
      if(state.permanentlyClosing) return;
      if(this.hide(state.path)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    state.win.document.addEventListener("click",handler,true);
    state.titlebarCloseHandler=handler;
  }

  hideActive(): boolean {
    const active = this.app.workspace.activeLeaf;
    if (!active) return false;
    for (const [path, state] of this.openWindows) {
      if (!state.hidden && (state.leaf === active || active.view.containerEl.ownerDocument.defaultView === state.win)) {
        return this.hide(path);
      }
    }
    return false;
  }

  focus(path: string): boolean {
    const state = this.openWindows.get(path);
    if (!state || state.win.closed) return false;
    if(state.hidden&&!this.reveal(state)) return false;
    state.win.focus();
    return true;
  }
  rename(previous: string, next: string): void {
    const state = this.openWindows.get(previous);
    if (!state) return;
    this.openWindows.delete(previous);
    state.path = next;
    this.openWindows.set(next,state);
  }

  release(win: Window): void {
    const state = [...this.openWindows.values()].find((entry) => entry.win === win);
    if (!state) return;
    this.captureGeometry(state);
    this.detach(state);
    this.openWindows.delete(state.path);
  }

  private detach(state: PopoutState): void {
    if(state.nativeCloseHandler&&state.native?.removeListener) {
      try {state.native.removeListener("close",state.nativeCloseHandler);}
      catch {/* destroyed native handle */}
    }
    state.nativeCloseHandler=undefined;
    if(state.titlebarCloseHandler)
      state.win.document.removeEventListener("click",state.titlebarCloseHandler,true);
    state.titlebarCloseHandler=undefined;
    const {win} = state;
    if (state.geometryTimer !== undefined) win.clearTimeout(state.geometryTimer);
    if (state.pollTimer !== undefined) win.clearInterval(state.pollTimer);
    win.removeEventListener("beforeunload", state.closeHandler);
    win.removeEventListener("keydown", state.escapeHandler, true);
    win.removeEventListener("resize", state.geometryHandler);
    win.removeEventListener("move", state.geometryHandler);
    win.removeEventListener("blur", state.focusLossHandler);
    this.removeChrome(state);
  }

  private handleEscape(event: KeyboardEvent, win: Window): void {
    if (!this.callbacks.closeOnEscape() || event.key !== "Escape" ||
      event.defaultPrevented || event.isComposing || event.keyCode === 229 ||
      event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    const doc = win.document;
    if (doc.querySelector(".modal-container, .menu, .suggestion-container:not(.is-hidden), .popover, .cm-tooltip")) return;
    const state = [...this.openWindows.values()].find((item) => item.win === win);
    if (!state) return;
    event.preventDefault();
    event.stopPropagation();
    this.hide(state.path);
  }

  refreshChrome(): void {
    for (const state of this.openWindows.values()) this.applyChrome(state);
  }
  private applyChrome(state: PopoutState): void {
    this.removeChrome(state);
    const doc = state.win.document;
    if (!doc.body) return;
    doc.body.addClass("fnm-managed-window");
    if (this.callbacks.minimalChrome()) doc.body.addClass("fnm-managed-popout");
    // Use the child document's own element helper to avoid cross-window DOM
    // ownership issues and to follow Obsidian's createEl conventions.
    const button=doc.body.createEl("button",{
      cls:"fnm-pin-action clickable-icon",
      attr:{"type":"button","aria-label":"切换浮动窗口置顶"},
    });
    button.addEventListener("click", () => this.pin(state.path, !state.pinned));
    state.pinButton = button;
    this.updatePinButton(state);
  }
  private updatePinButton(state: PopoutState): void {
    const button = state.pinButton;
    if (!button) return;
    setIcon(button, state.pinned ? "pin" : "pin-off");
    button.setAttribute("aria-pressed", String(state.pinned));
    button.title = state.pinned ? "取消置顶" : "始终置顶";
  }
  private removeChrome(state: PopoutState): void {
    state.win.document.body.removeClass("fnm-managed-popout");
    state.win.document.body.removeClass("fnm-managed-window");
    state.pinButton?.remove();
    state.pinButton = undefined;
  }

  dispose(): void {
    this.mainWindow?.removeEventListener("beforeunload",this.onMainUnload);
    // Invisible children must not survive disabling/reloading the plugin;
    // leave visible user note windows alone and remove our hooks.
    for (const state of [...this.openWindows.values()]) {
      if(state.hidden) this.closePermanently(state.path);
      else {
        this.captureGeometry(state);
        this.detach(state);
      }
    }
    this.openWindows.clear();
  }
}
