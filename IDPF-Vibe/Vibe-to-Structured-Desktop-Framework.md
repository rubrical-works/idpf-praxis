# **Vibe-to-Structured Development Framework (Desktop)**
**Version:** v0.63.1
**Type:** Desktop Application Specialization
**Extends:** Vibe-to-Structured-Core-Framework.md (Rev 2)

## **Purpose**
This framework specializes the **Vibe-to-Structured Core Framework** for desktop application development. It provides platform-specific guidance for Windows, macOS, and Linux desktop applications.
**Read this in combination with:**
- `Vibe-to-Structured-Core-Framework.md` - Core workflow and methodology
**This document adds:**
- Platform-specific commands and paths
- Desktop environment setup
- OS-specific tooling and verification
- Desktop UI patterns
- File system operations
- Example desktop projects
**Evolution Target:** IDPF-Agile (sprints, user stories, iterative delivery)
See Core Framework for details on the evolution process.

## **Desktop Platform Coverage**
This framework covers:
- **Windows** desktop applications (primary focus)
- **macOS** desktop applications
- **Linux** desktop applications
- **Cross-platform** desktop (Electron, Tauri, Qt, etc.)

### **Application Types**
- **CLI tools**: Command-line utilities and scripts
- **GUI applications**: Windows (WinForms, WPF, WinUI), macOS (AppKit, SwiftUI), Linux (GTK, Qt)
- **System utilities**: Background services, system tray apps
- **File processors**: Image/video converters, data transformers
- **Cross-platform apps**: Electron, Tauri, .NET MAUI

