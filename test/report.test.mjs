import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createReport, addFindings, setCheck } from '../dist/report.js';
import { validateProtocol } from '../dist/input.js';

test('repeated findings retain one stable identity and one check reference without tying identity to wording', () => {
  const report = createReport('snapshot');
  const finding = {
    code: 'REF_MISSING',
    category: 'semantic',
    message: 'The reference does not resolve.',
    elementRefs: ['end', 'start'],
  };
  const first = addFindings(report, [finding]);
  const second = addFindings(report, [
    { ...finding, message: 'A clearer explanation.', elementRefs: ['start', 'end'] },
    finding,
  ]);
  assert.equal(first[0].id, second[0].id);
  setCheck(report, 'semantics', 'failed', second);
  assert.equal(report.findings.length, 1);
  assert.deepEqual(report.checks.find((c) => c.id === 'semantics').findingRefs, [first[0].id]);
  assert.equal(validateProtocol('report', report), true);
});
