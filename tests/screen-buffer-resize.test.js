'use strict';

// ScreenBuffer.resize (8.13)
const assert = require('assert');
const { describe, it } = require('node:test');
const ScreenBuffer = require('../src/screen-buffer');

describe('ScreenBuffer.resize (8.13)', () => {
  it('is a no-op when dimensions are unchanged', () => {
    const sb = new ScreenBuffer(80, 24);
    sb.write('hello');
    const res = sb.resize(80, 24);
    assert.strictEqual(res.cols, 80);
    assert.strictEqual(res.rows, 24);
    assert.strictEqual(sb.lines[0], 'hello');
  });

  it('pushes overflow rows into scrollback when rows shrink', () => {
    const sb = new ScreenBuffer(80, 5);
    sb.maxScrollback = 50;
    sb.lines[0] = 'line0';
    sb.lines[1] = 'line1';
    sb.lines[2] = 'line2';
    sb.lines[3] = 'line3';
    sb.lines[4] = 'line4';
    sb.resize(80, 3);
    assert.strictEqual(sb.rows, 3);
    assert.strictEqual(sb.lines.length, 3);
    assert.deepStrictEqual(sb.lines, ['line2', 'line3', 'line4']);
    assert.ok(sb.scrollback.includes('line0'));
    assert.ok(sb.scrollback.includes('line1'));
  });

  it('pads with empty lines when rows grow', () => {
    const sb = new ScreenBuffer(80, 3);
    sb.lines[0] = 'keep0';
    sb.lines[1] = 'keep1';
    sb.lines[2] = 'keep2';
    sb.resize(80, 6);
    assert.strictEqual(sb.rows, 6);
    assert.strictEqual(sb.lines.length, 6);
    assert.strictEqual(sb.lines[0], 'keep0');
    assert.strictEqual(sb.lines[5], '');
  });

  it('truncates each line on the right when cols shrink', () => {
    const sb = new ScreenBuffer(20, 3);
    sb.lines[0] = 'abcdefghij12345';
    sb.lines[1] = 'short';
    sb.resize(8, 3);
    assert.strictEqual(sb.cols, 8);
    assert.strictEqual(sb.lines[0], 'abcdefgh');
    assert.strictEqual(sb.lines[1], 'short');
  });

  it('leaves short lines untouched when cols grow', () => {
    const sb = new ScreenBuffer(10, 3);
    sb.lines[0] = 'abc';
    sb.resize(40, 3);
    assert.strictEqual(sb.cols, 40);
    assert.strictEqual(sb.lines[0], 'abc');
  });

  it('clamps cursor inside the new bounds', () => {
    const sb = new ScreenBuffer(80, 24);
    sb.cursorX = 70;
    sb.cursorY = 20;
    sb.resize(40, 10);
    assert.ok(sb.cursorX <= 39);
    assert.ok(sb.cursorY <= 9);
  });

  it('clamps saved cursor and scroll region', () => {
    const sb = new ScreenBuffer(80, 24);
    sb._savedCursorX = 70;
    sb._savedCursorY = 20;
    sb._scrollTop = 15;
    sb._scrollBottom = 23;
    sb.resize(40, 10);
    assert.ok(sb._savedCursorX <= 39);
    assert.ok(sb._savedCursorY <= 9);
    assert.ok(sb._scrollTop <= 9);
    assert.ok(sb._scrollBottom <= 9);
    assert.ok(sb._scrollBottom >= sb._scrollTop);
  });

  it('respects maxScrollback when pushing overflow lines', () => {
    const sb = new ScreenBuffer(80, 5);
    sb.maxScrollback = 2;
    for (let i = 0; i < 5; i++) sb.lines[i] = `L${i}`;
    sb.resize(80, 1);
    assert.ok(sb.scrollback.length <= 2);
    assert.deepStrictEqual(sb.lines, ['L4']);
  });

  it('coerces non-numeric or non-positive input to sane bounds', () => {
    const sb = new ScreenBuffer(80, 24);
    sb.resize(0, -5);
    assert.strictEqual(sb.cols, 1);
    assert.strictEqual(sb.rows, 1);
    sb.resize('120', '30');
    assert.strictEqual(sb.cols, 120);
    assert.strictEqual(sb.rows, 30);
  });

  it('keeps writing sensibly after a resize', () => {
    const sb = new ScreenBuffer(80, 5);
    sb.write('first\n');
    sb.resize(40, 3);
    sb.write('second\n');
    // first was pushed to scrollback by the shrink; second lives on screen.
    assert.ok(sb.getFullHistory().includes('first'));
    assert.ok(sb.getScreen().includes('second'));
    assert.strictEqual(sb.cols, 40);
    assert.strictEqual(sb.rows, 3);
  });

  it('re-flows scrollback lines to the new cols when cols shrink (8.22)', () => {
    const sb = new ScreenBuffer(80, 3);
    sb.maxScrollback = 100;
    // Manually seed scrollback with three lines whose lengths span one,
    // two, and three full new-width wraps.
    sb.scrollback = [
      'abcdefghij',          // 10 chars, fits into 10-col wraps as one chunk
      'AAAAAAAAAABBBBBBBBBB', // 20 chars -> two wraps
      'xxxxxxxxxxyyyyyyyyyyzzzzzzzzzz', // 30 chars -> three wraps
    ];
    sb.resize(10, 3);
    assert.strictEqual(sb.cols, 10);
    // 1 + 2 + 3 = 6 scrollback entries after re-flow, each <= 10 chars.
    assert.strictEqual(sb.scrollback.length, 6);
    for (const line of sb.scrollback) {
      assert.ok(line.length <= 10, `line exceeds new cols: ${line}`);
    }
    assert.deepStrictEqual(sb.scrollback, [
      'abcdefghij',
      'AAAAAAAAAA', 'BBBBBBBBBB',
      'xxxxxxxxxx', 'yyyyyyyyyy', 'zzzzzzzzzz',
    ]);
  });

  it('caps re-flowed scrollback at maxScrollback, keeping the newest rows', () => {
    const sb = new ScreenBuffer(80, 3);
    sb.maxScrollback = 4;
    // Seed five 30-char lines that each re-flow to three 10-col chunks
    // (15 chunks total); the cap should keep only the last 4.
    sb.scrollback = [
      'aaaaaaaaaabbbbbbbbbbcccccccccc',
      'ddddddddddeeeeeeeeeeffffffffff',
      'ggggggggggHHHHHHHHHHiiiiiiiiii',
      'jjjjjjjjjjkkkkkkkkkkllllllllll',
      'mmmmmmmmmmnnnnnnnnnnoooooooooo',
    ];
    sb.resize(10, 3);
    assert.strictEqual(sb.scrollback.length, 4);
    // The last entry of the last source line must still be present.
    assert.strictEqual(sb.scrollback[sb.scrollback.length - 1], 'oooooooooo');
  });

  it('leaves scrollback untouched when cols grow', () => {
    const sb = new ScreenBuffer(40, 3);
    const before = ['short', 'another short'];
    sb.scrollback = before.slice();
    sb.resize(80, 3);
    assert.deepStrictEqual(sb.scrollback, before);
  });
});