## **Platform-Specific Session Initialization**
When starting a desktop vibe project, the ASSISTANT follows Core Framework initialization (Steps 1-4, including establishing project location), then adds:
**Desktop-Specific Questions:**
- **Primary target platform?** (Windows/macOS/Linux/Cross-platform)
- **Application type?** (CLI/GUI/System utility)
- **User environment?** (What OS are you developing on?)
- **Language preference?** (Python/Ruby/JavaScript/C#/Rust/etc.)
**Starting Point Suggestions:**
For CLI tools:
```
Let's start with a simple CLI structure:
- Main entry point (main.py / cli.rb / index.js)
- Argument parser
- Basic output
```
For GUI applications:
```
Let's start with a basic window:
- Main window class
- Simple layout
- Event handlers
```

## **Windows Desktop Development**

### **Path Conventions**
**Windows paths use backslashes:**
- `E:\Projects\my-app\src\main.py`
- `C:\Users\username\Documents\data.txt`
- `..\relative\path\to\file.txt`
**Environment variables:**
- `%USERPROFILE%` - User's home directory
- `%APPDATA%` - Application data folder
- `%TEMP%` - Temporary files

### **Script Files**
**Use .cmd or .bat for scripts:**
```batch
@echo off
REM Build script for Windows
python build.py
echo Build complete!
pause
```
**Do NOT use .ps1 PowerShell scripts** (per system instructions preference)
**Alternative: Ruby scripts for complex automation:**
```ruby
# build.rb
system('python build.py')
puts 'Build complete!'
```

### **Command Execution**
**Use cmd.exe syntax:**
```
STEP 6: Test the application:
cd E:\Projects\my-app
python src\main.py --help
```
**Path escaping in commands:**
```
STEP 4: Run with file path:
python src\main.py "E:\Projects\data\input file.txt"
```

### **Common Windows Tools**
- **Python**: `python` (from Microsoft Store or python.org)
- **Ruby**: `ruby` (from RubyInstaller)
- **Node.js**: `node`, `npm`
- **Git**: `git` (Git for Windows)
- **Text editors**: Notepad++, VS Code, Sublime Text
- **Image tools**: GIMP, ImageMagick
- **Video tools**: ffmpeg

### **Windows-Specific Libraries**
**Python:**
- `pywin32` - Windows API access
- `winshell` - Windows shell operations
- `pyinstaller` - Create .exe files
**Ruby:**
- `win32ole` - COM automation
- `ocra` - Create .exe files
**Node.js:**
- `node-windows` - Windows services
- `electron` - Cross-platform GUI

### **Verification Steps (Windows)**
```
STEP 6: Run the application:
python src\main.py

STEP 7: Verify output in console window

STEP 8: Report any errors or success message
```

### **Example: Windows CLI Tool**
**Project Structure:**
```
my-tool\
├── src\
│   ├── main.py
│   ├── processor.py
│   └── utils.py
├── tests\
│   └── test_processor.py
├── README.md
└── requirements.txt
```
**Typical Vibe Phase Flow:**
1. Start: Create main.py with argument parsing
2. Add: File reading functionality
3. Add: Processing logic
4. Add: Output formatting
5. Add: Error handling
6. Test: Run with various inputs
7. Refine: Based on results

## **macOS Desktop Development**

### **Path Conventions**
**macOS paths use forward slashes:**
- `/Users/username/Projects/my-app/src/main.py`
- `/Applications/MyApp.app`
- `~/Documents/data.txt` (tilde for home)
**Environment variables:**
- `$HOME` - User's home directory
- `$TMPDIR` - Temporary files
- `$PATH` - Executable search paths

### **Script Files**
**Use .sh bash scripts:**
```bash
#!/bin/bash
# Build script for macOS
python3 build.py
echo "Build complete!"
```
**Make executable:**
```
chmod +x build.sh
./build.sh
```

### **Command Execution**
**Use bash syntax:**
```
STEP 6: Test the application:
cd ~/Projects/my-app
python3 src/main.py --help
```

### **Common macOS Tools**
- **Python**: `python3` (system Python or Homebrew)
- **Ruby**: `ruby` (system Ruby or rbenv)
- **Node.js**: `node`, `npm` (via Homebrew or nvm)
- **Git**: `git` (Xcode Command Line Tools)
- **Homebrew**: Package manager (`brew install ...`)
- **Xcode**: For Swift/Objective-C development

### **macOS-Specific Frameworks**
**Swift:**
- `AppKit` - macOS native UI
- `SwiftUI` - Modern declarative UI
- `Foundation` - Core utilities
**Python:**
- `py2app` - Create .app bundles
- `rumps` - Menu bar apps

### **Verification Steps (macOS)**
```
STEP 6: Run the application:
python3 src/main.py

STEP 7: Verify output in Terminal

STEP 8: Report results
```

### **Example: macOS Menu Bar App**
**Project Structure:**
```
menu-app/
├── src/
│   ├── main.py
│   └── menu_handler.py
├── resources/
│   └── icon.png
└── requirements.txt
```

## **Linux Desktop Development**

### **Path Conventions**
**Linux paths use forward slashes:**
- `/home/username/projects/my-app/src/main.py`
- `/opt/myapp/`
- `~/.config/myapp/` (user config)
**Environment variables:**
- `$HOME` - User's home directory
- `$USER` - Current username
- `$XDG_CONFIG_HOME` - Config directory

### **Script Files**
**Use .sh bash scripts:**
```bash
#!/bin/bash
# Build script for Linux
python3 build.py
echo "Build complete!"
```

### **Command Execution**
**Use bash syntax:**
```
STEP 6: Test the application:
cd ~/projects/my-app
python3 src/main.py --help
```

### **Common Linux Tools**
- **Python**: `python3` (system Python or pyenv)
- **Ruby**: `ruby` (system Ruby or rbenv)
- **Node.js**: `node`, `npm` (via package manager or nvm)
- **Git**: `git`
- **Package managers**: `apt`, `dnf`, `pacman`

### **Linux-Specific Libraries**
**Python:**
- `PyGObject` - GTK+ bindings
- `PyQt5` - Qt bindings
- `python-xlib` - X11 access
**System Integration:**
- `.desktop` files for application launchers
- `systemd` for services

### **Verification Steps (Linux)**
```
STEP 6: Run the application:
python3 src/main.py

STEP 7: Check terminal output

STEP 8: Report results
```

## **Cross-Platform Desktop Development**

### **Frameworks**
**Electron (JavaScript/Node.js):**
- Web technologies (HTML/CSS/JS)
- Native APIs via Node.js
- Package as .exe, .app, .deb/.rpm
**Tauri (Rust + Web):**
- Lightweight alternative to Electron
- System webview + Rust backend
- Smaller bundle sizes
**Qt (C++/Python/Ruby):**
- Native look and feel
- Comprehensive widget set
- Cross-platform by design
**.NET MAUI (C#):**
- Windows, macOS, Linux (via Avalonia)
- Shared codebase
- Native performance

### **Cross-Platform Considerations**
**Path handling:**
```python
import os
# Use os.path.join for platform-agnostic paths
data_path = os.path.join('data', 'input.txt')
home_dir = os.path.expanduser('~')
```
**Platform detection:**
```python
import platform
if platform.system() == 'Windows':
    # Windows-specific code
elif platform.system() == 'Darwin':
    # macOS-specific code
elif platform.system() == 'Linux':
    # Linux-specific code
```
**File operations:**
```python
# Use pathlib for modern path handling
from pathlib import Path
project_root = Path(__file__).parent
config_file = project_root / 'config' / 'settings.json'
```

## **Desktop-Specific Verification Patterns**

### **CLI Applications**
```
STEP 6: Test basic execution:
python src\main.py

STEP 7: Test with arguments:
python src\main.py --input data\test.txt --output results\output.txt

STEP 8: Test error handling:
python src\main.py --input nonexistent.txt

STEP 9: Report all outputs and any errors
```

### **GUI Applications**
```
STEP 6: Launch the application:
python src\main.py

STEP 7: Test the window:
  - Does window appear?
  - Is it the right size?
  - Do controls render correctly?

STEP 8: Test interaction:
  - Click the button
  - Type in the text field
  - Check menu items

STEP 9: Report UI behavior and any issues
```

### **System Utilities**
```
STEP 6: Run in background:
start /B python src\service.py

STEP 7: Check if running:
tasklist | findstr python

STEP 8: Test functionality:
  - Check log file
  - Verify system tray icon
  - Test notification

STEP 9: Stop the service:
taskkill /F /IM python.exe

STEP 10: Report results
```

## **Desktop-Specific Requirements Template Additions**
When generating requirements at Evolution Point, add these desktop-specific sections:

### **Installation & Setup**
```markdown
## Installation & Setup

### Windows
- Python 3.8+ required
- Install dependencies: `pip install -r requirements.txt`
- Optional: Create desktop shortcut

### macOS
- Python 3.8+ required
- Install dependencies: `pip3 install -r requirements.txt`
- Optional: Create app bundle with py2app

### Linux
- Python 3.8+ required
- Install dependencies: `pip3 install -r requirements.txt`
- Optional: Create .desktop launcher
```

### **File Locations**
```markdown
## File Locations

### Windows
- Config: `%APPDATA%\MyApp\config.json`
- Data: `%USERPROFILE%\Documents\MyApp\`
- Logs: `%TEMP%\MyApp\logs\`

### macOS
- Config: `~/Library/Application Support/MyApp/config.json`
- Data: `~/Documents/MyApp/`
- Logs: `~/Library/Logs/MyApp/`

### Linux
- Config: `~/.config/myapp/config.json`
- Data: `~/Documents/myapp/`
- Logs: `~/.local/share/myapp/logs/`
```

### **Platform Requirements**
```markdown
## Platform Requirements

### Windows
- Windows 10 or later
- .NET Runtime (if using C#)
- Visual C++ Redistributable (if needed)

### macOS
- macOS 11 (Big Sur) or later
- Xcode Command Line Tools (for building)

### Linux
- Ubuntu 20.04+ / Fedora 33+ / Arch (current)
- GTK+ 3.24+ (for GUI apps)
- Python 3.8+ from package manager
```

## **Desktop Best Practices**

### **During Vibe Phase**
**Windows:**
- Test in cmd.exe, not PowerShell
- Use absolute paths initially
- Handle spaces in file paths
- Test with typical Windows file locations
**macOS:**
- Test in Terminal.app
- Request permissions early (filesystem access)
- Consider sandboxing requirements
- Test with typical macOS file locations
**Linux:**
- Test in standard terminal
- Follow XDG directory specifications
- Consider different distributions
- Handle missing dependencies gracefully
**Cross-Platform:**
- Use pathlib for path operations
- Test on multiple platforms early
- Abstract platform differences
- Document platform-specific quirks

### **At Evolution Point**
- Document platform-specific requirements
- Note which platforms are tested
- Plan cross-platform test strategy
- Consider packaging/distribution per platform

### **During Structured Phase**
- Add platform-specific tests
- Test edge cases per platform
- Implement platform-specific optimizations
- Create platform-specific packaging

## **Common Desktop Patterns**

### **Configuration Management**
```python
import json
import os
from pathlib import Path

def get_config_dir():
    """Get platform-specific config directory."""
    if os.name == 'nt':  # Windows
        return Path(os.getenv('APPDATA')) / 'MyApp'
    elif sys.platform == 'darwin':  # macOS
        return Path.home() / 'Library' / 'Application Support' / 'MyApp'
    else:  # Linux
        return Path.home() / '.config' / 'myapp'

def load_config():
    """Load configuration from platform-specific location."""
    config_path = get_config_dir() / 'config.json'
    if config_path.exists():
        with open(config_path) as f:
            return json.load(f)
    return {}
```

### **File Dialog (Cross-Platform)**
```python
import tkinter as tk
from tkinter import filedialog

def select_file():
    """Open file selection dialog."""
    root = tk.Tk()
    root.withdraw()
    file_path = filedialog.askopenfilename(
        title="Select a file",
        filetypes=[("Text files", "*.txt"), ("All files", "*.*")]
    )
    return file_path
```

### **System Tray (Windows)**
```python
import pystray
from PIL import Image

def create_tray_icon():
    """Create system tray icon."""
    icon = Image.open('icon.png')
    menu = pystray.Menu(
        pystray.MenuItem('Show', lambda: show_window()),
        pystray.MenuItem('Exit', lambda: exit_app())
    )
    tray = pystray.Icon('MyApp', icon, 'My Application', menu)
    tray.run()
```

## **Testing Strategies for Desktop**

### **CLI Testing**
```python
# test_cli.py
import subprocess

def test_help_flag():
    result = subprocess.run(
        ['python', 'src/main.py', '--help'],
        capture_output=True,
        text=True
    )
    assert result.returncode == 0
    assert 'usage:' in result.stdout.lower()

def test_file_processing():
    result = subprocess.run(
        ['python', 'src/main.py', '--input', 'test.txt'],
        capture_output=True,
        text=True
    )
    assert result.returncode == 0
```

### **GUI Testing**
```python
# test_gui.py (using pytest-qt for Qt apps)
def test_window_title(qtbot):
    window = MainWindow()
    qtbot.addWidget(window)
    assert window.windowTitle() == 'My Application'

def test_button_click(qtbot):
    window = MainWindow()
    qtbot.addWidget(window)
    qtbot.mouseClick(window.submit_button, Qt.LeftButton)
    assert window.result_label.text() == 'Success'
```

## **Packaging & Distribution**

### **Windows**
**PyInstaller (Python):**
```
pyinstaller --onefile --windowed --icon=icon.ico src\main.py
```
**NSIS Installer:**
```
makensis installer.nsi
```

### **macOS**
**py2app (Python):**
```
python3 setup.py py2app
```
**DMG Creation:**
```
hdiutil create -volname "MyApp" -srcfolder dist/MyApp.app -ov -format UDZO MyApp.dmg
```

### **Linux**
**Debian Package:**
```
dpkg-deb --build myapp-1.0
```
**AppImage:**
```
appimagetool MyApp.AppDir
```

### **Cross-Platform**
**Electron:**
```
npm run build
electron-builder --win --mac --linux
```
**Flatpak (Linux):**
```
flatpak-builder --repo=repo build-dir org.example.MyApp.json
```

## **Desktop-Specific Vibe Coding Patterns**

### **Pattern 1: Window-First Exploration**
Start with a visible window to maintain momentum:
```
VIBE PATTERN: Start with visible output
✅ DO: Create a basic window immediately
❌ AVOID: Spending time on architecture before seeing results

Step 1: Create minimal window
Step 2: Add one interactive element
Step 3: Wire up a simple action
Step 4: See it work, then iterate
```

### **Pattern 2: Single-File Prototyping**
Keep everything in one file during exploration:
```python
# desktop_vibe.py - Single file to explore desktop ideas
import tkinter as tk

# Configuration at top - easy to tweak
WINDOW_TITLE = "My App"
WINDOW_SIZE = "400x300"

# Main window
root = tk.Tk()
root.title(WINDOW_TITLE)
root.geometry(WINDOW_SIZE)

# Add widgets here as you explore
label = tk.Label(root, text="Hello Desktop!")
label.pack(pady=20)

# Run
root.mainloop()
```

### **Pattern 3: Rapid Feedback Loop**
```
VIBE CYCLE for Desktop:
1. Make a change
2. Run the app (close old window first on Windows)
3. Click/interact with the change
4. Note what works/doesn't
5. Iterate

TIME TARGET: < 30 seconds per cycle
```

### **Pattern 4: Platform-Aware Exploration**
```python
# Quick platform detection for vibe coding
import sys
IS_WINDOWS = sys.platform == 'win32'
IS_MAC = sys.platform == 'darwin'
IS_LINUX = sys.platform.startswith('linux')

# Use for quick platform-specific tweaks
if IS_WINDOWS:
    # Windows-specific exploration
    pass
elif IS_MAC:
    # macOS-specific exploration
    pass
```

### **Pattern 5: Feature Toggle Exploration**
```python
# Toggle features on/off to explore combinations
FEATURES = {
    'dark_mode': True,
    'system_tray': False,
    'auto_save': True,
    'notifications': False,
}

# Use in code
if FEATURES['dark_mode']:
    apply_dark_theme()
```

## **Electron Development Workflow**

### **Project Setup**
```bash
# Quick start
mkdir my-electron-app && cd my-electron-app
npm init -y
npm install electron --save-dev
```
**Minimal structure:**
```
my-electron-app/
├── package.json
├── main.js          # Main process
├── preload.js       # Bridge to renderer
├── index.html       # UI
└── renderer.js      # UI logic
```

### **Essential Files**
**package.json:**
```json
{
  "name": "my-electron-app",
  "main": "main.js",
  "scripts": {
    "start": "electron ."
  }
}
```
**main.js (Main Process):**
```javascript
const { app, BrowserWindow } = require('electron')
const path = require('path')

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.loadFile('index.html')

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools()
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

### **Common Electron Gotchas**
| Gotcha | Problem | Solution |
|--------|---------|----------|
| **Security warnings** | `nodeIntegration: true` is insecure | Use `preload.js` with `contextBridge` |
| **Window not closing** | macOS keeps app running | Handle `window-all-closed` event |
| **Blank window** | Path issues | Use `path.join(__dirname, ...)` |
| **Large bundle size** | Electron includes Chromium | Use `electron-builder` with compression |
| **Slow startup** | Loading many modules | Lazy load non-essential modules |
| **Memory leaks** | Event listeners not cleaned | Remove listeners in `will-destroy` |

### **IPC Communication Pattern**
```javascript
// preload.js - Safe bridge
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  saveFile: (data) => ipcRenderer.invoke('save-file', data),
  onUpdate: (callback) => ipcRenderer.on('update', callback)
})

