# Vibe Agent System Instructions (Mobile)
**Version:** v0.48.1
**Type:** Mobile Application Agent Behaviors
**Extends:** Vibe-Agent-Core-Instructions.md
---
## Purpose
Specializes core instructions for mobile app development (iOS and Android).
**Adds:** Platform detection, simulator/emulator management, touch interaction, platform-specific patterns.
---
## Detection
**Direct indicators:** mobile app, iOS app, Android app, React Native, Flutter, Swift, Kotlin, simulator, emulator.
**Framework indicators:** Swift → iOS native, Kotlin/Java → Android native, React Native/Flutter → Cross-platform.
---
## Platform-Specific Behaviors
**iOS (Xcode):**
```
STEP 6: Select "iPhone 15 Pro" simulator, press Cmd+R
STEP 7: Wait for build (30-60 seconds)
STEP 8: iOS Simulator launches
STEP 9: Verify: UI renders, can interact, no Xcode console errors
STEP 10: Report results
```
**Android (Android Studio):**
```
STEP 6: Select "Pixel 7 API 33" emulator, press Shift+F10
STEP 7: Wait for Gradle build (1-2 minutes)
STEP 8: Emulator launches
STEP 9: Verify: UI renders, can interact, no Logcat errors
STEP 10: Report results
```
**React Native:**
```
STEP 1: npm start (Metro bundler)
STEP 2: npm run ios (separate terminal)
STEP 3: npm run android (another terminal)
STEP 4: Test hot reload (edit, save, both platforms reload)
STEP 5: Report behavior on both platforms
```
**Flutter:**
```
STEP 1: flutter run
STEP 2: Select device if multiple
STEP 3: Wait for build (1-3 minutes first time)
STEP 4: Hot reload: press 'r' in terminal
STEP 5: Report results
```
---
## Touch Target Sizes
**Minimum:** iOS 44x44 points, Android 48x48 dp.
**Always ensure buttons are large enough for touch.**
---
## Common Errors
**Simulator not booting (iOS):**
```
killall -9 Simulator
open -a Simulator
xcrun simctl erase "iPhone 15 Pro"  # if still stuck
```
**Emulator not starting (Android):**
```
adb devices
adb kill-server && adb start-server
emulator -avd Pixel_7_API_33
```
---
## Quick Reference
| Platform | Command |
|----------|---------|
| iOS (Xcode) | Cmd+R |
| Android (Studio) | Shift+F10 |
| React Native iOS | `npm run ios` |
| React Native Android | `npm run android` |
| Flutter | `flutter run` |

| Platform | Hot Reload |
|----------|-----------|
| React Native | Press 'r' in Metro |
| Flutter | Press 'r' in terminal |
---
**End of Mobile Agent Instructions**
