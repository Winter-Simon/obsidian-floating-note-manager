import type {GlobalShortcutAPI} from "./global-hotkey.ts";

type HostWindow=Window&{
  require?:(name:string)=>unknown;
  electron?:{remote?:RemoteAPI};
};
interface RemoteAPI {
  globalShortcut?:GlobalShortcutAPI;
  require?:(name:string)=>unknown;
}
function isGlobalShortcut(value:unknown):value is GlobalShortcutAPI {
  const api=value as GlobalShortcutAPI|null;
  return !!api && typeof api.register==="function" &&
    typeof api.unregister==="function";
}
function findRemote(main:Window):RemoteAPI|null {
  const win=main as HostWindow;
  const candidates:unknown[]=[win.electron?.remote];
  for(const load of [win.require,typeof require==="function"?require:undefined]){
    if(typeof load!=="function")continue;
    for(const name of ["@electron/remote","electron"]){
      try{
        const imported=load(name) as RemoteAPI & {remote?:RemoteAPI};
        // Renderer 'electron' itself is NOT the main-process shortcut API.
        // Only @electron/remote or the legacy electron.remote bridge qualify.
        if(name==="@electron/remote")candidates.push(imported);
        else if(imported?.remote)candidates.push(imported.remote);
      }catch{/* Renderer cannot load this module on some Obsidian builds. */}
    }
  }
  for(const candidate of candidates){
    const remote=candidate as RemoteAPI|null;
    if(remote && (isGlobalShortcut(remote.globalShortcut) ||
       typeof remote.require==="function"))return remote;
  }
  return null;
}

/** Electron's globalShortcut belongs to the MAIN process. Never treat a
 * renderer require('electron').globalShortcut as a valid main-process bridge.
 * The optional remote bridge is version-dependent; fail closed if unavailable. */
export function findMainProcessGlobalShortcut(main:Window):GlobalShortcutAPI|null {
  const remote=findRemote(main);
  if(!remote)return null;
  if(isGlobalShortcut(remote.globalShortcut))return remote.globalShortcut;
  try{
    const electron=remote.require?.("electron") as {globalShortcut?:unknown}|undefined;
    if(isGlobalShortcut(electron?.globalShortcut))return electron.globalShortcut;
  }catch{/* Remote main-process require is disabled. */}
  return null;
}
