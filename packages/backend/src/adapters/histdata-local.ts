import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Bar } from "../../../shared/types";

const SUPPORTED = new Set(["NAS100", "NSXUSD"]);
const cache = new Map<number, Bar[]>();
const MAX_CACHE_MONTHS = 24;

function getDataDir(): string {
  const configured = process.env.HISTDATA_NSXUSD_DIR;
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
  }

  const candidates = [
    path.resolve(process.cwd(), "data/histdata/nsxusd/normalized"),
    path.resolve(process.cwd(), "../../data/histdata/nsxusd/normalized"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

function normalizePair(pair: string): string {
  return pair === "NSXUSD" ? "NAS100" : pair;
}

function touchMonth(monthKey: number, bars: Bar[]): void {
  if (cache.has(monthKey)) {
    cache.delete(monthKey);
  }
  cache.set(monthKey, bars);

  while (cache.size > MAX_CACHE_MONTHS) {
    const oldestMonth = cache.keys().next().value as number | undefined;
    if (oldestMonth === undefined) {
      break;
    }
    cache.delete(oldestMonth);
  }
}

async function loadMonthBars(monthKey: number): Promise<Bar[]> {
  if (cache.has(monthKey)) {
    const cached = cache.get(monthKey)!;
    touchMonth(monthKey, cached);
    return cached;
  }

  const filePath = path.join(getDataDir(), `nsxusd_m1_${monthKey}.json`);
  try {
    await fs.access(filePath);
  } catch {
    return [];
  }

  const bars = JSON.parse(await fs.readFile(filePath, "utf8")) as Bar[];

  touchMonth(monthKey, bars);
  return bars;
}

function monthKey(year: number, month: number): number {
  return Number(`${year}${String(month).padStart(2, "0")}`);
}

function getMonthKeys(from: number, to: number): number[] {
  const start = new Date(from);
  const end = new Date(to);

  let year = start.getUTCFullYear();
  let month = start.getUTCMonth() + 1;
  const endYear = end.getUTCFullYear();
  const endMonth = end.getUTCMonth() + 1;

  const keys: number[] = [];
  while (year < endYear || (year === endYear && month <= endMonth)) {
    keys.push(monthKey(year, month));
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return keys;
}

export async function fetchBars(pair: string, from: number, to: number): Promise<Bar[]> {
  const normalized = normalizePair(pair);
  if (!SUPPORTED.has(pair) && normalized !== "NAS100") {
    return [];
  }

  const results: Bar[] = [];
  const months = getMonthKeys(from, to);
  for (const month of months) {
    const monthBars = await loadMonthBars(month);
    for (const bar of monthBars) {
      if (bar.timestamp >= from && bar.timestamp <= to) {
        results.push(bar);
      }
    }
  }

  return results;
}
