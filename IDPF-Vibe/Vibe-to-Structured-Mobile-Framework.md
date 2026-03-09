# **Vibe-to-Structured Development Framework (Mobile)**
**Version:** v0.60.0
**Type:** Mobile Application Specialization
**Extends:** Vibe-to-Structured-Core-Framework.md (Rev 2)

## **Purpose**
This framework specializes the **Vibe-to-Structured Core Framework** for mobile application development on iOS, Android, and cross-platform.
**Read this in combination with:**
- `Vibe-to-Structured-Core-Framework.md` - Core workflow and methodology
**This document adds:**
- Mobile platform-specific workflows
- Simulator and emulator management
- Device testing strategies
- Mobile UI/UX patterns
- Platform-specific APIs and capabilities
- Touch interaction patterns
- Mobile app lifecycle management
**Evolution Target:** IDPF-Agile (sprints, user stories, iterative delivery)
See Core Framework for details on the evolution process.

## **Mobile Platform Coverage**
- **iOS** development (Swift, Objective-C, React Native, Flutter)
- **Android** development (Kotlin, Java, React Native, Flutter)
- **Cross-platform** mobile (React Native, Flutter, Ionic, Xamarin)

### **Application Types**
- **Native iOS**: Swift/SwiftUI, Objective-C/UIKit
- **Native Android**: Kotlin/Jetpack Compose, Java/Android Views
- **Hybrid**: React Native, Flutter, Ionic, Capacitor
- **Progressive Web Apps (PWAs)**: Mobile-optimized web apps

## **Development Environment Prerequisites**

### **Before Starting ANY Mobile Project**
The ASSISTANT must verify platform-specific tools are installed BEFORE project creation.
**iOS Development:**
- macOS computer (required)
- Xcode installed from Mac App Store
- Command Line Tools: `xcode-select --install`
- iOS Simulator available
**Android Development:**
- Android Studio installed
- Android SDK configured
- Emulator available
**React Native:**
- Node.js installed
- React Native CLI: `npm install -g react-native-cli`
- Platform tools (Xcode for iOS, Android Studio for Android)
**Flutter:**
- Flutter SDK installed
- `flutter doctor` passes all checks
- Platform tools configured

### **Verification Process**
When user says "Let's start a mobile project", BEFORE any other steps:
```
Before creating your mobile project, I need to verify your development environment.

Which platform are you targeting?
1. iOS
2. Android
3. Both (React Native/Flutter)

Which option?

[After platform selection]

Do you have [PLATFORM_TOOLS] installed and working?
✅ "Yes, ready to go"
❓ "Not sure" or "No" - I'll guide you through setup

[Wait for response before proceeding]
```
**If tools are NOT installed:**
1. Ask clarifying questions in this order:
   - What operating system are you on?
   - Do you already have [PLATFORM_TOOLS] installed?
     - Yes, but not sure if working → Guide verification steps
     - No → Guide installation process
2. Provide installation guidance specific to platform and OS
3. Verify installation with diagnostic commands
4. ONLY proceed with project creation after tools confirmed working

## **Platform-Specific Session Initialization**
When starting a mobile vibe project, the ASSISTANT follows Core Framework initialization (Steps 1-4, including establishing project location), then adds:
**Mobile-Specific Questions:**
- **Target platform?** (iOS/Android/Both)
- **Development approach?** (Native/React Native/Flutter/Other)
- **Your environment?** (What computer are you developing on?)
- **Testing method?** (Simulator/Emulator/Real device)
- **App type?** (Utility/Social/Game/Enterprise/etc.)

## **iOS Development**

### **Development Environment**
**Requirements:**
- macOS computer (required)
- Xcode from Mac App Store
- iOS Simulator (included)
- Optional: Apple Developer account for devices

### **Running iOS Apps**
**From Xcode:**
- Select target device (simulator or connected device)
- Click "Run" or press Cmd+R
**From command line (React Native/Flutter):**
```bash
# React Native
npx react-native run-ios --simulator="iPhone 15 Pro"

# Flutter
flutter run -d "iPhone 15 Pro"
```

### **iOS Verification Patterns**
```
STEP 6: Build and run in Xcode
STEP 7: Select simulator: "iPhone 15 Pro"
STEP 8: Run app: Press Cmd+R
STEP 9: Verify in Simulator:
  - App launches successfully
  - Main screen displays correctly
  - Navigation works
STEP 10: Test feature and report results
```

## **Android Development**

### **Development Environment**
**Requirements:**
- Any OS (Windows, macOS, Linux)
- Android Studio
- Android SDK
- Android Emulator

