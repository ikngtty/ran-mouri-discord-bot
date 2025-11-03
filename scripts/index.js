async function main() {
  const appId = requireEnvVar(process.env, "APP_ID");
  const botToken = requireEnvVar(process.env, "BOT_TOKEN");
  const guildId = requireEnvVar(process.env, "GUILD_ID");

  const url = `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`;
  const body = {
    name: "ping",
    description: "🏓",
  };
  const headers = {
    Authorization: `Bot ${botToken}`,
    "Content-Type": "application/json",
  };

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  console.log(`${response.status} ${response.statusText}`);
  console.dir(await response.json(), { depth: null });
}

main().catch(console.error);

function requireEnvVar(env, key) {
  const v = env[key];
  if (v == null || v === "") {
    console.error(`Required env var ${key}`);
    process.exit(1);
  }
  return v;
}
