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

export type Normalize<S extends string> = Trim<
  CollapseSpaces<WhitespaceToSpace<RemoveSemicolons<S>>>
>;

export type Unquote<S extends string> = S extends `"${infer Inner}"`
  ? Inner
  : S extends `[${infer Inner}]`
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
