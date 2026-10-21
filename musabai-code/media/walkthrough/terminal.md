# Terminal

- In any terminal press **Ctrl+K**, describe what you want, and the command is typed for you to check and run.
- Commands the agent runs show in the **MusabAI Agent** terminal; press **Ctrl+C** there to stop one.
- Approvals: *Ask every time*, *Allow-list* (default: read-only commands and your list run directly) or *Auto-run*. Risky commands (sudo, rm -rf, force-push, `curl | sh`…) always ask.
- The terminal agent `musabai` gives you the same agent in any terminal: `musabai`, or `musabai -p "…"` in scripts.
