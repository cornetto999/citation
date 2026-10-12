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
  const schemaFile = process.argv[2] || "schema.sql";
  if (!["schema.sql", "email_verification.sql"].includes(schemaFile)) {
    console.error("Choose schema.sql or email_verification.sql.");
    process.exitCode = 1;
    return;
  }
  const client = new Client({
    connectionString,
  });

  try {
    await client.connect();
    const sql = fs.readFileSync(schemaFile, "utf8");
    await client.query(sql);
    console.log(`Successfully executed ${schemaFile}`);
  } catch (err) {
    console.error("Error executing SQL", err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

run();
