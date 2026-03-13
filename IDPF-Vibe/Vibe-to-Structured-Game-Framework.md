# **Vibe-to-Structured Development Framework (Game)**
**Version:** v0.62.1
**Type:** Game Development Specialization
**Extends:** Vibe-to-Structured-Core-Framework.md (Rev 2)

## **Purpose**
This framework specializes the **Vibe-to-Structured Core Framework** for game development. It provides guidance for Godot, Unity, Unreal, and browser-based game development.
**Read this in combination with:**
- `Vibe-to-Structured-Core-Framework.md` - Core workflow and methodology
**This document adds:**
- Game engine-specific workflows
- Scene and project management
- Play-testing focused development
- Asset pipeline guidance
- Game mechanics iteration
- Performance optimization strategies
- Game-specific deployment
**Evolution Target:** IDPF-Agile (sprints, user stories, iterative delivery)
See Core Framework for details on the evolution process.

## **Game Platform Coverage**
This framework covers:
- **Godot Engine**: 2D/3D games with GDScript or C#
- **Unity**: 2D/3D games with C#
- **Unreal Engine**: 3D games with C++ or Blueprints
- **Browser Games**: Phaser, PixiJS, Three.js
- **Terminal Games**: Python curses, blessed (Node.js)

### **Game Types**
- **2D Games**: Platformers, puzzle games, roguelikes, top-down
- **3D Games**: FPS, third-person, racing, simulation
- **Mobile Games**: Touch-based, portrait/landscape
- **Browser Games**: WebGL, canvas-based
- **Multiplayer**: Local, online, turn-based, real-time

## **Platform-Specific Session Initialization**

### **Prerequisites: Claude Code Setup**
**IMPORTANT:** Before starting any project with this framework, ensure you have completed the **Claude Code setup** described in the Core Framework.
Refer to the "Working with Claude Code" section in `Vibe-to-Structured-Core-Framework.md` if you:
- Haven't used Claude Code before
- Are unsure about the two-tool workflow
- Need a refresher on how ASSISTANT and Claude Code work together
The instructions below assume you have Claude Code ready and understand the workflow.
When starting a game vibe project, the ASSISTANT follows Core Framework initialization (Steps 1-4, including establishing project location), then asks:
**Game-Specific Questions:**
- **Game engine?** (Godot / Unity / Unreal / Browser / Other)
- **2D or 3D?**
- **Game genre?** (Platformer / Puzzle / RPG / FPS / etc.)
- **Target platform?** (PC / Mobile / Web / Console)
- **Art style?** (Pixel art / 3D models / Abstract / etc.)
**Starting Point Suggestions:**
For Godot:
```
Let's start with Godot:
- Create new project
- Set up main scene
- Add player character
- Test in editor with F5
```
For Unity:
```
Let's start with Unity:
- Create new project
- Set up first scene
- Add player GameObject
- Test with Play button
```
For browser game:
```
Let's start with Phaser:
- Set up HTML/JS project
- Create game scene
- Add sprites and physics
- Test in browser
```

## **Godot Engine Development**

### **Development Environment**
**Requirements:**
- Godot Engine (latest stable version)
- Text editor (built-in or external)
- Optional: VS Code with GDScript extension
**Project Structure:**
```
MyGame/
├── project.godot           # Project file
├── scenes/
│   ├── Main.tscn          # Main scene
│   ├── Player.tscn        # Player scene
│   └── Enemy.tscn         # Enemy scene
├── scripts/
│   ├── Player.gd          # Player script
│   ├── Enemy.gd           # Enemy script
│   └── GameManager.gd     # Game logic
├── assets/
│   ├── sprites/           # 2D images
│   ├── models/            # 3D models
│   ├── sounds/            # Audio files
│   └── fonts/             # Font files
└── exports/               # Build output
```

### **Godot Scene Management**
**Creating scenes:**
```
STEP 1: In Godot editor:
Scene → New Scene

STEP 2: Choose root node type:
- Node2D (for 2D games)
- Spatial (for 3D games)
- Control (for UI)

STEP 3: Add child nodes as needed

STEP 4: Save scene (Ctrl+S):
scenes/MyScene.tscn
```
**Instancing scenes:**
```
STEP 1: In parent scene, right-click root node

STEP 2: Instance Child Scene

STEP 3: Select scene file (e.g., Player.tscn)

STEP 4: Scene is now instantiated and can be used
```

### **GDScript Basics**
**Player script example:**
```gdscript
# Player.gd
extends CharacterBody2D

const SPEED = 300.0
const JUMP_VELOCITY = -400.0

var gravity = ProjectSettings.get_setting("physics/2d/default_gravity")

func _physics_process(delta):
    # Add gravity
    if not is_on_floor():
        velocity.y += gravity * delta

    # Handle jump
    if Input.is_action_just_pressed("ui_accept") and is_on_floor():
        velocity.y = JUMP_VELOCITY

    # Get input direction
    var direction = Input.get_axis("ui_left", "ui_right")

    # Apply movement
    if direction:
        velocity.x = direction * SPEED
    else:
        velocity.x = move_toward(velocity.x, 0, SPEED)

    move_and_slide()
```

