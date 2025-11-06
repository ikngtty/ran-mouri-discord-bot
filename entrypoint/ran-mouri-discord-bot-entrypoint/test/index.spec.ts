import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { sign } from 'tweetnacl';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';

const SEED = Buffer.from('SeedForTest234567890123456789012');

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('The Entrypoint Worker', () => {
	it('responds with Hello World!', async () => {
		const body = 'text from discord';
		const timestamp = '12345';
		const { publicKey, signature } = makeSignature(body, timestamp);

		const request = new IncomingRequest('http://example.com', {
			method: 'POST',
			headers: {
				'X-Signature-Ed25519': signature,
				'X-Signature-Timestamp': timestamp,
			},
			body,
		});
		const env = { DISCORD_PUBLIC_KEY: publicKey };
		// Create an empty context to pass to `worker.fetch()`.
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, env, ctx);
		// Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		expect(await response.text()).toMatchInlineSnapshot(`"Hello World!"`);
	});

	it('refuses a wrong signature', async () => {
		const body = 'text from discord';
		const timestamp = '12345';
		const { publicKey, signature: rightSignature } = makeSignature(body, timestamp);
		const signature = destroySignature(rightSignature);

		const request = new IncomingRequest('http://example.com', {
			method: 'POST',
			headers: {
				'X-Signature-Ed25519': signature,
				'X-Signature-Timestamp': timestamp,
			},
			body,
		});
		const env = { DISCORD_PUBLIC_KEY: publicKey };
		// Create an empty context to pass to `worker.fetch()`.
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, env, ctx);
		// Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(401);
		const respBody = await response.json();
		expect(respBody).toHaveProperty('title', 'Unauthorized');
		expect(respBody).toHaveProperty('detail', 'Your signature is invalid.');
	});

	it('refuses no signature header', async () => {
		const body = 'text from discord';
		const timestamp = '12345';
		const { publicKey, signature } = makeSignature(body, timestamp);

		const request = new IncomingRequest('http://example.com', {
			method: 'POST',
			headers: {
				// 'X-Signature-Ed25519': signature,
				'X-Signature-Timestamp': timestamp,
			},
			body,
		});
		const env = { DISCORD_PUBLIC_KEY: publicKey };
		// Create an empty context to pass to `worker.fetch()`.
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, env, ctx);
		// Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(401);
		const respBody = await response.json();
		expect(respBody).toHaveProperty('title', 'Unauthorized');
		expect(respBody).toHaveProperty('detail', 'Header key "X-Signature-Ed25519" is required but missing.');
	});

	it('refuses no timestamp header', async () => {
		const body = 'text from discord';
		const timestamp = '12345';
		const { publicKey, signature } = makeSignature(body, timestamp);

		const request = new IncomingRequest('http://example.com', {
			method: 'POST',
			headers: {
				'X-Signature-Ed25519': signature,
				// 'X-Signature-Timestamp': timestamp,
			},
			body,
		});
		const env = { DISCORD_PUBLIC_KEY: publicKey };
		// Create an empty context to pass to `worker.fetch()`.
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, env, ctx);
		// Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(401);
		const respBody = await response.json();
		expect(respBody).toHaveProperty('title', 'Unauthorized');
		expect(respBody).toHaveProperty('detail', 'Header key "X-Signature-Timestamp" is required but missing.');
	});

	it('returns an error when env var "DISCORD_PUBLIC_KEY" is missing', async () => {
		const request = new IncomingRequest('http://example.com');
		// Make `env` by making an object satisfying Env and removing the field.
		const fakeEnv: Env = { DISCORD_PUBLIC_KEY: '' };
		const { DISCORD_PUBLIC_KEY: _, ...env } = fakeEnv;
		// Create an empty context to pass to `worker.fetch()`.
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, env as Env, ctx);
		// Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(500);
		const respBody = await response.json();
		expect(respBody).toHaveProperty('title', 'Internal Server Error');
		expect(respBody).toHaveProperty('detail', 'Initialization is failed.');
	});
});

function makeSignature(body: string, timestamp: string): { publicKey: string; signature: string } {
	const message = body + timestamp;
	const keyPair = sign.keyPair.fromSeed(SEED);
	const publicKey = Buffer.from(keyPair.publicKey).toString('hex');
	const signatureBytes = sign.detached(Buffer.from(message), keyPair.secretKey);
	const signature = Buffer.from(signatureBytes).toString('hex');
	return { publicKey, signature };
}

function destroySignature(signature: string): string {
	const buf = Buffer.from(signature, 'hex');
	buf[0] = buf[0] ^ 0xff;
	return buf.toString('hex');
}
