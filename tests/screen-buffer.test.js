const assert = require('assert');
const { describe, it } = require('node:test');
const ScreenBuffer = require('../src/screen-buffer');

describe('ScreenBuffer Improvements (3.8)', () => {
  describe('CSI P — Delete Characters', () => {
    it('deletes characters at cursor position', () => {
      const sb = new ScreenBuffer(80, 24);
      sb.write('Hello World');
      sb.cursorX = 5;
      sb._handleCSI('1', 'P'); // delete 1 char at position 5
      assert.strictEqual(sb.lines[0], 'HelloWorld');
    });

    it('deletes multiple characters', () => {
      const sb = new ScreenBuffer(80, 24);
      sb.write('ABCDEFGH');
      sb.cursorX = 2;
      sb._handleCSI('3', 'P'); // delete 3 chars
      assert.strictEqual(sb.lines[0], 'ABFGH');
    });
  });

  describe('CSI @ — Insert Characters', () => {
    it('inserts blank characters at cursor', () => {
      const sb = new ScreenBuffer(80, 24);
      sb.write('ABCDEF');
      sb.cursorX = 3;
      sb._handleCSI('2', '@'); // insert 2 blanks
      assert.strictEqual(sb.lines[0], 'ABC  DEF');
    });
  });

  describe('CSI X — Erase Characters', () => {
    it('replaces characters with spaces', () => {
      const sb = new ScreenBuffer(80, 24);
      sb.write('Hello World');
      sb.cursorX = 5;
      sb._handleCSI('3', 'X'); // erase 3 chars
      assert.strictEqual(sb.lines[0], 'Hello   rld');
    });
  });

  describe('CSI s/u — Save/Restore Cursor', () => {
    it('saves and restores cursor position', () => {
      const sb = new ScreenBuffer(80, 24);
      sb.cursorX = 10;
      sb.cursorY = 5;
      sb._handleCSI('', 's'); // save
      sb.cursorX = 0;
      sb.cursorY = 0;
      sb._handleCSI('', 'u'); // restore
      assert.strictEqual(sb.cursorX, 10);
      assert.strictEqual(sb.cursorY, 5);
    });
  });

  describe('CSI r — Set Scroll Region', () => {
    it('sets scroll region top and bottom', () => {
      const sb = new ScreenBuffer(80, 24);
      sb._handleCSI('5;20', 'r');
      assert.strictEqual(sb._scrollTop, 4);  // 1-based → 0-based
      assert.strictEqual(sb._scrollBottom, 19);
    });
  });

  describe('CSI b — Repeat Character', () => {
    it('repeats last printed character', () => {
      const sb = new ScreenBuffer(80, 24);
      sb.write('A');
      sb._handleCSI('4', 'b'); // repeat 'A' 4 times
      assert.strictEqual(sb.lines[0], 'AAAAA');
    });
  });

  describe('CSI I/Z — Tab Stops', () => {
    it('forward tabulation', () => {
      const sb = new ScreenBuffer(80, 24);
      sb.cursorX = 3;
      sb._handleCSI('1', 'I');
      assert.strictEqual(sb.cursorX, 8);
    });

    it('backward tabulation', () => {
      const sb = new ScreenBuffer(80, 24);
      sb.cursorX = 10;
      sb._handleCSI('1', 'Z');
      assert.strictEqual(sb.cursorX, 8);
    });
  });

  describe('getScrollback()', () => {
    it('returns empty string when no scrollback', () => {
      const sb = new ScreenBuffer(80, 5);
      assert.strictEqual(sb.getScrollback(), '');
    });

    it('returns scrollback lines', () => {
      const sb = new ScreenBuffer(80, 3);
      sb.maxScrollback = 100;
      // Write enough lines to fill screen and push to scrollback
      sb.write('line1\nline2\nline3\nline4\nline5\n');
      assert.ok(sb.scrollback.length > 0);
      const result = sb.getScrollback();
      assert.ok(result.includes('line1'));
    });

    it('respects lastN parameter', () => {
      const sb = new ScreenBuffer(80, 3);
      sb.maxScrollback = 100;
      for (let i = 0; i < 20; i++) {
        sb.write(`scrollline${i}\n`);
      }
      const result = sb.getScrollback(3);
      const lines = result.split('\n').filter(l => l.trim());
      assert.ok(lines.length <= 3);
    });
  });

  describe('Full ANSI escape sequence via write()', () => {
    it('handles CSI P via escape sequence', () => {
      const sb = new ScreenBuffer(80, 24);
      sb.write('Hello World');
      sb.write('\x1b[6G'); // move cursor to column 6
      sb.write('\x1b[3P'); // delete 3 chars
      assert.strictEqual(sb.lines[0], 'Hellorld');
    });

    it('handles CSI @ via escape sequence', () => {
      const sb = new ScreenBuffer(80, 24);
      sb.write('ABCDEF');
      sb.write('\x1b[4G'); // move cursor to column 4
      sb.write('\x1b[2@'); // insert 2 blanks
      assert.strictEqual(sb.lines[0], 'ABC  DEF');
    });

    it('handles save/restore cursor via escape sequence', () => {
      const sb = new ScreenBuffer(80, 24);
      sb.write('ABC');
      sb.write('\x1b[s');  // save cursor
      sb.write('\x1b[1;1H'); // move to top-left
      sb.write('X');
      sb.write('\x1b[u');  // restore cursor
      assert.strictEqual(sb.cursorX, 3);
      assert.strictEqual(sb.cursorY, 0);
    });
  });

  describe('Constructor initializes new fields', () => {
    it('initializes saved cursor and scroll region', () => {
      const sb = new ScreenBuffer(80, 24);
      assert.strictEqual(sb._savedCursorX, 0);
      assert.strictEqual(sb._savedCursorY, 0);
      assert.strictEqual(sb._scrollTop, 0);
      assert.strictEqual(sb._scrollBottom, 23);
      assert.strictEqual(sb._lastPrintedChar, null);
    });
  });
});
