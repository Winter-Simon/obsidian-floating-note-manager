export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NoteRecord {
  path: string;
  lastOpenedAt: number;
  pinned: boolean;
  bounds?: WindowBounds;
}

export const MAX_RECENT = 150;
export const DEFAULT_WIDTH = 420;
export const DEFAULT_HEIGHT = 660;

/** Read only bounded, finite geometry from untrusted plugin data. */
export function readBounds(raw: unknown): WindowBounds | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Partial<WindowBounds>;
  const values = [candidate.x, candidate.y, candidate.width, candidate.height];
  if (values.some((n) => typeof n !== "number" || !Number.isFinite(n))) return null;
  const {x, y, width, height} = candidate as WindowBounds;
  if (Math.abs(x) > 20000 || Math.abs(y) > 20000 ||
      width < 1 || width > 5000 || height < 1 || height > 4000) return null;
  return {x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height)};
}

/** Keep restored windows visible on the display containing the new popout. */
export function fitBounds(
  raw: WindowBounds | null,
  display: ScreenArea,
  defaults: {width: number; height: number} = {width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT},
): WindowBounds {
  const area = Number.isFinite(display.x) && Number.isFinite(display.y) &&
    Number.isFinite(display.width) && Number.isFinite(display.height) &&
    display.width >= 400 && display.height >= 320
    ? display : {x: 0, y: 0, width: 1280, height: 800};
  const limitWidth = Math.max(320, Math.floor(area.width * 0.96));
  const limitHeight = Math.max(240, Math.floor(area.height * 0.94));
  const width = Math.max(Math.min(420, limitWidth), Math.min(limitWidth, raw?.width ?? defaults.width));
  const height = Math.max(Math.min(300, limitHeight), Math.min(limitHeight, raw?.height ?? defaults.height));
  const centerX = Math.round(area.x + (area.width - width) / 2);
  const centerY = Math.round(area.y + (area.height - height) / 2);
  const savedPositionValid = raw !== null &&
    raw.x + raw.width > area.x + 80 && raw.y + raw.height > area.y + 60 &&
    raw.x < area.x + area.width - 80 && raw.y < area.y + area.height - 60;
  const x = savedPositionValid ? Math.max(area.x, Math.min(area.x + area.width - width, raw.x)) : centerX;
  const y = savedPositionValid ? Math.max(area.y, Math.min(area.y + area.height - height, raw.y)) : centerY;
  return {x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height)};
}

/** The 0.1.1 prototype saved its initial 800×560 frame as if user-resized.
 * Clear only that recognizable legacy preset; preserve all other saved geometry. */
export function dropLegacyPreset(bounds: WindowBounds | null): WindowBounds | null {
  if (bounds && bounds.width === 800 && bounds.height >= 558 && bounds.height <= 565) return null;
  return bounds;
}

/** Windows rejects ASCII control characters in path segments. Check them
 * explicitly instead of a control-character regexp (which trips lint). */
function hasControlCharacter(value:string):boolean {
  for(const ch of value) if(ch.charCodeAt(0)<32)return true;
  return false;
}

/** Reject absolute, escaping, and ambiguous vault paths. */
export function validateScratchFolder(input: string): string {
  const folder = input.trim().replace(/\\/g, "/").replace(/\/+$/g, "");
  if (!folder) return "";
  if (folder.startsWith("/") || /^[A-Za-z]:/.test(folder) ||
      folder.split("/").some((segment) => !segment || segment === "." || segment === "..") ||
      /[<>:"|?*]/.test(folder) || hasControlCharacter(folder)) {
    throw new Error("草稿目录必须是库内相对路径，且不能包含非法字符。");
  }
  return folder;
}

/** Converts a user-provided note name to a safe vault basename (no .md).
 * Never auto-generate an opaque filename, never interpret path separators. */
export function validateScratchName(input: string): string {
  const raw = input.trim();
  const name = raw.replace(/\.md$/i, "").trim();
  if (!name || name.length > 120 || name === "." || name === ".." ||
      name.endsWith(".") || /[\\/<>:"|?*]/.test(name) || hasControlCharacter(name) ||
      /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i.test(name)) {
    throw new Error("请输入有效的笔记名称（不含路径或非法字符，最长 120 字）。");
  }
  return name;
}

export function touch(records: NoteRecord[], path: string, now = Date.now()): NoteRecord[] {
  const previous = records.find((r) => r.path === path);
  return [{...previous, path, lastOpenedAt: now, pinned: previous?.pinned ?? false},
    ...records.filter((r) => r.path !== path)]
    .sort((a,b) => b.lastOpenedAt - a.lastOpenedAt).slice(0, MAX_RECENT);
}

export function setPinned(records: NoteRecord[], path: string, pinned: boolean): NoteRecord[] {
  return records.map((r) => r.path === path ? {...r, pinned} : r);
}

export function setNoteBounds(records: NoteRecord[], path: string, bounds: WindowBounds): NoteRecord[] {
  return records.map((r) => r.path === path ? {...r, bounds} : r);
}

export function renamePath(records: NoteRecord[], previous: string, next: string): NoteRecord[] {
  const original = records.find((r) => r.path === previous);
  if (!original || previous === next) return records;
  return [...records.filter((r) => r.path !== previous && r.path !== next),
    {...original, path: next}].sort((a,b) => b.lastOpenedAt-a.lastOpenedAt);
}

export function removePath(records: NoteRecord[], path: string): NoteRecord[] {
  return records.filter((r) => r.path !== path);
}

export function readRecords(raw: unknown): NoteRecord[] {
  if (!Array.isArray(raw)) return [];
  const records: NoteRecord[] = [], seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Partial<NoteRecord>;
    if (typeof candidate.path !== "string" || !candidate.path.endsWith(".md") ||
      candidate.path.length > 1024 || seen.has(candidate.path)) continue;
    seen.add(candidate.path);
    const bounds = readBounds(candidate.bounds);
    records.push({
      path: candidate.path,
      lastOpenedAt: typeof candidate.lastOpenedAt === "number" && Number.isFinite(candidate.lastOpenedAt)
        ? Math.max(0, candidate.lastOpenedAt) : 0,
      pinned: candidate.pinned === true,
      ...(bounds ? {bounds} : {}),
    });
  }
  return records.sort((a,b) => b.lastOpenedAt-a.lastOpenedAt).slice(0,MAX_RECENT);
}
