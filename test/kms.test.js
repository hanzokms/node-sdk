"use strict";

// Contract tests against a stub that answers exactly like luxfi/kms v1.12.9:
// same routes, same envelopes, same last-slash split of the trailing path, same
// "env is required on write" rule. The SDK is driven over a real socket, so the
// URLs asserted here are the URLs axios puts on the wire.
//
// Run against the build output (npm test builds first) so the published artifact
// is what gets exercised.

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const { HanzoKmsSDK, HanzoKmsSDKError, HanzoKmsSDKRequestError } = require("../lib/index.js");

const TOKEN = "test-iam-bearer";
const CLIENT_ID = "hanzo-kms";
const CLIENT_SECRET = "s3cr3t";

/** Every request the stub received, across every test. */
const seen = [];

// Stored keys are NUL-joined so paths and names containing spaces or
// slashes stay distinguishable.
const SEP = "\u0000";
const key = (org, p, env, name) => [org, p, env, name].join(SEP);

const json = (res, status, body) => {
	const payload = JSON.stringify(body);
	res.writeHead(status, { "content-type": "application/json" });
	res.end(payload);
};

/**
 * Stub luxfi/kms. Mirrors cmd/kms/main.go:
 *   POST   /v1/kms/auth/login
 *   GET    /v1/kms/orgs/{org}/secrets?path=&env=
 *   GET    /v1/kms/orgs/{org}/secrets/{rest...}   rest split at its LAST slash
 *   POST   /v1/kms/orgs/{org}/secrets             env required, no default
 *   DELETE /v1/kms/orgs/{org}/secrets/{rest...}
 * Everything else is an honest JSON 404 — the SPA catch-all that used to answer
 * 200 text/html for unmatched paths is gone as of server 1.12.8.
 */
const store = new Map();
const server = http.createServer((req, res) => {
	let raw = "";
	req.on("data", (chunk) => (raw += chunk));
	req.on("end", () => {
		const url = new URL(req.url, "http://kms.test");
		const body = raw ? JSON.parse(raw) : null;
		seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });

		// Go's r.URL.Path is fully unescaped before routing, and PathValue("rest")
		// hands the handler that unescaped remainder.
		const pathname = decodeURIComponent(url.pathname);

		if (req.method === "POST" && pathname === "/v1/kms/auth/login") {
			if (body?.clientId !== CLIENT_ID || body?.clientSecret !== CLIENT_SECRET) {
				return json(res, 401, { statusCode: 401, message: "invalid credentials" });
			}
			return json(res, 200, { accessToken: TOKEN, expiresIn: 86400, tokenType: "Bearer" });
		}

		const match = pathname.match(/^\/v1\/kms\/orgs\/([^/]+)\/secrets(?:\/(.*))?$/);
		if (!match) {
			return json(res, 404, { message: "not found", path: url.pathname });
		}

		if (req.headers.authorization !== `Bearer ${TOKEN}`) {
			return json(res, 401, { statusCode: 401, message: "missing bearer token" });
		}

		const org = match[1];
		const rest = match[2];
		const env = url.searchParams.get("env") || "default";

		if (rest === undefined) {
			if (req.method === "GET") {
				const prefix = key(org, url.searchParams.get("path") || "", env, "");
				const names = [...store.keys()].filter((k) => k.startsWith(prefix)).map((k) => k.split(SEP)[3]);
				return json(res, 200, { names });
			}
			if (req.method === "POST") {
				if (!body?.name) return json(res, 400, { message: "name and value required" });
				if (!body?.env?.trim()) return json(res, 400, { message: "env is required" });
				store.set(key(org, body.path, body.env, body.name), body.value);
				return json(res, 201, { ok: true });
			}
			return json(res, 405, { message: "method not allowed" });
		}

		const idx = rest.lastIndexOf("/");
		if (idx < 0) {
			return json(res, 400, { message: "path and name required" });
		}
		const k = key(org, rest.slice(0, idx), env, rest.slice(idx + 1));

		if (req.method === "GET") {
			if (!store.has(k)) return json(res, 404, { message: "not found" });
			return json(res, 200, { secret: { value: store.get(k) } });
		}
		if (req.method === "DELETE") {
			if (!store.delete(k)) return json(res, 404, { message: "not found" });
			return json(res, 200, { ok: true });
		}
		return json(res, 405, { message: "method not allowed" });
	});
});

let siteUrl;

