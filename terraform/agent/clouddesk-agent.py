#!/usr/bin/env python3
"""
CloudDesk Local Agent v2.0
===========================
Reliable remote control agent for CloudDesk.
Listens on http://localhost:9009 and injects OS-level input.

Based on AnyDesk's agent pattern — proven, simple, reliable.

Installation:
  pip install pyautogui keyboard mouse

Usage:
  python3 clouddesk-agent.py
"""

import sys
import json
import platform
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

# Try to import dependencies
try:
    import pyautogui
    pyautogui.FAILSAFE = False
    pyautogui.PAUSE = 0.0
except ImportError:
    print("[Agent] ERROR: pyautogui not found")
    print("  pip install pyautogui")
    sys.exit(1)

# Optional: use pynput for better keyboard handling on some systems
try:
    from pynput.keyboard import Controller, Key
    from pynput.mouse import Controller as MouseController
    HAS_PYNPUT = True
except ImportError:
    HAS_PYNPUT = False

PORT         = 9009
SCREEN_W, SCREEN_H = pyautogui.size()
PLATFORM = platform.system()

# Button mapping
BUTTON_MAP = {0: 'left', 1: 'middle', 2: 'right'}

# Key name mapping (JS → pyautogui)
KEY_MAP = {
    'ArrowLeft': 'left', 'ArrowRight': 'right', 'ArrowUp': 'up', 'ArrowDown': 'down',
    'Enter': 'enter', 'Escape': 'esc', 'Backspace': 'backspace', 'Delete': 'delete',
    'Tab': 'tab', 'CapsLock': 'capslock', ' ': 'space',
    'Insert': 'insert', 'Home': 'home', 'End': 'end', 'PageUp': 'pageup', 'PageDown': 'pagedown',
    'F1': 'f1', 'F2': 'f2', 'F3': 'f3', 'F4': 'f4', 'F5': 'f5', 'F6': 'f6', 'F7': 'f7',
    'F8': 'f8', 'F9': 'f9', 'F10': 'f10', 'F11': 'f11', 'F12': 'f12',
    'Control': 'ctrl', 'Shift': 'shift', 'Alt': 'alt', 'Meta': 'cmd' if PLATFORM == 'Darwin' else 'win',
}

def to_pixels(x_frac, y_frac):
    """Normalize 0-1 coords to screen pixels."""
    return int(x_frac * SCREEN_W), int(y_frac * SCREEN_H)

def map_key(js_key):
    """Map JS key name to pyautogui name."""
    return KEY_MAP.get(js_key, js_key.lower() if len(js_key) == 1 else None)

def handle_control(data):
    """Process remote control event (no exceptions escape)."""
    try:
        event_type = data.get('type', '')
        event_name = data.get('event', '')
        
        if not event_type:
            print('[Agent] Error: Missing event type')
            return
        
        # MOUSE EVENTS
        if event_type == 'mouse':
            x, y = to_pixels(data.get('x', 0), data.get('y', 0))
            btn = BUTTON_MAP.get(data.get('button', 0), 'left')
            
            if event_name == 'move':
                pyautogui.moveTo(x, y, duration=0)
            elif event_name == 'click':
                # Click at position with proper timing
                pyautogui.moveTo(x, y, duration=0)
                pyautogui.click(button=btn, clicks=1)
            elif event_name == 'mousedown':
                pyautogui.moveTo(x, y, duration=0)
                pyautogui.mouseDown(button=btn)
            elif event_name == 'mouseup':
                pyautogui.mouseUp(button=btn)
        
        # SCROLL EVENTS
        elif event_type == 'scroll':
            dy = data.get('deltaY', 0)
            dx = data.get('deltaX', 0)
            if dy != 0:
                # Normalize scroll: 120 units per scroll wheel click
                scroll_amount = max(-3, min(3, -int(dy / 120)))
                pyautogui.scroll(scroll_amount)
            if dx != 0:
                scroll_amount = max(-3, min(3, -int(dx / 120)))
                pyautogui.hscroll(scroll_amount)
        
        # KEYBOARD EVENTS
        elif event_type == 'key':
            key = data.get('key', '')
            key_name = map_key(key)
            if not key_name:
                return
            
            mods = data.get('modifiers', {})
            mod_list = []
            if mods.get('ctrl'): mod_list.append('ctrl')
            if mods.get('alt'): mod_list.append('alt')
            if mods.get('shift'): mod_list.append('shift')
            if mods.get('meta'): mod_list.append('cmd' if PLATFORM == 'Darwin' else 'win')
            
            if event_name == 'keydown':
                if mod_list:
                    pyautogui.hotkey(*mod_list, key_name)
                else:
                    pyautogui.press(key_name)
            elif event_name == 'keyup':
                pass  # pyautogui handles this automatically
        
        # TOUCH EVENTS (convert to mouse)
        elif event_type == 'touch':
            x, y = to_pixels(data.get('x', 0), data.get('y', 0))
            if event_name == 'touchstart':
                pyautogui.moveTo(x, y, duration=0)
                pyautogui.mouseDown(button='left')
            elif event_name == 'touchmove':
                pyautogui.moveTo(x, y, duration=0)
            elif event_name == 'touchend':
                pyautogui.mouseUp(button='left')
        
        else:
            print(f'[Agent] Unknown event type: {event_type}')
    
    except Exception as e:
        print(f'[Agent] Event error: {type(e).__name__}: {e}')


# ── HTTP Server ───────────────────────────────────────────────────────────────

class AgentHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # Silent HTTP logs

    def _send(self, status, data):
        """Send JSON response."""
        if isinstance(data, dict):
            body = json.dumps(data).encode()
        else:
            body = data.encode() if isinstance(data, str) else data
        
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send(204, b'')

    def do_GET(self):
        if self.path == '/ping':
            self._send(200, {'status': 'ok', 'screen': [SCREEN_W, SCREEN_H], 'platform': PLATFORM})
        else:
            self._send(404, {'error': 'Not found'})

    def do_POST(self):
        if self.path == '/control':
            try:
                length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(length)
                event = json.loads(body)
                handle_control(event)
                self._send(200, {'status': 'ok'})
            except json.JSONDecodeError:
                self._send(400, {'error': 'Invalid JSON'})
            except Exception as e:
                self._send(500, {'error': str(e)})
        else:
            self._send(404, {'error': 'Not found'})


def main():
    """Start the agent server."""
    banner = f"""
╔══════════════════════════════════════════════════╗
║       CloudDesk Local Agent v2.0 Running        ║
╠══════════════════════════════════════════════════╣
║  URL:          http://127.0.0.1:{PORT}           ║
║  Screen:       {SCREEN_W} × {SCREEN_H} px          ║
║  Platform:     {PLATFORM.upper()}                        ║
║                                                  ║
║  Listening for remote control events...        ║
║  Press Ctrl+C to stop                          ║
╚══════════════════════════════════════════════════╝
"""
    print(banner)
    
    try:
        server = HTTPServer(('127.0.0.1', PORT), AgentHandler)
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n[Agent] Stopped by user')
    except Exception as e:
        print(f'\n[Agent] Error: {e}')
    finally:
        try:
            server.server_close()
        except:
            pass


if __name__ == '__main__':
    main()