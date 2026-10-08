const { Client } = require("pg");
const fs = require("fs");

if (!process.env.DATABASE_URL && fs.existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error(
    "Set DATABASE_URL in .env.local before running the schema script.",
  );
  process.exit(1);
}

async function run() {
  const client = new Client({
    connectionString,
  });

  try {
    await client.connect();
    const sql = fs.readFileSync("schema.sql", "utf8");
    await client.query(sql);
    console.log("Successfully executed schema.sql");
  } catch (err) {
    console.error("Error executing SQL", err);
  } finally {
    await client.end();
  }
}

run();
