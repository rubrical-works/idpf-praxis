# **Vibe-to-Structured Development Framework (Embedded)**
**Version:** v0.63.0
**Type:** Embedded Systems Specialization
**Extends:** Vibe-to-Structured-Core-Framework.md (Rev 2)

## **Purpose**
This framework specializes the **Vibe-to-Structured Core Framework** for embedded systems development using simulators and emulators. It focuses on development without physical hardware, using free and open-source simulation tools.
**Read this in combination with:**
- `Vibe-to-Structured-Core-Framework.md` - Core workflow and methodology
**This document adds:**
- Simulator/emulator setup and usage
- Virtual hardware testing patterns
- Embedded development workflows
- Platform-specific toolchains
- Hardware abstraction strategies
- Testing without physical devices
**Evolution Target:** IDPF-Agile (sprints, user stories, iterative delivery)
See Core Framework for details on the evolution process.

## **Embedded-Specific Vibe Coding Patterns**
Vibe coding in embedded systems embraces rapid hardware exploration while respecting resource constraints. These patterns help you move quickly during discovery while building habits that prevent costly hardware mistakes.

### **Pattern 1: Breadboard-First Thinking**
Start with the simplest possible hardware configuration in simulation, then incrementally add complexity.
**Approach:**
```
STEP 1: Single component working
  - LED blinks
  - Button reads
  - Serial outputs

STEP 2: Two components interacting
  - Button controls LED
  - Sensor triggers output

STEP 3: Add communication
  - Serial debugging
  - Simple protocols

STEP 4: System behavior
  - State machine
  - Error handling
```
**Anti-Pattern:** Starting with complex multi-sensor designs before proving basic I/O works.

### **Pattern 2: Verbose Serial Everything**
During vibe phase, serial output is your primary debugging tool. Over-communicate state.
**Approach:**
```cpp
void vibeDebug(const char* location, const char* msg) {
    Serial.print("[");
    Serial.print(millis());
    Serial.print("] ");
    Serial.print(location);
    Serial.print(": ");
    Serial.println(msg);
}

void setup() {
    Serial.begin(115200);
    vibeDebug("SETUP", "Starting initialization");

    pinMode(LED_PIN, OUTPUT);
    vibeDebug("SETUP", "LED pin configured");

    pinMode(BUTTON_PIN, INPUT_PULLUP);
    vibeDebug("SETUP", "Button pin configured");

    vibeDebug("SETUP", "Initialization complete");
}
```
**Why:** Hardware issues often manifest as "nothing happens." Serial traces reveal exactly where execution stops.

### **Pattern 3: Safe Defaults First**
Always initialize to safe states before exploring behavior.
**Approach:**
```cpp
// Safe initialization pattern
void setup() {
    // 1. Disable all outputs first
    pinMode(MOTOR_PIN, OUTPUT);
    digitalWrite(MOTOR_PIN, LOW);  // Motor OFF

    pinMode(RELAY_PIN, OUTPUT);
    digitalWrite(RELAY_PIN, LOW);  // Relay OFF

    // 2. Configure inputs with pull-ups
    pinMode(BUTTON_PIN, INPUT_PULLUP);
    pinMode(LIMIT_SWITCH_PIN, INPUT_PULLUP);

    // 3. Now safe to enable features
    Serial.begin(115200);

    // 4. Verify safe state before proceeding
    Serial.println("All outputs LOW - safe state confirmed");
}
```
**Why:** Even in simulation, practicing safe defaults builds habits that prevent hardware damage.

### **Pattern 4: Time-Boxed Hardware Experiments**
Give yourself explicit time limits for hardware experiments, with clear decision criteria.
**Approach:**
```
EXPERIMENT: WiFi connection behavior
TIME LIMIT: 30 minutes

SUCCESS CRITERIA:
- [ ] Connects to test network
- [ ] Reconnects after disconnect
- [ ] Shows connection status

ABANDON IF:
- Library won't compile after 10 min
- No connection after 15 min attempts
- Documentation is missing/unclear

OUTCOME: [Record findings]
```
**Why:** Hardware rabbit holes are deep. Time-boxing prevents getting stuck on non-essential exploration.

### **Pattern 5: Simulated Sensor Patterns**
Create sensor simulations that model real-world behavior, not just return constants.
**Approach:**
```cpp
// Bad: Returns constant
float readTemperature() {
    return 25.0;  // Always 25°C
}

// Good: Models realistic behavior
float readTemperature() {
    static float baseTemp = 25.0;
    static unsigned long lastRead = 0;

    // Simulate slow drift
    if (millis() - lastRead > 5000) {
        baseTemp += random(-10, 11) / 100.0;  // ±0.1°C drift
        lastRead = millis();
    }

    // Add noise
    float noise = random(-50, 51) / 100.0;  // ±0.5°C noise

    return baseTemp + noise;
}
```
**Why:** Realistic simulation reveals edge cases in your logic before you encounter them on hardware.

## **Embedded Platform Coverage**
This framework covers development for platforms with **free/open-source simulators**:

### **Microcontroller Platforms**
**Arduino (AVR/ARM):**
- **Simulator**: Wokwi, SimulIDE, Proteus (limited free)
- **Languages**: C++, Arduino framework
- **Use cases**: IoT devices, sensors, simple automation
**ESP32/ESP8266 (Xtensa/RISC-V):**
- **Simulator**: Wokwi (web-based)
- **Languages**: C++, MicroPython, Arduino framework
- **Use cases**: WiFi/Bluetooth IoT, web servers, sensors
**STM32 (ARM Cortex-M):**
- **Simulator**: Renode, QEMU
- **Languages**: C, C++, Rust
- **Use cases**: Industrial control, robotics, complex embedded
**ARM Cortex-M Generic:**
- **Simulator**: QEMU, Renode
- **Languages**: C, C++, Rust
- **Use cases**: General embedded development

### **Embedded Linux Platforms**
**Raspberry Pi:**
- **Simulator**: QEMU (full system emulation)
- **Languages**: Python, C, C++, Rust, any Linux-compatible
- **Use cases**: IoT gateways, automation, edge computing
**BeagleBone:**
- **Simulator**: QEMU (with kernel image)
- **Languages**: Python, C, C++
- **Use cases**: Industrial automation, robotics

### **RTOS Platforms**
**FreeRTOS:**
- **Simulator**: QEMU, native ports
- **Languages**: C, C++
- **Use cases**: Real-time embedded systems
**Zephyr RTOS:**
- **Simulator**: QEMU, Renode
- **Languages**: C, C++
- **Use cases**: IoT, wearables, industrial

