import { test } from 'node:test'; import assert from 'node:assert/strict';
import { isResolved } from '../js/model.js';

// isResolved is the single "this comment is closed" notion: a comment folds into the
// Resolved group (and drops out of open counts) once the author records a resolution OR
// it is explicitly resolved — REGARDLESS of a stale status==='submitted'. 'reopened' wins.
test('a plain submitted comment is open', () => {
  assert.equal(isResolved({ status: 'submitted' }), false);
  assert.equal(isResolved({ status: 'open' }), false);
});

test('a resolution closes it even while status is still submitted', () => {
  assert.equal(isResolved({ status: 'submitted', resolution: { state: 'addressed' } }), true);
  assert.equal(isResolved({ status: 'submitted', resolution: { state: 'declined' } }), true);
});

test('status=resolved or advisor_state=resolved closes it', () => {
  assert.equal(isResolved({ status: 'resolved' }), true);
  assert.equal(isResolved({ status: 'submitted', advisor_state: 'resolved' }), true);
});

test('reopened overrides and makes it open again', () => {
  assert.equal(isResolved({ status: 'submitted', resolution: { state: 'addressed' }, reopened: true }), false);
  assert.equal(isResolved({ status: 'resolved', reopened: true }), false);
});
