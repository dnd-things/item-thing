import assert from 'node:assert/strict';
import test from 'node:test';

import { sameMarkdownRender } from './mechanics-markdown-render.ts';

const tableA = () => null;
const tableB = () => null;

test('sameMarkdownRender treats equal children strings as equal', () => {
  assert.equal(
    sameMarkdownRender(
      { children: 'Deal fire damage.' },
      { children: 'Deal fire damage.' },
    ),
    true,
  );
});

test('sameMarkdownRender rejects different children strings', () => {
  assert.equal(sameMarkdownRender({ children: 'A' }, { children: 'B' }), false);
});

test('sameMarkdownRender accepts a new object when component functions are stable', () => {
  const sharedHeading = () => null;
  assert.equal(
    sameMarkdownRender(
      { children: 'x', components: { h2: sharedHeading, table: tableA } },
      { children: 'x', components: { h2: sharedHeading, table: tableA } },
    ),
    true,
  );
});

test('sameMarkdownRender rejects a different table function', () => {
  assert.equal(
    sameMarkdownRender(
      { children: 'x', components: { table: tableA } },
      { children: 'x', components: { table: tableB } },
    ),
    false,
  );
});

test('sameMarkdownRender rejects when a component key is missing', () => {
  assert.equal(
    sameMarkdownRender(
      { children: 'x', components: { table: tableA } },
      { children: 'x', components: {} },
    ),
    false,
  );
});

test('sameMarkdownRender treats omitted components on both sides as equal', () => {
  assert.equal(sameMarkdownRender({ children: 'x' }, { children: 'x' }), true);
});
