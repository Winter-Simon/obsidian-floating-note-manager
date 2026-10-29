import {App, Modal, Notice} from "obsidian";
import {validateScratchName} from "./registry";
import type FloatingNotePlugin from "./main";

/** A standard Obsidian modal, not a second editor or an unnamed file creator. */
export class NewScratchModal extends Modal {
  private creating = false;
  constructor(app: App, private readonly plugin: FloatingNotePlugin) {super(app);}

  onOpen(): void {
    this.modalEl.addClass("fnm-new-scratch");
    this.titleEl.setText("新建浮动笔记");
    this.contentEl.empty();
    this.contentEl.createDiv({cls:"fnm-new-scratch-description",text:"为笔记命名，创建后会在原生浮动窗口打开。"});
    const input = this.contentEl.createEl("input", {
      type:"text",
      cls:"fnm-new-scratch-name",
      placeholder:"例如：两自旋耦合问题",
      attr: {"aria-label":"笔记名称","autocomplete":"off","maxlength":"123"},
    });
    const error = this.contentEl.createDiv({cls:"fnm-new-scratch-error",attr:{"role":"alert"}});
    const actions = this.contentEl.createDiv({cls:"fnm-new-scratch-actions"});
    const cancel = actions.createEl("button", {text:"取消"});
    const submit = actions.createEl("button", {cls:"mod-cta",text:"创建并打开"});
    cancel.addEventListener("click", () => this.close());
    const create = async(): Promise<void> => {
      if (this.creating) return;
      try {
        const name = validateScratchName(input.value);
        this.creating = true;
        submit.disabled = true;
        const file = await this.plugin.createScratchNamed(name);
        // Close the naming prompt BEFORE opening the native popout; otherwise
        // Obsidian can return focus to the modal's main window after we open it.
        this.close();
        void this.plugin.openNote(file).catch((err) => {
          new Notice("笔记已创建，但浮窗打开失败：" + String(err));
        });
      } catch (err) {
        error.setText(err instanceof Error ? err.message : String(err));
        this.creating = false;
        submit.disabled = false;
        input.focus();
      }
    };
    submit.addEventListener("click", () => void create());
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault();
        void create();
      }
    });
    input.addEventListener("input", () => error.empty());
    input.focus();
  }
  onClose(): void {this.contentEl.empty();}
}
