import { z } from 'zod';

export const ConnectionColorSchema = z.enum([
  'slate',
  'red',
  'orange',
  'amber',
  'emerald',
  'teal',
  'cyan',
  'blue',
  'indigo',
  'violet',
  'pink',
]);

export type ConnectionColor = z.infer<typeof ConnectionColorSchema>;

export const SshAuthMethodSchema = z.enum(['password', 'privateKey']);
export type SshAuthMethod = z.infer<typeof SshAuthMethodSchema>;

/** SSH tunnel parameters (secrets optional on update when already stored). */
export const SshConfigInputSchema = z.object({
  enabled: z.boolean().default(false),
  host: z.string().min(1).max(253).optional(),
  port: z.number().int().min(1).max(65535).default(22),
  username: z.string().min(1).max(128).optional(),
  authMethod: SshAuthMethodSchema.default('password'),
  /** SSH password (write-only; never returned). */
  password: z.string().max(2000).optional(),
  /** PEM private key material (write-only). */
  privateKey: z.string().max(100_000).optional(),
  /** Passphrase for encrypted private key (write-only). */
  passphrase: z.string().max(2000).optional(),
  /**
   * Host:port as seen *from the SSH server* for Mongo (default: parsed from URI).
   * Example: localhost:27017 when mongod is local to the bastion.
   */
  destinationHost: z.string().max(253).optional(),
  destinationPort: z.number().int().min(1).max(65535).optional(),
});

export type SshConfigInput = z.infer<typeof SshConfigInputSchema>;

export const CreateConnectionSchema = z
  .object({
    name: z.string().min(1).max(120),
    uri: z.string().min(1).max(4000),
    color: ConnectionColorSchema.default('teal'),
    notes: z.string().max(2000).optional(),
    readOnly: z.boolean().default(false),
    defaultDatabase: z.string().max(120).optional(),
    ssh: SshConfigInputSchema.optional(),
  })
  .superRefine((val, ctx) => {
    if (val.ssh?.enabled) {
      if (!val.ssh.host) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'SSH host required', path: ['ssh', 'host'] });
      }
      if (!val.ssh.username) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'SSH username required',
          path: ['ssh', 'username'],
        });
      }
      if (val.ssh.authMethod === 'password' && !val.ssh.password) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'SSH password required',
          path: ['ssh', 'password'],
        });
      }
      if (val.ssh.authMethod === 'privateKey' && !val.ssh.privateKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'SSH private key required',
          path: ['ssh', 'privateKey'],
        });
      }
    }
  });

export type CreateConnectionInput = z.infer<typeof CreateConnectionSchema>;

export const UpdateConnectionSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  uri: z.string().min(1).max(4000).optional(),
  color: ConnectionColorSchema.optional(),
  notes: z.string().max(2000).optional(),
  readOnly: z.boolean().optional(),
  defaultDatabase: z.string().max(120).optional(),
  ssh: SshConfigInputSchema.optional(),
});

export type UpdateConnectionInput = z.infer<typeof UpdateConnectionSchema>;

/** Public SSH view — never includes secrets. */
export const SshPublicSchema = z.object({
  enabled: z.boolean(),
  host: z.string().optional(),
  port: z.number().optional(),
  username: z.string().optional(),
  authMethod: SshAuthMethodSchema.optional(),
  /** Whether a password is stored (not the value). */
  hasPassword: z.boolean(),
  hasPrivateKey: z.boolean(),
  hasPassphrase: z.boolean(),
  destinationHost: z.string().optional(),
  destinationPort: z.number().optional(),
});

export type SshPublic = z.infer<typeof SshPublicSchema>;

export const ConnectionPublicSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: ConnectionColorSchema,
  notes: z.string().optional(),
  readOnly: z.boolean(),
  defaultDatabase: z.string().optional(),
  /** Redacted URI for display (password masked). */
  uriDisplay: z.string(),
  ssh: SshPublicSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastUsedAt: z.string().optional(),
  status: z.enum(['disconnected', 'connected', 'error']),
  lastError: z.string().optional(),
});

export type ConnectionPublic = z.infer<typeof ConnectionPublicSchema>;

export const TestConnectionSchema = z.object({
  uri: z.string().min(1).max(4000),
  ssh: SshConfigInputSchema.optional(),
});

export type TestConnectionInput = z.infer<typeof TestConnectionSchema>;

export const TestConnectionResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  serverVersion: z.string().optional(),
  host: z.string().optional(),
  viaSsh: z.boolean().optional(),
});

export type TestConnectionResult = z.infer<typeof TestConnectionResultSchema>;
