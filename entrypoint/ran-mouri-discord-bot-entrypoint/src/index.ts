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

import { ResponseError } from './types';

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const publicKey = env.DISCORD_PUBLIC_KEY;
		if (publicKey == null || publicKey === '') {
			console.log('Required env var "DISCORD_PUBLIC_KEY".');
			const err: ResponseError = {
				title: 'Internal Server Error',
				detail: 'Initialization is failed.',
			};
			return new Response(JSON.stringify(err), { status: 500 });
		}

		return new Response('Hello World!');
	},
} satisfies ExportedHandler<Env>;
