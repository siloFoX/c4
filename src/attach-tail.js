'use strict';

// Live tail of attached Claude Code session JSONL files.
//
// 8.32 slice 1 — read-side bidirectional sync. Watches a JSONL file
// path with fs.watch, on each change reads new bytes from the last
// recorded offset, parses with sessionParser.parseLine, and emits
// 'turn' events for each parsed turn. The write side (POST
// /attach/:name/input) lands in a follow-up slice; this module only
// covers the read path so the web UI sees new turns without polling.

const fs = require('fs');
const { EventEmitter } = require('events');
const sessionParser = require('./session-parser');

const DEFAULT_DEBOUNCE_MS = 50;

class AttachTail extends EventEmitter {
  constructor(filePath, opts = {}) {
    super();
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('filePath is required');
    }
    this.filePath = filePath;
    this.debounceMs = Number.isFinite(opts.debounceMs) ? opts.debounceMs : DEFAULT_DEBOUNCE_MS;
    // null => start at current EOF (live-only). 0 or positive number =>
    // explicit replay-from-offset (caller wants backfill).
    this._explicitOffset = Number.isFinite(opts.startOffset) && opts.startOffset >= 0
      ? opts.startOffset : null;
    this._offset = 0;
    this._partial = '';
    this._watcher = null;
    this._timer = null;
    this._closed = false;
    // Rotation signals: inode catches mv/rename, mtime catches
    // truncate-and-rewrite that happens to land near the old EOF
    // (Claude Code itself is append-only, but operators sometimes
    // copy a transcript over an attached path).
    this._lastInode = null;
    this._lastMtimeMs = null;
  }

  start() {
    if (this._closed) throw new Error('AttachTail closed');
    if (this._watcher) return;

    let initialSize = 0;
    try { initialSize = fs.statSync(this.filePath).size; }
    catch (err) {
      this.emit('error', err);
      return;
    }
    this._offset = this._explicitOffset !== null ? this._explicitOffset : initialSize;

    try {
      this._watcher = fs.watch(this.filePath, { persistent: false }, () => this._schedule());
    } catch (err) {
      this.emit('error', err);
      return;
    }

    // Flush whatever is already past the start offset (covers both
    // replay-from-zero and the race where the file grows between stat
    // and watch).
    this._schedule();
  }

  _schedule() {
    if (this._closed || this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      this._readNew();
    }, this.debounceMs);
  }

  _readNew() {
    if (this._closed) return;
    let stat;
    try { stat = fs.statSync(this.filePath); }
    catch (err) {
      this.emit('error', err);
      return;
    }
    // Rotation detection. Two signals we can act on without false
    // positives during normal append:
    //   (1) stat.size < this._offset — file truncated/shrunk under
    //       us (TRUNC then write a smaller payload, or rotated to a
    //       shorter session).
    //   (2) stat.ino !== this._lastInode — path now backs a
    //       different file (mv/symlink swap). fs.watch on the path
    //       does not always follow the new inode, but if our stat
    //       sees it we can reset.
    // We deliberately do NOT use mtime as a rotation signal because
    // every append bumps mtime. Truncate-and-rewrite to a slightly
    // larger payload is therefore not auto-detected; callers who
    // need that rare case should detach + re-attach.
    const rotated =
      stat.size < this._offset ||
      (this._lastInode !== null && stat.ino !== this._lastInode);
    if (rotated) {
      this._offset = 0;
      this._partial = '';
    }
    this._lastInode = stat.ino;
    this._lastMtimeMs = stat.mtimeMs;
    if (stat.size === this._offset) return;

    const length = stat.size - this._offset;
    const buf = Buffer.alloc(length);
    let fd;
    try {
      fd = fs.openSync(this.filePath, 'r');
      fs.readSync(fd, buf, 0, length, this._offset);
    } catch (err) {
      this.emit('error', err);
      try { if (fd !== undefined) fs.closeSync(fd); } catch { /* noop */ }
      return;
    }
    try { fs.closeSync(fd); } catch { /* noop */ }
    this._offset = stat.size;

    const text = this._partial + buf.toString('utf8');
    const lines = text.split('\n');
    // Last segment is incomplete unless the file ended with \n. Hold
    // it back so we don't try to JSON.parse a half-written event.
    this._partial = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      const warnings = [];
      const turns = sessionParser.parseLine(line, warnings);
      for (const turn of turns) {
        this.emit('turn', turn);
      }
      for (const w of warnings) {
        this.emit('warning', w);
      }
    }
  }

  stop() {
    if (this._closed) return;
    this._closed = true;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (this._watcher) {
      try { this._watcher.close(); } catch { /* noop */ }
      this._watcher = null;
    }
    this.emit('closed');
  }

  get currentOffset() {
    return this._offset;
  }
}

function watchAttachedSession(filePath, opts = {}) {
  const tail = new AttachTail(filePath, opts);
  tail.start();
  return tail;
}

module.exports = {
  AttachTail,
  watchAttachedSession,
  DEFAULT_DEBOUNCE_MS,
};
