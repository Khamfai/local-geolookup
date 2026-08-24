import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Haversine distance in kilometers between two lat/lon coordinates.
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
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
  /**
   * @param {string} [dbPath] Path to the geonames.sqlite database file.
   */
  constructor(dbPath) {
    this.dbPath = dbPath || path.join(__dirname, 'geonames.sqlite');
    this.db = null;
    this._queryRunner = null;
    this.init();
  }

  /**
   * Initializes the SQLite connection with Bun or Node.js.
   */
  init(options = {}, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    if (options.dbPath) {
      this.dbPath = options.dbPath;
    }

    if (!fs.existsSync(this.dbPath)) {
      const err = new Error(`GeoNames database not found at ${this.dbPath}. Please run 'bun run build:db' first.`);
      if (callback) return callback(err);
      throw err;
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

    // 1. Check for Bun runtime
    if (typeof Bun !== 'undefined') {
      const { Database } = require('bun:sqlite');
      this.db = new Database(this.dbPath, { readonly: true });
      const stmt = this.db.query(sql);
      this._queryRunner = (minLat, maxLat, minLon, maxLon) => stmt.all(minLat, maxLat, minLon, maxLon);
    } else {
      // 2. Node.js built-in node:sqlite
      try {
        const { DatabaseSync } = require('node:sqlite');
        this.db = new DatabaseSync(this.dbPath, { readOnly: true });
        const stmt = this.db.prepare(sql);
        this._queryRunner = (minLat, maxLat, minLon, maxLon) => stmt.all(minLat, maxLat, minLon, maxLon);
      } catch (e) {
        const err = new Error('SQLite driver not available.');
        if (callback) return callback(err);
        throw err;
      }
    }

    if (callback) {
      return callback(null, this);
    }
    return this;
  }

  /**
   * 🌟 ค้นหาเฉพาะจุดเดียว (Single Point) คืนค่าเป็น GeoResult Object ตรงๆ ไม่ซ้อน Array
   * 
   * รองรับ:
   * - lookUpOne({ latitude: 13.75, longitude: 100.50 })
   * - lookUpOne({ lat: 13.75, lon: 100.50 })
   * - lookUpOne(13.75, 100.50)
   * - lookUpOne([13.75, 100.50])
   * 
   * @param {Object|Array|number} point พิกัด
   * @param {number|Function} [lonOrCb] ลองจิจูด หรือ callback
   * @param {Function} [cb] callback function
   * @returns {Object|null} ผลลัพธ์ข้อมูลเมือง หรือ null
   */
  lookUpOne(point, lonOrCb, cb) {
    let lat = NaN;
    let lon = NaN;
    let callback;

    if (typeof point === 'number') {
      lat = point;
      if (typeof lonOrCb === 'number') {
        lon = lonOrCb;
      }
      if (typeof cb === 'function') {
        callback = cb;
      }
    } else if (Array.isArray(point)) {
      lat = typeof point[0] === 'number' ? point[0] : parseFloat(point[0]);
      lon = typeof point[1] === 'number' ? point[1] : parseFloat(point[1]);
      if (typeof lonOrCb === 'function') {
        callback = lonOrCb;
      }
    } else if (typeof point === 'object' && point !== null) {
      lat = typeof point.latitude === 'number'
        ? point.latitude
        : parseFloat(point.latitude ?? point.lat);
      lon = typeof point.longitude === 'number'
        ? point.longitude
        : parseFloat(point.longitude ?? point.lon ?? point.lng);
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

  /**
   * Async wrapper สำหรับ lookUpOne
   */
  async lookUpOneAsync(point, lon) {
    return this.lookUpOne(point, lon);
  }

  /**
   * 🔄 ฟังก์ชันเดิม (รองรับ Batch & คืนค่าเป็น 2D Array สไตล์ local-reverse-geocoder ดั้งเดิม)
   *
   * @param {Object|Object[]} points พิกัดจุดเดียว หรือ Array ของพิกัด
   * @param {number|Function} [arg2=1] จำนวนผลลัพธ์ (maxResults) หรือ callback
   * @param {Function} [arg3] callback function
   * @returns {Object[][]}
   */
  lookUp(points, arg2, arg3) {
    let callback;
    let maxResults = 1;

    if (typeof arg2 === 'function') {
      callback = arg2;
      maxResults = 1;
    } else {
      if (typeof arg2 === 'number') maxResults = arg2;
      if (typeof arg3 === 'function') callback = arg3;
    }

    const pointList = Array.isArray(points) ? points : [points];
    const allResults = [];

    for (let i = 0; i < pointList.length; i++) {
      const pt = pointList[i];
      const lat = typeof pt.latitude === 'number' ? pt.latitude : parseFloat(pt.latitude || pt.lat);
      const lon = typeof pt.longitude === 'number' ? pt.longitude : parseFloat(pt.longitude || pt.lon || pt.lng);

      if (isNaN(lat) || isNaN(lon)) {
        allResults.push([]);
        continue;
      }

      const pointResults = this._findNearest(lat, lon, maxResults);
      allResults.push(pointResults);
    }

    if (callback) {
      return callback(null, allResults);
    }
    return allResults;
  }

  async lookUpAsync(points, maxResults = 1) {
    return this.lookUp(points, maxResults);
  }

  _findNearest(lat, lon, maxResults) {
    const searchDeltas = [0.5, 1.5, 5.0, 20.0, 90.0];
    let candidates = [];

    for (const delta of searchDeltas) {
      const minLat = Math.max(-90, lat - delta);
      const maxLat = Math.min(90, lat + delta);
      const minLon = Math.max(-180, lon - delta);
      const maxLon = Math.min(180, lon + delta);

      candidates = this._queryRunner(minLat, maxLat, minLon, maxLon);

      if (candidates.length >= maxResults) {
        break;
      }
    }

    if (candidates.length === 0) {
      return [];
    }

    const scored = candidates.map((city) => {
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
        admin1Code: city.admin1Name ? { name: city.admin1Name, asciiName: city.admin1Name, geoNameId: '' } : city.admin1Code,
        admin2Code: city.admin2Name ? { name: city.admin2Name, asciiName: city.admin2Name, geoNameId: '' } : city.admin2Code,
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

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

const defaultInstance = new FastReverseGeocoder();
export default defaultInstance;
