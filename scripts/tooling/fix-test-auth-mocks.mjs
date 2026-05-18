import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

const files = execSync("git grep -l requireMcApiKey -- tests/unit", { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean);

for (const file of files) {
  let s = readFileSync(file, "utf8");
  s = s.replace(/requireMcApiKey/g, "requireAuth");
  s = s.replace(/requireNotReadOnly/g, "requireAuth");
  s = s.replace(/mockRequireMcApiKey/g, "mockRequireAuth");
  s = s.replace(/mockRequireNotReadOnly/g, "mockRequireAuth");
  writeFileSync(file, s);
}

const files2 = execSync("git grep -l requireNotReadOnly -- tests/unit", { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean);

for (const file of files2) {
  let s = readFileSync(file, "utf8");
  if (s.includes("requireMcApiKey")) continue;
  s = s.replace(/requireNotReadOnly/g, "requireAuth");
  s = s.replace(/mockRequireNotReadOnly/g, "mockRequireAuth");
  writeFileSync(file, s);
}

console.log("test mocks updated");
