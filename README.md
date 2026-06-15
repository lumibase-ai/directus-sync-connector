# directus-sync-connector

A long-running, **one-way** sync connector that migrates a [Directus](https://directus.io) project
into **Lumibase** — schema, items (data), files/assets, flows, and roles/permissions.

It polls Directus on an interval and incrementally pushes changes to Lumibase. Lumibase's REST API is
Directus-compatible (same `/api/v1/items/:collection` routes, filter DSL, and `{data,meta}` envelope),
so the mapping is close to 1:1.

## How it works

```
Directus  ──(REST + optional DB)──►  connector  ──(REST /api/v1)──►  Lumibase
```

Each cycle runs in dependency order:

1. **schema** — collections + fields (optional; see caveat below)
2. **items** — records, in relation-topological order, with foreign keys rewritten to Lumibase ids
3. **files** — assets downloaded from Directus and re-uploaded
4. **flows** — flow + operation definitions
5. **permissions** — roles, then permissions (role FKs remapped)

State (`.sync-state.json`) holds two things:

- **high-water-marks** — per-stream last-synced timestamp for incremental polling
- **id-map** — `directusId → lumibaseId`, used to choose create-vs-update and to rewrite relational FKs
  (Lumibase generates its own ids)

## Configuration

Copy `.env.example` to `.env` and fill it in. At minimum you need a Directus read path
(REST token and/or DB URL) and the Lumibase target.

| Variable | Required | Notes |
| --- | --- | --- |
| `DIRECTUS_URL` + `DIRECTUS_TOKEN` | one of these paths | REST read (preferred). Static admin token. |
| `DIRECTUS_DB_URL` | one of these paths | Postgres/MySQL. Enables `directus_activity`-based incremental detection. |
| `LUMIBASE_URL` | yes | e.g. `http://localhost:1989` |
| `LUMIBASE_SITE_ID` | yes | Sent as `X-Site-Id`. |
| `LUMIBASE_TOKEN` | yes | Server-to-server bearer token. |
| `SYNC_INTERVAL_MS` | no | Poll interval (default 30000). |
| `SYNC_COLLECTIONS` | no | `*` or a CSV allowlist. |
| `SYNC_SCHEMA` | no | Default `false` — see caveat. |
| `SYNC_FILES` / `SYNC_FLOWS` / `SYNC_PERMISSIONS` | no | Default `true`. |
| `STATE_FILE` | no | Default `./.sync-state.json`. |
| `LOG_LEVEL` | no | `debug` \| `info` \| `warn` \| `error`. |

## Usage

```bash
npm install
npm run build

# validate source reads without writing anything
node dist/cli.js schema --dry-run

# one cycle, then exit
node dist/cli.js once

# run continuously
node dist/cli.js run        # or: npm start
```

The optional DB drivers (`pg`, `mysql2`) are lazy-loaded — install only the one your Directus uses, or
skip both if you only use the REST source.

## Caveats — unconfirmed Lumibase surface

The published `@lumibase/sdk` exposes only **data** endpoints (items, files, flow *runs*). It has no
schema/role/permission management. This connector therefore:

- **Schema** (`SYNC_SCHEMA`): targets assumed Directus-style `POST /api/v1/collections` and `/api/v1/fields`.
  These are **`[Unverified]`** — gated behind the flag and **off by default**. The writer fails soft (logs
  and skips) on a 404. Until the real endpoints are confirmed, pre-create your collections in Lumibase and
  leave `SYNC_SCHEMA=false`. Use `schema --dry-run` to preview the payloads.
- **Flows / roles / permissions**: written as items into `directus_flows`, `directus_operations`,
  `directus_roles`, `directus_permissions` collections (fail-soft if those collections don't exist).
- **m2m**: junction collections are synced as ordinary collections; review for your data model.

## Development

```bash
npm run typecheck
npm test            # vitest: mappers, filter encoding, id-map FK rewrite, topo order
```
