#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { ChiralController } from './controller.js';

const controller = new ChiralController();

// 定义可用的工具
const TOOLS: Tool[] = [
  {
    name: 'chiral_start_dev',
    description: '启动 Chiral Controller 开发环境 (MCP Server + Web Client)',
    inputSchema: {
      type: 'object',
      properties: {
        normal: {
          type: 'boolean',
          description: '是否使用普通 kimi 版本 (默认使用 superpowers)',
          default: false
        },
        serverPort: {
          type: 'number',
          description: 'MCP Server 端口',
          default: 3777
        },
        clientPort: {
          type: 'number',
          description: 'Web Client 端口',
          default: 5173
        }
      }
    }
  },
  {
    name: 'chiral_start_server',
    description: '只启动 Chiral MCP Server',
    inputSchema: {
      type: 'object',
      properties: {
        normal: {
          type: 'boolean',
          description: '是否使用普通 kimi 版本',
          default: false
        },
        port: {
          type: 'number',
          description: '服务端口',
          default: 3777
        }
      }
    }
  },
  {
    name: 'chiral_start_client',
    description: '只启动 Chiral Web Client',
    inputSchema: {
      type: 'object',
      properties: {
        port: {
          type: 'number',
          description: '客户端端口',
          default: 5173
        }
      }
    }
  },
  {
    name: 'chiral_stop',
    description: '停止所有 Chiral Controller 服务',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'chiral_status',
    description: '获取 Chiral Controller 服务状态',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'chiral_get_config',
    description: '获取 Chiral Controller 配置',
    inputSchema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: '配置项名称 (可选，不提供则返回所有配置)'
        }
      }
    }
  },
  {
    name: 'chiral_set_config',
    description: '设置 Chiral Controller 配置',
    inputSchema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: '配置项名称'
        },
        value: {
          type: 'string',
          description: '配置值'
        }
      },
      required: ['key', 'value']
    }
  }
];

// 创建 MCP Server
const server = new Server(
  {
    name: 'chiral-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 处理工具列表请求
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: TOOLS,
  };
});

// 处理工具调用请求
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'chiral_start_dev': {
        const normal = (args?.normal as boolean) ?? false;
        const serverPort = (args?.serverPort as number) ?? 3777;
        const clientPort = (args?.clientPort as number) ?? 5173;
        
        await controller.startDev(normal ? 'kimi' : 'kimi-superpowers', serverPort, clientPort);
        
        return {
          content: [
            {
              type: 'text',
              text: `Chiral Controller 开发环境已启动\n\nMCP Server: http://localhost:${serverPort}\nWeb Client: http://localhost:${clientPort}\n\n使用手机浏览器访问电脑的局域网 IP:${clientPort} 即可远程控制 Kimi CLI。`
            }
          ]
        };
      }

      case 'chiral_start_server': {
        const normal = (args?.normal as boolean) ?? false;
        const port = (args?.port as number) ?? 3777;
        
        await controller.startServer(normal ? 'kimi' : 'kimi-superpowers', port);
        
        return {
          content: [
            {
              type: 'text',
              text: `Chiral MCP Server 已启动\n\n地址: http://localhost:${port}`
            }
          ]
        };
      }

      case 'chiral_start_client': {
        const port = (args?.port as number) ?? 5173;
        
        await controller.startClient(port);
        
        return {
          content: [
            {
              type: 'text',
              text: `Chiral Web Client 已启动\n\n地址: http://localhost:${port}`
            }
          ]
        };
      }

      case 'chiral_stop': {
        await controller.stopAll();
        
        return {
          content: [
            {
              type: 'text',
              text: '所有 Chiral Controller 服务已停止'
            }
          ]
        };
      }

      case 'chiral_status': {
        const status = await controller.getStatus();
        
        const serverStatus = status.server ? '运行中 ✓' : '未运行 ✗';
        const clientStatus = status.client ? '运行中 ✓' : '未运行 ✗';
        
        return {
          content: [
            {
              type: 'text',
              text: `Chiral Controller 状态:\n\nMCP Server: ${serverStatus}${status.serverPort ? ` (端口: ${status.serverPort})` : ''}\nWeb Client: ${clientStatus}${status.clientPort ? ` (端口: ${status.clientPort})` : ''}`
            }
          ]
        };
      }

      case 'chiral_get_config': {
        const key = args?.key as string | undefined;
        
        if (key) {
          const value = await controller.getConfig(key);
          return {
            content: [
              {
                type: 'text',
                value: value ?? '(未设置)'
              }
            ]
          };
        } else {
          const config = await controller.getAllConfig();
          return {
            content: [
              {
                type: 'text',
                text: `当前配置:\n${Object.entries(config).map(([k, v]) => `  ${k}: ${v}`).join('\n')}`
              }
            ]
          };
        }
      }

      case 'chiral_set_config': {
        const key = args?.key as string;
        const value = args?.value as string;
        
        await controller.setConfig(key, value);
        
        return {
          content: [
            {
              type: 'text',
              text: `配置已更新: ${key} = ${value}`
            }
          ]
        };
      }

      default:
        throw new Error(`未知工具: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `错误: ${error instanceof Error ? error.message : String(error)}`
        }
      ],
      isError: true
    };
  }
});

// 启动服务器
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Chiral MCP Server 已启动');
}

main().catch(console.error);
