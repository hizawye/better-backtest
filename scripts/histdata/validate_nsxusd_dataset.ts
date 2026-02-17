import { promises as fs } from "node:fs";
import path from "node:path";

type Manifest = {
  totalBars: number;
  years: Array<{
    year: number;
    bars: number;
    minTimestamp: number;
    maxTimestamp: number;
  }>;
};

type Bar = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const rootDir = process.cwd();
const dataRoot = path.join(rootDir, "data/histdata/nsxusd");
const normalizedDir = path.join(dataRoot, "normalized");
const manifestPath = path.join(dataRoot, "manifest.json");

async function validateYearFile(year: number): Promise<{
  rows: number;
  minTs: number;
  maxTs: number;
}> {
  const allFiles = (await fs.readdir(normalizedDir))
    .filter((file) => file.startsWith(`nsxusd_m1_${year}`) && file.endsWith(".json"))
    .sort();

  if (allFiles.length === 0) {
    throw new Error(`Missing normalized month files for year ${year}`);
  }

  let rows = 0;
  let minTs = Number.POSITIVE_INFINITY;
  let maxTs = Number.NEGATIVE_INFINITY;
  let prevTs = Number.NEGATIVE_INFINITY;

  for (const file of allFiles) {
    const filePath = path.join(normalizedDir, file);
    const bars = JSON.parse(await fs.readFile(filePath, "utf8")) as Bar[];

    for (const row of bars) {
      rows += 1;

      if (typeof row.timestamp !== "number") {
        throw new Error(`Invalid timestamp type in year ${year}`);
      }
      if (row.timestamp < prevTs) {
        throw new Error(`Out-of-order timestamp in year ${year}: ${row.timestamp} < ${prevTs}`);
      }

      prevTs = row.timestamp;
      minTs = Math.min(minTs, row.timestamp);
      maxTs = Math.max(maxTs, row.timestamp);
    }
  }

  return {
    rows,
    minTs: Number.isFinite(minTs) ? minTs : 0,
    maxTs: Number.isFinite(maxTs) ? maxTs : 0,
  };
}

async function main(): Promise<void> {
  const manifestRaw = await fs.readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestRaw) as Manifest;

  let totalRows = 0;

  for (const yearEntry of manifest.years) {
    const actual = await validateYearFile(yearEntry.year);
    totalRows += actual.rows;

    if (actual.rows !== yearEntry.bars) {
      throw new Error(
        `Bar count mismatch for ${yearEntry.year}: manifest=${yearEntry.bars} actual=${actual.rows}`,
      );
    }
    if (actual.minTs !== yearEntry.minTimestamp) {
      throw new Error(
        `Min timestamp mismatch for ${yearEntry.year}: manifest=${yearEntry.minTimestamp} actual=${actual.minTs}`,
      );
    }
    if (actual.maxTs !== yearEntry.maxTimestamp) {
      throw new Error(
        `Max timestamp mismatch for ${yearEntry.year}: manifest=${yearEntry.maxTimestamp} actual=${actual.maxTs}`,
      );
    }
  }

  if (totalRows !== manifest.totalBars) {
    throw new Error(
      `Total bars mismatch: manifest=${manifest.totalBars} actual=${totalRows}`,
    );
  }

  console.log(`Dataset validation passed: ${totalRows} rows across ${manifest.years.length} years.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
