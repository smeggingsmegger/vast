import type { ConnectionManager } from '@vast/mongo-core';
import type { VastConfig } from './config.js';
import type { Logger } from './logger.js';
import type { ConnectionStore } from './store/connection-store.js';
import type { JobService } from './jobs.js';

export interface AppContext {
  config: VastConfig;
  log: Logger;
  connections: ConnectionManager;
  store: ConnectionStore;
  jobs: JobService;
  startedAt: number;
}
