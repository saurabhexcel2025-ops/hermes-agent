import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

const files = execSync("git grep -l requireMcApiKey -- src/app/api", { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean);

for (const file of files) {
  let s = readFileSync(file, "utf8");
  const hadRo = s.includes("requireNotReadOnly");
  s = s.replace(
    /import \{ requireMcApiKey, requireNotReadOnly \} from "@\/lib\/api-auth";/g,
    'import { requireAuth } from "@/lib/api-auth";'
  );
  s = s.replace(
    /import \{ requireNotReadOnly, requireMcApiKey \} from "@\/lib\/api-auth";/g,
    'import { requireAuth } from "@/lib/api-auth";'
  );
  s = s.replace(/import \{ requireMcApiKey \} from "@\/lib\/api-auth";\r?\n/g, "");
  s = s.replace(
    /  const auth = requireMcApiKey\(request\);\r?\n  if \(auth\) return auth;\r?\n  const ro = requireNotReadOnly\(\);\r?\n  if \(ro\) return ro;\r?\n/g,
    "  const auth = requireAuth(request);\n  if (auth) return auth;\n"
  );
  s = s.replace(
    /  const limited = requireMcApiKey\(request\);\r?\n  if \(limited\) return limited;\r?\n/g,
    ""
  );
  if (!hadRo) {
    s = s.replace(
      /  const auth = requireMcApiKey\(request\);\r?\n  if \(auth\) return auth;\r?\n/g,
      ""
    );
  } else {
    s = s.replace(
      /  const auth = requireMcApiKey\(request\);\r?\n  if \(auth\) return auth;\r?\n/g,
      "  const auth = requireAuth(request);\n  if (auth) return auth;\n"
    );
  }
  writeFileSync(file, s);
}

console.log(`updated ${files.length} files`);
