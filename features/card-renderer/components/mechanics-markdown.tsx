'use client';

import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import {
  type MechanicsTextPart,
  parseMechanicsText,
  splitMechanicsTokenPrefix,
} from '../lib/mechanics-markdown-grammar';

interface MarkdownAstNode {
  type: string;
  value?: string;
  children?: MarkdownAstNode[];
  data?: {
    hName?: string;
    hProperties?: Record<string, unknown>;
  };
}

export interface MechanicsMarkdownProps {
  children: string;
  components?: Components;
}

function createDiceNode(value: string): MarkdownAstNode {
  return {
    type: 'mechanicsDice',
    value,
    data: {
      hName: 'span',
      hProperties: {
        'data-mechanics-token': 'dice',
        'data-mechanics-value': value,
      },
    },
  };
}

function partToMarkdownNode(part: MechanicsTextPart): MarkdownAstNode {
  if (part.type === 'dice') {
    return createDiceNode(part.value);
  }

  return {
    type: 'text',
    value: part.value,
  };
}

function transformMechanicsMarkdownNode(node: MarkdownAstNode): void {
  if (!node.children) {
    return;
  }

  const transformedChildren: MarkdownAstNode[] = [];

  for (let index = 0; index < node.children.length; index++) {
    const child = node.children[index];
    const nextChild = node.children[index + 1];

    if (child === undefined) {
      continue;
    }

    if (child.type === 'text' && child.value !== undefined) {
      if (nextChild?.type === 'inlineCode' && nextChild.value !== undefined) {
        const splitToken = splitMechanicsTokenPrefix(
          child.value,
          nextChild.value,
        );

        if (splitToken !== null) {
          if (splitToken.prefix !== '') {
            transformedChildren.push({
              type: 'text',
              value: splitToken.prefix,
            });
          }
          transformedChildren.push(partToMarkdownNode(splitToken.token));
          index++;
          continue;
        }
      }

      const parts = parseMechanicsText(child.value);
      const hasMechanicsToken = parts.some((part) => part.type !== 'text');

      transformedChildren.push(
        ...(hasMechanicsToken ? parts.map(partToMarkdownNode) : [child]),
      );
      continue;
    }

    transformMechanicsMarkdownNode(child);
    transformedChildren.push(child);
  }

  node.children = transformedChildren;
}

function remarkMechanicsMarkdown() {
  return (tree: MarkdownAstNode) => {
    transformMechanicsMarkdownNode(tree);
  };
}

function DiceNotation({ value }: { value: string }) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded border border-slate-300/70 bg-slate-100/80 px-1 py-0 align-[-0.12em] font-semibold whitespace-nowrap text-slate-800"
      data-mechanics-token="dice"
    >
      <svg
        aria-hidden
        className="size-[0.95em] shrink-0"
        fill="none"
        focusable="false"
        role="presentation"
        viewBox="0 0 16 16"
      >
        <rect
          width="12.5"
          height="12.5"
          x="1.75"
          y="1.75"
          rx="2.5"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <circle cx="5.4" cy="5.4" r="1.25" fill="currentColor" />
        <circle cx="10.6" cy="10.6" r="1.25" fill="currentColor" />
      </svg>
      <span className="font-mono text-[0.88em] leading-[1.35]">{value}</span>
    </span>
  );
}

type MechanicsSpanProps = React.ComponentPropsWithoutRef<'span'> & {
  node?: unknown;
  'data-mechanics-token'?: string;
  'data-mechanics-value'?: string;
};

function MechanicsSpan({
  node: _node,
  children,
  className,
  ...rest
}: MechanicsSpanProps) {
  const mechanicsToken = rest['data-mechanics-token'];
  const mechanicsValue = rest['data-mechanics-value'];

  if (mechanicsToken === 'dice' && typeof mechanicsValue === 'string') {
    return <DiceNotation value={mechanicsValue} />;
  }

  return (
    <span className={cn(className)} {...rest}>
      {children}
    </span>
  );
}

export function MechanicsMarkdown({
  children,
  components,
}: MechanicsMarkdownProps) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm, remarkMechanicsMarkdown]}
      components={{
        ...components,
        span: MechanicsSpan,
      }}
    >
      {children}
    </Markdown>
  );
}
