import { ConflictError } from '../errors/domain.js';

export function renderFolderSegments(
  convention: string[],
  ctx: { team: string; year: number; month: number },
): string[] {
  return convention.map((seg) => {
    if (seg === 'Team') return ctx.team;
    if (seg === 'YYYY') return String(ctx.year);
    if (seg === 'MM') return String(ctx.month).padStart(2, '0');
    return seg;
  });
}

export async function resolveCollision(
  baseName: string,
  exists: (candidate: string) => Promise<boolean>,
  maxAttempts = 100,
): Promise<string> {
  if (!(await exists(baseName))) return baseName;
  const dot = baseName.lastIndexOf('.');
  const stem = dot > 0 ? baseName.slice(0, dot) : baseName;
  const ext = dot > 0 ? baseName.slice(dot) : '';
  for (let i = 2; i <= maxAttempts; i++) {
    const candidate = `${stem}-${i}${ext}`;
    if (!(await exists(candidate))) return candidate;
  }
  throw new ConflictError(`Could not resolve filename collision after ${maxAttempts} attempts`);
}
