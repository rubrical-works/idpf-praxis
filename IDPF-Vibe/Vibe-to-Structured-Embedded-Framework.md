# Vibe-to-Structured Development Framework (Embedded)
**Version:** v0.69.0
**Type:** Embedded Systems Specialization
**Extends:** Vibe-to-Structured-Core-Framework.md (Rev 2)
## Purpose
Specializes Core Framework for embedded systems development using simulators and emulators, without physical hardware.
**Evolution Target:** IDPF-Agile
## Embedded-Specific Vibe Coding Patterns
### Pattern 1: Breadboard-First Thinking
Start with simplest hardware config in simulation, then add complexity:
```
STEP 1: Single component (LED blinks, button reads, serial outputs)
STEP 2: Two components interacting (button → LED, sensor → output)
STEP 3: Add communication (serial debug, simple protocols)
STEP 4: System behavior (state machine, error handling)
```
### Pattern 2: Verbose Serial Everything
Serial output is primary debugging. Over-communicate state.
```cpp
void vibeDebug(const char* location, const char* msg) {
    Serial.print("["); Serial.print(millis()); Serial.print("] ");
    Serial.print(location); Serial.print(": "); Serial.println(msg);
}
```
### Pattern 3: Safe Defaults First
Always initialize to safe states before exploring behavior. Disable outputs first, set known-good defaults, enable outputs last.
### Pattern 4: Simulation Boundary Markers
Mark code that won't work on real hardware with clear comments:
```cpp
#ifdef SIMULATION
    sensorValue = random(20, 30);  // Simulated temperature
#else
    sensorValue = readRealSensor(); // Real hardware
#endif
```
### Pattern 5: State-Machine-from-Start
Even in vibe phase, use a basic state machine to avoid spaghetti embedded code.
## Embedded Platform Coverage
### Microcontroller Platforms
| Platform | Simulator | Languages | Use Cases |
|----------|-----------|-----------|-----------|
| Arduino (AVR/ARM) | Wokwi, SimulIDE | C++, Arduino | IoT, sensors, automation |
| ESP32/ESP8266 | Wokwi (web) | C++, MicroPython | WiFi/BT IoT, web servers |
| STM32 (Cortex-M) | Renode, QEMU | C, C++, Rust | Industrial, robotics |
| ARM Cortex-M | QEMU, Renode | C, C++, Rust | General embedded |
### Embedded Linux Platforms
| Platform | Simulator | Use Cases |
|----------|-----------|-----------|
| Raspberry Pi | QEMU | IoT gateways, edge computing |
| BeagleBone | QEMU | Industrial automation, robotics |
### RTOS Platforms
| Platform | Simulator | Use Cases |
|----------|-----------|-----------|
| FreeRTOS | QEMU, native | Real-time embedded |
| Zephyr RTOS | QEMU, Renode | IoT, wearables, industrial |
### Special Purpose
- **AVR (8-bit)**: SimulAVR, Wokwi — simple control systems
- **PIC**: gpsim — automotive, industrial
## Platform-Specific Session Initialization
Follow Core Framework initialization (Steps 1-4), then ask:
- **Target platform?** (Arduino/ESP32/STM32/Raspberry Pi/Other)
- **Simulator preference?** (Wokwi/QEMU/Renode/SimulIDE)
- **Application type?** (Sensor reading/Control system/IoT device/RTOS app)
- **Language preference?** (C/C++/MicroPython/Rust)
- **Real-time requirements?** (Yes - RTOS / No - bare metal or Linux)
## Simulator Selection Guide
### Wokwi (Web-Based) — EASIEST START
**Best for:** Arduino, ESP32, beginners, quick prototyping
- No installation, visual circuit builder, real-time simulation, share via URL
- Limited to supported platforms, requires internet
```
STEP 1: Open https://wokwi.com
STEP 2: New project → select platform
STEP 3: Add/wire components visually
STEP 4: Write code → Start Simulation
STEP 5: Observe behavior, check serial monitor
```
### QEMU — Best for Linux Systems
**Best for:** Raspberry Pi, ARM Linux, full system emulation, RTOS
```bash
# Raspberry Pi emulation
qemu-system-arm -M versatilepb -cpu arm1176 \
  -kernel kernel.img -dtb versatile-pb.dtb \
  -hda raspbian.img -append "root=/dev/sda2" \
  -serial stdio -net user,hostfwd=tcp::5022-:22
# SSH in: ssh pi@localhost -p 5022
```
### Renode — Best for Complex Embedded
**Best for:** STM32, nRF52, RISC-V, multi-node, peripheral simulation, RTOS
```
# .resc script
using sysbus
mach create "stm32"
machine LoadPlatformDescription @platforms/boards/stm32f4_discovery-kit.repl
sysbus LoadELF @path/to/firmware.elf
start
```
### SimulIDE — Visual Circuit Simulator
**Best for:** Arduino, AVR, visual circuit design, beginners learning electronics
## Development Workflows
### Arduino/ESP32 (Wokwi)
```cpp
#define LED_PIN 13
#define BUTTON_PIN 2
void setup() {
    Serial.begin(115200);
    pinMode(LED_PIN, OUTPUT);
    pinMode(BUTTON_PIN, INPUT_PULLUP);
}
void loop() {
    if (digitalRead(BUTTON_PIN) == LOW) {
        digitalWrite(LED_PIN, HIGH);
        Serial.println("Button pressed - LED ON");
    } else {
        digitalWrite(LED_PIN, LOW);
    }
    delay(50);
}
```
### ESP32 WiFi Example
```cpp
#include <WiFi.h>
const char* ssid = "Wokwi-GUEST";
const char* password = "";
void setup() {
    Serial.begin(115200);
    WiFi.begin(ssid, password);
    while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
    Serial.println("\nConnected! IP: " + WiFi.localIP().toString());
}
```
### STM32 with Renode
```c
#include "stm32f4xx_hal.h"
int main(void) {
    HAL_Init();
    SystemClock_Config();
    __HAL_RCC_GPIOD_CLK_ENABLE();
    GPIO_InitTypeDef GPIO_Init = {.Pin = GPIO_PIN_12, .Mode = GPIO_MODE_OUTPUT_PP, .Speed = GPIO_SPEED_FREQ_LOW};
    HAL_GPIO_Init(GPIOD, &GPIO_Init);
    while (1) {
        HAL_GPIO_TogglePin(GPIOD, GPIO_PIN_12);
        HAL_Delay(500);
    }
}
```
## Raspberry Pi Development Patterns
### GPIO Control (Python)
```python
import RPi.GPIO as GPIO
import time
LED_PIN = 18
BUTTON_PIN = 23
GPIO.setmode(GPIO.BCM)
GPIO.setup(LED_PIN, GPIO.OUT)
GPIO.setup(BUTTON_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)
try:
    while True:
        if GPIO.input(BUTTON_PIN) == GPIO.LOW:
            GPIO.output(LED_PIN, GPIO.HIGH)
        else:
            GPIO.output(LED_PIN, GPIO.LOW)
        time.sleep(0.1)
except KeyboardInterrupt:
    GPIO.cleanup()
```
### I2C Sensor Reading
```python
import smbus2
bus = smbus2.SMBus(1)
address = 0x48
def read_temperature():
    data = bus.read_i2c_block_data(address, 0x00, 2)
    temp = ((data[0] << 8) | data[1]) >> 4
    if temp > 2047: temp -= 4096
    return temp * 0.0625
```
## Bare-Metal vs RTOS
| Aspect | Bare-Metal | RTOS |
|--------|-----------|------|
| Complexity | Lower | Higher |
| Predictability | Direct control | Task-based scheduling |
| Memory | Minimal overhead | Kernel overhead |
| Use When | Simple, < 3 tasks | Multiple concurrent tasks, timing-critical |
### FreeRTOS Task Example
```c
void sensorTask(void *pvParameters) {
    while (1) {
        int value = readSensor();
        xQueueSend(sensorQueue, &value, portMAX_DELAY);
        vTaskDelay(pdMS_TO_TICKS(100));
    }
}
void displayTask(void *pvParameters) {
    int value;
    while (1) {
        if (xQueueReceive(sensorQueue, &value, portMAX_DELAY)) {
            updateDisplay(value);
        }
    }
}
```
## Hardware Abstraction for Simulator
```cpp
class ISensor {
public:
    virtual float read() = 0;
    virtual const char* name() = 0;
};
class SimulatedTemp : public ISensor {
    float read() override { return 20.0 + (random(100) / 10.0); }
    const char* name() override { return "SimTemp"; }
};
class RealTemp : public ISensor {
    float read() override { return readADC(TEMP_PIN) * TEMP_SCALE; }
    const char* name() override { return "TMP36"; }
};
```
## Memory and Resource Constraint Awareness
### Memory Budget Template
```
Target: [Platform Name]
Flash: [X] KB total, [Y] KB available
SRAM: [X] KB total, [Y] KB available
Budget Allocation:
  - Application code: XX%
  - Stack: XX%
  - Heap: XX%
  - Buffers: XX%
  - Reserve: 10% minimum
```
### Resource Monitoring
```cpp
extern unsigned int __heap_start;
extern void *__brkval;
int freeMemory() {
    int v;
    return (int)&v - (__brkval == 0 ? (int)&__heap_start : (int)__brkval);
}
```
## Testing Strategies
### Unit Testing (Unity framework for C)
```c
#include "unity.h"
void test_temperature_conversion(void) {
    TEST_ASSERT_EQUAL_FLOAT(25.0, raw_to_celsius(512));
    TEST_ASSERT_EQUAL_FLOAT(0.0, raw_to_celsius(0));
    TEST_ASSERT_EQUAL_FLOAT(100.0, raw_to_celsius(2048));
}
```
### Hardware-in-the-Loop Pattern
```python
import serial
def test_led_response():
    ser = serial.Serial('/dev/ttyUSB0', 115200)
    ser.write(b'LED_ON\n')
    response = ser.readline()
    assert b'LED:ON' in response
```
## Common Embedded Patterns
### Debounce
```cpp
bool readButton(int pin) {
    if (digitalRead(pin) == LOW) {
        delay(50);
        if (digitalRead(pin) == LOW) {
            while (digitalRead(pin) == LOW);
            return true;
        }
    }
    return false;
}
```
### Non-Blocking Timer
```cpp
unsigned long previousMillis = 0;
const long interval = 1000;
void loop() {
    unsigned long currentMillis = millis();
    if (currentMillis - previousMillis >= interval) {
        previousMillis = currentMillis;
        doPeriodicWork();
    }
}
```
### Watchdog Timer
```cpp
#include <avr/wdt.h>
void setup() {
    wdt_enable(WDTO_2S);
}
void loop() {
    wdt_reset();
    doWork();
}
```
## Transition Triggers
**Trigger conditions for IDPF-Agile:**
- Multiple deployment targets
- Evolving feature requirements
- Team collaboration needed
- Iterative hardware/software co-design
- OTA update capability planned
- IoT platform integration
### Embedded Transition Checklist
- [ ] All sensors identified and tested in simulation
- [ ] Communication protocols verified (I2C, SPI, UART)
- [ ] Pin assignments documented
- [ ] Power requirements understood
- [ ] State machine defined (if applicable)
- [ ] Interrupt handling pattern established
- [ ] Memory budget evaluated
- [ ] Timing requirements measured
- [ ] External system interfaces defined
- [ ] Communication protocols chosen (MQTT, HTTP, ModBus)
- [ ] Data format specifications documented
- [ ] Error handling strategy established
- [ ] Memory limits (Flash, SRAM) recorded
- [ ] CPU budget allocated
- [ ] Power constraints noted
- [ ] Real-time deadlines identified
- [ ] Hardware dependencies listed
- [ ] Simulation limitations noted
- [ ] Physical testing requirements documented
### Hardware Validation Plan
**Phase 1: Component Testing** — Each sensor on physical hardware, actual vs simulated readings, noise, response times
**Phase 2: Integration Testing** — All components together, power consumption, EMI, temperature range
**Phase 3: Endurance Testing** — 24-hour operation, memory leak detection, watchdog effectiveness, power loss recovery
## Best Practices
### During Vibe Phase
- Start with one component at a time
- Serial debug everything
- Use safe initialization patterns
- Test boundary conditions early
- Document pin assignments from start
- Keep memory monitoring active
### At Evolution Point
- Capture hardware dependencies
- Document simulation limitations
- Plan real hardware testing phases
- Note timing-critical sections
### During Structured Phase
- Add comprehensive unit tests (Unity framework)
- Test edge cases (power failure, sensor disconnect)
- Implement watchdog timers
- Add memory monitoring
- Profile timing-critical paths
## Common Simulator Issues
| Issue | Cause | Fix |
|-------|-------|-----|
| Wokwi slow | Complex circuit | Reduce components, simplify |
| QEMU crash | Wrong machine type | Match -M flag to target |
| Renode freeze | Missing peripheral | Add stub in .repl file |
| SimulIDE inaccurate timing | Simulation overhead | Use for logic only, verify timing on hardware |
| Serial garbled | Wrong baud rate | Match serial config both ends |
**End of Embedded Framework**