### **Special Purpose**
**AVR (8-bit):**
- **Simulator**: SimulAVR, Wokwi
- **Languages**: C, Assembly
- **Use cases**: Simple control systems
**PIC Microcontrollers:**
- **Simulator**: gpsim
- **Languages**: C, Assembly
- **Use cases**: Automotive, industrial

## **Platform-Specific Session Initialization**

### **Prerequisites: Claude Code Setup**
**IMPORTANT:** Before starting any project with this framework, ensure you have completed the **Claude Code setup** described in the Core Framework.
Refer to the "Working with Claude Code" section in `Vibe-to-Structured-Core-Framework.md` if you:
- Haven't used Claude Code before
- Are unsure about the two-tool workflow
- Need a refresher on how ASSISTANT and Claude Code work together
The instructions below assume you have Claude Code ready and understand the workflow.
When starting an embedded vibe project, the ASSISTANT follows Core Framework initialization (Steps 1-4, including establishing project location), then asks:
**Embedded-Specific Questions:**
- **Target platform?** (Arduino/ESP32/STM32/Raspberry Pi/Other)
- **Simulator preference?** (Wokwi/QEMU/Renode/SimulIDE)
- **Application type?** (Sensor reading/Control system/IoT device/RTOS app)
- **Language preference?** (C/C++/MicroPython/Rust)
- **Real-time requirements?** (Yes - RTOS / No - bare metal or Linux)
**Starting Point Suggestions:**
For Arduino/ESP32 with Wokwi:
```
Let's start with Wokwi web simulator:
- Create basic sketch structure
- Set up virtual components (LED, button, sensor)
- Test in browser
- No hardware needed!
```
For STM32 with Renode:
```
Let's start with Renode simulation:
- Install Renode
- Create basic firmware structure
- Configure virtual peripherals
- Run in simulator
```
For Raspberry Pi with QEMU:
```
Let's start with QEMU emulation:
- Download Raspberry Pi OS image
- Set up QEMU
- Develop and test in virtual environment
- SSH into emulated system
```

## **Simulator Selection Guide**

### **Wokwi (Web-Based) - EASIEST START**
**Best for:**
- Arduino (Uno, Mega, Nano)
- ESP32, ESP8266
- Beginners
- Quick prototyping
- Web-accessible demos
**Advantages:**
✅ No installation required
✅ Visual circuit builder
✅ Built-in code editor
✅ Real-time simulation
✅ Share projects via URL
✅ Extensive component library
**Limitations:**
❌ Limited to supported platforms
❌ Requires internet connection
❌ Less control than native tools
**Getting Started:**
```
STEP 1: Open browser to https://wokwi.com

STEP 2: Click "Start a new project"

STEP 3: Select platform (ESP32, Arduino Uno, etc.)

STEP 4: Add components from library:
  - Drag LED, buttons, sensors onto canvas
  - Wire them up visually

STEP 5: Write code in built-in editor

STEP 6: Click "Start Simulation" (green play button)

STEP 7: Observe behavior in real-time:
  - LEDs light up
  - Serial monitor shows output
  - Interact with buttons/sensors

STEP 8: Report results
```

### **QEMU - Best for Linux Systems**
**Best for:**
- Raspberry Pi emulation
- ARM Linux development
- Full system simulation
- RTOS testing
**Installation (Windows):**
```
STEP 1: Download QEMU from qemu.org
STEP 2: Install to default location
STEP 3: Add to PATH: C:\Program Files\qemu
STEP 4: Verify: qemu-system-arm --version
```
**Running Raspberry Pi:**
```
STEP 1: Download Raspberry Pi OS image

STEP 2: Extract kernel and dtb files

STEP 3: Run QEMU:
qemu-system-arm -M versatilepb -cpu arm1176 \
  -kernel kernel.img -dtb versatile-pb.dtb \
  -hda raspbian.img -append "root=/dev/sda2" \
  -serial stdio -net user,hostfwd=tcp::5022-:22

STEP 4: System boots in window

STEP 5: SSH into emulated system:
ssh pi@localhost -p 5022

STEP 6: Develop and test
```

### **Renode - Best for Complex Embedded**
**Best for:**
- STM32, nRF52, RISC-V
- Multi-node systems
- Peripheral simulation
- RTOS development
**Installation (Windows):**
```
STEP 1: Download from renode.io

STEP 2: Run installer

STEP 3: Launch Renode

STEP 4: Verify installation:
(monitor) version
```
**Basic Usage:**
```
STEP 1: Create .resc script (Renode script):
using sysbus
mach create "stm32"
machine LoadPlatformDescription @platforms/boards/stm32f4_discovery-kit.repl
sysbus LoadELF @path/to/firmware.elf
start

STEP 2: Load in Renode:
(monitor) s @simulation.resc

STEP 3: Monitor serial output:
(monitor) showAnalyzer sysbus.usart1

STEP 4: Run simulation
```

### **SimulIDE - Visual Circuit Simulator**
**Best for:**
- Arduino
- AVR microcontrollers
- Visual circuit design
- Beginners learning electronics
**Installation:**
```
STEP 1: Download from simulide.com

STEP 2: Extract and run (portable)

STEP 3: Open SimulIDE
```
**Usage:**
```
STEP 1: Create new circuit

STEP 2: Add microcontroller (Arduino Uno, ATmega328, etc.)

STEP 3: Add components (LEDs, buttons, sensors)

STEP 4: Wire components

STEP 5: Right-click MCU → Load firmware → Select .hex file

STEP 6: Click Power button to simulate

STEP 7: Observe behavior
```

## **Development Workflows by Platform**