### **Running Android Apps**
**From Android Studio:**
- Select target device
- Click "Run" or press Shift+F10
**From command line:**
```bash
# React Native
npx react-native run-android

# Flutter
flutter run -d emulator-5554
```

### **Android Verification Patterns**
```
STEP 6: Build and run in Android Studio
STEP 7: Select device: "Pixel 7 API 33"
STEP 8: Run app: Press Shift+F10
STEP 9: Wait for emulator to start
STEP 10: Verify app installs and test feature
STEP 11: Report results
```

## **Cross-Platform Development**

### **React Native**
**Setup:**
```bash
npx create-expo-app MyApp
cd MyApp
npm start
```
**Running:**
```bash
npm run ios    # iOS Simulator
npm run android # Android Emulator
```

### **Flutter**
**Setup:**
```bash
flutter create my_app
cd my_app
flutter run
```
**Hot Reload:**
- Press `r` for hot reload
- Press `R` for hot restart

## **Mobile UI/UX Patterns**

### **Touch Interactions**
- Tap: Primary action
- Long press: Context menu
- Swipe: Navigation, delete
- Pinch: Zoom in/out
- Drag: Reorder items
- Pull to refresh: Update content
**Touch targets:**
- Minimum 44x44 points (iOS) / 48x48 dp (Android)

### **Navigation Patterns**
**Tab Navigation:**
- Bottom tabs for primary sections
- 3-5 top-level sections
**Stack Navigation:**
- Push/pop for hierarchical content
- Back button support

## **Mobile-Specific Requirements Additions**

### **Platform Support**
```markdown
## Platform Support

### iOS
- Minimum version: iOS 15.0
- Target devices: iPhone 8 and newer

### Android
- Minimum SDK: API 24 (Android 7.0)
- Target devices: All standard Android phones
```

### **Device Features**
```markdown
## Device Features & Permissions

### Required Permissions
- Camera: For taking photos
- Location: For finding nearby places
- Notifications: For important updates
```

## **Testing Strategies**

### **Unit Testing**
**iOS (XCTest):**
```swift
import XCTest
@testable import MyApp

class MyAppTests: XCTestCase {
    func testAddTodo() {
        let viewModel = TodoViewModel()
        viewModel.addTodo("Test")
        XCTAssertEqual(viewModel.todos.count, 1)
    }
}
```
**Android (JUnit):**
```kotlin
import org.junit.Test
import org.junit.Assert.*

class TodoViewModelTest {
    @Test
    fun addTodo_increasesList() {
        val viewModel = TodoViewModel()
        viewModel.addTodo("Test")
        assertEquals(1, viewModel.todos.size)
    }
}
```

## **Mobile-Specific Vibe Coding Patterns**

### **Pattern 1: Screen-First Exploration**
Start with a visible screen to maintain momentum:
```
VIBE PATTERN: Start with visible output
✅ DO: Create a basic screen immediately
❌ AVOID: Spending time on architecture before seeing results

Step 1: Create minimal screen with placeholder content
Step 2: Add one interactive element (button, text field)
Step 3: Wire up a simple navigation or action
Step 4: See it work on simulator, then iterate
```

### **Pattern 2: Hot Reload Workflow**
Leverage hot reload for rapid iteration:
```
VIBE CYCLE for Mobile:
1. Make a UI change
2. Save file (hot reload triggers)
3. See change instantly on device
4. Adjust and repeat

TIME TARGET: < 5 seconds per iteration
```

### **Pattern 3: Single-Screen Prototyping**
Keep everything in one screen during exploration:
```dart
// Flutter: Single-file mobile exploration
import 'package:flutter/material.dart';

void main() => runApp(const MyApp());

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Scaffold(
        appBar: AppBar(title: const Text('Vibe Prototype')),
        body: const Center(
          child: Text('Start exploring here!'),
        ),
        floatingActionButton: FloatingActionButton(
          onPressed: () {
            // Add exploration logic here
          },
          child: const Icon(Icons.add),
        ),
      ),
    );
  }
}
```

### **Pattern 4: Platform Toggle Exploration**
```dart
// Quick platform detection for mobile vibe coding
import 'dart:io';

final isIOS = Platform.isIOS;
final isAndroid = Platform.isAndroid;

// Use for quick platform-specific tweaks
Widget buildButton() {
  if (isIOS) {
    return CupertinoButton(/* iOS style */);
  } else {
    return ElevatedButton(/* Material style */);
  }
}
```

