export type MechanicsTextPart =
  | {
      type: 'text';
      value: string;
    }
  | {
      type: 'dice';
      value: string;
    };

const MECHANICS_TOKEN_PATTERN = /([A-Za-z][A-Za-z0-9-]*)`([^`]*)`/g;
const KNOWN_MECHANICS_TOKEN_TYPES = new Set(['dice']);
const MECHANICS_TOKEN_PREFIX_PATTERN =
  /^(?<prefix>.*?)(?<tokenType>[A-Za-z][A-Za-z0-9-]*)$/s;

export type MechanicsTokenPart = Exclude<MechanicsTextPart, { type: 'text' }>;

export function parseMechanicsText(value: string): MechanicsTextPart[] {
  const parts: MechanicsTextPart[] = [];
  let lastIndex = 0;

  for (const match of value.matchAll(MECHANICS_TOKEN_PATTERN)) {
    const [rawToken, tokenType, rawTokenValue] = match;
    const tokenIndex = match.index;

    if (
      tokenIndex === undefined ||
      tokenType === undefined ||
      rawTokenValue === undefined
    ) {
      continue;
    }

    if (!KNOWN_MECHANICS_TOKEN_TYPES.has(tokenType) || rawTokenValue === '') {
      continue;
    }

    if (tokenIndex > lastIndex) {
      parts.push({
        type: 'text',
        value: value.slice(lastIndex, tokenIndex),
      });
    }

    parts.push({
      type: 'dice',
      value: rawTokenValue,
    });
    lastIndex = tokenIndex + rawToken.length;
  }

  if (lastIndex < value.length) {
    parts.push({
      type: 'text',
      value: value.slice(lastIndex),
    });
  }

  return parts.length > 0 ? parts : [{ type: 'text', value }];
}

export function splitMechanicsTokenPrefix(
  textPrefix: string,
  tokenValue: string,
): { prefix: string; token: MechanicsTokenPart } | null {
  if (tokenValue === '') {
    return null;
  }

  const match = MECHANICS_TOKEN_PREFIX_PATTERN.exec(textPrefix);
  const tokenType = match?.groups?.['tokenType'];
  const prefix = match?.groups?.['prefix'];

  if (
    tokenType === undefined ||
    prefix === undefined ||
    !KNOWN_MECHANICS_TOKEN_TYPES.has(tokenType)
  ) {
    return null;
  }

  return {
    prefix,
    token: {
      type: 'dice',
      value: tokenValue,
    },
  };
}
