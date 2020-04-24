const fs = require("fs");
const readline = require("readline");
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const inMemory = false;
console.log({ inMemory })

const filename = inMemory ? ':memory:' : path.join(__dirname, 'ssb.db')

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
    filename
  },
  useNullAsDefault: true
});

const rows = new Set();

const main = async () => {
  await knex.schema.createTable("messages", (table) => {
    table.string("key");
    table.json("value");
    table.timestamp("timestamp");
  })

  const rl = readline.createInterface({
    input: fs.createReadStream("log.jsonl"),
    crlfDelay: Infinity,
  });

  let reading = true;
  let batchInProgress = false;
  const batchSize = 256;

  rl.on("line", (line) => {
    // TODO: Convert to batch writes.
    rows.add(JSON.parse(line));
  });

  const writer = setInterval(() => {
    // Writer! This should probably be refactored a bunch.
    if (batchInProgress === false) {
      batchInProgress = true;

      const batch = [];
      const reader = rows.values();

      let done = false;

      while (done === false) {
        const row = reader.next()

        if (row.done || batch.length === batchSize) {
          done = true;
        } else {
          batch.push(row.value);
        }
      }

      knex.batchInsert('messages', batch)
        .then(() => {
          batch.forEach((row) => rows.delete(row))
          batchInProgress = false;
        }).catch((err) => {
          console.log(err)
          batchInProgress = false;
        })
    } else {
      console.log('Miss!')
    }
  }, 100 / 2)

  const checker = setInterval(() => {
    if (rows.size === 0) {
      clearInterval(checker);
      clearInterval(writer);
      knex.destroy()
      console.log('Done writing messages.')
    }
  }, 1000)

  rl.on('close', () => {
    console.log('Done reading messages.')
  })
}

if (module.parent) {
  module.exports = main;
} else {
  main();
}