### **Pattern 5: Feature Flag Exploration**
```javascript
// React Native: Toggle features during exploration
const FEATURES = {
  darkMode: true,
  offlineMode: false,
  pushNotifications: false,
  biometricAuth: true,
};

// Use in components
{FEATURES.darkMode && <DarkModeToggle />}
{FEATURES.offlineMode && <OfflineIndicator />}
```

## **React Native Development Workflow**

### **Project Setup**
```bash
# Expo (Recommended for vibe coding)
npx create-expo-app@latest MyApp
cd MyApp
npx expo start

# React Native CLI (for native modules)
npx react-native@latest init MyApp
cd MyApp
```
**Project structure:**
```
MyApp/
├── App.js              # Entry point
├── app.json            # Expo configuration
├── package.json
├── src/
│   ├── screens/        # Screen components
│   ├── components/     # Reusable components
│   └── hooks/          # Custom hooks
└── assets/             # Images, fonts
```

### **Essential Patterns**
**Functional component with hooks:**
```javascript
import React, { useState, useEffect } from 'react';
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
**Navigation setup:**
```javascript
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

### **Common React Native Gotchas**
| Gotcha | Problem | Solution |
|--------|---------|----------|
| **Metro bundler cache** | Stale code after changes | `npx expo start -c` or `npm start -- --reset-cache` |
| **Styling differences** | iOS/Android look different | Test on both platforms regularly |
| **Performance on lists** | Slow scrolling | Use `FlatList` instead of `ScrollView` for long lists |
| **Native module errors** | Missing dependencies | Run `npx pod-install` for iOS |
| **Expo limitations** | Need native code | Eject to bare workflow or use dev client |
| **Debugging issues** | Can't see logs | Use React Native Debugger or Flipper |

## **Flutter Development Workflow**

### **Project Setup**
```bash
# Create new Flutter project
flutter create my_app
cd my_app
flutter run

# Run on specific device
flutter devices
flutter run -d <device_id>
```
**Project structure:**
```
my_app/
├── lib/
│   ├── main.dart       # Entry point
│   ├── screens/        # Screen widgets
│   ├── widgets/        # Reusable widgets
│   └── models/         # Data models
├── pubspec.yaml        # Dependencies
├── ios/                # iOS native code
├── android/            # Android native code
└── test/               # Tests
```

### **Essential Patterns**
**StatefulWidget pattern:**
```dart
import 'package:flutter/material.dart';

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
      body: Center(
        child: Text('Count: $_count', style: const TextStyle(fontSize: 24)),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => setState(() => _count++),
        child: const Icon(Icons.add),
      ),
    );
  }
}
```
**Navigation:**
```dart
// Push to new screen
Navigator.push(
  context,
  MaterialPageRoute(builder: (context) => const DetailsScreen()),
);

// Named routes
MaterialApp(
  routes: {
    '/': (context) => const HomeScreen(),
    '/details': (context) => const DetailsScreen(),
  },
);
```

### **Common Flutter Gotchas**
| Gotcha | Problem | Solution |
|--------|---------|----------|
| **Widget overflow** | Red overflow errors | Wrap with `Expanded`, `Flexible`, or `SingleChildScrollView` |
| **State not updating** | UI doesn't refresh | Ensure using `setState()` in StatefulWidget |
| **Hot reload not working** | Changes not appearing | Try hot restart (`R`) or full restart |
| **Build errors** | Gradle/CocoaPods issues | Run `flutter clean` then `flutter pub get` |
| **Null safety errors** | Dart null safety | Use `?`, `!`, `??` operators appropriately |
| **Key warnings** | List widget warnings | Add `key` parameter to list item widgets |

## **Native iOS (Swift) Patterns**

### **SwiftUI Quick Start**
```swift
import SwiftUI

struct ContentView: View {
    @State private var count = 0

    var body: some View {
        NavigationView {
            VStack(spacing: 20) {
                Text("Count: \(count)")
                    .font(.largeTitle)

                Button("Increment") {
                    count += 1
                }
                .buttonStyle(.borderedProminent)

                NavigationLink("Go to Details") {
                    DetailsView()
                }
            }
            .navigationTitle("Home")
        }
    }
}

#Preview {
    ContentView()
}
```

### **Common iOS Patterns**
**List with navigation:**
```swift
struct ItemListView: View {
    let items = ["Apple", "Banana", "Cherry"]

    var body: some View {
        List(items, id: \.self) { item in
            NavigationLink(item) {
                ItemDetailView(item: item)
            }
        }
    }
}
```
**Data fetching:**
```swift
class ItemViewModel: ObservableObject {
    @Published var items: [Item] = []
    @Published var isLoading = false

    func fetchItems() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let url = URL(string: "https://api.example.com/items")!
            let (data, _) = try await URLSession.shared.data(from: url)
            items = try JSONDecoder().decode([Item].self, from: data)
        } catch {
            print("Error: \(error)")
        }
    }
}
```

