/**
 * Minimal virtual terminal that processes ANSI escape sequences
 * and maintains a screen buffer (what you'd actually SEE on a terminal).
 */
class ScreenBuffer {
  constructor(cols = 160, rows = 48) {
    this.cols = cols;
    this.rows = rows;
    this.cursorX = 0;
    this.cursorY = 0;
    this.lines = [];
    this.scrollback = [];
    this.maxScrollback = 2000;
    for (let i = 0; i < rows; i++) {
      this.lines.push('');
    }
    this._buf = ''; // partial escape sequence buffer
  }

  write(data) {
    this._buf += data;
    let i = 0;
    while (i < this._buf.length) {
      const ch = this._buf[i];

      if (ch === '\x1b') {
        // ESC sequence
        if (i + 1 >= this._buf.length) {
          // Incomplete, wait for more data
          this._buf = this._buf.slice(i);
          return;
        }
        const next = this._buf[i + 1];

        if (next === '[') {
          // CSI sequence: ESC [ ... letter
          const rest = this._buf.slice(i + 2);
          const m = rest.match(/^([0-9;?]*)([A-Za-z@`])/);
          if (!m) {
            if (rest.length > 32) { i += 2; continue; } // malformed, skip
            this._buf = this._buf.slice(i);
            return; // incomplete
          }
          const params = m[1];
          const cmd = m[2];
          this._handleCSI(params, cmd);
          i += 2 + m[0].length;
          continue;

        } else if (next === ']') {
          // OSC sequence: ESC ] ... (BEL or ST)
          const rest = this._buf.slice(i + 2);
          const belIdx = rest.indexOf('\x07');
          const stIdx = rest.indexOf('\x1b\\');
          let end = -1;
          let skip = 0;
          if (belIdx >= 0 && (stIdx < 0 || belIdx < stIdx)) {
            end = belIdx; skip = 1;
          } else if (stIdx >= 0) {
            end = stIdx; skip = 2;
          }
          if (end < 0) {
            if (rest.length > 256) { i += 2; continue; }
            this._buf = this._buf.slice(i);
            return;
          }
          // Skip OSC entirely
          i += 2 + end + skip;
          continue;

        } else if (next === '(' || next === ')') {
          // Charset designation, skip 3 bytes
          i += 3;
          continue;
        } else {
          // Other single-char escape
          i += 2;
          continue;
        }

      } else if (ch === '\r') {
        this.cursorX = 0;
        i++;
      } else if (ch === '\n') {
        this._linefeed();
        i++;
      } else if (ch === '\t') {
        this.cursorX = Math.min(this.cols - 1, (Math.floor(this.cursorX / 8) + 1) * 8);
        i++;
      } else if (ch === '\x07') {
        // BEL, ignore
        i++;
      } else if (ch === '\x08') {
        // Backspace
        if (this.cursorX > 0) this.cursorX--;
        i++;
      } else if (ch.charCodeAt(0) < 32) {
        // Other control chars, skip
        i++;
      } else {
        // Regular printable character
        this._putChar(ch);
        i++;
      }
    }
    this._buf = '';
  }

  _handleCSI(params, cmd) {
    const parts = params.split(';').map(p => parseInt(p) || 0);
    const n = parts[0] || 1;

    switch (cmd) {
      case 'A': // Cursor up
        this.cursorY = Math.max(0, this.cursorY - n);
        break;
      case 'B': // Cursor down
        this.cursorY = Math.min(this.rows - 1, this.cursorY + n);
        break;
      case 'C': // Cursor forward
        this.cursorX = Math.min(this.cols - 1, this.cursorX + n);
        break;
      case 'D': // Cursor back
        this.cursorX = Math.max(0, this.cursorX - n);
        break;
      case 'H': // Cursor position (row;col)
      case 'f':
        this.cursorY = Math.min(this.rows - 1, Math.max(0, (parts[0] || 1) - 1));
        this.cursorX = Math.min(this.cols - 1, Math.max(0, (parts[1] || 1) - 1));
        break;
      case 'J': // Erase in display
        if (n === 2 || n === 3) {
          // Clear entire screen
          for (let i = 0; i < this.rows; i++) this.lines[i] = '';
          this.cursorX = 0;
          this.cursorY = 0;
        } else if (parts[0] === 0) {
          // Clear from cursor to end
          this.lines[this.cursorY] = this.lines[this.cursorY].substring(0, this.cursorX);
          for (let i = this.cursorY + 1; i < this.rows; i++) this.lines[i] = '';
        } else if (parts[0] === 1) {
          // Clear from start to cursor
          this.lines[this.cursorY] = ' '.repeat(this.cursorX) + this.lines[this.cursorY].substring(this.cursorX);
          for (let i = 0; i < this.cursorY; i++) this.lines[i] = '';
        }
        break;
      case 'K': // Erase in line
        if (parts[0] === 0 || params === '') {
          // Clear from cursor to end of line
          this.lines[this.cursorY] = this.lines[this.cursorY].substring(0, this.cursorX);
        } else if (parts[0] === 1) {
          // Clear from start to cursor
          this.lines[this.cursorY] = ' '.repeat(this.cursorX) + this.lines[this.cursorY].substring(this.cursorX);
        } else if (parts[0] === 2) {
          // Clear entire line
          this.lines[this.cursorY] = '';
        }
        break;
      case 'S': // Scroll up
        for (let i = 0; i < n; i++) {
          this.scrollback.push(this.lines.shift());
          this.lines.push('');
          if (this.scrollback.length > this.maxScrollback) this.scrollback.shift();
        }
        break;
      case 'T': // Scroll down
        for (let i = 0; i < n; i++) {
          this.lines.pop();
          this.lines.unshift(this.scrollback.pop() || '');
        }
        break;
      case 'm': // SGR (colors etc) - ignore, we don't need colors
        break;
      case 'h': // Set mode - ignore
      case 'l': // Reset mode - ignore
        break;
      case 'G': // Cursor horizontal absolute
        this.cursorX = Math.min(this.cols - 1, Math.max(0, n - 1));
        break;
      case 'd': // Cursor vertical absolute
        this.cursorY = Math.min(this.rows - 1, Math.max(0, n - 1));
        break;
      case 'E': // Cursor next line
        this.cursorX = 0;
        this.cursorY = Math.min(this.rows - 1, this.cursorY + n);
        break;
      case 'F': // Cursor prev line
        this.cursorX = 0;
        this.cursorY = Math.max(0, this.cursorY - n);
        break;
      case 'L': // Insert lines
        for (let i = 0; i < n; i++) {
          this.lines.splice(this.cursorY, 0, '');
          this.lines.pop();
        }
        break;
      case 'M': // Delete lines
        for (let i = 0; i < n; i++) {
          this.lines.splice(this.cursorY, 1);
          this.lines.push('');
        }
        break;
      // r, s, u etc - scroll region, save/restore cursor - skip for now
    }
  }

  _putChar(ch) {
    if (this.cursorY >= this.rows) {
      this.cursorY = this.rows - 1;
    }

    let line = this.lines[this.cursorY] || '';

    // Pad line if cursor is past the end
    while (line.length < this.cursorX) {
      line += ' ';
    }

    // Overwrite character at cursor position
    line = line.substring(0, this.cursorX) + ch + line.substring(this.cursorX + 1);
    this.lines[this.cursorY] = line;

    this.cursorX++;
    if (this.cursorX >= this.cols) {
      this.cursorX = 0;
      this._linefeed();
    }
  }

  _linefeed() {
    this.cursorY++;
    if (this.cursorY >= this.rows) {
      // Scroll up
      this.scrollback.push(this.lines.shift());
      this.lines.push('');
      if (this.scrollback.length > this.maxScrollback) this.scrollback.shift();
      this.cursorY = this.rows - 1;
    }
  }

  // Get current visible screen as text
  getScreen() {
    const result = [];
    for (let i = 0; i < this.rows; i++) {
      result.push((this.lines[i] || '').trimEnd());
    }
    // Remove trailing empty lines
    while (result.length > 0 && result[result.length - 1] === '') {
      result.pop();
    }
    return result.join('\n');
  }

  // Get scrollback + screen (full history)
  getFullHistory(lastN = 200) {
    const all = [...this.scrollback.slice(-lastN), ...this.lines.map(l => (l || '').trimEnd())];
    while (all.length > 0 && all[all.length - 1] === '') all.pop();
    return all.join('\n');
  }
}

module.exports = ScreenBuffer;
