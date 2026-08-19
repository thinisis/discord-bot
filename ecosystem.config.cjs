const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({
  path: path.resolve(__dirname, ".env")
});

const lavalinkConfigPath = process.env.LAVALINK_CONFIG || path.resolve(__dirname, "infra/lavalink/application.yml");
const lavalinkJarPath = process.env.LAVALINK_JAR || "/opt/lavalink/Lavalink.jar";

module.exports = {
  apps: [
    {
      name: "discord-bot-admin",
      cwd: __dirname,
      script: "dist/main.js",
      interpreter: "node",
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: process.env.NODE_ENV || "production"
      }
    },
    {
      name: "discord-bot-lavalink",
      cwd: __dirname,
      script: process.env.JAVA_BIN || "java",
      args: `-jar ${lavalinkJarPath} --spring.config.location=${lavalinkConfigPath}`,
      interpreter: "none",
      autorestart: true,
      max_restarts: 10,
      env: {
        SERVER_PORT: process.env.SERVER_PORT || "2333",
        LAVALINK_SERVER_PASSWORD: process.env.LAVALINK_SERVER_PASSWORD || process.env.LAVALINK_PASSWORD || "youshallnotpass"
      }
    }
  ]
};