// main.js - Handle in main process
ipcMain.handle('save-file', async (event, data) => {
  // Save file logic
  return { success: true }
})

// renderer.js - Use the API
const result = await window.api.saveFile(myData)
```

## **Tauri Development Workflow**

### **Project Setup**
```bash
# Prerequisites: Rust toolchain
# Install: https://www.rust-lang.org/tools/install

# Create new Tauri app
npm create tauri-app@latest my-tauri-app
cd my-tauri-app
npm install
npm run tauri dev
```
**Project structure:**
```
my-tauri-app/
├── src/                    # Frontend (Vite/React/Vue/etc)
│   ├── main.js
│   └── App.jsx
├── src-tauri/              # Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json     # Tauri configuration
│   └── src/
│       └── main.rs         # Rust entry point
└── package.json
```

### **Essential Configuration**
**tauri.conf.json:**
```json
{
  "build": {
    "distDir": "../dist"
  },
  "tauri": {
    "windows": [{
      "title": "My Tauri App",
      "width": 800,
      "height": 600
    }],
    "security": {
      "csp": "default-src 'self'"
    }
  }
}
```

### **Rust Commands (Backend)**
```rust
// src-tauri/src/main.rs
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```
**Frontend invocation:**
```javascript
import { invoke } from '@tauri-apps/api/tauri'

