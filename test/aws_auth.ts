import { HanzoKmsSDK } from "../src";

(async () => {
	const client = new HanzoKmsSDK({
		siteUrl: "https://kms.hanzo.ai" // Optional, defaults to https://kms.hanzo.ai
	});

	await client.auth().awsIamAuth.login({
		identityId: "b1c540b8-4ca6-407e-8ce5-6696e8db50c4"
	});

	console.log(client.auth().getAccessToken());
})();
