const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
// Shared contracts have no package.json, so Expo's workspace scan omits them.
config.watchFolders = [
  ...config.watchFolders,
  path.resolve(__dirname, "../../packages/contracts")
];
module.exports = config;
