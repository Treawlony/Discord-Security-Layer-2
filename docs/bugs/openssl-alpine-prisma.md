# Bug Report — Prisma Schema Engine Crash on Alpine (OpenSSL Missing)

**Date**: 2026-03-07
**Severity**: Critical (bot cannot start)
**Status**: Fixed

---

## Summary

The bot container fails to start because Prisma's native query/schema engine binary cannot load OpenSSL, which is not present in the Alpine Linux base image. Prisma then crashes before returning any JSON response, causing a secondary `SyntaxError` that obscures the real cause.

---

## Error Output

```
prisma:warn Prisma failed to detect the libssl/openssl version to use, and may not work as expected. Defaulting to "openssl-1.1.x".
Please manually install OpenSSL and try installing Prisma again.

Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "watchtower", schema "public" at "db:5432"

Error: Could not parse schema engine response:
SyntaxError: Unexpected token 'E', "Error load"... is not valid JSON
```

---

## Reproduction Steps

1. Build the Docker image with `docker compose build`
2. Start the stack with `docker compose up`
3. Observe the bot container logs — it exits immediately with the above error

---

## Root Cause

**Two compounding issues:**

### 1. OpenSSL not installed in Alpine runner image

`node:20-alpine` uses Alpine Linux, which ships with `musl` libc and does **not** include OpenSSL by default. Prisma's schema engine (a Rust binary) dynamically links against `libssl` at runtime. Without it, the binary fails to load and outputs a raw error string instead of JSON — causing the misleading `SyntaxError` wrapping the real failure.

### 2. Wrong Prisma binary target

The `prisma/schema.prisma` generator block has no `binaryTargets` set, so Prisma defaults to `native`. On Alpine (musl), the correct target is `linux-musl-openssl-3.0.x`. Without this, Prisma may download or use the wrong binary variant even if OpenSSL is present.

---

## Expected Behavior

The bot container starts, connects to the database, runs migrations, and logs `Ready`.

## Actual Behavior

The bot container exits immediately with `Could not parse schema engine response`.

---

## Fix

1. Add `openssl` to both `builder` and `runner` stages in `Dockerfile` via `apk add --no-cache openssl`
2. Add `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]` to the Prisma generator block in `prisma/schema.prisma`

---

## Regression Test

See `docs/bugs/openssl-alpine-prisma-regression.md`.
