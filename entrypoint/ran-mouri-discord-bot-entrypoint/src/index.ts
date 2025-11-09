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
		const maxChoiceCountOfGuildText = env.MAX_CHOICE_COUNT_OF_GUILD;
		if (maxChoiceCountOfGuildText == null || maxChoiceCountOfGuildText.length === 0) {
			throw new Error('Missing env var "MAX_CHOICE_COUNT_OF_GUILD".');
		}
		const maxChoiceCountOfGuild = parseInt(maxChoiceCountOfGuildText);
		if (Number.isNaN(maxChoiceCountOfGuild)) {
			throw new Error('Wrong type env var "MAX_CHOICE_COUNT_OF_GUILD".');
		}

		const db = env.prod_db_ran_mouri;

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

					case 'choice': {
						if (interaction.guild_id == null || typeof interaction.guild_id !== 'string') {
							return makeResponseUnexpectedRequestBody();
						}
						const guildId: string = interaction.guild_id;

						return handleCommandChoice(db, guildId, data.options);
					}

					case 'choices': {
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
								return handleCommandChoicesView(db, guildId, subcommand.options);
							case 'add':
								return handleCommandChoicesAdd(maxChoiceCountOfGuild, db, guildId, subcommand.options);
							case 'delete':
								return handleCommandChoicesDelete(db, guildId, subcommand.options);
						}
					}

					case 'random':
						return handleCommandRandom(data.options);

					case 'r-random':
						return handleCommandRRandom(data.options);
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

