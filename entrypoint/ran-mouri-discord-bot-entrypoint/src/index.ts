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
			throw new Error('Missing env var "DISCORD_PUBLIC_KEY".');
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

		// Response for each interaction.
		switch (interaction.type) {
			case 1: // PING
				return handlePing();

			case 2: // APPLICATION COMMAND
				if (interaction.data == null) {
					return makeResponseUnexpectedRequestBody();
				}
				const data = interaction.data;

				switch (data.name) {
					case 'ping':
						return handleCommandPing();

					case 'choices':
						if (interaction.guild_id == null || typeof interaction.guild_id !== 'string') {
							return makeResponseUnexpectedRequestBody();
						}
						const guildId: string = interaction.guild_id;

						if (!Array.isArray(data.options) || data.options.length !== 1) {
							return makeResponseUnexpectedRequestBody();
						}
						const subcommand = data.options[0];
						if (subcommand.type !== 1) {
							return makeResponseUnexpectedRequestBody();
						}

						switch (subcommand.name) {
							case 'view':
								return handleCommandChoicesView(env.prod_db_ran_mouri, guildId, subcommand.options);
						}
				}
		}
		return makeResponseUnexpectedRequestBody();
	},
} satisfies ExportedHandler<Env>;

function handlePing(): Response {
	const body = { type: 1 };
	return Response.json(body);
}

function handleCommandPing(): Response {
	const body = {
		type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
		data: {
			content: 'まさか…PING一…？',
		},
	};
	return Response.json(body, { headers: makeHeaderNormal() });
}

async function handleCommandChoicesView(db: D1Database, guildId: string, options: any): Promise<Response> {
	if (options == null) {
		return handleCommandChoicesViewWithoutGroup(db, guildId);
	}
	if (!Array.isArray(options)) {
		return makeResponseUnexpectedRequestBody();
	}
	const optionGroup = options.find((option) => option.type === 3 && option.name === 'group');
	if (!optionGroup) {
		return handleCommandChoicesViewWithoutGroup(db, guildId);
	}
	const groupName = optionGroup.value;
	if (!groupName) {
		return makeResponseUnexpectedRequestBody();
	}
	return handleCommandChoicesViewWithGroup(db, guildId, groupName);
}

async function handleCommandChoicesViewWithGroup(db: D1Database, guildId: string, groupName: string): Promise<Response> {
	const choiceLabels = await fetchChoices(db, guildId, groupName);

	const content =
		choiceLabels.length === 0 ? 'そんな選択肢グループは無いわよ。' : `${groupName}の選択肢はこれ：\n${choiceLabels.join('\n')}`;
	const body = {
		type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
		data: { content },
	};
	return Response.json(body, { headers: makeHeaderNormal() });
}

async function handleCommandChoicesViewWithoutGroup(db: D1Database, guildId: string): Promise<Response> {
	const groupNames = await fetchChoiceGroupNamesOfGuild(db, guildId);

	const content = `選択肢グループはこれ：\n${groupNames.join('\n')}`;
	const body = {
		type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
		data: { content },
	};
	return Response.json(body, { headers: makeHeaderNormal() });
}

function signatureIsValid(publicKey: string, body: string, timestamp: string, signature: string): boolean {
	const message = timestamp + body;
	return sign.detached.verify(Buffer.from(message), Buffer.from(signature, 'hex'), Buffer.from(publicKey, 'hex'));
}

function makeHeaderNormal(): HeadersInit {
	return {
		'Content-Type': 'application/json',
	};
}

function makeResponseNoHeaderOfSign(key: string): Response {
	const err: ResponseError = {
		title: 'Unauthorized',
		detail: `Header key "${key}" is required but missing.`,
	};
	return Response.json(err, { status: 401 });
}

function makeResponseInvalidSignature(): Response {
	const err: ResponseError = {
		title: 'Unauthorized',
		detail: 'Your signature is invalid.',
	};
	return Response.json(err, { status: 401 });
}

function makeResponseBrokenRequestBody(): Response {
	const err: ResponseError = {
		title: 'Broken Request Body',
		detail: "Your request's body is broken.",
	};
	return Response.json(err, { status: 400 });
}

function makeResponseUnexpectedRequestBody(): Response {
	const err: ResponseError = {
		title: 'Unexpected Request Body',
		detail: "Your request's body is something different from our expectations.",
	};
	return Response.json(err, { status: 400 });
}

async function fetchChoices(db: D1Database, guildId: string, groupName: string): Promise<string[]> {
	const sql = 'SELECT Label FROM Choices WHERE GuildId = ? AND GroupName = ?';
	const dbResult = await db.prepare(sql).bind(guildId, groupName).run();
	if (!dbResult.success) {
		console.log(dbResult.error);
		throw new Error('D1 Error');
	}

	const labels: string[] = [];
	for (const record of dbResult.results) {
		if (!record.Label || typeof record.Label !== 'string') {
			console.log('Invalid record:', record);
			throw new Error('D1 Error');
		}
		const label: string = record.Label;
		labels.push(label);
	}
	return labels;
}

async function fetchChoiceGroupNamesOfGuild(db: D1Database, guildId: string): Promise<string[]> {
	const sql = 'SELECT GroupName FROM Choices WHERE GuildId = ? GROUP BY GroupName';
	const dbResult = await db.prepare(sql).bind(guildId).run();
	if (!dbResult.success) {
		console.log(dbResult.error);
		throw new Error('D1 Error');
	}

	const groupNames: string[] = [];
	for (const record of dbResult.results) {
		if (!record.GroupName || typeof record.GroupName !== 'string') {
			console.log('Invalid record:', record);
			throw new Error('D1 Error');
		}
		const groupName: string = record.GroupName;
		groupNames.push(groupName);
	}
	return groupNames;
}
