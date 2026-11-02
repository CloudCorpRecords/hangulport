#!/usr/bin/env node
/**
 * hangulport CLI.
 *
 *   hangulport analyze_syntax <text> [--auto-split-sentence] [--auto-spacing]
 *       [--auto-jointing] [--with-sense] [--encoding utf32|utf16|utf8]
 *       [--format full|compact] [--custom-dict-names a,b]
 *   hangulport analyze_syntax_raw <text> [--auto-split-sentence] [--with-sense]
 *       [--encoding utf32|utf16|utf8] [--format full|compact]
 *   hangulport search_dict <pattern> [--anchor word|prefix|suffix|contains]
 *       [--pos POS] [--std-only] [--with-definition] [--count-only] [--limit N]
 *   hangulport tokenize <text> [--auto-spacing] [--encoding utf32|utf16|utf8]
 *   hangulport correct_grammar <text> [--custom-dict-names a,b]
 *       [--treat-as-title] [--disable-split-sentence] [--disable-caret-spacing]
 *       [--disable-vx-spacing] [--enable-limited-punctuation] [--disable-confusion]
 *       [--enable-cleanup-whitespace] [--disable-typo-correction]
 *       [--enable-sentence-check]
 *   hangulport list_pos_tags
 *   hangulport mcp
 *
 * Requires BAREUN_API_KEY (sent upstream as the api-key header).
 * Endpoint from BAREUN_MCP_URL, default https://api.bareun.ai/mcp.
 * Boolean flags take no value: passing the flag sets it true; omitting
 * it forwards nothing (no defaults are injected).
 * Exit codes: 0 success, 1 call error, 2 usage error.
 */
import {
  analyzeSyntax,
  analyzeSyntaxRaw,
  apiKeyFromEnv,
  correctGrammar,
  endpointFromEnv,
  listPosTags,
  searchDict,
  tokenize,
  VERSION,
} from "./hangulport.js";
import type { FetchFn } from "./types.js";

function usage(): never {
  console.error(`Usage:
  hangulport analyze_syntax <text> [--auto-split-sentence] [--auto-spacing] [--auto-jointing] [--with-sense] [--encoding utf32|utf16|utf8] [--format full|compact] [--custom-dict-names a,b]
  hangulport analyze_syntax_raw <text> [--auto-split-sentence] [--with-sense] [--encoding utf32|utf16|utf8] [--format full|compact]
  hangulport search_dict <pattern> [--anchor word|prefix|suffix|contains] [--pos POS] [--std-only] [--with-definition] [--count-only] [--limit N]
  hangulport tokenize <text> [--auto-spacing] [--encoding utf32|utf16|utf8]
  hangulport correct_grammar <text> [--custom-dict-names a,b] [--treat-as-title] [--disable-split-sentence] [--disable-caret-spacing] [--disable-vx-spacing] [--enable-limited-punctuation] [--disable-confusion] [--enable-cleanup-whitespace] [--disable-typo-correction] [--enable-sentence-check]
  hangulport list_pos_tags
  hangulport mcp
  hangulport --version`);
  process.exit(2);
}

/** Split argv after the subcommand into a positional head and the flag tail. */
function splitHead(rest: string[]): { head?: string; tail: string[] } {
  if (rest.length === 0 || rest[0].startsWith("--")) return { tail: rest };
  return { head: rest[0], tail: rest.slice(1) };
}

function hasFlag(tail: string[], name: string): boolean {
  return tail.includes(name);
}

function flagValue(tail: string[], name: string): string | undefined {
  const i = tail.indexOf(name);
  return i >= 0 ? tail[i + 1] : undefined;
}

function dictNames(tail: string[]): string[] | undefined {
  const raw = flagValue(tail, "--custom-dict-names");
  if (raw === undefined) return undefined;
  return raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}

function encoding(tail: string[]): "utf32" | "utf16" | "utf8" | undefined {
  const v = flagValue(tail, "--encoding");
  if (v === undefined) return undefined;
  if (v !== "utf32" && v !== "utf16" && v !== "utf8") usage();
  return v;
}

function format(tail: string[]): "full" | "compact" | undefined {
  const v = flagValue(tail, "--format");
  if (v === undefined) return undefined;
  if (v !== "full" && v !== "compact") usage();
  return v;
}

