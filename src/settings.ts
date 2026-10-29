import {App, PluginSettingTab, Setting} from "obsidian";
import type FloatingNotePlugin from "./main";
import {DEFAULT_WIDTH, DEFAULT_HEIGHT, type NoteRecord, type WindowBounds} from "./registry";
import {DEFAULT_GLOBAL_HOTKEY} from "./global-hotkey";

export interface FloatingNoteSettings {
  recent: NoteRecord[];
  scratchFolder: string;
  closeOnEscape: boolean;
  globalHotkeyEnabled:boolean;
  globalHotkeyAccelerator:string;
  minimalChrome: boolean;
  pinNewNotes: boolean;
  rememberWindowBounds: boolean;
  defaultWidth: number;
  defaultHeight: number;
  lastBounds?: WindowBounds;
}

export const DEFAULT_SETTINGS: FloatingNoteSettings = {
  recent: [],
  scratchFolder: "Floating Notes", // Do not relocate notes from existing V0.1 vaults.
  closeOnEscape: true,
  globalHotkeyEnabled:false,
  globalHotkeyAccelerator:DEFAULT_GLOBAL_HOTKEY,
  minimalChrome: true,
  pinNewNotes: false,
  rememberWindowBounds: true,
  defaultWidth: DEFAULT_WIDTH,
  defaultHeight: DEFAULT_HEIGHT,
};

export class FloatingNoteSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: FloatingNotePlugin) { super(app, plugin); }
  display(): void {
    const {containerEl} = this;
    containerEl.empty();
    new Setting(containerEl).setName("Floating Note Manager").setHeading();
    new Setting(containerEl).setName("系统级全局快捷键")
      .setDesc("从其他应用直接弹出独立选择器，不唤醒 Obsidian 主窗口。首次默认关闭；按键冲突则无法注册。")
      .addToggle(toggle=>toggle.setValue(this.plugin.settings.globalHotkeyEnabled)
        .onChange(async(enabled)=>{
          await this.plugin.configureGlobalHotkey(enabled,this.plugin.settings.globalHotkeyAccelerator);
          this.display();
        }));
    new Setting(containerEl).setName("唤出管理器")
      .setDesc("例如 Alt+W；至少一个修饰键。若与其他应用冲突，请更换组合。")
      .addText(text=>text.setValue(this.plugin.settings.globalHotkeyAccelerator)
        .setPlaceholder(DEFAULT_GLOBAL_HOTKEY)
        .then(component=>{
          const apply=async()=>{
            await this.plugin.configureGlobalHotkey(
              this.plugin.settings.globalHotkeyEnabled,component.getValue());
          };
          component.inputEl.addEventListener("keydown",event=>{
            if(event.key==="Enter"){event.preventDefault();void apply();}
          });
          component.inputEl.addEventListener("blur",()=>{void apply();});
        }));
    new Setting(containerEl).setName("草稿文件夹")
      .setDesc("相对于 Obsidian 库根目录。草稿始终是普通 Markdown 文件，修改设置不会移动现有文件。")
      .addText((text) => text.setPlaceholder("Floating Notes")
        .setValue(this.plugin.settings.scratchFolder)
        .onChange(async(value) => {
          this.plugin.settings.scratchFolder = value.trim();
          await this.plugin.persist();
        }));
    new Setting(containerEl).setName("默认窗口宽度")
      .setDesc("单位为像素；新窗口会自动限制在可见屏幕范围内。")
      .addText((text) => text.setPlaceholder("420")
        .setValue(String(this.plugin.settings.defaultWidth))
        .onChange(async(value) => {
          const number = Number(value);
          if (!Number.isInteger(number) || number < 420 || number > 1600) return;
          this.plugin.settings.defaultWidth = number;
          await this.plugin.persist();
        }));
    new Setting(containerEl).setName("默认窗口高度")
      .setDesc("单位为像素。")
      .addText((text) => text.setPlaceholder("660")
        .setValue(String(this.plugin.settings.defaultHeight))
        .onChange(async(value) => {
          const number = Number(value);
          if (!Number.isInteger(number) || number < 300 || number > 1200) return;
          this.plugin.settings.defaultHeight = number;
          await this.plugin.persist();
        }));
    new Setting(containerEl).setName("记住每篇笔记的窗口尺寸")
      .setDesc("仅记住宽高；彻底关闭后新建窗口居中。Esc 与 × 收起时保留编辑器。")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.rememberWindowBounds)
        .onChange(async(value) => {
          this.plugin.settings.rememberWindowBounds = value;
          await this.plugin.persist();
        }));
    new Setting(containerEl).setName("精简单笔记标题栏")
      .setDesc("隐藏重复标签和笔记工具栏，保留可拖动区域。兼容性受 Obsidian 主题及版本影响。")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.minimalChrome)
        .onChange(async(value) => {
          this.plugin.settings.minimalChrome = value;
          this.plugin.windows.refreshChrome();
          await this.plugin.persist();
        }));
    new Setting(containerEl).setName("Esc 收起浮动窗口")
      .setDesc("收起后原生编辑器保留；输入法候选、弹窗及菜单优先处理 Esc。")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.closeOnEscape)
        .onChange(async(value) => {
          this.plugin.settings.closeOnEscape = value;
          await this.plugin.persist();
        }));
    new Setting(containerEl).setName("新窗口默认置顶")
      .setDesc("需要当前 Obsidian / Electron 环境支持；不支持时仍可正常打开笔记。")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.pinNewNotes)
        .onChange(async(value) => {
          this.plugin.settings.pinNewNotes = value;
          await this.plugin.persist();
        }));
  }
}
