# CloudDesk Remote Control Implementation

## Overview

CloudDesk implements **full remote control** similar to AnyDesk, allowing a viewer to control the host's mouse, keyboard, and touch inputs. This document explains the architecture and implementation.

---

## Architecture

```
┌─────────────────────────────┐
│  VIEWER'S BROWSER           │
│  (React Component: Viewer)  │
│                             │
│  ┌─────────────────────┐    │
│  │ Mouse/Keyboard/     │    │
│  │ Touch Event         │    │
│  │ Handlers            │    │
│  └──────────┬──────────┘    │
└─────────────┼────────────────┘
              │
              │ sendControlEvent()
              │ [WebRTC DataChannel]
              ▼
┌─────────────────────────────┐
│  HOST'S BROWSER             │
│  (React Component: Host)    │
│                             │
│  ┌─────────────────────┐    │
│  │ onDataMessage()     │    │
│  │ Handler             │    │
│  └──────────┬──────────┘    │
└─────────────┼────────────────┘
              │
              │ POST /control (JSON)
              │ [HTTP to localhost:9009]
              ▼
┌──────────────────────────────────────┐
│  LOCAL AGENT                         │
│  (Python: clouddesk-agent.py)        │
│  Listens on localhost:9009           │
│                                      │
│  ┌──────────────────────────────┐   │
│  │ handle_control(data)         │   │
│  │                              │   │
│  │ - Parse event type           │   │
│  │ - Execute OS-level input:    │   │
│  │   • pyautogui.moveTo()       │   │
│  │   • pyautogui.click()        │   │
│  │   • pyautogui.keyDown()      │   │
│  │   • pyautogui.scroll()       │   │
│  └──────────────────────────────┘   │
└──────────────────────────────────────┘
              │
              ▼
        [Host's OS]
        - Cursor movement
        - Clicks
        - Key presses
        - Scroll wheel
```

---

## Components & Files

### Frontend (React)

#### [SessionRoom.jsx](../frontend/src/components/SessionRoom.jsx)

**Viewer Side (role === 'viewer')**:
```javascript
// Input event handlers
handleMouseMove()    // e.clientX, e.clientY → normalized {x, y}
handleMouseClick()   // mouse button + coords
handleMouseDown()    // mousedown event
handleMouseUp()      // mouseup event
handleWheel()        // deltaX, deltaY
handleKeyDown()      // key code + modifiers (ctrl, shift, alt, meta)
handleKeyUp()        // key release
handleTouchStart()   // touch with double-tap detection for right-click
handleTouchMove()    // touch movement
handleTouchEnd()     // touch release
```

Each handler:
1. Checks if `controlEnabled` is true
2. Gets relative position (0–1) from video element
3. Calls `sendControlEvent()` with structured event data

**Host Side (role === 'host')**:
```javascript
onDataMessage(data) {
    // 1. Forward to local agent via HTTP
    fetch('http://localhost:9009/control', {
        method: 'POST',
        body: JSON.stringify(data)
    })
    
    // 2. Update virtual cursor position (show where viewer is clicking)
    setVirtualCursor({ x: data.x * 100, y: data.y * 100 })
    
    // 3. Log control action for visual feedback
    setControlLog(`🖱 click (btn ${data.button})`)
}
```

#### [useWebRTC.js](../frontend/src/hooks/useWebRTC.js)

**Data Channels**:
```javascript
// Create two channels for different reliability needs:

// 1. 'control' channel (reliable, ordered)
const dc = pc.createDataChannel('control', { ordered: true })
// For: clicks, keypresses, scroll (must not be lost)

// 2. 'mouse-move' channel (unreliable, no retransmit)
const dcMove = pc.createDataChannel('mouse-move', { 
    ordered: false, 
    maxRetransmits: 0 
})
// For: mouse movements only (stale packets dropped automatically)
// This prevents cursor movement lag
```

**Viewer: sendControlEvent()**:
```javascript
sendControlEvent(eventData) {
    // Choose channel based on event type
    const isMove = eventData.type === 'mouse' && eventData.event === 'move'
    const channel = isMove ? dataMoveChannelRef : dataChannelRef
    
    if (channel?.readyState === 'open') {
        channel.send(JSON.stringify(eventData))
    }
}
```

### Backend (Node.js)

#### [index.js](../backend/src/index.js)

**Auto-launch Local Agent**:
```javascript
function startCloudDeskAgent() {
    const agentScript = path.join(__dirname, '../../agent/clouddesk-agent.py')
    
    // Spawn Python process
    agentProcess = spawn('python', [agentScript], {
        stdio: ['ignore', 'inherit', 'inherit']
    })
    
    agentProcess.on('error', (err) => {
        console.warn('[CloudDesk Agent] Failed:', err.message)
    })
}

// Called when backend starts
startCloudDeskAgent()
```

