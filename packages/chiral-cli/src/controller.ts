import { spawn, ChildProcess } from 'child_process';
import { resolve, join } from 'path';
import { existsSync } from 'fs';
import chalk from 'chalk';
import { getLocalIp, sleep } from './utils.js';
import { ConfigManager } from './config.js';

interface ServiceStatus {
  server: boolean;
  client: boolean;
  serverPort?: number;
  clientPort?: number;
}

export class ChiralController {
  private serverProcess: ChildProcess | null = null;
  private clientProcess: ChildProcess | null = null;
  private config: ConfigManager;

  constructor() {
    this.config = new ConfigManager();
  }

  async startDev(kimiVersion: string, serverPort: number, clientPort: number): Promise<void> {
    await this.startServer(kimiVersion, serverPort);
    await sleep(2000);
    await this.startClient(clientPort);
    await sleep(1000);
    
    await this.displayUrls(clientPort, serverPort);
    
    console.log(chalk.gray('按 Ctrl+C 停止服务'));
    console.log();
    
    // 保持运行
    await this.waitForExit();
  }

  async startServer(kimiVersion: string, port: number): Promise<void> {
    const projectRoot = this.findProjectRoot();
    const skillDir = join(projectRoot, 'skill');
    
    if (!existsSync(skillDir)) {
      throw new Error(`找不到 skill 目录: ${skillDir}`);
    }

    console.log(chalk.green('✓ MCP Server 启动中...'));
    
    this.serverProcess = spawn('npx', ['tsx', 'src/server.ts'], {
      cwd: skillDir,
      env: { ...process.env, KIMI_CLI: kimiVersion, PORT: port.toString() },
      stdio: 'pipe',
      shell: true
    });

    this.serverProcess.stdout?.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      lines.forEach((line: string) => {
        if (line.trim()) {
          console.log(chalk.blue(`[SERVER] ${line}`));
        }
      });
    });

    this.serverProcess.stderr?.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      lines.forEach((line: string) => {
        if (line.trim()) {
          console.log(chalk.yellow(`[SERVER] ${line}`));
        }
      });
    });

    this.serverProcess.on('close', (code) => {
      if (code !== 0 && code !== null) {
        console.log(chalk.red(`[SERVER] 进程退出，代码: ${code}`));
      }
    });

    // 等待服务启动
    await sleep(2000);
  }

  async startClient(port: number): Promise<void> {
    const projectRoot = this.findProjectRoot();
    const mobileDir = join(projectRoot, 'mobile');
    
    if (!existsSync(mobileDir)) {
      throw new Error(`找不到 mobile 目录: ${mobileDir}`);
    }

    console.log(chalk.green('✓ Web Client 启动中...'));
    
    this.clientProcess = spawn('npm', ['run', 'dev', '--', '--port', port.toString()], {
      cwd: mobileDir,
      env: { ...process.env, PORT: port.toString() },
      stdio: 'pipe',
      shell: true
    });

    this.clientProcess.stdout?.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      lines.forEach((line: string) => {
        if (line.trim()) {
          console.log(chalk.magenta(`[CLIENT] ${line}`));
        }
      });
    });

    this.clientProcess.stderr?.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      lines.forEach((line: string) => {
        if (line.trim()) {
          console.log(chalk.yellow(`[CLIENT] ${line}`));
        }
      });
    });

    this.clientProcess.on('close', (code) => {
      if (code !== 0 && code !== null) {
        console.log(chalk.red(`[CLIENT] 进程退出，代码: ${code}`));
      }
    });

    // 等待服务启动
    await sleep(3000);
  }

  async stopAll(): Promise<void> {
    if (this.serverProcess) {
      this.serverProcess.kill('SIGTERM');
      this.serverProcess = null;
      console.log(chalk.green('✓ MCP Server 已停止'));
    }

    if (this.clientProcess) {
      this.clientProcess.kill('SIGTERM');
      this.clientProcess = null;
      console.log(chalk.green('✓ Web Client 已停止'));
    }
  }

  async getStatus(): Promise<ServiceStatus> {
    const serverPort = this.config.get('serverPort') as number | undefined;
    const clientPort = this.config.get('clientPort') as number | undefined;
    
    return {
      server: this.serverProcess !== null && !this.serverProcess.killed,
      client: this.clientProcess !== null && !this.clientProcess.killed,
      serverPort,
      clientPort
    };
  }

  async getConfig(key: string): Promise<string | undefined> {
    return this.config.get(key)?.toString();
  }

  async setConfig(key: string, value: string): Promise<void> {
    this.config.set(key, value);
  }

  async getAllConfig(): Promise<Record<string, unknown>> {
    return this.config.getAll();
  }

  private findProjectRoot(): string {
    // 首先检查环境变量
    if (process.env.CHIRAL_ROOT) {
      return process.env.CHIRAL_ROOT;
    }

    // 从当前工作目录向上查找
    let currentDir = process.cwd();
    const root = resolve(currentDir);
    
    // 检查当前目录是否是项目根
    if (existsSync(join(root, 'skill')) && existsSync(join(root, 'mobile'))) {
      return root;
    }
    
    // 检查 packages 目录结构 (从 dist/index.js 推断)
    const packagesRoot = resolve(process.cwd());
    if (existsSync(join(packagesRoot, 'skill')) && existsSync(join(packagesRoot, 'mobile'))) {
      return packagesRoot;
    }
    
    // 默认使用当前目录
    return currentDir;
  }

  private async displayUrls(clientPort: number, serverPort: number): Promise<void> {
    const ip = await getLocalIp();
    
    console.log();
    console.log(chalk.green('==============================================='));
    console.log(chalk.green('              Started!'));
    console.log(chalk.green('==============================================='));
    console.log();
    console.log(chalk.white(`  Local:   http://localhost:${clientPort}`));
    console.log(chalk.white(`  Mobile:  http://${ip}:${clientPort}`));
    console.log(chalk.white(`  Server:  http://${ip}:${serverPort}`));
    console.log();
    
    // 保存端口配置
    this.config.set('serverPort', serverPort);
    this.config.set('clientPort', clientPort);
  }

  private async waitForExit(): Promise<void> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if ((this.serverProcess?.killed ?? true) && (this.clientProcess?.killed ?? true)) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      
      // 处理 SIGINT
      process.on('SIGINT', () => {
        console.log(chalk.yellow('\n\n正在停止服务...'));
        this.stopAll().then(() => {
          clearInterval(checkInterval);
          resolve();
          process.exit(0);
        });
      });
    });
  }
}
