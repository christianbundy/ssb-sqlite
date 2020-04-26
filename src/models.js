const { Sequelize, DataTypes } = require("sequelize");

module.exports = (sequelize) => {
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

  return { Author, Message };
}