### **iOS-Specific Considerations**
| Aspect | Guidance |
|--------|----------|
| **Safe Area** | Always respect safe area insets |
| **Dynamic Type** | Support font scaling for accessibility |
| **Dark Mode** | Use semantic colors, test both modes |
| **Haptics** | Add tactile feedback for interactions |
| **Gestures** | Support standard iOS gestures |

## **Native Android (Kotlin) Patterns**

### **Jetpack Compose Quick Start**
```kotlin
@Composable
fun HomeScreen() {
    var count by remember { mutableStateOf(0) }

    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "Count: $count",
            style = MaterialTheme.typography.headlineLarge
        )
        Spacer(modifier = Modifier.height(16.dp))
        Button(onClick = { count++ }) {
            Text("Increment")
        }
    }
}

@Preview(showBackground = true)
@Composable
fun HomeScreenPreview() {
    HomeScreen()
}
```

### **Common Android Patterns**
**Navigation with Compose:**
```kotlin
@Composable
fun AppNavigation() {
    val navController = rememberNavController()

    NavHost(navController = navController, startDestination = "home") {
        composable("home") {
            HomeScreen(onNavigateToDetails = { navController.navigate("details") })
        }
        composable("details") {
            DetailsScreen(onBack = { navController.popBackStack() })
        }
    }
}
```
**ViewModel pattern:**
```kotlin
class ItemViewModel : ViewModel() {
    private val _items = MutableStateFlow<List<Item>>(emptyList())
    val items: StateFlow<List<Item>> = _items.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    fun fetchItems() {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                _items.value = repository.getItems()
            } finally {
                _isLoading.value = false
            }
        }
    }
}
```

### **Android-Specific Considerations**
| Aspect | Guidance |
|--------|----------|
| **Back button** | Handle system back navigation |
| **Configuration changes** | Survive rotation with ViewModel |
| **Material Design** | Follow Material 3 guidelines |
| **Permissions** | Request runtime permissions properly |
| **Deep links** | Support app links for sharing |

## **Mobile-Specific Transition Triggers**

### **Complexity Triggers**
| Trigger | Threshold | Action |
|---------|-----------|--------|
| **Navigation depth** | > 5 levels deep | Need navigation architecture |
| **State management** | > 3 screens sharing state | Consider state management solution |
| **API integrations** | > 3 different endpoints | Need API layer architecture |
| **Form complexity** | > 10 fields with validation | Need form management system |
| **Background tasks** | Any persistent background work | Need background job architecture |

### **Platform Triggers**
| Trigger | Threshold | Action |
|---------|-----------|--------|
| **Platform parity** | Significant iOS/Android differences | Document platform requirements |
| **Native modules** | > 2 native integrations | Plan native bridge architecture |
| **App Store submission** | Any public release | Need metadata, screenshots, review prep |
| **Push notifications** | Any notification requirements | Plan notification architecture |

### **User Experience Triggers**
| Trigger | Threshold | Action |
|---------|-----------|--------|
| **Offline support** | Any offline requirements | Need offline-first architecture |
| **Performance** | Any janky animations | Need performance optimization pass |
| **Accessibility** | Any public release | Need accessibility audit |
| **Localization** | Support > 1 language | Need i18n architecture |

### **Transition Decision Matrix**
```
IF (complexity_triggers >= 3) OR (platform_triggers >= 2):
    → Transition to Agile

IF (exploring_single_screen) AND (< 500 lines code):
    → Stay in Vibe mode

IF (app_store_submission) OR (multiple_developers):
    → Transition to Agile immediately
```

## **Mobile Exploration Patterns (Offline, Battery, Connectivity)**

### **Pattern 1: Offline-First Exploration**
```dart
// Flutter: Quick offline state exploration
class OfflineAwareWidget extends StatefulWidget {
  @override
  _OfflineAwareWidgetState createState() => _OfflineAwareWidgetState();
}

class _OfflineAwareWidgetState extends State<OfflineAwareWidget> {
  bool isOnline = true;

  @override
  void initState() {
    super.initState();
    // Listen to connectivity changes
    Connectivity().onConnectivityChanged.listen((result) {
      setState(() {
        isOnline = result != ConnectivityResult.none;
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        if (!isOnline)
          Container(
            color: Colors.red,
            padding: EdgeInsets.all(8),
            child: Text('Offline - Changes will sync when online'),
          ),
        // Rest of UI
      ],
    );
  }
}
```
**Offline data strategy exploration:**
```javascript
// React Native: Explore caching patterns
import AsyncStorage from '@react-native-async-storage/async-storage';

// Simple cache-first pattern
async function getData(key, fetchFn) {
  // Try cache first
  const cached = await AsyncStorage.getItem(key);
  if (cached) {
    return JSON.parse(cached);
  }

  // Fetch and cache
  const data = await fetchFn();
  await AsyncStorage.setItem(key, JSON.stringify(data));
  return data;
}
```

