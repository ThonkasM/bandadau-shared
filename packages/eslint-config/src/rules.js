const RAW_PALETTE =
  '(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)';
const UTILITY =
  '(?:bg|text|border|ring|outline|fill|stroke|from|via|to|divide|placeholder|decoration|accent|caret|shadow)';
const rawPaletteRe = `(^|[\\s:!])${UTILITY}-${RAW_PALETTE}-\\d{2,3}(?!\\d)`;
const rawBwRe = `(^|[\\s:!])${UTILITY}-(?:white|black)(?![a-z0-9-])`;
const arbitraryColorRe = `\\[(?:#[0-9a-fA-F]{3,8}|rgba?\\(|hsla?\\()`;

const MSG_PALETTE =
  'Raw palette classes are forbidden: use semantic token utilities (bg-surface, text-primary...).';
const MSG_ARBITRARY = 'Arbitrary color values are forbidden: use semantic token utilities.';
const CLASS_FNS = '/^(cn|clsx|cva|twMerge|twJoin|classNames|tv)$/';

const classSelectors = (re, message) => [
  { selector: `JSXAttribute[name.name=/^(className|class)$/] Literal[value=/${re}/]`, message },
  { selector: `JSXAttribute[name.name=/^(className|class)$/] TemplateElement[value.raw=/${re}/]`, message },
  { selector: `CallExpression[callee.name=${CLASS_FNS}] Literal[value=/${re}/]`, message },
  { selector: `CallExpression[callee.name=${CLASS_FNS}] TemplateElement[value.raw=/${re}/]`, message },
];

export const noRawPaletteSelectors = [
  ...classSelectors(rawPaletteRe, MSG_PALETTE),
  ...classSelectors(rawBwRe, MSG_PALETTE),
  ...classSelectors(arbitraryColorRe, MSG_ARBITRARY),
];

export const noLiteralColorInStyleSelectors = [
  {
    selector:
      'Property[key.name=/(?:^|[a-z])(?:[cC]olor|background)$/] > Literal[value=/^(?:#[0-9a-fA-F]{3,8}|rgba?\\(|hsla?\\()/]',
    message: 'Literal colors are forbidden: use design tokens (@bandada/ui-tokens).',
  },
];
