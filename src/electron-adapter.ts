import {matchWindowByBounds, sameBounds, validBounds, type WindowBounds, type ScreenArea} from "./geometry.ts";

/** Electron APIs are private/optional in Obsidian community plugins. */
export interface NativePopoutWindow {
  id?:number;
  getBounds():WindowBounds;
  setAlwaysOnTop(enabled:boolean):void;
  isAlwaysOnTop?():boolean;
  isDestroyed?():boolean;
  setMinimumSize?(width:number,height:number):void;
  setBounds?(bounds:WindowBounds):void;
  hide?():void;
  show?():void;
  isVisible?():boolean;
  focus?():void;
  close?():void;
  on?(event:"close",listener:(event:{preventDefault():void})=>void):void;
  removeListener?(event:"close",listener:(event:{preventDefault():void})=>void):void;
  setOpacity?(opacity:number):void;
  getOpacity?():number;
}

/** Obsidian exposes the native BrowserWindow on the popout DOM window
 * itself. This is a stronger identity than screen-position matching, especially
 * after restoring a narrow note or moving windows. Never touch the main window. */
export function nativeFromChildWindow(
  child:Window,main:Window|null,
):NativePopoutWindow|null {
  if(!child || child===main || child.closed) return null;
  try {
    const native=(child as Window&{electronWindow?:NativePopoutWindow}).electronWindow;
    const parent=(main as (Window&{electronWindow?:NativePopoutWindow})|null)?.electronWindow;
    if(native && native!==parent && typeof native.getBounds==="function" &&
      typeof native.setAlwaysOnTop==="function" &&
      !native.isDestroyed?.()) return native;
  }catch{/* Child may have closed while resolving. */}
  return null;
}

/** Resolve a verified child: exact native reference first, bounds lookup last.
 * The fallback is only used for a distinct child, never the main renderer. */
export function resolveNativeForChild(
  child:Window,main:Window|null,
):NativeResolution {
  if(!child||child===main||child.closed)
    return {ok:false,reason:"invalid-child"};
  const direct=nativeFromChildWindow(child,main);
  if(direct) return {ok:true,native:direct};
  return identifyNativePopout(child);
}

/** Obsidian's window-open event can expose the exact child BrowserWindow
 * before openPopoutLeaf returns; prefer its direct handle to geometry guessing.
 * Never return the main window's handle. */
export function nativeFromWorkspaceEvent(
  workspaceWindow:{win:Window},child:Window,main:Window,
):NativePopoutWindow|null {
  if(!child||child===main||workspaceWindow.win!==child) return null;
  const direct=nativeFromChildWindow(child,main);
  if(direct) return direct;
  const workspace=workspaceWindow as {electronWindow?:NativePopoutWindow};
  for(const native of [workspace.electronWindow]) {
    if(native&&typeof native.getBounds==="function"&&
      typeof native.setAlwaysOnTop==="function"&&!native.isDestroyed?.()) return native;
  }
  const resolution=resolveNativeForChild(child,main);
  return resolution.ok?resolution.native:null;
}

/** Hide the entire native window, including its frame, while Obsidian
 * initializes its editor and may override the requested popout size.
 * The returned reveal callback is idempotent and MUST be called on errors.
 * Do not use on the main window or an unverified candidate. */
export function temporarilyHideNativePopout(
  native:NativePopoutWindow,
):(() => void)|null {
  // Opacity guards against Obsidian calling show() during openFile(),
  // which otherwise reveals a temporarily oversized frame.
  if(typeof native.setOpacity==="function") {
    try {
      const oldOpacity=native.getOpacity?.()??1;
      native.setOpacity(0);
      let pending=true;
      return ()=>{
        if(!pending) return;
        pending=false;
        try {if(!native.isDestroyed?.()) native.setOpacity?.(oldOpacity);}
        catch(error){console.warn("[浮动笔记管理器] 恢复窗口透明度失败",error);}
      };
    }catch(error){console.info("[浮动笔记管理器] 原生透明度不可用",error);}
  }
  if(typeof native.hide!=="function"||typeof native.show!=="function") return null;
  try {
    native.hide();
    let pending=true;
    return ()=>{
      if(!pending) return;
      pending=false;
      try {if(!native.isDestroyed?.()) native.show?.();}
      catch(error){console.warn("[浮动笔记管理器] 恢复原生窗口显示失败",error);}
    };
  }catch(error) {
    console.info("[浮动笔记管理器] 无法预先隐藏浮窗",error);
    return null;
  }
}

