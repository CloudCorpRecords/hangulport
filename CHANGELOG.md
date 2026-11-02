# Changelog

## 0.1.0 (2026-10-26)

- Initial release.
- CLI: `hangulport analyze_syntax|analyze_syntax_raw|search_dict|tokenize|correct_grammar|list_pos_tags`
  and `hangulport mcp`.
- MCP server (`hangulport mcp`, stdio) with six tools:
  `analyze_syntax`, `analyze_syntax_raw`, `search_dict`, `tokenize`,
  `correct_grammar`, and `list_pos_tags`.
- Calls are forwarded as JSON-RPC `tools/call` requests to the hosted
  Bareun MCP endpoint in `BAREUN_MCP_URL`, defaulting to
  `https://api.bareun.ai/mcp`, with the API key from `BAREUN_API_KEY`
  sent as the `api-key` header.
- Arguments are forwarded exactly as supplied; no defaults are injected
  beyond what the caller passes.
- A missing API key and upstream JSON-RPC or HTTP errors surface as
  honest errors naming the cause; no result is fabricated.
- All HTTP goes through an injectable fetch function, so the test
  suite runs entirely on hand-written fixtures with no network access.
