import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  basePath: process.env.PAGES_BASE_PATH ?? '',
  // The repo root has its own lockfile; without this Turbopack picks the root as the workspace.
  turbopack: { root: __dirname },
  // Next writes an AGENTS.md when `next dev` runs under a coding agent; this repo doesn't want one.
  agentRules: false,
};

export default nextConfig;
