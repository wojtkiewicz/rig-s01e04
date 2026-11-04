import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const night = '2026-10-30';
const run = JSON.stringify({
  at: '2026-10-30T01:02:03+01:00',
  job: 'nightly/build',
  status: 'fail',
  owner: 'rook',
  error: 'compiler exited',
});

const temporaryRunsDirs: string[] = [];

function makeRunsDir() {
  const runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  temporaryRunsDirs.push(runsDir);
  return runsDir;
}

afterEach(() => {
  for (const runsDir of temporaryRunsDirs.splice(0)) {
    rmSync(runsDir, { recursive: true, force: true });
  }
});

describe('digest routes', () => {
  describe('GET /digest/:night', () => {
    it('renders a night with parsed rows', async () => {
      const runsDir = makeRunsDir();
      writeFileSync(join(runsDir, `${night}.jsonl`), `${run}\n`);

      const response = await createApp({
        adapter: 'shim',
        installed: '2026-10-29T14:06:00+01:00',
        beatEverySeconds: 60,
        runsDir,
      }).request(`/digest/${night}`);
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(html).toContain('nightly/build');
      expect(html).toContain('rook');
      expect(html).toContain('compiler exited');
    });

    it('returns 404 when the night file is missing', async () => {
      const runsDir = makeRunsDir();

      const response = await createApp({
        adapter: 'shim',
        installed: '2026-10-29T14:06:00+01:00',
        beatEverySeconds: 60,
        runsDir,
      }).request(`/digest/${night}`);

      expect(response.status).toBe(404);
    });

    it('renders an empty file as nothing ran', async () => {
      const runsDir = makeRunsDir();
      writeFileSync(join(runsDir, `${night}.jsonl`), '');

      const response = await createApp({
        adapter: 'shim',
        installed: '2026-10-29T14:06:00+01:00',
        beatEverySeconds: 60,
        runsDir,
      }).request(`/digest/${night}`);
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(html).toContain('nothing ran');
    });

    it('renders valid rows when a line is malformed', async () => {
      const runsDir = makeRunsDir();
      writeFileSync(join(runsDir, `${night}.jsonl`), `not json\n${run}\n`);

      const response = await createApp({
        adapter: 'shim',
        installed: '2026-10-29T14:06:00+01:00',
        beatEverySeconds: 60,
        runsDir,
      }).request(`/digest/${night}`);
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(html).toContain('nightly/build');
      expect(html).toContain('compiler exited');
    });
  });

  describe('GET /api/digest/:night', () => {
    it('returns a night with parsed rows as JSON', async () => {
      const runsDir = makeRunsDir();
      writeFileSync(join(runsDir, `${night}.jsonl`), `${run}\n`);

      const response = await createApp({
        adapter: 'shim',
        installed: '2026-10-29T14:06:00+01:00',
        beatEverySeconds: 60,
        runsDir,
      }).request(`/api/digest/${night}`);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        rows: [
          {
            job: 'nightly/build',
            owner: 'rook',
            runs: 1,
            retries: 0,
            lastStatus: 'fail',
            lastError: 'compiler exited',
            firstAt: '2026-10-30T01:02:03+01:00',
            lastAt: '2026-10-30T01:02:03+01:00',
          },
        ],
        malformedLines: 0,
      });
    });

    it('returns 404 when the night file is missing', async () => {
      const runsDir = makeRunsDir();

      const response = await createApp({
        adapter: 'shim',
        installed: '2026-10-29T14:06:00+01:00',
        beatEverySeconds: 60,
        runsDir,
      }).request(`/api/digest/${night}`);

      expect(response.status).toBe(404);
    });

    it('returns an empty digest for an empty file', async () => {
      const runsDir = makeRunsDir();
      writeFileSync(join(runsDir, `${night}.jsonl`), '');

      const response = await createApp({
        adapter: 'shim',
        installed: '2026-10-29T14:06:00+01:00',
        beatEverySeconds: 60,
        runsDir,
      }).request(`/api/digest/${night}`);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ rows: [], malformedLines: 0 });
    });

    it('returns valid rows and counts malformed lines', async () => {
      const runsDir = makeRunsDir();
      writeFileSync(join(runsDir, `${night}.jsonl`), `not json\n${run}\n`);

      const response = await createApp({
        adapter: 'shim',
        installed: '2026-10-29T14:06:00+01:00',
        beatEverySeconds: 60,
        runsDir,
      }).request(`/api/digest/${night}`);

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        rows: [
          {
            job: 'nightly/build',
            lastStatus: 'fail',
            lastError: 'compiler exited',
          },
        ],
        malformedLines: 1,
      });
    });
  });
});
