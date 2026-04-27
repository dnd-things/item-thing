# Mechanics Markdown Grammar Design

## Goal

Add a small, extensible custom grammar layer to mechanics markdown so `dice\`2d6\`` renders as an inline dice icon plus the formula text.

## Syntax

The initial token syntax is `dice\`FORMULA\``. The raw markdown stays readable and is intentionally shaped so future tokens can follow the same pattern, such as `save\`DEX 15\`` or `damage\`5d6 fire\``.

Only known grammar keywords render specially. Unknown words and ordinary markdown stay unchanged.

## Architecture

Both card render paths should use a shared `MechanicsMarkdown` component instead of configuring `react-markdown` independently. That component owns the markdown plugins, custom node rendering, and token styling hooks.

The grammar parser should be a small remark plugin that scans text nodes for known `keyword\`value\`` tokens. It should replace recognized tokens with custom inline nodes and leave surrounding text as normal text nodes.

The first custom renderer is a `DiceNotation` component that displays a dice icon and the formula text inline. Styling should be compact, legible, and compatible with both the minimal and print card layouts.

## Data Flow

The workbench still stores plain strings. The renderer receives mechanics markdown, the shared parser converts recognized tokens at render time, and the card outputs normal React elements.

No persistence or API schema changes are needed.

## Error Handling

Malformed tokens remain text. Empty values are not converted. The renderer does not throw for unusual markdown content.

## Testing

Unit tests should cover token parsing with plain text, multiple tokens, punctuation, unknown keywords, and empty values. Verification should include TypeScript type checking and linting.
