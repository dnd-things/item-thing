import type { Components } from 'react-markdown';

export interface MechanicsMarkdownRenderProps {
  children: string;
  components?: Components;
}

function componentsMatch(
  prevComponents: Components | undefined,
  nextComponents: Components | undefined,
): boolean {
  if (Object.is(prevComponents, nextComponents)) {
    return true;
  }

  if (prevComponents === undefined || nextComponents === undefined) {
    return false;
  }

  const prevRecord = prevComponents as Record<string, unknown>;
  const nextRecord = nextComponents as Record<string, unknown>;
  const prevKeys = Object.keys(prevRecord);
  const nextKeys = Object.keys(nextRecord);

  if (prevKeys.length !== nextKeys.length) {
    return false;
  }

  for (const key of prevKeys) {
    if (!Object.hasOwn(nextRecord, key)) {
      return false;
    }
    if (
      !Object.is(Reflect.get(prevRecord, key), Reflect.get(nextRecord, key))
    ) {
      return false;
    }
  }

  return true;
}

export function sameMarkdownRender(
  prev: MechanicsMarkdownRenderProps,
  next: MechanicsMarkdownRenderProps,
): boolean {
  if (!Object.is(prev.children, next.children)) {
    return false;
  }

  return componentsMatch(prev.components, next.components);
}
