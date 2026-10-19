import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pruneRawCache } from '../src/services/fastf1Service';

test('the oldest-downloaded races go until the cache fits, the newest always stays', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ff1-'));
  const race = (name: string, bytes: number, ageDays: number) => {
    const dir = path.join(root, '2026', name, 'Race');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'laps.ff1pkl');
    fs.writeFileSync(file, Buffer.alloc(bytes));
    const t = new Date(Date.now() - ageDays * 86400_000);
    fs.utimesSync(file, t, t);
  };
  race('old', 400, 3);
  race('mid', 400, 2);
  race('new', 400, 1);

  pruneRawCache(root, 900);
  assert.deepEqual(fs.readdirSync(path.join(root, '2026')).sort(), ['mid', 'new']);

  pruneRawCache(root, 10); // over even with one race: that one stays
  assert.deepEqual(fs.readdirSync(path.join(root, '2026')), ['new']);
  fs.rmSync(root, { recursive: true, force: true });
});
