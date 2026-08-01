import { createServer, type Server, type Socket as NetSocket, type AddressInfo } from 'node:net';
import { Client, type ClientChannel, type ConnectConfig } from 'ssh2';
import { ErrorCode, VastError } from '@vast/shared';

export interface SshTunnelConfig {
  host: string;
  port: number;
  username: string;
  authMethod: 'password' | 'privateKey';
  password?: string;
  privateKey?: string;
  passphrase?: string;
  /** Mongo host as reachable from the SSH server. */
  destinationHost: string;
  destinationPort: number;
}

export interface SshTunnelHandle {
  localHost: string;
  localPort: number;
  close: () => Promise<void>;
}

/**
 * Open a local TCP forward: 127.0.0.1:ephemeral → SSH → destinationHost:destinationPort.
 */
export async function openSshTunnel(config: SshTunnelConfig): Promise<SshTunnelHandle> {
  assertSshConfig(config);

  const conn = new Client();
  const connectConfig: ConnectConfig = {
    host: config.host,
    port: config.port,
    username: config.username,
    readyTimeout: 15_000,
    // Algorithms left to library defaults for broad compatibility
  };

  if (config.authMethod === 'password') {
    connectConfig.password = config.password;
  } else {
    connectConfig.privateKey = config.privateKey;
    if (config.passphrase) connectConfig.passphrase = config.passphrase;
  }

  await new Promise<void>((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = (err: Error) => {
      cleanup();
      reject(
        new VastError(ErrorCode.CONNECTION_FAILED, sanitizeSshError(err.message), { cause: err }),
      );
    };
    const cleanup = () => {
      conn.removeListener('ready', onReady);
      conn.removeListener('error', onError);
    };
    conn.once('ready', onReady);
    conn.once('error', onError);
    conn.connect(connectConfig);
  });

  const server: Server = createServer((clientSocket: NetSocket) => {
    conn.forwardOut(
      '127.0.0.1',
      0,
      config.destinationHost,
      config.destinationPort,
      (err: Error | undefined, stream: ClientChannel) => {
        if (err || !stream) {
          clientSocket.destroy();
          return;
        }
        clientSocket.pipe(stream).pipe(clientSocket);
        clientSocket.on('error', () => stream.close());
        stream.on('error', () => clientSocket.destroy());
      },
    );
  });

  const localPort = await new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      resolve(addr.port);
    });
  });

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    conn.end();
  };

  return {
    localHost: '127.0.0.1',
    localPort,
    close,
  };
}

/**
 * Rewrite mongodb URI host/port to point at a local tunnel forward.
 * Preserves credentials, authSource, query params, and path.
 */
export function rewriteUriToLocalTunnel(
  uri: string,
  localHost: string,
  localPort: number,
): string {
  // mongodb://user:pass@host:port/db?opts  or without auth
  const m = uri.match(/^(mongodb(?:\+srv)?:\/\/)([^/]*)(\/.*)?$/i);
  if (!m) {
    throw new VastError(ErrorCode.VALIDATION, 'Invalid MongoDB URI for tunnel rewrite');
  }
  const scheme = m[1]!;
  if (scheme.toLowerCase().startsWith('mongodb+srv')) {
    // SRV cannot be used through a local port forward directly — require standard URI
    throw new VastError(
      ErrorCode.VALIDATION,
      'SSH tunnel requires a standard mongodb:// URI (not mongodb+srv). Use direct host:port.',
    );
  }
  let authAndHost = m[2]!;
  const rest = m[3] ?? '/';
  // Strip existing host:port, keep userinfo if present
  let userinfo = '';
  const at = authAndHost.lastIndexOf('@');
  if (at >= 0) {
    userinfo = authAndHost.slice(0, at + 1);
    authAndHost = authAndHost.slice(at + 1);
  }
  // For replica set multi-host, take first host only for tunnel dest (already handled by dest config)
  return `${scheme}${userinfo}${localHost}:${localPort}${rest.startsWith('/') ? rest : `/${rest}`}`;
}

/**
 * Parse host and port from a standard mongodb:// URI (first host).
 */
export function parseMongoHostPort(uri: string): { host: string; port: number } {
  const m = uri.match(/^mongodb:\/\/(?:[^@/]+@)?([^/?]+)/i);
  if (!m) {
    throw new VastError(ErrorCode.VALIDATION, 'Could not parse host from MongoDB URI');
  }
  const hostPort = m[1]!.split(',')[0]!;
  if (hostPort.includes(':')) {
    const [host, portStr] = hostPort.split(':');
    return { host: host!, port: Number(portStr) || 27017 };
  }
  return { host: hostPort, port: 27017 };
}

function assertSshConfig(config: SshTunnelConfig): void {
  if (!config.host || !config.username) {
    throw new VastError(ErrorCode.VALIDATION, 'SSH host and username are required');
  }
  if (config.authMethod === 'password' && !config.password) {
    throw new VastError(ErrorCode.VALIDATION, 'SSH password is required');
  }
  if (config.authMethod === 'privateKey' && !config.privateKey) {
    throw new VastError(ErrorCode.VALIDATION, 'SSH private key is required');
  }
  if (!config.destinationHost || !config.destinationPort) {
    throw new VastError(ErrorCode.VALIDATION, 'SSH destination host/port required');
  }
}

function sanitizeSshError(message: string): string {
  return message
    .replace(/password[=:]\S+/gi, 'password=***')
    .replace(/-----BEGIN[\s\S]+?-----END[^-]+-----/g, '[REDACTED_KEY]')
    .slice(0, 500);
}

/** Redact SSH secrets from a config object for logging/API. */
export function redactSshConfig(config: Partial<SshTunnelConfig> & { enabled?: boolean }): {
  enabled?: boolean;
  host?: string;
  port?: number;
  username?: string;
  authMethod?: string;
  hasPassword: boolean;
  hasPrivateKey: boolean;
  hasPassphrase: boolean;
  destinationHost?: string;
  destinationPort?: number;
} {
  return {
    enabled: config.enabled,
    host: config.host,
    port: config.port,
    username: config.username,
    authMethod: config.authMethod,
    hasPassword: Boolean(config.password),
    hasPrivateKey: Boolean(config.privateKey),
    hasPassphrase: Boolean(config.passphrase),
    destinationHost: config.destinationHost,
    destinationPort: config.destinationPort,
  };
}
