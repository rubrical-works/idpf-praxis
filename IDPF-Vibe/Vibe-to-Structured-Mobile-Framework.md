# Vibe-to-Structured Development Framework (Mobile)
**Version:** v0.77.2
**Type:** Mobile Application Specialization
**Extends:** Vibe-to-Structured-Core-Framework.md (Rev 2)
## Purpose
Specializes Core Framework for mobile development on iOS, Android, and cross-platform.
**Evolution Target:** IDPF-Agile
## Mobile Platform Coverage
- **iOS**: Swift, Objective-C, React Native, Flutter
- **Android**: Kotlin, Java, React Native, Flutter
- **Cross-platform**: React Native, Flutter, Ionic, Xamarin
**Application Types:** Native iOS, Native Android, Hybrid, PWAs
## Development Environment Prerequisites
**iOS:** macOS (required), Xcode, Command Line Tools, iOS Simulator
**Android:** Android Studio, Android SDK, Emulator
**React Native:** Node.js, React Native CLI, platform tools
**Flutter:** Flutter SDK, `flutter doctor` passes
### Verification Process
Before project creation, verify platform tools are installed and working.
## Platform-Specific Session Initialization
Follow Core Framework initialization (Steps 1-4), then ask:
- **Target platform?** (iOS/Android/Both)
- **Development approach?** (Native/React Native/Flutter/Other)
- **Your environment?** (Development computer)
- **Testing method?** (Simulator/Emulator/Real device)
- **App type?** (Utility/Social/Game/Enterprise)
## iOS Development
### Running Apps
```bash
# React Native
npx react-native run-ios --simulator="iPhone 15 Pro"
# Flutter
flutter run -d "iPhone 15 Pro"
```
### Verification Pattern
```
STEP 6: Build and run in Xcode
STEP 7: Select simulator: "iPhone 15 Pro"
STEP 8: Run: Cmd+R
STEP 9: Verify: app launches, main screen displays, navigation works
STEP 10: Test feature and report results
```
## Android Development
### Running Apps
```bash
# React Native
npx react-native run-android
# Flutter
flutter run -d emulator-5554
```
### Verification Pattern
```
STEP 6: Build and run in Android Studio
STEP 7: Select device: "Pixel 7 API 33"
STEP 8: Run: Shift+F10
STEP 9: Wait for emulator
STEP 10: Verify app installs and test feature
STEP 11: Report results
```
## Cross-Platform Development
### React Native
```bash
npx create-expo-app MyApp && cd MyApp && npm start
npm run ios    # iOS Simulator
npm run android # Android Emulator
```
### Flutter
```bash
flutter create my_app && cd my_app && flutter run
```
Hot Reload: `r` | Hot Restart: `R`
## Mobile UI/UX Patterns
### Touch Interactions
- Tap: Primary action | Long press: Context menu | Swipe: Navigation/delete
- Pinch: Zoom | Drag: Reorder | Pull to refresh: Update
- Touch targets: min 44x44 pts (iOS) / 48x48 dp (Android)
### Navigation
- **Tab Navigation**: Bottom tabs, 3-5 sections
- **Stack Navigation**: Push/pop for hierarchical content
## React Native Development
### Project Setup
```bash
npx create-expo-app@latest MyApp && cd MyApp && npx expo start
```
### Essential Patterns
```javascript
import React, { useState } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
export default function HomeScreen() {
  const [count, setCount] = useState(0);
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Count: {count}</Text>
      <Button title="Increment" onPress={() => setCount(c => c + 1)} />
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: { fontSize: 24, marginBottom: 20 },
});
```
### Common Gotchas
| Issue | Solution |
|-------|----------|
| Metro cache | `npx expo start -c` |
| Styling differences | Test on both platforms |
| Slow scrolling | Use FlatList not ScrollView |
| Native module errors | `npx pod-install` for iOS |
| Expo limitations | Eject to bare workflow |
## Flutter Development
### Essential Patterns
```dart
class CounterScreen extends StatefulWidget {
  const CounterScreen({super.key});
  @override
  State<CounterScreen> createState() => _CounterScreenState();
}
class _CounterScreenState extends State<CounterScreen> {
  int _count = 0;
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Counter')),
      body: Center(child: Text('Count: $_count', style: const TextStyle(fontSize: 24))),
      floatingActionButton: FloatingActionButton(
        onPressed: () => setState(() => _count++),
        child: const Icon(Icons.add),
      ),
    );
  }
}
```
### Common Gotchas
| Issue | Solution |
|-------|----------|
| Widget overflow | Wrap with Expanded, Flexible, or SingleChildScrollView |
| State not updating | Use setState() in StatefulWidget |
| Hot reload failing | Try R (restart) or full restart |
| Build errors | flutter clean then flutter pub get |
## Native iOS (Swift/SwiftUI)
```swift
struct ContentView: View {
    @State private var count = 0
    var body: some View {
        NavigationView {
            VStack(spacing: 20) {
                Text("Count: \(count)").font(.largeTitle)
                Button("Increment") { count += 1 }.buttonStyle(.borderedProminent)
                NavigationLink("Go to Details") { DetailsView() }
            }.navigationTitle("Home")
        }
    }
}
```
| Aspect | Guidance |
|--------|----------|
| Safe Area | Always respect safe area insets |
| Dynamic Type | Support font scaling |
| Dark Mode | Use semantic colors, test both |
| Haptics | Add tactile feedback |
## Native Android (Kotlin/Compose)
```kotlin
@Composable
fun HomeScreen() {
    var count by remember { mutableStateOf(0) }
    Column(modifier = Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(text = "Count: $count", style = MaterialTheme.typography.headlineLarge)
        Spacer(modifier = Modifier.height(16.dp))
        Button(onClick = { count++ }) { Text("Increment") }
    }
}
```
| Aspect | Guidance |
|--------|----------|
| Back button | Handle system back navigation |
| Config changes | Survive rotation with ViewModel |
| Material Design | Follow Material 3 guidelines |
| Permissions | Request runtime permissions |
## Testing Strategies
### iOS (XCTest)
```swift
func testAddTodo() {
    let viewModel = TodoViewModel()
    viewModel.addTodo("Test")
    XCTAssertEqual(viewModel.todos.count, 1)
}
```
### Android (JUnit)
```kotlin
@Test
fun addTodo_increasesList() {
    val viewModel = TodoViewModel()
    viewModel.addTodo("Test")
    assertEquals(1, viewModel.todos.size)
}
```
## Transition Triggers
| Category | Trigger | Threshold |
|----------|---------|-----------|
| Complexity | Navigation depth | > 5 levels |
| Complexity | State management | > 3 screens sharing state |
| Complexity | API integrations | > 3 endpoints |
| Platform | Platform parity | Significant iOS/Android differences |
| Platform | App Store submission | Any public release |
| UX | Offline support | Any offline requirements |
| UX | Accessibility | Any public release |
### Decision Matrix
```
IF (complexity_triggers >= 3) OR (platform_triggers >= 2): → Transition to Agile
IF (exploring_single_screen) AND (< 500 lines): → Stay in Vibe
IF (app_store_submission) OR (multiple_developers): → Transition immediately
```
## Mobile Constraint Quick Reference
| Constraint | iOS | Android | Mitigation |
|------------|-----|---------|------------|
| Battery | Background App Refresh limits | Doze mode | Batch ops, reduce wakeups |
| Memory | ~200MB warning | Varies | Cache wisely, release resources |
| Network | NSURLSession | OkHttp/Retrofit | Retry with backoff, cache |
| Storage | Sandbox limited | Internal/External | Compress, clean temp |
| Background | 30s limit | WorkManager | Use platform background APIs |
**End of Mobile Framework**
