import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isNewerVersion } from '../../src/core/util';

describe('update check', () => {
  it('detects a newer release and ignores equal, older or unparseable versions', () => {
    assert.equal(isNewerVersion('v0.2.0', '0.1.0'), true);
    assert.equal(isNewerVersion('0.1.1', '0.1.0'), true);
    assert.equal(isNewerVersion('v1.0.0', '0.9.9'), true);
    assert.equal(isNewerVersion('v0.1.0', '0.1.0'), false);
    assert.equal(isNewerVersion('v0.1.0', '0.2.0'), false);
    assert.equal(isNewerVersion('v0.1', '0.1.0'), false);
    assert.equal(isNewerVersion('nightly', '0.1.0'), false);
  });
});
