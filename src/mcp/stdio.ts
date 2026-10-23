import {
  serveStdio,
  StdioServerTransport,
  type ServeStdioOptions,
} from '@modelcontextprotocol/server/stdio';
import type { McpServer } from '@modelcontextprotocol/server';

type Transport = NonNullable<ServeStdioOptions['transport']>;

/** Owns fatal startup and shutdown failures; runtime transport notifications remain nonfatal. */
export function startStdioServer(
  factory: () => McpServer | Promise<McpServer>,
  transport: Transport = new StdioServerTransport(),
) {
  let startupFailure: Error | undefined;
  let closing: Promise<void> | undefined;
  let closeFailure: Error | undefined;

  function failStartup(message: string, cause: unknown): Error {
    startupFailure = new Error(message, { cause });
    process.exitCode = 1;
    console.error(message);
    // Leave the SDK callback before closing its transport; close() records its own failures.
    queueMicrotask(() => {
      void close().catch(() => {});
    });
    return startupFailure;
  }

  function failClose(cause: unknown): Error {
    if (!closeFailure) {
      closeFailure = new Error('Unable to close MCP transport.', { cause });
      process.exitCode = 1;
      console.error(closeFailure.message);
    }
    return closeFailure;
  }

  // Observe lifecycle promises directly: the SDK reports their rejections through onerror
  // and may then resolve its own close() promise, hiding a failed underlying close.
  const managedTransport: Transport = {
    async start() {
      try {
        await transport.start();
      } catch (cause: unknown) {
        throw failStartup('Unable to start MCP transport.', cause);
      }
    },
    async close() {
      try {
        await transport.close();
      } catch (cause: unknown) {
        throw failClose(cause);
      }
    },
    send: (message, options) => transport.send(message, options),
    get sessionId() {
      return transport.sessionId;
    },
    ...(transport.setProtocolVersion
      ? { setProtocolVersion: transport.setProtocolVersion.bind(transport) }
      : {}),
    ...(transport.setSupportedProtocolVersions
      ? { setSupportedProtocolVersions: transport.setSupportedProtocolVersions.bind(transport) }
      : {}),
    ...(transport.hasPerRequestStream !== undefined
      ? { hasPerRequestStream: transport.hasPerRequestStream }
      : {}),
  };
  transport.onmessage = (message, extra) => managedTransport.onmessage?.(message, extra);
  transport.onerror = (error) => managedTransport.onerror?.(error);
  transport.onclose = () => {
    managedTransport.onclose?.();
  };

  const handle = serveStdio(
    async () => {
      try {
        return await factory();
      } catch (cause: unknown) {
        throw failStartup('Unable to initialize MCP server.', cause);
      }
    },
    {
      transport: managedTransport,
      onerror: () => {
        if (!startupFailure && !closeFailure) console.error('MCP transport error.');
      },
    },
  );

  function close(): Promise<void> {
    closing ??= (async () => {
      try {
        await handle.close();
      } catch (cause: unknown) {
        throw failClose(cause);
      }
      if (closeFailure) throw closeFailure;
    })();
    return closing;
  }
  return { close };
}
