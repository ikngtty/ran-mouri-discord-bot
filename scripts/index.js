import config from "./config.json" with { type: "json" };

const { appId, botToken, guildId } = config;

async function main() {
  // Get arguments.
  if (process.argv.length <= 2) {
    console.error("Required argument subcommand");
    process.exit(1);
  }
  const subcommand = process.argv[2];

  // Execute.
  switch (subcommand) {
    case "list":
      await listCommand(appId, botToken, guildId);
      break;

    case "add":
      if (process.argv.length <= 3) {
        console.error("Required argument command name");
        process.exit(1);
      }
      const commandNameToAdd = process.argv[3];
      await addCommand(appId, botToken, guildId, commandNameToAdd);
      break;

    case "remove":
      if (process.argv.length <= 3) {
        console.error("Required argument command ID");
        process.exit(1);
      }
      const commandIdToRemove = process.argv[3];
      await removeCommand(appId, botToken, guildId, commandIdToRemove);
      break;

    default:
      console.error("Invalid subcommand");
      process.exit(1);
      break;
  }
}

main().catch(console.error);

async function listCommand(appId, botToken, guildId) {
  const url = getDicordApiUrlGuildCommands(appId, guildId);
  const headers = makeHeaders(botToken);

  const response = await fetch(url, {
    method: "GET",
    headers,
  });

  await showResponse(response);
}

async function addCommand(appId, botToken, guildId, commandName) {
  const url = getDicordApiUrlGuildCommands(appId, guildId);
  const headers = makeHeaders(botToken);

  let body = null;
  switch (commandName) {
    case "ping":
      body = {
        name: "ping",
        description: "🏓",
      };
      break;

    default:
      console.error("Invalid command name");
      process.exit(1);
      break;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  await showResponse(response);
}

async function removeCommand(appId, botToken, guildId, commandId) {
  const url = getDicordApiUrlGuildCommand(appId, guildId, commandId);
  const headers = makeHeaders(botToken);

  const response = await fetch(url, {
    method: "DELETE",
    headers,
  });

  await showResponse(response);
}

function getDicordApiUrlGuildCommands(appId, guildId) {
  return `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`;
}

function getDicordApiUrlGuildCommand(appId, guildId, commandId) {
  const urlOfCommands = getDicordApiUrlGuildCommands(appId, guildId);
  return `${urlOfCommands}/${commandId}`;
}

function makeHeaders(botToken) {
  return {
    Authorization: `Bot ${botToken}`,
    "Content-Type": "application/json",
  };
}

async function showResponse(response) {
  console.log(`${response.status} ${response.statusText}`);
  const body = await response.text();
  if (body !== "") {
    console.dir(JSON.parse(body), { depth: null });
  }
}
