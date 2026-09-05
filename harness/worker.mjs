/**
 * Worker entry point.
 *
 * A worker thread does not inherit the parent's module loader, so a thread
 * started directly on `worker.ts` fails with ERR_UNKNOWN_FILE_EXTENSION even
 * though the parent process runs under `tsx`. This file is plain `.mjs`, which
 * every runtime loads without help, and it installs the TypeScript loader
 * before it imports the worker body.
 */
try {
  const { register } = await import('tsx/esm/api');
  register();
} catch {
  // Node 22.6+ strips the types itself, and then `tsx` is not in the tree.
}
await import('./worker.ts');
