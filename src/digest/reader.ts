import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightDigest, ReadNight, RunStatus } from './types.js';

type RunRecord = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRunStatus(value: unknown): value is RunStatus {
  return value === 'ok' || value === 'retry' || value === 'fail';
}

function parseRunRecord(value: unknown): RunRecord | null {
  if (!isRecord(value)) return null;

  const { at, job, status, owner, error } = value;
  if (
    typeof at !== 'string' ||
    at.trim().length === 0 ||
    typeof job !== 'string' ||
    job.trim().length === 0 ||
    !isRunStatus(status) ||
    (typeof owner !== 'string' && owner !== null) ||
    (error !== undefined && typeof error !== 'string')
  ) {
    return null;
  }

  if (error === undefined) return { at, job, status, owner };
  return { at, job, status, owner, error };
}

export const readNight: ReadNight = (runsDir, night): NightDigest => {
  const content = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  const rows = new Map<string, DigestRow>();
  let malformedLines = 0;

  for (const line of content.split(/\r?\n/)) {
    if (line.trim().length === 0) continue;

    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      malformedLines += 1;
      continue;
    }

    const record = parseRunRecord(value);
    if (record === null) {
      malformedLines += 1;
      continue;
    }

    const existing = rows.get(record.job);
    if (existing === undefined) {
      rows.set(record.job, {
        job: record.job,
        owner: record.owner,
        runs: 1,
        retries: record.status === 'retry' ? 1 : 0,
        lastStatus: record.status,
        lastError: record.error ?? null,
        firstAt: record.at,
        lastAt: record.at,
      });
      continue;
    }

    rows.set(record.job, {
      ...existing,
      owner: record.owner,
      runs: existing.runs + 1,
      retries: existing.retries + (record.status === 'retry' ? 1 : 0),
      lastStatus: record.status,
      lastError: record.error ?? existing.lastError,
      lastAt: record.at,
    });
  }

  return { rows: [...rows.values()], malformedLines };
};