### **Arduino/ESP32 with Wokwi**
**Vibe Phase Workflow:**
```
TASK: Create LED blink program

STEP 1: Open Wokwi (https://wokwi.com)

STEP 2: Start new ESP32 project

STEP 3: Add LED to circuit:
  - Drag LED from parts library
  - Connect anode to GPIO2
  - Connect cathode to GND (via 220Ω resistor)

STEP 4: Write code in editor:

void setup() {
  pinMode(2, OUTPUT);
  Serial.begin(115200);
  Serial.println("LED Blink Starting");
}

void loop() {
  digitalWrite(2, HIGH);
  Serial.println("LED ON");
  delay(1000);

  digitalWrite(2, LOW);
  Serial.println("LED OFF");
  delay(1000);
}

STEP 5: Click "Start Simulation" (green play button)

STEP 6: Verify simulation:
  - LED should blink on/off
  - Serial monitor shows messages
  - Timing is correct (1 second intervals)

STEP 7: Report results:
  - Is LED blinking?
  - What appears in serial monitor?
  - Any errors?
```
**Verification Pattern:**
```
STEP X: Check simulation behavior:
  - Visual indicators (LEDs, displays)
  - Serial output (printed values)
  - Logic analyzer (timing diagrams)
  - Component states (voltage, current)

STEP X+1: Test edge cases:
  - Button presses
  - Sensor value changes
  - Timing variations

STEP X+2: Export if needed:
  - Share URL for review
  - Download code files
  - Take screenshots
```

### **STM32 with Renode**
**Project Setup:**
```
TASK: Set up STM32 project with Renode

STEP 1: Create project directory:
mkdir my-stm32-project
cd my-stm32-project

STEP 2: Create main.c:

#include "stm32f4xx.h"

void delay(int count) {
    for (int i = 0; i < count * 1000; i++) {
        __asm__("nop");
    }
}

int main(void) {
    // Enable GPIOA clock
    RCC->AHB1ENR |= RCC_AHB1ENR_GPIOAEN;

    // Configure PA5 as output (onboard LED)
    GPIOA->MODER |= GPIO_MODER_MODER5_0;

    while (1) {
        GPIOA->ODR ^= GPIO_ODR_OD5;  // Toggle LED
        delay(500);
    }
}

STEP 3: Create Makefile for building

STEP 4: Build firmware:
make

STEP 5: Create simulation.resc script:

using sysbus
mach create "stm32"
machine LoadPlatformDescription @platforms/boards/stm32f4_discovery-kit.repl
sysbus LoadELF @build/firmware.elf
start

STEP 6: Run in Renode:
renode simulation.resc

STEP 7: Monitor execution in Renode console

STEP 8: Report behavior
```

### **Raspberry Pi with QEMU**
**Python Development Workflow:**
```
TASK: Create sensor reading script for Raspberry Pi

STEP 1: Ensure QEMU with Raspberry Pi is running

STEP 2: SSH into emulated Pi:
ssh pi@localhost -p 5022

STEP 3: Create Python script:
nano sensor_reader.py

#!/usr/bin/env python3
import time
import random  # Simulating sensor since no physical hardware

def read_temperature():
    # Simulate sensor reading
    return 20.0 + random.uniform(-2, 2)

def main():
    print("Temperature Monitor Starting")

    while True:
        temp = read_temperature()
        print(f"Temperature: {temp:.2f}°C")

        if temp > 22.0:
            print("WARNING: High temperature!")

        time.sleep(2)

if __name__ == "__main__":
    main()

STEP 4: Make executable:
chmod +x sensor_reader.py

STEP 5: Run the script:
./sensor_reader.py

STEP 6: Verify output:
  - Temperature readings appear
  - Warnings trigger correctly
  - Timing is correct

STEP 7: Press Ctrl+C to stop

STEP 8: Report results
```

## **Raspberry Pi Development Patterns**
Raspberry Pi development bridges embedded and general computing. These patterns help you leverage Linux capabilities while maintaining embedded discipline.

### **GPIO Exploration Patterns**
**Python GPIO Discovery:**
```python
#!/usr/bin/env python3
"""
GPIO exploration script for Raspberry Pi (works in QEMU with virtual GPIO)
"""
import time

# Use gpiozero for clean abstractions
from gpiozero import LED, Button, PWMLED
from signal import pause

# Discovery pattern: Map available pins
def discover_gpio():
    """Test which GPIO pins are available."""
    print("=== GPIO Discovery ===")

    # Standard available pins on RPi
    gpio_pins = [4, 5, 6, 12, 13, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27]

    for pin in gpio_pins:
        try:
            led = LED(pin)
            led.on()
            time.sleep(0.1)
            led.off()
            led.close()
            print(f"GPIO{pin}: Available (OUTPUT tested)")
        except Exception as e:
            print(f"GPIO{pin}: Error - {e}")

if __name__ == "__main__":
    discover_gpio()
```
**Hardware PWM Exploration:**
```python
from gpiozero import PWMLED
import time

# Explore PWM behavior
def explore_pwm(pin=18):
    """Explore PWM capabilities on a pin."""
    print(f"=== PWM Exploration on GPIO{pin} ===")

    led = PWMLED(pin)

    # Fade in/out
    print("Testing fade...")
    for i in range(10):
        led.value = i / 10
        print(f"Brightness: {i * 10}%")
        time.sleep(0.2)

    for i in range(10, -1, -1):
        led.value = i / 10
        time.sleep(0.2)

    # Pulse pattern
    print("Testing pulse...")
    led.pulse(fade_in_time=1, fade_out_time=1)
    time.sleep(4)

    led.close()
    print("PWM exploration complete")

explore_pwm()
```

### **I2C Device Exploration**
```python
import smbus2
import time

def scan_i2c_bus(bus_number=1):
    """Scan I2C bus for connected devices."""
    print(f"=== I2C Bus {bus_number} Scan ===")

    bus = smbus2.SMBus(bus_number)
    devices = []

    for address in range(0x03, 0x78):
        try:
            bus.read_byte(address)
            devices.append(address)
            print(f"Device found at 0x{address:02X}")
        except:
            pass

    bus.close()

    if not devices:
        print("No I2C devices found")
    else:
        print(f"\nFound {len(devices)} device(s)")
        # Common device identification
        common_devices = {
            0x27: "LCD Display (PCF8574)",
            0x3C: "OLED Display (SSD1306)",
            0x48: "ADS1115 ADC",
            0x68: "DS3231 RTC / MPU6050",
            0x76: "BME280/BMP280",
            0x77: "BME280/BMP280 (alt)"
        }
        for addr in devices:
            if addr in common_devices:
                print(f"  0x{addr:02X} - Likely: {common_devices[addr]}")

    return devices

scan_i2c_bus()
```

