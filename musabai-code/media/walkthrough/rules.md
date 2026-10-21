# Rules and MCP

**Rules** (compatible with Cursor):
- `.cursor/rules/*.mdc` with `description`, `globs`, `alwaysApply`;
- `.cursorrules` and `AGENTS.md` (nested `AGENTS.md` apply to their folder);
- your own rules for every project in MusabAI Settings.

**MCP servers** from `~/.cursor/mcp.json`, `~/.config/musabai/mcp.json` and the project's `.cursor/mcp.json`, `.musabai/mcp.json` or `.vscode/mcp.json` (stdio, HTTP and SSE). Project servers start only after you trust them.
