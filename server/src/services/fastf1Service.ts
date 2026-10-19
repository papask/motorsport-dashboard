import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import NodeCache from 'node-cache';
import { raceSettled } from './jolpicaService';

// Cache FastF1 results for 10 minutes (FastF1 has its own file cache, but this avoids re-spawning Python helper)
const cache = new NodeCache({ stdTTL: 600 });

const SERVER_ROOT = path.resolve(__dirname, '..', '..');

// Resolve the Python executable: PYTHON_PATH if set, then the local venv
// (server/venv on Windows or macOS/Linux), then the system Python.
function resolvePython(): string {
  if (process.env.PYTHON_PATH) return process.env.PYTHON_PATH;
  const candidates = [
    path.join(SERVER_ROOT, 'venv', 'Scripts', 'python.exe'),
    path.join(SERVER_ROOT, 'venv', 'bin', 'python'),
  ];
  const venv = candidates.find((p) => fs.existsSync(p));
  if (venv) return venv;
  return process.platform === 'win32' ? 'python' : 'python3';
}

const PYTHON = resolvePython();

// The helper stays in src/ so the compiled server (dist/) finds it too
const HELPER_SCRIPT = path.join(SERVER_ROOT, 'src', 'services', 'fastf1_helper.py');

// ponytail: one helper at a time; parallel cold loads OOM a 512MB host. Allow N at once on bigger instances.
let queue: Promise<unknown> = Promise.resolve();

// A settled race's outputs are kept on disk, so asking again never starts
// Python (whose load is what peaks memory). ~2MB a race with every driver's telemetry.
const SAVED_DIR = path.join(process.env.DATA_DIR || path.join(SERVER_ROOT, 'data'), 'fastf1_results');
// FastF1's own download cache runs 80-150MB a race; past FASTF1_CACHE_MAX_MB
// the races downloaded longest ago are deleted (their saved outputs stay).
// Unset (local dev), nothing is deleted.
const RAW_CACHE_DIR = process.env.FASTF1_CACHE_DIR || path.join(SERVER_ROOT, 'fastf1_cache');
const RAW_CACHE_MAX_BYTES = Number(process.env.FASTF1_CACHE_MAX_MB) * 2 ** 20 || Infinity;

/** The saved output's file; none for args that aren't plain tokens (they come from request params). */
const savedFile = (action: string, args: string[]) =>
  args.length >= 2 && [action, ...args].every((a) => /^[\w-]+$/.test(a))
    ? path.join(SAVED_DIR, `${action}_${args.join('_')}.json`)
    : undefined;

function readSaved(file: string | undefined) {
  try {
    return file ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
  } catch {
    return undefined;
  }
}

/** Saves an output once its race has settled; a `reason` answer (data not out yet) is left to be asked again. */
async function saveIfSettled(file: string | undefined, args: string[], result: any) {
  if (!file || result?.reason || !(await raceSettled(Number(args[0]), Number(args[1])))) return;
  fs.mkdirSync(SAVED_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(result));
}

/**
 * Deletes FastF1's cached races (root/<year>/<event>), oldest download first,
 * until the cache fits `maxBytes`; the newest race always stays.
 */
// ponytail: age is by download time (FastF1 reads don't touch mtime); saved outputs make re-reads rare
export function pruneRawCache(root = RAW_CACHE_DIR, maxBytes = RAW_CACHE_MAX_BYTES) {
  if (maxBytes === Infinity || !fs.existsSync(root)) return;
  const sizeAndAge = (dir: string) => fs.readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => fs.statSync(path.join(e.parentPath, e.name)))
    .reduce((acc, s) => ({ size: acc.size + s.size, mtime: Math.max(acc.mtime, s.mtimeMs) }), { size: 0, mtime: 0 });
  const events = fs.readdirSync(root, { withFileTypes: true })
    .filter((y) => y.isDirectory())
    .flatMap((y) => fs.readdirSync(path.join(root, y.name), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => ({ dir: path.join(root, y.name, e.name), ...sizeAndAge(path.join(root, y.name, e.name)) })))
    .sort((a, b) => a.mtime - b.mtime);
  let total = sizeAndAge(root).size;
  for (const e of events.slice(0, -1)) {
    if (total <= maxBytes) break;
    fs.rmSync(e.dir, { recursive: true, force: true });
    total -= e.size;
    console.log(`[FastF1] cache over ${maxBytes / 2 ** 20}MB, removed ${path.relative(root, e.dir)}`);
  }
}

