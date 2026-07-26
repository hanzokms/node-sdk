export type HanzoKmsSDKOptions = {
	/** KMS base URL. Defaults to https://kms.hanzo.ai. */
	siteUrl?: string;
	/**
	 * Organization that owns the secrets. Every secret route is org-scoped
	 * (/v1/kms/orgs/{org}/secrets) and the bearer's IAM `owner` claim must
	 * resolve to it. Defaults to process.env.KMS_ORG, then "hanzo".
	 */
	org?: string;
	/** Pre-obtained IAM bearer, as an alternative to auth().login(). */
	accessToken?: string;
	/** Per-request timeout in milliseconds. Defaults to 10000. */
	timeout?: number;
};

export type LoginRequest = {
	clientId: string;
	clientSecret: string;
};

export type LoginResponse = {
	accessToken: string;
	/** Token lifetime in seconds. There is no renew route — log in again. */
	expiresIn: number;
	tokenType?: string;
};

export type ListSecretsOptions = {
	path: string;
	/** Defaults to "default". */
	env?: string;
};

export type GetSecretOptions = {
	path: string;
	name: string;
	/** Defaults to "default". */
	env?: string;
};

export type PutSecretOptions = {
	path: string;
	name: string;
	value: string;
	/** Defaults to "default". */
	env?: string;
};

export type DeleteSecretOptions = {
	path: string;
	name: string;
	/** Defaults to "default". */
	env?: string;
};

/** Wire shape of GET /v1/kms/orgs/{org}/secrets. */
export type ListSecretsResponse = {
	names: string[];
};

/** Wire shape of GET /v1/kms/orgs/{org}/secrets/{path}/{name}. */
export type GetSecretResponse = {
	secret: { value: string };
};
