#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const DEFAULTS = {
  shingleSize: 5,
  numHashes: 64,
  similarityThreshold: 0.9,
  minContentLines: 100,
};

const args = process.argv.slice(2);

function getArgValue(flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

function hasFlag(flag) {
  return args.includes(flag);
}

function parseNumberList(value) {
  if (!value) return [];
  return value
    .split(",")
    .map(item => item.trim())
    .filter(item => item.length > 0)
    .map(item => Number(item))
    .filter(item => !Number.isNaN(item));
}

function removeFrontmatter(content) {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

function normalizeWhitespace(content) {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractContent(raw) {
  return normalizeWhitespace(removeFrontmatter(raw));
}

function countLines(content) {
  if (content.length === 0) return 0;
  return content.split("\n").length;
}

function createShingles(text, shingleSize) {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(word => word.length > 0);

  const shingles = new Set();
  for (let i = 0; i <= words.length - shingleSize; i++) {
    const shingle = words.slice(i, i + shingleSize).join(" ");
    shingles.add(shingle);
  }

  if (shingles.size === 0 && words.length > 0) {
    shingles.add(words.join(" "));
  }

  return shingles;
}

function fnv1aHash(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function linearHash(x, a, b) {
  const result = (BigInt(a) * BigInt(x) + BigInt(b)) % BigInt(0x100000000);
  return Number(result);
}

function createSeededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) % 0x100000000;
    return state / 0x100000000;
  };
}

function buildHashCoefficients(numHashes, seed) {
  const rng = seed === null ? Math.random : createSeededRandom(seed);
  const coeffs = [];
  for (let i = 0; i < numHashes; i++) {
    coeffs.push({
      a: Math.floor(rng() * 0x100000000),
      b: Math.floor(rng() * 0x100000000),
    });
  }
  return coeffs;
}

function computeMinhash(shingles, numHashes, hashCoefficients) {
  if (shingles.size === 0) {
    return new Array(numHashes).fill(0xffffffff);
  }

  const shingleHashes = Array.from(shingles).map(fnv1aHash);
  const signature = [];

  for (let i = 0; i < numHashes; i++) {
    const { a, b } = hashCoefficients[i];
    let minHash = 0xffffffff;
    for (const h of shingleHashes) {
      const hashValue = linearHash(h, a, b);
      if (hashValue < minHash) {
        minHash = hashValue;
      }
    }
    signature.push(minHash);
  }

  return signature;
}

function estimateSimilarity(sigA, sigB) {
  if (sigA.length !== sigB.length) {
    throw new Error(`Signature length mismatch: ${sigA.length} vs ${sigB.length}`);
  }
  let matches = 0;
  for (let i = 0; i < sigA.length; i++) {
    if (sigA[i] === sigB[i]) {
      matches++;
    }
  }
  return matches / sigA.length;
}


async function sha256Hex(content) {
  const hash = crypto.createHash("sha256");
  hash.update(content, "utf8");
  return hash.digest("hex");
}

async function loadFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const content = extractContent(raw);
  return { raw, content };
}

