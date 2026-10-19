const fs = require("fs");
const path = require("path");

const XOR_KEY = 0x4f;

function encodeStringToTable(str, key) {
  const bytes = new TextEncoder().encode(str);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += String.fromCharCode(bytes[i] ^ (key ^ (i % 11)));
  }
  return btoa(out);
}

function obfuscateWorkerCode(code) {
  const stringTable = [];
  const stringIndexMap = new Map();

  function getOrAddString(strContent) {
    if (stringIndexMap.has(strContent)) return stringIndexMap.get(strContent);
    const idx = stringTable.length;
    stringTable.push(encodeStringToTable(strContent, XOR_KEY));
    stringIndexMap.set(strContent, idx);
    return idx;
  }

  // Extract top-level imports to ensure ES module imports stay at the very top of the file
  const lines = code.split("\n");
  const importLines = [];
  const bodyLines = [];

  for (const line of lines) {
    if (/^import\s+[\s\S]*?;?$/.test(line.trim())) {
      importLines.push(line);
    } else {
      bodyLines.push(line);
    }
  }

  const bodyCode = bodyLines.join("\n");
  let i = 0;
  const len = bodyCode.length;
  let output = "";

  while (i < len) {
    const char = bodyCode[i];
    const nextChar = i + 1 < len ? bodyCode[i + 1] : "";

    if (char === "/" && nextChar === "/") {
      const end = bodyCode.indexOf("\n", i);
      if (end === -1) { output += bodyCode.slice(i); break; }
      output += bodyCode.slice(i, end);
      i = end;
      continue;
    }

    if (char === "/" && nextChar === "*") {
      const end = bodyCode.indexOf("*/", i + 2);
      if (end === -1) { output += bodyCode.slice(i); break; }
      output += bodyCode.slice(i, end + 2);
      i = end + 2;
      continue;
    }

    if (char === "`") {
      let end = i + 1;
      while (end < len) {
        if (bodyCode[end] === "\\") end += 2;
        else if (bodyCode[end] === "`") { end++; break; }
        else end++;
      }
      output += bodyCode.slice(i, end);
      i = end;
      continue;
    }

    if (char === "/") {
      const trimmed = output.trimEnd();
      const lastChar = trimmed.slice(-1);
      const isRegex = !lastChar || "(=:[,!&|?;{}~^+*%-".includes(lastChar) || /(?:return|case|delete|throw|typeof)\s*$/.test(trimmed);

      if (isRegex) {
        let end = i + 1;
        let inClass = false;
        while (end < len) {
          if (bodyCode[end] === "\\") end += 2;
          else if (bodyCode[end] === "[" && !inClass) { inClass = true; end++; }
          else if (bodyCode[end] === "]" && inClass) { inClass = false; end++; }
          else if (bodyCode[end] === "/" && !inClass) {
            end++;
            while (end < len && /[gimsuy]/.test(bodyCode[end])) end++;
            break;
          } else end++;
        }
        output += bodyCode.slice(i, end);
        i = end;
        continue;
      }
    }

    if (char === '"' || char === "'") {
      const quote = char;
      const strStart = i;
      let strEnd = i + 1;

      while (strEnd < len) {
        if (bodyCode[strEnd] === "\\") strEnd += 2;
        else if (bodyCode[strEnd] === quote) { strEnd++; break; }
        else if (bodyCode[strEnd] === "\n") break;
        else strEnd++;
      }

      const strLiteral = bodyCode.slice(strStart, strEnd);
      let rawVal = null;
      try {
        rawVal = quote === '"'
          ? JSON.parse(strLiteral)
          : JSON.parse(`"${strLiteral.slice(1, -1).replace(/\\'/g, "'").replace(/"/g, '\\"')}"`);
      } catch {
        rawVal = strLiteral.slice(1, -1);
      }

      const prevTrimmed = output.trimEnd();
      const isImportExport = /(?:from|import)\s*$/.test(prevTrimmed);
      const isDirective = rawVal === "use strict";
      const isWasmFile = rawVal && (rawVal.endsWith(".wasm") || rawVal.includes("zr_wasm"));

      if (isImportExport || isDirective || isWasmFile || !rawVal || rawVal.length === 0) {
        output += strLiteral;
        i = strEnd;
        continue;
      }

      let k = strEnd;
      while (k < len && (bodyCode[k] === " " || bodyCode[k] === "\t" || bodyCode[k] === "\r" || bodyCode[k] === "\n")) k++;
      const isFollowedByColon = (bodyCode[k] === ":" && bodyCode[k + 1] !== ":");
      const lastToken = prevTrimmed.slice(-1);
      const isTernaryOrCondition = lastToken === "?" || /(?:case)\s*$/.test(prevTrimmed);

      if (isFollowedByColon && !isTernaryOrCondition) {
        output += strLiteral;
      } else {
        const idx = getOrAddString(rawVal);
        output += `func_dec(${idx})`;
      }

      i = strEnd;
      continue;
    }

    output += char;
    i++;
  }

  const runtimeHeader = `// @ts-nocheck
const _0x_key = ${XOR_KEY};
const _0x_tbl = ${JSON.stringify(stringTable)};
const _0x_cache = new Map();
const _0x_dec = new TextDecoder();
function func_dec(idx) {
  if (_0x_cache.has(idx)) return _0x_cache.get(idx);
  const raw = atob(_0x_tbl[idx]);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i) ^ (_0x_key ^ (i % 11));
  }
  const out = _0x_dec.decode(bytes);
  _0x_cache.set(idx, out);
  return out;
}
`;
  const importsHeader = importLines.length > 0 ? importLines.join("\n") + "\n" : "";
  const cleanedOutput = output.replace(/\/\/#\s*sourceMappingURL=.*$/gm, "");
  return importsHeader + runtimeHeader + "\n" + cleanedOutput;
}

function main() {
  const targetFile = process.argv[2] || path.join(__dirname, "../dist/index.js");
  if (!fs.existsSync(targetFile)) {
    console.error(`Target file non-existent: ${targetFile}`);
    process.exit(1);
  }

  const code = fs.readFileSync(targetFile, "utf8");
  console.log(`Obfuscating ${targetFile} (${code.length} bytes)...`);
  const obfuscated = obfuscateWorkerCode(code);
  fs.writeFileSync(targetFile, obfuscated, "utf8");

  const mapFile = `${targetFile}.map`;
  if (fs.existsSync(mapFile)) {
    fs.rmSync(mapFile, { force: true });
  }

  console.log(`Obfuscated successfully (${obfuscated.length} bytes).`);
}

main();
