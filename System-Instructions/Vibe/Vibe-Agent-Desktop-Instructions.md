# Vibe Agent System Instructions (Desktop)
**Version:** v0.48.2
**Type:** Desktop Application Agent Behaviors
**Extends:** Vibe-Agent-Core-Instructions.md
---
## Purpose
Specializes core instructions for desktop development on Windows, macOS, Linux.
**Adds:** Platform-specific path handling, OS-specific commands, desktop verification patterns.
---
## Platform Detection
**Direct indicators:** CLI tool, desktop app, GUI application, Windows/macOS/Linux mention, file system operations.
**Framework indicators:** Python + tkinter/PyQt, Electron/Tauri, C# + WinForms/WPF, Swift + AppKit, Rust + iced/egui.
---
## Windows-Specific Behaviors (Default)
**Path Syntax - ALWAYS use backslashes:**
```
STEP 1: Open src\main.py
STEP 2: Save to E:\Projects\my-app\data\output.txt
STEP 3: Run: python src\main.py
```
**Handle spaces:** `python src\main.py "C:\Users\John Doe\Documents\input.txt"`
**Environment variables:** `%USERPROFILE%\Documents\my-app\config.json`
**Script Files - Create .cmd or .bat, NOT .ps1:**
```
@echo off
echo Building application...
python setup.py build
pause
```
**Command Syntax:** `dir` (not ls), `type` (not cat), `del` (not rm), `copy` (not cp), `move` (not mv), `cls` (not clear).
---
## macOS-Specific Behaviors
**Use when:** User mentions macOS/Mac, AppKit/SwiftUI required, developing on macOS.
**Path Syntax - Forward slashes:**
```
STEP 1: Open src/main.py
STEP 2: Save to ~/Documents/my-app/config.json
```
**Script Files - .sh bash:**
```
#!/bin/bash
echo "Building application..."
python3 setup.py build
```
**Make executable:** `chmod +x build.sh`
**Use `python3` and `pip3`, not `python` and `pip`.**
---
## Linux-Specific Behaviors
**Use when:** User mentions Linux/Ubuntu/Fedora, Linux-specific features.
**Paths:** Forward slashes, `~/.config/my-app/`, `$XDG_CONFIG_HOME`.
**Scripts:** Same as macOS (.sh with `#!/bin/bash`).
---
## Cross-Platform Code Patterns
**Always use platform-agnostic path handling:**
```python
import os
from pathlib import Path

# Platform-agnostic
data_file = os.path.join('data', 'input.txt')
config_file = Path(__file__).parent / 'config' / 'settings.json'
```
---
## Quick Reference
| | Windows | macOS/Linux |
|---|---------|-------------|
| Paths | `src\main.py` | `src/main.py` |
| Python | `python` | `python3` |
| Scripts | `.cmd`/`.bat` | `.sh` |
| List files | `dir` | `ls` |
| Show file | `type` | `cat` |
| Delete | `del` | `rm` |
| Copy | `copy` | `cp` |
| Move | `move` | `mv` |
| Clear | `cls` | `clear` |
---
**End of Desktop Agent Instructions**
