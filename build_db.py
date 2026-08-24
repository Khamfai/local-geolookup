#!/usr/bin/env python3
"""
GeoNames to SQLite ETL Converter with R*Tree Spatial Index.
Converts cities1000, admin1CodesASCII, and admin2Codes to a high-performance SQLite database.
"""

import os
import glob
import sqlite3
import time
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "geonames.sqlite")


def find_file(pattern):
    matches = glob.glob(os.path.join(BASE_DIR, pattern))
    if not matches:
        # Check subdirectories
        matches = glob.glob(os.path.join(BASE_DIR, "**", pattern), recursive=True)
    if matches:
        # Return newest if multiple
        return sorted(matches)[-1]
    return None


def init_db(con):
    cur = con.cursor()
    
    # Enable performance settings
    cur.execute("PRAGMA synchronous = OFF;")
    cur.execute("PRAGMA journal_mode = MEMORY;")
    cur.execute("PRAGMA cache_size = -64000;")  # 64MB cache

    # Drop existing tables
    cur.execute("DROP TABLE IF EXISTS cities_rtree;")
    cur.execute("DROP TABLE IF EXISTS cities;")
    cur.execute("DROP TABLE IF EXISTS admin1;")
    cur.execute("DROP TABLE IF EXISTS admin2;")

    # Admin 1: Provinces / States
    cur.execute("""
        CREATE TABLE admin1 (
            country_code TEXT,
            admin1_code TEXT,
            name TEXT,
            ascii_name TEXT,
            geoname_id INTEGER,
            PRIMARY KEY (country_code, admin1_code)
        );
    """)

    # Admin 2: Districts / Counties
    cur.execute("""
        CREATE TABLE admin2 (
            country_code TEXT,
            admin1_code TEXT,
            admin2_code TEXT,
            name TEXT,
            ascii_name TEXT,
            geoname_id INTEGER,
            PRIMARY KEY (country_code, admin1_code, admin2_code)
        );
    """)

    # Cities Table
    cur.execute("""
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
    """)

    # R*Tree Spatial Index for Cities
    cur.execute("""
        CREATE VIRTUAL TABLE cities_rtree USING rtree(
            id,
            min_lat, max_lat,
            min_lon, max_lon
        );
    """)

    con.commit()


def import_admin1(con):
    file_path = find_file("admin1_codes/admin1CodesASCII*.txt") or find_file("admin1CodesASCII*.txt")
    if not file_path:
        print("⚠️ Warning: admin1CodesASCII file not found, skipping...")
        return

    print(f"📦 Importing Admin 1 codes from: {os.path.basename(file_path)}")
    cur = con.cursor()
    records = []

    with open(file_path, "r", encoding="utf-8") as f:
        for line in f:
            parts = line.rstrip("\r\n").split("\t")
            if len(parts) >= 4:
                code_parts = parts[0].split(".")
                if len(code_parts) == 2:
                    country_code, admin1_code = code_parts
                    name = parts[1]
                    ascii_name = parts[2]
                    geoname_id = int(parts[3]) if parts[3].isdigit() else None
                    records.append((country_code, admin1_code, name, ascii_name, geoname_id))

    cur.executemany("""
        INSERT OR REPLACE INTO admin1 (country_code, admin1_code, name, ascii_name, geoname_id)
        VALUES (?, ?, ?, ?, ?);
    """, records)
    con.commit()
    print(f"   ✅ Imported {len(records):,} Admin 1 records.")


def import_admin2(con):
    file_path = find_file("admin2_codes/admin2Codes*.txt") or find_file("admin2Codes*.txt")
    if not file_path:
        print("⚠️ Warning: admin2Codes file not found, skipping...")
        return

    print(f"📦 Importing Admin 2 codes from: {os.path.basename(file_path)}")
    cur = con.cursor()
    records = []

    with open(file_path, "r", encoding="utf-8") as f:
        for line in f:
            parts = line.rstrip("\r\n").split("\t")
            if len(parts) >= 4:
                code_parts = parts[0].split(".")
                if len(code_parts) == 3:
                    country_code, admin1_code, admin2_code = code_parts
                    name = parts[1]
                    ascii_name = parts[2]
                    geoname_id = int(parts[3]) if parts[3].isdigit() else None
                    records.append((country_code, admin1_code, admin2_code, name, ascii_name, geoname_id))

    cur.executemany("""
        INSERT OR REPLACE INTO admin2 (country_code, admin1_code, admin2_code, name, ascii_name, geoname_id)
        VALUES (?, ?, ?, ?, ?, ?);
    """, records)
    con.commit()
    print(f"   ✅ Imported {len(records):,} Admin 2 records.")