### **SPI Exploration**
```python
import spidev

def explore_spi():
    """Explore SPI communication."""
    print("=== SPI Exploration ===")

    spi = spidev.SpiDev()
    spi.open(0, 0)  # Bus 0, Device 0

    # Configure SPI
    spi.max_speed_hz = 1000000  # 1 MHz
    spi.mode = 0b00  # CPOL=0, CPHA=0

    print(f"SPI Mode: {spi.mode}")
    print(f"SPI Speed: {spi.max_speed_hz} Hz")
    print(f"Bits per word: {spi.bits_per_word}")

    # Test loopback (MOSI to MISO)
    test_data = [0x55, 0xAA, 0x01, 0x02]
    response = spi.xfer2(test_data)

    print(f"Sent: {[hex(b) for b in test_data]}")
    print(f"Received: {[hex(b) for b in response]}")

    spi.close()

explore_spi()
```

### **Systemd Service Pattern**
For long-running applications on Raspberry Pi:
```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My Embedded Application
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/myapp
ExecStart=/usr/bin/python3 /home/pi/myapp/main.py
Restart=always
RestartSec=10

# Resource constraints
MemoryLimit=128M
CPUQuota=50%

[Install]
WantedBy=multi-user.target
```
**Exploration workflow:**
```bash
# Create and test service
sudo systemctl daemon-reload
sudo systemctl start myapp
sudo systemctl status myapp
journalctl -u myapp -f  # Follow logs

# Enable on boot after testing
sudo systemctl enable myapp
```

## **Bare-Metal vs RTOS Considerations**
Choosing between bare-metal and RTOS fundamentally affects your embedded architecture. Use vibe phase to explore which fits your needs.

### **Bare-Metal Exploration**
**When to consider bare-metal:**
- Simple control loops
- Deterministic timing requirements
- Minimal memory footprint needed
- Single primary task
**Exploration pattern:**
```cpp
// Bare-metal super loop pattern
void setup() {
    Serial.begin(115200);
    Serial.println("=== Bare-Metal Exploration ===");

    initHardware();
}

void loop() {
    unsigned long loopStart = micros();

    // Fixed sequence - predictable timing
    readSensors();
    processData();
    updateOutputs();
    handleCommunication();

    unsigned long loopTime = micros() - loopStart;
    Serial.print("Loop time: ");
    Serial.print(loopTime);
    Serial.println(" us");

    // Maintain consistent loop rate
    if (loopTime < 1000) {  // Target 1ms loop
        delayMicroseconds(1000 - loopTime);
    } else {
        Serial.println("WARNING: Loop overrun!");
    }
}
```
**Bare-metal timing exploration:**
```cpp
// Measure actual timing capabilities
void exploreTimingLimits() {
    Serial.println("=== Timing Limits Exploration ===");

    // Test GPIO toggle speed
    unsigned long start = micros();
    for (int i = 0; i < 10000; i++) {
        digitalWrite(LED_PIN, HIGH);
        digitalWrite(LED_PIN, LOW);
    }
    unsigned long elapsed = micros() - start;
    Serial.print("10K toggles: ");
    Serial.print(elapsed);
    Serial.print(" us (");
    Serial.print(elapsed / 10000.0);
    Serial.println(" us/toggle)");

    // Test ADC read speed
    start = micros();
    for (int i = 0; i < 1000; i++) {
        analogRead(A0);
    }
    elapsed = micros() - start;
    Serial.print("1K ADC reads: ");
    Serial.print(elapsed);
    Serial.print(" us (");
    Serial.print(elapsed / 1000.0);
    Serial.println(" us/read)");
}
```

### **RTOS Exploration (FreeRTOS)**
**When to consider RTOS:**
- Multiple concurrent tasks
- Priority-based scheduling needed
- Complex timing relationships
- Inter-task communication required
**Exploration pattern:**
```cpp
#include <Arduino_FreeRTOS.h>
#include <semphr.h>

SemaphoreHandle_t serialMutex;

void TaskSensor(void *pvParameters) {
    for (;;) {
        float temp = readTemperature();

        xSemaphoreTake(serialMutex, portMAX_DELAY);
        Serial.print("Sensor task: ");
        Serial.println(temp);
        xSemaphoreGive(serialMutex);

        vTaskDelay(pdMS_TO_TICKS(100));  // 100ms
    }
}

void TaskControl(void *pvParameters) {
    for (;;) {
        updateControl();

        xSemaphoreTake(serialMutex, portMAX_DELAY);
        Serial.println("Control task tick");
        xSemaphoreGive(serialMutex);

        vTaskDelay(pdMS_TO_TICKS(10));  // 10ms - higher frequency
    }
}

void TaskDisplay(void *pvParameters) {
    for (;;) {
        updateDisplay();
        vTaskDelay(pdMS_TO_TICKS(500));  // 500ms
    }
}

void setup() {
    Serial.begin(115200);
    Serial.println("=== FreeRTOS Exploration ===");

    serialMutex = xSemaphoreCreateMutex();

    xTaskCreate(TaskSensor, "Sensor", 128, NULL, 2, NULL);
    xTaskCreate(TaskControl, "Control", 128, NULL, 3, NULL);  // Higher priority
    xTaskCreate(TaskDisplay, "Display", 128, NULL, 1, NULL);

    // Scheduler starts automatically on AVR
}

void loop() {
    // Not used with FreeRTOS
}
```

### **Decision Matrix**
| Factor | Bare-Metal | RTOS |
|--------|------------|------|
| Memory overhead | None | 2-10 KB |
| Timing predictability | Perfect | Good (with priority) |
| Complexity | Low | Medium |
| Multi-task handling | Manual | Built-in |
| Priority scheduling | Manual | Automatic |
| Resource sharing | Manual | Semaphores/Mutexes |
| Debugging | Simple | More complex |
| Learning curve | Low | Medium |

### **Zephyr RTOS Exploration**
For more complex embedded Linux-adjacent development:
```c
#include <zephyr/kernel.h>
#include <zephyr/drivers/gpio.h>

#define LED_NODE DT_ALIAS(led0)
static const struct gpio_dt_spec led = GPIO_DT_SPEC_GET(LED_NODE, gpios);

void blink_thread(void) {
    int ret;

    if (!gpio_is_ready_dt(&led)) {
        printk("LED device not ready\n");
        return;
    }

    ret = gpio_pin_configure_dt(&led, GPIO_OUTPUT_ACTIVE);
    if (ret < 0) {
        return;
    }

    while (1) {
        gpio_pin_toggle_dt(&led);
        k_msleep(1000);
    }
}

K_THREAD_DEFINE(blink_tid, 1024, blink_thread, NULL, NULL, NULL, 7, 0, 0);
```

## **Hardware Debugging Exploration Patterns**
Without physical hardware, debugging relies on simulation tools, serial output, and logical analysis. These patterns help you develop debugging skills that transfer to real hardware.

