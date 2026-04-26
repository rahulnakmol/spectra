import { describe, it, expect, jest } from '@jest/globals';
import { renderFolderSegments, resolveCollision } from './foldering.js';

describe('renderFolderSegments', () => {
  it('renders Team/YYYY/MM convention', () => {
    expect(renderFolderSegments(['Team', 'YYYY', 'MM'], { team: 'AP', year: 2026, month: 4 }))
      .toEqual(['AP', '2026', '04']);
  });
  it('passes through static segments', () => {
    expect(renderFolderSegments(['archive', 'YYYY'], { team: 'X', year: 2026, month: 1 }))
      .toEqual(['archive', '2026']);
  });
});

describe('resolveCollision', () => {
  it('returns base name when no collision', async () => {
    const exists = jest.fn(async () => false);
    expect(await resolveCollision('a.pdf', exists)).toBe('a.pdf');
    expect(exists).toHaveBeenCalledTimes(1);
  });
  it('appends -2 on first collision', async () => {
    const exists = jest.fn(async (n: string) => n === 'a.pdf');
    expect(await resolveCollision('a.pdf', exists)).toBe('a-2.pdf');
  });
  it('keeps incrementing until free', async () => {
    const taken = new Set(['a.pdf', 'a-2.pdf', 'a-3.pdf']);
    const exists = jest.fn(async (n: string) => taken.has(n));
    expect(await resolveCollision('a.pdf', exists)).toBe('a-4.pdf');
  });
});