### **Godot Verification Pattern**
```
STEP 6: Run the scene in Godot:
Press F5 (run project) or F6 (run current scene)

STEP 7: Game window opens

STEP 8: Test the game:
  - Can control player with arrow keys
  - Jump with Space
  - Collisions work correctly
  - No errors in Output panel

STEP 9: Check Godot Output panel (bottom):
  - Look for any error messages (red)
  - Check warnings (yellow)

STEP 10: Test the mechanic:
  - [Specific interaction to test]
  - [Expected behavior]

STEP 11: Stop game (F8) and report:
  - What happened in game
  - Any errors in Output panel
  - Performance issues (lag, stuttering)
```

### **Godot Signals (Events)**
```gdscript
# Define signal
signal health_changed(new_health)
signal player_died

# Emit signal
func take_damage(amount):
    health -= amount
    health_changed.emit(health)

    if health <= 0:
        player_died.emit()

# Connect to signal (in another script)
func _ready():
    player.health_changed.connect(_on_player_health_changed)
    player.player_died.connect(_on_player_died)

func _on_player_health_changed(new_health):
    print("Health: ", new_health)

func _on_player_died():
    print("Game Over!")
```

### **Godot Export/Build**
```
STEP 1: Project → Export

STEP 2: Add export preset:
- Windows Desktop
- Linux/X11
- macOS
- HTML5 (Web)
- Android
- iOS

STEP 3: Configure preset settings

STEP 4: Export Project

STEP 5: Test exported build
```

## **Unity Development**

### **Development Environment**
**Requirements:**
- Unity Hub
- Unity Editor (LTS version recommended)
- Visual Studio or VS Code
- Optional: Unity packages (Input System, Cinemachine, etc.)
**Project Structure:**
```
MyGame/
├── Assets/
│   ├── Scenes/
│   │   └── MainScene.unity
│   ├── Scripts/
│   │   ├── PlayerController.cs
│   │   └── GameManager.cs
│   ├── Prefabs/          # Reusable GameObjects
│   ├── Materials/        # 3D materials
│   ├── Sprites/          # 2D images
│   ├── Audio/            # Sound files
│   └── Animations/       # Animation clips
├── Packages/             # Package dependencies
└── ProjectSettings/      # Unity settings
```

### **Unity Scene Management**
**Creating GameObjects:**
```
STEP 1: In Unity Hierarchy panel:
Right-click → Create Empty (or specific type)

STEP 2: Name the GameObject

STEP 3: In Inspector, add Components:
- Add Component → Scripts
- Add Component → Physics
- Add Component → Rendering

STEP 4: Save scene (Ctrl+S)
```
**Prefabs:**
```
STEP 1: Create GameObject in scene

STEP 2: Drag from Hierarchy to Project Assets/Prefabs/

STEP 3: Prefab is created - can be instantiated multiple times

STEP 4: Changes to prefab affect all instances
```

### **C# Script Basics (Unity)**
**Player controller example:**
```csharp
// PlayerController.cs
using UnityEngine;

public class PlayerController : MonoBehaviour
{
    public float speed = 5f;
    public float jumpForce = 10f;

    private Rigidbody2D rb;
    private bool isGrounded;

    void Start()
    {
        rb = GetComponent<Rigidbody2D>();
    }

    void Update()
    {
        // Horizontal movement
        float moveInput = Input.GetAxis("Horizontal");
        rb.velocity = new Vector2(moveInput * speed, rb.velocity.y);

        // Jump
        if (Input.GetKeyDown(KeyCode.Space) && isGrounded)
        {
            rb.AddForce(Vector2.up * jumpForce, ForceMode2D.Impulse);
        }
    }

    void OnCollisionEnter2D(Collision2D collision)
    {
        if (collision.gameObject.CompareTag("Ground"))
        {
            isGrounded = true;
        }
    }

    void OnCollisionExit2D(Collision2D collision)
    {
        if (collision.gameObject.CompareTag("Ground"))
        {
            isGrounded = false;
        }
    }
}
```

### **Unity Verification Pattern**
```
STEP 6: Run the game in Unity:
Click Play button (▶) at top of editor

STEP 7: Game view activates

STEP 8: Test the game:
  - Control player with input
  - Check collisions
  - Verify game logic

STEP 9: Check Console panel (bottom):
  - Look for errors (red)
  - Check warnings (yellow)
  - Debug.Log() messages appear here

STEP 10: Test the mechanic:
  - [Specific interaction]
  - [Expected behavior]

STEP 11: Stop game (click Play button again) and report:
  - Game behavior
  - Console errors/warnings
  - Performance (FPS shown in Game view stats)
```

