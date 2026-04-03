/**
 * Planner (3.10)
 *
 * Generates a plan.md for a given task.
 * In --plan mode, workers produce a plan without executing.
 */

const fs = require('fs');
const path = require('path');

class Planner {
  constructor(manager) {
    this.manager = manager;
  }

  /**
   * Generate the plan prompt that instructs the worker to write plan.md only.
   */
  buildPlanPrompt(task, options = {}) {
    const outputPath = options.outputPath || 'plan.md';
    const lines = [
      '[C4 PLAN MODE — 실행하지 말고 계획만 작성]',
      '',
      '아래 작업에 대한 구현 계획을 작성해줘.',
      '코드를 직접 수정하지 말고, 계획 문서만 작성해.',
      '',
      `출력 파일: ${outputPath}`,
      '',
      '계획에 포함할 내용:',
      '1. 작업 요약 (한 줄)',
      '2. 수정할 파일 목록과 각 파일에서 할 변경',
      '3. 구현 순서 (의존성 고려)',
      '4. 테스트 계획',
      '5. 예상 위험/주의사항',
      '',
      `## 작업`,
      task,
      '',
      `완료 후 ${outputPath} 파일만 커밋해.`,
    ];
    return lines.join('\n');
  }

  /**
   * Send a plan-only task to a worker via sendTask.
   */
  sendPlan(name, task, options = {}) {
    const planPrompt = this.buildPlanPrompt(task, options);
    return this.manager.sendTask(name, planPrompt, {
      branch: options.branch,
      useBranch: options.useBranch,
      useWorktree: options.useWorktree,
      projectRoot: options.projectRoot,
      scope: options.scope,
      scopePreset: options.scopePreset,
      contextFrom: options.contextFrom,
    });
  }

  /**
   * Read a plan.md file from a worker's worktree.
   */
  readPlan(name, options = {}) {
    const w = this.manager.workers.get(name);
    if (!w) return { error: `Worker '${name}' not found` };

    const outputPath = options.outputPath || 'plan.md';
    const base = w.worktree || this.manager._detectRepoRoot() || process.cwd();
    const planPath = path.resolve(base, outputPath);

    try {
      const content = fs.readFileSync(planPath, 'utf8');
      return { success: true, path: planPath, content };
    } catch (e) {
      return { error: `Plan not found: ${planPath}` };
    }
  }
}

module.exports = Planner;