const greeting = await invoke('greet', { name: 'World' })
```

### **Common Tauri Gotchas**
| Gotcha | Problem | Solution |
|--------|---------|----------|
| **Rust compile errors** | Unfamiliar syntax | Use `cargo check` for quick feedback |
| **Command not found** | Forgot to register | Add to `invoke_handler!` macro |
| **CSP blocking** | Security policy | Update `tauri.conf.json` CSP |
| **Large binary** | Debug symbols | Use `--release` for production |
| **Platform features** | OS-specific APIs | Use `#[cfg(target_os = "...")]` |

### **Tauri vs Electron Decision**
| Factor | Tauri | Electron |
|--------|-------|----------|
| **Bundle size** | ~3-10 MB | ~150+ MB |
| **Memory usage** | Lower | Higher |
| **Backend language** | Rust | JavaScript |
| **Learning curve** | Higher (Rust) | Lower (JS) |
| **Ecosystem** | Growing | Mature |
| **Native APIs** | Via Rust | Via Node.js |

## **Native macOS/Windows Patterns**

### **Native macOS (Swift/SwiftUI)**
**Quick SwiftUI app:**
```swift
// ContentView.swift
import SwiftUI

struct ContentView: View {
    @State private var message = "Hello, macOS!"

    var body: some View {
        VStack {
            Text(message)
                .font(.largeTitle)
            Button("Click Me") {
                message = "Button clicked!"
            }
            .buttonStyle(.borderedProminent)
        }
        .frame(width: 400, height: 300)
        .padding()
    }
}

@main
struct MyApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
```
**macOS-specific features:**
```swift
// Menu bar app
import SwiftUI

@main
struct MenuBarApp: App {
    var body: some Scene {
        MenuBarExtra("My App", systemImage: "star") {
            Button("Action") { /* ... */ }
            Divider()
            Button("Quit") { NSApplication.shared.terminate(nil) }
        }
    }
}
```

