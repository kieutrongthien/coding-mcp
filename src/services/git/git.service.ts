import type { ProjectMetadata } from "../../core/types.js";
import { GitRunner } from "./git-runner.js";
import { assertGitSuccess, validateCommitMessage } from "./git-helpers.js";

export interface GitServiceOptions {
  timeoutMs: number;
  maxOutputSize: number;
}

export class GitService {
  constructor(
    private readonly runner: GitRunner,
    private readonly options: GitServiceOptions
  ) {}

  private run(project: ProjectMetadata, args: string[]) {
    return this.runner.run({
      projectPath: project.absolute_path,
      args,
      timeoutMs: this.options.timeoutMs,
      maxOutputSize: this.options.maxOutputSize
    });
  }

  async status(project: ProjectMetadata) {
    return await this.run(project, ["status", "--porcelain", "--branch"]);
  }

  async diff(project: ProjectMetadata, staged = false) {
    return await this.run(project, staged ? ["diff", "--staged"] : ["diff"]);
  }

  async branchList(project: ProjectMetadata) {
    return await this.run(project, ["branch", "--all", "--verbose"]);
  }

  async checkoutNewBranch(project: ProjectMetadata, branch: string) {
    const result = await this.run(project, ["checkout", "-b", branch]);
    assertGitSuccess(result, "checkout_new_branch");
    return result;
  }

  async checkoutBranch(project: ProjectMetadata, branch: string) {
    const result = await this.run(project, ["checkout", branch]);
    assertGitSuccess(result, "checkout_branch");
    return result;
  }

  async pull(project: ProjectMetadata) {
    return await this.run(project, ["pull", "--ff-only"]);
  }

  async add(project: ProjectMetadata, paths: string[]) {
    return await this.run(project, ["add", ...paths]);
  }

  async restore(project: ProjectMetadata, paths: string[], staged: boolean) {
    return await this.run(project, staged ? ["restore", "--staged", ...paths] : ["restore", ...paths]);
  }

  async commit(project: ProjectMetadata, message: string) {
    validateCommitMessage(message);
    return await this.run(project, ["commit", "-m", message]);
  }

  async push(project: ProjectMetadata, remote?: string, branch?: string, setUpstream = false) {
    const args = ["push"];
    if (setUpstream && remote && branch) {
      args.push("-u", remote, branch);
    } else {
      if (remote) {
        args.push(remote);
      }
      if (branch) {
        args.push(branch);
      }
    }

    return await this.run(project, args);
  }

  async log(project: ProjectMetadata, limit = 20) {
    return await this.run(project, ["log", `--max-count=${limit}`, "--oneline", "--decorate"]);
  }

  async show(project: ProjectMetadata, ref = "HEAD") {
    return await this.run(project, ["show", ref]);
  }

  async createTag(project: ProjectMetadata, tag: string, message?: string) {
    const args = message ? ["tag", "-a", tag, "-m", message] : ["tag", tag];
    return await this.run(project, args);
  }
}
