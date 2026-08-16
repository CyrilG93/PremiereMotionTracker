import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

// Walk the repository and collect authored JavaScript files outside generated folders.
async function collectJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    // Ignore downloaded vendor SDK sources in addition to generated project folders.
    if ([".git", "node_modules", "dist", "build", "uxp-hybrid-plugin-sdk-main"].includes(entry.name)) {
      continue;
    }
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectJavaScriptFiles(fullPath));
    } else if (/\.(js|mjs)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

const projectRoot = process.cwd();
const manifest = JSON.parse(await readFile(path.join(projectRoot, "manifest.json"), "utf8"));
const packageJson = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));

// Keep the installable manifest and developer package on the same version.
if (manifest.version !== packageJson.version) {
  throw new Error(`Version mismatch: manifest ${manifest.version}, package ${packageJson.version}`);
}

const javascriptFiles = await collectJavaScriptFiles(projectRoot);
for (const filePath of javascriptFiles) {
  const result = spawnSync(process.execPath, ["--check", filePath], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || `Syntax check failed for ${filePath}`);
  }
  const source = await readFile(filePath, "utf8");
  if (!source.includes("//")) {
    throw new Error(`Missing explanatory // comment in ${filePath}`);
  }
}

// Report a compact success line for local and CI runs.
console.log(`Lint passed for ${javascriptFiles.length} JavaScript files.`);
