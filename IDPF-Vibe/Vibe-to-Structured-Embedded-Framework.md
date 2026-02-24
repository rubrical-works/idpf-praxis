# Vibe-to-Structured Development Framework (Embedded)
**Version:** v0.51.0
**Type:** Embedded Systems Specialization
**Extends:** Vibe-to-Structured-Core-Framework.md
## Purpose
Specializes Core Framework for embedded systems using simulators/emulators without physical hardware.
**Evolution Target:** IDPF-Agile
## Embedded Platform Coverage
### Microcontrollers
| Platform | Simulator | Languages | Use Cases |
|----------|-----------|-----------|-----------|
| **Arduino** | Wokwi, SimulIDE | C++, Arduino | IoT, sensors |
| **ESP32** | Wokwi | C++, MicroPython | WiFi/BT IoT |
| **STM32** | Renode, QEMU | C, C++, Rust | Industrial, robotics |
### Embedded Linux
| Platform | Simulator | Use Cases |
|----------|-----------|-----------|
| **Raspberry Pi** | QEMU | IoT gateways, edge |
| **BeagleBone** | QEMU | Industrial, robotics |
### RTOS
| Platform | Simulator | Use Cases |
|----------|-----------|-----------|
| **FreeRTOS** | QEMU, native | Real-time systems |
| **Zephyr** | QEMU, Renode | IoT, wearables |
## Session Initialization
After Core Framework Steps 1-4:
**Embedded-Specific Questions:**
- Target platform? (Arduino / ESP32 / STM32 / Raspberry Pi)
- Simulator preference? (Wokwi / QEMU / Renode / SimulIDE)
- Application type? (Sensor / Control / IoT / RTOS app)
- Language preference? (C / C++ / MicroPython / Rust)
- Real-time requirements? (Yes - RTOS / No - bare metal or Linux)
## Simulator Selection
| Simulator | Best For | Advantages |
|-----------|----------|------------|
| **Wokwi** | Arduino, ESP32 | No install, visual, web-based |
| **QEMU** | RPi, ARM Linux | Full system emulation |
| **Renode** | STM32, nRF52 | Multi-node, peripherals |
| **SimulIDE** | Arduino, AVR | Visual circuits |
### Wokwi Quick Start
1. Open https://wokwi.com
2. Create new project (select platform)
3. Drag components, wire visually
4. Write code, click "Start Simulation"
5. Observe behavior, check serial monitor
### QEMU for Raspberry Pi
```bash
qemu-system-arm -M versatilepb -cpu arm1176 \
  -kernel kernel.img -dtb versatile-pb.dtb \
  -hda raspbian.img -append "root=/dev/sda2" \
  -serial stdio -net user,hostfwd=tcp::5022-:22
# SSH: ssh pi@localhost -p 5022
```
### Renode for STM32
```
# simulation.resc
using sysbus
mach create "stm32"
machine LoadPlatformDescription @platforms/boards/stm32f4_discovery-kit.repl
sysbus LoadELF @build/firmware.elf
start
```
## Embedded Vibe Patterns
### Pattern 1: Breadboard-First
Start simple: LED blinks → button reads → two components interact → add communication.
### Pattern 2: Verbose Serial
Over-communicate state via serial during exploration:
```cpp
void vibeDebug(const char* location, const char* msg) {
    Serial.print("["); Serial.print(millis()); Serial.print("] ");
    Serial.print(location); Serial.print(": "); Serial.println(msg);
}
```
### Pattern 3: Safe Defaults
Initialize outputs to safe states before enabling features:
```cpp
void setup() {
    pinMode(MOTOR_PIN, OUTPUT);
    digitalWrite(MOTOR_PIN, LOW);  // Motor OFF first
    // Now safe to continue
}
```
### Pattern 4: Simulated Sensors
Model realistic behavior, not just constants:
```cpp
float readTemperature() {
    static float baseTemp = 25.0;
    baseTemp += random(-10, 11) / 100.0;  // Drift
    return baseTemp + random(-50, 51) / 100.0;  // Noise
}
```
## Common Patterns
### State Machine
```cpp
enum State { IDLE, READING_SENSOR, PROCESSING, SENDING_DATA, ERROR };
State currentState = IDLE;
void loop() {
    switch (currentState) {
        case IDLE:
            if (shouldReadSensor()) currentState = READING_SENSOR;
            break;
        case READING_SENSOR:
            float value = readSensor();
            currentState = (value > 0) ? PROCESSING : ERROR;
            break;
        // ... other states
    }
}
```
### Non-Blocking Timing
```cpp
unsigned long previousMillis = 0;
const long interval = 1000;
void loop() {
    if (millis() - previousMillis >= interval) {
        previousMillis = millis();
        toggleLED();
    }
    // Other code runs continuously
}
```
### Interrupt Handling
```cpp
volatile bool buttonPressed = false;
void IRAM_ATTR buttonISR() { buttonPressed = true; }
void setup() {
    attachInterrupt(digitalPinToInterrupt(BUTTON_PIN), buttonISR, FALLING);
}
void loop() {
    if (buttonPressed) {
        buttonPressed = false;
        handleButton();
    }
}
```
## Bare-Metal vs RTOS
| Factor | Bare-Metal | RTOS |
|--------|------------|------|
| Memory overhead | None | 2-10 KB |
| Timing | Perfect | Good (priority-based) |
| Multi-task | Manual | Built-in |
| Learning curve | Low | Medium |
### FreeRTOS Example
```cpp
#include <Arduino_FreeRTOS.h>
void TaskSensor(void *pvParameters) {
    for (;;) {
        float temp = readTemperature();
        Serial.println(temp);
        vTaskDelay(pdMS_TO_TICKS(100));
    }
}
void setup() {
    xTaskCreate(TaskSensor, "Sensor", 128, NULL, 2, NULL);
}
```
## Verification Pattern
```
STEP 6: Start simulation (Wokwi: click play, QEMU: run command)
STEP 7: Observe visual indicators, serial output
STEP 8: Test button presses, sensor changes, timing
STEP 9: Check console/output for errors
STEP 10: Document behavior
STEP 11: Report results
```
## Memory and Resources
### Resource Budget Template
| Resource | Available | Used | % |
|----------|-----------|------|---|
| Flash | 32 KB | 12 KB | 37.5% |
| SRAM | 2 KB | 1.2 KB | 60% |
| GPIO pins | 20 | 8 | 40% |
```cpp
// ESP32 memory reporting
void reportMemory() {
    Serial.print("Free heap: "); Serial.println(ESP.getFreeHeap());
    Serial.print("Min free: "); Serial.println(ESP.getMinFreeHeap());
}
```
## Embedded-Specific Requirements
### At Evolution Point Add:
```markdown
## Hardware Specification (Simulated)
Platform: [ESP32 DevKit v1]
Memory: [520 KB SRAM, 4 MB Flash]
Simulator: [Wokwi]
## Virtual Components
- LED (GPIO2)
- Button (GPIO4)
- DHT22 Sensor (GPIO5)
## Timing Requirements
Main loop: < 100ms
ISR response: < 10us
## Power Considerations
Note: Physical testing required for accurate measurements
```
## Transition Triggers
| Trigger | Action |
|---------|--------|
| Multiple deployment targets | Transition to Agile |
| OTA update planned | Architecture design needed |
| Real-time failures | RTOS evaluation |
| Memory pressure | Optimization pass |
| Hardware validation needed | Physical test plan |
## Best Practices
### Vibe Phase
- Start with single component
- Use serial extensively for debugging
- Test incrementally
- Mock hardware realistically
### Structured Phase
- Add proper error handling
- Document pin assignments
- Implement watchdog
- Plan hardware validation
---
**End of Embedded Framework**
