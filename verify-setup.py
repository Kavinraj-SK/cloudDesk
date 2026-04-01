#!/usr/bin/env python3
"""
CloudDesk Verification Script
=============================
Checks if your CloudDesk installation has everything needed for remote control.

Usage:
  python verify-setup.py
  python3 verify-setup.py
"""

import os
import sys
import subprocess
import json
import time
from pathlib import Path

class Verifier:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.warnings = 0
        self.project_root = Path(__file__).parent

    def check(self, name, condition, error_msg=""):
        """Check a condition and report status"""
        if condition:
            print(f"  ✅ {name}")
            self.passed += 1
        else:
            print(f"  ❌ {name}")
            if error_msg:
                print(f"     {error_msg}")
            self.failed += 1

    def warn(self, name, msg=""):
        """Report a warning"""
        print(f"  ⚠️  {name}")
        if msg:
            print(f"     {msg}")
        self.warnings += 1

    def run(self):
        print("""
╔═══════════════════════════════════════════════════════════╗
║        CloudDesk Setup Verification                       ║
║        Checking remote control components                 ║
╚═══════════════════════════════════════════════════════════╝
""")

        # 1. Project Structure
        print("📁 Project Structure")
        self.check(
            "Agent script exists",
            (self.project_root / "agent" / "clouddesk-agent.py").exists(),
            "Missing: agent/clouddesk-agent.py"
        )
        self.check(
            "Backend exists",
            (self.project_root / "backend" / "src" / "index.js").exists(),
            "Missing: backend/src/index.js"
        )
        self.check(
            "Frontend exists",
            (self.project_root / "frontend" / "src").exists(),
            "Missing: frontend/src"
        )
        self.check(
            "docker-compose.yml exists",
            (self.project_root / "docker-compose.yml").exists(),
            "Missing: docker-compose.yml"
        )

        # 2. Documentation
        print("\n📚 Documentation")
        self.check(
            "SETUP_GUIDE.md exists",
            (self.project_root / "SETUP_GUIDE.md").exists()
        )
        self.check(
            "REMOTE_CONTROL.md exists",
            (self.project_root / "REMOTE_CONTROL.md").exists()
        )
        self.check(
            "QUICK_REFERENCE.md exists",
            (self.project_root / "QUICK_REFERENCE.md").exists()
        )

        # 3. System Requirements
        print("\n🔧 System Requirements")

        # Python
        python_available = False
        python_cmd = None
        try:
            result = subprocess.run(["python", "--version"], capture_output=True, text=True)
            if result.returncode == 0:
                python_available = True
                python_cmd = "python"
        except:
            pass

        if not python_available:
            try:
                result = subprocess.run(["python3", "--version"], capture_output=True, text=True)
                if result.returncode == 0:
                    python_available = True
                    python_cmd = "python3"
            except:
                pass

        self.check(
            "Python installed",
            python_available,
            "Install from: https://www.python.org/downloads/"
        )

        # Docker
        docker_available = False
        try:
            result = subprocess.run(["docker", "--version"], capture_output=True, text=True)
            docker_available = (result.returncode == 0)
        except:
            pass

        self.check(
            "Docker installed",
            docker_available,
            "Install from: https://www.docker.com/products/docker-desktop"
        )

        # Docker Compose
        compose_available = False
        try:
            result = subprocess.run(["docker", "compose", "version"], capture_output=True, text=True)
            compose_available = (result.returncode == 0)
        except:
            pass

        self.check(
            "Docker Compose available",
            compose_available,
            "Install Docker Desktop or run: pip install docker-compose"
        )

        # 4. Python Dependencies
        print("\n📦 Python Dependencies")

        if python_cmd:
            try:
                result = subprocess.run(
                    [python_cmd, "-m", "pip", "show", "pyautogui"],
                    capture_output=True,
                    text=True
                )
                pyautogui_available = (result.returncode == 0)
            except:
                pyautogui_available = False

            self.check(
                "pyautogui installed",
                pyautogui_available,
                f"Install with: {python_cmd} -m pip install pyautogui"
            )
        else:
            self.warn("Can't check pyautogui", "Python not found")

        # 5. Port Availability
        print("\n🔌 Port Availability")

        def is_port_available(port):
            try:
                import socket
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(1)
                result = sock.connect_ex(("127.0.0.1", port))
                sock.close()
                return result != 0
            except:
                return True  # Assume available if can't check

        port_4000 = is_port_available(4000)
        port_5173 = is_port_available(5173)
        port_9009 = is_port_available(9009)

        if port_4000:
            self.check("Port 4000 available (backend)", True)
        else:
            self.warn("Port 4000 in use", "Something is already using port 4000")

        if port_5173:
            self.check("Port 5173 available (frontend)", True)
        else:
            self.warn("Port 5173 in use", "Something is already using port 5173")

        if port_9009:
            self.check("Port 9009 available (agent)", True)
        else:
            self.warn("Port 9009 in use", "Something is already using port 9009")

        # 6. File Content Checks
        print("\n📝 Component Integration")

        # Check backend has agent launcher
        index_js = self.project_root / "backend" / "src" / "index.js"
        if index_js.exists():
            content = index_js.read_text()
            self.check(
                "Agent launcher in backend",
                "startCloudDeskAgent" in content,
                "Missing agent auto-launcher in backend/src/index.js"
            )

        # Check SessionRoom has control handlers
        session_room = self.project_root / "frontend" / "src" / "components" / "SessionRoom.jsx"
        if session_room.exists():
            content = session_room.read_text()
            self.check(
                "Control event handlers in frontend",
                "handleMouseMove" in content,
                "Missing event handlers in SessionRoom.jsx"
            )
            self.check(
                "Agent status display in UI",
                "agentStatus" in content,
                "Missing agent status component in SessionRoom.jsx"
            )

        # 7. Launcher Scripts
        print("\n🚀 Launcher Scripts")
        self.check(
            "Windows launcher (start-clouddesk.bat)",
            (self.project_root / "start-clouddesk.bat").exists()
        )
        self.check(
            "Unix launcher (start-clouddesk.sh)",
            (self.project_root / "start-clouddesk.sh").exists()
        )

        # 8. Agent Startup Scripts
        print("\n🐍 Agent Launchers")
        self.check(
            "Node.js agent launcher",
            (self.project_root / "agent" / "start-agent.js").exists()
        )
        self.check(
            "Windows agent launcher",
            (self.project_root / "agent" / "start-agent.bat").exists()
        )
        self.check(
            "Unix agent launcher",
            (self.project_root / "agent" / "start-agent.sh").exists()
        )

        # Summary
        print(f"""
╔═══════════════════════════════════════════════════════════╗
║                     SUMMARY                               ║
╚═══════════════════════════════════════════════════════════╝

✅ Passed:   {self.passed}
❌ Failed:   {self.failed}
⚠️  Warnings: {self.warnings}

""")

        if self.failed == 0 and self.warnings == 0:
            print("🎉 All checks passed! Your CloudDesk is ready to use.")
            print("\nNext steps:")
            print("  1. Start the launcher:")
            if sys.platform == "win32":
                print("     start-clouddesk.bat")
            else:
                print("     bash start-clouddesk.sh")
            print("  2. Open http://localhost:5173 in two browser tabs")
            print("  3. Follow the on-screen instructions")
            return 0

        if self.failed > 0:
            print("⚠️  Some required components are missing or misconfigured.")
            print("See SETUP_GUIDE.md for detailed installation instructions.")
            return 1

        if self.warnings > 0:
            print("✓ All required components are present.")
            print("⚠️  Some warnings detected - see above for details.")
            return 0

    def check_agent_connectivity(self):
        """Try to connect to agent if running"""
        print("\n🔗 Agent Connectivity Check")
        try:
            import urllib.request
            response = urllib.request.urlopen("http://localhost:9009/ping", timeout=2)
            data = json.loads(response.read())
            print(f"  ✅ Agent is running on localhost:9009")
            print(f"      Screen size: {data.get('screen', 'unknown')}")
            return True
        except Exception as e:
            print(f"  ℹ️  Agent not currently running (this is OK)")
            print(f"      Start it with: python agent/clouddesk-agent.py")
            return False


if __name__ == "__main__":
    verifier = Verifier()
    exit_code = verifier.run()
    verifier.check_agent_connectivity()
    sys.exit(exit_code)
