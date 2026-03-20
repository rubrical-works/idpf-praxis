# Vibe-to-Structured Development Framework (Game)
**Version:** v0.67.1
**Type:** Game Development Specialization
**Extends:** Vibe-to-Structured-Core-Framework.md (Rev 2)
## Purpose
Specializes Core Framework for game development: Godot, Unity, Unreal, and browser games.
**Evolution Target:** IDPF-Agile
## Game Platform Coverage
- **Godot Engine**: 2D/3D with GDScript or C#
- **Unity**: 2D/3D with C#
- **Unreal Engine**: 3D with C++ or Blueprints
- **Browser Games**: Phaser, PixiJS, Three.js
- **Terminal Games**: Python curses, blessed (Node.js)
**Game Types:** 2D (platformers, puzzle, roguelikes), 3D (FPS, third-person, racing), mobile, browser, multiplayer
## Platform-Specific Session Initialization
Follow Core Framework initialization (Steps 1-4), then ask:
- **Game engine?** (Godot / Unity / Unreal / Browser / Other)
- **2D or 3D?**
- **Game genre?** (Platformer / Puzzle / RPG / FPS / etc.)
- **Target platform?** (PC / Mobile / Web / Console)
- **Art style?** (Pixel art / 3D models / Abstract)
## Godot Engine Development
### Project Structure
```
MyGame/
├── project.godot
├── scenes/ (Main.tscn, Player.tscn, Enemy.tscn)
├── scripts/ (Player.gd, Enemy.gd, GameManager.gd)
├── assets/ (sprites/, models/, sounds/, fonts/)
└── exports/
```
### GDScript Player Example
```gdscript
extends CharacterBody2D
const SPEED = 300.0
const JUMP_VELOCITY = -400.0
var gravity = ProjectSettings.get_setting("physics/2d/default_gravity")
func _physics_process(delta):
    if not is_on_floor():
        velocity.y += gravity * delta
    if Input.is_action_just_pressed("ui_accept") and is_on_floor():
        velocity.y = JUMP_VELOCITY
    var direction = Input.get_axis("ui_left", "ui_right")
    if direction:
        velocity.x = direction * SPEED
    else:
        velocity.x = move_toward(velocity.x, 0, SPEED)
    move_and_slide()
```
### Godot Signals
```gdscript
signal health_changed(new_health)
signal player_died
func take_damage(amount):
    health -= amount
    health_changed.emit(health)
    if health <= 0:
        player_died.emit()
```
### Verification Pattern
```
STEP 6: Run: F5 (project) or F6 (current scene)
STEP 7: Game window opens
STEP 8: Test controls, collisions, no errors in Output panel
STEP 9: Check Output panel for errors (red) and warnings (yellow)
STEP 10: Test specific mechanic
STEP 11: Stop (F8), report behavior, errors, performance
```
## Unity Development
### Project Structure
```
MyGame/Assets/
├── Scenes/ (MainScene.unity)
├── Scripts/ (PlayerController.cs, GameManager.cs)
├── Prefabs/, Materials/, Sprites/, Audio/, Animations/
```
### C# Player Controller
```csharp
public class PlayerController : MonoBehaviour {
    public float speed = 5f;
    public float jumpForce = 10f;
    private Rigidbody2D rb;
    private bool isGrounded;
    void Start() { rb = GetComponent<Rigidbody2D>(); }
    void Update() {
        float moveInput = Input.GetAxis("Horizontal");
        rb.velocity = new Vector2(moveInput * speed, rb.velocity.y);
        if (Input.GetKeyDown(KeyCode.Space) && isGrounded)
            rb.AddForce(Vector2.up * jumpForce, ForceMode2D.Impulse);
    }
    void OnCollisionEnter2D(Collision2D collision) {
        if (collision.gameObject.CompareTag("Ground")) isGrounded = true;
    }
    void OnCollisionExit2D(Collision2D collision) {
        if (collision.gameObject.CompareTag("Ground")) isGrounded = false;
    }
}
```
### Unity Events
```csharp
public UnityEvent<int> OnHealthChanged;
public UnityEvent OnPlayerDied;
public void TakeDamage(int amount) {
    health -= amount;
    OnHealthChanged?.Invoke(health);
    if (health <= 0) OnPlayerDied?.Invoke();
}
```
### Verification Pattern
```
STEP 6: Click Play (▶)
STEP 7-8: Test controls, collisions, game logic
STEP 9: Check Console for errors/warnings
STEP 10: Test specific mechanic
STEP 11: Stop, report behavior, errors, FPS
```
## Browser Game Development (Phaser 3)
```bash
mkdir my-game && cd my-game && npm init -y && npm install phaser && npm install -D vite
```
```javascript
class GameScene extends Phaser.Scene {
    constructor() { super('GameScene'); }
    preload() { this.load.image('player', 'assets/player.png'); }
    create() {
        const ground = this.add.rectangle(400, 550, 800, 100, 0x00ff00);
        this.physics.add.existing(ground, true);
        this.player = this.physics.add.sprite(100, 450, 'player');
        this.player.setBounce(0.2);
        this.player.setCollideWorldBounds(true);
        this.physics.add.collider(this.player, ground);
        this.cursors = this.input.keyboard.createCursorKeys();
    }
    update() {
        if (this.cursors.left.isDown) this.player.setVelocityX(-160);
        else if (this.cursors.right.isDown) this.player.setVelocityX(160);
        else this.player.setVelocityX(0);
        if (this.cursors.up.isDown && this.player.body.touching.down)
            this.player.setVelocityY(-330);
    }
}
const config = { type: Phaser.AUTO, width: 800, height: 600,
    physics: { default: 'arcade', arcade: { gravity: { y: 300 } } },
    scene: [GameScene] };
new Phaser.Game(config);
```
## Game-Specific Patterns
### Game Loop Fundamentals
1. **Input**: Detect player actions
2. **Update**: Update game state (physics, AI, logic)
3. **Render**: Draw current frame
- Godot: `_process(delta)` / `_physics_process(delta)`
- Unity: `Update()` / `FixedUpdate()`
### State Machine (Godot)
```gdscript
enum State { IDLE, RUNNING, JUMPING, FALLING, ATTACKING, DEAD }
var current_state = State.IDLE
func _physics_process(delta):
    match current_state:
        State.IDLE: process_idle(delta)
        State.RUNNING: process_running(delta)
        State.JUMPING: process_jumping(delta)
        # ...
func transition_to(new_state: State):
    exit_state(current_state)
    current_state = new_state
    enter_state(new_state)
```
### Object Pooling (Godot)
```gdscript
var bullet_pool = []
var bullet_scene = preload("res://scenes/Bullet.tscn")
func get_bullet():
    if bullet_pool.size() > 0: return bullet_pool.pop_back()
    else: return bullet_scene.instantiate()
func return_bullet(bullet):
    bullet.hide()
    bullet_pool.append(bullet)
```
## Play-Testing Focus
Game feel iteration: implement mechanic → play-test → adjust parameters → repeat until "feels right".
**Key questions:** Responsive movement? Satisfying jump? Fair collisions? Immediate feedback?
**Placeholder assets:** Rectangles for platforms, circles for player, different colors for types.
## Unreal Engine Development
### Blueprint vs C++
- **Blueprint**: Prototyping, iteration, game logic (visual scripting)
- **C++**: Performance-critical code, complex systems
### Verification Pattern
```
STEP 6: Click Play (▶) or Alt+P
STEP 7-8: Test WASD, mouse look, jumping, interactions
STEP 9: Check Output Log for errors
STEP 10: Stop with Escape
STEP 11: Report behavior, errors, FPS (stat fps)
```
### Common Gotchas
| Issue | Solution |
|-------|----------|
| Long compile times | Use Blueprints for iteration |
| Hot reload issues | Close editor, rebuild, restart |
| Large project size | Enable "Share Material Shader Code" |
| Version control | Use Git LFS for .uasset files |
## Asset Format Guidelines
| Type | Format | Notes |
|------|--------|-------|
| 2D Sprites | PNG | Transparent backgrounds |
| Sprite Sheets | PNG | Power of 2 dimensions |
| 3D Models | FBX, GLTF | Separate animation files |
| Textures | PNG, TGA | Mipmaps for 3D |
| Music | OGG, MP3 | OGG for Godot |
| SFX | WAV, OGG | WAV for short sounds |
| Fonts | TTF, OTF | Include license |
## Performance Optimization
- **Desktop**: 60 FPS min | **Mobile**: 30 FPS min | **VR**: 90 FPS min
- Techniques: Object pooling, LOD, occlusion culling, batch rendering, optimize physics layers
## Testing Strategies
### Godot (GUT)
```gdscript
extends "res://addons/gut/test.gd"
func test_player_takes_damage():
    var player = Player.new()
    player.health = 100
    player.take_damage(10)
    assert_eq(player.health, 90)
```
### Unity (NUnit)
```csharp
[Test]
public void PlayerTakesDamage() {
    var player = new Player(); player.health = 100;
    player.TakeDamage(10);
    Assert.AreEqual(90, player.health);
}
```
## Transition Triggers
| Category | Trigger | Threshold |
|----------|---------|-----------|
| Content | Levels/areas | > 5 |
| Content | Character types | > 3 playable or > 10 enemies |
| Content | Mechanics | > 5 distinct |
| Technical | Multiplayer | Any networked gameplay |
| Technical | Performance | < 60 FPS |
| Technical | Code complexity | > 20 scripts |
| Production | Team size | > 1 person |
| Production | Store submission | Any planned |
### Decision Matrix
```
IF core_mechanic_feels_good AND ready_for_content: → Transition to Agile
IF still_iterating_on_feel AND < 1000 lines: → Stay in Vibe
IF multiplayer OR team > 1 OR external_deadline: → Transition immediately
GAME JAM (< 72 hours): → Stay in Vibe, ship what works
```
### Pre-Transition Checklist
- [ ] Core mechanic feels right (play-tested)
- [ ] Basic game loop works (start → play → end)
- [ ] Technical feasibility proven
- [ ] Scope understood
- [ ] Platform requirements known
- [ ] Art style direction set
- [ ] Performance acceptable
**End of Game Framework**
