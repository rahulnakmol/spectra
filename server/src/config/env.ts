import { EnvSchema, type Env } from '@spectra/shared';

export function loadEnv(source: NodeJS.ProcessEnv | Record<string, unknown> = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${result.error.message}`);
  }
  return Object.freeze(result.data);
}
