# Regression Test — Prisma/OpenSSL on Alpine

**Related bug**: `docs/bugs/openssl-alpine-prisma.md`

---

## What to test

This regression test ensures that:
1. The Docker image builds successfully with Prisma binaries included
2. The Prisma schema engine can start inside the Alpine container
3. `prisma migrate deploy` succeeds at container startup

---

## Manual regression test (run after any Dockerfile or schema.prisma change)

### 1. Rebuild the image from scratch (no cache)

```bash
docker compose build --no-cache
```

Expected: build completes with no errors. The `npm run db:generate` step (which runs `prisma generate`) must succeed — if OpenSSL is missing, it will fail here.

### 2. Start the full stack

```bash
docker compose up -d
```

### 3. Check bot logs for the failure signature

```bash
docker compose logs bot | grep -E "openssl|libssl|SyntaxError|Error load"
```

Expected: **no output** — none of these strings should appear.

### 4. Confirm successful startup

```bash
docker compose logs bot | grep -i "ready\|logged in\|migrate"
```

Expected: lines showing `prisma migrate deploy` completed and the bot logged in.

---

## Automated CI check (recommended addition)

Add a step to your CI pipeline (GitHub Actions) that builds the Docker image and verifies the Prisma binary works inside the container:

```yaml
- name: Build image
  run: docker compose build --no-cache

- name: Verify Prisma engine loads in container
  run: |
    docker run --rm \
      -e DATABASE_URL=postgresql://x:x@localhost/x \
      discord-watchtower-bot \
      sh -c "npx prisma --version"
```

`prisma --version` invokes the query engine binary. If OpenSSL is missing, it will fail with the same error as the bug. A clean exit (code 0) confirms the fix holds.

---

## What would have caught this bug before deployment

- Running `docker compose build` locally before pushing — the `npm run db:generate` step inside the builder stage would have failed or warned
- A CI step that builds the image (not just type-checks the TypeScript source)
- Checking `docker compose logs` after first deploy rather than assuming startup succeeded
