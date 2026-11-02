/**
 * hangulport MCP server. Tools: analyze_syntax, analyze_syntax_raw,
 * search_dict, tokenize, correct_grammar, list_pos_tags.
 *
 * Why the low-level Server instead of McpServer: the high-level
 * helper converts zod schemas to JSON Schema and injects keys that
 * are not in this tool's public spec ("$schema" and
 * "additionalProperties"), which breaks exact tool-list/schema
 * parity with the spec. This file serves tools/list with the
 * spec's exact input schemas as explicit literals, while zod still
 * validates every tools/call argument set.
 *
 * Every call is forwarded upstream as a JSON-RPC tools/call POST
 * (see hangulport.ts). The API key is read from BAREUN_API_KEY at
 * call time; the endpoint from BAREUN_MCP_URL, defaulting to
 * https://api.bareun.ai/mcp.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  apiKeyFromEnv,
  callTool,
  endpointFromEnv,
  VERSION,
} from "./hangulport.js";
import type { FetchFn } from "./types.js";

const Encoding = z.enum(["utf32", "utf16", "utf8"]);
const OutputFormat = z.enum(["full", "compact"]);
const Anchor = z.enum(["word", "prefix", "suffix", "contains"]);

const AnalyzeSyntaxArgs = z.object({
  text: z.string(),
  auto_split_sentence: z.boolean().optional(),
  auto_spacing: z.boolean().optional(),
  auto_jointing: z.boolean().optional(),
  custom_dict_names: z.array(z.string()).optional(),
  encoding: Encoding.optional(),
  format: OutputFormat.optional(),
  with_sense: z.boolean().optional(),
});
const AnalyzeSyntaxRawArgs = z.object({
  text: z.string(),
  auto_split_sentence: z.boolean().optional(),
  encoding: Encoding.optional(),
  format: OutputFormat.optional(),
  with_sense: z.boolean().optional(),
});
const SearchDictArgs = z.object({
  pattern: z.string(),
  anchor: Anchor.optional(),
  pos: z.string().optional(),
  std_only: z.boolean().optional(),
  with_definition: z.boolean().optional(),
  limit: z.number().optional(),
  count_only: z.boolean().optional(),
});
const TokenizeArgs = z.object({
  text: z.string(),
  auto_spacing: z.boolean().optional(),
  encoding: Encoding.optional(),
});
const CorrectGrammarArgs = z.object({
  text: z.string(),
  custom_dict_names: z.array(z.string()).optional(),
  treat_as_title: z.boolean().optional(),
  disable_split_sentence: z.boolean().optional(),
  disable_caret_spacing: z.boolean().optional(),
  disable_vx_spacing: z.boolean().optional(),
  enable_limited_punctuation: z.boolean().optional(),
  disable_confusion: z.boolean().optional(),
  enable_cleanup_whitespace: z.boolean().optional(),
  disable_typo_correction: z.boolean().optional(),
  enable_sentence_check: z.boolean().optional(),
});
const NoArgs = z.object({});

const ARG_SCHEMAS: Record<string, z.ZodTypeAny> = {
  analyze_syntax: AnalyzeSyntaxArgs,
  analyze_syntax_raw: AnalyzeSyntaxRawArgs,
  search_dict: SearchDictArgs,
  tokenize: TokenizeArgs,
  correct_grammar: CorrectGrammarArgs,
  list_pos_tags: NoArgs,
};

const TOOLS = [
  {
    name: "analyze_syntax",
    description: "Analyze Korean text morphologically and tag parts of speech.",
    inputSchema: {
      type: "object" as const,
      properties: {
        text: { type: "string", description: "Korean text to analyze." },
        auto_split_sentence: { type: "boolean", description: "When true, split the text into sentences automatically before analysis." },
        auto_spacing: { type: "boolean", description: "When true, apply automatic spacing correction before analysis." },
        auto_jointing: { type: "boolean", description: "When true, join separated jamo automatically before analysis." },
        custom_dict_names: { type: "array", items: { type: "string" }, description: "Names of custom dictionaries to apply during analysis." },
        encoding: { type: "string", enum: ["utf32", "utf16", "utf8"], description: "Text encoding for the analysis: utf32, utf16, or utf8." },
        format: { type: "string", enum: ["full", "compact"], description: "Output format: full or compact." },
        with_sense: { type: "boolean", description: "When true, include word-sense information in the result." },
      },
      required: ["text"],
    },
  },
  {
    name: "analyze_syntax_raw",
    description: "Return raw morphological model output for Korean text with no post-processing.",
    inputSchema: {
      type: "object" as const,
      properties: {
        text: { type: "string", description: "Korean text to analyze." },
        auto_split_sentence: { type: "boolean", description: "When true, split the text into sentences automatically before analysis." },
        encoding: { type: "string", enum: ["utf32", "utf16", "utf8"], description: "Text encoding for the analysis: utf32, utf16, or utf8." },
        format: { type: "string", enum: ["full", "compact"], description: "Output format: full or compact." },
        with_sense: { type: "boolean", description: "When true, include word-sense information in the result." },
      },
      required: ["text"],
    },
  },
  {
    name: "search_dict",
    description: "Search the Urimalsaem dictionary by jamo slot pattern.",
    inputSchema: {
      type: "object" as const,
      properties: {
        pattern: { type: "string", description: "Jamo slot pattern to search the dictionary with." },
        anchor: { type: "string", enum: ["word", "prefix", "suffix", "contains"], description: "Match anchor: word, prefix, suffix, or contains." },
        pos: { type: "string", description: "Part-of-speech filter." },
        std_only: { type: "boolean", description: "When true, return standard-language entries only." },
        with_definition: { type: "boolean", description: "When true, include definitions in the results." },
        limit: { type: "number", description: "Maximum number of entries to return." },
        count_only: { type: "boolean", description: "When true, return only the number of matches." },
      },
      required: ["pattern"],
    },
  },
  {
    name: "tokenize",
    description: "Split a Korean sentence into word units.",
    inputSchema: {
      type: "object" as const,
      properties: {
        text: { type: "string", description: "Korean sentence to split into word units." },
        auto_spacing: { type: "boolean", description: "When true, apply automatic spacing correction before tokenizing." },
        encoding: { type: "string", enum: ["utf32", "utf16", "utf8"], description: "Text encoding: utf32, utf16, or utf8." },
      },
      required: ["text"],
    },
  },
  {
    name: "correct_grammar",
    description: "Correct Korean spelling and spacing and return correction blocks.",
    inputSchema: {
      type: "object" as const,
      properties: {
        text: { type: "string", description: "Korean text to correct." },
        custom_dict_names: { type: "array", items: { type: "string" }, description: "Names of custom dictionaries to apply during correction." },
        treat_as_title: { type: "boolean", description: "When true, treat the text as a title." },
        disable_split_sentence: { type: "boolean", description: "When true, do not split the text into sentences." },
        disable_caret_spacing: { type: "boolean", description: "When true, disable caret-based spacing correction." },
        disable_vx_spacing: { type: "boolean", description: "When true, disable VX spacing correction." },
        enable_limited_punctuation: { type: "boolean", description: "When true, enable limited punctuation handling." },
        disable_confusion: { type: "boolean", description: "When true, disable confusion-word correction." },
        enable_cleanup_whitespace: { type: "boolean", description: "When true, clean up whitespace in the corrected text." },
        disable_typo_correction: { type: "boolean", description: "When true, disable typo correction." },
        enable_sentence_check: { type: "boolean", description: "When true, enable sentence-level checks." },
      },
      required: ["text"],
    },
  },
  {
    name: "list_pos_tags",
    description: "List the 47 Bareun part-of-speech tags.",
    inputSchema: { type: "object" as const, properties: {} },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "hangulport", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const schema = ARG_SCHEMAS[name];
  if (!schema) {
    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  }
  try {
    const parsed = schema.parse(args ?? {}) as Record<string, unknown>;
    const fetchFn = globalThis.fetch as unknown as FetchFn;
    const out = await callTool(fetchFn, apiKeyFromEnv(), endpointFromEnv(), name, parsed);
    return textResult(out);
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
