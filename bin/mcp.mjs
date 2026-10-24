#!/usr/bin/env node
// Lets an MCP client start the server from any directory: tsx is resolved next to this file.
import { register } from 'tsx/esm/api';

register();
const { createServer } = await import('../src/mcp/server.ts');
await createServer().startStdio();
