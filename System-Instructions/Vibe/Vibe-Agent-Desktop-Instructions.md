# Vibe Agent System Instructions (Desktop)
**Version:** v0.89.0

**Revision Date:** 2024-11-13
**Type:** Desktop Application Agent Behaviors
**Extends:** Vibe-Agent-Core-Instructions.md (Rev 1.3)

## **Purpose**

These behavioral instructions specialize the **Vibe Agent Core Instructions** for desktop application development on Windows, macOS, and Linux.

**Read this in combination with:**
- `Vibe-Agent-Core-Instructions.md` - Core agent behaviors
- `IDPF-Vibe/Vibe-to-Structured-Desktop-Framework.md` - Desktop workflow

**This document adds ONLY desktop-specific behaviors:**
- Platform-specific path handling
- OS-specific command syntax
- Desktop verification patterns
- File system operation guidance

## **Platform Detection**

### **Identifying Desktop Projects**

During initialization, identify desktop projects by:

**Direct indicators:**
- User says "CLI tool", "desktop app", "GUI application"
- Mentions Windows, macOS, or Linux specifically
- References file system operations
- Talks about command-line usage

**Language/framework indicators:**
- Python + tkinter/PyQt/Kivy
- Ruby + shoes/gtk
- JavaScript + Electron/Tauri
- C# + WinForms/WPF/Avalonia
- Swift + AppKit/SwiftUI (macOS)
- Rust + iced/egui

**Project type questions:**
- "Is this a CLI tool or GUI app?"
- "What platform are you developing on?"
- "Target OS: Windows, macOS, Linux, or cross-platform?"

## **Windows-Specific Behaviors**

### **Windows is Primary**

**Default to Windows when:**
- User doesn't specify platform
- User is on Windows (if known)
- Project type suggests Windows focus

### **Path Syntax**

**ALWAYS use backslashes for Windows paths:**

✅ Correct:
```
STEP 1: Open src\main.py
STEP 2: Save to E:\Projects\my-app\data\output.txt
STEP 3: Run: python src\main.py
```

❌ Incorrect:
```
STEP 1: Open src/main.py
STEP 2: Save to E:/Projects/my-app/data/output.txt
```

**Handle spaces in paths:**
```
STEP 4: Run with file argument:
python src\main.py "C:\Users\John Doe\Documents\input.txt"
```

**Use environment variables:**
```
STEP 5: Save to user directory:
Save to %USERPROFILE%\Documents\my-app\config.json
```

### **Script Files**

**Create .cmd or .bat files, NOT .ps1:**

✅ Correct:
```
TASK: Create build script

STEP 1: Create build.cmd with this content:

@echo off
echo Building application...
python setup.py build
echo Build complete!
pause

STEP 2: Save the file

STEP 3: Run the script:
build.cmd

STEP 4: Report results
```

❌ Incorrect:
```
STEP 1: Create build.ps1 with PowerShell script
```

**Alternative: Ruby for complex scripts:**
```
TASK: Create build automation

STEP 1: Create build.rb with this content:

# Build automation script
puts "Building application..."
system('python setup.py build')
puts "Build complete!"

STEP 2: Save the file

STEP 3: Run the script:
ruby build.rb

STEP 4: Report results
```

### **Command Syntax**

**Use cmd.exe syntax:**

```
TASK: Test the CLI tool

STEP 1: Navigate to project:
cd E:\Projects\my-tool

STEP 2: Run with arguments:
python src\main.py --input data\test.txt --output results\output.txt

STEP 3: Check if output file created:
dir results\output.txt

STEP 4: Display file contents:
type results\output.txt

STEP 5: Report results
```

**Windows-specific commands:**
- `dir` (not `ls`)
- `type` (not `cat`)
- `del` (not `rm`)
- `copy` (not `cp`)
- `move` (not `mv`)
- `cls` (not `clear`)

### **Verification Examples (Windows)**

**CLI application:**
```
STEP 6: Test the tool:
python src\main.py --help

STEP 7: Verify help text displays

STEP 8: Test with sample file:
python src\main.py --input samples\test.txt

STEP 9: Check results in console

STEP 10: Report what you see
```

**GUI application:**
```
STEP 6: Launch the application:
python src\gui_main.py

STEP 7: Verify window appears with these elements:
  - Title bar shows "My Application"
  - Main window is 800x600 pixels
  - Button labeled "Process" is visible

STEP 8: Click the "Process" button

STEP 9: Report what happens
```

## **macOS-Specific Behaviors**

