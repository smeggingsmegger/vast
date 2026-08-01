import type { MongoClient } from 'mongodb';
import { toEJSON } from './ejson.js';

export class AdminService {
  constructor(private readonly client: MongoClient) {}

  async serverInfo(): Promise<unknown> {
    const buildInfo = await this.client.db('admin').command({ buildInfo: 1 });
    let hello: unknown = null;
    try {
      hello = await this.client.db('admin').command({ hello: 1 });
    } catch {
      // ignore
    }
    return toEJSON({ buildInfo, hello });
  }

  async serverStatus(): Promise<unknown> {
    try {
      const status = await this.client.db('admin').command({ serverStatus: 1 });
      // Return a subset to keep payload manageable
      const s = status as Record<string, unknown>;
      return toEJSON({
        host: s.host,
        version: s.version,
        process: s.process,
        uptime: s.uptime,
        connections: s.connections,
        opcounters: s.opcounters,
        mem: s.mem,
        network: s.network,
      });
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : 'serverStatus not available',
      };
    }
  }

  async currentOp(): Promise<unknown> {
    try {
      const result = await this.client.db('admin').command({ currentOp: 1 });
      return toEJSON(result);
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'currentOp failed' };
    }
  }
}
