import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, isPreview }) => ({
  // GitHub Pages serves a project site from https://<user>.github.io/<repo>/,
  // so built asset URLs need that prefix. If you rename the repository, change
  // this to match.
  //
  // `isPreview` is included so `npm run preview` serves at the same path as
  // production rather than at '/', which would quietly 404 every asset and make
  // the preview a poor rehearsal. The dev server stays at '/'.
  base: command === 'build' || isPreview ? '/math-to-sound/' : '/',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}));