function anchor(tail: string[]): "word" | "prefix" | "suffix" | "contains" | undefined {
  const v = flagValue(tail, "--anchor");
  if (v === undefined) return undefined;
  if (v !== "word" && v !== "prefix" && v !== "suffix" && v !== "contains") usage();
  return v;
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    return;
  }
  if (cmd === "mcp") {
    await import("./mcp.js");
    return;
  }
  const known = [
    "analyze_syntax",
    "analyze_syntax_raw",
    "search_dict",
    "tokenize",
    "correct_grammar",
    "list_pos_tags",
  ];
  if (!cmd || !known.includes(cmd)) usage();
  // Phase 1: parse and validate every argument. All usage errors
  // (missing text/pattern, bad enum value, non-numeric --limit) exit 2
  // here, before any credential check.
  let run: (
    fetchFn: FetchFn,
    apiKey: string,
    endpoint: string,
  ) => Promise<string>;
  if (cmd === "list_pos_tags") {
    run = (f, k, e) => listPosTags(f, k, e);
  } else if (cmd === "analyze_syntax") {
    const { head, tail } = splitHead(rest);
    if (!head) usage();
    const options = {
      text: head,
      ...(hasFlag(tail, "--auto-split-sentence") ? { auto_split_sentence: true } : {}),
      ...(hasFlag(tail, "--auto-spacing") ? { auto_spacing: true } : {}),
      ...(hasFlag(tail, "--auto-jointing") ? { auto_jointing: true } : {}),
      ...(dictNames(tail) !== undefined ? { custom_dict_names: dictNames(tail) } : {}),
      ...(encoding(tail) !== undefined ? { encoding: encoding(tail) } : {}),
      ...(format(tail) !== undefined ? { format: format(tail) } : {}),
      ...(hasFlag(tail, "--with-sense") ? { with_sense: true } : {}),
    };
    run = (f, k, e) => analyzeSyntax(f, k, e, options);
  } else if (cmd === "analyze_syntax_raw") {
    const { head, tail } = splitHead(rest);
    if (!head) usage();
    const options = {
      text: head,
      ...(hasFlag(tail, "--auto-split-sentence") ? { auto_split_sentence: true } : {}),
      ...(encoding(tail) !== undefined ? { encoding: encoding(tail) } : {}),
      ...(format(tail) !== undefined ? { format: format(tail) } : {}),
      ...(hasFlag(tail, "--with-sense") ? { with_sense: true } : {}),
    };
    run = (f, k, e) => analyzeSyntaxRaw(f, k, e, options);
  } else if (cmd === "search_dict") {
    const { head, tail } = splitHead(rest);
    if (!head) usage();
    const limitRaw = flagValue(tail, "--limit");
    let limit: number | undefined;
    if (limitRaw !== undefined) {
      limit = Number(limitRaw);
      if (!Number.isFinite(limit)) usage();
    }
    const options = {
      pattern: head,
      ...(anchor(tail) !== undefined ? { anchor: anchor(tail) } : {}),
      ...(flagValue(tail, "--pos") !== undefined ? { pos: flagValue(tail, "--pos") } : {}),
      ...(hasFlag(tail, "--std-only") ? { std_only: true } : {}),
      ...(hasFlag(tail, "--with-definition") ? { with_definition: true } : {}),
      ...(limit !== undefined ? { limit } : {}),
      ...(hasFlag(tail, "--count-only") ? { count_only: true } : {}),
    };
    run = (f, k, e) => searchDict(f, k, e, options);
  } else if (cmd === "tokenize") {
    const { head, tail } = splitHead(rest);
    if (!head) usage();
    const options = {
      text: head,
      ...(hasFlag(tail, "--auto-spacing") ? { auto_spacing: true } : {}),
      ...(encoding(tail) !== undefined ? { encoding: encoding(tail) } : {}),
    };
    run = (f, k, e) => tokenize(f, k, e, options);
  } else {
    const { head, tail } = splitHead(rest);
    if (!head) usage();
    const options = {
      text: head,
      ...(dictNames(tail) !== undefined ? { custom_dict_names: dictNames(tail) } : {}),
      ...(hasFlag(tail, "--treat-as-title") ? { treat_as_title: true } : {}),
      ...(hasFlag(tail, "--disable-split-sentence") ? { disable_split_sentence: true } : {}),
      ...(hasFlag(tail, "--disable-caret-spacing") ? { disable_caret_spacing: true } : {}),
      ...(hasFlag(tail, "--disable-vx-spacing") ? { disable_vx_spacing: true } : {}),
      ...(hasFlag(tail, "--enable-limited-punctuation") ? { enable_limited_punctuation: true } : {}),
      ...(hasFlag(tail, "--disable-confusion") ? { disable_confusion: true } : {}),
      ...(hasFlag(tail, "--enable-cleanup-whitespace") ? { enable_cleanup_whitespace: true } : {}),
      ...(hasFlag(tail, "--disable-typo-correction") ? { disable_typo_correction: true } : {}),
      ...(hasFlag(tail, "--enable-sentence-check") ? { enable_sentence_check: true } : {}),
    };
    run = (f, k, e) => correctGrammar(f, k, e, options);
  }
  // Phase 2: credentials and the call itself. Failures exit 1.
  const fetchFn = globalThis.fetch as unknown as FetchFn;
  try {
    const out = await run(fetchFn, apiKeyFromEnv(), endpointFromEnv());
    console.log(out);
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

void main();
