import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { WORK_DIR } from "./context";

/**
 * Shallow-clones a public GitHub repo into the work dir (not committed) and checks out `ref`
 * (a commit hash recorded in the checkpoint) when given. Returns the checked-out commit.
 */
export function ensureRepo(url: string, name: string, ref?: string): { dir: string; commit: string } {
  const dir = path.join(WORK_DIR, "git", name);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
  if (!fs.existsSync(path.join(dir, ".git"))) {
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    execFileSync("git", ["clone", "--quiet", "--depth", "1", url, dir], { stdio: ["ignore", "pipe", "pipe"] });
  }
  if (ref && git("rev-parse", "HEAD") !== ref) {
    try {
      git("fetch", "--quiet", "--depth", "1", "origin", ref);
      git("checkout", "--quiet", ref);
    } catch {
      // Pinned commit no longer fetchable: stay on the fresh HEAD; the caller logs the change.
    }
  }
  return { dir, commit: git("rev-parse", "HEAD") };
}
