/* eslint-disable @typescript-eslint/no-require-imports */
'use strict';

const { startServer } = require('next/dist/server/lib/start-server');

const port = Number(process.env.PORT || 3200);

startServer({
  dir: process.cwd(),
  port,
  allowRetry: true,
  isDev: true,
}).catch((error) => {
  console.error('[ERROR] Failed to start Next.js single-process dev server.');
  console.error(error);
  process.exit(1);
});