**Agent Status Endpoint**:
```javascript
app.get('/agent-status', async (req, res) => {
    try {
        const response = await fetch('http://localhost:9009/ping')
        res.json({ status: 'online', agent: data })
    } catch (err) {
        res.status(503).json({ status: 'offline' })
    }
})
```

### Local Agent (Python)

#### [clouddesk-agent.py](../agent/clouddesk-agent.py)

**HTTP Server** (listens on `localhost:9009`):
```python
def do_POST():
    if path == '/control':
        data = json.loads(request.body)
        handle_control(data)  # Execute OS input
```

**Event Handlers**:

**Mouse Events**:
```python
if data['type'] == 'mouse':
    x, y = fraction_to_pixels(data['x'], data['y'])
    button = BUTTON_MAP.get(data['button'], 'left')
    
    if data['event'] == 'move':
        pyautogui.moveTo(x, y, duration=0)
    elif data['event'] == 'click':
        pyautogui.click(x, y, button=button)
    elif data['event'] == 'mousedown':
        pyautogui.mouseDown(x, y, button=button)
    elif data['event'] == 'mouseup':
        pyautogui.mouseUp(button=button)
```

**Keyboard Events**:
```python
if data['type'] == 'key':
    key_name = KEY_MAP.get(data['key'], data['key'].lower())
    
    # Build hotkey list (ctrl, alt, shift, meta)
    hotkeys = ['ctrl', 'alt', 'shift', 'win'] (filtered from modifiers)
    
    if data['event'] == 'keydown':
        if hotkeys:
            pyautogui.hotkey(*hotkeys, key_name)
        else:
            pyautogui.keyDown(key_name)
    
    elif data['event'] == 'keyup':
        if hotkeys:
            # Release in reverse order
            for k in reversed(hotkeys + [key_name]):
                pyautogui.keyUp(k)
        else:
            pyautogui.keyUp(key_name)
```

**Scroll Events**:
```python
if data['type'] == 'scroll':
    clicks = -int(data['deltaY'] / 100)  # Normalize browser deltaY
    pyautogui.scroll(clicks)
```

**Touch Events** (treated as mouse):
```python
if data['type'] == 'touch':
    x, y = fraction_to_pixels(data['x'], data['y'])
    
    if data['event'] == 'touchstart':
        pyautogui.mouseDown(x, y, button='left')
    elif data['event'] == 'touchmove':
        pyautogui.moveTo(x, y)
    elif data['event'] == 'touchend':
        pyautogui.mouseUp(button='left')
```

---

## Event Data Format

**Mouse Event**:
```json
{
  "type": "mouse",
  "event": "move|click|mousedown|mouseup",
  "x": 0.5,
  "y": 0.3,
  "button": 0
}
```

**Keyboard Event**:
```json
{
  "type": "key",
  "event": "keydown|keyup",
  "key": "a",
  "code": "KeyA",
  "modifiers": {
    "ctrl": false,
    "alt": false,
    "shift": false,
    "meta": false
  }
}
```

**Scroll Event**:
```json
{
  "type": "scroll",
  "event": "wheel",
  "deltaX": 0,
  "deltaY": 100
}
```

**Touch Event**:
```json
{
  "type": "touch",
  "event": "touchstart|touchmove|touchend",
  "x": 0.5,
  "y": 0.3,
  "touches": 1
}
```

---

## Data Flow Example: Remote Click

1. **Viewer clicks** on remote video at point (500px, 300px)
   ```
   video.getBoundingClientRect() = { left: 100, top: 100, width: 800, height: 600 }
   relativePos = { x: (500-100)/800 = 0.5, y: (300-100)/600 = 0.333 }
   ```

2. **sendControlEvent() called** with:
   ```json
   { "type": "mouse", "event": "click", "x": 0.5, "y": 0.333, "button": 0 }
   ```

3. **WebRTC DataChannel** sends JSON to host

4. **Host's onDataMessage()** receives event:
   ```javascript
   fetch('http://localhost:9009/control', {
       method: 'POST',
       body: JSON.stringify(event)
   })
   ```

5. **Local agent** parses event:
   ```
   x_frac = 0.5, y_frac = 0.333
   screen_width = 1920, screen_height = 1080
   pixel_x = 0.5 × 1920 = 960
   pixel_y = 0.333 × 1080 = 360
   button = 'left'
   ```

6. **pyautogui.click()** executes on host OS:
   ```python
   pyautogui.click(960, 360, button='left')
   ```

7. **Host's cursor moves** and clicks at (960, 360)

---

## Key Design Decisions

### 1. **Two Data Channels**

- **'control' channel**: Reliable, ordered delivery
  - Used for: clicks, keystrokes, scroll
  - Critical — must not be lost
  - TCP-like: retransmitted if lost

- **'mouse-move' channel**: Unreliable, best-effort
  - Used for: mouse position updates (60fps)
  - Can drop old packets
  - UDP-like: never retransmitted
  - **Why?** Prevents laggy cursor when move events back up

### 2. **Relative Coordinates (0–1)**

