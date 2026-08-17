import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const configPath = resolve("dist/server/wrangler.json");
const databaseName = process.env.CLOUDFLARE_D1_DATABASE_NAME || "tuckq-db";
const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;

if (!databaseId) {
  throw new Error("CLOUDFLARE_D1_DATABASE_ID is required before Cloudflare deploy.");
}

const config = JSON.parse(await readFile(configPath, "utf8"));
config.name = process.env.CLOUDFLARE_WORKER_NAME || "tuckq";
config.d1_databases = [
  {
    binding: "DB",
    database_name: databaseName,
    database_id: databaseId,
  },
];

await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Cloudflare deploy config ready for ${config.name} using D1 ${databaseName}.`);