### **Native Windows (WinUI 3)**
**Quick WinUI app:**
```csharp
// MainWindow.xaml.cs
using Microsoft.UI.Xaml;

public sealed partial class MainWindow : Window
{
    public MainWindow()
    {
        this.InitializeComponent();
        Title = "My Windows App";
    }

    private void OnButtonClick(object sender, RoutedEventArgs e)
    {
        MessageTextBlock.Text = "Button clicked!";
    }
}
```
**XAML layout:**
```xml
<!-- MainWindow.xaml -->
<Window x:Class="MyApp.MainWindow">
    <StackPanel Padding="20">
        <TextBlock x:Name="MessageTextBlock"
                   Text="Hello, Windows!"
                   FontSize="24"/>
        <Button Content="Click Me"
                Click="OnButtonClick"
                Margin="0,20,0,0"/>
    </StackPanel>
</Window>
```

### **Platform-Specific Considerations**
| Aspect | macOS | Windows |
|--------|-------|---------|
| **UI paradigm** | Menu bar focused | Taskbar focused |
| **Window controls** | Left side (close/min/max) | Right side |
| **File paths** | `/Users/name/...` | `C:\Users\name\...` |
| **App distribution** | App Store, notarized DMG | Microsoft Store, MSIX |
| **Background apps** | Menu bar extras | System tray |

