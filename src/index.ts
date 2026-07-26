import { HttpClient } from "./http";
import { AuthClient } from "./auth";
import { SecretsClient } from "./secrets";
import { HanzoKmsSDKOptions } from "./types";

export const DEFAULT_SITE_URL = "https://kms.hanzo.ai";
export const DEFAULT_ORG = "hanzo";
export const KMS_ORG_ENV_NAME = "KMS_ORG";

/**
 * HanzoKmsSDK talks to luxfi/kms (kms.hanzo.ai). Its whole surface:
 *
 *	const kms = new HanzoKmsSDK({ org: "hanzo" });
 *	await kms.auth().login({ clientId, clientSecret });
 *	await kms.secrets().put({ path: "providers/hanzo", name: "API_KEY", env: "main", value: "..." });
 *	await kms.secrets().get({ path: "providers/hanzo", name: "API_KEY", env: "main" });
 *	await kms.secrets().list({ path: "providers/hanzo", env: "main" });
 *	await kms.secrets().delete({ path: "providers/hanzo", name: "API_KEY", env: "main" });
 */
export class HanzoKmsSDK {
	private http: HttpClient;
	private authClient: AuthClient;
	private secretsClient: SecretsClient;

	constructor(options?: HanzoKmsSDKOptions) {
		this.http = new HttpClient({
			baseURL: options?.siteUrl || DEFAULT_SITE_URL,
			timeout: options?.timeout
		});

		this.authClient = new AuthClient(this.http);
		this.secretsClient = new SecretsClient(this.http, options?.org || process.env[KMS_ORG_ENV_NAME] || DEFAULT_ORG);

		if (options?.accessToken) {
			this.authClient.accessToken(options.accessToken);
		}
	}

	auth = () => this.authClient;
	secrets = () => this.secretsClient;
}

export { AuthClient } from "./auth";
export { SecretsClient, DEFAULT_ENV } from "./secrets";
export { HanzoKmsSDKError, HanzoKmsSDKRequestError } from "./errors";
export * from "./types";
