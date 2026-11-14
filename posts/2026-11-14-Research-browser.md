---
title: "Research: Moving our browser from Python to C++"
date: 2026-11-14
category: "Research"
excerpt: "Our browser started as Python + Qt WebEngine. We're researching a rewrite of the core in C++ with the same Qt WebEngine underneath. Same UI, same features, a different foundation. No release date yet."
cover: "/Resources/posts/14-11-2026/browser1.svg"
---

# Research: Moving our browser from Python to C++

We're planning to move Cloudar Browser from **Python + Qt WebEngine** to **C++ + Qt WebEngine**. This is a research post, not a release. Nothing has shipped yet, and we want to explain the reasoning before we start.

Like the rest of the HORT ecosystem, this follows "research first, ship later": understand the problem, measure it, then build.

## Why Python got us this far

Python let us build a working prototype quickly. Qt WebEngine gave us a real Chromium-based rendering engine without writing one ourselves, and the Python bindings made iterating on the UI cheap.

## Where it starts to hurt

As the browser grows, a few limits keep showing up:

- Startup time is slower than we want.
- Memory use is higher than it needs to be.
- Packaging needs a Python runtime and its dependencies shipped alongside the app.
- Some parts of the core are harder to control from inside the interpreter.

## The plan

Keep Qt WebEngine as the rendering layer and rewrite everything around it in C++.

| Area | Now | Planned |
|---|---|---|
| Language | Python | C++ |
| Rendering | Qt WebEngine | Qt WebEngine (unchanged) |
| UI | Qt (PyQt/PySide) | Qt Widgets/QML in C++ |
| Packaging | Python runtime + dependencies | Single native binary |

The UI and the existing feature set should carry over. Users shouldn't notice a different browser, only a faster and lighter one.

## What we need to find out first

Before committing to a full rewrite, we want real numbers:

1. Cold start time, Python build vs a minimal C++ build.
2. Idle and per-tab memory use.
3. How much of the current code maps cleanly to C++, and how much needs redesign.
4. Build and packaging effort on Linux first.

We'll publish the measurements once we have them, whatever they show.

## What's next

1. Prototype the C++ shell with Qt WebEngine and compare it against the Python version.
2. Port features in stages, starting with the core browsing flow.
3. Share benchmark results and progress here.

## Status

- Research and prototyping: starting now
- Release date: none yet
- Python version: stays available until the C++ version catches up

If you have ideas, concerns, or experience with Qt WebEngine in C++, feedback is welcome. Open an issue or leave a comment.

*— Hyggshi OS Developer*