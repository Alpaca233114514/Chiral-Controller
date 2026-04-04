#!/usr/bin/env node
/**
 * Chiral Controller - Unified Dev Server
 * 同时启动 MCP Server 和 Web Client
 * 
 * Usage: node start.js
 */

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const net = require('net');
const fs = require('fs');

const PROJECT_ROOT = __dirname;
const SKILL_DIR = path.join(PROJECT_ROOT, 'skill');
const MOBILE_DIR = path.join(PROJECT_ROOT, 'mobile');

// 获取本机 IP
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

// 检查端口是否被占用
function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port);
  });
}

// 检查 node_modules
function checkDeps(dir) {
  return fs.existsSync(path.join(dir, 'node_modules'));
}

// 安装依赖
function installDeps(dir, name) {
  console.log(`[INFO] Installing ${name} deps...`);
  return new Promise((resolve, reject) => {
    const npm = spawn('npm', ['install'], {
      cwd: dir,
      stdio: 'inherit',
      shell: true
    });
    npm.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`npm install failed with code ${code}`));
    });
  });
}

// 启动服务
function startService(dir, name, port) {
  console.log(`Starting ${name}...`);
  
  const proc = spawn('npm', ['run', 'dev'], {
    cwd: dir,
    stdio: 'pipe',
    shell: true,
    env: { ...process.env, FORCE_COLOR: '1', PYTHONIOENCODING: 'utf-8' }
  });

  // 输出前缀
  const prefix = name === 'MCP Server' ? '[SERVER]' : '[CLIENT]';
  
  proc.stdout.on('data', (data) => {
    data.toString().split('\n').forEach(line => {
      if (line.trim()) console.log(`${prefix} ${line}`);
    });
  });

  proc.stderr.on('data', (data) => {
    data.toString().split('\n').forEach(line => {
      if (line.trim()) console.log(`${prefix} ${line}`);
    });
  });

  proc.on('error', (err) => {
    console.error(`[ERROR] ${name} failed to start:`, err.message);
  });

  return proc;
}

async function main() {
  console.log('\n==================================================');
  console.log('       Chiral Controller - Dev Mode');
  console.log('==================================================\n');

  const localIP = getLocalIP();
  console.log(`Project: ${PROJECT_ROOT}`);
  console.log(`Local IP: ${localIP}\n`);

  // 检查端口
  const serverPort = 3777;
  const clientPort = 5173;
  
  if (await isPortInUse(serverPort)) {
    console.error(`[ERROR] Port ${serverPort} is already in use!`);
    console.log('   Please stop the existing server or use a different port.');
    process.exit(1);
  }

  // 检查并安装依赖
  if (!checkDeps(SKILL_DIR)) {
    await installDeps(SKILL_DIR, 'MCP Server');
  }
  if (!checkDeps(MOBILE_DIR)) {
    await installDeps(MOBILE_DIR, 'Web Client');
  }

  // 启动服务
  const server = startService(SKILL_DIR, 'MCP Server', serverPort);
  
  // 等待 server 启动
  await new Promise(r => setTimeout(r, 3000));
  
  const client = startService(MOBILE_DIR, 'Web Client', clientPort);

  // 显示信息
  await new Promise(r => setTimeout(r, 3000));
  
  console.log('\n' + '='.repeat(50));
  console.log('All services started!');
  console.log('='.repeat(50) + '\n');
  console.log(`Local:   http://localhost:${clientPort}`);
  console.log(`Mobile:  http://${localIP}:${clientPort}`);
  console.log(`Server:  http://${localIP}:${serverPort}\n`);
  console.log('Usage:');
  console.log('  1. Open phone browser');
  console.log(`  2. Go to http://${localIP}:${clientPort}`);
  console.log(`  3. Server URL: http://${localIP}:${serverPort}`);
  console.log('  4. Click "Connect", enter prompt, send!\n');
  console.log('Press Ctrl+C to stop all services\n');

  // 处理退出
  process.on('SIGINT', () => {
    console.log('\n\nStopping services...');
    server.kill();
    client.kill();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    server.kill();
    client.kill();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
