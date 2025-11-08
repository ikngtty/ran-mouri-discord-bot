# Entrypoint - Ran Mouri Discord Bot

## Preparation

### Env

Set these environment variables:

- DISCORD_PUBLIC_KEY

### DB

D1 is used.\
Necessary database is specified in [wrangler.jsonc](wrangler.jsonc).\
Its schema is specified in [sqls/schema.sql](sqls/schema.sql).\
You must manage the database with wrangler command.

```shell
$ npx wrangler d1 create prod-db-ran-mouri
$ npx wrangler d1 execute prod-db-ran-mouri --file=./sqls/schema.sql
```
