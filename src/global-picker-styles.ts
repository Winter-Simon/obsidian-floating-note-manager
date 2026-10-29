/** Self-contained scoped styles for the dedicated child picker.
 * Obsidian does not guarantee that styles.css is copied to every dynamically
 * opened popout window before a custom ItemView starts rendering.
 * The selector is scoped to an explicitly identified WorkspaceWindow doc. */
export const PICKER_STYLE_ID="fnm-global-picker-window-styles";
export const PICKER_WINDOW_CSS=`
body.fnm-global-picker-window .workspace-tab-header-container {
  height: 32px !important;
  min-height: 32px !important;
  -webkit-app-region: drag;
}
body.fnm-global-picker-window .workspace-tab-header-container-inner,
body.fnm-global-picker-window .workspace-tab-header-new-tab,
body.fnm-global-picker-window .workspace-tab-header-tab-list,
body.fnm-global-picker-window .view-header,
body.fnm-global-picker-window .workspace-ribbon,
body.fnm-global-picker-window .side-dock-ribbon {display:none !important;}
body.fnm-global-picker-window .fnm-global-picker-leaf,
body.fnm-global-picker-window .fnm-global-picker-leaf .view-content {
  height:100%; min-height:0;
}
body.fnm-global-picker-window .fnm-global-picker-leaf .view-content {
  padding:0 !important; overflow:hidden;
}
body.fnm-global-picker-window .fnm-global-picker {
  display:flex; flex-direction:column; height:100%; width:100%; max-width:none;
  padding:10px 14px 12px; background:var(--background-primary);
  color:var(--text-normal);
}
body.fnm-global-picker-window .fnm-global-picker-header {
  display:flex; align-items:center; gap:9px; min-height:36px;
  margin-bottom:8px; font-size:var(--font-ui-medium); font-weight:600;
}
body.fnm-global-picker-window .fnm-global-picker-header .fnm-new-button {margin-left:auto;}
body.fnm-global-picker-window .fnm-global-picker .fnm-search-box {
  display:flex; align-items:center; gap:9px; min-height:39px;
  padding:0 11px; margin-bottom:9px; border-radius:9px;
  background:var(--background-secondary);
  border:1px solid var(--background-modifier-border);
}
body.fnm-global-picker-window .fnm-global-picker .fnm-search-box input {
  flex:1; min-width:0; width:100%; background:transparent !important;
  border:0 !important; box-shadow:none !important; outline:0 !important;
}
body.fnm-global-picker-window .fnm-global-picker .fnm-list {
  flex:1; min-height:0; max-height:none; overflow-y:auto;
}
body.fnm-global-picker-window .fnm-global-picker .fnm-group {margin:8px 0;}
body.fnm-global-picker-window .fnm-global-picker .fnm-group-title {
  display:flex; gap:8px; padding:5px 10px 7px;
  color:var(--text-muted); font-size:var(--font-smallest);
}
body.fnm-global-picker-window .fnm-global-picker .fnm-row {
  display:flex; align-items:center; position:relative; border-radius:8px;
  margin:2px 0; border:1px solid transparent;
}
body.fnm-global-picker-window .fnm-global-picker .fnm-row:hover {
  background:var(--background-modifier-hover);
}
body.fnm-global-picker-window .fnm-global-picker .fnm-row.fnm-selected {
  background:color-mix(in srgb,var(--interactive-accent) 24%,var(--background-primary));
  border-color:color-mix(in srgb,var(--interactive-accent) 37%,transparent);
}
body.fnm-global-picker-window .fnm-global-picker .fnm-row-main {
  display:flex; align-items:center; flex:1; min-width:0; min-height:42px;
  gap:10px; padding:6px 10px; border:0 !important; box-shadow:none !important;
  background:transparent !important; color:var(--text-normal); text-align:left;
}
body.fnm-global-picker-window .fnm-global-picker .fnm-row-labels {min-width:0; flex:1;}
body.fnm-global-picker-window .fnm-global-picker .fnm-row-title {
  display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
body.fnm-global-picker-window .fnm-global-picker .fnm-row-actions {
  display:flex; align-items:center; gap:2px; margin-right:8px;
}
body.fnm-global-picker-window .fnm-global-picker .fnm-icon-button {
  width:28px; height:28px; padding:0; border:0; background:transparent;
  color:var(--text-muted); box-shadow:none; cursor:pointer;
}
body.fnm-global-picker-window .fnm-global-picker .fnm-empty,
body.fnm-global-picker-window .fnm-picker-error {
  padding:20px 12px; text-align:center; color:var(--text-muted);
}
body.fnm-global-picker-window .fnm-global-picker button,
body.fnm-global-picker-window .fnm-global-picker input {
  -webkit-app-region:no-drag;
}
`;

export function installPickerWindowStyles(doc:Document):void {
  if(doc.getElementById(PICKER_STYLE_ID))return;
  const style=doc.createElement("style");
  style.id=PICKER_STYLE_ID;
  style.textContent=PICKER_WINDOW_CSS;
  (doc.head??doc.documentElement).appendChild(style);
}
export function removePickerWindowStyles(doc:Document):void {
  doc.getElementById(PICKER_STYLE_ID)?.remove();
}
