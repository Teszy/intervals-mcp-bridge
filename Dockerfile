# syntax=docker/dockerfile:1

ARG NODE_VERSION=24.21.0
ARG TUNNEL_CLIENT_VERSION=0.0.16

FROM node:${NODE_VERSION}-bookworm-slim AS dependencies
WORKDIR /app
RUN npm install --global pnpm@12.6.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

FROM dependencies AS production-dependencies
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

FROM dependencies AS build
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
# Compile the application only; repository tests are validated separately.
RUN pnpm build

FROM --platform=$BUILDPLATFORM debian:bookworm-slim AS tunnel
ARG TARGETARCH
ARG TUNNEL_CLIENT_VERSION
RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates curl unzip \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /download
RUN case "$TARGETARCH" in amd64|arm64) ;; *) echo "Unsupported architecture: $TARGETARCH" >&2; exit 1 ;; esac \
    && archive="tunnel-client-v${TUNNEL_CLIENT_VERSION}-linux-${TARGETARCH}.zip" \
    && release="https://github.com/openai/tunnel-client/releases/download/v${TUNNEL_CLIENT_VERSION}" \
    && curl --fail --silent --show-error --location --retry 3 "$release/$archive" --output "$archive" \
    && curl --fail --silent --show-error --location --retry 3 "$release/SHA256SUMS.txt" --output SHA256SUMS.txt \
    && awk -v archive="$archive" '$2 == archive || $2 == "*" archive { print }' SHA256SUMS.txt > selected.sha256 \
    && test "$(wc -l < selected.sha256)" -eq 1 \
    && sha256sum --check selected.sha256 \
    && unzip -q "$archive" -d /opt/tunnel-client \
    && chmod 755 /opt/tunnel-client/tunnel-client /opt/tunnel-client/cloudflared

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ARG TUNNEL_CLIENT_VERSION
LABEL org.opencontainers.image.title="Intervals MCP bridge with Secure MCP Tunnel" \
      io.intervals-mcp-bridge.tunnel-client.version="${TUNNEL_CLIENT_VERSION}"
ENV NODE_ENV=production
RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./package.json
COPY --from=tunnel /opt/tunnel-client /opt/tunnel-client
COPY docker/openai-tunnel.yaml ./docker/openai-tunnel.yaml
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["/opt/tunnel-client/tunnel-client", "health", "--url", "http://127.0.0.1:8080", "--require-control-plane-poll"]
ENTRYPOINT ["/opt/tunnel-client/tunnel-client"]
CMD ["run", "--config", "/app/docker/openai-tunnel.yaml"]
