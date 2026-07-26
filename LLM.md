# LLM.md - Hanzo KMS Node SDK

## Overview

TypeScript client for Hanzo KMS (kms.hanzo.ai), which runs **luxfi/kms**. The
SDK's whole job is the org-scoped secret surface; nothing else is exposed
because nothing else exists on the server.

## The server surface — all of it

```
POST   /v1/kms/auth/login                            {clientId, clientSecret} -> {accessToken, expiresIn}
GET    /v1/kms/orgs/{org}/secrets?path=&env=         -> {"names": [...]}
GET    /v1/kms/orgs/{org}/secrets/{path}/{name}?env= -> {"secret": {"value": "..."}}
POST   /v1/kms/orgs/{org}/secrets                    {path, name, env, value}
DELETE /v1/kms/orgs/{org}/secrets/{path}/{name}?env=
```

Bearer on everything except login. `env` defaults to `"default"` on read and is
**required** on write (the server 400s without it — a silent default would split
the write from the record readers resolve).

Source of truth: `cmd/kms/main.go` in `~/work/lux/kms` (`registerSecretRoutes`,
`putSecretHandler`).

## Why the rewrite happened (4.0.7)

Every call before 4.0.7 went to Infisical paths (`/api/v3/secrets/raw`,
`/api/v1/folders`, `/api/v2/workspace`, …). luxfi/kms has **never** served
those. The break was invisible because older server builds embedded a console
SPA under a root catch-all that answered every unmatched path with
`200 text/html`, so a wrong URL surfaced as a JSON decode error rather than a
404. Server 1.12.8 removed the catch-all; those paths now return honest JSON
404s (`{"message":"not found","path":"…"}`) and the breakage became visible.

## Model — three keys, no more

A secret is `(path, name, env)` within an org. There are no projects, folders,
tags, versions or PITR, so the SDK has no surface for them:

- **One upsert.** `put()` is create and update; the server has a single POST.
- **No versions.** `get()` throws on a `version` option instead of silently
  returning the current value.
- **`org` is required input.** Constructor `org`, else `KMS_ORG`, else `hanzo`.

## The escaping rule

The server splits the trailing path at its **last** slash into `(path, name)`,
after unescaping. So:

- escape each segment with `encodeURIComponent` **individually**, join with
  literal `/` (`secretUrl` in `src/secrets.ts`);
- a name containing `/` is rejected — POST would accept it in the JSON body and
  store a secret GET could never address;
- an empty path is rejected — the store interpolates the path into its key
  verbatim (`kms/secrets/{path}/{env}/{name}`), and an empty one produces a key
  that HTTP reads cannot reach.

## Structure

```
src/index.ts    HanzoKmsSDK — config, org resolution, re-exports
src/http.ts     axios instance: base URL, bearer, retry/backoff
src/auth.ts     login / accessToken / getAccessToken
src/secrets.ts  list / get / put / delete + URL building and boundary checks
src/errors.ts   HanzoKmsSDKError, HanzoKmsSDKRequestError, newKmsError
src/types.ts    public options + wire shapes
test/kms.test.js  node:test contract suite against a stub luxfi/kms
```

## Build & test

```bash
npm install
npm test      # builds, then runs node --test against the build output
```

The suite drives the SDK over a real socket against a stub that mirrors the Go
handlers (last-slash split, env-required write, JSON 404s). Two guards keep the
Infisical paths from coming back: no recorded request URL may contain `/api/`,
and no file in `lib/` may contain `/api/`.

## Gotchas

- Runtime deps are `axios` only. The AWS SigV4 stack went with the deleted
  `/api/v1/auth/aws-auth/login` route; `zod` went with the dynamic-secret
  schemas.
- `/v1/kms/keys/*` exists on the server but is MPC validator key-set management
  (generate/list/get/sign/rotate) — a different contract from the Infisical KMS
  keys surface this SDK used to wrap, so it is not bound here.
- The repo lives at `hanzokms/node-sdk`; `hanzoai/kms-node-sdk` does not exist.
