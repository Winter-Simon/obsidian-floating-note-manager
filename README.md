# Floating Note Manager

A lightweight, desktop-only [Obsidian](https://obsidian.md/) plugin to search, create, and edit Markdown notes in native floating windows without interrupting your workflow.

**Latest release: 0.1.25** | [Download](https://github.com/Winter-Simon/obsidian-floating-note-manager/releases/latest) | [MIT license](LICENSE)

## Features

- **Global hotkey** (opt-in): summon a dedicated note picker from another application without intentionally restoring the main Obsidian window.
- **Search or create:** type a filename and press Enter on the first option to create that note, or use the arrows to open an existing match.
- **Native Markdown editor:** notes open in original Obsidian floating editor windows, not in a replacement editor.
- **Hide and recall:** Esc tucks away a floating note, preserving its editor for quick recall.
- **Window controls:** recent notes, per-note sizing and optional always-on-top pinning.

## Installation

Use the **Add to Obsidian** link on the official Community Directory listing, or install manually by downloading the latest Release's three separate assets (main.js, manifest.json and styles.css) into:

    <Vault>/.obsidian/plugins/floating-note-manager/

Restart Obsidian and enable **Floating Note Manager** under Settings > Community plugins. Optionally enable a system-wide shortcut in settings; it is off by default.

## Migrating from 0.1.22 or earlier

**Breaking identifier change:** The official plugin ID changed from **obsidian-floating-note-manager** to **floating-note-manager** to meet Obsidian Community directory requirements. Obsidian sees them as separate plugins.

1. Completely exit Obsidian and back up the vault and the old plugin's data.json.
2. Install version 0.1.23 into a **new** floating-note-manager folder. Do not delete or overwrite the old folder.
3. Optional: with Obsidian closed, copy the old plugin's data.json into the new plugin directory to retain your shortcut and recent note settings.
4. Disable the old plugin **before** enabling the new one. Never enable the same global shortcut in both.
5. Restart Obsidian and verify new settings, note creation and window behavior. Your Markdown documents are not modified.

## Community Directory review

Version 0.1.25 reduces non-blocking review warnings and moves the standalone picker styling into the standard styles.css asset. The Community Directory review-branch scan completed with no blocking errors.

Version 0.1.24 addresses the two blocking source-code audit findings in the initial 0.1.23 review: the duplicated settings heading and direct style assignments. It also replaces the plugin-name-prefixed command name and an unnecessary raw DOM creation. The new release intentionally includes only the three Obsidian-required assets.

## Compatibility and privacy

- Desktop Obsidian 1.13.1 or newer (minimum declared version). Not intended for mobile.
- Native window management and global shortcuts use desktop Obsidian/Electron interfaces. Availability depends on operating system, app build and other shortcuts.
- Search matches Markdown filenames and paths, not full note contents.
- The plugin works locally without network services or telemetry. Only preferences, recent file paths and window state are stored in its own data.json. Your Markdown files remain in the vault.

## Development

Requires Node.js 24+ and npm:

    npm ci
    npm run build
    npm test

Source: [src/](src); tests: [tests/](tests). Build output: main.js.

## License

MIT License, Copyright 2026 WinterSimon. This is a community-developed plugin not affiliated with Obsidian.
