# local-geolookup

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/Bun-1.4+-black.svg?logo=bun)](https://bun.sh)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg?logo=node.js)](https://nodejs.org)

An **offline, zero-network reverse geocoder** for **Bun** & **Node.js** powered by **SQLite R*Tree Spatial Index** and [GeoNames](https://www.geonames.org/) database.

- ⚡ **Instant Startup Time (0.00 ms)** — No waiting for huge TSV/CSV parsing.
- 🚀 **High Performance (< 0.2 ms / query)** — Over 5,500+ queries/second on Bun.
- 💾 **Lightweight (~10 MB RAM)** — Replaces memory-heavy K-D tree packages.
- 📦 **Offline & Standalone** — Built-in SQLite database covering 168,000+ cities worldwide.
- 🛠️ **TypeScript First** — Full typings included out-of-the-box.

---

## ⚙️ Requirements

| Runtime | Minimum Version | Note |
| :--- | :--- | :--- |
| **Bun** | `>= 1.0.0` (Recommended: `1.4+`) | Uses built-in `bun:sqlite` |
| **Node.js** | `>= 22.5.0` (Recommended: `22+` / `24+`) | Uses built-in `node:sqlite` (zero dependencies) |

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

// Accepts { latitude, longitude }, { lat, lon }, or (lat, lon) numbers:
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
```

### 3. Async / Await Support

```typescript
const result = await geocoder.lookUpOneAsync(13.7563, 100.5018);
console.log(result?.name);
```

---

## 💻 CLI Usage

```bash
# Direct lookup from terminal
bunx local-geolookup 13.7563 100.5018
# or
npx local-geolookup 13.7563 100.5018
```

---

## 📊 Benchmark Results (10,000 Points)

| Metric | Classic `local-reverse-geocoder` | **local-geolookup** |
| :--- | :--- | :--- |
| **Startup Time** | 2,000 – 15,000 ms | **0.00 ms (Instant)** |
| **Query Latency** | 1.0 – 5.0 ms | **0.19 ms (190 µs)** |
| **Throughput** | ~200 – 500 req/s | **5,684 req/s** |
| **RAM Usage (Heap)** | 500 MB – 2,000+ MB | **~10–13 MB** |

---

## 📜 License

MIT
