# Vibe-to-Structured Development Framework (Desktop)
**Version:** v0.49.1
**Type:** Desktop Application Specialization
**Extends:** Vibe-to-Structured-Core-Framework.md
## Purpose
Specializes Core Framework for cross-platform desktop apps: Windows, macOS, Linux using Electron, Tauri, or native toolkits.
**Evolution Target:** IDPF-Agile
## Desktop Technology Selection
| Framework | Size | Performance | Security | Web Skills | Native |
|-----------|------|-------------|----------|------------|--------|
| **Electron** | ~100MB | Medium | Medium | Full | Limited |
| **Tauri** | ~10MB | High | High | Full | Rust |
| **Native** | Varies | Highest | Highest | None | Full |
### When to Choose
| Criteria | Electron | Tauri | Native |
|----------|----------|-------|--------|
| Web skills | Perfect | Good | N/A |
| App size | Acceptable | Critical | Critical |
| Performance | Acceptable | Critical | Critical |
| System access | API-limited | Full | Full |
| Cross-platform | Required | Required | Optional |
## Session Initialization
After Core Framework Steps 1-4:
**Desktop-Specific Questions:**
- Target platforms? (Windows / macOS / Linux / All)
- Framework preference? (Electron / Tauri / Native)
- App type? (Utility / Tool / Media / Data / Other)
- Needs native features? (System tray / Notifications / File access / Hardware)
- UI complexity? (Simple / Moderate / Complex)
## Electron Development
### Project Structure
```
my-electron-app/
├── package.json
├── main.js          # Main process
├── preload.js       # Bridge script
├── index.html       # UI
├── styles.css
├── renderer.js      # UI logic
└── assets/
```
### Process Architecture
| Process | Role | Access |
|---------|------|--------|
| Main | Window management, Node.js APIs | Full |
| Renderer | UI rendering, DOM | Sandboxed |
| Preload | Bridge with contextBridge | Limited |
### Security (CRITICAL)
```javascript
// preload.js - Safe API exposure
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  readFile: (path) => ipcRenderer.invoke('read-file', path)
});
```
**Security Rules:** Disable nodeIntegration, enable contextIsolation, use ipcRenderer.invoke.
### Common Patterns
**App Lifecycle:**
```javascript
app.whenReady().then(createWindow);
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
```
**IPC Pattern:**
```javascript
// Main process
ipcMain.handle('operation', async (event, data) => result);
// Renderer via preload
const result = await window.api.operation(data);
```
### Packaging
```bash
npm install electron-builder --save-dev
npm run build  # Uses electron-builder config in package.json
```
## Tauri Development
### Project Structure
```
my-tauri-app/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/main.rs
└── src/              # Frontend
    ├── index.html
    └── main.js
```
### Architecture
| Layer | Technology | Role |
|-------|------------|------|
| Core | Rust | Business logic, OS access |
| Bridge | Tauri | IPC commands |
| UI | Web stack | User interface |
### Tauri Commands
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
```javascript
// Frontend
import { invoke } from '@tauri-apps/api/tauri';
const greeting = await invoke('greet', { name: 'World' });
```
### Capabilities (Tauri v2)
Configure in `tauri.conf.json` with strict permissions model.
## Native Development
### GTK (Linux primary)
```c
#include <gtk/gtk.h>
static void activate(GtkApplication *app, gpointer user_data) {
    GtkWidget *window = gtk_application_window_new(app);
    gtk_window_set_title(GTK_WINDOW(window), "Hello");
    gtk_window_present(GTK_WINDOW(window));
}
int main(int argc, char **argv) {
    GtkApplication *app = gtk_application_new("com.example.app", G_APPLICATION_DEFAULT_FLAGS);
    g_signal_connect(app, "activate", G_CALLBACK(activate), NULL);
    int status = g_application_run(G_APPLICATION(app), argc, argv);
    g_object_unref(app);
    return status;
}
```
### Qt (Cross-platform)
```cpp
#include <QApplication>
#include <QMainWindow>
int main(int argc, char *argv[]) {
    QApplication app(argc, argv);
    QMainWindow window;
    window.setWindowTitle("Hello Qt");
    window.show();
    return app.exec();
}
```
### Python Options
| Library | Best For |
|---------|----------|
| **PyQt/PySide** | Complex apps |
| **Tkinter** | Simple apps |
| **Kivy** | Touch/mobile |
## Verification Patterns
```
STEP 6: Run application: npm start (Electron) or npm run tauri dev (Tauri)
STEP 7: Window appears
STEP 8: Test: UI renders, interactions work, window controls function
STEP 9: Check DevTools console for errors
STEP 10: Test platform-specific features
STEP 11: Report results
```
## Desktop-Specific Requirements
### At Evolution Point Add:
```markdown
## Desktop Platform Support
Target platforms: [list]
Min versions: [versions]
Installers: [formats]
Auto-update: [strategy]
## Security Requirements
IPC patterns: [documented]
File access: [scoped]
Network: [restricted]
Permissions: [list]
## Native Integration
System tray: [yes/no]
Notifications: [yes/no]
File associations: [list]
Deep linking: [protocols]
```
## Desktop-Specific Transition Triggers
| Trigger | Threshold | Action |
|---------|-----------|--------|
| Multiple windows | > 2 | Need window management |
| Native features | > 3 | Plan integration |
| Large binary | > 500 MB | Optimize assets |
| Performance | User reports | Profile and optimize |
## Best Practices
### Vibe Phase
- Start single window
- Use DevTools heavily
- Test on primary platform first
- Mock native features initially
### Structured Phase
- Add IPC validation
- Implement error handling
- Test all platforms
- Optimize bundle size
---
**End of Desktop Framework**
