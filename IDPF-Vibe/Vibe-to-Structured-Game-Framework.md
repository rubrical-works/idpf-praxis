# Vibe-to-Structured Development Framework (Game)
**Version:** v0.53.0
**Type:** Game Development Specialization
**Extends:** Vibe-to-Structured-Core-Framework.md
## Purpose
Specializes Core Framework for game development using Godot, Unity, Unreal, and browser games.
**Evolution Target:** IDPF-Agile
## Game Platform Coverage
| Engine | Languages | Best For |
|--------|-----------|----------|
| **Godot** | GDScript, C# | 2D/3D indie games |
| **Unity** | C# | 2D/3D all scales |
| **Unreal** | C++, Blueprints | AAA 3D games |
| **Phaser** | JavaScript | Browser 2D games |
## Session Initialization
After Core Framework Steps 1-4:
**Game-Specific Questions:**
- Game engine? (Godot / Unity / Unreal / Browser)
- 2D or 3D?
- Game genre? (Platformer / Puzzle / RPG / FPS / etc.)
- Target platform? (PC / Mobile / Web / Console)
- Art style? (Pixel art / 3D models / Abstract)
## Godot Development
### Project Structure
```
MyGame/
├── project.godot
├── scenes/
│   ├── Main.tscn
│   ├── Player.tscn
│   └── Enemy.tscn
├── scripts/
│   ├── Player.gd
│   └── GameManager.gd
├── assets/
└── exports/
```
### Player Script Pattern
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
    velocity.x = direction * SPEED if direction else move_toward(velocity.x, 0, SPEED)
    move_and_slide()
```
### Signals Pattern
```gdscript
signal health_changed(new_health)
signal player_died
func take_damage(amount):
    health -= amount
    health_changed.emit(health)
    if health <= 0:
        player_died.emit()
```
## Unity Development
### Project Structure
```
Assets/
├── Scenes/
├── Scripts/
├── Prefabs/
├── Materials/
├── Sprites/
├── Audio/
└── Animations/
```
### Player Controller Pattern
```csharp
public class PlayerController : MonoBehaviour {
    public float speed = 5f;
    public float jumpForce = 10f;
    private Rigidbody2D rb;
    private bool isGrounded;
    void Start() {
        rb = GetComponent<Rigidbody2D>();
    }
    void Update() {
        float moveInput = Input.GetAxis("Horizontal");
        rb.velocity = new Vector2(moveInput * speed, rb.velocity.y);
        if (Input.GetKeyDown(KeyCode.Space) && isGrounded) {
            rb.AddForce(Vector2.up * jumpForce, ForceMode2D.Impulse);
        }
    }
}
```
### Unity Events Pattern
```csharp
public UnityEvent<int> OnHealthChanged;
public UnityEvent OnPlayerDied;
public void TakeDamage(int amount) {
    health -= amount;
    OnHealthChanged?.Invoke(health);
    if (health <= 0) OnPlayerDied?.Invoke();
}
```
## Unreal Development
### Blueprint vs C++
| Use Case | Blueprint | C++ |
|----------|-----------|-----|
| Prototyping | ✅ | |
| Game logic | ✅ | ✅ |
| Performance-critical | | ✅ |
| Complex systems | | ✅ |
### Character Setup
```cpp
UCLASS()
class AMyCharacter : public ACharacter {
    GENERATED_BODY()
public:
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float MoveSpeed = 600.0f;
protected:
    virtual void SetupPlayerInputComponent(UInputComponent* Input) override;
    void MoveForward(float Value);
    void MoveRight(float Value);
};
```
## Browser Games (Phaser)
```javascript
class GameScene extends Phaser.Scene {
    preload() {
        this.load.image('player', 'assets/player.png');
    }
    create() {
        this.player = this.physics.add.sprite(100, 450, 'player');
        this.player.setBounce(0.2).setCollideWorldBounds(true);
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
```
## Verification Pattern
```
STEP 6: Run game: F5 (Godot), Play (Unity), PIE (Unreal)
STEP 7: Game window opens
STEP 8: Test player controls, collisions, mechanics
STEP 9: Check Output/Console for errors
STEP 10: Rate feel: responsiveness, satisfaction, clarity (1-10)
STEP 11: Report results
```
## Game-Specific Vibe Patterns
### Pattern 1: Playable-First
Get player moving in first 10 minutes. Don't build menus/systems first.
### Pattern 2: Feel Before Features
Tune jump height, speed, gravity until it feels right before adding features.
### Pattern 3: One Mechanic Deep
Perfect core mechanic before adding enemies, powerups, levels.
### Pattern 4: Debug Mode Default
Keep collision visualization, velocity vectors visible during vibe phase.
## Game-Specific Requirements
### At Evolution Point Add:
```markdown
## Game Design
Core mechanic: [primary player action]
Core loop: [what player repeats]
Win/lose conditions: [criteria]
## Performance Targets
Frame rate: 60 FPS desktop, 30 FPS mobile
Load time: < 3s
Memory: < 512 MB
## Asset Pipeline
Art style: [description]
Audio: [format]
```
## Transition Triggers
| Trigger | Threshold | Action |
|---------|-----------|--------|
| Core mechanic solid | Feels right | Ready for content |
| > 5 levels/areas | Scope growing | Level design doc needed |
| > 3 player/10 enemy types | Content scope | Character design doc |
| Multiplayer | Any networked | Network architecture immediately |
| < 60 FPS | Performance | Optimization pass |
## Best Practices
### Vibe Phase
- Iterate core mechanic first
- Use placeholder art
- Play-test every change
- Build vertically (one complete level first)
### Structured Phase
- Add juice (screen shake, particles, sounds)
- Optimize performance
- Polish art/audio
- Menu systems, save/load
---
**End of Game Framework**