def import_cities(con):
    file_path = find_file("cities1000/cities1000*.txt") or find_file("cities1000*.txt")
    if not file_path:
        print("❌ Error: cities1000 file not found!")
        sys.exit(1)

    print(f"📦 Importing Cities from: {os.path.basename(file_path)}")
    cur = con.cursor()
    
    city_records = []
    rtree_records = []
    count = 0

    with open(file_path, "r", encoding="utf-8") as f:
        for line in f:
            parts = line.rstrip("\r\n").split("\t")
            if len(parts) >= 19:
                try:
                    geoname_id = int(parts[0])
                    name = parts[1]
                    ascii_name = parts[2]
                    alternate_names = parts[3]
                    lat = float(parts[4])
                    lon = float(parts[5])
                    feature_class = parts[6]
                    feature_code = parts[7]
                    country_code = parts[8]
                    cc2 = parts[9]
                    admin1_code = parts[10]
                    admin2_code = parts[11]
                    admin3_code = parts[12]
                    admin4_code = parts[13]
                    pop = int(parts[14]) if parts[14].isdigit() else 0
                    elev = int(parts[15]) if parts[15].lstrip("-").isdigit() else None
                    dem = int(parts[16]) if parts[16].lstrip("-").isdigit() else None
                    timezone = parts[17]
                    mod_date = parts[18]

                    city_records.append((
                        geoname_id, name, ascii_name, alternate_names,
                        lat, lon, feature_class, feature_code,
                        country_code, cc2, admin1_code, admin2_code,
                        admin3_code, admin4_code, pop, elev, dem,
                        timezone, mod_date
                    ))

                    # RTree entry: (id, min_lat, max_lat, min_lon, max_lon)
                    rtree_records.append((geoname_id, lat, lat, lon, lon))
                    count += 1

                    if len(city_records) >= 20000:
                        cur.executemany("""
                            INSERT INTO cities VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);
                        """, city_records)
                        cur.executemany("""
                            INSERT INTO cities_rtree VALUES (?,?,?,?,?);
                        """, rtree_records)
                        city_records.clear()
                        rtree_records.clear()
                        print(f"   ... loaded {count:,} cities", end="\r")

                except (ValueError, IndexError):
                    continue

    if city_records:
        cur.executemany("""
            INSERT INTO cities VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);
        """, city_records)
        cur.executemany("""
            INSERT INTO cities_rtree VALUES (?,?,?,?,?);
        """, rtree_records)

    con.commit()
    print(f"   ✅ Imported total of {count:,} cities into SQLite + R*Tree.")


def finalize_db(con):
    print("⚡ Optimizing database & building indices...")
    cur = con.cursor()
    
    # Indexes on cities
    cur.execute("CREATE INDEX IF NOT EXISTS idx_cities_country ON cities(country_code);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_cities_admin ON cities(country_code, admin1_code, admin2_code);")
    
    con.commit()
    
    # Re-enable normal pragma
    cur.execute("PRAGMA synchronous = NORMAL;")
    cur.execute("PRAGMA journal_mode = WAL;")
    cur.execute("ANALYZE;")
    con.commit()


def main():
    start_time = time.time()
    print(f"🚀 Starting GeoNames SQLite ETL build...")
    print(f"   Database target: {DB_PATH}")

    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)

    con = sqlite3.connect(DB_PATH)
    try:
        init_db(con)
        import_admin1(con)
        import_admin2(con)
        import_cities(con)
        finalize_db(con)
    finally:
        con.close()

    db_size_mb = os.path.getsize(DB_PATH) / (1024 * 1024)
    elapsed = time.time() - start_time
    print(f"\n🎉 Database successfully built in {elapsed:.2f}s!")
    print(f"📊 Final SQLite Database Size: {db_size_mb:.2f} MB")


if __name__ == "__main__":
    main()
