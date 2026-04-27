import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Note: @fluentui/react-motion at the root is already v9.15.0 which includes
// createPresenceComponentVariant — no module-cache patch needed.

afterEach(() => {
  cleanup();
});
