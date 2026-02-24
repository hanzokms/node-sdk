# Hanzo KMS Node.js SDK

The official Node.js SDK for [Hanzo KMS](https://kms.hanzo.ai) -- secret management, encryption, and key management for your applications.

## Installation

```bash
npm install @hanzo/kms-sdk
```

## Quick Start

```typescript
import { HanzoKmsSDK } from "@hanzo/kms-sdk";

const client = new HanzoKmsSDK({
  siteUrl: "https://kms.hanzo.ai", // optional, this is the default
});

// Authenticate with Universal Auth
await client.auth().universalAuth.login({
  clientId: "your-client-id",
  clientSecret: "your-client-secret",
});

// List secrets
const secrets = await client.secrets().listSecrets({
  environment: "production",
  projectId: "your-project-id",
});

// Get a single secret
const secret = await client.secrets().getSecret({
  environment: "production",
  projectId: "your-project-id",
  secretName: "DATABASE_URL",
});
```

## Authentication

### Universal Auth

```typescript
await client.auth().universalAuth.login({
  clientId: "your-client-id",
  clientSecret: "your-client-secret",
});
```

### AWS IAM Auth

```typescript
await client.auth().awsIamAuth.login({
  identityId: "your-identity-id",
});
```

### Direct Access Token

```typescript
client.auth().accessToken("your-access-token");
```

## Secrets

```typescript
// List secrets
const { secrets } = await client.secrets().listSecrets({
  environment: "production",
  projectId: "project-id",
});

// Get a secret
const secret = await client.secrets().getSecret({
  environment: "production",
  projectId: "project-id",
  secretName: "API_KEY",
});

// Create a secret
await client.secrets().createSecret("NEW_SECRET", {
  environment: "production",
  projectId: "project-id",
  secretValue: "secret-value",
});

// Update a secret
await client.secrets().updateSecret("EXISTING_SECRET", {
  environment: "production",
  projectId: "project-id",
  secretValue: "new-value",
});

// Delete a secret
await client.secrets().deleteSecret("OLD_SECRET", {
  environment: "production",
  projectId: "project-id",
});
```

## KMS (Key Management)

```typescript
import { EncryptionAlgorithm, KeyUsage } from "@hanzo/kms-sdk";

// Create an encryption key
const key = await client.kms().keys().create({
  projectId: "project-id",
  name: "my-encryption-key",
  keyUsage: KeyUsage.ENCRYPTION,
  encryptionAlgorithm: EncryptionAlgorithm.AES_256_GCM,
});

// Encrypt data
const ciphertext = await client.kms().encryption().encrypt({
  keyId: key.id,
  plaintext: Buffer.from("sensitive data").toString("base64"),
});

// Decrypt data
const plaintext = await client.kms().encryption().decrypt({
  keyId: key.id,
  ciphertext,
});

// Sign data
const { signature } = await client.kms().signing().sign({
  keyId: signingKey.id,
  data: Buffer.from("data to sign").toString("base64"),
  signingAlgorithm: SigningAlgorithm.ECDSA_SHA_256,
});

// Verify signature
const { signatureValid } = await client.kms().signing().verify({
  keyId: signingKey.id,
  data: Buffer.from("data to sign").toString("base64"),
  signature,
  signingAlgorithm: SigningAlgorithm.ECDSA_SHA_256,
});
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `HANZO_KMS_MACHINE_IDENTITY_ID` | Machine identity ID for AWS IAM auth |
| `UNIVERSAL_AUTH_CLIENT_ID` | Universal Auth client ID |
| `UNIVERSAL_AUTH_CLIENT_SECRET` | Universal Auth client secret |

## License

MIT - Hanzo AI Inc.
