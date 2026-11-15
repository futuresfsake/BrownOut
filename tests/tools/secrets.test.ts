import { afterEach, describe, expect, it } from "vitest";
import { fakeAwsKey, makeRepo, runTool } from "./helpers.js";

const repos: ReturnType<typeof makeRepo>[] = [];
const fresh = () => {
  const repo = makeRepo();
  repos.push(repo);
  return repo;
};
afterEach(() => {
  for (const repo of repos.splice(0)) repo.cleanup();
});

describe("tools/secrets.mjs", () => {
  it("refuses staged changes that contain a secret, and names the scan", () => {
    const repo = fresh();
    repo.write("config.txt", `aws_access_key_id = ${fakeAwsKey()}\n`);
    repo.add();
    const result = runTool("secrets.mjs", ["staged", repo.dir]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("secrets (staged)");
  });

  it("passes staged changes with no secret", () => {
    const repo = fresh();
    repo.write("notes.md", "Nothing secret here.\n");
    repo.add();
    const result = runTool("secrets.mjs", ["staged", repo.dir]);
    expect(result.status).toBe(0);
  });

  it("finds a secret that is already committed when it scans history", () => {
    const repo = fresh();
    repo.write("config.txt", `aws_access_key_id = ${fakeAwsKey()}\n`);
    repo.add();
    repo.commit("add config");
    repo.write("config.txt", "removed again\n");
    repo.add();
    repo.commit("remove config");
    const result = runTool("secrets.mjs", ["history", repo.dir]);
    expect(result.status).toBe(1);
  });

  it("fails, and says which tool is missing, when gitleaks cannot be found", () => {
    const repo = fresh();
    repo.write("notes.md", "clean\n");
    repo.add();
    const result = runTool("secrets.mjs", ["staged", repo.dir], {
      BROWNOUT_GITLEAKS: "gitleaks-that-does-not-exist",
    });
    expect(result.status).toBe(2);
    expect(result.output).toContain("never passes silently");
  });

  it("rejects an unknown mode", () => {
    expect(runTool("secrets.mjs", ["everything"]).status).toBe(64);
  });
});
