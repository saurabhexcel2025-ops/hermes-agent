/* eslint-disable @typescript-eslint/no-require-imports -- Jest config is CommonJS */
const nextJest = require("next/jest.js");

const createJestConfig = nextJest({ dir: "./" });

/** OSS export: community test surface is `src/__tests__/oss/**` only. */
const config = {
  testEnvironment: "jest-environment-jsdom",
  setupFilesAfterEnv: ["<rootDir>/config/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    // Intercept better-sqlite3 at resolution time so the real CJS module
    // (which calls require('fs') at evaluation time) is never loaded.
    // The mock exports a minimal Database-compatible object with prepare/run/get/all.
    "^better-sqlite3$": "<rootDir>/__mocks__/better-sqlite3.cjs",
  },
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/**/layout.tsx",
    "!src/**/page.tsx",
    "!src/app/**",
  ],
  coverageThreshold: {
    global: {
      branches: 5,
      functions: 2,
      lines: 5,
      statements: 5,
    },
  },
  testMatch: [
    "<rootDir>/src/__tests__/oss/**/*.test.ts",
    "<rootDir>/src/__tests__/oss/**/*.test.tsx",
  ],
};

module.exports = createJestConfig(config);