- Viewer sends `x` and `y` as **fractions** (0.0 to 1.0)
- Agent converts to **absolute screen pixels** using `pyautogui.size()`
- **Why?** Works with any screen resolution without hardcoding

### 3. **Touch = Mouse**

- Mobile touches converted to mouse events
- Double-tap detected for right-click simulation
- **Why?** Simple, consistent behavior across devices

### 4. **Hotkey Handling**

- Browser sends `modifiers: { ctrl, alt, shift, meta }`
- Agent expands to `pyautogui.hotkey('ctrl', 'shift', 'a')`
- **Why?** Transparent keyboard shortcuts (Ctrl+C, Alt+Tab, Cmd+Q)

### 5. **Local Agent Only**

- Agent runs on **host machine only** (localhost:9009)
- Not exposed to internet
- **Why?** Security + simplicity (no network overhead)

---

## Performance Optimizations

### Throttling

**Mouse Move** (60fps max):
```javascript
if (pendingMoveRef.current) {
    cancelAnimationFrame(pendingMoveRef.current)
}
pendingMoveRef.current = requestAnimationFrame(() => {
    sendControlEvent({ type: 'mouse', event: 'move', ...pos })
})
```
- Sends move events at most once per frame (~16ms)
- Prevents flooding WebRTC data channel

### Coordinate Deduplication

```javascript
const last = lastMovePos.current
if (last && last.x === pos.x && last.y === pos.y) return
lastMovePos.current = pos
```
- Skip sending if cursor didn't actually move
- Reduces bandwidth

### pyautogui Settings

```python
pyautogui.FAILSAFE = False   # Don't abort on corner
pyautogui.PAUSE = 0.0        # No per-action delay
# Throttling done on sender side instead
```

### Unreliable Channel for Moves

- Old mouse move packets automatically dropped by WebRTC
- New move packets don't wait for old ones to be delivered
- Feels instant instead of adding delay

---

## Troubleshooting Guide

### Agent Not Starting

**Symptoms**:
- "Agent: Not running" (yellow indicator)
- Remote control doesn't work

**Solutions**:
1. Check Python installation: `python --version`
2. Install pyautogui: `pip install pyautogui`
3. Start agent manually: `python agent/clouddesk-agent.py`
4. Check port 9009 not in use: `netstat -ano | findstr :9009`

### Clicks Work, Keys Don't

**Possible Issues**:
1. Video element not focused — **click the video first**
2. Modifiers not matching system — check keyboard layout
3. Key not in KEY_MAP — simple keys should work first

**Debug**:
```javascript
// In SessionRoom.jsx onDataMessage
console.log('[Control] Received:', data)
// Should see key events logged
```

### Mouse Movements Laggy

**Cause**: Old move packets being retransmitted

**Fix**: Already implemented — mouse-move channel has `maxRetransmits: 0`

### macOS: "Permission denied"

**Cause**: macOS requires accessibility permission for pyautogui

**Fix**:
1. Open System Preferences → Security & Privacy → Accessibility
2. Add Terminal (or your IDE) to the allowed list
3. Restart agent

---

## Testing

### Manual Test: Browser Console

```javascript
// Direct channel send (if you have pcRef access)
const event = {
    type: 'mouse',
    event: 'move',
    x: 0.5,
    y: 0.5
}
dataChannelRef.current.send(JSON.stringify(event))
```

### Agent Test: curl

```bash
# Check agent is listening
curl http://localhost:9009/ping

# Send a test click
curl -X POST http://localhost:9009/control \
  -H "Content-Type: application/json" \
  -d '{"type":"mouse","event":"click","x":0.5,"y":0.5,"button":0}'
```

### Integration Test: Full Flow

1. Start backend: `npm run dev`
2. Start agent: `python agent/clouddesk-agent.py`
3. Start frontend: `npm run dev` (in frontend dir)
4. Open in two browser windows
5. Connect → accept
6. Click "Control ON" on viewer
7. Try clicking, typing, scrolling on remote screen

---

## Future Improvements

- [ ] **Clipboard Integration**: Copy/paste between systems
- [ ] **File Transfer**: Drag & drop files to remote
- [ ] **Double-click Detection**: Separate from single-click
- [ ] **Gesture Recognition**: Multi-touch gestures (pinch, rotate)
- [ ] **Cursor Image Sync**: Show remote cursor shape
- [ ] **IME Support**: Better input method support for non-Latin scripts
- [ ] **Audio Feedback**: Server-side confirmation of received events
- [ ] **Rate Limiting**: Protect against abuse
- [ ] **Permission Granularity**: Allow certain actions only (no delete, etc.)

---

## References

- [pyautogui documentation](https://pyautogui.readthedocs.io/)
- [WebRTC DataChannel API](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel)
- [Keyboard Events](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent)
- [Mouse Events](https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent)
- [Touch Events](https://developer.mozilla.org/en-US/docs/Web/API/Touch_events)
