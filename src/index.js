const fs = require("fs");
const readline = require("readline");
const path = require("path");

const { Sequelize } = require("sequelize");

const inMemory = false;
const storage = inMemory ? ":memory:" : path.join(__dirname, "..", "ssb.db");
console.log({ inMemory, storage });

try {
  if (inMemory === false) {
    fs.unlinkSync(storage);
    fs.unlinkSync(storage + "-journal");
  }
} catch (e) {
  // database doesn't exist, no problem
}

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage,
  logging:false,
});

const { Message } = require("./models")(sequelize);

const fileStream = fs.createReadStream("log.jsonl");

// Note: we use the crlfDelay option to recognize all instances of CR LF
// ('\r\n') in input.txt as a single line break.
const rl = readline.createInterface({
  input: fileStream,
  crlfDelay: Infinity,
});

const batchSize = 1024;

const main = async () => {
  // Sync up our models with the database.
  await sequelize.sync();

  let transaction = await sequelize.transaction();
  let lineNumber = 0;
  
  setInterval(() => console.log(lineNumber.toLocaleString()), 1000)

  for await (const line of rl) {
    lineNumber += 1;

    const message = JSON.parse(line);
    //  await ingestMessage({ message, transaction })
    const { key, value, timestamp } = message;
    const { previous, author } = value;

    const previousMessage = previous;
    const timestampReceived = timestamp;
    const timestampAsserted = value.timestamp;
    const content = JSON.stringify(value.content);

    await Message.create(
      {
        author,
        content,
        key,
        previousMessage,
        timestampAsserted,
        timestampReceived,
      },
    //  { transaction }
    );

    if (lineNumber % batchSize === 0) {
      console.log(lineNumber.toLocaleString())
      await transaction.commit();
      transaction = await sequelize.transaction();
    }
  }

  // Once we're done reading the stream, make sure we write all of the rows
  // that we haven't already written.
  if (lineNumber % batchSize > 0) {
    console.log(lineNumber.toLocaleString())
    await transaction.commit();
  }

  console.log("Done!");
};

  if (module.parent) {
    module.exports = main;
  } else {
    main();
  }
