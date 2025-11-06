/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { sign } from 'tweetnacl';
import { ResponseError } from './types';

const REQUEST_HEADER_SIGNATURE = 'X-Signature-Ed25519';
const REQUEST_HEADER_TIMESTAMP = 'X-Signature-Timestamp';

export default {
	async fetch(request, env, ctx): Promise<Response> {
		// Get env vars.
		const publicKey = env.DISCORD_PUBLIC_KEY;
		if (publicKey == null || publicKey === '') {
			console.log('Required env var "DISCORD_PUBLIC_KEY".');
			return makeResponseNoEnvVar();
		}

		// Get request's headers and body.
		const signature = request.headers.get(REQUEST_HEADER_SIGNATURE);
		if (signature == null || signature === '') {
			return makeResponseNoHeaderOfSign(REQUEST_HEADER_SIGNATURE);
		}
		const timestamp = request.headers.get(REQUEST_HEADER_TIMESTAMP);
		if (timestamp == null || timestamp === '') {
			return makeResponseNoHeaderOfSign(REQUEST_HEADER_TIMESTAMP);
		}
		const body = await request.text();

		// Verify the signature.
		if (!signatureIsValid(publicKey, body, timestamp, signature)) {
			return makeResponseInvalidSignature();
		}

		// Parse request's body.
		let interaction;
		try {
			interaction = JSON.parse(body);
		} catch (err) {
			if (err instanceof SyntaxError) {
				return makeResponseBrokenRequestBody();
			}
			throw err;
		}

		return new Response('Hello World!');
	},
} satisfies ExportedHandler<Env>;

function signatureIsValid(publicKey: string, body: string, timestamp: string, signature: string): boolean {
	const message = body + timestamp;
	return sign.detached.verify(Buffer.from(message), Buffer.from(signature, 'hex'), Buffer.from(publicKey, 'hex'));
}

function makeResponseNoEnvVar(): Response {
	const err: ResponseError = {
		title: 'Internal Server Error',
		detail: 'Initialization is failed.',
	};
	return new Response(JSON.stringify(err), { status: 500 });
}

function makeResponseNoHeaderOfSign(key: string): Response {
	const err: ResponseError = {
		title: 'Unauthorized',
		detail: `Header key "${key}" is required but missing.`,
	};
	return new Response(JSON.stringify(err), { status: 401 });
}

function makeResponseInvalidSignature(): Response {
	const err: ResponseError = {
		title: 'Unauthorized',
		detail: 'Your signature is invalid.',
	};
	return new Response(JSON.stringify(err), { status: 401 });
}

function makeResponseBrokenRequestBody(): Response {
	const err: ResponseError = {
		title: 'Broken Request Body',
		detail: "Your request's body is broken.",
	};
	return new Response(JSON.stringify(err), { status: 400 });
}
