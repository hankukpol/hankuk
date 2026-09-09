# Exam import fixtures

regular: regenerated BIFF8, 12 anonymous students (public 6, special 4, partial 1, absent 1). Original identifiers reassigned from 90001; names synthetic; DOB blank. No original workbook metadata retained.

morning-synthetic: 8 entirely synthetic students, 20 items, 10 padding columns, 5 padding rows, multiple answers. **Not verification of the missing original morning pair.**

Regenerate: `node scripts/build-exam-import-fixtures.mjs <regular-score-path> <regular-moon-path>`. Reads originals without modifying/copying them. Malformed cases are generated in unit tests separately.
