import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseMechanicsText,
  splitMechanicsTokenPrefix,
} from './mechanics-markdown-grammar.ts';

test('returns plain text without mechanics tokens unchanged', () => {
  assert.deepEqual(parseMechanicsText('Gain a bonus action.'), [
    { type: 'text', value: 'Gain a bonus action.' },
  ]);
});

test('parses an inline dice token into text and dice parts', () => {
  assert.deepEqual(parseMechanicsText('Deal dice`2d6` fire damage.'), [
    { type: 'text', value: 'Deal ' },
    { type: 'dice', value: '2d6' },
    { type: 'text', value: ' fire damage.' },
  ]);
});

test('parses multiple dice tokens while preserving punctuation', () => {
  assert.deepEqual(parseMechanicsText('Roll dice`1d20`, then dice`1d4`.'), [
    { type: 'text', value: 'Roll ' },
    { type: 'dice', value: '1d20' },
    { type: 'text', value: ', then ' },
    { type: 'dice', value: '1d4' },
    { type: 'text', value: '.' },
  ]);
});

test('leaves unknown grammar keywords as text', () => {
  assert.deepEqual(parseMechanicsText('Make save`DEX 15` now.'), [
    { type: 'text', value: 'Make save`DEX 15` now.' },
  ]);
});

test('leaves empty dice values as text', () => {
  assert.deepEqual(parseMechanicsText('Roll dice`` now.'), [
    { type: 'text', value: 'Roll dice`` now.' },
  ]);
});

test('splits a markdown text prefix before an inline code dice value', () => {
  assert.deepEqual(splitMechanicsTokenPrefix('Deal dice', '2d6'), {
    prefix: 'Deal ',
    token: { type: 'dice', value: '2d6' },
  });
});

test('does not split unknown markdown text prefixes before inline code', () => {
  assert.equal(splitMechanicsTokenPrefix('Make save', 'DEX 15'), null);
});
