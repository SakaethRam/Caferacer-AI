#!/usr/bin/env node

import readline from 'readline';
import { exec, spawn } from 'child_process';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const SERVER_URL = process.env.CAFERACER_SERVER_URL || 'http://localhost:5000';
const WEB_URL = process.env.CAFERACER_WEB_URL || 'https://caferacer-nu.vercel.app';

function openBrowser(url) {
  const start =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
      ? 'start'
      : 'xdg-open';
  exec(`${start} "${url}"`);
}

async function checkServerHealth() {
  return new Promise((resolve) => {
    const req = http.get(`${SERVER_URL}/api/health`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.end();
  });
}

function startServerIfNeeded() {
  return new Promise((resolve) => {
    checkServerHealth().then((isAlive) => {
      if (isAlive) {
        resolve();
        return;
      }

      console.log('Starting CafeRacer server engine...');
      const child = spawn('npm', ['run', 'dev:server'], {
        cwd: PROJECT_ROOT,
        shell: true,
        stdio: 'ignore',
        detached: true,
      });
      child.unref();

      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        const ready = await checkServerHealth();
        if (ready || attempts > 20) {
          clearInterval(interval);
          resolve();
        }
      }, 500);
    });
  });
}

async function postJSON(endpoint, body) {
  const url = `${SERVER_URL}${endpoint}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

function promptInteractive() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('\n======================================================');
  console.log('            WELCOME TO CAFERACER CLI                  ');
  console.log('======================================================\n');
  console.log('Select source to analyze:\n');
  console.log('  1) Github Repo');
  console.log('  2) Root (Current Directory)\n');

  return new Promise((resolve) => {
    const askChoice = () => {
      rl.question('> ', (answer) => {
        const trimmed = answer.trim();
        if (trimmed === '1' || trimmed.toLowerCase().includes('github')) {
          rl.close();
          resolve({ choice: 'github' });
        } else if (trimmed === '2' || trimmed === '' || trimmed.toLowerCase() === 'root') {
          rl.close();
          resolve({ choice: 'root' });
        } else {
          console.log('Invalid choice. Please enter 1 or 2.');
          askChoice();
        }
      });
    };
    askChoice();
  });
}

async function main() {
  await startServerIfNeeded();

  const { choice } = await promptInteractive();

  if (choice === 'github') {
    // Option 1: Directly opens web browser, redirecting to /caferacer-console step 01 (REPO)
    const targetUrl = `${WEB_URL}/caferacer-console?step=repo`;
    console.log('\nOpening CafeRacer Step 01 (REPO) in browser...\n');
    console.log(`→ ${targetUrl}\n`);
    openBrowser(targetUrl);
    return;
  }

  // Option 2: Root (Current Directory) — Step 02 auto-run in terminal CLI
  const cwd = process.cwd();
  console.log(`\n[STEP 02 ANALYZE] Parsing AST and extracting dependency graph from: ${cwd}`);
  console.log('Running ingestion engine...');

  let repoId = '';
  try {
    const data = await postJSON('/api/repo/ingest-local', { path: cwd });
    repoId = data.repoId;
  } catch (err) {
    console.error(`\n✖ Ingestion failed: ${err.message}`);
    process.exit(1);
  }

  console.log('\n✓ Step 02 Complete: AST symbols extracted');
  console.log('✓ Step 02 Complete: 5-Node semantic classification ready');
  console.log('✓ Step 02 Complete: Dependency graph generated\n');

  // Launch directly to Step 03 UNDERSTAND display UI
  const targetAppUrl = `${WEB_URL}/caferacer-console?repoId=${encodeURIComponent(repoId)}&step=understand`;
  console.log('Directing to Step 03 (UNDERSTAND) Display UI...\n');
  console.log(`→ ${targetAppUrl}\n`);

  openBrowser(targetAppUrl);
}

main().catch((err) => {
  console.error('CLI Error:', err);
  process.exit(1);
});
