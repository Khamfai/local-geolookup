import { Database } from 'bun:sqlite';
import { existsSync, unlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { glob } from 'node:fs/promises';

const BASE_DIR = import.meta.dir;
const DB_PATH = join(BASE_DIR, 'geonames.sqlite');

async function findFile(pattern: string): Promise<string | null> {
  const matches: string[] = [];
  for await (const file of glob(pattern, { cwd: BASE_DIR })) {
    matches.push(join(BASE_DIR, file));
  }
  if (matches.length > 0) {
    return matches.sort()[matches.length - 1];
  }
  return null;
}

async function main() {
  const startTime = performance.now();
  console.log('🚀 Starting GeoNames Bun SQLite ETL build...');
  console.log(`   Database target: ${DB_PATH}`);

  if (existsSync(DB_PATH)) {
    unlinkSync(DB_PATH);
  }

  const db = new Database(DB_PATH);

  // Performance settings
  db.run('PRAGMA synchronous = OFF;');
  db.run('PRAGMA journal_mode = MEMORY;');
  db.run('PRAGMA cache_size = -64000;');

  // Tables
  db.run('DROP TABLE IF EXISTS cities_rtree;');
  db.run('DROP TABLE IF EXISTS cities;');
  db.run('DROP TABLE IF EXISTS admin1;');
  db.run('DROP TABLE IF EXISTS admin2;');

  db.run(`
    CREATE TABLE admin1 (
      country_code TEXT,
      admin1_code TEXT,
      name TEXT,
      ascii_name TEXT,
      geoname_id INTEGER,
      PRIMARY KEY (country_code, admin1_code)
    );
  `);

  db.run(`
    CREATE TABLE admin2 (
      country_code TEXT,
      admin1_code TEXT,
      admin2_code TEXT,
      name TEXT,
      ascii_name TEXT,
      geoname_id INTEGER,
      PRIMARY KEY (country_code, admin1_code, admin2_code)
    );
  `);

  db.run(`
    CREATE TABLE cities (
      geoname_id INTEGER PRIMARY KEY,
      name TEXT,
      ascii_name TEXT,
      alternate_names TEXT,
      latitude REAL,
      longitude REAL,
      feature_class TEXT,
      feature_code TEXT,
      country_code TEXT,
      cc2 TEXT,
      admin1_code TEXT,
      admin2_code TEXT,
      admin3_code TEXT,
      admin4_code TEXT,
      population INTEGER,
      elevation INTEGER,
      dem INTEGER,
      timezone TEXT,
      modification_date TEXT
    );
  `);

  db.run(`
    CREATE VIRTUAL TABLE cities_rtree USING rtree(
      id,
      min_lat, max_lat,
      min_lon, max_lon
    );
  `);

  // 1. Import Admin 1
  const admin1File =
    (await findFile('admin1_codes/admin1CodesASCII*.txt')) ||
    (await findFile('admin1CodesASCII*.txt'));
  if (admin1File) {
    console.log(`📦 Importing Admin 1 codes from: ${admin1File}`);
    const content = await Bun.file(admin1File).text();
    const lines = content.split(/\r?\n/);
    const insert = db.prepare(
      'INSERT OR REPLACE INTO admin1 VALUES (?, ?, ?, ?, ?);'
    );
    const insertMany = db.transaction((rows: any[]) => {
      for (const row of rows) insert.run(...row);
    });

    const rows: any[] = [];
    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length >= 4) {
        const codeParts = parts[0].split('.');
        if (codeParts.length === 2) {
          const geonameId = /^\d+$/.test(parts[3]) ? parseInt(parts[3], 10) : null;
          rows.push([codeParts[0], codeParts[1], parts[1], parts[2], geonameId]);
        }
      }
    }
    insertMany(rows);
    console.log(`   ✅ Imported ${rows.length.toLocaleString()} Admin 1 records.`);
  }

  // 2. Import Admin 2
  const admin2File =
    (await findFile('admin2_codes/admin2Codes*.txt')) ||
    (await findFile('admin2Codes*.txt'));
  if (admin2File) {
    console.log(`📦 Importing Admin 2 codes from: ${admin2File}`);
    const content = await Bun.file(admin2File).text();
    const lines = content.split(/\r?\n/);
    const insert = db.prepare(
      'INSERT OR REPLACE INTO admin2 VALUES (?, ?, ?, ?, ?, ?);'
    );
    const insertMany = db.transaction((rows: any[]) => {
      for (const row of rows) insert.run(...row);
    });

    const rows: any[] = [];
    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length >= 4) {
        const codeParts = parts[0].split('.');
        if (codeParts.length === 3) {
          const geonameId = /^\d+$/.test(parts[3]) ? parseInt(parts[3], 10) : null;
          rows.push([
            codeParts[0],
            codeParts[1],
            codeParts[2],
            parts[1],
            parts[2],
            geonameId,
          ]);
        }
      }
    }
    insertMany(rows);
    console.log(`   ✅ Imported ${rows.length.toLocaleString()} Admin 2 records.`);
  }

  // 3. Import Cities
  const citiesFile =
    (await findFile('cities1000/cities1000*.txt')) ||
    (await findFile('cities1000*.txt'));
  if (!citiesFile) {
    console.error('❌ Error: cities1000 file not found!');
    process.exit(1);
  }

  console.log(`📦 Importing Cities from: ${citiesFile}`);
  const content = await Bun.file(citiesFile).text();
  const lines = content.split(/\r?\n/);

  const insertCity = db.prepare(
    'INSERT INTO cities VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);'
  );
  const insertRtree = db.prepare(
    'INSERT INTO cities_rtree VALUES (?,?,?,?,?);'
  );

  const insertCitiesTx = db.transaction((cityRows: any[], rtreeRows: any[]) => {
    for (let i = 0; i < cityRows.length; i++) {
      insertCity.run(...cityRows[i]);
      insertRtree.run(...rtreeRows[i]);
    }
  });

  const cityRows: any[] = [];
  const rtreeRows: any[] = [];
  let count = 0;

  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length >= 19) {
      const geonameId = parseInt(parts[0], 10);
      const lat = parseFloat(parts[4]);
      const lon = parseFloat(parts[5]);
      if (isNaN(geonameId) || isNaN(lat) || isNaN(lon)) continue;

      const pop = /^\d+$/.test(parts[14]) ? parseInt(parts[14], 10) : 0;
      const elev = /^-?\d+$/.test(parts[15]) ? parseInt(parts[15], 10) : null;
      const dem = /^-?\d+$/.test(parts[16]) ? parseInt(parts[16], 10) : null;

      cityRows.push([
        geonameId,
        parts[1],
        parts[2],
        parts[3],
        lat,
        lon,
        parts[6],
        parts[7],
        parts[8],
        parts[9],
        parts[10],
        parts[11],
        parts[12],
        parts[13],
        pop,
        elev,
        dem,
        parts[17],
        parts[18],
      ]);

      rtreeRows.push([geonameId, lat, lat, lon, lon]);
      count++;
    }
  }

  insertCitiesTx(cityRows, rtreeRows);
  console.log(`   ✅ Imported total of ${count.toLocaleString()} cities into SQLite + R*Tree.`);

  // 4. Finalize
  console.log('⚡ Optimizing database & building indices...');
  db.run('CREATE INDEX IF NOT EXISTS idx_cities_country ON cities(country_code);');
  db.run('CREATE INDEX IF NOT EXISTS idx_cities_admin ON cities(country_code, admin1_code, admin2_code);');
  db.run('PRAGMA synchronous = NORMAL;');
  db.run('PRAGMA journal_mode = WAL;');
  db.run('ANALYZE;');

  db.close();

  const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
  const sizeMb = (statSync(DB_PATH).size / (1024 * 1024)).toFixed(2);

  console.log(`\n🎉 Database successfully built in ${elapsed}s!`);
  console.log(`📊 Final SQLite Database Size: ${sizeMb} MB`);
}

main();
