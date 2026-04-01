#!/usr/bin/env python3
"""
CloudDesk Local Agent
=====================
Runs on the HOST machine and listens on http://localhost:9009.
The browser (SessionRoom.jsx host side) POSTs control events here;
this agent translates them into real OS mouse/keyboard input using pyautogui.

This is the same pattern AnyDesk uses — a lightweight background service
that bridges browser-level WebRTC data with OS-level input injection.

Usage
-----
  pip install pyautogui flask flask-cors
  python clouddesk-agent.py

Windows users: pip install pyautogui flask flask-cors pywin32
macOS users  : grant Accessibility permission to Terminal in System Prefs
"""

import sys
import json
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

try:
    import pyautogui
except ImportError:
    print("[CloudDesk Agent] ERROR: pyautogui not found.")
    print("  Install it with:  pip install pyautogui")
    sys.exit(1)

# ── pyautogui safety settings ───────────────────────────────────────────────
pyautogui.FAILSAFE   = False   # Don't abort when cursor hits corner
pyautogui.PAUSE      = 0.0     # No inter-action delay (we throttle on the sender side)

PORT         = 9009
SCREEN_W, SCREEN_H = pyautogui.size()

# Map browser button index → pyautogui button name
BUTTON_MAP = {0: 'left', 1: 'middle', 2: 'right'}

# Map JS KeyboardEvent.key values that need special treatment
KEY_MAP = {
    'ArrowLeft':  'left',    'ArrowRight': 'right',
    'ArrowUp':    'up',      'ArrowDown':  'down',
    'Enter':      'enter',   'Escape':     'esc',
    'Backspace':  'backspace','Delete':     'delete',
    'Tab':        'tab',     'CapsLock':   'capslock',
    'Control':    'ctrl',    'Shift':      'shift',
    'Alt':        'alt',     'Meta':       'win',
    'Insert':     'insert',  'Home':       'home',
    'End':        'end',     'PageUp':     'pageup',
    'PageDown':   'pagedown','F1':         'f1',
    'F2':         'f2',      'F3':         'f3',
    'F4':         'f4',      'F5':         'f5',
    'F6':         'f6',      'F7':         'f7',
    'F8':         'f8',      'F9':         'f9',
    'F10':        'f10',     'F11':        'f11',
    'F12':        'f12',     ' ':          'space',
}


def fraction_to_pixels(x_frac, y_frac):
    """Convert 0–1 normalised coordinates to absolute screen pixels."""
    return int(x_frac * SCREEN_W), int(y_frac * SCREEN_H)


def handle_control(data):
    """Execute one control event on the OS."""
    t = data.get('type')
    ev = data.get('event')

    try:
        # ── Mouse ────────────────────────────────────────────────────────────
        if t == 'mouse':
            px, py = fraction_to_pixels(data.get('x', 0), data.get('y', 0))
            btn    = BUTTON_MAP.get(data.get('button', 0), 'left')

            if ev == 'move':
                pyautogui.moveTo(px, py, duration=0, _pause=False)

            elif ev == 'mousedown':
                pyautogui.mouseDown(px, py, button=btn, _pause=False)

            elif ev == 'mouseup':
                pyautogui.mouseUp(px, py, button=btn, _pause=False)

            elif ev == 'click':
                pyautogui.click(px, py, button=btn, _pause=False)

        # ── Scroll ───────────────────────────────────────────────────────────
        elif t == 'scroll':
            delta_y = data.get('deltaY', 0)
            delta_x = data.get('deltaX', 0)
            # pyautogui scroll: positive = up, negative = down
            if delta_y != 0:
                clicks = -int(delta_y / 100)   # normalise browser deltaY (px) → clicks
                pyautogui.scroll(clicks, _pause=False)
            if delta_x != 0:
                clicks = -int(delta_x / 100)
                pyautogui.hscroll(clicks, _pause=False)

        # ── Keyboard ─────────────────────────────────────────────────────────
        elif t == 'key':
            raw_key  = data.get('key', '')
            key_name = KEY_MAP.get(raw_key, raw_key.lower() if len(raw_key) == 1 else None)
            if not key_name:
                return  # Unrecognised key — skip safely

            mods    = data.get('modifiers', {})

            if ev == 'keydown':
                # For keydown with modifiers, press each modifier then the main key
                if mods.get('ctrl'):  pyautogui.keyDown('ctrl', _pause=False)
                if mods.get('alt'):   pyautogui.keyDown('alt', _pause=False)
                if mods.get('shift'): pyautogui.keyDown('shift', _pause=False)
                if mods.get('meta'):  pyautogui.keyDown('win', _pause=False)
                pyautogui.keyDown(key_name, _pause=False)

            elif ev == 'keyup':
                # Release the main key first, then release modifiers
                pyautogui.keyUp(key_name, _pause=False)
                if mods.get('meta'):  pyautogui.keyUp('win', _pause=False)
                if mods.get('shift'): pyautogui.keyUp('shift', _pause=False)
                if mods.get('alt'):   pyautogui.keyUp('alt', _pause=False)
                if mods.get('ctrl'):  pyautogui.keyUp('ctrl', _pause=False)

        # ── Touch (mobile controller → treat as mouse) ────────────────────
        elif t == 'touch':
            px, py = fraction_to_pixels(data.get('x', 0), data.get('y', 0))

            if ev == 'touchstart':
                pyautogui.mouseDown(px, py, button='left', _pause=False)
            elif ev == 'touchmove':
                pyautogui.moveTo(px, py, duration=0, _pause=False)
            elif ev == 'touchend':
                pyautogui.mouseUp(button='left', _pause=False)

    except Exception as exc:
        # Never crash the agent on a bad event
        print(f'[Agent] Event error ({t}/{ev}): {exc}')


# ── HTTP Server ───────────────────────────────────────────────────────────────

class AgentHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass   # Suppress default access log noise

    def _send(self, code, body='OK'):
        encoded = body.encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(encoded)))
        # Allow requests from any localhost origin (the browser tab)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(encoded)

    def do_OPTIONS(self):
        """CORS preflight"""
        self._send(204, '')

    def do_GET(self):
        path = urlparse(self.path).path
        if path == '/ping':
            self._send(200, json.dumps({'status': 'ok', 'screen': [SCREEN_W, SCREEN_H]}))
        else:
            self._send(404, json.dumps({'error': 'not found'}))

    def do_POST(self):
        path = urlparse(self.path).path
        if path == '/control':
            length = int(self.headers.get('Content-Length', 0))
            body   = self.rfile.read(length)
            try:
                data = json.loads(body)
                # Execute in the calling thread — fast enough for input events
                handle_control(data)
                self._send(200, json.dumps({'ok': True}))
            except Exception as exc:
                self._send(400, json.dumps({'error': str(exc)}))
        else:
            self._send(404, json.dumps({'error': 'not found'}))


def run():
    print(f"""
╔══════════════════════════════════════════════════╗
║          CloudDesk Local Agent  v1.0             ║
╠══════════════════════════════════════════════════╣
║  Listening on  http://localhost:{PORT}              ║
║  Screen size   {SCREEN_W} × {SCREEN_H}              {"" if SCREEN_W >= 1000 else " "}║
║                                                  ║
║  The CloudDesk browser tab will forward          ║
║  mouse & keyboard events here and this agent     ║
║  will execute them on your OS.                   ║
║                                                  ║
║  Press Ctrl+C to stop.                           ║
╚══════════════════════════════════════════════════╝
""")
    server = HTTPServer(('127.0.0.1', PORT), AgentHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n[CloudDesk Agent] Stopped.')
        server.server_close()


if __name__ == '__main__':
    run()