async function handleCommandChoice(db: D1Database, guildId: string, options: any): Promise<Response> {
	if (options == null || !Array.isArray(options)) {
		return makeResponseUnexpectedRequestBody();
	}

	const optionGroup = options.find((option) => option.type === 3 && option.name === 'group');
	if (!optionGroup) {
		return makeResponseUnexpectedRequestBody();
	}
	if (optionGroup.value == null || typeof optionGroup.value !== 'string') {
		return makeResponseUnexpectedRequestBody();
	}
	const groupName: string = optionGroup.value;

	const choiceCount = await fetchCountOfChoices(db, guildId, groupName);
	if (choiceCount === 0) {
		const content = `「${groupName}」なんて選択肢グループは無いわ。`;
		const body = {
			type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
			data: { content },
		};
		return Response.json(body, { headers: makeHeaderNormal() });
	}

	const choiceLabel = await fetchRandomChoice(db, guildId, groupName);

	const content = choiceLabel;
	const body = {
		type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
		data: { content },
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
	if (optionGroup.value == null || typeof optionGroup.value !== 'string') {
		return makeResponseUnexpectedRequestBody();
	}
	const groupName: string = optionGroup.value;

	return handleCommandChoicesViewWithGroup(db, guildId, groupName);
}

async function handleCommandChoicesViewWithGroup(db: D1Database, guildId: string, groupName: string): Promise<Response> {
	const choiceLabels = await fetchChoices(db, guildId, groupName);

	const content =
		choiceLabels.length === 0
			? `「${groupName}」なんて選択肢グループは無いわ。`
			: `「${groupName}」の選択肢はこれ：\n${choiceLabels.join('\n')}`;
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

async function handleCommandChoicesAdd(maxChoiceCountOfGuild: number, db: D1Database, guildId: string, options: any): Promise<Response> {
	if (options == null || !Array.isArray(options)) {
		return makeResponseUnexpectedRequestBody();
	}

	const optionGroup = options.find((option) => option.type === 3 && option.name === 'group');
	if (!optionGroup) {
		return makeResponseUnexpectedRequestBody();
	}
	if (optionGroup.value == null || typeof optionGroup.value !== 'string') {
		return makeResponseUnexpectedRequestBody();
	}
	const groupName: string = optionGroup.value;

	const optionValue = options.find((option) => option.type === 3 && option.name === 'value');
	if (!optionValue) {
		return makeResponseUnexpectedRequestBody();
	}
	if (optionValue.value == null || typeof optionValue.value !== 'string') {
		return makeResponseUnexpectedRequestBody();
	}
	const value: string = optionValue.value;

	if (await fetchExistenseOfChoice(db, guildId, groupName, value)) {
		const content = `「${groupName}」に「${value}」はもうあるわ。`;
		const body = {
			type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
			data: { content },
		};
		return Response.json(body, { headers: makeHeaderNormal() });
	}

	if ((await fetchCountOfChoicesOfGuild(db, guildId)) >= maxChoiceCountOfGuild) {
		const content = '選択肢大杉';
		const body = {
			type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
			data: { content },
		};
		return Response.json(body, { headers: makeHeaderNormal() });
	}

	await insertChoice(db, guildId, groupName, value);

	const content = `「${groupName}」に「${value}」を追加したわ。`;
	const body = {
		type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
		data: { content },
	};
	return Response.json(body, { headers: makeHeaderNormal() });
}

async function handleCommandChoicesDelete(db: D1Database, guildId: string, options: any): Promise<Response> {
	if (options == null || !Array.isArray(options)) {
		return makeResponseUnexpectedRequestBody();
	}

	// TODO: A feature to delete all choices of a group.

	const optionGroup = options.find((option) => option.type === 3 && option.name === 'group');
	if (!optionGroup) {
		return makeResponseUnexpectedRequestBody();
	}
	if (optionGroup.value == null || typeof optionGroup.value !== 'string') {
		return makeResponseUnexpectedRequestBody();
	}
	const groupName: string = optionGroup.value;

	const optionValue = options.find((option) => option.type === 3 && option.name === 'value');
	if (!optionValue) {
		return makeResponseUnexpectedRequestBody();
	}
	if (optionValue.value == null || typeof optionValue.value !== 'string') {
		return makeResponseUnexpectedRequestBody();
	}
	const value: string = optionValue.value;

	const deleteCount = await deleteChoice(db, guildId, groupName, value);

	const content = deleteCount === 0 ? `「${groupName}」の「${value}」なんて無かったわ。` : `「${groupName}」の「${value}」を削除したわ。`;
	const body = {
		type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
		data: { content },
	};
	return Response.json(body, { headers: makeHeaderNormal() });
}

async function handleCommandRandom(options: any): Promise<Response> {
	let count = 7;
	if (options != null && Array.isArray(options)) {
		const countOption = options.find((option) => option.type === 4 && option.name == 'count');
		if (countOption != null && countOption.value != null && typeof countOption.value === 'number') {
			count = countOption.value;
		}
	}

	const nums = seq(1, count);
	for (let i = count - 1; i >= 1; i--) {
		const j = getRandomInt(i + 1); // 0 To i
		[nums[i], nums[j]] = [nums[j], nums[i]];
	}

	const content = nums.join(count >= 10 ? ' ' : '');
	const body = {
		type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
		data: { content },
	};
	return Response.json(body, { headers: makeHeaderNormal() });
}

async function handleCommandRRandom(options: any): Promise<Response> {
	let count = 7;
	if (options != null && Array.isArray(options)) {
		const countOption = options.find((option) => option.type === 4 && option.name == 'count');
		if (countOption != null && countOption.value != null && typeof countOption.value === 'number') {
			count = countOption.value;
		}
	}

	const numsOrigin = seq(1, count);
	if (getRandomInt(2) === 1) {
		numsOrigin.reverse();
	}
	const index = getRandomInt(count);
	const nums = numsOrigin.slice(index).concat(numsOrigin.slice(0, index));

	const content = nums.join(count >= 10 ? ' ' : '');
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

async function insertChoice(db: D1Database, guildId: string, groupName: string, label: string): Promise<void> {
	const sql = 'INSERT INTO Choices (GuildId, GroupName, Label) VALUES (?, ?, ?)';
	const dbResult = await db.prepare(sql).bind(guildId, groupName, label).run();
	if (!dbResult.success) {
		console.log(dbResult.error);
		throw new Error('D1 Error');
	}
	return;
}

async function deleteChoice(db: D1Database, guildId: string, groupName: string, label: string): Promise<number> {
	const sql = 'DELETE FROM Choices WHERE GuildId = ? AND GroupName = ? AND Label = ?';
	const dbResult = await db.prepare(sql).bind(guildId, groupName, label).run();
	if (!dbResult.success) {
		console.log(dbResult.error);
		throw new Error('D1 Error');
	}
	return dbResult.meta.changes;
}

async function fetchExistenseOfChoice(db: D1Database, guildId: string, groupName: string, label: string): Promise<boolean> {
	const sql = 'SELECT Label FROM Choices WHERE GuildId = ? AND GroupName = ? AND Label = ?';
	const record = await db.prepare(sql).bind(guildId, groupName, label).first();

	return record != null;
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

async function fetchCountOfChoices(db: D1Database, guildId: string, groupName: string): Promise<number> {
	const sql = 'SELECT COUNT(Label) as Count FROM Choices WHERE GuildId = ? AND GroupName = ?';
	const record = await db.prepare(sql).bind(guildId, groupName).first();
	if (record == null) {
		console.log('No result of count.');
		throw new Error('D1 Error');
	}

	if (record.Count == null || typeof record.Count !== 'number') {
		console.log('Invalid record:', record);
		throw new Error('D1 Error');
	}
	return record.Count;
}

async function fetchRandomChoice(db: D1Database, guildId: string, groupName: string): Promise<string> {
	const sql = 'SELECT Label FROM Choices WHERE GuildId = ? AND GroupName = ? ORDER BY RANDOM() LIMIT 1';
	const record = await db.prepare(sql).bind(guildId, groupName).first();
	if (record == null) {
		console.log('No data.');
		throw new Error('D1 Error');
	}

	if (record.Label == null || typeof record.Label !== 'string') {
		console.log('Invalid record:', record);
		throw new Error('D1 Error');
	}
	return record.Label;
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

async function fetchCountOfChoicesOfGuild(db: D1Database, guildId: string): Promise<number> {
	const sql = 'SELECT COUNT(Label) as Count FROM Choices WHERE GuildId = ?';
	const record = await db.prepare(sql).bind(guildId).first();
	if (record == null) {
		console.log('No result of count.');
		throw new Error('D1 Error');
	}

	if (record.Count == null || typeof record.Count !== 'number') {
		console.log('Invalid record:', record);
		throw new Error('D1 Error');
	}
	return record.Count;
}

function seq(start: number, length: number): number[] {
	return Array.from({ length }, (_, i) => i + start);
}

// 0 to (max - 1)
function getRandomInt(max: number): number {
	return Math.floor(Math.random() * max);
}
