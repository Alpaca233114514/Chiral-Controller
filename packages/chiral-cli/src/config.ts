import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';

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

export class ConfigManager {
  private configPath: string;
  private config: ConfigData;

  constructor() {
    const configDir = join(homedir(), '.chiral');
    this.configPath = join(configDir, 'config.json');
    
    // 确保配置目录存在
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    
    this.config = this.load();
  }

  get<K extends keyof ConfigData>(key: K): ConfigData[K] {
    return this.config[key] ?? DEFAULT_CONFIG[key];
  }

  set(key: string, value: unknown): void {
    (this.config as Record<string, unknown>)[key] = value;
    this.save();
  }

  getAll(): ConfigData {
    return { ...DEFAULT_CONFIG, ...this.config };
  }

  private load(): ConfigData {
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

  private save(): void {
    try {
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('保存配置失败:', error);
    }
  }
}
