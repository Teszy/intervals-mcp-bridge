# Use the local server with ChatGPT

Verified with `tunnel-client` v0.0.16 on macOS arm64. The manual session covered
reading activities and athlete settings, previewing a workout, approved publication
and repeat publication returning the same event without a second calendar entry.

## Prepare

Complete the repository's `.env` setup and run `pnpm build`.
Use the [OpenAI Secure MCP Tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
to create a tunnel associated with the intended account, obtain a runtime key and
install the matching official client. Tunnel creation needs Read + Manage;
runtime use needs Read + Use. A Codex plugin is not required for this connection.

The first test used an extracted client and profile under `/tmp`. That is temporary
storage: for repeated use, keep the client and its bundled companion files in a
stable local directory. Examples below assume `tunnel-client` is on `PATH`.
Account secrets and local profiles do not belong in the repository.

## Configure the profile

Inspect `tunnel-client help quickstart`, then configure the compiled stdio command:

```sh
tunnel-client init \
  --sample sample_mcp_stdio_local \
  --profile intervals \
  --tunnel-id tunnel_REPLACE_WITH_YOUR_ID \
  --mcp-command 'node --env-file=/absolute/path/to/repository/.env /absolute/path/to/repository/dist/src/index.js' \
  --health-listen-addr 127.0.0.1:0
```

Replace both paths and the tunnel ID. The tested repository path contains no spaces;
paths with spaces need quoting within the command according to the client parser.
For an existing profile in a custom directory, pass `--profile-dir /path/to/profiles`
to subsequent commands. Reuse that profile instead of overwriting it.

In a local zsh terminal, enter the runtime key without displaying it:

```zsh
read -rs 'CONTROL_PLANE_API_KEY?Runtime API key: '
export CONTROL_PLANE_API_KEY
printf '\n'
```

The key stays in that terminal's environment. Run diagnostics and, if successful,
start the client in the same terminal:

```sh
tunnel-client doctor --profile intervals --explain
tunnel-client run --profile intervals
```

`doctor` returning `RESULT ok` confirms its checks, not end-to-end tool operation.
Stdio network/OAuth checks and the optional Codex plugin check may be skipped.
Keep `run` in the foreground while connecting and using ChatGPT.

## Connect and use

In ChatGPT, add a custom MCP server, choose **Tunnel**, select the created tunnel
and create/install the resulting plugin. Our stdio server has no separate MCP
OAuth flow; the tested connection used **No authentication**, with access handled
by the tunnel and the upstream Intervals credentials kept in the local `.env`.
See [OpenAI's connection guide](https://developers.openai.com/api/docs/guides/custom-mcp-server)
for current UI and account restrictions.

Select the plugin using `@` in a conversation. Start with an activity read, then
preview a short workout. Only publish after approving that exact preview. Repeat
publication using the same draft ID to verify the same event is returned, and check
the calendar for a single entry. The workflow was verified manually on 2026-10-19.

## Stop and restart

Use Ctrl+C to stop the foreground client. Tools are unavailable while it is stopped
or the computer is asleep. After source changes, rebuild and restart the client.
A new terminal needs the runtime key set again.

The bridge stores drafts and published-event results in process memory. Complete
preview and publication before restarting. If an earlier write was uncertain,
inspect the calendar before creating another draft. VS Code and the tunnel launch
separate bridge processes and cannot share draft IDs.
