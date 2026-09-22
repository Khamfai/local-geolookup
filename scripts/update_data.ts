#!/usr/bin/env bun
/**
 * Downloads the latest GeoNames dumps into the folders build_db.ts expects,
 * then rebuilds geonames.sqlite.
 *
 * Usage:
 *   bun run update:data                         # download + rebuild
 *   bun run scripts/update_data.ts --download-only
 */
import { $ } from 'bun';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DATA_DIR = resolve(import.meta.dir, '..', 'data');
const GEONAMES_DUMP_URL = 'https://download.geonames.org/export/dump';
/** download.geonames.org often throttles to tens of KB/s; allow a slow but finite transfer. */
const DOWNLOAD_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5000;

interface DumpSource {
  /** Remote file name under GEONAMES_DUMP_URL. */
  file: string;
  /** Local folder relative to the repo root; must match build_db.ts findFile() patterns. */
  dir: string;
  /** Whether the remote file is a zip archive to extract in place. */
  isZip: boolean;
}

const DUMP_SOURCES: readonly DumpSource[] = [
  { file: 'cities1000.zip', dir: 'cities1000', isZip: true },
  { file: 'admin1CodesASCII.txt', dir: 'admin1_codes', isZip: false },
  { file: 'admin2Codes.txt', dir: 'admin2_codes', isZip: false },
];

async function fetchWithRetry(url: string, targetPath: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      // Buffer fully before writing. Passing the Response straight to Bun.write
      // let the process exit with code 0 mid-transfer on a slow connection.
      const body = await res.arrayBuffer();
      await Bun.write(targetPath, body);
      return;
    } catch (err) {
      lastError = err;
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`   ⚠️  Attempt ${attempt}/${MAX_ATTEMPTS} failed: ${reason}`);
      if (attempt < MAX_ATTEMPTS) await Bun.sleep(RETRY_DELAY_MS);
    }
  }
  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Download failed for ${url} after ${MAX_ATTEMPTS} attempts: ${reason}`);
}

async function download(source: DumpSource): Promise<string> {
  const targetDir = resolve(DATA_DIR, source.dir);
  if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });

  const url = `${GEONAMES_DUMP_URL}/${source.file}`;
  const targetPath = join(targetDir, source.file);

  console.log(`⬇️  ${url}`);
  await fetchWithRetry(url, targetPath);

  const sizeMb = (statSync(targetPath).size / (1024 * 1024)).toFixed(2);
  console.log(`   ✅ Saved ${source.dir}/${source.file} (${sizeMb} MB)`);

  if (source.isZip) {
    await $`unzip -o -q ${targetPath} -d ${targetDir}`;
    console.log(`   📂 Extracted into ${source.dir}/`);
  }
  return targetPath;
}

async function main(): Promise<void> {
  const isDownloadOnly = process.argv.includes('--download-only');
  const startTime = performance.now();

  console.log('🌍 Updating GeoNames source data...\n');
  for (const source of DUMP_SOURCES) {
    await download(source);
  }

  const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ Downloads finished in ${elapsed}s.`);

  if (isDownloadOnly) {
    console.log('ℹ️  --download-only set; skipping database rebuild.');
    return;
  }

  console.log('\n🔨 Rebuilding geonames.sqlite...\n');
  await $`bun run ${resolve(import.meta.dir, 'build_db.ts')}`;
}

main().catch((err: unknown) => {
  console.error(`❌ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
