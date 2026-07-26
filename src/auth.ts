import { HttpClient } from "./http";
import { newKmsError } from "./errors";
import { LoginRequest, LoginResponse } from "./types";

/**
 * AuthClient wraps the one authentication route luxfi/kms serves:
 *
 *	POST /v1/kms/auth/login  {clientId, clientSecret} -> {accessToken, expiresIn}
 *
 * The server forwards the credentials to Hanzo IAM as an OAuth2
 * client_credentials grant and hands back the IAM bearer that the secret
 * routes verify against IAM's JWKS.
 *
 * There is no token-renew route and no AWS-IAM login route. When the token
 * expires (expiresIn seconds after login), log in again.
 */
export class AuthClient {
	private token: string | null = null;

	constructor(private http: HttpClient) {}

	login = async (credentials: LoginRequest): Promise<LoginResponse> => {
		try {
			const res = await this.http.post<LoginResponse>("/v1/kms/auth/login", credentials);
			this.accessToken(res.accessToken);
			return res;
		} catch (err) {
			throw newKmsError(err);
		}
	};

	/** Use an IAM bearer obtained elsewhere (e.g. a projected service token). */
	accessToken = (token: string): void => {
		this.token = token;
		this.http.setAccessToken(token);
	};

	/** The bearer currently set on this SDK instance, or null. */
	getAccessToken = (): string | null => this.token;
}
