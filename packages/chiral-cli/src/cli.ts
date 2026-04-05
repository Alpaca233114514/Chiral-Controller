#!/usr/bin/env node

import { program } from 'commander';
import chalk from 'chalk';
import { ChiralController } from './controller.js';
import { getLocalIp } from './utils.js';

const controller = new ChiralController();

program
  .name('chiral')
  .description('Chiral Controller CLI - 手机远程控制 Kimi CLI 代码生成')
  .version('1.0.0');

program
  .command('run')
  .description('启动 Chiral Controller 服务')
  .argument('<type>', '启动类型: dev | server | client')
  .option('-n, --normal', '使用普通 kimi 版本 (默认使用 superpowers)')
  .option('-p, --port <port>', '指定服务端口', '3777')
  .option('-c, --client-port <port>', '指定客户端端口', '5173')
  .action(async (type: string, options: { normal?: boolean; port?: string; clientPort?: string }) => {
    const kimiVersion = options.normal ? 'kimi' : 'kimi-superpowers';
    const serverPort = parseInt(options.port || '3777', 10);
    const clientPort = parseInt(options.clientPort || '5173', 10);
    
    console.log(chalk.cyan('==============================================='));
    console.log(chalk.cyan('    Chiral Controller CLI'));
    console.log(chalk.cyan('==============================================='));
    console.log();
    console.log(chalk.yellow(`Using: ${kimiVersion}`));
    console.log();

    try {
      switch (type.toLowerCase()) {
        case 'dev':
          await controller.startDev(kimiVersion, serverPort, clientPort);
          break;
        case 'server':
          await controller.startServer(kimiVersion, serverPort);
          break;
        case 'client':
          await controller.startClient(clientPort);
          break;
        default:
          console.log(chalk.red(`未知类型: ${type}`));
          console.log(chalk.yellow('可用类型: dev, server, client'));
          process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red('错误:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('stop')
  .description('停止所有 Chiral Controller 服务')
  .action(async () => {
    console.log(chalk.yellow('停止服务中...'));
    try {
      await controller.stopAll();
      console.log(chalk.green('✓ 所有服务已停止'));
    } catch (error) {
      console.error(chalk.red('错误:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('查看 Chiral Controller 服务状态')
  .action(async () => {
    console.log(chalk.cyan('Chiral Controller 状态:'));
    console.log();
    try {
      const status = await controller.getStatus();
      
      if (status.server) {
        console.log(chalk.green('  MCP Server: 运行中 ✓'));
        console.log(chalk.gray(`    端口: ${status.serverPort || 3777}`));
      } else {
        console.log(chalk.red('  MCP Server: 未运行 ✗'));
      }
      
      if (status.client) {
        console.log(chalk.green('  Web Client: 运行中 ✓'));
        console.log(chalk.gray(`    端口: ${status.clientPort || 5173}`));
      } else {
        console.log(chalk.red('  Web Client: 未运行 ✗'));
      }
      
      console.log();
      const ip = await getLocalIp();
      console.log(chalk.gray('访问地址:'));
      console.log(chalk.white(`  Local:  http://localhost:${status.clientPort || 5173}`));
      console.log(chalk.white(`  Mobile: http://${ip}:${status.clientPort || 5173}`));
    } catch (error) {
      console.error(chalk.red('错误:'), error instanceof Error ? error.message : error);
    }
  });

program
  .command('config')
  .description('查看或修改配置')
  .option('-g, --get <key>', '获取配置项')
  .option('-s, --set <key>', '设置配置项')
  .option('-v, --value <value>', '配置值')
  .action(async (options: { get?: string; set?: string; value?: string }) => {
    if (options.get) {
      const value = await controller.getConfig(options.get);
      console.log(chalk.cyan(`${options.get}: ${value}`));
    } else if (options.set && options.value !== undefined) {
      await controller.setConfig(options.set, options.value);
      console.log(chalk.green(`✓ 已设置 ${options.set} = ${options.value}`));
    } else {
      const config = await controller.getAllConfig();
      console.log(chalk.cyan('当前配置:'));
      for (const [key, value] of Object.entries(config)) {
        console.log(chalk.white(`  ${key}: ${value}`));
      }
    }
  });

program.parse();
