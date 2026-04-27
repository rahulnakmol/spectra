import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryProvider } from './QueryProvider';

describe('QueryProvider', () => {
  it('renders children', () => {
    render(<QueryProvider><p>child content</p></QueryProvider>);
    expect(screen.getByText('child content')).toBeInTheDocument();
  });
});