## **Desktop-Specific Transition Triggers**

### **Complexity Triggers**
| Trigger | Threshold | Action |
|---------|-----------|--------|
| **Multiple windows** | > 3 windows with inter-communication | Consider state management architecture |
| **Background processing** | Long-running tasks blocking UI | Need thread/process architecture |
| **Data persistence** | > 5 different data types stored | Consider database design |
| **User preferences** | > 10 configurable settings | Need settings architecture |
| **File operations** | Complex file watching/processing | Need robust error handling |

### **Platform Triggers**
| Trigger | Threshold | Action |
|---------|-----------|--------|
| **Cross-platform** | Support > 2 platforms | Need platform abstraction layer |
| **Native features** | Using > 3 OS-specific APIs | Document platform requirements |
| **Packaging** | Need installer/updates | Plan distribution strategy |
| **Code signing** | App Store or enterprise | Plan certificate management |

### **User Experience Triggers**
| Trigger | Threshold | Action |
|---------|-----------|--------|
| **Keyboard shortcuts** | > 10 shortcuts | Need shortcut management system |
| **Undo/Redo** | Any destructive operations | Need command pattern |
| **Drag & drop** | Complex drag operations | Need drag state management |
| **Accessibility** | Any public release | Need accessibility audit |

### **Transition Decision Matrix**
```
IF (complexity_triggers >= 3) OR (platform_triggers >= 2):
    → Transition to Agile

IF (exploring_single_feature) AND (< 500 lines code):
    → Stay in Vibe mode

IF (multiple_developers) OR (formal_requirements):
    → Transition to Agile immediately
```

