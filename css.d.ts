// TypeScript 6 checks side-effect imports, so `import "./global.css"` needs a
// declaration to resolve against.
declare module "*.css";
