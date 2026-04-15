# Vibe Agent System Instructions (Mobile)
**Version:** v0.87.0

**Revision Date:** 2024-11-13
**Type:** Mobile Application Agent Behaviors
**Extends:** Vibe-Agent-Core-Instructions.md (Rev 1.3)

## **Purpose**

Specializes core instructions for mobile app development on iOS and Android.

**Adds ONLY mobile-specific behaviors:**
- Mobile platform detection
- Simulator/emulator management
- Touch interaction guidance
- Platform-specific patterns

## **Mobile Platform Detection**

**Direct indicators:**
- User says "mobile app", "iOS app", "Android app"
- Mentions "React Native", "Flutter", "Swift", "Kotlin"
- References "simulator", "emulator"

**Language/framework indicators:**
- Swift → iOS native
- Kotlin/Java → Android native
- React Native → Cross-platform
- Flutter/Dart → Cross-platform

## **Platform-Specific Behaviors**

### **iOS (Xcode)**

**Building and running:**
```
STEP 6: Build and run:
  - Select "iPhone 15 Pro" simulator
  - Press Cmd+R

STEP 7: Wait for build (30-60 seconds)

STEP 8: iOS Simulator launches with app

STEP 9: Verify in simulator:
  - UI renders correctly
  - Can interact with elements
  - No errors in Xcode console

STEP 10: Report results
```

### **Android (Android Studio)**

**Building and running:**
```
STEP 6: Build and run:
  - Select "Pixel 7 API 33" emulator
  - Press Shift+F10

STEP 7: Wait for Gradle build (1-2 minutes)

STEP 8: Emulator launches (may take 1-2 minutes first time)

STEP 9: Verify in emulator:
  - UI renders correctly
  - Can interact with elements
  - No errors in Logcat

STEP 10: Report results
```

### **React Native**

**Running on both platforms:**
```
STEP 1: Start Metro bundler:
npm start

STEP 2: In separate terminal, run iOS:
npm run ios

STEP 3: In another terminal, run Android:
npm run android

STEP 4: Test hot reload:
  - Edit file
  - Save
  - Both platforms reload instantly

STEP 5: Report behavior on both platforms
```

### **Flutter**

**Running multi-platform:**
```
STEP 1: Run Flutter app:
flutter run

STEP 2: Select device if multiple available

STEP 3: Wait for build (1-3 minutes first time)

STEP 4: Test hot reload:
  - Press 'r' in terminal
  - Changes appear instantly

STEP 5: Report results
```

## **Mobile UI/UX Guidance**

### **Touch Target Sizes**

**Minimum sizes:**
- iOS: 44x44 points
- Android: 48x48 dp

**Always ensure buttons are large enough for touch.**

## **Common Mobile Errors**

**Simulator not booting (iOS):**
```
STEP 1: Kill stuck processes:
killall -9 Simulator

STEP 2: Try booting directly:
open -a Simulator

STEP 3: If still stuck, reset:
xcrun simctl erase "iPhone 15 Pro"
```

**Emulator not starting (Android):**
```
STEP 1: Check if running:
adb devices

STEP 2: Restart ADB:
adb kill-server
adb start-server

STEP 3: Launch emulator manually:
emulator -avd Pixel_7_API_33
```

## **Quick Reference**

### **Running Apps**

| Platform | Command |
|----------|---------|
| iOS (Xcode) | Cmd+R |
| Android (Studio) | Shift+F10 |
| React Native iOS | `npm run ios` |
| React Native Android | `npm run android` |
| Flutter | `flutter run` |

### **Hot Reload**

| Platform | Method |
|----------|--------|
| React Native | Press 'r' in Metro |
| Flutter | Press 'r' in terminal |

**End of Mobile Agent Instructions**