### **Unity Events**
```csharp
using UnityEngine;
using UnityEngine.Events;

public class Player : MonoBehaviour
{
    public UnityEvent<int> OnHealthChanged;
    public UnityEvent OnPlayerDied;

    private int health = 100;

    public void TakeDamage(int amount)
    {
        health -= amount;
        OnHealthChanged?.Invoke(health);

        if (health <= 0)
        {
            OnPlayerDied?.Invoke();
        }
    }
}

// Subscribe to event in another script
void Start()
{
    player.OnHealthChanged.AddListener(HandleHealthChanged);
    player.OnPlayerDied.AddListener(HandlePlayerDied);
}

void HandleHealthChanged(int newHealth)
{
    Debug.Log("Health: " + newHealth);
}

void HandlePlayerDied()
{
    Debug.Log("Game Over!");
}
```

### **Unity Build**
```
STEP 1: File → Build Settings

STEP 2: Select platform:
- PC, Mac & Linux Standalone
- Android
- iOS
- WebGL

STEP 3: Switch platform if needed (takes a few minutes)

STEP 4: Add open scenes

STEP 5: Click Build (or Build and Run)

STEP 6: Choose output folder

STEP 7: Test built game
```

## **Browser Game Development**

### **Phaser 3 Setup**
**Project Setup:**
```bash
mkdir my-game
cd my-game
npm init -y
npm install phaser
npm install -D vite
```
**Game code:**
```javascript
// main.js
import Phaser from 'phaser';

class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }

    preload() {
        // Load assets
        this.load.image('player', 'assets/player.png');
        this.load.image('ground', 'assets/ground.png');
    }

    create() {
        // Create ground
        const ground = this.add.rectangle(400, 550, 800, 100, 0x00ff00);
        this.physics.add.existing(ground, true); // static

        // Create player
        this.player = this.physics.add.sprite(100, 450, 'player');
        this.player.setBounce(0.2);
        this.player.setCollideWorldBounds(true);

        // Collisions
        this.physics.add.collider(this.player, ground);

        // Input
        this.cursors = this.input.keyboard.createCursorKeys();
    }

    update() {
        // Movement
        if (this.cursors.left.isDown) {
            this.player.setVelocityX(-160);
        } else if (this.cursors.right.isDown) {
            this.player.setVelocityX(160);
        } else {
            this.player.setVelocityX(0);
        }

        // Jump
        if (this.cursors.up.isDown && this.player.body.touching.down) {
            this.player.setVelocityY(-330);
        }
    }
}

const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 300 },
            debug: false
        }
    },
    scene: [GameScene]
};

const game = new Phaser.Game(config);
```

### **Browser Game Verification**
```
STEP 6: Start development server:
npm run dev

STEP 7: Open browser to:
http://localhost:5173

STEP 8: Game loads in browser

STEP 9: Test game:
  - Use keyboard controls
  - Check collisions
  - Verify physics

STEP 10: Open DevTools (F12):
  - Console tab: Check for errors
  - Performance: Monitor FPS

STEP 11: Report:
  - Game behavior
  - Console errors
  - Performance (60fps target)
```

## **Game-Specific Development Patterns**

### **Game Loop Fundamentals**
**All games have:**
1. **Input**: Detect player actions
2. **Update**: Update game state (physics, AI, logic)
3. **Render**: Draw current frame
**Godot:**
- `_process(delta)`: Every frame
- `_physics_process(delta)`: Fixed timestep physics
**Unity:**
- `Update()`: Every frame
- `FixedUpdate()`: Fixed timestep physics

### **State Management**
```gdscript
# Godot - Game State
enum GameState { MENU, PLAYING, PAUSED, GAME_OVER }

var current_state = GameState.MENU

func _process(delta):
    match current_state:
        GameState.MENU:
            update_menu()
        GameState.PLAYING:
            update_gameplay()
        GameState.PAUSED:
            update_pause_menu()
        GameState.GAME_OVER:
            update_game_over_screen()
```
```csharp
// Unity - Game State
public enum GameState { Menu, Playing, Paused, GameOver }

private GameState currentState = GameState.Menu;

void Update()
{
    switch (currentState)
    {
        case GameState.Menu:
            UpdateMenu();
            break;
        case GameState.Playing:
            UpdateGameplay();
            break;
        case GameState.Paused:
            UpdatePauseMenu();
            break;
        case GameState.GameOver:
            UpdateGameOverScreen();
            break;
    }
}
```

### **Collision Detection**
**Godot:**
```gdscript
func _on_Area2D_body_entered(body):
    if body.is_in_group("enemies"):
        take_damage()
    elif body.is_in_group("collectibles"):
        collect_item(body)
        body.queue_free()
```
**Unity:**
```csharp
void OnCollisionEnter2D(Collision2D collision)
{
    if (collision.gameObject.CompareTag("Enemy"))
    {
        TakeDamage();
    }
    else if (collision.gameObject.CompareTag("Collectible"))
    {
        CollectItem(collision.gameObject);
        Destroy(collision.gameObject);
    }
}
```

