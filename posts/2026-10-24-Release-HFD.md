---
title: "Introducing HFD — Hyggshi Framework Desktop"
date: 2026-10-24
category: "Release"
excerpt: "HFD is a desktop app framework built entirely in-house: a Go runtime on GTK3 + WebKitGTK, a zero-dependency TypeScript CLI, and type-safe bindings. No Wails, no Tauri, no Electron. v0.2.0 is out for Linux."
cover: "/Resources/posts/24-10-2026/HFD1.svg"
---

# Introducing HFD — Hyggshi Framework Desktop

Today we're announcing **HFD (Hyggshi Framework Desktop)**, a framework for building desktop apps with web frontends, written 100% in-house. It doesn't wrap Wails, Tauri, or Electron. Every layer, from the native window to the CLI, is our own code.

HFD is part of the HORT ecosystem, and it follows the same approach as the rest of our projects: build it from scratch, understand every piece, and ship once it's solid.

## What is HFD?

HFD lets you write your app logic in Go and your UI in whatever frontend you like, then ships them together as one native binary.

- **Go runtime and native API.** The core talks to the OS through CGo, using GTK3 and WebKitGTK on Linux.
- **TypeScript CLI.** `hfd-cli` handles scaffolding, builds, dev mode, and packaging. It has zero dependencies and runs on Node.
- **Any frontend.** Use vanilla JS, React, or Vue with Vite. `hfd dev` gives you hot module reload.
- **Type-safe codegen.** Bind a Go function with `BindTyped[In, Out]` and HFD generates `bindings.d.ts` and `bindings.js` for you.

## Status: v0.2.0 (Linux first, rewritten)

This release is a full rewrite with a modular core.

| Phase | Scope | Status |
|---|---|---|
| MVP 0.1 | Core CGo: GTK + WebKitGTK, true-promise IPC, `hfd://app` scheme | ✅ |
| MVP 0.2 | Native API: file dialogs, message box, clipboard, notifications, window title, menu bar, tray | ✅ |
| MVP 0.3 | CLI `hfd bindings/build/dev/new/doctor/package` + `@hfd/react` | ✅ |
| MVP 0.4 | Packaging: .deb + AppImage | ⏸ |
| MVP 0.5 | Security & plugins: permissions, sandbox, plugin signing | ⏸ |
| 1.0 | Windows/macOS backends | ⏸ |

For now HFD runs on **Linux only** (GTK3 + WebKitGTK 4.1, developed on Ubuntu GNOME). The Windows and macOS backends exist as scaffolds (`backend_windows.go`, `backend_darwin.go`) and are planned for 1.0.

## Quickstart

You need Go, Node, and the GTK3/WebKitGTK dev packages (via apt).

```bash
git clone https://github.com/Hyggshi-OS-project-center/Hyggshi-Framework-Desktop.git
cd Hyggshi-Framework-Desktop
npm i --prefix hfd-cli 2>/dev/null || true   # only needed to rebuild the CLI (tsc)

cd examples/demo
node ../../hfd-cli/bin/hfd.mjs bindings   # generates bindings.d.ts + bindings.js
node ../../hfd-cli/bin/hfd.mjs build      # go build → build/bin/hfd-demo
./build/bin/hfd-demo
```

## The CLI

| Command | What it does |
|---|---|
| `hfd new <name> [--react\|--vue]` | Scaffold a new app |
| `hfd bindings` | Generate `bindings.d.ts` + `bindings.js` |
| `hfd build` | Bindings + frontend build + `go build` |
| `hfd dev` | Frontend dev server + Go app with HMR |
| `hfd doctor` | Check your build environment |
| `hfd package` | Build and assemble an installable .deb |

## The Go API

```go
hfd.Run(hfd.Options{
    Title:  "Demo", Width: 880, Height: 700,
    Assets: assets,                         // go:embed embed.FS
    AllowOrigins: []string{"hfd://app/*"},  // nil → defaults
    CSP:    "default-src hfd://app/",       // injected as <meta> at DOCUMENT_START
    Menu:   []hfd.MenuItem{{Label: "About", Action: "about"}},
    Debug:  true,
})

hfd.BindTyped("Greet", app.Greet)
hfd.Emit("tick", map[string]any{"count": n})

hfd.SetClipboard("text") / hfd.GetClipboard()
hfd.OpenFileDialog(opts) / hfd.SaveFileDialog(opts) / hfd.ShowMessage(opts)
hfd.Notify("title", "body")
hfd.SetTitle("new title") / hfd.CloseWindow()
hfd.SetTray(opts)  // requires -tags hfd_tray
```

On the JavaScript side, `hfd.call("Greet", { name })` returns a real Promise, and `hfd.on("tick", fn)` receives events emitted from Go.

## Security by default

HFD serves your app from a custom `hfd://app` scheme, enforces an origin allowlist, uses an IPC token, and lets you set a Content Security Policy that is applied before any page script runs. A full permission and sandbox model is planned for MVP 0.5.

## Examples included

- `examples/demo`: a full tour of the native API
- `examples/react-demo`: React + Vite with HMR
- `examples/code-editor`: a mini code editor

## What's next

1. **Packaging:** .deb and AppImage output from `hfd package`
2. **Security and plugins:** permissions, sandboxing, and signed plugins
3. **Windows and macOS** backends for 1.0

## Get HFD

- Repository: [Hyggshi-Framework-Desktop](https://github.com/Hyggshi-OS-project-center/Hyggshi-Framework-Desktop)
- Architecture details: see `ARCHITECTURE.md` in the repo

HFD is early, and feedback matters. Try it, break it, and open an issue.

*— Hyggshi OS Developer*