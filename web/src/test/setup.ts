import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { createRequire } from 'node:module';

// @fluentui/react-motion at the root is v9.0.0 and lacks createPresenceComponentVariant,
// which is required by react-motion-components-preview (used transitively by FluentProvider).
// Patch the Node module cache to point to the v9.15.0 copy nested under react-progress.
const _require = createRequire(import.meta.url);
const motionV15 = _require(
  '../../../node_modules/@fluentui/react-progress/node_modules/@fluentui/react-motion/lib-commonjs/index.js',
);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(_require as any).cache[_require.resolve('@fluentui/react-motion')] = {
  id: _require.resolve('@fluentui/react-motion'),
  filename: _require.resolve('@fluentui/react-motion'),
  loaded: true,
  exports: motionV15,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

afterEach(() => {
  cleanup();
});