### **Object Pooling**
For performance, reuse objects instead of creating/destroying:
```gdscript
# Godot - Simple pool
var bullet_pool = []
var bullet_scene = preload("res://scenes/Bullet.tscn")

func get_bullet():
    if bullet_pool.size() > 0:
        return bullet_pool.pop_back()
    else:
        return bullet_scene.instantiate()

func return_bullet(bullet):
    bullet.hide()
    bullet_pool.append(bullet)
```

## **Play-Testing Focus**

### **Game Feel Iteration**
Game development is unique - **feel matters more than logic**:
**During Vibe Phase:**
1. Implement mechanic quickly
2. Play-test immediately
3. Adjust parameters (speed, jump height, etc.)
4. Play-test again
5. Repeat until it "feels right"
**Key questions:**
- Does movement feel responsive?
- Is jump height/arc satisfying?
- Do collisions feel fair?
- Is feedback immediate (sounds, particles, screen shake)?

### **Verification Focus on Feel**
```
STEP 8: Play-test the mechanic:
  - Does it feel responsive?
  - Is it fun to use?
  - Any frustrating moments?

STEP 9: Try these tests:
  - Tap jump quickly 5 times
  - Run into wall
  - Jump from different heights
  - Combo moves together

STEP 10: Rate the feel (1-10):
  - Responsiveness: __
  - Satisfaction: __
  - Clarity: __

STEP 11: Suggest improvements or move on
```

### **Placeholder Assets**
Start with simple shapes/colors:
- Rectangles for platforms
- Circles for player
- Different colors for different types
- Add real art in structured phase
**Godot:**
```gdscript
# Use ColorRect or Polygon2D
var player_rect = ColorRect.new()
player_rect.color = Color(0, 0, 1) # Blue
player_rect.size = Vector2(32, 32)
```
**Unity:**
```csharp
// Use Unity primitives
GameObject player = GameObject.CreatePrimitive(PrimitiveType.Cube);
player.GetComponent<Renderer>().material.color = Color.blue;
```

## **Game-Specific Requirements Template**
When generating requirements at Evolution Point, add:

### **Game Design**
```markdown
## Game Design

### Core Mechanic
- Primary player action
- Core loop (what player repeats)
- Win/lose conditions

### Game Feel Targets
- Movement: Responsive and smooth
- Combat: Impactful with clear feedback
- Difficulty: Challenging but fair

### Progression
- How player gets stronger
- Unlock system
- Level structure
```

### **Technical Requirements**
```markdown
## Technical Requirements

### Performance Targets
- Frame rate: 60 FPS (desktop), 30 FPS (mobile)
- Load time: < 3 seconds
- Memory usage: < 512 MB

### Platform Specifics
- Input: Keyboard, gamepad, touch
- Screen resolutions supported
- Save system: Local, cloud, none
```

### **Asset Pipeline**
```markdown
## Asset Pipeline

### Art Assets
- Sprites: 32x32 pixel art
- Models: Low-poly style
- Animations: Frame count per action

### Audio Assets
- Music: Looping tracks
- SFX: Impact sounds, UI feedback
- Format: .ogg (Godot), .wav (Unity)
```

## **Game Development Best Practices**

### **During Vibe Phase**
**Iterate on core mechanic first:**
- Get movement feeling right
- Test with placeholder art
- Play-test every change
- Don't add features yet - nail the feel
**Build vertically:**
- One complete level/scene
- All mechanics in that level
- Then expand horizontally
**Use engine's play mode extensively:**
- Test in-editor constantly
- Don't wait for builds
- Adjust values while playing (if engine supports)

### **At Evolution Point**
**Document feel targets:**
- "Jump should feel floaty like Celeste"
- "Combat should feel punchy like Enter the Gungeon"
- Reference games for inspiration
**Plan content scope:**
- How many levels?
- How many enemy types?
- How much art/audio needed?
**Testing strategy:**
- Performance targets (60fps)
- Play-test plan
- Difficulty balancing

### **During Structured Phase**
**Add juice:**
- Screen shake
- Particle effects
- Sound effects
- Camera effects
- UI feedback
**Optimize performance:**
- Profile game
- Object pooling
- LOD (level of detail)
- Occlusion culling
**Polish:**
- Real art assets
- Professional audio
- Menu systems
- Save/load
- Settings menu

## **Common Game Patterns**

### **Health System**
```gdscript
# Godot
extends Node

signal health_changed(current, maximum)
signal died

export var max_health = 100
var current_health

func _ready():
    current_health = max_health

func take_damage(amount):
    current_health -= amount
    current_health = max(0, current_health)
    emit_signal("health_changed", current_health, max_health)

    if current_health == 0:
        emit_signal("died")

func heal(amount):
    current_health += amount
    current_health = min(max_health, current_health)
    emit_signal("health_changed", current_health, max_health)
```

