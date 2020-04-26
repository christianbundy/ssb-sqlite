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
  logging: false,
});

const { Message, Author } = require("./models")(sequelize);

const fileStream = fs.createReadStream("log.jsonl");

// Note: we use the crlfDelay option to recognize all instances of CR LF
// ('\r\n') in input.txt as a single line break.
const rl = readline.createInterface({
  input: fileStream,
  crlfDelay: Infinity,
});

const batchSize = 2048;

const main = async () => {
  // Sync up our models with the database.
  await sequelize.sync();

  let transaction = await sequelize.transaction();
  let lineNumber = 0;

  // HACK(BULK): `Message.bulkCreate()` is much faster than `Message.create()`.
  let messagesToCreate = [];

  const start = Date.now();

  const perSecondInterval = setInterval(() => {
    const messages = lineNumber;
    const seconds = Math.round((Date.now() - start) / 1000);
    const messagesPerSecond = Math.round(lineNumber / seconds);

    // 1 million bytes
    const toMb = (bytes) => `${Math.round((bytes / 1000000) * 100) / 100} MB`;

    const used = process.memoryUsage();

    console.log(
      Object.fromEntries(
        Object.entries(used).map(([key, value]) => [key, toMb(value)])
      )
    );

    console.log({ messages, seconds, messagesPerSecond });
  }, 6000);

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

    messagesToCreate.push({
      author,
      content,
      key,
      previousMessage,
      timestampAsserted,
      timestampReceived,
    });

    // If we can see the content of the message (i.e. it isn't private), then
    // we probably want to process the message for further information. For
    // example, 'about' messages let people save their name, image, and
    // description. In the future this code can be expanded to handle other
    // types of messages.
    if (typeof value.content === "object") {
      switch (value.content.type) {
        case "about": {
          if (typeof value.content.name === "string") {
            await Author.upsert(
              { key: author, name: value.content.name },
              { transaction }
            );
          }
          if (typeof value.content.description === "string") {
            await Author.upsert(
              { key: author, description: value.content.description },
              { transaction }
            );
          }

          // Sometime the image is a blob string, sometimes it's an object with
          // a `link` property containing the blob string, and (of course)
          // sometimes it's just a malformed message that we can't understand.
          switch (typeof value.content.image) {
            case "string": {
              await Author.upsert(
                { key: author, image: value.content.image },
                { transaction }
              );
              break;
            }
            case "object": {
              // Apparently `typeof null === "object"...
              if (
                value.content.image !== null &&
                value.content.image.link === "string"
              ) {
                await Author.upsert(
                  { key: author, image: value.content.image.link },
                  { transaction }
                );
              }
              break;
            }
          }
        }
      }
    }

    if (lineNumber % batchSize === 0) {
      // HACK(BULK)
      if (messagesToCreate.length) {
        await Message.bulkCreate(messagesToCreate, { transaction });
        messagesToCreate = [];
      }

      await transaction.commit();
      transaction = await sequelize.transaction();
    }
  }

  clearInterval(perSecondInterval);

  // Once we're done reading the stream, make sure we write all of the rows
  // that we haven't already written.
  if (lineNumber % batchSize > 0) {
    await transaction.commit();
  }
};

if (module.parent) {
  module.exports = main;
} else {
  main();
}
