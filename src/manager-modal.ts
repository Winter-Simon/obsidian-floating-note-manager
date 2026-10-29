import {App, Modal, Notice, setIcon, TFile} from "obsidian";
import type FloatingNotePlugin from "./main";
import {navigateIndex,pickerKeyboardAction,type PickerFocus} from "./keyboard-selection";

/** Operates on real vault files. A list/control surface, never a new Markdown editor. */
export class FloatingNoteManagerModal extends Modal {
  private searchEl!: HTMLInputElement;
  private listEl!: HTMLDivElement;
  private selectedIndex = 0;
  private keyboardSelecting = false;
  private itemButtons: HTMLButtonElement[] = [];
  /** Modal.scope is the active Obsidian keymap while the modal is open.
   * DOM document listeners may never receive arrows intercepted by Obsidian. */
  private handleScopedKey(event: KeyboardEvent): false | void {
    if(event.isComposing||event.keyCode===229||
       event.altKey||event.ctrlKey||event.metaKey||event.shiftKey) return;
    const target=event.target instanceof HTMLElement?event.target:null;
    let focus:PickerFocus="modal";
    if(target&&this.modalEl.contains(target)) {
      if(target.closest("textarea,select,[contenteditable='true']") ||
        (target.matches("input")&&target!==this.searchEl)) focus="other-input";
      else if(target===this.searchEl) focus="search";
      else if(target.closest(".fnm-row-main")) focus="result";
      else if(target.closest(".fnm-new-button")) focus="toolbar";
    }
    const action=pickerKeyboardAction(event.key,focus,false,this.keyboardSelecting);
    if(!action||!this.itemButtons.length) return;
    if(action==="activate") {
      this.itemButtons[this.selectedIndex]?.click();
      return false;
    }
    this.keyboardSelecting=true;
    this.selectedIndex=navigateIndex(this.selectedIndex,this.itemButtons.length,
      action==="next"?1:-1);
    this.applySelection(true);
    return false;
  }
  constructor(app: App, private readonly plugin: FloatingNotePlugin) { super(app); }

  onOpen(): void {
    this.modalEl.addClass("fnm-manager");
    this.titleEl.empty();
    const titleIcon = this.titleEl.createSpan({cls:"fnm-title-icon"});
    setIcon(titleIcon,"notebook-pen");
    this.titleEl.createSpan({text:"Floating Note Manager"});
    this.contentEl.empty();

    const button = this.titleEl.createEl("button", {
      cls:"fnm-new-button clickable-icon",
      attr:{"aria-label":"新建浮动草稿","title":"新建浮动草稿"},
    });
    setIcon(button,"plus");
    button.addEventListener("click", () => {
      this.close();
      this.plugin.showNewScratchPrompt();
    });

    const searchBox = this.contentEl.createDiv({cls:"fnm-search-box"});
    const searchIcon = searchBox.createSpan({cls:"fnm-search-icon"});
    setIcon(searchIcon,"search");
    this.searchEl = searchBox.createEl("input", {
      type:"search",cls:"fnm-search",placeholder:"搜索笔记名称或路径…",
      attr:{"aria-label":"搜索 Obsidian 笔记","autocomplete":"off","spellcheck":"false"},
    });
    this.searchEl.addEventListener("input", () => {
      this.selectedIndex = 0;
      this.keyboardSelecting = false;
      this.renderList(this.searchEl.value);
    });
    // Register with the modal's native keymap scope, not a DOM listener.
    this.scope.register([], "ArrowDown", (event) => this.handleScopedKey(event));
    this.scope.register([], "ArrowUp", (event) => this.handleScopedKey(event));
    this.scope.register([], "Enter", (event) => this.handleScopedKey(event));
    this.listEl = this.contentEl.createDiv({cls:"fnm-list",attr:{"role":"list","aria-label":"浮动笔记列表"}});
    this.renderList("");
    this.searchEl.focus();
    this.modalEl.ownerDocument.defaultView?.setTimeout(() => {
      if(this.modalEl.isConnected) this.searchEl.focus();
    },0);
  }

