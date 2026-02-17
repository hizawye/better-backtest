import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { spawnSync } from "node:child_process";

type Bar = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type SourceInfo = {
  file: string;
  sha256: string;
  sizeBytes: number;
  rows: number;
};

type YearManifest = {
  year: number;
  sourceFiles: string[];
  normalizedMonths: string[];
  bars: number;
  minTimestamp: number;
  maxTimestamp: number;
};

const rootDir = process.cwd();
const dataRoot = path.join(rootDir, "data/histdata/nsxusd");
const rawZipsDir = path.join(dataRoot, "raw-zips");
const rawCsvDir = path.join(dataRoot, "raw-csv");
const normalizedDir = path.join(dataRoot, "normalized");
const manifestPath = path.join(dataRoot, "manifest.json");

function toEpochMs(datetime: string): number {
  const [datePart, timePart] = datetime.trim().split(" ");
  const year = Number(datePart.slice(0, 4));
  const month = Number(datePart.slice(4, 6));
  const day = Number(datePart.slice(6, 8));
  const hour = Number(timePart.slice(0, 2));
  const minute = Number(timePart.slice(2, 4));
  const second = Number(timePart.slice(4, 6));
  return Date.UTC(year, month - 1, day, hour, minute, second);
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function countCsvRows(filePath: string): Promise<number> {
  let rows = 0;
  const reader = readline.createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity,
  });

  for await (const line of reader) {
    if (line.trim()) {
      rows += 1;
    }
  }
  return rows;
}

function parseCsvFileYear(fileName: string): { year: number; period: number } | null {
  const match = fileName.match(/DAT_ASCII_NSXUSD_M1_(\d{4})(\d{2})?\.csv$/i);
  if (!match) return null;

  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : 0;
  return {
    year,
    period: Number(`${year}${month.toString().padStart(2, "0")}`),
  };
}

async function ensureDirs(): Promise<void> {
  await fs.mkdir(rawCsvDir, { recursive: true });
  await fs.mkdir(normalizedDir, { recursive: true });

  const existingNormalized = await fs.readdir(normalizedDir);
  for (const file of existingNormalized) {
    if (file.startsWith("nsxusd_m1_") && (file.endsWith(".json") || file.endsWith(".jsonl"))) {
      await fs.unlink(path.join(normalizedDir, file));
    }
  }
}

async function extractAllZips(): Promise<SourceInfo[]> {
  const zipFiles = (await fs.readdir(rawZipsDir))
    .filter((name) => name.toLowerCase().endsWith(".zip"))
    .sort();

  const sources: SourceInfo[] = [];

  for (const file of zipFiles) {
    const zipPath = path.join(rawZipsDir, file);
    const result = spawnSync("unzip", ["-o", zipPath, "-d", rawCsvDir], {
      stdio: "inherit",
    });

    if (result.status !== 0) {
      throw new Error(`Failed to extract ${file}`);
    }

    const stat = await fs.stat(zipPath);
    sources.push({
      file: `raw-zips/${file}`,
      sha256: await sha256File(zipPath),
      sizeBytes: stat.size,
      rows: 0,
    });
  }

  return sources;
}

async function buildNormalizedFiles(): Promise<{
  years: YearManifest[];
  csvSources: SourceInfo[];
}> {
  const csvFiles = (await fs.readdir(rawCsvDir))
    .filter((name) => name.toLowerCase().endsWith(".csv"))
    .sort();

  const grouped = new Map<number, Array<{ file: string; period: number }>>();
  for (const file of csvFiles) {
    const parsed = parseCsvFileYear(file);
    if (!parsed) continue;
    const list = grouped.get(parsed.year) ?? [];
    list.push({ file, period: parsed.period });
    grouped.set(parsed.year, list);
  }

  const years: YearManifest[] = [];
  const csvSources: SourceInfo[] = [];

  for (const [year, files] of [...grouped.entries()].sort((a, b) => a[0] - b[0])) {
    files.sort((a, b) => a.period - b.period);

    const yearBars = new Map<number, Bar>();
    let replaced = 0;

    for (const { file } of files) {
      const csvPath = path.join(rawCsvDir, file);
      const rows = await countCsvRows(csvPath);
      const stat = await fs.stat(csvPath);

      csvSources.push({
        file: `raw-csv/${file}`,
        sha256: await sha256File(csvPath),
        sizeBytes: stat.size,
        rows,
      });

      const reader = readline.createInterface({
        input: createReadStream(csvPath),
        crlfDelay: Infinity,
      });

      for await (const line of reader) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const fields = trimmed.split(";");
        if (fields.length < 6) continue;

        const timestamp = toEpochMs(fields[0]);
        const row: Bar = {
          timestamp,
          open: Number(fields[1]),
          high: Number(fields[2]),
          low: Number(fields[3]),
          close: Number(fields[4]),
          volume: Number(fields[5]),
        };

        if (yearBars.has(timestamp)) replaced += 1;
        yearBars.set(timestamp, row);
      }
    }

    const sortedTimestamps = [...yearBars.keys()].sort((a, b) => a - b);
    const monthBuckets = new Map<string, Bar[]>();
    for (const ts of sortedTimestamps) {
      const row = yearBars.get(ts)!;
      const dt = new Date(row.timestamp);
      const monthKey = `${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
      const bucket = monthBuckets.get(monthKey) ?? [];
      bucket.push(row);
      monthBuckets.set(monthKey, bucket);
    }

    const normalizedMonths: string[] = [];
    for (const [monthKey, bars] of [...monthBuckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const outFile = `nsxusd_m1_${monthKey}.json`;
      const outputPath = path.join(normalizedDir, outFile);
      await fs.writeFile(outputPath, `${JSON.stringify(bars)}\n`, "utf8");
      normalizedMonths.push(`normalized/${outFile}`);
    }

    years.push({
      year,
      sourceFiles: files.map((f) => `raw-csv/${f.file}`),
      normalizedMonths,
      bars: sortedTimestamps.length,
      minTimestamp: sortedTimestamps[0] ?? 0,
      maxTimestamp: sortedTimestamps[sortedTimestamps.length - 1] ?? 0,
    });

    console.log(
      `Built year ${year}: ${sortedTimestamps.length} bars (${replaced} replacements)`,
    );
  }

  return { years, csvSources };
}

async function main(): Promise<void> {
  await ensureDirs();

  const zipSources = await extractAllZips();
  const { years, csvSources } = await buildNormalizedFiles();

  const totalBars = years.reduce((acc, year) => acc + year.bars, 0);

  const manifest = {
    generatedAt: new Date().toISOString(),
    instrument: "NSXUSD",
    alias: "NAS100",
    timeframe: "M1",
    timezoneMode: "raw_source_wall_clock_no_dst_adjustment",
    totalBars,
    years,
    sources: {
      zipFiles: zipSources,
      csvFiles: csvSources,
    },
  };

  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Manifest written to ${manifestPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