### **Timer System**
```gdscript
# Godot
func start_countdown(seconds):
    var timer = Timer.new()
    timer.wait_time = seconds
    timer.one_shot = true
    timer.timeout.connect(_on_timer_timeout)
    add_child(timer)
    timer.start()

func _on_timer_timeout():
    print("Time's up!")
```

### **Camera Follow**
```gdscript
# Godot - Smooth camera follow
extends Camera2D

export var follow_speed = 5.0
var target

func _process(delta):
    if target:
        global_position = global_position.lerp(target.global_position, follow_speed * delta)
```

## **Performance Optimization**

### **Frame Rate Targets**
- **Desktop**: 60 FPS minimum
- **Mobile**: 30 FPS minimum, 60 FPS ideal
- **VR**: 90 FPS minimum

### **Profiling**
**Godot:**
- Debugger → Profiler
- Monitor → FPS, memory, physics time
**Unity:**
- Window → Analysis → Profiler
- Check CPU, GPU, memory usage

### **Optimization Techniques**
1. **Object Pooling**: Reuse objects
2. **LOD**: Lower detail for distant objects
3. **Occlusion Culling**: Don't render hidden objects
4. **Reduce Draw Calls**: Batch rendering
5. **Optimize Physics**: Use layers, reduce checks

## **Testing Strategies for Games**

### **Unit Testing**
**Godot (GUT):**
```gdscript
extends "res://addons/gut/test.gd"

func test_player_takes_damage():
    var player = Player.new()
    player.health = 100
    player.take_damage(10)
    assert_eq(player.health, 90)
```
**Unity (NUnit):**
```csharp
using NUnit.Framework;

public class PlayerTests
{
    [Test]
    public void PlayerTakesDamage()
    {
        var player = new Player();
        player.health = 100;
        player.TakeDamage(10);
        Assert.AreEqual(90, player.health);
    }
}
```

