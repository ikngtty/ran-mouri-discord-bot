import Discord from "./discord.js";

import config from "./config.json" with { type: "json" };
const { botToken, appId, guildId } = config;

async function main() {
  // Get arguments.
  if (process.argv.length <= 2) {
    console.error("Required argument subcommand");
    process.exit(1);
  }
  const subcommand = process.argv[2];

  // Execute.
  const discord = new Discord(botToken, appId, { guildId });
  switch (subcommand) {
    case "list":
      {
        const { ok, value } = await discord.listCommand();
        console.dir(value, { depth: null });
      }
      break;

    case "add":
      {
        if (process.argv.length <= 3) {
          console.error("Required argument command name");
          process.exit(1);
        }
        const commandName = process.argv[3];

        const command = makeCommand(commandName);

        const { ok, value } = await discord.addCommand(command);
        console.dir(value, { depth: null });
      }
      break;

    case "remove":
      {
        if (process.argv.length <= 3) {
          console.error("Required argument command ID");
          process.exit(1);
        }
        const commandId = process.argv[3];

        const { ok, value } = await discord.removeCommand(commandId);
        console.dir(value, { depth: null });
      }
      break;

    default:
      console.error("Invalid subcommand");
      process.exit(1);
      break;
  }
}

main().catch(console.error);

function makeCommand(name) {
  switch (name) {
    case "ping":
      return {
        name,
        description: "🏓",
      };

    default:
      console.error("Invalid command name");
      process.exit(1);
      break;
  }
}
