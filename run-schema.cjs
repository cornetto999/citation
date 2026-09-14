const { Client } = require('pg');
const fs = require('fs');

const connectionString = "postgresql://postgres:xb71Dmo3d2c2LEFd@db.goriecoogiwiezrrrcdh.supabase.co:5432/postgres";

async function run() {
  const client = new Client({
    connectionString,
  });

  try {
    await client.connect();
    const sql = fs.readFileSync('schema.sql', 'utf8');
    await client.query(sql);
    console.log("Successfully executed schema.sql");
  } catch (err) {
    console.error("Error executing SQL", err);
  } finally {
    await client.end();
  }
}

run();
