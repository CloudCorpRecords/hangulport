import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeSyntax,
  analyzeSyntaxRaw,
  apiKeyFromEnv,
  callBareunTool,
  callTool,
  correctGrammar,
  endpointFromEnv,
  extractJsonPayloads,
  listPosTags,
  parseToolResponse,
  searchDict,
  stripUndefined,
  tokenize,
} from "../src/hangulport.js";
import type { FetchFn, HttpResponse } from "../src/types.js";

function textResponse(body: string, status = 200, statusText = "OK"): HttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: { get: () => "application/json" },
    text: async () => body,
    json: async () => JSON.parse(body),
  };
}

const jsonResult = (text: string) =>
  JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text }] } });
const sseResult = (text: string) => `event: message\ndata: ${jsonResult(text)}\n\n`;

interface Captured {
  url?: string;
  init?: { method?: string; headers?: Record<string, string>; body?: string };
}

function fakeFetch(captured: Captured, body: string): FetchFn {
  return async (url: string, init?: Captured["init"]) => {
    captured.url = url;
    captured.init = init;
    return textResponse(body);
  };
}

function sentBody(captured: Captured): Record<string, unknown> {
  return JSON.parse(captured.init?.body ?? "{}") as Record<string, unknown>;
}

function sentArgs(captured: Captured): Record<string, unknown> {
  const params = sentBody(captured).params as Record<string, unknown>;
  return params.arguments as Record<string, unknown>;
}

const ENDPOINT = "https://api.bareun.ai/mcp";
const KEY = "test-key-123";

describe("api key and endpoint resolution", () => {
  it("returns the trimmed key and throws naming BAREUN_API_KEY when missing or blank", () => {
    assert.equal(apiKeyFromEnv({ BAREUN_API_KEY: "  abc  " }), "abc");
    assert.throws(() => apiKeyFromEnv({}), /BAREUN_API_KEY/);
    assert.throws(() => apiKeyFromEnv({ BAREUN_API_KEY: "   " }), /BAREUN_API_KEY/);
  });

  it("defaults to the documented endpoint and honours the override", () => {
    assert.equal(endpointFromEnv({}), ENDPOINT);
    assert.equal(endpointFromEnv({ BAREUN_MCP_URL: "  " }), ENDPOINT);
    assert.equal(
      endpointFromEnv({ BAREUN_MCP_URL: " https://example.test/mcp " }),
      "https://example.test/mcp",
    );
  });

  it("stripUndefined drops undefined but keeps false, zero, and empty values", () => {
    assert.deepEqual(
      stripUndefined({ a: undefined, b: false, c: 0, d: "", e: "x" }),
      { b: false, c: 0, d: "", e: "x" },
    );
  });
});

describe("JSON-RPC request shaping", () => {
  it("analyze_syntax POSTs a tools/call body with the api-key header and full passthrough", async () => {
    const c: Captured = {};
    const out = await analyzeSyntax(fakeFetch(c, jsonResult("POS result")), KEY, ENDPOINT, {
      text: "안녕하세요",
      auto_split_sentence: true,
      auto_spacing: false,
      auto_jointing: true,
      custom_dict_names: ["my-dict"],
      encoding: "utf8",
      format: "compact",
      with_sense: true,
    });
    assert.equal(out, "POS result");
    assert.equal(c.url, ENDPOINT);
    assert.equal(c.init?.method, "POST");
    assert.equal(c.init?.headers?.["api-key"], KEY);
    assert.equal(c.init?.headers?.["Content-Type"], "application/json");
    const body = sentBody(c);
    assert.equal(body.jsonrpc, "2.0");
    assert.equal(body.method, "tools/call");
    const params = body.params as Record<string, unknown>;
    assert.equal(params.name, "analyze_syntax");
    assert.deepEqual(sentArgs(c), {
      text: "안녕하세요",
      auto_split_sentence: true,
      auto_spacing: false,
      auto_jointing: true,
      custom_dict_names: ["my-dict"],
      encoding: "utf8",
      format: "compact",
      with_sense: true,
    });
  });

  it("tokenize with only text forwards no injected defaults", async () => {
    const c: Captured = {};
    await tokenize(fakeFetch(c, jsonResult("tok")), KEY, ENDPOINT, { text: "문장입니다" });
    assert.deepEqual(sentArgs(c), { text: "문장입니다" });
    assert.equal((sentBody(c).params as Record<string, unknown>).name, "tokenize");
  });

  it("analyze_syntax_raw forwards its documented subset only", async () => {
    const c: Captured = {};
    await analyzeSyntaxRaw(fakeFetch(c, jsonResult("raw")), KEY, ENDPOINT, {
      text: "원문",
      encoding: "utf16",
      format: "full",
      with_sense: false,
    });
    assert.deepEqual(sentArgs(c), {
      text: "원문",
      encoding: "utf16",
      format: "full",
      with_sense: false,
    });
  });

  it("search_dict forwards pattern, anchor enum, pos, booleans, and numeric limit", async () => {
    const c: Captured = {};
    await searchDict(fakeFetch(c, jsonResult("hits")), KEY, ENDPOINT, {
      pattern: "ㄱㅏ*",
      anchor: "prefix",
      pos: "명사",
      std_only: true,
      with_definition: true,
      limit: 5,
      count_only: false,
    });
    assert.deepEqual(sentArgs(c), {
      pattern: "ㄱㅏ*",
      anchor: "prefix",
      pos: "명사",
      std_only: true,
      with_definition: true,
      limit: 5,
      count_only: false,
    });
  });

  it("correct_grammar forwards custom dict names and all nine boolean options", async () => {
    const c: Captured = {};
    await correctGrammar(fakeFetch(c, jsonResult("fixed")), KEY, ENDPOINT, {
      text: "띄어쓰기 연습",
      custom_dict_names: ["d1", "d2"],
      treat_as_title: true,
      disable_split_sentence: true,
      disable_caret_spacing: false,
      disable_vx_spacing: true,
      enable_limited_punctuation: true,
      disable_confusion: false,
      enable_cleanup_whitespace: true,
      disable_typo_correction: true,
      enable_sentence_check: true,
    });
    assert.deepEqual(sentArgs(c), {
      text: "띄어쓰기 연습",
      custom_dict_names: ["d1", "d2"],
      treat_as_title: true,
      disable_split_sentence: true,
      disable_caret_spacing: false,
      disable_vx_spacing: true,
      enable_limited_punctuation: true,
      disable_confusion: false,
      enable_cleanup_whitespace: true,
      disable_typo_correction: true,
      enable_sentence_check: true,
    });
  });

  it("list_pos_tags goes upstream with an empty arguments object", async () => {
    const c: Captured = {};
    const out = await listPosTags(fakeFetch(c, jsonResult("NNG, VV, ...")), KEY, ENDPOINT);
    assert.equal(out, "NNG, VV, ...");
    assert.equal((sentBody(c).params as Record<string, unknown>).name, "list_pos_tags");
    assert.deepEqual(sentArgs(c), {});
  });

  it("honours a custom endpoint URL from the caller", async () => {
    const c: Captured = {};
    await tokenize(fakeFetch(c, jsonResult("tok")), KEY, "https://example.test/mcp", {
      text: "x",
    });
    assert.equal(c.url, "https://example.test/mcp");
  });
});