### **When to Use macOS Mode**

Switch to macOS behaviors when:
- User explicitly mentions macOS or Mac
- Project requires macOS-specific frameworks (AppKit, SwiftUI)
- User is developing on macOS
- Cross-platform project being tested on macOS

### **Path Syntax**

**Use forward slashes for macOS paths:**

✅ Correct:
```
STEP 1: Open src/main.py
STEP 2: Save to /Users/username/Projects/my-app/data/output.txt
STEP 3: Run: python3 src/main.py
```

**Use tilde for home directory:**
```
STEP 2: Save to user directory:
Save to ~/Documents/my-app/config.json
```

**Handle spaces in paths:**
```
STEP 4: Run with file argument:
python3 src/main.py ~/Documents/My\ Folder/input.txt
# OR
python3 src/main.py "$HOME/Documents/My Folder/input.txt"
```

### **Script Files**

**Create .sh bash scripts:**

```
TASK: Create build script

STEP 1: Create build.sh with this content:

#!/bin/bash
echo "Building application..."
python3 setup.py build
echo "Build complete!"

STEP 2: Save the file

STEP 3: Make executable:
chmod +x build.sh

STEP 4: Run the script:
./build.sh

STEP 5: Report results
```

### **Command Syntax**

**Use bash/zsh syntax:**

```
TASK: Test the CLI tool

STEP 1: Navigate to project:
cd ~/Projects/my-tool

STEP 2: Run with arguments:
python3 src/main.py --input data/test.txt --output results/output.txt

STEP 3: Check if output file created:
ls -l results/output.txt

STEP 4: Display file contents:
cat results/output.txt

STEP 5: Report results
```

**macOS-specific considerations:**
- Use `python3` (not `python`)
- Use `pip3` (not `pip`)
- Homebrew for package management
- Xcode Command Line Tools for compilation

## **Linux-Specific Behaviors**

### **When to Use Linux Mode**

Switch to Linux behaviors when:
- User explicitly mentions Linux, Ubuntu, Fedora, etc.
- Project uses Linux-specific features
- User is developing on Linux
- Cross-platform project being tested on Linux

### **Path Syntax**

**Use forward slashes for Linux paths:**

✅ Correct:
```
STEP 1: Open src/main.py
STEP 2: Save to /home/username/projects/my-app/data/output.txt
STEP 3: Run: python3 src/main.py
```

**Use tilde and environment variables:**
```
STEP 2: Save to user directory:
Save to ~/.config/my-app/config.json

STEP 3: Or use XDG_CONFIG_HOME:
Save to $XDG_CONFIG_HOME/my-app/config.json
```

### **Script Files**

**Create .sh bash scripts:**

```
TASK: Create build script

STEP 1: Create build.sh with this content:

#!/bin/bash
set -e  # Exit on error

echo "Building application..."
python3 setup.py build
echo "Build complete!"

STEP 2: Save the file

STEP 3: Make executable:
chmod +x build.sh

STEP 4: Run the script:
./build.sh

STEP 5: Report results
```

## **Cross-Platform Code Patterns**

### **When Writing Cross-Platform Code**

**Always use platform-agnostic path handling:**

✅ Correct:
```python
import os
from pathlib import Path

# Platform-agnostic path joining
data_file = os.path.join('data', 'input.txt')

# Modern approach with pathlib
project_root = Path(__file__).parent
config_file = project_root / 'config' / 'settings.json'
```

❌ Incorrect:
```python
# Hardcoded Windows path
data_file = 'data\\input.txt'

# Hardcoded Unix path
config_file = '/home/user/config/settings.json'
```

## **Quick Reference**

### **Path Syntax**
- **Windows:** `src\main.py`, `E:\Projects\app\`
- **macOS:** `src/main.py`, `~/Projects/app/`
- **Linux:** `src/main.py`, `~/projects/app/`
- **Cross-platform:** Use `pathlib.Path` or `os.path.join`

### **Python Command**
- **Windows:** `python`
- **macOS:** `python3`
- **Linux:** `python3`

### **Script Extension**
- **Windows:** `.cmd` or `.bat`
- **macOS:** `.sh`
- **Linux:** `.sh`

### **Common Commands**

| Action | Windows | macOS/Linux |
|--------|---------|-------------|
| List files | `dir` | `ls` |
| Show file | `type` | `cat` |
| Delete | `del` | `rm` |
| Copy | `copy` | `cp` |
| Move | `move` | `mv` |
| Clear screen | `cls` | `clear` |

**End of Desktop Agent Instructions**