### **Pattern 1: State Tracing**
Track system state changes to understand behavior:
```cpp
enum SystemState {
    STATE_IDLE,
    STATE_INIT,
    STATE_RUNNING,
    STATE_ERROR,
    STATE_SLEEP
};

SystemState currentState = STATE_IDLE;
SystemState previousState = STATE_IDLE;

void traceState(SystemState newState, const char* reason) {
    if (newState != currentState) {
        Serial.print("[STATE] ");
        Serial.print(stateName(previousState));
        Serial.print(" -> ");
        Serial.print(stateName(currentState));
        Serial.print(" -> ");
        Serial.print(stateName(newState));
        Serial.print(" (");
        Serial.print(reason);
        Serial.println(")");

        previousState = currentState;
        currentState = newState;
    }
}

const char* stateName(SystemState s) {
    switch(s) {
        case STATE_IDLE: return "IDLE";
        case STATE_INIT: return "INIT";
        case STATE_RUNNING: return "RUNNING";
        case STATE_ERROR: return "ERROR";
        case STATE_SLEEP: return "SLEEP";
        default: return "UNKNOWN";
    }
}
```

### **Pattern 2: Register Dumping (STM32/ARM)**
For low-level debugging on ARM platforms:
```cpp
void dumpGPIORegisters(GPIO_TypeDef* port, const char* name) {
    Serial.print("=== ");
    Serial.print(name);
    Serial.println(" Registers ===");

    Serial.print("MODER:  0x");
    Serial.println(port->MODER, HEX);

    Serial.print("OTYPER: 0x");
    Serial.println(port->OTYPER, HEX);

    Serial.print("OSPEEDR: 0x");
    Serial.println(port->OSPEEDR, HEX);

    Serial.print("PUPDR:  0x");
    Serial.println(port->PUPDR, HEX);

    Serial.print("IDR:    0x");
    Serial.println(port->IDR, HEX);

    Serial.print("ODR:    0x");
    Serial.println(port->ODR, HEX);
}

// Usage
dumpGPIORegisters(GPIOA, "GPIOA");
```

### **Pattern 3: Timing Analysis**
Measure and visualize timing:
```cpp
class TimingProfiler {
private:
    unsigned long timestamps[10];
    const char* labels[10];
    int count = 0;

public:
    void reset() {
        count = 0;
    }

    void mark(const char* label) {
        if (count < 10) {
            timestamps[count] = micros();
            labels[count] = label;
            count++;
        }
    }

    void report() {
        Serial.println("=== Timing Profile ===");
        for (int i = 0; i < count; i++) {
            Serial.print(labels[i]);
            Serial.print(": ");
            if (i == 0) {
                Serial.print("START");
            } else {
                Serial.print("+");
                Serial.print(timestamps[i] - timestamps[i-1]);
                Serial.print(" us (total: ");
                Serial.print(timestamps[i] - timestamps[0]);
                Serial.print(" us)");
            }
            Serial.println();
        }
    }
};

TimingProfiler profiler;

void loop() {
    profiler.reset();
    profiler.mark("Loop start");

    readSensors();
    profiler.mark("After sensors");

    processData();
    profiler.mark("After processing");

    updateDisplay();
    profiler.mark("After display");

    profiler.report();
    delay(1000);
}
```

### **Pattern 4: Memory Exploration**
Understand memory usage (critical for embedded):
```cpp
// For AVR (Arduino Uno, Mega)
int freeMemory() {
    extern int __heap_start, *__brkval;
    int v;
    return (int) &v - (__brkval == 0 ? (int) &__heap_start : (int) __brkval);
}

// For ESP32
void reportMemory() {
    Serial.println("=== Memory Report ===");
    Serial.print("Free heap: ");
    Serial.print(ESP.getFreeHeap());
    Serial.println(" bytes");

    Serial.print("Min free heap: ");
    Serial.print(ESP.getMinFreeHeap());
    Serial.println(" bytes");

    Serial.print("Heap size: ");
    Serial.print(ESP.getHeapSize());
    Serial.println(" bytes");

    Serial.print("PSRAM size: ");
    Serial.print(ESP.getPsramSize());
    Serial.println(" bytes");
}
```

### **Pattern 5: Watchdog Exploration**
Test watchdog behavior in simulation:
```cpp
#include <avr/wdt.h>

void exploreWatchdog() {
    Serial.println("=== Watchdog Exploration ===");

    // Enable watchdog with 2 second timeout
    wdt_enable(WDTO_2S);
    Serial.println("Watchdog enabled: 2 second timeout");

    for (int i = 0; i < 10; i++) {
        Serial.print("Tick ");
        Serial.print(i);
        Serial.println(" - Resetting watchdog");
        wdt_reset();
        delay(500);
    }

    Serial.println("Simulating hang - not resetting watchdog...");
    while(1) {
        // Watchdog will reset system
    }
}
```

## **Memory and Resource Constraint Awareness**
Embedded systems have strict resource limits. Build awareness of these constraints during vibe phase to avoid surprises later.

### **Memory Categories**
| Memory Type | Arduino Uno | ESP32 | STM32F4 | Raspberry Pi |
|-------------|-------------|-------|---------|--------------|
| Flash (Code) | 32 KB | 4 MB | 512 KB | 32 GB (SD) |
| SRAM (Data) | 2 KB | 520 KB | 128 KB | 1-8 GB |
| EEPROM | 1 KB | 4 KB* | None | N/A |
*ESP32 uses flash for EEPROM emulation

### **Memory Usage Exploration**
```cpp
// Track string memory usage
void exploreStringMemory() {
    Serial.println("=== String Memory Exploration ===");

    // BAD: String in RAM
    char message1[] = "This string uses RAM";
    Serial.print("RAM string size: ");
    Serial.println(sizeof(message1));

    // GOOD: String in Flash (PROGMEM)
    const char message2[] PROGMEM = "This string uses Flash";
    Serial.print("Flash string size: ");
    Serial.println(sizeof(message2));

    // For ESP32, use F() macro
    Serial.println(F("This uses Flash on ESP32/AVR"));

    reportMemory();
}
```

