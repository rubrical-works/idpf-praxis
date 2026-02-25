# Vibe-to-Structured Development Framework (Mobile)
**Version:** v0.52.0
**Type:** Mobile App Specialization
**Extends:** Vibe-to-Structured-Core-Framework.md
## Purpose
Specializes Core Framework for iOS and Android apps using React Native, Flutter, or native development.
**Evolution Target:** IDPF-Agile
## Mobile Technology Selection
| Framework | Language | Performance | Code Sharing | Native Access |
|-----------|----------|-------------|--------------|---------------|
| **React Native** | TypeScript/JS | Good | ~90% | Via bridges |
| **Flutter** | Dart | Excellent | 95%+ | Platform channels |
| **Native iOS** | Swift | Best | 0% | Full |
| **Native Android** | Kotlin | Best | 0% | Full |
### When to Choose
| Criteria | React Native | Flutter | Native |
|----------|--------------|---------|--------|
| Web dev team | Perfect | Good | Poor |
| Animation-heavy | Good | Excellent | Best |
| AR/ML features | Bridges | Plugins | Best |
| Development speed | Fast | Fast | Slower |
| Separate apps | Good | Good | Required |
## Session Initialization
After Core Framework Steps 1-4:
**Mobile-Specific Questions:**
- Target platforms? (iOS / Android / Both)
- Framework preference? (React Native / Flutter / Native)
- App type? (Consumer / Enterprise / Utility / Game)
- Key features? (Camera / Location / Payments / Notifications)
- Offline support? (Yes / No)
## React Native Development
### Project Structure
```
my-rn-app/
├── App.tsx
├── src/
│   ├── screens/
│   ├── components/
│   ├── navigation/
│   ├── services/
│   └── hooks/
├── ios/              # Native iOS
├── android/          # Native Android
├── package.json
└── tsconfig.json
```
### Navigation Pattern
```typescript
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
const Stack = createNativeStackNavigator();
export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Details" component={DetailsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```
### State Management
| Solution | Best For |
|----------|----------|
| useState/useReducer | Local, simple |
| Context + Reducer | Shared, medium |
| Redux Toolkit | Complex, team |
| Zustand | Simple global |
### Native Module Bridge
```typescript
import { NativeModules } from 'react-native';
const { MyNativeModule } = NativeModules;
const result = await MyNativeModule.doSomething(params);
```
## Flutter Development
### Project Structure
```
my_flutter_app/
├── lib/
│   ├── main.dart
│   ├── screens/
│   ├── widgets/
│   ├── models/
│   └── services/
├── android/
├── ios/
├── test/
└── pubspec.yaml
```
### Widget Pattern
```dart
class HomeScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Home')),
      body: Center(child: Text('Hello, Flutter!')),
      floatingActionButton: FloatingActionButton(
        onPressed: () {},
        child: Icon(Icons.add),
      ),
    );
  }
}
```
### State Management
| Solution | Best For |
|----------|----------|
| setState | Local, simple |
| Provider | Shared, recommended |
| Riverpod | Type-safe, testable |
| Bloc | Complex, reactive |
### Platform Channels
```dart
static const platform = MethodChannel('com.example/native');
Future<String> getNativeData() async {
  final result = await platform.invokeMethod('getData');
  return result;
}
```
## Native iOS (Swift)
### Project Structure
```
MyApp/
├── MyApp.xcodeproj
├── MyApp/
│   ├── AppDelegate.swift
│   ├── SceneDelegate.swift
│   ├── Views/
│   ├── Models/
│   └── Services/
├── MyAppTests/
└── MyAppUITests/
```
### SwiftUI Pattern
```swift
struct ContentView: View {
    @State private var count = 0
    var body: some View {
        VStack {
            Text("Count: \(count)")
            Button("Increment") { count += 1 }
        }
    }
}
```
## Native Android (Kotlin)
### Project Structure
```
app/
├── src/main/
│   ├── java/com/example/myapp/
│   │   ├── MainActivity.kt
│   │   └── ui/
│   ├── res/
│   └── AndroidManifest.xml
├── src/test/
└── build.gradle
```
### Compose UI Pattern
```kotlin
@Composable
fun HomeScreen() {
    var count by remember { mutableStateOf(0) }
    Column {
        Text("Count: $count")
        Button(onClick = { count++ }) { Text("Increment") }
    }
}
```
## Verification Pattern
```
STEP 6: Start app: npx react-native run-ios/android or flutter run
STEP 7: App launches in simulator/emulator
STEP 8: Test interactions, navigation, gestures
STEP 9: Check Metro/Flutter logs for errors
STEP 10: Test on both iOS and Android
STEP 11: Report results
```
## Mobile-Specific Requirements
### At Evolution Point Add:
```markdown
## Platform Support
iOS: Minimum version, devices
Android: API level, screen sizes
## Performance Targets
App size: < 50 MB
Cold start: < 2s
Memory: < 200 MB
## App Store Requirements
iOS: App Store guidelines
Android: Play Store policies
```
## Mobile-Specific Transition Triggers
| Trigger | Action |
|---------|--------|
| > 5 screens | Navigation architecture needed |
| Offline mode | State persistence design |
| Push notifications | Backend integration |
| In-app purchases | Platform integration |
| Deep linking | URL scheme design |
## Best Practices
### Vibe Phase
- Start one platform
- Use hot reload extensively
- Mock native features
- Test on real device early
### Structured Phase
- Handle lifecycle events
- Implement offline support
- Add analytics
- Test both platforms
- Accessibility audit
---
**End of Mobile Framework**
