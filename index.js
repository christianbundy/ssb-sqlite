const fs = require("fs");
const readline = require("readline");
const path = require("path");
const { Sequelize, DataTypes } = require("sequelize");

const inMemory = false;
const storage = inMemory ? ":memory:" : path.join(__dirname, "ssb.db");
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

const memoryReporter = setInterval(() => {
  console.log(
    Object.fromEntries(
      Object.entries(process.memoryUsage()).map(([k, v]) => [
        k,
        v / 1024 / 1024,
      ])
    )
  );
}, 1000);
clearInterval(memoryReporter);

const Author = sequelize.define("author", {
  key: {
    type: DataTypes.STRING(53),
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING,
  },
  description: {
    type: DataTypes.STRING,
  },
  image: {
    type: DataTypes.STRING,
  },
});

const Message = sequelize.define("message", {
  key: {
    type: DataTypes.STRING(52),
    allowNull: false,
  },
  previousMessage: {
    type: DataTypes.STRING(52),
  },
  author: {
    type: DataTypes.STRING(53),
    allowNull: false,
  },
  content: {
    type: DataTypes.JSON,
    allowNull: false,
  },
  timestampReceived: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  timestampAsserted: {
    type: DataTypes.DATE,
    allowNull: false,
  },
});

const fileStream = fs.createReadStream("log.jsonl");

// Note: we use the crlfDelay option to recognize all instances of CR LF
// ('\r\n') in input.txt as a single line break.
const rl = readline.createInterface({
  input: fileStream,
  crlfDelay: Infinity,
});


// { "@abc": { name, image, description } }
const cachedAuthorData = {};

const main = async () => { 
  // How many messages we've written to the database?
  let written = 0;
  // Which rows still need to be written to the database?
  let rows = [];

  // Sync up our models with the database.
  await sequelize.sync()

  // Every once in a while, we want to take `rows` and insert them into the
  // database in bulk. Once we're finished writing all of the rows, we can
  // reset `rows` to an empty array.
  const write = async () => {
      await Message.bulkCreate(rows);
      written += rows.length;
      console.log(written.toLocaleString());
      rows = [];
  }

  // We don't want to write when `rows` only has one item, but we also don't
  // want to wait until `rows` has a billion items because it'll take up a
  // bunch of memory. There's no right answer, but we can choose an arbitrary
  // number that balances the trade-offs between speed and memory consumption.
  const batchSize = 1024;
  // If the row is big enough to justify a batch, write it.it
  const maybeWrite = async () => rows.length === batchSize ? write() : null

  for await (const line of rl) {
    const { key, value, timestamp } = JSON.parse(line);
    const { previous, author } = value;

    const previousMessage = previous;
    const timestampReceived = timestamp;
    const timestampAsserted = value.timestamp;
    const content = JSON.stringify(value.content);

    rows.push({
      author,
      content,
      key,
      previousMessage,
      timestampAsserted,
      timestampReceived,
    });

    await maybeWrite();

    // If we can see the content of the message (i.e. it isn't private), then
    // we probably want to process the message for further information. For
    // example, 'about' messages let people save their name, image, and
    // description. In the future this code can be expanded to handle other
    // types of messages.
    if (typeof value.content === "object") {
      switch (value.content.type) {
        case "about": {

          // We don't actually want to write to the database each time that
          // someone changes their name, image, or description. Instead, we
          // just save it into an object and then write all of those rows once
          // we're done processing messages.
          //
          // TODO: Refactor the batch writing code so that these are
          // implemented in the same transaction as the batch write? It feels
          // bad to maintain state in *both* `rows` and this other
          // `cachedAuthorData` object.
          if (cachedAuthorData[author] === undefined) {
            cachedAuthorData[author] = {};
          }

          const thisAuthor = cachedAuthorData[author];

          if (typeof value.content.name === "string") {
            thisAuthor.name = value.content.name;
          }
          if (typeof value.content.description === "string") {
            thisAuthor.description = value.content.description;
          }

          // Sometime the image is a blob string, sometimes it's an object with
          // a `link` property containing the blob string, and (of course)
          // sometimes it's just a malformed message that we can't understand.
          switch (typeof value.content.image) {
            case "string": {
              thisAuthor.image = value.content.image;
              break;
            }
            case "object": {
              // Apparently `typeof null === "object"...
              if (
                value.content.image !== null &&
                value.content.image.link === "string"
              ) {
                thisAuthor.image = value.content.image.link;
              }
              break;
            }
          }
        }
      }
    }
  }

  // Once we're done reading the stream, make sure we write all of the rows
  // that we haven't already written.
  if (rows.length) {
    write()
  }

  // Convert our object to a row that we can insert into the database.
  const authorRows = Object.entries(cachedAuthorData).map(
    ([key, { name, image, description }]) => ({
      key,
      name,
      image,
      description,
    })
  );
  console.log("Writing authors...");

  await Author.bulkCreate(authorRows);
  console.log("Done!");
};

if (module.parent) {
  module.exports = main
} else {
  main()
}
