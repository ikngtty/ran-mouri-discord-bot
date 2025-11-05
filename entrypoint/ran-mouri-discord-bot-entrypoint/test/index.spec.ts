import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('The Entrypoint Worker', () => {
	it('responds with Hello World!', async () => {
		const request = new IncomingRequest('http://example.com');
		const env = makeEnv();
		// Create an empty context to pass to `worker.fetch()`.
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, env, ctx);
		// Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		expect(await response.text()).toMatchInlineSnapshot(`"Hello World!"`);
	});

	it('returns an error when env var "DISCORD_PUBLIC_KEY" is missing', async () => {
		const request = new IncomingRequest('http://example.com');
		const { DISCORD_PUBLIC_KEY: _, ...env } = makeEnv();
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

function makeEnv(): Env {
	return {
		DISCORD_PUBLIC_KEY: 'DiscordPublicKeyForTest',
	};
}
