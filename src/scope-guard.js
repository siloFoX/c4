/**
 * Scope Guard — 작업자 스코프 이탈 감시 (1.8)
 *
 * 작업자가 할당된 스코프를 벗어나는 것을 감지하고 차단한다.
 * - 파일 수정 허용/금지 경로 매칭
 * - Bash 명령 허용/금지 패턴 매칭
 * - 작업자 출력에서 "방향 전환" 키워드 감지
 */

const path = require('path');

class ScopeGuard {
  /**
   * @param {Object} scope
   * @param {string[]} [scope.allowFiles]  - glob patterns for allowed files
   * @param {string[]} [scope.denyFiles]   - glob patterns for denied files
   * @param {string[]} [scope.allowBash]   - allowed bash command prefixes
   * @param {string[]} [scope.denyBash]    - denied bash command prefixes
   * @param {string} [scope.description]   - human-readable scope description
   */
  constructor(scope = {}) {
    this.allowFiles = scope.allowFiles || [];
    this.denyFiles = scope.denyFiles || [];
    this.allowBash = scope.allowBash || [];
    this.denyBash = scope.denyBash || [];
    this.description = scope.description || '';
  }

  /**
   * Check if a file path is within scope.
   * Logic:
   *   - If allowFiles is set: file must match at least one allow pattern
   *   - If denyFiles is set: file must NOT match any deny pattern
   *   - If neither is set: always allowed
   * @param {string} filePath
   * @returns {{ allowed: boolean, reason: string }}
   */
  checkFile(filePath) {
    if (this.allowFiles.length === 0 && this.denyFiles.length === 0) {
      return { allowed: true, reason: '' };
    }

    const normalized = filePath.replace(/\\/g, '/');

    // Check deny first
    for (const pattern of this.denyFiles) {
      if (this._matchGlob(normalized, pattern)) {
        return { allowed: false, reason: `file denied by pattern: ${pattern}` };
      }
    }

    // If allowFiles specified, must match at least one
    if (this.allowFiles.length > 0) {
      const matched = this.allowFiles.some(p => this._matchGlob(normalized, p));
      if (!matched) {
        return { allowed: false, reason: `file not in allowed scope: ${normalized}` };
      }
    }

    return { allowed: true, reason: '' };
  }

  /**
   * Check if a bash command is within scope.
   * Logic:
   *   - If denyBash is set: command must NOT start with any deny prefix
   *   - If allowBash is set: command must start with at least one allow prefix
   *   - If neither is set: defer to autoApprove rules
   * @param {string} command
   * @returns {{ allowed: boolean, reason: string }}
   */
  checkBash(command) {
    if (this.allowBash.length === 0 && this.denyBash.length === 0) {
      return { allowed: true, reason: '' };
    }

    const cmd = command.trim();
    const cmdName = cmd.split(/\s+/)[0];

    // Check deny first
    for (const pattern of this.denyBash) {
      if (cmdName === pattern || cmd.startsWith(pattern + ' ') || cmd.startsWith(pattern + '\t')) {
        return { allowed: false, reason: `bash command denied: ${pattern}` };
      }
    }

    // If allowBash specified, must match at least one
    if (this.allowBash.length > 0) {
      const matched = this.allowBash.some(p =>
        cmdName === p || cmd.startsWith(p + ' ') || cmd.startsWith(p + '\t')
      );
      if (!matched) {
        return { allowed: false, reason: `bash command not in allowed scope: ${cmdName}` };
      }
    }

    return { allowed: true, reason: '' };
  }