### **Stack vs Heap Awareness**
```cpp
// Explore stack usage
void deepFunction(int depth) {
    char localBuffer[100];  // Uses stack

    Serial.print("Depth ");
    Serial.print(depth);
    Serial.print(": Stack @ 0x");
    Serial.println((unsigned int)&localBuffer, HEX);

    reportMemory();

    if (depth < 10) {
        deepFunction(depth + 1);  // Recursive call
    }
}

// Explore heap usage
void exploreHeap() {
    Serial.println("=== Heap Exploration ===");

    reportMemory();

    // Allocate on heap
    char* buffer = (char*)malloc(1024);
    Serial.println("Allocated 1KB");
    reportMemory();

    // More allocation
    char* buffer2 = (char*)malloc(1024);
    Serial.println("Allocated another 1KB");
    reportMemory();

    // Free memory
    free(buffer);
    free(buffer2);
    Serial.println("Freed both buffers");
    reportMemory();
}
```

### **Resource Budget Template**
Use this template during vibe phase to track resource usage:
```markdown
## Resource Budget

### Memory
| Resource | Available | Used | Remaining | % Used |
|----------|-----------|------|-----------|--------|
| Flash | 32 KB | 12 KB | 20 KB | 37.5% |
| SRAM | 2 KB | 1.2 KB | 0.8 KB | 60% |
| EEPROM | 1 KB | 256 B | 768 B | 25% |

### CPU Time (per loop iteration)
| Task | Time (us) | % of Budget |
|------|-----------|-------------|
| Sensor read | 500 | 5% |
| Processing | 2000 | 20% |
| Display | 1500 | 15% |
| Communication | 3000 | 30% |
| **Total** | **7000** | **70%** |

### I/O Resources
| Resource | Total | Used | Available |
|----------|-------|------|-----------|
| GPIO pins | 20 | 8 | 12 |
| PWM channels | 6 | 2 | 4 |
| ADC channels | 8 | 3 | 5 |
| I2C buses | 1 | 1 | 0 |
| SPI buses | 1 | 0 | 1 |
| UART | 1 | 1 | 0 |
```

### **Power Awareness (for battery-powered)**
```cpp
void explorePowerModes() {
    Serial.println("=== Power Mode Exploration ===");

    // Active mode
    Serial.println("Active mode - CPU running");
    delay(1000);

    // Light sleep (ESP32)
    #ifdef ESP32
    Serial.println("Entering light sleep for 5 seconds...");
    Serial.flush();
    esp_sleep_enable_timer_wakeup(5 * 1000000);  // 5 seconds
    esp_light_sleep_start();
    Serial.println("Woke from light sleep");

    // Deep sleep
    Serial.println("Entering deep sleep for 5 seconds...");
    Serial.flush();
    esp_deep_sleep(5 * 1000000);  // Won't return - resets
    #endif

    // For AVR
    #ifdef __AVR__
    Serial.println("AVR sleep modes available:");
    Serial.println("- SLEEP_MODE_IDLE");
    Serial.println("- SLEEP_MODE_ADC");
    Serial.println("- SLEEP_MODE_PWR_DOWN");
    Serial.println("- SLEEP_MODE_PWR_SAVE");
    Serial.println("- SLEEP_MODE_STANDBY");
    #endif
}
```

## **Embedded-Specific Transition Triggers**

### **Transition to Agile Framework**
**Trigger conditions for IDPF-Agile:**
- Multiple deployment targets
- Evolving feature requirements
- Team collaboration needed
- Iterative hardware/software co-design
- OTA update capability planned
- IoT platform integration
**Example trigger scenario:**
```
VIBE PHASE OBSERVATIONS:
- Basic sensor reading works
- WiFi connectivity proven
- MQTT communication functional
- User wants cloud dashboard integration

TRANSITION TRIGGER:
"Multiple features planned, requirements will evolve with user feedback"

AGILE STORIES GENERATED:
Story: As a user, I want to see temperature on a web dashboard
Story: As a user, I want alerts when temperature exceeds threshold
Story: As a user, I want historical temperature graphs
Story: As an admin, I want to configure alert thresholds remotely
```

### **Embedded-Specific Transition Checklist**
Before transitioning from Vibe to Agile:
```markdown
## Embedded Transition Readiness

### Hardware Understanding
- [ ] All sensors identified and tested in simulation
- [ ] Communication protocols verified (I2C, SPI, UART)
- [ ] Pin assignments documented
- [ ] Power requirements understood

### Software Architecture
- [ ] State machine defined (if applicable)
- [ ] Interrupt handling pattern established
- [ ] Memory budget evaluated
- [ ] Timing requirements measured

### Integration Points
- [ ] External system interfaces defined
- [ ] Communication protocols chosen (MQTT, HTTP, ModBus, etc.)
- [ ] Data format specifications documented
- [ ] Error handling strategy established

### Constraints Documented
- [ ] Memory limits (Flash, SRAM) recorded
- [ ] CPU budget allocated
- [ ] Power constraints noted (battery life goals)
- [ ] Real-time deadlines identified

### Risks Identified
- [ ] Hardware dependencies listed
- [ ] Simulation limitations noted
- [ ] Physical testing requirements documented
- [ ] Environmental factors considered
```

### **Post-Vibe Hardware Validation**
When transitioning, create a hardware validation plan:
```markdown
## Hardware Validation Plan

### Phase 1: Component Testing
- [ ] Each sensor on physical hardware
- [ ] Actual vs simulated readings
- [ ] Noise characteristics
- [ ] Response times

### Phase 2: Integration Testing
- [ ] All components together
- [ ] Power consumption measurement
- [ ] EMI/interference testing
- [ ] Temperature range testing

### Phase 3: Endurance Testing
- [ ] 24-hour continuous operation
- [ ] Memory leak detection
- [ ] Watchdog effectiveness
- [ ] Recovery from power loss
```

## **Hardware Abstraction for Simulator**

### **Simulating Sensors**
**Temperature Sensor Simulation:**
```cpp
// Arduino/ESP32
float readTemperature() {
    #ifdef SIMULATION
        // Return simulated value that changes over time
        return 20.0 + (sin(millis() / 1000.0) * 5.0);
    #else
        // Real hardware sensor code
        return dht.readTemperature();
    #endif
}
```
**Button with Debouncing:**
```cpp
class Button {
private:
    int pin;
    unsigned long lastDebounceTime = 0;
    unsigned long debounceDelay = 50;
    bool lastState = HIGH;

public:
    Button(int p) : pin(p) {
        pinMode(pin, INPUT_PULLUP);
    }

    bool isPressed() {
        bool reading = digitalRead(pin);

        if (reading != lastState) {
            lastDebounceTime = millis();
        }

        if ((millis() - lastDebounceTime) > debounceDelay) {
            if (reading == LOW) {
                lastState = reading;
                return true;
            }
        }

        lastState = reading;
        return false;
    }
};
```