## **Desktop UI/UX Exploration Patterns**

### **Pattern 1: Layout Sketching**
```python
# Quick layout exploration with tkinter
import tkinter as tk
from tkinter import ttk

root = tk.Tk()
root.title("Layout Sketch")

# Try different layouts quickly
# Option A: Vertical stack
frame_a = ttk.Frame(root)
ttk.Label(frame_a, text="Header").pack()
ttk.Label(frame_a, text="Content").pack()
ttk.Label(frame_a, text="Footer").pack()

# Option B: Grid layout
frame_b = ttk.Frame(root)
ttk.Label(frame_b, text="Sidebar").grid(row=0, column=0, rowspan=2)
ttk.Label(frame_b, text="Main").grid(row=0, column=1)
ttk.Label(frame_b, text="Footer").grid(row=1, column=1)

# Toggle between layouts to explore
frame_a.pack()  # or frame_b.pack()

root.mainloop()
```

### **Pattern 2: Interaction Prototyping**
```python
# Explore different interaction patterns
class InteractionExplorer:
    def __init__(self, root):
        self.root = root

        # Pattern A: Click to action
        self.btn_click = ttk.Button(root, text="Click Me",
                                     command=self.on_click)

        # Pattern B: Hover feedback
        self.btn_hover = ttk.Button(root, text="Hover Me")
        self.btn_hover.bind("<Enter>", self.on_enter)
        self.btn_hover.bind("<Leave>", self.on_leave)

        # Pattern C: Drag interaction
        self.draggable = ttk.Label(root, text="Drag Me")
        self.draggable.bind("<B1-Motion>", self.on_drag)
```

