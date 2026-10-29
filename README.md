# Floating Note Manager

A lightweight desktop-only Obsidian plugin for searching, creating, and editing Markdown notes in native floating windows without interrupting your workflow.

**Initial public preview — v0.1.22.** Requires desktop Obsidian.

## Features

- Open a standalone note picker from other apps using an optional system-wide shortcut, such as Alt+W.
- Search Markdown file names and paths. Create a new note directly from the first action.
- Edit notes in native Obsidian popout windows, not a replacement Markdown editor.
- Press Esc to tuck a note away; recall a hidden window without recreating the editor.
- Optional always-on-top pinning, recent notes, keyboard navigation, and per-note sizing.
- Global picker does not intentionally restore or focus the main Obsidian window.

## Installation

Download main.js, manifest.json and styles.css from the repository. Place all three into:

```text
<Vault>/.obsidian/plugins/obsidian-floating-note-manager/
```

Restart Obsidian and enable **Floating Note Manager** in **Settings → Community plugins**.

## Usage

Enable the global shortcut in the plugin settings if desired (disabled by default). Choose a combination not already occupied by another program. In the picker, type a name and press Enter to create a note; use the arrow keys to choose an existing match. Esc hides the picker or a managed floating note.

All notes are ordinary Markdown files stored in your vault. The plugin's data.json contains only settings and recently opened file references.

## Compatibility

Desktop only. Native window behavior, global shortcuts and pinning rely on Electron/Obsidian integration and may vary with version and theme. Search matches file names and paths, not full-text content.

## Development

```sh
npm install
npm run build
npm test
```

Source: src/. Tests: tests/. The build produces main.js.
