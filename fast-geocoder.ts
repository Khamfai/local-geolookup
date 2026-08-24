import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface GeoPoint {
  latitude?: number | string;
  longitude?: number | string;
  lat?: number | string;
  lon?: number | string;
  lng?: number | string;
}

export interface AdminCode {
  name: string;
  asciiName: string;
  geoNameId: string;
}

export interface GeoResult {
  geoNameId: string;
  name: string;
  asciiName: string;
  alternateNames: string;
  latitude: number;
  longitude: number;
  featureClass: string;
  featureCode: string;
  countryCode: string;
  admin1Code: AdminCode | string;
  admin2Code: AdminCode | string;
  admin3Code: string;
  admin4Code: string;
  population: number;
  elevation: number | null;
  dem: number;
  timezone: string;
  modificationDate: string;
  distance: number;
}

/**
 * Haversine distance in kilometers between two lat/lon coordinates.
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c; // Earth radius in km
}

export class FastReverseGeocoder {
  public dbPath: string;
  private db: Database | null = null;
  private stmt: ReturnType<Database['query']> | null = null;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || resolve(import.meta.dir, 'geonames.sqlite');
    this.init();
  }

  public init(options: { dbPath?: string } = {}): this {
    if (options.dbPath) {
      this.dbPath = resolve(options.dbPath);
    }

    if (!existsSync(this.dbPath)) {
      throw new Error(
        `GeoNames database not found at "${this.dbPath}". Please verify that geonames.sqlite exists.`
      );
    }

    const sql = `
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
    `;

    // Try opening readonly first, fallback to standard mode if readonly fails
    try {
      this.db = new Database(this.dbPath, { readonly: true, create: false });
      this.stmt = this.db.query(sql);
    } catch (err) {
      try {
        this.db = new Database(this.dbPath, { create: false });
        this.stmt = this.db.query(sql);
      } catch (innerErr) {
        throw new Error(
          `Failed to open SQLite database at "${this.dbPath}": ${innerErr}`
        );
      }
    }

    return this;
  }

  /**
   * 🌟 ค้นหาเฉพาะจุดเดียว (Single Point) คืนค่าเป็น GeoResult ตรงๆ ไม่ซ้อน Array
   */
  public lookUpOne(
    point: GeoPoint | [number, number] | number,
    lonOrCb?: number | ((err: Error | null, res: GeoResult | null) => void),
    cb?: (err: Error | null, res: GeoResult | null) => void
  ): GeoResult | null {
    let lat: number = NaN;
    let lon: number = NaN;
    let callback: ((err: Error | null, res: GeoResult | null) => void) | undefined;

    if (typeof point === 'number') {
      lat = point;
      if (typeof lonOrCb === 'number') {
        lon = lonOrCb;
      }
      if (typeof cb === 'function') {
        callback = cb;
      }
    } else if (Array.isArray(point)) {
      lat = typeof point[0] === 'number' ? point[0] : parseFloat(String(point[0]));
      lon = typeof point[1] === 'number' ? point[1] : parseFloat(String(point[1]));
      if (typeof lonOrCb === 'function') {
        callback = lonOrCb;
      }
    } else if (typeof point === 'object' && point !== null) {
      lat = typeof point.latitude === 'number'
        ? point.latitude
        : parseFloat(String(point.latitude ?? point.lat));
      lon = typeof point.longitude === 'number'
        ? point.longitude
        : parseFloat(String(point.longitude ?? point.lon ?? point.lng));
      if (typeof lonOrCb === 'function') {
        callback = lonOrCb;
      }
    }

    if (isNaN(lat) || isNaN(lon)) {
      if (callback) callback(new Error('Invalid latitude or longitude'), null);
      return null;
    }

    const nearest = this._findNearest(lat, lon, 1);
    const result = nearest.length > 0 ? nearest[0] : null;

    if (callback) {
      callback(null, result);
    }
    return result;
  }

  public async lookUpOneAsync(
    point: GeoPoint | [number, number] | number,
    lon?: number
  ): Promise<GeoResult | null> {
    return this.lookUpOne(point, lon);
  }

  /**
   * 🔄 ฟังก์ชันเดิม (รองรับ Batch & API ดั้งเดิม คืนค่าเป็น 2D Array)
   */
  public lookUp(
    points: GeoPoint | GeoPoint[],
    arg2?: number | ((err: Error | null, res: GeoResult[][]) => void),
    arg3?: (err: Error | null, res: GeoResult[][]) => void
  ): GeoResult[][] {
    let callback: ((err: Error | null, res: GeoResult[][]) => void) | undefined;
    let maxResults = 1;

    if (typeof arg2 === 'function') {
      callback = arg2;
      maxResults = 1;
    } else {
      if (typeof arg2 === 'number') maxResults = arg2;
      if (typeof arg3 === 'function') callback = arg3;
    }

    const pointList = Array.isArray(points) ? points : [points];
    const allResults: GeoResult[][] = [];

    for (let i = 0; i < pointList.length; i++) {
      const pt = pointList[i];
      const lat =
        typeof pt.latitude === 'number'
          ? pt.latitude
          : parseFloat(String(pt.latitude ?? pt.lat));
      const lon =
        typeof pt.longitude === 'number'
          ? pt.longitude
          : parseFloat(String(pt.longitude ?? pt.lon ?? pt.lng));

      if (isNaN(lat) || isNaN(lon)) {
        allResults.push([]);
        continue;
      }

      const pointResults = this._findNearest(lat, lon, maxResults);
      allResults.push(pointResults);
    }

    if (callback) {
      callback(null, allResults);
    }
    return allResults;
  }

  public async lookUpAsync(
    points: GeoPoint | GeoPoint[],
    maxResults: number = 1
  ): Promise<GeoResult[][]> {
    return this.lookUp(points, maxResults);
  }

  private _findNearest(lat: number, lon: number, maxResults: number): GeoResult[] {
    if (!this.stmt) throw new Error('Database statement not initialized.');

    const searchDeltas = [0.5, 1.5, 5.0, 20.0, 90.0];
    let candidates: any[] = [];

    for (const delta of searchDeltas) {
      const minLat = Math.max(-90, lat - delta);
      const maxLat = Math.min(90, lat + delta);
      const minLon = Math.max(-180, lon - delta);
      const maxLon = Math.min(180, lon + delta);

      candidates = this.stmt.all(minLat, maxLat, minLon, maxLon);

      if (candidates.length >= maxResults) {
        break;
      }
    }

    if (candidates.length === 0) {
      return [];
    }

    const scored: GeoResult[] = candidates.map((city: any) => {
      const dist = haversineDistance(lat, lon, city.latitude, city.longitude);
      return {
        geoNameId: String(city.geoNameId),
        name: city.name,
        asciiName: city.asciiName,
        alternateNames: city.alternateNames,
        latitude: city.latitude,
        longitude: city.longitude,
        featureClass: city.featureClass,
        featureCode: city.featureCode,
        countryCode: city.countryCode,
        admin1Code: city.admin1Name
          ? { name: city.admin1Name, asciiName: city.admin1Name, geoNameId: '' }
          : city.admin1Code,
        admin2Code: city.admin2Name
          ? { name: city.admin2Name, asciiName: city.admin2Name, geoNameId: '' }
          : city.admin2Code,
        admin3Code: city.admin3Code,
        admin4Code: city.admin4Code,
        population: city.population,
        elevation: city.elevation,
        dem: city.dem,
        timezone: city.timezone,
        modificationDate: city.modificationDate,
        distance: parseFloat(dist.toFixed(3)),
      };
    });

    scored.sort((a, b) => a.distance - b.distance);
    return scored.slice(0, maxResults);
  }

  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

const defaultInstance = new FastReverseGeocoder();
export default defaultInstance;
