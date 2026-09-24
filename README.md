# local-geolookup

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/Bun-1.4+-black.svg?logo=bun)](https://bun.sh)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg?logo=node.js)](https://nodejs.org)

An **offline, zero-network reverse geocoder** for **Bun** & **Node.js** powered by **SQLite R*Tree Spatial Index** and [GeoNames](https://www.geonames.org/) database.

- ⚡ **Instant Startup Time (0.00 ms)** — No waiting for huge TSV/CSV parsing.
- 🚀 **High Performance (< 0.2 ms / query)** — ~5,300 queries/second on Bun, ~4,000 on Node.js (Apple M1 Pro).
- 💾 **Lightweight (~10 MB heap)** — No in-memory index to build; the R*Tree lives in the SQLite file.
- 📦 **Offline & Standalone** — Built-in SQLite database covering 168,000+ cities worldwide.
- 🛠️ **TypeScript First** — Full typings included out-of-the-box.

---

## ⚙️ Requirements

| Runtime | Minimum Version | Note |
| :--- | :--- | :--- |
| **Bun** | `>= 1.0.0` (Recommended: `1.4+`) | Uses built-in `bun:sqlite` |
| **Node.js** | `>= 22.5.0` (Recommended: `22+` / `24+`) | Uses built-in `node:sqlite` (zero dependencies) |

Node.js prints `ExperimentalWarning: SQLite is an experimental feature` on first use. It is harmless; silence it with `node --no-warnings` if needed.

---

## 📦 Installation

```bash
# With Bun
bun add local-geolookup

# With npm
npm install local-geolookup

# With yarn / pnpm
yarn add local-geolookup
pnpm add local-geolookup
```

---

## 🚀 Quick Start

### 1. Single Point Lookup (`lookUpOne`)

Returns a single result object (or `null` if no match):

```typescript
import geocoder from 'local-geolookup';

// Accepts { latitude, longitude }, { lat, lon }, { lat, lng }, [lat, lon], or (lat, lon) numbers.
// String values are coerced; invalid input returns null.
const city = geocoder.lookUpOne({ latitude: 13.7563, longitude: 100.5018 });

console.log(city);
/*
{
  "geoNameId": "1609350",
  "name": "Bangkok",
  "asciiName": "Bangkok",
  "countryCode": "TH",
  "admin1Code": { "name": "Bangkok", "asciiName": "Bangkok", "geoNameId": "" },
  "admin2Code": "",
  "population": 5104476,
  "timezone": "Asia/Bangkok",
  "dem": 12,
  "distance": 0.261 // km
}
*/

// Or with direct numbers:
const tokyo = geocoder.lookUpOne(35.6762, 139.6503);
console.log(tokyo?.name); // "Ogikubo"
```

### 2. Batch Lookup (`lookUp`)

Compatible with classic `local-reverse-geocoder` API (returns 2D array):

```typescript
import geocoder from 'local-geolookup';

const points = [
  { latitude: 13.7563, longitude: 100.5018 },
  { latitude: 35.6762, longitude: 139.6503 }
];

const results = geocoder.lookUp(points, 1);
console.log(results[0][0].name); // "Bangkok"
console.log(results[1][0].name); // "Ogikubo"

// Each point accepts the same input forms as lookUpOne. An invalid point yields [] for that index.
const mixed = geocoder.lookUp([[48.8566, 2.3522], { lat: 'x', lon: 1 }], 3);
console.log(mixed[0].length); // 3 nearest cities to Paris
console.log(mixed[1]);        // []
```

### 3. Async / Await Support

```typescript
const result = await geocoder.lookUpOneAsync(13.7563, 100.5018);
console.log(result?.name);

const batch = await geocoder.lookUpAsync([{ lat: 13.7563, lon: 100.5018 }], 2);
```

### 4. Custom Database Path and Lifecycle

The default export is a ready-to-use instance backed by the bundled database. Create your own instance to point at a different `geonames.sqlite` (for example one you rebuilt from a newer GeoNames dump):

```typescript
import { FastReverseGeocoder } from 'local-geolookup';

const geocoder = new FastReverseGeocoder('/srv/data/geonames.sqlite');

// Re-open against another file. With a callback, a failed open reports the
// error and leaves the current database in use instead of throwing.
geocoder.init({ dbPath: '/srv/data/geonames-2026-10.sqlite' }, (err, instance) => {
  if (err) console.error(err.message);
});

geocoder.close(); // release the SQLite handle; lookups throw after this
```

### 5. Other Exports

```typescript
import { haversineDistance } from 'local-geolookup';
import type { GeoPoint, GeoResult, AdminCode } from 'local-geolookup';

haversineDistance(13.7563, 100.5018, 35.6762, 139.6503); // km
```

---

## 💻 CLI Usage

```bash
# Direct lookup from terminal
bunx local-geolookup 13.7563 100.5018
# or
npx local-geolookup 13.7563 100.5018

# Nearest 3 cities (prints a JSON array instead of a single object)
npx local-geolookup 13.7563 100.5018 3
```

Usage: `local-geolookup <latitude> <longitude> [maxResults]`. Non-numeric coordinates or a `maxResults` below 1 exit with code 1 and an error message.

---

## 📊 Benchmark Results (10,000 Random Points)

Measured on a MacBook Pro with an Apple M1 Pro (8 cores, 16 GB RAM) running macOS 26.6.2. Workload: 10,000 random coordinates between ±60° latitude, looked up one at a time with `lookUp(point, 1)` and once more as a single batch call. Bun numbers come from `bun run bench`; Node numbers run the same loop against the compiled `dist/`.

| Metric | Bun 1.4.0 | Node.js 24.14 |
| :--- | :--- | :--- |
| **Startup** | Instant (opens SQLite, prepares one statement) | Instant |
| **Single Query Latency** | **0.19 ms** | 0.25 ms |
| **Single Query Throughput** | **~5,300 req/s** | ~4,000 req/s |
| **Batch Throughput** | **~5,200 req/s** | ~4,000 req/s |
| **Heap Used** | ~10 MB | ~20 MB |
| **Process RSS** | ~80 MB | ~150 MB |

Numbers vary by machine and run; use `bun run bench` to measure on your own hardware.

---

## 🗂️ Data Attribution

The bundled `data/geonames.sqlite` is derived from the [GeoNames](https://www.geonames.org/) gazetteer (`cities1000`, `admin1CodesASCII`, `admin2Codes`), which is licensed under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). The data has been modified: it is converted to SQLite, a subset of columns is kept, and an R*Tree index is added. If you redistribute this package or its database, keep this attribution.

The code in this repository is MIT licensed; the GeoNames data is not.

---

## 🙏 Acknowledgements

The API shape of `lookUp` (points in, `results[pointIndex][rank]` out) and the result field names follow [local-reverse-geocoder](https://github.com/tomayac/local-reverse-geocoder) by Thomas Steiner (Apache License 2.0), so existing code can switch between the two. Portions of the original argument-handling logic were adapted from that project. This package replaces its in-memory K-D tree with a SQLite R*Tree index and shares no runtime code with it.

---

## 📜 License

- **Code:** [MIT](https://opensource.org/licenses/MIT). Portions adapted from [local-reverse-geocoder](https://github.com/tomayac/local-reverse-geocoder), © Thomas Steiner, [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).
- **Bundled data:** [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), © [GeoNames](https://www.geonames.org/). See Data Attribution above.
