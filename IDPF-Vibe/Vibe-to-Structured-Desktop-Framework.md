# Vibe-to-Structured Development Framework (Desktop)
**Version:** v0.66.1
**Type:** Desktop Application Specialization
**Extends:** Vibe-to-Structured-Core-Framework.md (Rev 2)
## Purpose
Specializes Core Framework for desktop application development on Windows, macOS, and Linux.
**Evolution Target:** IDPF-Agile
## Desktop Platform Coverage
- **Windows**: WinForms, WPF, WinUI
- **macOS**: AppKit, SwiftUI
- **Linux**: GTK, Qt
- **Cross-platform**: Electron, Tauri, Qt, .NET MAUI
**Application Types:** CLI tools, GUI applications, system utilities, file processors, cross-platform apps
## Platform-Specific Session Initialization
Follow Core Framework initialization (Steps 1-4), then ask:
- **Primary target platform?** (Windows/macOS/Linux/Cross-platform)
- **Application type?** (CLI/GUI/System utility)
- **User environment?** (Development OS)
- **Language preference?** (Python/Ruby/JavaScript/C#/Rust/etc.)
## Windows Desktop Development
### Path Conventions
- Backslashes: `E:\Projects\my-app\src\main.py`
- Env vars: `%USERPROFILE%`, `%APPDATA%`, `%TEMP%`
### Script Files
Use .cmd or .bat (NOT .ps1). Alternative: Ruby scripts for complex automation.
### Verification Steps
```
STEP 6: Run: python src\main.py
STEP 7: Verify output in console
STEP 8: Report errors or success
```
### Windows-Specific Libraries
- **Python**: pywin32, winshell, pyinstaller
- **Ruby**: win32ole, ocra
- **Node.js**: node-windows, electron
## macOS Desktop Development
### Path Conventions
- Forward slashes: `/Users/username/Projects/my-app/src/main.py`
- Env vars: `$HOME`, `$TMPDIR`, `$PATH`
### Common Tools
- python3 (Homebrew), ruby (rbenv), node (nvm), Homebrew, Xcode
### macOS Frameworks
- **Swift**: AppKit, SwiftUI, Foundation
- **Python**: py2app, rumps (menu bar)
## Linux Desktop Development
### Path Conventions
- Forward slashes: `/home/username/projects/my-app/`
- Env vars: `$HOME`, `$USER`, `$XDG_CONFIG_HOME`
### Libraries
- **Python**: PyGObject (GTK+), PyQt5
- **System**: .desktop files, systemd services
## Cross-Platform Development
### Frameworks
| Framework | Language | Notes |
|-----------|----------|-------|
| **Electron** | JavaScript/Node.js | Web technologies, native APIs via Node.js |
| **Tauri** | Rust + Web | Lightweight, system webview, smaller bundles |
| **Qt** | C++/Python/Ruby | Native look, comprehensive widgets |
| **.NET MAUI** | C# | Shared codebase, native performance |
### Cross-Platform Path Handling
```python
import os
from pathlib import Path
data_path = os.path.join('data', 'input.txt')
project_root = Path(__file__).parent
```
### Platform Detection
```python
import platform
if platform.system() == 'Windows': ...
elif platform.system() == 'Darwin': ...
elif platform.system() == 'Linux': ...
```
## Configuration Management Pattern
```python
import json, os, sys
from pathlib import Path
def get_config_dir():
    if os.name == 'nt':
        return Path(os.getenv('APPDATA')) / 'MyApp'
    elif sys.platform == 'darwin':
        return Path.home() / 'Library' / 'Application Support' / 'MyApp'
    else:
        return Path.home() / '.config' / 'myapp'
```
## Electron Development
### Project Setup
```bash
mkdir my-electron-app && cd my-electron-app && npm init -y && npm install electron --save-dev
```
### Essential Structure
```
my-electron-app/
├── package.json
├── main.js          # Main process
├── preload.js       # Bridge to renderer
├── index.html       # UI
└── renderer.js      # UI logic
```
### IPC Communication
```javascript
// preload.js
const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('api', {
  saveFile: (data) => ipcRenderer.invoke('save-file', data),
  onUpdate: (callback) => ipcRenderer.on('update', callback)
})
// main.js
ipcMain.handle('save-file', async (event, data) => { return { success: true } })
// renderer.js
const result = await window.api.saveFile(myData)
```
### Common Gotchas
| Issue | Solution |
|-------|----------|
| Security warnings | Use preload.js with contextBridge |
| Window not closing (macOS) | Handle window-all-closed event |
| Blank window | Use path.join(__dirname, ...) |
| Large bundle | Use electron-builder with compression |
## Tauri Development
### Setup
```bash
npm create tauri-app@latest my-tauri-app && cd my-tauri-app && npm install && npm run tauri dev
```
### Rust Commands
```rust
#[tauri::command]
fn greet(name: &str) -> String { format!("Hello, {}!", name) }
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!()).expect("error running tauri");
}
```
### Tauri vs Electron
| Factor | Tauri | Electron |
|--------|-------|----------|
| Bundle size | ~3-10 MB | ~150+ MB |
| Memory | Lower | Higher |
| Backend | Rust | JavaScript |
| Learning curve | Higher (Rust) | Lower (JS) |
| Ecosystem | Growing | Mature |
## Native Platform Patterns
### macOS (SwiftUI)
```swift
struct ContentView: View {
    @State private var message = "Hello, macOS!"
    var body: some View {
        VStack {
            Text(message).font(.largeTitle)
            Button("Click Me") { message = "Button clicked!" }.buttonStyle(.borderedProminent)
        }.frame(width: 400, height: 300).padding()
    }
}
```
### Windows (WinUI 3)
```csharp
public sealed partial class MainWindow : Window {
    public MainWindow() { this.InitializeComponent(); Title = "My App"; }
    private void OnButtonClick(object sender, RoutedEventArgs e) { MessageTextBlock.Text = "Clicked!"; }
}
```
## Transition Triggers
### Complexity Triggers
| Trigger | Threshold |
|---------|-----------|
| Multiple windows | > 3 with inter-communication |
| Background processing | Long-running tasks blocking UI |
| Data persistence | > 5 data types stored |
| User preferences | > 10 configurable settings |
### Platform Triggers
| Trigger | Threshold |
|---------|-----------|
| Cross-platform | Support > 2 platforms |
| Native features | > 3 OS-specific APIs |
| Packaging | Need installer/updates |
### Decision Matrix
```
IF (complexity_triggers >= 3) OR (platform_triggers >= 2): → Transition to Agile
IF (exploring_single_feature) AND (< 500 lines): → Stay in Vibe
IF (multiple_developers) OR (formal_requirements): → Transition immediately
```
## Packaging & Distribution
| App Type | Windows | macOS | Linux |
|----------|---------|-------|-------|
| Python CLI | PyInstaller → .exe | PyInstaller → binary | PyInstaller → binary |
| Python GUI | PyInstaller → .exe | py2app → .app | AppImage |
| Electron | electron-builder → .exe/.msi | → .dmg | → .AppImage/.deb |
| Tauri | tauri build → .msi | → .dmg | → .AppImage/.deb |
### Code Signing
| Platform | Requirement | Cost |
|----------|-------------|------|
| Windows | EV Code Signing Certificate | ~$300-500/year |
| macOS | Apple Developer Program | $99/year |
| Linux | GPG signing (optional) | Free |
## Testing Strategies
### CLI Testing
```python
def test_help_flag():
    result = subprocess.run(['python', 'src/main.py', '--help'], capture_output=True, text=True)
    assert result.returncode == 0
    assert 'usage:' in result.stdout.lower()
```
### GUI Testing (pytest-qt)
```python
def test_window_title(qtbot):
    window = MainWindow()
    qtbot.addWidget(window)
    assert window.windowTitle() == 'My Application'
```
**End of Desktop Framework**
