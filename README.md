# Hanzo KMS Node.js SDK

The official Node.js SDK for [Hanzo KMS](https://kms.hanzo.ai) — the org-scoped
secret store served by [luxfi/kms](https://github.com/luxfi/kms).

## Installation

```bash
npm install @hanzo/kms-sdk
```

## Quick Start

```typescript
import { HanzoKmsSDK } from "@hanzo/kms-sdk";

const kms = new HanzoKmsSDK({
  siteUrl: "https://kms.hanzo.ai", // optional, this is the default
  org: "hanzo"                     // optional, defaults to process.env.KMS_ORG, then "hanzo"
});

await kms.auth().login({
  clientId: process.env.KMS_CLIENT_ID!,
  clientSecret: process.env.KMS_CLIENT_SECRET!
});

const mnemonic = await kms.secrets().get({
  path: "providers/hanzo",
  name: "deploy-mnemonic",
  env: "main"
});
```

## The API

Every secret is keyed by `(path, name, env)` inside an organization. That is the
whole model — there are no projects, folders, tags, versions or point-in-time
recovery, because the server has no routes for them.

| SDK call | Route |
|----------|-------|
| `auth().login({clientId, clientSecret})` | `POST /v1/kms/auth/login` |
| `secrets().list({path, env?})` | `GET /v1/kms/orgs/{org}/secrets?path=&env=` |
| `secrets().get({path, name, env?})` | `GET /v1/kms/orgs/{org}/secrets/{path}/{name}?env=` |
| `secrets().put({path, name, value, env?})` | `POST /v1/kms/orgs/{org}/secrets` |
| `secrets().delete({path, name, env?})` | `DELETE /v1/kms/orgs/{org}/secrets/{path}/{name}?env=` |

`env` defaults to `"default"`. It is part of the storage key, never an alias:
the same name under `main` and `test` is two different secrets.

## Authentication

`login()` exchanges a machine identity for an IAM bearer (OAuth2
`client_credentials`, brokered by KMS) and sets it on the client:

```typescript
const { expiresIn } = await kms.auth().login({ clientId, clientSecret });
```

There is no renew route — log in again when the token expires. A bearer
obtained elsewhere (a projected service token, say) can be used directly:

```typescript
const kms = new HanzoKmsSDK({ accessToken: process.env.KMS_TOKEN });
// or, on an existing client:
kms.auth().accessToken(process.env.KMS_TOKEN!);
```

The bearer's IAM `owner` claim must resolve to the client's `org`, or the
server answers 401.

## Secrets

```typescript
// Create AND update — the server has one upsert, so the SDK has one method.
await kms.secrets().put({ path: "providers/hanzo", name: "API_KEY", env: "main", value: "..." });

// Read a value.
const apiKey = await kms.secrets().get({ path: "providers/hanzo", name: "API_KEY", env: "main" });

// List the names under a path.
const names = await kms.secrets().list({ path: "providers/hanzo", env: "main" });

// Delete.
await kms.secrets().delete({ path: "providers/hanzo", name: "API_KEY", env: "main" });
```

Paths are normalized to slash-joined segments (`"/a/b/"` and `"a/b"` are the
same path) and each segment is percent-escaped on its own, so the separators
reach the server intact — it splits the URL at the LAST slash to recover
`(path, name)`. For the same reason a name may not contain `/`: the SDK throws
rather than write a secret that could never be read back.

## Errors

Both error types are exported. `HanzoKmsSDKRequestError` carries the server's
message plus `statusCode`; `HanzoKmsSDKError` covers everything the SDK refuses
locally (missing path, slash in a name, a `version` that cannot be honoured).

```typescript
import { HanzoKmsSDKRequestError } from "@hanzo/kms-sdk";

try {
  await kms.secrets().get({ path: "providers/hanzo", name: "MISSING" });
} catch (err) {
  if (err instanceof HanzoKmsSDKRequestError && err.statusCode === 404) { /* ... */ }
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `KMS_ORG` | Organization used when `org` is not passed to the constructor. Defaults to `hanzo`. |

## Development

```bash
npm install
npm test      # builds, then runs the contract tests against a stub luxfi/kms
```

## License

BSD-3-Clause — Hanzo AI Inc. See `LICENSE` and `NOTICE`.
