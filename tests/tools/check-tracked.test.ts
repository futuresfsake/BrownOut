import { afterEach, describe, expect, it } from "vitest";
import {
  coAuthorTrailer,
  localForwardSlashPath,
  localWindowsPath,
  makeRepo,
  runTool,
} from "./helpers.js";

const repos: ReturnType<typeof makeRepo>[] = [];
const fresh = () => {
  const repo = makeRepo();
  repos.push(repo);
  return repo;
};
afterEach(() => {
  for (const repo of repos.splice(0)) repo.cleanup();
});

describe("tools/check-tracked.mjs files", () => {
  it("passes a clean repository and allows .env.example", () => {
    const repo = fresh();
    repo.write("README.md", "hello\n");
    repo.write(".env.example", "API_KEY=\n");
    repo.add();
    expect(runTool("check-tracked.mjs", ["files", repo.dir]).status).toBe(0);
  });

  it("refuses a tracked environment file", () => {
    const repo = fresh();
    repo.write(".env", "X=1\n");
    repo.add();
    const result = runTool("check-tracked.mjs", ["files", repo.dir]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("environment file is tracked");
  });

  it("refuses a tracked key file", () => {
    const repo = fresh();
    repo.write("certs/server.pem", "x\n");
    repo.add();
    expect(runTool("check-tracked.mjs", ["files", repo.dir]).status).toBe(1);
  });

  it("refuses a local filesystem path in a tracked file and reports the line", () => {
    const repo = fresh();
    repo.write("docs/setup.md", `line one\nsee ${localWindowsPath()}\n`);
    repo.add();
    const result = runTool("check-tracked.mjs", ["files", repo.dir]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("docs/setup.md:2");
  });

  it("refuses the forward-slash form of a local path, as printed by Node tools", () => {
    const repo = fresh();
    repo.write("evidence.txt", `RUN v1 ${localForwardSlashPath()}\n`);
    repo.add();
    const result = runTool("check-tracked.mjs", ["files", repo.dir]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("evidence.txt:1");
  });

  it("refuses a tracked local tooling file", () => {
    const repo = fresh();
    repo.write(["CLAUDE", ".md"].join(""), "notes\n");
    repo.add();
    const result = runTool("check-tracked.mjs", ["files", repo.dir]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("local tooling file is tracked");
  });
});

describe("tools/check-tracked.mjs messages", () => {
  it("passes plain commit messages", () => {
    const repo = fresh();
    repo.write("a.txt", "a\n");
    repo.add();
    repo.commit("feat: add a");
    expect(runTool("check-tracked.mjs", ["messages", repo.dir]).status).toBe(0);
  });

  it("refuses a commit message with a co-author trailer", () => {
    const repo = fresh();
    repo.write("a.txt", "a\n");
    repo.add();
    repo.commit(`feat: add a\n\n${coAuthorTrailer()}`);
    const result = runTool("check-tracked.mjs", ["messages", repo.dir]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("co-author trailer");
  });
});
