const commonjs = require("@rollup/plugin-commonjs");
const resolve = require("@rollup/plugin-node-resolve");
const terser = require("@rollup/plugin-terser");

module.exports = [
  {
    input: "src/Scripts/main.js",
    output: {
      file: "Go.novaextension/Scripts/main.js",
      format: "cjs",
    },
    plugins: [commonjs(), resolve({ preferBuiltins: true })],
  },
];
