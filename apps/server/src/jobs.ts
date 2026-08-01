import { randomUUID } from 'node:crypto';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface JobRecord {
  id: string;
  type: string;
  status: JobStatus;
  progress: { processed: number; total?: number; message?: string };
  result?: unknown;
  error?: string;
  createdAt: string;
  updatedAt: string;
  artifactPath?: string;
}

export class JobService {
  private readonly jobs = new Map<string, JobRecord>();
  readonly jobsDir: string;

  constructor(dataDir: string) {
    this.jobsDir = join(dataDir, 'jobs');
    mkdirSync(this.jobsDir, { recursive: true });
  }

  create(type: string): JobRecord {
    const now = new Date().toISOString();
    const job: JobRecord = {
      id: randomUUID(),
      type,
      status: 'queued',
      progress: { processed: 0 },
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  get(id: string): JobRecord | undefined {
    return this.jobs.get(id);
  }

  list(): JobRecord[] {
    return [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  update(id: string, patch: Partial<JobRecord>): JobRecord | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
    return job;
  }

  artifactDir(jobId: string): string {
    const dir = join(this.jobsDir, jobId);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }
}
