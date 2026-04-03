/**
 * SummaryLayer (3.14)
 *
 * Summarizes long worker output snapshots for efficient context transfer.
 * When a snapshot exceeds the threshold, it is condensed into key sections:
 * - Errors and warnings
 * - File changes (write/edit/create)
 * - Test results
 * - Key decisions or questions
 * - Last N lines as tail context
 */

class SummaryLayer {
  /**
   * @param {object} options
   * @param {number} options.threshold  - Character threshold for summarization (default: 500)
   * @param {number} options.tailLines  - Number of tail lines to keep (default: 10)
   * @param {number} options.maxSummary - Max characters in summary (default: 500)
   */
  constructor(options = {}) {
    this.threshold = options.threshold || 500;
    this.tailLines = options.tailLines || 10;
    this.maxSummary = options.maxSummary || 500;
  }

  /**
   * Check if text needs summarization.
   */
  needsSummary(text) {
    if (!text) return false;
    return text.length > this.threshold;
  }

  /**
   * Summarize a long snapshot text.
   * Returns { summary, originalLength, summarized: true } or { text, summarized: false }.
   */
  summarize(text) {
    if (!text) return { text: '', summarized: false };
    if (!this.needsSummary(text)) return { text, summarized: false };

    const lines = text.split('\n');
    const sections = {
      errors: [],
      files: [],
      tests: [],
      decisions: [],
      c4markers: [],
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // C4 system markers (always keep)
      if (trimmed.startsWith('[C4') || trimmed.startsWith('[HEALTH]') ||
          trimmed.startsWith('[SCOPE') || trimmed.startsWith('[STATE]') ||
          trimmed.startsWith('[QUESTION]') || trimmed.startsWith('[ESCALATION]') ||
          trimmed.startsWith('[ROUTINE') || trimmed.startsWith('[TOKEN') ||
          trimmed.startsWith('[SSH') || trimmed.startsWith('[ROLLBACK]')) {
        sections.c4markers.push(trimmed);
        continue;
      }

      // Errors and warnings
      if (/error|Error|ERROR|FAIL|failed|실패|에러|warning|Warning/i.test(trimmed)) {
        sections.errors.push(trimmed);
        continue;
      }

      // File operations
      if (/\b(Write|Edit|Create|wrote|edited|created)\b.*\.(js|ts|py|md|json|yaml|yml|txt|css|html)/i.test(trimmed) ||
          /파일.*(?:생성|수정|작성)/i.test(trimmed)) {
        sections.files.push(trimmed);
        continue;
      }

      // Test results
      if (/test|Tests?:|jest|mocha|pytest|테스트/i.test(trimmed)) {
        sections.tests.push(trimmed);
        continue;
      }

      // Decisions / questions
      if (/할까요|should I|decided|결정|선택|approach/i.test(trimmed)) {
        sections.decisions.push(trimmed);
        continue;
      }
    }

    // Build summary
    const parts = [];

    if (sections.c4markers.length > 0) {
      parts.push(sections.c4markers.join('\n'));
    }

    if (sections.errors.length > 0) {
      const errSlice = sections.errors.slice(0, 5);
      parts.push('[Errors]\n' + errSlice.join('\n'));
    }

    if (sections.tests.length > 0) {
      const testSlice = sections.tests.slice(0, 3);
      parts.push('[Tests]\n' + testSlice.join('\n'));
    }

    if (sections.files.length > 0) {
      const fileSlice = sections.files.slice(0, 5);
      parts.push('[Files]\n' + fileSlice.join('\n'));
    }

    if (sections.decisions.length > 0) {
      const decSlice = sections.decisions.slice(0, 3);
      parts.push('[Decisions]\n' + decSlice.join('\n'));
    }

    // Tail lines for context
    const tail = lines.slice(-this.tailLines).join('\n').trim();
    if (tail) {
      parts.push('[Tail]\n' + tail);
    }

    let summary = parts.join('\n\n');

    // Truncate if still too long
    if (summary.length > this.maxSummary) {
      summary = summary.slice(0, this.maxSummary - 3) + '...';
    }

    return {
      summary,
      originalLength: text.length,
      summarized: true,
    };
  }

  /**
   * Process a snapshot — summarize if needed, otherwise return as-is.
   */
  process(snapshot) {
    if (!snapshot || !snapshot.screen) return snapshot;
    if (snapshot.autoAction) return snapshot; // Don't summarize C4 system snapshots

    const result = this.summarize(snapshot.screen);
    if (!result.summarized) return snapshot;

    return {
      ...snapshot,
      screen: result.summary,
      _originalLength: result.originalLength,
      _summarized: true,
    };
  }
}

module.exports = SummaryLayer;