### **Pattern 3: Theme Exploration**
```python
# Quick theme switching for UI exploration
THEMES = {
    'light': {'bg': '#ffffff', 'fg': '#000000', 'accent': '#0078d4'},
    'dark': {'bg': '#1e1e1e', 'fg': '#ffffff', 'accent': '#0078d4'},
    'high_contrast': {'bg': '#000000', 'fg': '#ffffff', 'accent': '#ffff00'},
}

def apply_theme(theme_name):
    theme = THEMES[theme_name]
    root.configure(bg=theme['bg'])
    for widget in root.winfo_children():
        widget.configure(bg=theme['bg'], fg=theme['fg'])
```

### **Pattern 4: Responsive Exploration**
```python
# Test window resizing behavior
def on_resize(event):
    width = event.width
    height = event.height

    # Explore different layouts at breakpoints
    if width < 600:
        # Mobile-like layout
        sidebar.pack_forget()
        content.pack(fill='both', expand=True)
    else:
        # Desktop layout
        sidebar.pack(side='left', fill='y')
        content.pack(side='right', fill='both', expand=True)

root.bind("<Configure>", on_resize)
```

### **Pattern 5: Animation Exploration**
```python
# Simple animation for UI feedback
def animate_button(button, steps=10):
    original_bg = button.cget('background')

    def step(i):
        if i < steps:
            # Fade effect
            intensity = int(255 * (1 - i/steps))
            color = f'#{intensity:02x}{intensity:02x}ff'
            button.configure(background=color)
            button.after(50, lambda: step(i + 1))
        else:
            button.configure(background=original_bg)

    step(0)
```

## **Cross-Platform Packaging Considerations**

### **Packaging Strategy Matrix**
| App Type | Windows | macOS | Linux |
|----------|---------|-------|-------|
| **Python CLI** | PyInstaller → .exe | PyInstaller → binary | PyInstaller → binary |
| **Python GUI** | PyInstaller → .exe | py2app → .app | AppImage |
| **Electron** | electron-builder → .exe/.msi | electron-builder → .dmg | electron-builder → .AppImage/.deb |
| **Tauri** | tauri build → .msi | tauri build → .dmg | tauri build → .AppImage/.deb |

### **Code Signing Requirements**
| Platform | Requirement | Cost |
|----------|-------------|------|
| **Windows** | EV Code Signing Certificate | ~$300-500/year |
| **macOS** | Apple Developer Program | $99/year |
| **Linux** | GPG signing (optional) | Free |

### **Auto-Update Strategies**
```javascript
// Electron auto-update
const { autoUpdater } = require('electron-updater')

autoUpdater.checkForUpdatesAndNotify()

autoUpdater.on('update-available', () => {
  // Notify user
})

autoUpdater.on('update-downloaded', () => {
  autoUpdater.quitAndInstall()
})
```
```rust
// Tauri auto-update
// In tauri.conf.json
{
  "tauri": {
    "updater": {
      "active": true,
      "endpoints": ["https://releases.myapp.com/{{target}}/{{current_version}}"],
      "dialog": true
    }
  }
}
```

### **Distribution Channels**
| Channel | Pros | Cons |
|---------|------|------|
| **Direct download** | Full control, immediate | Manual updates, trust issues |
| **Windows Store** | Trust, auto-updates | Review process, revenue share |
| **Mac App Store** | Trust, auto-updates | Sandboxing limits, revenue share |
| **Homebrew (macOS)** | Developer-friendly | No auto-updates |
| **Snap/Flatpak (Linux)** | Sandboxed, auto-updates | Slightly larger size |

## **When to Use Desktop Framework**
**Use this framework when building:**
✅ Command-line tools and utilities
✅ GUI applications for desktop OS
✅ System utilities and background services
✅ File processing tools
✅ Desktop automation scripts
✅ Cross-platform desktop applications
✅ Local-first applications
**Consider other frameworks for:**
❌ Mobile apps → Use Mobile Framework
❌ Web applications → Use Web Framework
❌ Games → Use Game Framework
❌ Embedded systems → Use Embedded Framework
**End of Desktop Framework**