### **Pattern 2: Battery-Aware Exploration**
```kotlin
// Android: Check battery state
class BatteryAwareFeature(context: Context) {
    private val batteryManager = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager

    fun shouldReduceWork(): Boolean {
        val batteryLevel = batteryManager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        val isCharging = batteryManager.isCharging

        return batteryLevel < 20 && !isCharging
    }

    fun adaptBehavior() {
        if (shouldReduceWork()) {
            // Reduce background sync frequency
            // Disable non-essential animations
            // Defer heavy computations
        }
    }
}
```
```swift
// iOS: Battery state exploration
import UIKit

class BatteryMonitor {
    init() {
        UIDevice.current.isBatteryMonitoringEnabled = true
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(batteryLevelChanged),
            name: UIDevice.batteryLevelDidChangeNotification,
            object: nil
        )
    }

    @objc func batteryLevelChanged() {
        let level = UIDevice.current.batteryLevel
        let state = UIDevice.current.batteryState

        if level < 0.2 && state != .charging {
            // Enable low-power mode features
        }
    }
}
```

### **Pattern 3: Network Quality Exploration**
```javascript
// React Native: Adapt to network quality
import NetInfo from '@react-native-netinfo/netinfo';

function useNetworkQuality() {
  const [quality, setQuality] = useState('unknown');

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      if (!state.isConnected) {
        setQuality('offline');
      } else if (state.type === 'cellular') {
        // Cellular - be conservative
        setQuality(state.details?.cellularGeneration || 'slow');
      } else if (state.type === 'wifi') {
        setQuality('fast');
      }
    });

    return unsubscribe;
  }, []);

  return quality;
}

// Use in component
function ImageLoader({ url }) {
  const quality = useNetworkQuality();

  // Load appropriate image quality
  const imageUrl = quality === 'fast'
    ? url.replace('.jpg', '@2x.jpg')
    : url.replace('.jpg', '@1x.jpg');

  return <Image source={{ uri: imageUrl }} />;
}
```

### **Pattern 4: Background App State**
```dart
// Flutter: App lifecycle exploration
class AppLifecycleObserver extends StatefulWidget {
  @override
  _AppLifecycleObserverState createState() => _AppLifecycleObserverState();
}

class _AppLifecycleObserverState extends State<AppLifecycleObserver>
    with WidgetsBindingObserver {

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.resumed:
        // App is visible and responding
        _refreshData();
        break;
      case AppLifecycleState.inactive:
        // App transitioning (e.g., phone call)
        break;
      case AppLifecycleState.paused:
        // App is in background
        _saveState();
        break;
      case AppLifecycleState.detached:
        // App is being terminated
        _cleanup();
        break;
    }
  }
}
```

### **Pattern 5: Memory Pressure Handling**
```swift
// iOS: Memory warning exploration
class MemoryAwareViewController: UIViewController {
    var cache: [String: UIImage] = [:]

    override func didReceiveMemoryWarning() {
        super.didReceiveMemoryWarning()

        // Clear non-essential caches
        cache.removeAll()

        // Log for debugging during vibe coding
        print("⚠️ Memory warning - cleared \(cache.count) cached images")
    }
}
```

### **Mobile Constraint Quick Reference**
| Constraint | iOS | Android | Mitigation |
|------------|-----|---------|------------|
| **Battery** | Background App Refresh limits | Doze mode | Batch operations, reduce wakeups |
| **Memory** | ~200MB warning | Varies by device | Cache wisely, release resources |
| **Network** | NSURLSession | OkHttp/Retrofit | Retry with backoff, cache responses |
| **Storage** | Sandbox limited | Internal/External | Compress assets, clean temp files |
| **Background** | 30s limit | WorkManager | Use platform background APIs |

## **When to Use Mobile Framework**
**Use when building:**
✅ Native iOS/Android apps
✅ Cross-platform mobile apps
✅ Mobile-first applications
✅ Apps requiring device features
**Consider other frameworks for:**
❌ Desktop apps → Desktop Framework
❌ Web apps → Web Framework
**End of Mobile Framework**
