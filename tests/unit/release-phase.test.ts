import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Heroku removes devDependencies after the build, then runs the Procfile `release` command. Anything that
 * command (or a script an operator runs on the server) needs must therefore be a production dependency.
 * This was missed once: `tsx` was a devDependency, so the first deploy's release phase failed with "tsx: not found".
 */
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

describe("Heroku release phase", () => {
  it("only needs tools that survive devDependency pruning", () => {
    const procfile = readFileSync("Procfile", "utf8");
    const release = /^release:\s*(.+)$/m.exec(procfile)?.[1] ?? "";
    expect(release).toContain("db:migrate");
    const scripts = [...release.matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1]!);
    // Also the operator scripts documented for use on the server.
    scripts.push("admin:create", "assistant:purge");
    const needed = new Set<string>();
    for (const s of scripts) {
      const cmd = pkg.scripts[s] ?? "";
      expect(cmd, `script ${s} exists`).not.toBe("");
      if (cmd.startsWith("tsx ")) needed.add("tsx");
    }
    needed.add("dotenv"); // imported by every script under scripts/
    for (const name of needed) {
      expect(Object.keys(pkg.dependencies), `${name} must be in dependencies, not devDependencies`).toContain(name);
      expect(Object.keys(pkg.devDependencies)).not.toContain(name);
    }
  });
});
