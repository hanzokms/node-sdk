import { HttpClient } from "./http";
import { HanzoKmsSDKError, newKmsError } from "./errors";
import {
	DeleteSecretOptions,
	GetSecretOptions,
	GetSecretResponse,
	ListSecretsOptions,
	ListSecretsResponse,
	PutSecretOptions
} from "./types";

/**
 * env is part of the storage key (kms/secrets/{path}/{env}/{name}), never an
 * alias. The server defaults reads to "default" and rejects writes that omit
 * it, so the SDK resolves it once, here, and always sends it explicitly.
 */
export const DEFAULT_ENV = "default";

/**
 * normalizePath reduces a caller-supplied path to the single form the server
 * can address: slash-joined non-empty segments, no leading or trailing slash.
 *
 * The store builds its key by raw interpolation — kms/secrets/{path}/{env}/{name}
 * — so "/a/b" and "a/b" are different secrets, and only the second is
 * reachable over HTTP (Go's ServeMux collapses the double slash the first one
 * produces). Normalizing in one place is what keeps put/get/delete/list
 * agreeing on which key they mean.
 *
 * An empty path is refused rather than defaulted: it writes a key that no HTTP
 * read can address, i.e. a write-only hole.
 */
const normalizePath = (path: string | undefined): string => {
	const segments = (path || "").split("/").filter((segment) => segment.length > 0);
	if (segments.length === 0) {
		throw new HanzoKmsSDKError(
			"path is required: luxfi/kms keys every secret by (path, name, env), and a secret written with an empty path cannot be read back over HTTP"
		);
	}
	return segments.join("/");
};

/**
 * checkName refuses a name containing "/".
 *
 * The server unescapes the trailing URL path and splits it at the LAST slash
 * into (path, name), so a slash inside a name is read as a path separator.
 * POST would accept such a name — it travels in the JSON body — and store a
 * secret that GET and DELETE could never address again.
 */
const checkName = (name: string): string => {
	if (!name) {
		throw new HanzoKmsSDKError("name is required");
	}
	if (name.includes("/")) {
		throw new HanzoKmsSDKError(
			`invalid secret name "${name}": "/" separates path from name in the secret URL, so a name containing it is unreadable once written`
		);
	}
	return name;
};

/**
 * refuseVersion fails a request that asks for a specific version.
 *
 * luxfi/kms holds exactly one value per (path, name, env) — no version
 * history, no point-in-time recovery. Serving the current value for a
 * versioned request would hand the caller a different secret than it asked
 * for, silently, so this throws instead.
 */
const refuseVersion = (options: object) => {
	if ("version" in options) {
		throw new HanzoKmsSDKError(
			"secret versions are not supported: luxfi/kms stores exactly one value per (path, name, env). Remove `version` from the request."
		);
	}
};

/**
 * SecretsClient covers the whole luxfi/kms secret surface — there is nothing
 * else:
 *
 *	GET    /v1/kms/orgs/{org}/secrets?path=&env=          list names
 *	GET    /v1/kms/orgs/{org}/secrets/{path}/{name}?env=  read one value
 *	POST   /v1/kms/orgs/{org}/secrets                     create or update
 *	DELETE /v1/kms/orgs/{org}/secrets/{path}/{name}?env=  delete
 *
 * There is one write: put() is the create AND the update, because the server
 * has one upsert. No folders, no tags, no versions, no PITR.
 */
export class SecretsClient {
	constructor(
		private http: HttpClient,
		private org: string
	) {}

	list = async (options: ListSecretsOptions): Promise<string[]> => {
		const path = normalizePath(options.path);
		try {
			const res = await this.http.get<ListSecretsResponse>(this.collectionUrl(), {
				params: { path, env: options.env || DEFAULT_ENV }
			});
			return res.names || [];
		} catch (err) {
			throw newKmsError(err);
		}
	};

	get = async (options: GetSecretOptions): Promise<string> => {
		refuseVersion(options);
		const url = this.secretUrl(options.path, options.name);
		try {
			const res = await this.http.get<GetSecretResponse>(url, {
				params: { env: options.env || DEFAULT_ENV }
			});
			return res.secret.value;
		} catch (err) {
			throw newKmsError(err);
		}
	};

	/** Create or update — the server has exactly one upsert for both. */
	put = async (options: PutSecretOptions): Promise<void> => {
		const path = normalizePath(options.path);
		const name = checkName(options.name);
		try {
			await this.http.post(this.collectionUrl(), {
				path,
				name,
				env: options.env || DEFAULT_ENV,
				value: options.value
			});
		} catch (err) {
			throw newKmsError(err);
		}
	};

	delete = async (options: DeleteSecretOptions): Promise<void> => {
		const url = this.secretUrl(options.path, options.name);
		try {
			await this.http.delete(url, { params: { env: options.env || DEFAULT_ENV } });
		} catch (err) {
			throw newKmsError(err);
		}
	};

	private collectionUrl(): string {
		return `/v1/kms/orgs/${encodeURIComponent(this.org)}/secrets`;
	}

	/**
	 * secretUrl builds /v1/kms/orgs/{org}/secrets/{path}/{name}.
	 *
	 * Every segment is escaped INDIVIDUALLY. encodeURIComponent over the joined
	 * "providers/hanzo/KEY" yields "providers%2Fhanzo%2FKEY" — one opaque
	 * segment whose correctness then depends on every proxy in front of KMS
	 * passing encoded slashes through untouched, and on the server unescaping
	 * before it splits. Per-segment escaping keeps the separators literal, the
	 * only form the route is defined on, while still escaping what must be
	 * escaped inside a segment (space, #, ?, %).
	 */
	private secretUrl(path: string, name: string): string {
		const escapedPath = normalizePath(path).split("/").map(encodeURIComponent).join("/");
		return `${this.collectionUrl()}/${escapedPath}/${encodeURIComponent(checkName(name))}`;
	}
}
