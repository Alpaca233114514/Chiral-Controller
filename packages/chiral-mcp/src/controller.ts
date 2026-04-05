import { spawn, ChildProcess } from 'child_process';
import { resolve, join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';

interface ServiceStatus {
  server: boolean;
  client: boolean;
  serverPort?: number;
  clientPort?: number;
}

interface ConfigData {
  serverPort?: number;
  clientPort?: number;
  kimiVersion?: string;
  autoStart?: boolean;
  lastProjectRoot?: string;
  [key: string]: unknown;
}

const DEFAULT_CONFIG: ConfigData = {
  serverPort: 3777,
  clientPort: 5173,
  kimiVersion: 'kimi-superpowers',
  autoStart: false
};

export class ChiralController {
  private serverProcess: ChildProcess | null = null;
  private clientProcess: ChildProcess | null = null;
  private configPath: string;
  private config: ConfigData;

  constructor() {
    const configDir = join(homedir(), '.chiral');
    this.configPath = join(configDir, 'config.json');
    
    // 确保配置目录存在
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    
    this.config = this.loadConfig();
  }

  async startDev(kimiVersion: string, serverPort: number, clientPort: number): Promise<void> {
    await this.startServer(kimiVersion, serverPort);
    await this.sleep(2000);
    await this.startClient(clientPort);
    
    // 保存端口配置
    this.config.serverPort = serverPort;
    this.config.clientPort = clientPort;
    this.saveConfig();
  }

  async startServer(kimiVersion: string, port: number): Promise<void> {
    const projectRoot = this.findProjectRoot();
    const skillDir = join(projectRoot, 'skill');
    
    if (!existsSync(skillDir)) {
      throw new Error(`找不到 skill 目录: ${skillDir}`);
    }

    this.serverProcess = spawn('npx', ['tsx', 'src/server.ts'], {
      cwd: skillDir,
      env: { ...process.env, KIMI_CLI: kimiVersion, PORT: port.toString() },
      stdio: 'pipe',
      shell: true,
      detached: false
    });

    this.serverProcess.on('error', (error) => {
      console.error('Server error:', error);
    });

    this.serverProcess.on('close', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`Server exited with code: ${code}`);
      }
      this.serverProcess = null;
    });

    // 等待服务启动
    await this.sleep(2000);
  }

  async startClient(port: number): Promise<void> {
    const projectRoot = this.findProjectRoot();
    const mobileDir = join(projectRoot, 'mobile');
    
    if (!existsSync(mobileDir)) {
      throw new Error(`找不到 mobile 目录: ${mobileDir}`);
    }

    this.clientProcess = spawn('npm', ['run', 'dev', '--', '--port', port.toString()], {
      cwd: mobileDir,
      env: { ...process.env, PORT: port.toString() },
      stdio: 'pipe',
      shell: true,
      detached: false
    });

    this.clientProcess.on('error', (error) => {
      console.error('Client error:', error);
    });

    this.clientProcess.on('close', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`Client exited with code: ${code}`);
      }
      this.clientProcess = null;
    });

    // 等待服务启动
    await this.sleep(3000);
  }

  async stopAll(): Promise<void> {
    if (this.serverProcess) {
      this.serverProcess.kill('SIGTERM');
      this.serverProcess = null;
    }

    if (this.clientProcess) {
      this.clientProcess.kill('SIGTERM');
      this.clientProcess = null;
    }
  }

  async getStatus(): Promise<ServiceStatus> {
    return {
      server: this.serverProcess !== null && !this.serverProcess.killed,
      client: this.clientProcess !== null && !this.clientProcess.killed,
      serverPort: this.config.serverPort,
      clientPort: this.config.clientPort
    };
  }

  async getConfig(key: string): Promise<string | undefined> {
    return this.config[key]?.toString();
  }

  async setConfig(key: string, value: string): Promise<void> {
    this.config[key] = value;
    this.saveConfig();
  }

  async getAllConfig(): Promise<ConfigData> {
    return { ...DEFAULT_CONFIG, ...this.config };
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
    
    // 使用 lastProjectRoot 或默认路径
    if (this.config.lastProjectRoot && existsSync(this.config.lastProjectRoot)) {
      return this.config.lastProjectRoot;
    }
    
    // 默认使用当前目录
    return currentDir;
  }

  private loadConfig(): ConfigData {
    try {
      if (existsSync(this.configPath)) {
        const data = readFileSync(this.configPath, 'utf-8');
        return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
      }
    } catch (error) {
      console.error('加载配置失败:', error);
    }
    return { ...DEFAULT_CONFIG };
  }

  private saveConfig(): void {
    try {
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('保存配置失败:', error);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
