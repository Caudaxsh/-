import assert from 'node:assert';
import { parseSp500Csv, parseExtra, mergeUnique, US_ETFS, JP_STOCKS } from '../tools/universe.mjs';

// S&P 500 CSV(欄位順序、引號、BRK.B → BRK-B)
const csv = 'Symbol,Security,GICS Sector,GICS Sub-Industry,Headquarters Location,Date added,CIK,Founded\n' +
  'AAPL,Apple Inc.,Information Technology,x,"Cupertino, California",1982-11-30,320193,1977\n' +
  'GOOG,Alphabet Inc. (Class C),Communication Services,x,"Mountain View, California",2014-04-03,1652044,1998\n' +
  'BRK.B,Berkshire Hathaway,Financials,x,"Omaha, Nebraska",2010-02-16,1067983,1839\n' +
  'BF.B,"Brown-Forman, Inc.",Consumer Staples,x,"Louisville, Kentucky",1982-10-31,14693,1870\n' +
  ',bad row,,,,,,\n';
const sp = parseSp500Csv(csv);
assert.deepStrictEqual(sp.map((r) => r[0]), ['AAPL', 'GOOG', 'BRK-B', 'BF-B']);
assert.strictEqual(sp[1][1], 'Alphabet Inc. (Class C)'); assert.strictEqual(sp[3][1], 'Brown-Forman, Inc.');
assert.deepStrictEqual(parseSp500Csv(''), []); assert.deepStrictEqual(parseSp500Csv('foo,bar\n1,2'), []);

// extra-symbols.txt
const ex = parseExtra('# 註解\nSNOW,Snowflake\n\n 7203.T , トヨタ # 行尾註解\nbrk.b\n4755.T\nnot a symbol\n');
assert.deepStrictEqual(ex.us, [['SNOW', 'Snowflake'], ['BRK-B', 'BRK-B']]);
assert.deepStrictEqual(ex.jp, [['7203', 'トヨタ'], ['4755', '4755']]);

// 合併去重:先出現者優先
const m = mergeUnique([['A', 'first']], [['A', 'second'], ['B', 'b']]);
assert.deepStrictEqual(m, [['A', 'first'], ['B', 'b']]);

// 內建清單基本檢查:代碼格式、無重複、GOOG 在內
const dup = (l) => l.length - new Set(l.map((r) => r[0])).size;
assert(US_ETFS.every(([s]) => /^[A-Z][A-Z0-9-]{0,9}$/.test(s)));
assert(JP_STOCKS.every(([s]) => /^\d{4}[A-Z]?$/.test(s)));
assert.strictEqual(dup(US_ETFS), 0);
assert(dup(JP_STOCKS) <= 1, 'JP list duplicates: ' + dup(JP_STOCKS)); // mergeUnique 會去重
const us = mergeUnique(US_ETFS); assert(us.some(([s]) => s === 'GOOG'));
assert(mergeUnique(JP_STOCKS).length >= 100);
console.log('universe tests passed');