  private renderList(query: string): void {
    this.listEl.empty();
    this.itemButtons = [];
    const fileMap = new Map(this.app.vault.getMarkdownFiles().map((file) => [file.path, file]));
    const opened = this.plugin.windows.listOpen()
      .map((path) => fileMap.get(path)).filter((file): file is TFile => !!file);
    const openedSet = new Set(opened.map((file) => file.path));
    const tucked = this.plugin.windows.listHidden()
      .map((path) => fileMap.get(path)).filter((file): file is TFile => !!file);
    const tuckedSet = new Set(tucked.map((file) => file.path));
    const recents = this.plugin.settings.recent
      .map((item) => fileMap.get(item.path))
      .filter((file): file is TFile => !!file && !openedSet.has(file.path) && !tuckedSet.has(file.path));
    const needle = query.trim().toLocaleLowerCase();

    if (needle) {
      const recentOrder = new Map(this.plugin.settings.recent.map((item,i) => [item.path,i]));
      const matches = [...fileMap.values()].filter((file) => file.path.toLocaleLowerCase().includes(needle))
        .sort((a,b) => {
          const aOpen = openedSet.has(a.path) ? 0 : tuckedSet.has(a.path) ? 1 : 2;
          const bOpen = openedSet.has(b.path) ? 0 : tuckedSet.has(b.path) ? 1 : 2;
          if (aOpen !== bOpen) return aOpen-bOpen;
          return (recentOrder.get(a.path) ?? 100000) - (recentOrder.get(b.path) ?? 100000)
            || a.basename.localeCompare(b.basename, "zh-CN");
        }).slice(0, 60);
      this.addGroup("搜索结果", matches);
      if(!matches.length) this.renderEmpty("没有找到匹配的笔记");
      this.applySelection(false);
      return;
    }

    if(opened.length) this.addGroup("已打开",opened);
    if(tucked.length) this.addGroup("已收起",tucked);
    if(recents.length) this.addGroup("最近使用",recents.slice(0,15));
    if(!opened.length&&!tucked.length&&!recents.length)
      this.renderEmpty("暂无最近笔记");
    this.applySelection(false);
  }

  private applySelection(scroll: boolean): void {
    this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.itemButtons.length - 1));
    this.itemButtons.forEach((button, index) => {
      const selected = index === this.selectedIndex;
      button.toggleClass("fnm-selected",selected);
      button.parentElement?.toggleClass("fnm-selected",selected);
      if(selected) button.setAttribute("aria-current","true");
      else button.removeAttribute("aria-current");
    });
    if (scroll) this.itemButtons[this.selectedIndex]?.scrollIntoView({block:"nearest"});
  }

  private renderEmpty(title:string):void {
    this.listEl.createDiv({cls:"fnm-empty",text:title});
  }

  private addGroup(title:string,files:TFile[]):void {
    if(!files.length) return;
    const section=this.listEl.createDiv({cls:"fnm-group",attr:{"role":"group","aria-label":title}});
    const heading=section.createDiv({cls:"fnm-group-title"});
    heading.createSpan({text:title});
    heading.createSpan({cls:"fnm-count",text:String(files.length)});
    for(const file of files) this.addRow(section,file);
  }

  private addRow(parent: HTMLElement, file: TFile): void {
    const row=parent.createDiv({cls:"fnm-row",attr:{"role":"listitem"}});
    const main=row.createEl("button",{
      cls:"fnm-row-main",
      attr:{"aria-label":"打开或聚焦："+file.basename,"title":file.path},
    });
    const fileIcon=main.createSpan({cls:"fnm-file-icon"});
    setIcon(fileIcon,"file-text");
    const labels=main.createSpan({cls:"fnm-row-labels"});
    labels.createSpan({cls:"fnm-row-title",text:file.basename});
    const actions=row.createDiv({cls:"fnm-row-actions"});
    this.itemButtons.push(main);
    main.addEventListener("click", () => {
      this.close();
      void this.plugin.openNote(file).catch((error) => new Notice("打开失败：" + String(error)));
    });
    if(this.plugin.windows.isHidden(file.path)) {
      row.addClass("fnm-tucked");
      const indicator=row.createSpan({cls:"fnm-row-state",attr:{"aria-label":"已收起","title":"已收起"}});
      setIcon(indicator,"moon");
    }
    if(this.plugin.windows.isOpen(file.path)) {
      row.addClass("fnm-has-actions");
      const pin=actions.createEl("button",{cls:"fnm-icon-button clickable-icon",attr:{"aria-label":"切换置顶"}});
      setIcon(pin, this.plugin.windows.isPinned(file.path) ? "pin" : "pin-off");
      pin.title = this.plugin.windows.isPinned(file.path) ? "取消置顶" : "置顶窗口";
      pin.addEventListener("click", () => {
        this.plugin.windows.pin(file.path, !this.plugin.windows.isPinned(file.path));
        this.renderList(this.searchEl.value);
      });
      const hide=actions.createEl("button",{cls:"fnm-icon-button clickable-icon",attr:{"aria-label":"收起浮动窗口"}});
      setIcon(hide,"x");
      hide.title="收起窗口（可即时召回）";
      hide.addEventListener("click", () => {
        this.plugin.windows.hide(file.path);
        this.renderList(this.searchEl.value);
      });
    }
  }

  onClose(): void {
    this.itemButtons = [];
    this.contentEl.empty();
  }
}
