#!/usr/bin/env node
/**
 * CloudDesk Agent Launcher
 * ========================
 * This script starts the Python agent (clouddesk-agent.py) as a child process
 * It's used by the backend to auto-launch the agent on startup.
 * 
 * Usage:
 *   node agent/start-agent.js     # Start and keep running
 *   node -e "require('./agent/start-agent.js')" # Require from another script
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const AGENT_PORT = 9009;
const AGENT_SCRIPT = path.join(__dirname, 'clouddesk-agent.py');
const MAX_RETRIES = 3;
let retryCount = 0;
let agentProcess = null;

function checkPythonAvailable() {
  return new Promise((resolve) => {
    const proc = spawn('python', ['--version'], {
      stdio: 'pipe',
      shell: true
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(true);
      } else {
        // Try python3
        const proc3 = spawn('python3', ['--version'], {
          stdio: 'pipe',
          shell: true
        });
        proc3.on('close', (code) => {
          resolve(code === 0);
        });
      }
    });
  });
}

function getPythonCommand() {
  // Try python first, then python3
  const proc = spawn('where' in process ? 'where' : 'which', ['python'], {
    stdio: 'pipe',
    shell: true
  });
  
  return new Promise((resolve) => {
    let found = false;
    proc.stdout.on('data', () => {
      found = true;
      resolve('python');
    });
    
    proc.on('close', () => {
      if (!found) {
        resolve('python3');
      }
    });
    
    setTimeout(() => resolve('python3'), 500);
  });
}

async function startAgent() {
  console.log('[CloudDesk Agent Launcher] Checking Python installation...');
  
  const pythonAvailable = await checkPythonAvailable();
  if (!pythonAvailable) {
    console.error('[CloudDesk Agent] ❌ Python not found!');
    console.error('Install Python from: https://www.python.org/downloads/');
    console.error('(Make sure to add Python to PATH during installation)');
    process.exit(1);
  }

  const pythonCmd = await getPythonCommand();
  console.log(`[CloudDesk Agent Launcher] Using: ${pythonCmd}`);

  // Check if pyautogui is installed
  console.log('[CloudDesk Agent Launcher] Checking pyautogui installation...');
  const checkDeps = spawn(pythonCmd, ['-m', 'pip', 'show', 'pyautogui'], {
    stdio: 'pipe',
    shell: true
  });

  checkDeps.on('close', (code) => {
    if (code !== 0) {
      console.warn('[CloudDesk Agent Launcher] ⚠️  pyautogui not found');
      console.log('[CloudDesk Agent Launcher] Installing dependencies...');
      const install = spawn(pythonCmd, ['-m', 'pip', 'install', 'pyautogui', '-q'], {
        stdio: 'inherit',
        shell: true
      });

      install.on('close', (installCode) => {
        if (installCode === 0) {
          console.log('[CloudDesk Agent Launcher] ✓ Dependencies installed');
          launchAgent();
        } else {
          console.error('[CloudDesk Agent Launcher] Failed to install dependencies');
          console.error('Manually run: python -m pip install pyautogui');
          process.exit(1);
        }
      });
    } else {
      launchAgent();
    }
  });

  function launchAgent() {
    if (!fs.existsSync(AGENT_SCRIPT)) {
      console.error(`[CloudDesk Agent] Script not found: ${AGENT_SCRIPT}`);
      process.exit(1);
    }

    console.log(`[CloudDesk Agent Launcher] Starting agent on port ${AGENT_PORT}...`);
    
    agentProcess = spawn(pythonCmd, [AGENT_SCRIPT], {
      stdio: ['ignore', 'inherit', 'inherit'],
      detached: false,
      shell: true
    });

    agentProcess.on('error', (err) => {
      console.error('[CloudDesk Agent] Spawn error:', err.message);
      handleAgentExit();
    });

    agentProcess.on('exit', (code, signal) => {
      console.error(`[CloudDesk Agent] Exited with code ${code} (signal: ${signal})`);
      handleAgentExit();
    });

    // Keep the launcher running
    if (process.stdin) {
      process.stdin.resume();
    }
  }
}

function handleAgentExit() {
  retryCount++;
  if (retryCount < MAX_RETRIES) {
    console.log(`[CloudDesk Agent Launcher] Retrying... (${retryCount}/${MAX_RETRIES})`);
    setTimeout(startAgent, 2000);
  } else {
    console.error('[CloudDesk Agent Launcher] Max retries reached. Giving up.');
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[CloudDesk Agent Launcher] Stopping agent...');
  if (agentProcess) {
    agentProcess.kill();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  if (agentProcess) {
    agentProcess.kill();
  }
  process.exit(0);
});

// Start the agent
startAgent().catch((err) => {
  console.error('[CloudDesk Agent Launcher] Fatal error:', err);
  process.exit(1);
});
