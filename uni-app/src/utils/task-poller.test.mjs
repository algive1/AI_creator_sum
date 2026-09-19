import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./task-poller.ts', import.meta.url), 'utf8');

test('task poller releases a task when its final listener unsubscribes', () => {
  assert.match(source, /add\(taskId: number, listener: TaskListener\): TaskPollingSubscription/);
  assert.match(source, /return \(\) => this\.removeListener\(taskId, listener\)/);
  assert.match(source, /this\.taskIds\.delete\(taskId\)/);
  assert.match(source, /if \(!this\.taskIds\.size\) this\.stopTimer\(\)/);
});
