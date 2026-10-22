import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { MusabAIApi } from '../../src/vscode/extension';

export type Test = [name: string, fn: () => Promise<void>];

export async function api(): Promise<MusabAIApi> {
  const ext = vscode.extensions.getExtension('musabai.musabai-code');
  assert.ok(ext, 'the MusabAI extension is installed');
  return (await ext.activate()) as MusabAIApi;
}

const TEST_TIMEOUT_MS = 120_000;

/** Runs the tests in order, prints ✓/✗ for each and fails the editor's test run if any failed. */
export async function runAll(tests: Test[]): Promise<void> {
  const failures: string[] = [];
  for (const [name, fn] of tests) {
    const started = Date.now();
    let timer: NodeJS.Timeout | undefined;
    try {
      // A test stuck on a prompt nobody answers fails instead of hanging the editor.
      const timeout = new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error(`timed out after ${TEST_TIMEOUT_MS / 1000} s`)), TEST_TIMEOUT_MS)));
      await Promise.race([fn(), timeout]);
      console.log(`  ✓ ${name} (${Date.now() - started} ms)`);
    } catch (error) {
      failures.push(name);
      console.error(`  ✗ ${name}\n    ${(error as Error).stack ?? error}`);
    } finally {
      clearTimeout(timer);
    }
  }
  console.log(`${tests.length - failures.length}/${tests.length} integration tests passed`);
  if (failures.length) throw new Error(`${failures.length} failed: ${failures.join('; ')}`);
}
