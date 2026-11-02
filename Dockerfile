FROM node:22-bookworm-slim AS frontend
RUN npm install -g bun@1.3.14
WORKDIR /src/frontend
COPY frontend/package.json frontend/bun.lock ./
COPY frontend/shared/cli-ui/package.json ./shared/cli-ui/package.json
RUN bun install --frozen-lockfile
COPY frontend ./
RUN bun run build

FROM golang:1.26-bookworm AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY assets.go ./
COPY cmd ./cmd
COPY internal ./internal
COPY --from=frontend /src/web ./web
COPY migrations ./migrations
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/discord-control ./cmd/server

FROM alpine:3.22
RUN apk add --no-cache ca-certificates tzdata && addgroup -S app && adduser -S -G app -u 1000 app
WORKDIR /app
COPY --from=build /out/discord-control /app/discord-control
RUN mkdir runtime && chown app:app runtime
USER app
EXPOSE 3000
CMD ["/app/discord-control"]
