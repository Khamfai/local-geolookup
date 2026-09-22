import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { haversineDistance } from './haversine.js';
import { openReadOnly, type ReadOnlyDatabase, type ReadOnlyStatement } from './sqlite.js';
import type { AdminCode, GeoPoint, GeoResult, LookUpCallback, LookUpOneCallback } from './types.js';

export type PointInput = GeoPoint | [number | string, number | string] | number;

export interface Coordinates {
  lat: number;
  lon: number;
}

function toNumber(value: number | string | undefined): number {
  if (typeof value === 'number') return value;
  if (value === undefined) return NaN;
  return parseFloat(String(value));
}

/**
 * Normalizes every accepted input form to { lat, lon }, or null when either
 * value is missing or not numeric.
 */
export function parsePoint(point: PointInput | null | undefined, lon?: number): Coordinates | null {
  let lat = NaN;
  let lng = NaN;

  if (typeof point === 'number') {
    lat = point;
    lng = typeof lon === 'number' ? lon : NaN;
  } else if (Array.isArray(point)) {
    lat = toNumber(point[0]);
    lng = toNumber(point[1]);
  } else if (typeof point === 'object' && point !== null) {
    lat = toNumber(point.latitude ?? point.lat);
    lng = toNumber(point.longitude ?? point.lon ?? point.lng);
  }

  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lon: lng };
}

export type InitCallback = (err: Error | null, instance?: FastReverseGeocoder) => void;

export interface InitOptions {
  dbPath?: string;
}

const DEFAULT_DB_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'geonames.sqlite');
const SEARCH_DELTAS_DEG = [0.5, 1.5, 5.0, 20.0, 90.0] as const;
const CANDIDATE_LIMIT = 100;

const NEAREST_SQL = `
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
  LIMIT ${CANDIDATE_LIMIT};
`;

interface CityRow {
  geoNameId: number | string;
  name: string;
  asciiName: string;
  alternateNames: string;
  latitude: number;
  longitude: number;
  featureClass: string;
  featureCode: string;
  countryCode: string;
  admin1Code: string;
  admin2Code: string;
  admin3Code: string;
  admin4Code: string;
  population: number;
  elevation: number | null;
  dem: number;
  timezone: string;
  modificationDate: string;
  admin1Name: string | null;
  admin2Name: string | null;
}

function toAdminCode(name: string | null, code: string): AdminCode | string {
  return name ? { name, asciiName: name, geoNameId: '' } : code;
}

function toGeoResult(row: CityRow, lat: number, lon: number): GeoResult {
  const distance = haversineDistance(lat, lon, row.latitude, row.longitude);
  return {
    geoNameId: String(row.geoNameId),
    name: row.name,
    asciiName: row.asciiName,
    alternateNames: row.alternateNames,
    latitude: row.latitude,
    longitude: row.longitude,
    featureClass: row.featureClass,
    featureCode: row.featureCode,
    countryCode: row.countryCode,
    admin1Code: toAdminCode(row.admin1Name, row.admin1Code),
    admin2Code: toAdminCode(row.admin2Name, row.admin2Code),
    admin3Code: row.admin3Code,
    admin4Code: row.admin4Code,
    population: row.population,
    elevation: row.elevation,
    dem: row.dem,
    timezone: row.timezone,
    modificationDate: row.modificationDate,
    distance: parseFloat(distance.toFixed(3)),
  };
}

export class FastReverseGeocoder {
  public dbPath: string;
  private db: ReadOnlyDatabase | null = null;
  private stmt: ReadOnlyStatement | null = null;

  constructor(dbPath?: string) {
    this.dbPath = dbPath ? resolve(dbPath) : DEFAULT_DB_PATH;
    this.init();
  }

  /**
   * Opens (or re-opens) the database. Accepts init(cb), init(options), or
   * init(options, cb). Without a callback, errors are thrown.
   */
  public init(optionsOrCallback: InitOptions | InitCallback = {}, callback?: InitCallback): this {
    const options = typeof optionsOrCallback === 'function' ? {} : optionsOrCallback;
    const done = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;

    const nextPath = options.dbPath ? resolve(options.dbPath) : this.dbPath;

    try {
      const nextDb = openReadOnly(nextPath);
      const nextStmt = nextDb.prepare(NEAREST_SQL);
      this.close();
      this.db = nextDb;
      this.stmt = nextStmt;
      this.dbPath = nextPath;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (done) {
        done(error);
        return this;
      }
      throw error;
    }

    if (done) done(null, this);
    return this;
  }

  public lookUpOne(
    point: PointInput,
    lonOrCallback?: number | LookUpOneCallback,
    callback?: LookUpOneCallback
  ): GeoResult | null {
    const lon = typeof lonOrCallback === 'number' ? lonOrCallback : undefined;
    const done = typeof lonOrCallback === 'function' ? lonOrCallback : callback;

    const coords = parsePoint(point, lon);
    if (!coords) {
      if (done) done(new Error('Invalid latitude or longitude'), null);
      return null;
    }

    const nearest = this.findNearest(coords.lat, coords.lon, 1);
    const result = nearest.length > 0 ? nearest[0] : null;
    if (done) done(null, result);
    return result;
  }

  public async lookUpOneAsync(point: PointInput, lon?: number): Promise<GeoResult | null> {
    return this.lookUpOne(point, lon);
  }

  /**
   * Batch lookup. Returns results[pointIndex][rank]; an invalid point yields [].
   */
  public lookUp(
    points: PointInput | PointInput[],
    maxResultsOrCallback?: number | LookUpCallback,
    callback?: LookUpCallback
  ): GeoResult[][] {
    const maxResults = typeof maxResultsOrCallback === 'number' ? maxResultsOrCallback : 1;
    const done = typeof maxResultsOrCallback === 'function' ? maxResultsOrCallback : callback;

    // A bare PointInput tuple is itself an array, so Array.isArray cannot distinguish
    // "one tuple point" from "a batch of points" by type alone; batch-vs-single is a
    // runtime convention here (as in the pre-restructure implementation), not something
    // the type system can prove, hence the assertion.
    const pointList = (Array.isArray(points) ? points : [points]) as PointInput[];
    const allResults = pointList.map((pt) => {
      const coords = parsePoint(pt);
      return coords ? this.findNearest(coords.lat, coords.lon, maxResults) : [];
    });

    if (done) done(null, allResults);
    return allResults;
  }

  public async lookUpAsync(points: PointInput | PointInput[], maxResults = 1): Promise<GeoResult[][]> {
    return this.lookUp(points, maxResults);
  }

  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.stmt = null;
    }
  }

  private findNearest(lat: number, lon: number, maxResults: number): GeoResult[] {
    if (!this.stmt) throw new Error('Database statement not initialized.');

    let candidates: CityRow[] = [];
    for (const delta of SEARCH_DELTAS_DEG) {
      candidates = this.stmt.all(
        Math.max(-90, lat - delta),
        Math.min(90, lat + delta),
        Math.max(-180, lon - delta),
        Math.min(180, lon + delta)
      ) as unknown as CityRow[];
      if (candidates.length >= maxResults) break;
    }

    return candidates
      .map((row) => toGeoResult(row, lat, lon))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, maxResults);
  }
}
