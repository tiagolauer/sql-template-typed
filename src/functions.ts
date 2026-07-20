import type { Trim } from './string.js';

export interface FunctionReturnTypes {
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
  length: number;
  char_length: number;
  octet_length: number;
  abs: number;
  ceil: number;
  floor: number;
  round: number;
  power: number;
  mod: number;
  greatest: number;
  least: number;
  lower: string;
  upper: string;
  trim: string;
  ltrim: string;
  rtrim: string;
  concat: string;
  coalesce: unknown;
  nullif: unknown;
  now: Date;
  current_timestamp: Date;
  current_date: Date;
  row_number: number;
  rank: number;
  dense_rank: number;
  ntile: number;
  percent_rank: number;
  cume_dist: number;
  lag: unknown;
  lead: unknown;
  first_value: unknown;
  last_value: unknown;
  nth_value: unknown;
}

export type IsFunctionCall<Expr extends string> = Expr extends `${string}(${string})`
  ? true
  : false;

export type FunctionName<Expr extends string> = Expr extends `${infer Name}(${string}`
  ? Trim<Name>
  : Expr;

export type FunctionOutputName<Expr extends string> = Lowercase<FunctionName<Expr>>;

export type FunctionReturnType<Expr extends string> =
  Lowercase<FunctionName<Expr>> extends keyof FunctionReturnTypes
    ? FunctionReturnTypes[Lowercase<FunctionName<Expr>>]
    : unknown;
