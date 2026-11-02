/**
 * hangulport types.
 *
 * Shapes follow the public Bareun MCP tool spec: each tool takes a
 * required Korean text or dictionary pattern plus documented optional
 * flags, enums, and lists. HTTP access is described by a minimal
 * response surface so tests can inject a fake fetch and never touch
 * the network.
 */

export type Encoding = "utf32" | "utf16" | "utf8";
export type OutputFormat = "full" | "compact";
export type Anchor = "word" | "prefix" | "suffix" | "contains";

export interface AnalyzeSyntaxOptions {
  text: string;
  auto_split_sentence?: boolean;
  auto_spacing?: boolean;
  auto_jointing?: boolean;
  custom_dict_names?: string[];
  encoding?: Encoding;
  format?: OutputFormat;
  with_sense?: boolean;
}

export interface AnalyzeSyntaxRawOptions {
  text: string;
  auto_split_sentence?: boolean;
  encoding?: Encoding;
  format?: OutputFormat;
  with_sense?: boolean;
}

export interface SearchDictOptions {
  pattern: string;
  anchor?: Anchor;
  pos?: string;
  std_only?: boolean;
  with_definition?: boolean;
  limit?: number;
  count_only?: boolean;
}

export interface TokenizeOptions {
  text: string;
  auto_spacing?: boolean;
  encoding?: Encoding;
}

export interface CorrectGrammarOptions {
  text: string;
  custom_dict_names?: string[];
  treat_as_title?: boolean;
  disable_split_sentence?: boolean;
  disable_caret_spacing?: boolean;
  disable_vx_spacing?: boolean;
  enable_limited_punctuation?: boolean;
  disable_confusion?: boolean;
  enable_cleanup_whitespace?: boolean;
  disable_typo_correction?: boolean;
  enable_sentence_check?: boolean;
}

/** Minimal HTTP response surface so tests can inject fixtures. */
export interface HttpResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export type FetchFn = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    redirect?: string;
  },
) => Promise<HttpResponse>;
