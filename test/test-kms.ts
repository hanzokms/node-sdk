import { HanzoKmsSDK } from "../src";
import { EncryptionAlgorithm, KeyUsage, KmsKey } from "../src/api/types/kms";

(async () => {
	const client = new HanzoKmsSDK({
		siteUrl: "https://kms.hanzo.ai" // Optional, defaults to https://kms.hanzo.ai
	});

	const universalAuthClientId = process.env.UNIVERSAL_AUTH_CLIENT_ID;
	const universalAuthClientSecret = process.env.UNIVERSAL_AUTH_CLIENT_SECRET;
	const projectId = process.env.PROJECT_ID;

	if (!universalAuthClientId || !universalAuthClientSecret) {
		throw new Error("UNIVERSAL_AUTH_CLIENT_ID and UNIVERSAL_AUTH_CLIENT_SECRET must be set");
	}

	if (!projectId) {
		throw new Error("PROJECT_ID must be set");
	}

	console.log("Logging in");

	await client.auth().universalAuth.login({
		clientId: universalAuthClientId,
		clientSecret: universalAuthClientSecret
	});
	console.log("Logged in");

	console.log("Creating keys");

	const keysToCreate = [
		{
			name: "test-aes-256-gcm",
			keyUsage: KeyUsage.ENCRYPTION,
			encryptionAlgorithm: EncryptionAlgorithm.AES_256_GCM
		},
		{
			name: "test-aes-128-gcm",
			keyUsage: KeyUsage.ENCRYPTION,
			encryptionAlgorithm: EncryptionAlgorithm.AES_128_GCM
		},
		{
			name: "test-ecc-nist-p256",
			keyUsage: KeyUsage.SIGNING,
			encryptionAlgorithm: EncryptionAlgorithm.ECC_NIST_P256
		},
		{
			name: "test-rsa-4096",
			keyUsage: KeyUsage.SIGNING,
			encryptionAlgorithm: EncryptionAlgorithm.RSA_4096
		}
	] as const;

	console.log("Creating keys", keysToCreate);

	const createdKeys: KmsKey[] = [];

	// Create all the keys
	for (const key of keysToCreate) {
		const createdKey = await client.kms().keys().create({
			projectId,
			description: key.name,
			encryptionAlgorithm: key.encryptionAlgorithm,
			keyUsage: key.keyUsage,
			name: key.name
		});
		console.log("Created key", createdKey.name);
		createdKeys.push(createdKey);
	}

	// Get all the keys by name
	for (const createdKey of createdKeys) {
		const key = await client.kms().keys().getByName({
			projectId: createdKey.projectId,
			name: createdKey.name
		});

		console.log(key);
		console.log("Got key by name", key.name);
	}

	// Encrypt / decrypt data with encryption keys

	for (const createdKey of createdKeys) {
		if (createdKey.keyUsage !== KeyUsage.ENCRYPTION) {
			console.log("Skipping key for encryption mode:", createdKey.name);
			continue;
		}

		const encryptedData = await client
			.kms()
			.encryption()
			.encrypt({
				keyId: createdKey.id,
				plaintext: Buffer.from("test data").toString("base64")
			});

		const decryptedData = await client.kms().encryption().decrypt({
			keyId: createdKey.id,
			ciphertext: encryptedData
		});

		console.log("Encrypted data:", {
			raw: encryptedData
		});
		console.log("Decrypted data:", {
			raw: decryptedData,
			decoded: Buffer.from(decryptedData, "base64").toString("utf-8")
		});
	}

	// Sign / verify data with signing keys
	for (const createdKey of createdKeys) {
		if (createdKey.keyUsage !== KeyUsage.SIGNING) {
			console.log("Skipping key for signing mode:", createdKey.name);
			continue;
		}

		const testData = Buffer.from("some test data to sign").toString("base64");

		const publicKey = await client.kms().signing().getPublicKey({
			keyId: createdKey.id
		});
		console.log(`Public key for key ${createdKey.name}:`, publicKey);

		const signingAlgorithms = await client.kms().signing().listSigningAlgorithms({
			keyId: createdKey.id
		});

		console.log(`Signing algorithms for key ${createdKey.name}:`, signingAlgorithms);

		for (const signingAlgorithm of signingAlgorithms) {
			const signedData = await client.kms().signing().sign({
				keyId: createdKey.id,
				data: testData,
				signingAlgorithm: signingAlgorithm
			});

			console.log("Signed data:", signedData);
			const verifiedData = await client.kms().signing().verify({
				keyId: createdKey.id,
				data: testData,
				signature: signedData.signature,
				signingAlgorithm: signingAlgorithm
			});
			console.log("Verified data:", verifiedData);
		}
	}

	// Delete all the keys
	for (const createdKey of createdKeys) {
		await client.kms().keys().delete({
			keyId: createdKey.id
		});
		console.log("Deleted key", createdKey.name);
	}
})();
