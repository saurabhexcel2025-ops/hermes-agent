import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

const files = execSync("git grep -l requireNotReadOnly -- src/app/api", { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean);

for (const file of files) {
  let s = readFileSync(file, "utf8");
  if (!s.includes('from "@/lib/api-auth"')) continue;

  if (!s.includes("requireAuth")) {
    s = s.replace(
      /import \{([^}]+)\} from "@\/lib\/api-auth";/,
      (m, inner) => {
        const parts = inner.split(",").map((p) => p.trim()).filter(Boolean);
        if (!parts.includes("requireAuth")) parts.unshift("requireAuth");
        const filtered = parts.filter((p) => p !== "requireNotReadOnly" && p !== "requireMcApiKey");
        return `import { ${filtered.join(", ")} } from "@/lib/api-auth";`;
      }
    );
  } else {
    s = s.replace(
      /import \{([^}]+)\} from "@\/lib\/api-auth";/,
      (m, inner) => {
        const parts = inner.split(",").map((p) => p.trim()).filter(Boolean);
        const filtered = parts.filter((p) => p !== "requireNotReadOnly" && p !== "requireMcApiKey");
        return `import { ${filtered.join(", ")} } from "@/lib/api-auth";`;
      }
    );
  }

  s = s.replace(
    /  const ro = requireNotReadOnly\(\);\r?\n  if \(ro\) return ro;\r?\n  const auth = requireAuth\(request\);\r?\n  if \(auth\) return auth;\r?\n/g,
    "  const auth = requireAuth(request);\n  if (auth) return auth;\n"
  );
  s = s.replace(
    /  const ro = requireNotReadOnly\(\);\r?\n  if \(ro\) return ro;\r?\n/g,
    "  const auth = requireAuth(request);\n  if (auth) return auth;\n"
  );

  writeFileSync(file, s);
}

console.log(`fixed ${files.length} files`);
