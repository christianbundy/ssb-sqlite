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

const batchSize = 1024;

const cachedAuthorData = {};

sequelize.sync().then(async () => {
  let written = 0;
  let rows = [];

  const maybeWrite = async () => {
    if (rows.length === batchSize) {
      written += batchSize;
      console.log(written.toLocaleString());
      await Message.bulkCreate(rows);
      rows = [];
    }
  };

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

    if (typeof value.content === "object") {
      switch (value.content.type) {
        case "about": {
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
});
