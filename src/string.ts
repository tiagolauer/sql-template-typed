export type NonSpaceWhitespace = '\t' | '\n' | '\r' | '\f' | '\v';

export type Whitespace = ' ' | NonSpaceWhitespace;

export type TrimLeft<S extends string> = S extends `${Whitespace}${infer Rest}`
  ? TrimLeft<Rest>
  : S;

export type TrimRight<S extends string> = S extends `${infer Rest}${Whitespace}`
  ? TrimRight<Rest>
  : S;

export type Trim<S extends string> = TrimLeft<TrimRight<S>>;

type WhitespaceToSpace<S extends string> =
  S extends `${infer Before}${NonSpaceWhitespace}${infer After}`
    ? WhitespaceToSpace<`${Before} ${After}`>
    : S;

type CollapseSpaces<S extends string> = S extends `${infer Before}  ${infer After}`
  ? CollapseSpaces<`${Before} ${After}`>
  : S;

type RemoveSemicolons<S extends string> = S extends `${infer Before};${infer After}`
  ? RemoveSemicolons<`${Before} ${After}`>
  : S;

type SkipLiteralBody<S extends string> = S extends `${string}'${infer After}`
  ? After extends `'${infer Rest}`
    ? SkipLiteralBody<Rest>
    : { rest: After }
  : never;

type AfterLineComment<S extends string> = S extends `${string}
${infer Rest}`
  ? Rest
  : '';

type AfterBlockComment<S extends string> = S extends `${string}*/${infer Rest}` ? Rest : '';

export type StripCommentsAndMaskLiterals<
  S extends string,
  Accumulated extends string = '',
> = S extends `${infer BeforeQuote}'${infer AfterQuote}`
  ? BeforeQuote extends `${infer BeforeDash}--${infer AfterDash}`
    ? BeforeDash extends `${infer BeforeBlock}/*${infer AfterBlock}`
      ? StripCommentsAndMaskLiterals<
          AfterBlockComment<`${AfterBlock}--${AfterDash}'${AfterQuote}`>,
          `${Accumulated}${BeforeBlock} `
        >
      : StripCommentsAndMaskLiterals<
          AfterLineComment<`${AfterDash}'${AfterQuote}`>,
          `${Accumulated}${BeforeDash} `
        >
    : BeforeQuote extends `${infer BeforeBlock}/*${infer AfterBlock}`
      ? StripCommentsAndMaskLiterals<
          AfterBlockComment<`${AfterBlock}'${AfterQuote}`>,
          `${Accumulated}${BeforeBlock} `
        >
      : SkipLiteralBody<AfterQuote> extends { rest: infer Rest extends string }
        ? StripCommentsAndMaskLiterals<Rest, `${Accumulated}${BeforeQuote}''`>
        : `${Accumulated}${S}`
  : S extends `${infer BeforeDash}--${infer AfterDash}`
    ? BeforeDash extends `${infer BeforeBlock}/*${infer AfterBlock}`
      ? StripCommentsAndMaskLiterals<
          AfterBlockComment<`${AfterBlock}--${AfterDash}`>,
          `${Accumulated}${BeforeBlock} `
        >
      : StripCommentsAndMaskLiterals<AfterLineComment<AfterDash>, `${Accumulated}${BeforeDash} `>
    : S extends `${infer BeforeBlock}/*${infer AfterBlock}`
      ? StripCommentsAndMaskLiterals<
          AfterBlockComment<AfterBlock>,
          `${Accumulated}${BeforeBlock} `
        >
      : `${Accumulated}${S}`;

export type Normalize<S extends string> = Trim<
  CollapseSpaces<WhitespaceToSpace<RemoveSemicolons<StripCommentsAndMaskLiterals<S>>>>
>;

export type Unquote<S extends string> = S extends `"${infer Inner}"`
  ? Inner
  : S extends `[${infer Inner}]`
    ? Inner
    : S extends `\`${infer Inner}\``
      ? Inner
      : S;

export type FirstWord<S extends string> = S extends `${infer Head} ${string}`
  ? Head
  : S;

export type StripQualifier<S extends string> = S extends `${string}.${infer Rest}`
  ? StripQualifier<Rest>
  : S;

export type Qualifier<S extends string> = S extends `${infer Head}.${string}` ? Head : '';

export type DropFirstWord<S extends string> = S extends `${string} ${infer Rest}`
  ? Rest
  : '';

export type IsKeyword<Token extends string, Keyword extends string> =
  Lowercase<Token> extends Lowercase<Keyword> ? true : false;

type ScanParenGroup<
  S extends string,
  Depth extends unknown[],
  Inner extends string,
> = S extends `${infer Char}${infer Rest}`
  ? Char extends '('
    ? ScanParenGroup<Rest, [...Depth, unknown], `${Inner}${Char}`>
    : Char extends ')'
      ? Depth extends [unknown, ...infer DepthRest extends unknown[]]
        ? ScanParenGroup<Rest, DepthRest, `${Inner}${Char}`>
        : { inner: Inner; rest: Rest }
      : ScanParenGroup<Rest, Depth, `${Inner}${Char}`>
  : { inner: Inner; rest: '' };

export type ExtractParenGroup<S extends string> = ScanParenGroup<S, [], ''>;

type ScanColumnList<
  S extends string,
  Depth extends unknown[],
  Current extends string,
> = S extends `${infer Char}${infer Rest}`
  ? Char extends '('
    ? ScanColumnList<Rest, [...Depth, unknown], `${Current}${Char}`>
    : Char extends ')'
      ? Depth extends [unknown, ...infer DepthRest extends unknown[]]
        ? ScanColumnList<Rest, DepthRest, `${Current}${Char}`>
        : ScanColumnList<Rest, Depth, `${Current}${Char}`>
      : Char extends ','
        ? Depth extends []
          ? [Trim<Current>, ...ScanColumnList<Rest, Depth, ''>]
          : ScanColumnList<Rest, Depth, `${Current}${Char}`>
        : ScanColumnList<Rest, Depth, `${Current}${Char}`>
  : [Trim<Current>];

export type SplitColumnList<S extends string> = ScanColumnList<S, [], ''>;

export type OpenCount<
  S extends string,
  Accumulated extends unknown[] = [],
> = S extends `${string}(${infer After}`
  ? OpenCount<After, [...Accumulated, unknown]>
  : Accumulated;

export type CloseCount<
  S extends string,
  Accumulated extends unknown[] = [],
> = S extends `${string})${infer After}`
  ? CloseCount<After, [...Accumulated, unknown]>
  : Accumulated;

type PopN<Depth extends unknown[], N extends unknown[]> = N extends [unknown, ...infer NRest]
  ? Depth extends [unknown, ...infer DepthRest]
    ? PopN<DepthRest, NRest>
    : Depth
  : Depth;

export type ApplyParenDelta<Depth extends unknown[], Token extends string> = PopN<
  [...Depth, ...OpenCount<Token>],
  CloseCount<Token>
>;