describe("missing key and argument validation failures", () => {
  it("rejects an empty or blank key naming BAREUN_API_KEY before any fetch", async () => {
    let called = false;
    const spy: FetchFn = async () => {
      called = true;
      return textResponse(jsonResult("x"));
    };
    await assert.rejects(
      () => callBareunTool(spy, "", ENDPOINT, "tokenize", { text: "x" }),
      /BAREUN_API_KEY/,
    );
    await assert.rejects(
      () => callBareunTool(spy, "   ", ENDPOINT, "tokenize", { text: "x" }),
      /BAREUN_API_KEY/,
    );
    assert.equal(called, false);
  });

  it("rejects unknown tool names before any fetch", async () => {
    let called = false;
    const spy: FetchFn = async () => {
      called = true;
      return textResponse(jsonResult("x"));
    };
    await assert.rejects(
      () => callTool(spy, KEY, ENDPOINT, "stem_words", {}),
      /Unknown tool: stem_words/,
    );
    assert.equal(called, false);
  });
});

describe("upstream response handling", () => {
  it("parses a plain JSON result and an SSE result", async () => {
    const c1: Captured = {};
    assert.equal(
      await tokenize(fakeFetch(c1, jsonResult("plain")), KEY, ENDPOINT, { text: "x" }),
      "plain",
    );
    const c2: Captured = {};
    assert.equal(
      await tokenize(fakeFetch(c2, sseResult("from sse")), KEY, ENDPOINT, { text: "x" }),
      "from sse",
    );
    assert.equal(parseToolResponse(jsonResult("direct")), "direct");
    assert.equal(extractJsonPayloads(sseResult("y")).length, 1);
  });

  it("maps a JSON-RPC error envelope to an error carrying the upstream message", async () => {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32602, message: "invalid api key" },
    });
    await assert.rejects(
      () => tokenize(fakeFetch({}, body), KEY, ENDPOINT, { text: "x" }),
      /Bareun upstream error: invalid api key/,
    );
    assert.throws(() => parseToolResponse(body), /invalid api key/);
  });

  it("maps an upstream isError result with no text to an error", async () => {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: { isError: true, content: [] },
    });
    await assert.rejects(
      () => tokenize(fakeFetch({}, body), KEY, ENDPOINT, { text: "x" }),
      /empty content list/,
    );
  });

  it("surfaces HTTP failures with status and body detail", async () => {
    const failing: FetchFn = async () =>
      textResponse("unauthorized key", 401, "Unauthorized");
    await assert.rejects(
      () => tokenize(failing, KEY, ENDPOINT, { text: "x" }),
      /HTTP 401.*unauthorized key/,
    );
  });

  it("wraps network failures naming the endpoint", async () => {
    const failing: FetchFn = async () => {
      throw new Error("socket hang up");
    };
    await assert.rejects(
      () => tokenize(failing, KEY, ENDPOINT, { text: "x" }),
      /Failed to reach Bareun upstream at https:\/\/api\.bareun\.ai\/mcp: socket hang up/,
    );
  });

  it("rejects an empty or non-JSON upstream body", async () => {
    await assert.rejects(
      () => tokenize(fakeFetch({}, "not json at all"), KEY, ENDPOINT, { text: "x" }),
      /empty or non-JSON/,
    );
    assert.throws(() => parseToolResponse(""), /empty or non-JSON/);
  });

  it("returns a non-content result as pretty JSON text", async () => {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: { tags: ["NNG", "VV"], count: 2 },
    });
    const out = await listPosTags(fakeFetch({}, body), KEY, ENDPOINT);
    assert.equal(out, JSON.stringify({ tags: ["NNG", "VV"], count: 2 }, null, 2));
  });
});
