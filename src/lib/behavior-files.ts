// Shared behavior file definitions — used by both list and detail routes
import { HERMES_PATHS } from "./hermes";

export const BEHAVIOR_FILES: Record<
  string,
  { name: string; path: string; description: string; category: string }
> = {
  soul: {
    name: "SOUL.md",
    path: HERMES_PATHS.soul,
    description: "Agent persona — defines personality, tone, and behavior",
    category: "identity",
  },
  hermes: {
    name: "HERMES.md",
    path: HERMES_PATHS.hermes,
    description: "Priority project instructions (loaded every message)",
    category: "identity",
  },
  user: {
    name: "USER.md",
    path: HERMES_PATHS.userMd,
    description: "User priorities and preferences",
    category: "user",
  },
  memory: {
    name: "MEMORY.md",
    path: HERMES_PATHS.memoryMd,
    description: "Agent persistent knowledge and memories",
    category: "user",
  },
  agent: {
    name: "AGENTS.md",
    path: HERMES_PATHS.hermes,
    description: "Agent development rules and guidelines",
    category: "identity",
  },
  env: {
    name: ".env",
    path: HERMES_PATHS.env,
    description: "API keys and environment variables",
    category: "system",
  },
  config: {
    name: "config.yaml",
    path: HERMES_PATHS.config,
    description: "Core configuration — model, provider, display, tools",
    category: "system",
  },
};