### **Virtual Peripheral Patterns**
**LED Control Abstraction:**
```cpp
class LED {
private:
    int pin;
    bool state;

public:
    LED(int p) : pin(p), state(false) {
        pinMode(pin, OUTPUT);
    }

    void on() {
        state = true;
        digitalWrite(pin, HIGH);
        Serial.println("LED ON");
    }

    void off() {
        state = false;
        digitalWrite(pin, LOW);
        Serial.println("LED OFF");
    }

    void toggle() {
        if (state) off();
        else on();
    }
};
```
**Serial Communication Pattern:**
```cpp
void setupSerial() {
    Serial.begin(115200);
    while (!Serial) {
        ; // Wait for serial port to connect (simulator only)
    }
    Serial.println("=== System Starting ===");
}

void logValue(const char* name, float value) {
    Serial.print(name);
    Serial.print(": ");
    Serial.println(value);
}
```

## **Testing Strategies for Embedded**

### **Unit Testing without Hardware**
**Using Native Build:**
```cpp
// led.h
class LED {
public:
    LED(int pin);
    void on();
    void off();
    bool isOn() const;
};

// test_led.cpp (compiled for PC, not embedded)
#include "gtest/gtest.h"
#include "led.h"

TEST(LEDTest, StartsOff) {
    LED led(13);
    EXPECT_FALSE(led.isOn());
}

TEST(LEDTest, TurnsOn) {
    LED led(13);
    led.on();
    EXPECT_TRUE(led.isOn());
}
```

### **Simulator-Based Testing**
**Automated Wokwi Testing:**
```javascript
// Can use Playwright or Selenium to automate Wokwi
// For vibe phase, manual testing is sufficient
```
**Renode Automated Testing:**
```python
# test_script.py for Renode
from pyrenode3 import *

def test_led_blink():
    """Test LED blinks at correct interval."""
    # Start simulation
    execute_command("start")

    # Wait for LED toggle
    time.sleep(1)

    # Check GPIO state
    result = execute_command("sysbus.gpioPortA.led GetState")

    assert "true" in result or "false" in result
```

### **Serial Output Testing**
**Pattern Matching:**
```python
def test_serial_output():
    """Verify expected serial output."""
    output = capture_serial_output(duration=5)

    assert "System Starting" in output
    assert "Temperature:" in output
    assert "C" in output  # Celsius symbol
```

## **Common Embedded Patterns**

### **State Machine**
```cpp
enum State {
    IDLE,
    READING_SENSOR,
    PROCESSING,
    SENDING_DATA,
    ERROR
};

State currentState = IDLE;

void loop() {
    switch (currentState) {
        case IDLE:
            if (shouldReadSensor()) {
                currentState = READING_SENSOR;
            }
            break;

        case READING_SENSOR:
            float value = readSensor();
            if (value > 0) {
                processValue(value);
                currentState = PROCESSING;
            } else {
                currentState = ERROR;
            }
            break;

        case PROCESSING:
            // Process data
            currentState = SENDING_DATA;
            break;

        case SENDING_DATA:
            sendData();
            currentState = IDLE;
            break;

        case ERROR:
            handleError();
            currentState = IDLE;
            break;
    }
}
```

### **Interrupt Handling**
```cpp
volatile bool buttonPressed = false;

void IRAM_ATTR buttonISR() {
    buttonPressed = true;
}

void setup() {
    pinMode(BUTTON_PIN, INPUT_PULLUP);
    attachInterrupt(digitalPinToInterrupt(BUTTON_PIN), buttonISR, FALLING);
}

void loop() {
    if (buttonPressed) {
        buttonPressed = false;
        // Handle button press
        Serial.println("Button pressed!");
    }
}
```

### **Timing Without delay()**
```cpp
unsigned long previousMillis = 0;
const long interval = 1000;  // 1 second

void loop() {
    unsigned long currentMillis = millis();

    if (currentMillis - previousMillis >= interval) {
        previousMillis = currentMillis;

        // Do timed action
        toggleLED();
    }

    // Other code runs continuously
    checkButton();
    readSensor();
}
```

## **Embedded-Specific Requirements Template Additions**
When generating requirements at Evolution Point, add:

### **Hardware Specification (Virtual)**
```markdown
## Hardware Specification (Simulated)

### Target Platform
- Microcontroller: ESP32 DevKit v1
- Clock Speed: 240 MHz
- Memory: 520 KB SRAM, 4 MB Flash
- Simulator: Wokwi web-based

### Virtual Components
- 1x LED (GPIO2)
- 1x Button (GPIO4, pull-up)
- 1x DHT22 Temperature Sensor (GPIO5)
- 1x SSD1306 OLED Display (I2C)

### Interfaces
- Serial: UART0 (115200 baud)
- I2C: Pins 21 (SDA), 22 (SCL)
- WiFi: Simulated network access
```

### **Simulation Environment**
```markdown
## Simulation Environment

### Development Setup
- Simulator: Wokwi (https://wokwi.com)
- Build System: Arduino IDE 2.x or PlatformIO
- Toolchain: ESP32 Arduino Core v2.0+

### Simulation Capabilities
- Real-time execution
- Serial monitor output
- Visual component feedback
- Timing analysis
- Network simulation (limited)

### Limitations
- No physical sensor noise
- Perfect timing (no jitter)
- Simplified hardware behavior
- Limited peripheral emulation
```

### **Power & Timing**
```markdown
## Power & Timing Constraints

### Timing Requirements
- Main loop: < 100ms per iteration
- ISR response: < 10µs
- Sensor read: 2000ms max (DHT22)

### Power Considerations
- Deep sleep mode: Not tested in simulation
- Active power: Not measured in simulation
- Battery life: Estimated based on datasheet

Note: Physical hardware testing required for accurate power measurements.
```

## **Vibe Phase Best Practices (Embedded)**

### **Start Simple**
**First iteration:**
```
TASK: Blink LED

- Single LED
- Simple on/off
- Serial output
- Verify in simulator
```
**Don't start with:**
- Multiple sensors
- Complex protocols
- Real-time constraints
- Network communication