  /**
   * Detect scope drift keywords in text output.
   * Returns matched keywords if found, null otherwise.
   * @param {string} text
   * @returns {string[]|null}
   */
  detectDrift(text) {
    const driftPatterns = [
      // Korean
      { pattern: /리팩토링/g, label: '리팩토링' },
      { pattern: /더 나은 방법/g, label: '더 나은 방법' },
      { pattern: /방향을?\s*바꿔/g, label: '방향을 바꿔' },
      { pattern: /다른 접근/g, label: '다른 접근' },
      { pattern: /우선\s*.+부터/g, label: '우선 ~부터' },
      // English
      { pattern: /\brefactor\b/gi, label: 'refactor' },
      { pattern: /\bbetter approach\b/gi, label: 'better approach' },
      { pattern: /\blet me first\b/gi, label: 'let me first' },
      { pattern: /\bchange direction\b/gi, label: 'change direction' },
      { pattern: /\bbetter way\b/gi, label: 'better way' },
      { pattern: /\binstead,?\s+I/gi, label: 'instead, I' },
    ];

    const matched = [];
    for (const { pattern, label } of driftPatterns) {
      if (pattern.test(text)) {
        matched.push(label);
      }
    }

    return matched.length > 0 ? matched : null;
  }

  /**
   * Check if this scope has any restrictions defined.
   * @returns {boolean}
   */
  hasRestrictions() {
    return this.allowFiles.length > 0 ||
           this.denyFiles.length > 0 ||
           this.allowBash.length > 0 ||
           this.denyBash.length > 0;
  }

  /**
   * Generate a human-readable scope summary for task instructions.
   * @returns {string}
   */
  toSummary() {
    const lines = ['[SCOPE 제한 — 반드시 준수]'];

    if (this.description) {
      lines.push(`설명: ${this.description}`);
    }

    if (this.allowFiles.length > 0) {
      lines.push(`수정 허용 파일: ${this.allowFiles.join(', ')}`);
    }
    if (this.denyFiles.length > 0) {
      lines.push(`수정 금지 파일: ${this.denyFiles.join(', ')}`);
    }
    if (this.allowBash.length > 0) {
      lines.push(`허용 명령: ${this.allowBash.join(', ')}`);
    }
    if (this.denyBash.length > 0) {
      lines.push(`금지 명령: ${this.denyBash.join(', ')}`);
    }

    lines.push('스코프 밖 작업 시도 시 자동 거부됩니다.');
    return lines.join('\n');
  }

  /**
   * Simple glob matching supporting *, **, and ? patterns.
   * Not a full glob implementation — covers common cases.
   * @param {string} str
   * @param {string} pattern
   * @returns {boolean}
   */
  _matchGlob(str, pattern) {
    // Direct substring/prefix match for simple patterns
    if (!pattern.includes('*') && !pattern.includes('?')) {
      // Exact match or path prefix
      return str === pattern || str.startsWith(pattern + '/') || str.endsWith('/' + pattern) || str.includes('/' + pattern);
    }

    // Convert glob to regex
    let regex = pattern
      .replace(/\\/g, '/')
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '{{GLOBSTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]')
      .replace(/\{\{GLOBSTAR\}\}/g, '.*');

    // Allow matching from any path segment
    if (!regex.startsWith('.*') && !regex.startsWith('/')) {
      regex = '(^|/)' + regex;
    }

    try {
      return new RegExp(regex).test(str);
    } catch {
      return false;
    }
  }
}

/**
 * Resolve scope from multiple sources (priority: explicit > preset > default).
 * @param {Object} explicitScope - scope passed via --scope flag
 * @param {Object} config - full config object
 * @param {string} [presetName] - preset name from config.scope.presets
 * @returns {ScopeGuard|null}
 */
function resolveScope(explicitScope, config, presetName) {
  const scopeConfig = config.scope || {};

  // 1. Explicit scope from --scope flag
  if (explicitScope && Object.keys(explicitScope).length > 0) {
    return new ScopeGuard(explicitScope);
  }

  // 2. Named preset
  if (presetName && scopeConfig.presets && scopeConfig.presets[presetName]) {
    return new ScopeGuard(scopeConfig.presets[presetName]);
  }

  // 3. Default scope
  if (scopeConfig.defaultScope && Object.keys(scopeConfig.defaultScope).length > 0) {
    return new ScopeGuard(scopeConfig.defaultScope);
  }

  return null;
}

module.exports = { ScopeGuard, resolveScope };
