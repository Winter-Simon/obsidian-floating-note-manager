/** Native popout coordinates and sizes are in logical desktop pixels. */
export interface WindowBounds {x:number; y:number; width:number; height:number}
export interface ScreenArea {x:number; y:number; width:number; height:number}
export const DEFAULT_WINDOW_SIZE = {width:420,height:660};
/** The plugin imposes no minimum window size. The native window system
 * may have a platform minimum independent of this geometry policy. */
export function validBounds(raw:unknown):WindowBounds|undefined {
  if(!raw || typeof raw!=="object") return;
  const b=raw as Partial<WindowBounds>;
  if(![b.x,b.y,b.width,b.height].every(v=>typeof v==="number"&&Number.isFinite(v))) return;
  if(b.width!<1||b.height!<1||b.width!>10000||b.height!>10000||
    Math.abs(b.x!)>100000||Math.abs(b.y!)>100000) return;
  return {x:Math.round(b.x!),y:Math.round(b.y!),width:Math.round(b.width!),height:Math.round(b.height!)};
}

/** Match only a unique candidate; never assume the main window is the popout. */
export function matchWindowByBounds<T extends {getBounds():WindowBounds}>(
  windows:T[], target:WindowBounds|undefined,
):T|null {
  if(!target) return null;
  const matched:T[]=[];
  for(const candidate of windows) {
    try {
      const b=validBounds(candidate.getBounds());
      if(b&&Math.abs(b.x-target.x)<=48&&Math.abs(b.y-target.y)<=48&&
         Math.abs(b.width-target.width)<=80&&Math.abs(b.height-target.height)<=80)
        matched.push(candidate);
    }catch {/* native window already disposed */}
  }
  return matched.length===1?matched[0]:null;
}

export function sameBounds(a:WindowBounds|undefined,b:WindowBounds|undefined):boolean {
  return !!a&&!!b&&a.x===b.x&&a.y===b.y&&a.width===b.width&&a.height===b.height;
}

export function safeScreen(raw:ScreenArea):ScreenArea {
  if(![raw.x,raw.y,raw.width,raw.height].every(Number.isFinite)||
     raw.width<240||raw.height<200) return {x:0,y:0,width:1280,height:800};
  return raw;
}

/** A new note (without saved geometry) opens centered. A previously opened
 * note retains its position only when entirely visible in the available area.
 * Bounds from disconnected displays are centered, never stranded offscreen. */
export function placeBounds(saved:WindowBounds|undefined,area:ScreenArea,
  defaults=DEFAULT_WINDOW_SIZE):WindowBounds {
  const screen=safeScreen(area);
  const maxWidth=screen.width;
  const maxHeight=screen.height;
  const width=Math.min(Math.max(1,saved?.width??defaults.width),maxWidth);
  const height=Math.min(Math.max(1,saved?.height??defaults.height),maxHeight);
  const maxX=screen.x+screen.width-width, maxY=screen.y+screen.height-height;
  const centerX=Math.round(screen.x+(screen.width-width)/2);
  const centerY=Math.round(screen.y+(screen.height-height)/2);
  // Preserve the actual resized width. A window partly outside the usable
  // desktop should slide back INSIDE it, not be unexpectedly recentered.
  const clamp=(value:number,low:number,high:number)=>Math.max(low,Math.min(high,value));
  // A completely disconnected/offscreen position cannot be recovered;
  // re-center there. But a partly clipped window should slide back in
  // without changing its width or unexpectedly moving to the center.
  const intersects=!!saved &&
    saved.x<screen.x+screen.width && saved.x+saved.width>screen.x &&
    saved.y<screen.y+screen.height && saved.y+saved.height>screen.y;
  const x=intersects ? clamp(saved!.x,screen.x,maxX) : centerX;
  const y=intersects ? clamp(saved!.y,screen.y,maxY) : centerY;
  return {x,y,width:Math.round(width),height:Math.round(height)};
}

/** Cold popouts preserve width and height, never historical position. */
export function centerSavedSize(saved:WindowBounds|undefined,area:ScreenArea,
  defaults=DEFAULT_WINDOW_SIZE):WindowBounds {
  const clean=saved?{...saved,x:Number.POSITIVE_INFINITY,y:Number.POSITIVE_INFINITY}:undefined;
  return placeBounds(clean,area,defaults);
}

/** Resolve the correct available work area among connected monitors.
 * Never fall back to a disconnected monitor's historical coordinates. */
export function selectDisplay(saved:WindowBounds|undefined,displays:ScreenArea[],
  fallback:ScreenArea):ScreenArea {
  const screens=displays.map(safeScreen);
  if(!saved) return safeScreen(fallback);
  const cx=saved.x+saved.width/2,cy=saved.y+saved.height/2;
  return screens.find(s=>cx>=s.x&&cx<s.x+s.width&&cy>=s.y&&cy<s.y+s.height) ?? safeScreen(fallback);
}
