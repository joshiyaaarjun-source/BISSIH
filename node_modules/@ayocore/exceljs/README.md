# @ayocore/exceljs

Lightweight Node.js-only fork of [exceljs](https://github.com/exceljs/exceljs) for server-side XLSX report generation.

## What is this?

A stripped-down, security-hardened fork of ExcelJS optimized for backend use. Read, manipulate and write XLSX spreadsheets on Node.js 20+.

## What changed from upstream exceljs?

### Removed

- **Browser support** -- no browser bundles, no polyfills, no UMD wrappers
- **CSV support** -- `workbook.csv` removed entirely (`fast-csv` dependency gone)
- **Build step** -- no Grunt, no Babel, no Browserify, no esbuild, no terser. Code runs as-is on Node 20+
- **`readable-stream` polyfill** -- replaced with native `require('stream')`
- **`dayjs`** -- was unused, removed
- **`core-js`, `regenerator-runtime`** -- not needed on modern Node.js

### Upgraded

- **`archiver`** 5 -> 7 -- removed deprecated `glob@7` and `inflight` from transitive deps
- **`unzipper`** 0.10 -> 0.12 -- removed deprecated `fstream` and `rimraf@2` from transitive deps
- **Streaming reader fix** -- fixed shared strings race condition when worksheet entries arrive before shared strings in the zip (fixes issue #1328)

### Security

| Metric               | upstream exceljs 4.4.0 | @ayocore/exceljs 5.0.2 |
|----------------------|------------------------|-------------------------|
| `npm audit` total    | 48                     | 3 (mocha dev-only)      |
| Critical             | 3                      | 0                       |
| High                 | 29                     | 2 (dev-only)            |
| Runtime vulns        | 1                      | 0                       |

### Lighter

| Metric               | upstream exceljs 4.4.0 | @ayocore/exceljs 5.0.2 |
|----------------------|------------------------|-------------------------|
| Runtime dependencies | 9                      | 6                       |
| Package size         | ~2.5 MB                | ~1 MB                   |
| node_modules tree    | 1320 packages          | ~600 packages           |

### Runtime dependencies

`archiver`, `jszip`, `saxes`, `tmp`, `unzipper`, `uuid`

## Requirements

- **Node.js >= 20**
- Server-side only. Not for browser use.

## Installation

```shell
npm install @ayocore/exceljs
```

## Quick start

```js
const ExcelJS = require('@ayocore/exceljs');

// Create a workbook
const wb = new ExcelJS.Workbook();
wb.creator = 'My Server';

// Add a worksheet
const ws = wb.addWorksheet('Report');

ws.columns = [
  {header: 'ID', key: 'id', width: 8},
  {header: 'Name', key: 'name', width: 25},
  {header: 'Amount', key: 'amount', width: 15},
];

ws.getRow(1).font = {bold: true};

ws.addRow({id: 1, name: 'Item A', amount: 100});
ws.addRow({id: 2, name: 'Item B', amount: 250});

ws.getColumn('amount').numFmt = '$#,##0.00';

// Write to file
await wb.xlsx.writeFile('/tmp/report.xlsx');

// Or write to buffer
const buffer = await wb.xlsx.writeBuffer();
```

## Streaming

```js
const ExcelJS = require('@ayocore/exceljs');

// Streaming writer (low memory)
const wb = new ExcelJS.stream.xlsx.WorkbookWriter({
  filename: '/tmp/large-report.xlsx',
});

const ws = wb.addWorksheet('Data');
ws.columns = [{header: 'Row', key: 'row'}];

for (let i = 0; i < 1_000_000; i++) {
  ws.addRow({row: i}).commit();
}

ws.commit();
await wb.commit();
```

## API

The API is the same as [exceljs](https://github.com/exceljs/exceljs) with the following exceptions:

- `workbook.csv` -- removed (use a dedicated CSV library if needed)
- Browser-specific features -- removed
- ES5/dist builds -- removed

For full API documentation, see the [upstream docs](https://github.com/exceljs/exceljs#contents).

## Ported upstream fixes

This fork includes bug fixes and improvements from open PRs in the original [exceljs](https://github.com/exceljs/exceljs) repository that have not yet been merged upstream.

### Bug fixes

| PR | Description | Author |
|----|-------------|--------|
| [#2915](https://github.com/exceljs/exceljs/pull/2915) | Fix WorkbookReader race condition — cell values read as sharedString index instead of actual value | [@AnechaS](https://github.com/AnechaS) |
| [#2807](https://github.com/exceljs/exceljs/pull/2807) | Fix pageSetUpPr/outlinePr ordering in sheetPr — broken xlsx output | [@strelok372](https://github.com/strelok372) |
| [#2851](https://github.com/exceljs/exceljs/pull/2851) | Fix boolean attribute parsing — `<strike val="0"/>` was read as true | [@Jason33Wang](https://github.com/Jason33Wang) |
| [#2803](https://github.com/exceljs/exceljs/pull/2803) | Fix corrupted file when combining conditional formatting with hyperlinks in stream writer | [@TheAsda](https://github.com/TheAsda) |
| [#2956](https://github.com/exceljs/exceljs/pull/2956) | Fix dateToExcel() returning NaN for non-numeric values | [@davepuchyr](https://github.com/davepuchyr) |
| [#2737](https://github.com/exceljs/exceljs/pull/2737) | Don't render empty rich text substrings — Excel can't open the file | [@Blackhol3](https://github.com/Blackhol3) |
| [#2781](https://github.com/exceljs/exceljs/pull/2781) | Fix cell style mutation — setting style on one cell no longer corrupts others sharing the same style object | [@gmahomarf](https://github.com/gmahomarf) |
| [#2973](https://github.com/exceljs/exceljs/pull/2973) | Fix crash when parsing Excel tables with dynamicFilter nodes | [@johnnyoshika](https://github.com/johnnyoshika) |
| [#2996](https://github.com/exceljs/exceljs/pull/2996) | Fix XML special characters and null values in pivot tables | [@protobi-pieter](https://github.com/protobi-pieter) |
| [#2962](https://github.com/exceljs/exceljs/pull/2962) | Handle missing `r` attribute in row/cell elements — improves compatibility with non-standard Excel generators | [@Diluka](https://github.com/Diluka) |
| [#2920](https://github.com/exceljs/exceljs/pull/2920) | Optimize merge cell overlap check — O(N) scan replaced with per-cell isMerged check | [@3ximus](https://github.com/3ximus) |
| [#2894](https://github.com/exceljs/exceljs/pull/2894) | Fix SAX parser breaking multi-byte UTF-8 characters (Chinese, emoji, etc.) across chunk boundaries | [@maoxian-1](https://github.com/maoxian-1) |
| [#2874](https://github.com/exceljs/exceljs/pull/2874) | Fix race conditions and memory leaks in stream iteration | [@StevenGee3398](https://github.com/StevenGee3398) |

### Improvements

| PR | Description | Author |
|----|-------------|--------|
| [#2867](https://github.com/exceljs/exceljs/pull/2867) | Style cache modes (`FAST_MAP`, `JSON_MAP`) — up to 3x write performance with `useStyles` | [@brunoargolo](https://github.com/brunoargolo) |
| [#2998](https://github.com/exceljs/exceljs/pull/2998) | Fix `getTable().addRow()` for tables loaded from files — refs, autoFilter, and worksheet binding | [@protobi-pieter](https://github.com/protobi-pieter) |
| [#2995](https://github.com/exceljs/exceljs/pull/2995) | Support multiple pivot tables per workbook + fix `.splice()` data mutation bug | [@protobi-pieter](https://github.com/protobi-pieter) |

Thank you to all the original authors for their contributions to the exceljs ecosystem.

## License

MIT -- original work by [Guyon Roche](https://github.com/guyonroche) and [exceljs contributors](https://github.com/exceljs/exceljs/graphs/contributors).