### **Use Serial Liberally**
```cpp
void setup() {
    Serial.begin(115200);
    Serial.println("=== Setup Starting ===");

    pinMode(LED_PIN, OUTPUT);
    Serial.println("LED pin configured");

    Serial.println("=== Setup Complete ===");
}

void loop() {
    Serial.println("--- Loop Start ---");

    digitalWrite(LED_PIN, HIGH);
    Serial.println("LED: ON");
    delay(1000);

    digitalWrite(LED_PIN, LOW);
    Serial.println("LED: OFF");
    delay(1000);
}
```
**Serial output helps:**
- Verify code execution
- Debug timing issues
- Confirm state changes
- Understand program flow

### **Test Incrementally**
**Build up complexity:**
1. LED blink (output)
2. Button read (input)
3. Button controls LED (input → output)
4. Add sensor reading
5. Display sensor value
6. Add state machine
7. Add error handling
**Test after each addition:**
```
STEP 6: Test in simulator after adding feature

STEP 7: Verify new behavior:
  - Old features still work
  - New feature works
  - No unexpected side effects

STEP 8: Report results before continuing
```

## **Evolution Point Considerations**

### **When to Evolve**
Embedded projects should evolve when:
- 3-4 components working together
- Basic functionality proven
- State machine or control flow established
- Ready to add error handling
- Need systematic testing

### **Testing Strategy**
```markdown
## Testing Strategy (Embedded)

### Unit Tests
- Build core logic for PC (native)
- Test without hardware dependencies
- Use mocking for peripherals

### Simulator Tests
- Automated Renode scripts
- Manual Wokwi verification
- Serial output checking

### Integration Tests
- Full system simulation
- Multi-component interaction
- Timing verification

### Physical Hardware Tests (Future)
- Real sensor data
- Actual timing constraints
- Power consumption
- Environmental conditions

Note: This project developed entirely in simulation.
Physical hardware testing deferred to deployment phase.
```

## **Structured Phase for Embedded**

### **TDD with Simulation**
**RED:**
```cpp
// test_temperature.cpp
TEST(TemperatureTest, ReadsValidRange) {
    float temp = readTemperature();
    EXPECT_GE(temp, -40.0);  // DHT22 min
    EXPECT_LE(temp, 80.0);   // DHT22 max
}
```
**GREEN:**
```cpp
// temperature.cpp
float readTemperature() {
    // Simulated reading
    float temp = simulatedSensor.read();

    // Clamp to valid range
    if (temp < -40.0) temp = -40.0;
    if (temp > 80.0) temp = 80.0;

    return temp;
}
```
**REFACTOR:**
```cpp
// temperature.cpp - cleaner
float readTemperature() {
    float temp = simulatedSensor.read();
    return constrain(temp, -40.0, 80.0);
}
```

### **Simulator Test Execution**
```
STEP 1: Build firmware for target:
pio run

STEP 2: Load into simulator:
- Open Wokwi
- Upload firmware.bin
- Start simulation

STEP 3: Run test sequence:
- Press button
- Change sensor values
- Observe responses

STEP 4: Verify against requirements:
- Check all acceptance criteria
- Document any deviations

STEP 5: Report test results
```

## **Platform Migration Notes**

### **Simulator to Hardware**
When eventually moving to physical hardware:
**Code Changes Needed:**
```cpp
// Change simulator-friendly delays
#ifdef SIMULATOR
    delay(100);  // Fast for testing
#else
    delay(2000); // Real sensor timing
#endif

// Add real sensor libraries
#ifndef SIMULATOR
    #include <DHT.h>
    DHT dht(DHT_PIN, DHT22);
#endif

// Handle real hardware quirks
void setup() {
    Serial.begin(115200);

    #ifndef SIMULATOR
        // Real hardware needs initialization time
        delay(1000);
    #endif

    // Rest of setup
}
```
**Testing Checklist:**
- [ ] All simulated sensors replaced with real drivers
- [ ] Timing adjusted for actual hardware
- [ ] Power consumption measured
- [ ] Environmental testing completed
- [ ] Error handling for real failures
- [ ] Edge cases from simulation verified

## **Common Simulator Issues**

### **Wokwi Specific**
**Issue: Simulation runs too fast**
```
Solution: Wokwi uses simulated time
- This is normal
- Timing ratios are preserved
- Don't use wall clock time for validation
```
**Issue: Component not responding**
```
Solution: Check wiring
- Verify connections in diagram
- Check pin numbers in code match diagram
- Ensure power and ground connected
```

### **QEMU Specific**
**Issue: Emulation is slow**
```
Solution: Reduce emulated system load
- Use lighter OS image
- Disable unnecessary services
- Increase host CPU allocation
```
**Issue: Network not working**
```
Solution: Configure user-mode networking
qemu-system-arm ... -net user,hostfwd=tcp::8080-:80
```

### **Renode Specific**
**Issue: Peripheral not found**
```
Solution: Check platform description
- Verify .repl file has peripheral
- Check peripheral is enabled
- Consult Renode documentation
```

## **When to Use Embedded Framework**
**Use this framework when developing:**
✅ Microcontroller firmware (Arduino, ESP32, STM32)
✅ Embedded Linux applications (Raspberry Pi, BeagleBone)
✅ RTOS applications (FreeRTOS, Zephyr)
✅ IoT device firmware
✅ Control systems
✅ Sensor data acquisition
✅ Motor control
✅ Communication protocols
**When simulation is sufficient:**
✅ Learning embedded development
✅ Algorithm development
✅ Proof of concept
✅ Code structure design
✅ Logic verification
✅ Protocol implementation
**When physical hardware is required:**
❌ Precise timing validation
❌ Power consumption measurement
❌ Real sensor noise handling
❌ Environmental testing
❌ Production deployment
❌ Certification/compliance testing

## **Resources**

### **Simulators**
- **Wokwi**: https://wokwi.com (Arduino, ESP32)
- **QEMU**: https://www.qemu.org (ARM, RISC-V, x86)
- **Renode**: https://renode.io (STM32, nRF52, RISC-V)
- **SimulIDE**: https://simulide.com (Arduino, AVR, PIC)
- **SimulAVR**: https://www.nongnu.org/simulavr/ (AVR only)

### **Development Environments**
- **Arduino IDE**: https://www.arduino.cc
- **PlatformIO**: https://platformio.org
- **STM32CubeIDE**: https://www.st.com (STM32)
- **ESP-IDF**: https://docs.espressif.com (ESP32)

### **Learning Resources**
- Wokwi examples: https://wokwi.com/projects
- Renode tutorials: https://renode.readthedocs.io
- QEMU documentation: https://qemu.readthedocs.io
**End of Embedded Framework**