### **Play-Testing**
- Test with fresh players (not just you)
- Watch them play (don't give instructions)
- Note where they get stuck
- Ask about feel/difficulty
- Iterate based on feedback

## **Game-Specific Vibe Coding Patterns**

### **Pattern 1: Playable-First Exploration**
Start with something you can interact with immediately:
```
VIBE PATTERN: Start with player control
✅ DO: Get player moving in first 10 minutes
❌ AVOID: Building menus, loading screens, or systems first

Step 1: Create player object
Step 2: Add basic movement (arrow keys/WASD)
Step 3: Add one constraint (wall, floor, boundary)
Step 4: Play-test. Now you have a game loop to iterate on.
```

### **Pattern 2: Feel Before Features**
Game feel is more important than feature completeness:
```
VIBE PATTERN: Tune until it feels right
✅ DO: Spend time adjusting jump height, speed, gravity
❌ AVOID: Adding new features until core feels good

FEEL VARIABLES to tune:
- Player speed: 100 → 200 → 150 (settle on what feels right)
- Jump height: Too floaty? Increase gravity. Too snappy? Add hang time.
- Acceleration: Instant? Add ramp-up. Too slow? Increase initial speed.
```

### **Pattern 3: One Mechanic Deep**
Build depth in one mechanic before adding more:
```
VIBE PATTERN: Vertical slice first
✅ DO: Perfect your core mechanic (jumping, shooting, matching)
❌ AVOID: Adding enemies, powerups, levels until core is solid

Example progression:
1. Player moves ✓
2. Player jumps ✓
3. Jump feels good ✓
4. Coyote time added ✓
5. Jump buffering added ✓
NOW add platforms/enemies
```

### **Pattern 4: Debug Mode by Default**
Keep debug visualization on during exploration:
```gdscript
# Godot: Debug overlay
var debug_mode = true

func _draw():
    if debug_mode:
        # Draw velocity vector
        draw_line(Vector2.ZERO, velocity * 0.1, Color.RED, 2)
        # Draw collision shapes
        for shape in collision_shapes:
            draw_rect(shape.get_rect(), Color.GREEN, false)
```
```csharp
// Unity: Debug gizmos
void OnDrawGizmos()
{
    // Draw player direction
    Gizmos.color = Color.red;
    Gizmos.DrawRay(transform.position, velocity.normalized);

    // Draw detection radius
    Gizmos.color = Color.yellow;
    Gizmos.DrawWireSphere(transform.position, detectionRadius);
}
```

### **Pattern 5: Parameter Tweaking in Real-Time**
Expose values for live adjustment:
```gdscript
# Godot: Export variables for in-editor tweaking
@export var speed = 300.0
@export var jump_force = -400.0
@export var gravity_multiplier = 1.0
@export var coyote_time = 0.1
@export var jump_buffer = 0.15
```
```csharp
// Unity: Public or SerializeField for Inspector
[SerializeField] float speed = 300f;
[SerializeField] float jumpForce = 400f;
[SerializeField] float gravityMultiplier = 1f;
[Range(0f, 0.3f)] public float coyoteTime = 0.1f;
[Range(0f, 0.3f)] public float jumpBuffer = 0.15f;
```

## **Unreal Engine Development**

### **Development Environment**
**Requirements:**
- Unreal Engine (Epic Games Launcher)
- Visual Studio (Windows) or Xcode (macOS)
- Minimum 16GB RAM, SSD recommended
- GPU with DirectX 12 support
**Project Structure:**
```
MyGame/
├── Config/                  # Engine and project settings
├── Content/                 # All game assets
│   ├── Blueprints/         # Visual scripts
│   ├── Characters/         # Character assets
│   ├── Levels/             # Level/map files
│   ├── Materials/          # Shaders and materials
│   ├── Meshes/             # 3D models
│   └── UI/                 # User interface
├── Source/                  # C++ source code
│   ├── MyGame/
│   │   ├── MyGame.Build.cs
│   │   ├── MyGameCharacter.cpp
│   │   └── MyGameCharacter.h
└── MyGame.uproject          # Project file
```

### **Blueprint Visual Scripting**
For rapid vibe-style prototyping, start with Blueprints:
```
VIBE APPROACH: Use Blueprints for exploration
✅ Blueprint for: Prototyping, iteration, game logic
✅ C++ for: Performance-critical code, complex systems

Common Blueprint nodes:
- Event BeginPlay: Initialization
- Event Tick: Every frame update
- Get/Set variables: State management
- Branch: Conditional logic
- Timeline: Animations and interpolation
```

### **Basic Character Setup (Blueprint)**
```
STEP 1: Create new Blueprint Class
  - Parent: Character
  - Name: BP_PlayerCharacter

STEP 2: Open Blueprint, add components:
  - Camera (third-person or first-person)
  - Spring Arm (for camera follow)

STEP 3: In Event Graph, create movement:
  - Event Tick → Get Input Axis Values → Add Movement Input

STEP 4: In Character Movement Component:
  - Max Walk Speed: 600
  - Jump Z Velocity: 420
  - Air Control: 0.2

STEP 5: Place in level and test with PIE (Play In Editor)
```

### **C++ Basics**
**Character class:**
```cpp
// MyCharacter.h
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "MyCharacter.generated.h"

UCLASS()
class MYGAME_API AMyCharacter : public ACharacter
{
    GENERATED_BODY()

public:
    AMyCharacter();

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Movement")
    float MoveSpeed = 600.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Movement")
    float JumpHeight = 420.0f;

protected:
    virtual void BeginPlay() override;
    virtual void Tick(float DeltaTime) override;
    virtual void SetupPlayerInputComponent(class UInputComponent* PlayerInputComponent) override;

private:
    void MoveForward(float Value);
    void MoveRight(float Value);
};
```
```cpp
// MyCharacter.cpp
#include "MyCharacter.h"

AMyCharacter::AMyCharacter()
{
    PrimaryActorTick.bCanEverTick = true;
    GetCharacterMovement()->MaxWalkSpeed = MoveSpeed;
    GetCharacterMovement()->JumpZVelocity = JumpHeight;
}

void AMyCharacter::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
    Super::SetupPlayerInputComponent(PlayerInputComponent);
    PlayerInputComponent->BindAxis("MoveForward", this, &AMyCharacter::MoveForward);
    PlayerInputComponent->BindAxis("MoveRight", this, &AMyCharacter::MoveRight);
    PlayerInputComponent->BindAction("Jump", IE_Pressed, this, &ACharacter::Jump);
}

void AMyCharacter::MoveForward(float Value)
{
    if (Value != 0.0f)
    {
        AddMovementInput(GetActorForwardVector(), Value);
    }
}

void AMyCharacter::MoveRight(float Value)
{
    if (Value != 0.0f)
    {
        AddMovementInput(GetActorRightVector(), Value);
    }
}
```

### **Common Unreal Gotchas**
| Gotcha | Problem | Solution |
|--------|---------|----------|
| **Long compile times** | C++ changes slow | Use Blueprints for iteration, C++ for final |
| **Hot reload issues** | Code changes don't apply | Close editor, rebuild, restart |
| **Blueprint/C++ mismatch** | Variables out of sync | Use UPROPERTY macro properly |
| **Large project size** | Gigabytes of data | Enable "Share Material Shader Code" |
| **Performance in editor** | Slow PIE | Use "Standalone Game" for testing |
| **Version control** | Binary files | Use Git LFS for .uasset files |

### **Unreal Verification Pattern**
```
STEP 6: Run in Unreal Editor:
Click Play button (▶) or press Alt+P

STEP 7: Game starts in viewport

STEP 8: Test gameplay:
  - WASD movement
  - Mouse look (if configured)
  - Jump with Space
  - Interact with objects

STEP 9: Check Output Log (Window → Developer Tools → Output Log):
  - Look for errors (red)
  - Check warnings (yellow)
  - UE_LOG messages appear here

STEP 10: Stop with Escape or click Stop

STEP 11: Report:
  - Game behavior
  - Output Log errors
  - Performance (stat fps command)
```

## **Unity Exploration Patterns**

### **Quick Prototype Workflow**
```
VIBE WORKFLOW for Unity:
1. Create empty scene
2. Add primitives (cubes, spheres) as placeholders
3. Add Rigidbody/Collider components
4. Write minimal script
5. Enter Play mode (Ctrl+P)
6. Adjust values in Inspector WHILE playing
7. Exit Play mode (values reset!)
8. Apply good values, commit
```

### **In-Editor Parameter Tuning**
```csharp
// Expose parameters for real-time tuning
public class PlayerController : MonoBehaviour
{
    [Header("Movement")]
    [Range(1f, 20f)] public float speed = 5f;
    [Range(1f, 30f)] public float jumpForce = 10f;

    [Header("Feel")]
    [Range(0f, 0.3f)] public float coyoteTime = 0.1f;
    [Range(0f, 0.3f)] public float jumpBufferTime = 0.1f;
    [Range(1f, 5f)] public float fallMultiplier = 2.5f;
    [Range(1f, 5f)] public float lowJumpMultiplier = 2f;

    [Header("Debug")]
    public bool showDebugInfo = true;

    void OnGUI()
    {
        if (showDebugInfo)
        {
            GUI.Label(new Rect(10, 10, 300, 20), $"Speed: {rb.velocity.magnitude:F1}");
            GUI.Label(new Rect(10, 30, 300, 20), $"Grounded: {isGrounded}");
        }
    }
}
```

### **Scriptable Objects for Game Data**
```csharp
// Create reusable, tweakable data assets
[CreateAssetMenu(fileName = "EnemyData", menuName = "Game/Enemy Data")]
public class EnemyData : ScriptableObject
{
    public string enemyName;
    public int health = 100;
    public float moveSpeed = 3f;
    public float attackDamage = 10f;
    public float attackCooldown = 1f;
    public Sprite sprite;
    public AudioClip attackSound;
}

// Use in enemy script
public class Enemy : MonoBehaviour
{
    public EnemyData data;

    void Start()
    {
        health = data.health;
        // Now you can tweak enemy stats without code changes!
    }
}
```

## **Game Loop and State Management Exploration**

### **Minimal Game Loop**
```gdscript
# Godot: Explicit game loop structure
extends Node

enum Phase { INPUT, UPDATE, RENDER }
var current_phase = Phase.INPUT

func _process(delta):
    # Phase 1: INPUT - Gather all player input
    current_phase = Phase.INPUT
    var input_vector = gather_input()

    # Phase 2: UPDATE - Update game state
    current_phase = Phase.UPDATE
    update_player(input_vector, delta)
    update_enemies(delta)
    update_physics(delta)
    check_collisions()

    # Phase 3: RENDER - Engine handles automatically
    current_phase = Phase.RENDER
    # (Godot renders after _process)
```

### **State Machine Pattern**
```gdscript
# Godot: Player state machine
extends CharacterBody2D

enum State { IDLE, RUNNING, JUMPING, FALLING, ATTACKING, DEAD }
var current_state = State.IDLE

func _physics_process(delta):
    match current_state:
        State.IDLE:
            process_idle(delta)
        State.RUNNING:
            process_running(delta)
        State.JUMPING:
            process_jumping(delta)
        State.FALLING:
            process_falling(delta)
        State.ATTACKING:
            process_attacking(delta)
        State.DEAD:
            process_dead(delta)

func transition_to(new_state: State):
    exit_state(current_state)
    current_state = new_state
    enter_state(new_state)

func enter_state(state: State):
    match state:
        State.JUMPING:
            velocity.y = JUMP_VELOCITY
            $AnimationPlayer.play("jump")
        State.ATTACKING:
            $AnimationPlayer.play("attack")
            attack_timer = attack_duration
```
```csharp
// Unity: State machine with interface
public interface IPlayerState
{
    void Enter(PlayerController player);
    void Update(PlayerController player);
    void Exit(PlayerController player);
}

public class IdleState : IPlayerState
{
    public void Enter(PlayerController player) => player.animator.Play("Idle");
    public void Update(PlayerController player)
    {
        if (Mathf.Abs(player.inputX) > 0.1f)
            player.TransitionTo(new RunningState());
        if (player.jumpPressed)
            player.TransitionTo(new JumpingState());
    }
    public void Exit(PlayerController player) { }
}
```

## **Asset Pipeline Considerations**

### **Asset Organization**
```
project/
├── Assets/ (or Content/ or assets/)
│   ├── Art/
│   │   ├── Characters/
│   │   │   ├── player_idle.png
│   │   │   ├── player_run_01.png
│   │   │   └── player_run_02.png
│   │   ├── Environment/
│   │   │   ├── tiles/
│   │   │   └── backgrounds/
│   │   └── UI/
│   │       ├── buttons/
│   │       └── icons/
│   ├── Audio/
│   │   ├── Music/
│   │   │   └── level_theme.ogg
│   │   └── SFX/
│   │       ├── jump.wav
│   │       └── hit.wav
│   ├── Fonts/
│   └── Data/
│       ├── levels/
│       └── configs/
```

### **Asset Format Guidelines**
| Asset Type | Format | Notes |
|------------|--------|-------|
| **2D Sprites** | PNG | Transparent backgrounds |
| **Sprite Sheets** | PNG | Power of 2 dimensions (512, 1024, 2048) |
| **3D Models** | FBX, GLTF | Include animations in separate files |
| **Textures** | PNG, TGA | Mipmaps for 3D, power of 2 |
| **Music** | OGG, MP3 | OGG for Godot, MP3/WAV for Unity |
| **Sound Effects** | WAV, OGG | WAV for short sounds, OGG for longer |
| **Fonts** | TTF, OTF | Include license |

### **Placeholder Asset Strategy**
```
VIBE PHASE: Use placeholders
- Colored rectangles for sprites
- Primitive shapes for 3D
- Free sound effects (freesound.org)
- Placeholder UI from engine

STRUCTURED PHASE: Replace with final
- Commission or create art
- Professional audio
- Polished UI
```

### **Import Settings**
**Godot:**
```
# For pixel art (crisp pixels)
Project Settings → Rendering → Textures
- Default Texture Filter: Nearest

# Per-asset in Import dock
- Filter: false (for pixel art)
- Filter: true (for HD art)
```
**Unity:**
```
# For pixel art sprites
Inspector → Texture Type: Sprite
- Filter Mode: Point (no filter)
- Compression: None
- Pixels Per Unit: Match your sprite size

# For 3D textures
- Filter Mode: Bilinear/Trilinear
- Generate Mip Maps: Yes
- Compression: Normal/High Quality
```

## **Game-Specific Transition Triggers**

### **Complexity Triggers**
| Trigger | Threshold | Action |
|---------|-----------|--------|
| **Content scope** | > 5 levels/areas | Need level design document |
| **Character types** | > 3 playable or > 10 enemies | Need character design doc |
| **Mechanics count** | > 5 distinct mechanics | Need game design document |
| **Progression systems** | Any XP/unlock/upgrade | Need economy design |
| **Save system** | Any persistence needed | Need save architecture |

### **Technical Triggers**
| Trigger | Threshold | Action |
|---------|-----------|--------|
| **Multiplayer** | Any networked gameplay | Need network architecture immediately |
| **Mobile deployment** | Touch controls needed | Plan input abstraction |
| **Performance issues** | < 60 FPS | Need optimization pass |
| **Asset volume** | > 100 assets | Need asset pipeline |
| **Code complexity** | > 20 scripts | Need code architecture |

### **Production Triggers**
| Trigger | Threshold | Action |
|---------|-----------|--------|
| **Team size** | > 1 person | Need version control, task tracking |
| **External playtesters** | Anyone outside team | Need build pipeline |
| **Target release** | Any public release planned | Need milestone planning |
| **Store submission** | Steam, App Store, etc. | Need store requirements checklist |

### **Transition Decision Matrix**
```
IF (core_mechanic_feels_good) AND (ready_for_content):
    → Transition to Agile

IF (still_iterating_on_feel) AND (< 1000 lines code):
    → Stay in Vibe mode

IF (multiplayer) OR (team_size > 1) OR (external_deadline):
    → Transition to Agile immediately

GAME JAM EXCEPTION:
    IF (time_limit < 72 hours):
        → Stay in Vibe mode, ship what works
```

### **Pre-Transition Checklist**
Before transitioning from Vibe to Agile:
- [ ] Core mechanic feels right (play-tested)
- [ ] Basic game loop works (start → play → end)
- [ ] Technical feasibility proven
- [ ] Scope understood (how much content?)
- [ ] Platform requirements known
- [ ] Art style direction set
- [ ] Performance is acceptable

## **When to Use Game Framework**
**Use this framework when building:**
✅ Video games (2D, 3D)
✅ Interactive simulations
✅ Game prototypes
✅ Educational games
✅ Game jams
**Consider other frameworks for:**
❌ Game websites/marketing → Use Web Framework
❌ Game launcher/tools → Use Desktop Framework
❌ Mobile game with heavy UI → Consider Mobile Framework too
**End of Game Framework**
