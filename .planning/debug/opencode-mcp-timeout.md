---
status: awaiting_human_verify
trigger: "You are a debugging/fix agent for opencode MCP compatibility. Problem: The new global MCP server at `/root/.config/opencode/mcp/opencode-phase-runner/server.mjs` passes `node --check` and manual stdio JSON-RPC tests, but `opencode mcp list` reports `opencode-phase-runner failed: Operation timed out after 30000ms`."
created: 2026-05-17T00:00:00Z
updated: 2026-05-17T23:45:00Z
---

## Current Focus

hypothesis: root cause confirmed and minimal fix self-verified
test: user can confirm in their real opencode workflow/session after restart if needed
expecting: opencode-phase-runner remains connected and tools are available
next_action: await human verification

## Symptoms

expected: `opencode mcp list` reports opencode-phase-runner connected
actual: `opencode mcp list` reports `opencode-phase-runner failed: Operation timed out after 30000ms`
errors: Operation timed out after 30000ms
reproduction: run `opencode mcp list`
started: after adding the new global MCP server

## Eliminated

## Evidence

- timestamp: 2026-05-17T00:05:00Z
  checked: server.mjs full source
  found: server writes only Content-Length framed JSON-RPC responses to stdout and ignores notifications; no stdout logging observed
  implication: stdout contamination is unlikely; issue is likely request parsing/response shape/config compatibility
- timestamp: 2026-05-17T00:05:00Z
  checked: global opencode MCP config entry with secrets redacted
  found: opencode-phase-runner is local node command with `environment` variables, enabled true, timeout 30000
  implication: command path is plausible; config field compatibility remains a possible factor
- timestamp: 2026-05-17T00:10:00Z
  checked: `node --check /root/.config/opencode/mcp/opencode-phase-runner/server.mjs`
  found: syntax check passes with no output
  implication: startup timeout is not a syntax error
- timestamp: 2026-05-17T00:10:00Z
  checked: `opencode mcp list`
  found: opencode-phase-runner times out after 30000ms while wide-researcher connects
  implication: issue is specific to the new server/protocol interaction, not opencode MCP globally
- timestamp: 2026-05-17T23:33:58Z
  checked: temporary proxy between opencode and the server
  found: opencode sent initialize as newline-delimited JSON; server replied with Content-Length framed JSON; opencode then closed stdin after timing out
  implication: root cause is response framing mismatch, not process lifetime or stdout logging
- timestamp: 2026-05-17T23:45:00Z
  checked: validation after patch
  found: node --check passed; opencode mcp list reports opencode-phase-runner connected; direct newline and Content-Length initialize/tools/list smoke tests both returned responses
  implication: fix addresses opencode compatibility while preserving Content-Length compatibility

## Resolution

root_cause: opencode 1.15.4's local MCP client sends newline-delimited JSON-RPC; the server always responded with Content-Length framing, so opencode did not parse the initialize response and timed out.
fix: added framing detection so responses use newline-delimited JSON for newline-delimited requests and Content-Length framing for Content-Length requests
verification: `node --check` passed; `opencode mcp list` connected; direct newline and Content-Length JSON-RPC smoke tests passed
files_changed: [/root/.config/opencode/mcp/opencode-phase-runner/server.mjs]
