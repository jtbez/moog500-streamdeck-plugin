import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";

export default {
  input: "src/plugin.js",
  output: {
    file: "com.moog500.presetbuilder.sdPlugin/bin/plugin.js",
    format: "cjs",
    sourcemap: false
  },
  external: ["child_process", "dgram", "os", "path", "fs", "midi"],
  plugins: [
    resolve(),
    commonjs()
  ]
};
