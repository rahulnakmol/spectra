import { EnvSchema, type Env } from '@adminui/shared';

export function loadEnv(source: NodeJS.ProcessEnv | Record<string, unknown> = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const missing = result.error.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${missing}`);
  }
  return Object.freeze(result.data);
}
