# Game-Over Currency Encoding Design

## Scope

Issue #27 protects the final-score money display from source-decoding mojibake. The current file is valid UTF-8 and renders a correct pound symbol when read correctly; the reported malformed sequence (`U+FF82 U+FF63`) came from a shell decoding the UTF-8 source incorrectly.

## Representation

Add a small game-over currency formatter that returns `\u00A3` followed by the numeric amount. The JavaScript source therefore uses ASCII characters for the symbol representation while runtime output remains `£<amount>`. `showGameOver()` will use that formatter for the Money column.

## Testing

A focused DOM-free UI regression will verify that the formatter returns the real pound symbol, the game-over HTML contains the formatted value, and neither output nor the relevant source contains the reported mojibake sequence. The test will not change or claim coverage for score calculation.

## Explicitly Out of Scope

- Final-score calculation and tie-breaking.
- Converting other currency displays to a new formatting system.
- Locale-aware currency conversion.
- Changes to player ranking or game-over navigation.
