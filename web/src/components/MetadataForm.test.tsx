import { describe, it, expect } from 'vitest';
import { validateMetadata } from './MetadataForm';

describe('validateMetadata', () => {
  it('flags missing required fields', () => {
    const errs = validateMetadata(
      [{ name: 'Vendor', type: 'string', required: true, indexed: true }],
      {},
    );
    expect(errs.Vendor).toMatch(/required/);
  });

  it('flags non-numeric Amount', () => {
    const errs = validateMetadata(
      [{ name: 'Amount', type: 'number', required: false, indexed: false }],
      { Amount: 'abc' as unknown as number },
    );
    expect(errs.Amount).toMatch(/number/);
  });

  it('passes valid values', () => {
    const errs = validateMetadata(
      [
        { name: 'Vendor', type: 'string', required: true, indexed: true },
        { name: 'Amount', type: 'number', required: true, indexed: false },
      ],
      { Vendor: 'Acme', Amount: 500 },
    );
    expect(errs).toEqual({});
  });
});