before(async () => {
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	siteUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

const sdk = (options) => new HanzoKmsSDK({ siteUrl, accessToken: TOKEN, ...options });

test("login posts credentials to /v1/kms/auth/login and sets the bearer", async () => {
	const kms = new HanzoKmsSDK({ siteUrl, org: "hanzo" });
	assert.equal(kms.auth().getAccessToken(), null);

	const res = await kms.auth().login({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });

	assert.equal(res.accessToken, TOKEN);
	assert.equal(res.expiresIn, 86400);
	assert.equal(kms.auth().getAccessToken(), TOKEN);

	const login = seen.at(-1);
	assert.equal(login.method, "POST");
	assert.equal(login.url, "/v1/kms/auth/login");
	assert.deepEqual(login.body, { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
	assert.equal(login.auth, undefined, "login must not carry a bearer");

	// The bearer from login is what the secret routes then see.
	await kms.secrets().put({ path: "providers/hanzo", name: "AFTER_LOGIN", env: "main", value: "v" });
	assert.equal(seen.at(-1).auth, `Bearer ${TOKEN}`);
});

test("bad credentials surface the server's message, not a decode error", async () => {
	const kms = new HanzoKmsSDK({ siteUrl, org: "hanzo" });
	await assert.rejects(() => kms.auth().login({ clientId: CLIENT_ID, clientSecret: "wrong" }), (err) => {
		assert.ok(err instanceof HanzoKmsSDKRequestError);
		assert.equal(err.statusCode, 401);
		assert.match(err.message, /invalid credentials/);
		return true;
	});
});

test("put is the one upsert: create and update hit the same POST", async () => {
	const kms = sdk({ org: "hanzo" });
	const secret = { path: "providers/hanzo", name: "DEPLOY_MNEMONIC", env: "main" };

	await kms.secrets().put({ ...secret, value: "first" });
	const created = seen.at(-1);
	assert.equal(created.method, "POST");
	assert.equal(created.url, "/v1/kms/orgs/hanzo/secrets");
	assert.deepEqual(created.body, { path: "providers/hanzo", name: "DEPLOY_MNEMONIC", env: "main", value: "first" });
	assert.equal(await kms.secrets().get(secret), "first");

	await kms.secrets().put({ ...secret, value: "second" });
	assert.equal(seen.at(-1).method, "POST", "update is the same POST, not a PATCH to a versioned path");
	assert.equal(await kms.secrets().get(secret), "second");
});

test("get reads /v1/kms/orgs/{org}/secrets/{path}/{name}", async () => {
	const kms = sdk({ org: "hanzo" });
	await kms.secrets().put({ path: "providers/hanzo", name: "API_KEY", env: "main", value: "k" });

	assert.equal(await kms.secrets().get({ path: "providers/hanzo", name: "API_KEY", env: "main" }), "k");
	assert.equal(seen.at(-1).url, "/v1/kms/orgs/hanzo/secrets/providers/hanzo/API_KEY?env=main");
});

test("each path segment is escaped individually, separators stay literal", async () => {
	const kms = sdk({ org: "hanzo" });
	const secret = { path: "providers/hanzo team/a+b", name: "K#1", env: "main" };

	await kms.secrets().put({ ...secret, value: "escaped" });
	// The value round-trips only if the server's last-slash split recovers the
	// exact (path, name) the POST body carried.
	assert.equal(await kms.secrets().get(secret), "escaped");

	const url = seen.at(-1).url;
	assert.equal(url, "/v1/kms/orgs/hanzo/secrets/providers/hanzo%20team/a%2Bb/K%231?env=main");
	assert.ok(!url.includes("%2F"), "a %2F means the separators were escaped and the server reads one long name");
});

test("list returns the names under a path", async () => {
	const kms = sdk({ org: "hanzo" });
	await kms.secrets().put({ path: "listing", name: "ONE", env: "main", value: "1" });
	await kms.secrets().put({ path: "listing", name: "TWO", env: "main", value: "2" });
	await kms.secrets().put({ path: "listing", name: "OTHER_ENV", env: "test", value: "3" });

	const names = await kms.secrets().list({ path: "listing", env: "main" });

	assert.deepEqual(names.sort(), ["ONE", "TWO"]);
	assert.equal(seen.at(-1).url, "/v1/kms/orgs/hanzo/secrets?path=listing&env=main");
});

test("delete removes the secret; reading it back is a 404", async () => {
	const kms = sdk({ org: "hanzo" });
	const secret = { path: "providers/hanzo", name: "TEMP", env: "main" };
	await kms.secrets().put({ ...secret, value: "x" });

	await kms.secrets().delete(secret);
	assert.equal(seen.at(-1).method, "DELETE");
	assert.equal(seen.at(-1).url, "/v1/kms/orgs/hanzo/secrets/providers/hanzo/TEMP?env=main");

	await assert.rejects(() => kms.secrets().get(secret), (err) => {
		assert.ok(err instanceof HanzoKmsSDKRequestError);
		assert.equal(err.statusCode, 404);
		return true;
	});
});

test("env defaults to \"default\" and is never aliased", async () => {
	const kms = sdk({ org: "hanzo" });
	await kms.secrets().put({ path: "envs", name: "K", value: "no-env-given" });

	assert.equal(seen.at(-1).body.env, "default", "the server rejects a write with no env, so the SDK must send one");
	assert.equal(await kms.secrets().get({ path: "envs", name: "K" }), "no-env-given");
	assert.equal(seen.at(-1).url, "/v1/kms/orgs/hanzo/secrets/envs/K?env=default");

	// env is part of the key: the same name in another env is a different secret.
	await assert.rejects(() => kms.secrets().get({ path: "envs", name: "K", env: "main" }), HanzoKmsSDKRequestError);
});

test("org comes from config, then KMS_ORG, then \"hanzo\"", async () => {
	await sdk({ org: "zoo" }).secrets().list({ path: "listing" });
	assert.match(seen.at(-1).url, /^\/v1\/kms\/orgs\/zoo\/secrets\?/);

	const previous = process.env.KMS_ORG;
	process.env.KMS_ORG = "pars";
	try {
		await sdk().secrets().list({ path: "listing" });
		assert.match(seen.at(-1).url, /^\/v1\/kms\/orgs\/pars\/secrets\?/);
	} finally {
		if (previous === undefined) delete process.env.KMS_ORG;
		else process.env.KMS_ORG = previous;
	}

	await sdk().secrets().list({ path: "listing" });
	assert.match(seen.at(-1).url, /^\/v1\/kms\/orgs\/hanzo\/secrets\?/);
});

test("a versioned read throws instead of silently returning the current value", async () => {
	const kms = sdk({ org: "hanzo" });
	await kms.secrets().put({ path: "providers/hanzo", name: "VERSIONED", env: "main", value: "current" });
	const before = seen.length;

	await assert.rejects(
		() => kms.secrets().get({ path: "providers/hanzo", name: "VERSIONED", env: "main", version: 1 }),
		(err) => {
			assert.ok(err instanceof HanzoKmsSDKError);
			assert.match(err.message, /versions are not supported/);
			return true;
		}
	);
	assert.equal(seen.length, before, "no request may be issued for a versioned read");
});

test("a name containing \"/\" is refused before it can be written", async () => {
	const kms = sdk({ org: "hanzo" });
	const before = seen.length;

	for (const call of [
		() => kms.secrets().put({ path: "providers/hanzo", name: "a/b", env: "main", value: "v" }),
		() => kms.secrets().get({ path: "providers/hanzo", name: "a/b", env: "main" }),
		() => kms.secrets().delete({ path: "providers/hanzo", name: "a/b", env: "main" })
	]) {
		await assert.rejects(call, (err) => {
			assert.ok(err instanceof HanzoKmsSDKError);
			assert.match(err.message, /unreadable once written/);
			return true;
		});
	}
	assert.equal(seen.length, before);
});

test("an empty path is refused; a slash-wrapped one is normalized", async () => {
	const kms = sdk({ org: "hanzo" });

	for (const p of ["", "/", "///"]) {
		await assert.rejects(() => kms.secrets().get({ path: p, name: "K" }), (err) => {
			assert.ok(err instanceof HanzoKmsSDKError);
			assert.match(err.message, /path is required/);
			return true;
		});
	}

	// "/providers/hanzo/" and "providers/hanzo" must resolve to one key —
	// the server interpolates the path into its storage key verbatim.
	await kms.secrets().put({ path: "/normalized/path/", name: "K", env: "main", value: "v" });
	assert.equal(seen.at(-1).body.path, "normalized/path");
	assert.equal(await kms.secrets().get({ path: "normalized/path", name: "K", env: "main" }), "v");
});

test("no request URL contains /api/ — Infisical paths are gone", () => {
	assert.ok(seen.length >= 20, `expected the suite to have issued requests, saw ${seen.length}`);
	const offenders = seen.filter((req) => req.url.includes("/api/"));
	assert.deepEqual(offenders, [], "luxfi/kms has never served /api/ paths; it answers them with a JSON 404");
});

test("the published bundle contains no /api/ path", () => {
	const lib = path.join(__dirname, "..", "lib");
	const bundles = fs.readdirSync(lib).filter((f) => f.endsWith(".js") || f.endsWith(".mjs"));

	assert.ok(bundles.length > 0, "build output missing");
	for (const file of bundles) {
		const source = fs.readFileSync(path.join(lib, file), "utf8");
		assert.ok(!source.includes("/api/"), `${file} still references an /api/ path`);
	}
});