function runFastF1(action: string, args: string[]): Promise<any> {
  const cacheKey = `fastf1:${action}:${args.join(':')}`;
  const cached = cache.get(cacheKey);
  if (cached) return Promise.resolve(cached);
  const file = savedFile(action, args);
  const saved = readSaved(file);
  if (saved) {
    cache.set(cacheKey, saved);
    return Promise.resolve(saved);
  }

  // Re-check the cache once it's our turn: a queued duplicate may have filled it.
  // Pruning runs inside the turn, so it never deletes under a running helper.
  const run = queue.then(() => cache.get(cacheKey) ?? spawnHelper(action, args, cacheKey).finally(() => {
    try {
      pruneRawCache();
    } catch (err: any) {
      console.error('[FastF1] cache prune failed:', err.message);
    }
  }));
  queue = run.catch(() => {});
  run.then((result) => saveIfSettled(file, args, result)).catch((err) => console.error('[FastF1] save failed:', err.message));
  return run;
}

/**
 * Spawn the FastF1 Python helper and parse JSON output.
 */
function spawnHelper(action: string, args: string[], cacheKey: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, [HELPER_SCRIPT, action, ...args], {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('close', (code) => {
      if (code !== 0) {
        console.error(`[FastF1] Python exited with code ${code}`);
        console.error(`[FastF1] stderr: ${stderr}`);
        // Try to parse stdout for error JSON
        try {
          const errObj = JSON.parse(stdout);
          if (errObj.error) {
            return reject(new Error(`FastF1 Error: ${errObj.error}`));
          }
        } catch {
          // ignore parse error
        }
        return reject(new Error(`FastF1 helper failed (code ${code}): ${stderr || stdout}`));
      }

      try {
        const result = JSON.parse(stdout);
        if (result.error) {
          return reject(new Error(`FastF1 Error: ${result.error}`));
        }
        cache.set(cacheKey, result);
        resolve(result);
      } catch (parseErr) {
        console.error(`[FastF1] Failed to parse JSON output:`, stdout.slice(0, 500));
        reject(new Error('Failed to parse FastF1 output'));
      }
    });

    child.on('error', (err) => {
      console.error(`[FastF1] Failed to spawn python:`, err.message);
      reject(new Error(`Failed to run FastF1: ${err.message}`));
    });

    // Timeout: 120 seconds (first call may take a while to download data)
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('FastF1 request timed out (120s)'));
    }, 120000);

    child.on('close', () => clearTimeout(timeout));
  });
}

// ============ Public API ============

export async function getSchedule(year: string | number) {
  return runFastF1('schedule', [String(year)]);
}

export async function getResults(year: string | number, round: string | number) {
  return runFastF1('results', [String(year), String(round)]);
}

export async function getTimeline(year: string | number, round: string | number, sessionId: string = 'R') {
  return runFastF1('timeline', [String(year), String(round), sessionId]);
}

export async function getTimelineExtras(year: string | number, round: string | number, sessionId: string = 'R') {
  return runFastF1('timeline_extras', [String(year), String(round), sessionId]);
}

export async function getTelemetry(year: string | number, round: string | number, driverNumber: string | number, lap?: string | number) {
  const args = [String(year), String(round), String(driverNumber)];
  if (lap != null && lap !== '') args.push(String(lap));
  return runFastF1('telemetry', args);
}

export async function getIncidents(year: string | number, round: string | number) {
  return runFastF1('incidents', [String(year), String(round)]);
}

export async function getSessions(year: string | number, round: string | number) {
  return runFastF1('sessions', [String(year), String(round)]);
}

/** One session's classification (R, S, Q or SQ), for the Threads results post. */
export async function getSessionResults(year: string | number, round: string | number, session: string) {
  return runFastF1('session_results', [String(year), String(round), session]);
}

/** An event's pole lap read as a circuit profile: speed trace, outline, corners, totals. */
export async function getTrackProfile(year: string | number, round: string | number) {
  return runFastF1('track_profile', [String(year), String(round)]);
}

export async function getDrivers(year: string | number, round: string | number) {
  return runFastF1('drivers', [String(year), String(round)]);
}

/**
 * What data exists for a session, answered without loading car telemetry.
 *
 * Lets the client decide whether a one-to-two-minute telemetry fetch is worth
 * starting, instead of making someone wait through it to be told there is
 * nothing there.
 */
export async function getAvailability(
  year: string | number,
  round: string | number,
  session: string = 'R'
) {
  return runFastF1('availability', [String(year), String(round), String(session)]);
}
