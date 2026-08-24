#!/usr/bin/env python3
"""
Python Fast Reverse Geocoder based on SQLite R*Tree.
"""

import os
import math
import sqlite3

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "geonames.sqlite")


def haversine_distance(lat1, lon1, lat2, lon2):
    to_rad = math.pi / 180.0
    d_lat = (lat2 - lat1) * to_rad
    d_lon = (lon2 - lon1) * to_rad
    a = (math.sin(d_lat / 2.0) ** 2 +
         math.cos(lat1 * to_rad) * math.cos(lat2 * to_rad) * math.sin(d_lon / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return 6371.0 * c  # Earth radius in km


class FastReverseGeocoder:
    def __init__(self, db_path=DB_PATH):
        if not os.path.exists(db_path):
            raise FileNotFoundError(f"Database not found at {db_path}. Please run build_db.py first.")
        self.con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        self.con.row_factory = sqlite3.Row
        self.sql = """
            SELECT 
                c.geoname_id AS geoNameId,
                c.name,
                c.ascii_name AS asciiName,
                c.alternate_names AS alternateNames,
                c.latitude,
                c.longitude,
                c.feature_class AS featureClass,
                c.feature_code AS featureCode,
                c.country_code AS countryCode,
                c.admin1_code AS admin1Code,
                c.admin2_code AS admin2Code,
                c.admin3_code AS admin3Code,
                c.admin4_code AS admin4Code,
                c.population,
                c.elevation,
                c.dem,
                c.timezone,
                c.modification_date AS modificationDate,
                a1.name AS admin1Name,
                a2.name AS admin2Name
            FROM cities_rtree r
            JOIN cities c ON r.id = c.geoname_id
            LEFT JOIN admin1 a1 ON a1.country_code = c.country_code AND a1.admin1_code = c.admin1_code
            LEFT JOIN admin2 a2 ON a2.country_code = c.country_code AND a2.admin1_code = c.admin1_code AND a2.admin2_code = c.admin2_code
            WHERE r.min_lat >= ? AND r.max_lat <= ?
              AND r.min_lon >= ? AND r.max_lon <= ?
            LIMIT 100;
        """

    def look_up(self, lat, lon, max_results=1):
        search_deltas = [0.5, 1.5, 5.0, 20.0, 90.0]
        candidates = []

        cur = self.con.cursor()
        for delta in search_deltas:
            min_lat = max(-90.0, lat - delta)
            max_lat = min(90.0, lat + delta)
            min_lon = max(-180.0, lon - delta)
            max_lon = min(180.0, lon + delta)

            cur.execute(self.sql, (min_lat, max_lat, min_lon, max_lon))
            candidates = cur.fetchall()
            if len(candidates) >= max_results:
                break

        if not candidates:
            return []

        results = []
        for row in candidates:
            dist = haversine_distance(lat, lon, row["latitude"], row["longitude"])
            item = dict(row)
            item["distance"] = round(dist, 3)
            results.append(item)

        results.sort(key=lambda x: x["distance"])
        return results[:max_results]

    def close(self):
        self.con.close()


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 3:
        print("Usage: python3 fast_geocoder.py <latitude> <longitude> [max_results]")
        sys.exit(1)

    lat = float(sys.argv[1])
    lon = float(sys.argv[2])
    max_res = int(sys.argv[3]) if len(sys.argv) > 3 else 1

    geocoder = FastReverseGeocoder()
    res = geocoder.look_up(lat, lon, max_res)
    for r in res:
        print(f"📍 {r['name']} ({r['admin1Name']}, {r['countryCode']}) - Distance: {r['distance']} km - Timezone: {r['timezone']}")
