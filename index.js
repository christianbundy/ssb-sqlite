const fs = require("fs");
const readline = require("readline");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const inMemory = true;
console.log({ inMemory });

const filename = inMemory ? ":memory:" : path.join(__dirname, "ssb.db");

try {
  if (inMemory === false) {
    fs.unlinkSync(filename);
  }
} catch (e) {
  // database doesn't exist, no problem
}

new sqlite3.Database(filename);

const knex = require("knex")({
  client: "sqlite3",
  connection: {
    filename,
  },
  useNullAsDefault: true,
});

const noop = () => {};

const main = async () => {
  await knex.schema.createTable("messages", (table) => {
    table.string("key");
    table.json("value");
    table.timestamp("timestamp");
  });

  knex
    .transaction(function (trx) {
      const rl = readline.createInterface({
        input: fs.createReadStream("log.jsonl"),
        crlfDelay: Infinity,
      });

      rl.on("line", (line) => {
        // TODO: Convert to batch writes.
        knex("messages").transacting(trx).insert(JSON.parse(line)).then(noop);
      });

      rl.on("close", () => {
        console.log("Done reading messages.");
        trx.commit();
      });
    })
    .then(function (res) {
      console.log("Transaction complete.");
      knex.destroy();
    })
    .catch(function (err) {
      console.error(err);
    });
};

if (module.parent) {
  module.exports = main;
} else {
  main();
}