/** Must run before the note view is rendered. Unlike the old post-open
 * correction, this does not visually resize already-displayed editor content.
 * All bounds are native logical pixels (DIP). */
export function restoreNativeBoundsBeforeEditor(
  native:NativePopoutWindow, desired:WindowBounds,
):{initial:WindowBounds|undefined; actual:WindowBounds|undefined; corrected:boolean} {
  native.setMinimumSize?.(1,1);
  const initial=validBounds(native.getBounds());
  const corrected=!!initial && !sameBounds(initial,desired) && !!native.setBounds;
  if(corrected) native.setBounds?.(desired);
  return {initial,actual:validBounds(native.getBounds()),corrected};
}

/** Prioritize native geometry when user resizes a floating window; DOM
 * outerWidth can be stale while the compositor is finishing a resize. */
export function readManagedBounds(
  domBounds:WindowBounds,native?:NativePopoutWindow,
):WindowBounds|undefined {
  try {
    if(native&&!native.isDestroyed?.()) {
      const physical=validBounds(native.getBounds());
      if(physical) return physical;
    }
  }catch{/* Closed between window lookup and bounds query. */}
  return validBounds(domBounds);
}

interface RemoteModule {
  BrowserWindow?:{getAllWindows?():NativePopoutWindow[]};
  screen?:{getAllDisplays?():Array<{workArea:ScreenArea}>};
  remote?:RemoteModule;
}
type ElectronRequire=(id:string)=>unknown;
type ExtendedWindow=Window&{
  require?:ElectronRequire;
  electron?:{remote?:RemoteModule};
};
export type NativeResolution =
  | {ok:true; native:NativePopoutWindow}
  | {ok:false; reason:"invalid-child"|"remote-unavailable"|"invalid-geometry"|"no-match"|"ambiguous"|"lookup-failed"};

function findRemote(win:Window):RemoteModule|null {
  const child=win as ExtendedWindow;
  const root=win.opener as ExtendedWindow|null;
  const main=window as ExtendedWindow;
  const modules:unknown[]=[child.electron?.remote,root?.electron?.remote,main.electron?.remote];
  const requireFunctions=[child.require,root?.require,main.require,
    typeof require==="function"?require:undefined];
  for(const load of requireFunctions) {
    if(typeof load!=="function") continue;
    for(const name of ["@electron/remote","electron"]) {
      try {
        const imported=load(name) as RemoteModule;
        modules.push(imported?.remote??imported);
      }catch{/* unavailable in this Electron context */}
    }
  }
  for(const module of modules) {
    const candidate=module as RemoteModule|undefined;
    if(typeof candidate?.BrowserWindow?.getAllWindows==="function") return candidate;
  }
  return null;
}

/** Bind only when this child has a unique geometry match among native windows. */
export function identifyNativePopout(win:Window):NativeResolution {
  const remote=findRemote(win);
  if(!remote?.BrowserWindow?.getAllWindows) return {ok:false,reason:"remote-unavailable"};
  const geometry=validBounds({x:win.screenX,y:win.screenY,
    width:win.outerWidth,height:win.outerHeight});
  if(!geometry) return {ok:false,reason:"invalid-geometry"};
  try {
    const all=remote.BrowserWindow.getAllWindows();
    const matched=matchWindowByBounds(all,geometry);
    if(matched) return {ok:true,native:matched};
    const neighbors=all.filter(candidate=>{
      try {
        const b=validBounds(candidate.getBounds());
        return !!b&&Math.abs(b.x-geometry.x)<=48&&Math.abs(b.y-geometry.y)<=48&&
          Math.abs(b.width-geometry.width)<=80&&Math.abs(b.height-geometry.height)<=80;
      }catch{return false;}
    });
    return {ok:false,reason:neighbors.length>1?"ambiguous":"no-match"};
  }catch{return {ok:false,reason:"lookup-failed"};}
}

export function getAvailableDisplays(win:Window):ScreenArea[] {
  try {
    const remote=findRemote(win);
    return remote?.screen?.getAllDisplays?.()
      .map(display=>display.workArea)
      .filter(area=>area&&[area.x,area.y,area.width,area.height].every(Number.isFinite))??[];
  }catch{return [];}
}