function formatPercent(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function printUsage() {
  console.log(`Usage:
  node scripts/compare-files.mjs --fileA <path> --fileB <path> [options]

Options:
  --shingleSize <n>            Default: ${DEFAULTS.shingleSize}
  --numHashes <n>              Default: ${DEFAULTS.numHashes}
  --threshold <0-1>            Similarity threshold. Default: ${DEFAULTS.similarityThreshold}
  --minContentLines <n>        Skip if below. Default: ${DEFAULTS.minContentLines}
  --seed <n>                   Deterministic hash coefficients

Grid search:
  --gridShingleSize <list>     e.g. 3,4,5
  --gridNumHashes <list>       e.g. 64,128
  --gridThreshold <list>       e.g. 0.7,0.8,0.9

Example:
  node scripts/compare-files.mjs --fileA "A.md" --fileB "B.md" \
    --gridShingleSize 3,5 --gridThreshold 0.7,0.8,0.9 --seed 42
`);
}

async function compareOnce(fileA, fileB, options) {
  const [dataA, dataB] = await Promise.all([loadFile(fileA), loadFile(fileB)]);

  const lineCountA = countLines(dataA.content);
  const lineCountB = countLines(dataB.content);

  if (lineCountA < options.minContentLines || lineCountB < options.minContentLines) {
    return {
      skipped: true,
      lineCountA,
      lineCountB,
    };
  }

  const shinglesA = createShingles(dataA.content, options.shingleSize);
  const shinglesB = createShingles(dataB.content, options.shingleSize);

  const hashCoefficients = buildHashCoefficients(options.numHashes, options.seed);
  const signatureA = computeMinhash(shinglesA, options.numHashes, hashCoefficients);
  const signatureB = computeMinhash(shinglesB, options.numHashes, hashCoefficients);
  const similarity = estimateSimilarity(signatureA, signatureB);

  const contentHashA = await sha256Hex(dataA.content);
  const contentHashB = await sha256Hex(dataB.content);

  return {
    skipped: false,
    similarity,
    exactMatch: contentHashA === contentHashB,
    lineCountA,
    lineCountB,
  };
}

function buildGrid(values, fallback) {
  return values.length > 0 ? values : [fallback];
}

async function main() {
  const fileA = getArgValue("--fileA");
  const fileB = getArgValue("--fileB");

  if (!fileA || !fileB || hasFlag("--help")) {
    printUsage();
    process.exit(fileA && fileB ? 0 : 1);
  }

  const shingleSize = Number(getArgValue("--shingleSize") ?? DEFAULTS.shingleSize);
  const numHashes = Number(getArgValue("--numHashes") ?? DEFAULTS.numHashes);
  const similarityThreshold = Number(getArgValue("--threshold") ?? DEFAULTS.similarityThreshold);
  const minContentLines = Number(getArgValue("--minContentLines") ?? DEFAULTS.minContentLines);
  const seedValue = getArgValue("--seed");
  const seed = seedValue === null ? null : Number(seedValue);

  const gridShingleSizes = parseNumberList(getArgValue("--gridShingleSize"));
  const gridNumHashes = parseNumberList(getArgValue("--gridNumHashes"));
  const gridThresholds = parseNumberList(getArgValue("--gridThreshold"));

  const shingleSizes = buildGrid(gridShingleSizes, shingleSize);
  const numHashesList = buildGrid(gridNumHashes, numHashes);
  const thresholds = buildGrid(gridThresholds, similarityThreshold);

  const absoluteA = path.resolve(fileA);
  const absoluteB = path.resolve(fileB);

  console.log(`Comparing:\n  ${absoluteA}\n  ${absoluteB}`);

  let printedHeader = false;

  for (const currentShingleSize of shingleSizes) {
    for (const currentNumHashes of numHashesList) {
      const result = await compareOnce(absoluteA, absoluteB, {
        shingleSize: currentShingleSize,
        numHashes: currentNumHashes,
        similarityThreshold: similarityThreshold,
        minContentLines,
        seed,
      });

      if (result.skipped) {
        console.log(`Skipped (minContentLines=${minContentLines}). Lines: ${result.lineCountA}/${result.lineCountB}`);
        continue;
      }

      if (!printedHeader) {
        console.log("\nResults:");
        printedHeader = true;
      }

      for (const threshold of thresholds) {
        const isDuplicate = result.exactMatch || result.similarity >= threshold;
        console.log(
          `- shingleSize=${currentShingleSize} numHashes=${currentNumHashes} threshold=${threshold.toFixed(2)} | ` +
            `similarity=${formatPercent(result.similarity)} exact=${result.exactMatch ? "yes" : "no"} -> ${isDuplicate ? "DUP" : "NO"}`
        );
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
