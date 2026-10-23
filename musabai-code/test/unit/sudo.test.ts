import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { USES_SUDO, redact } from '../../src/core/sudo';

describe('sudo password', () => {
  it('spots sudo in a command line', () => {
    assert.ok(USES_SUDO.test('sudo apt update'));
    assert.ok(USES_SUDO.test('cd x && sudo make install'));
    assert.ok(!USES_SUDO.test('echo pseudo'));
  });

  it('hides the password in command output', () => {
    assert.equal(redact('pw is hunter2, again hunter2', 'hunter2'), 'pw is ********, again ********');
    assert.equal(redact('nothing', undefined), 'nothing');
  });
});
