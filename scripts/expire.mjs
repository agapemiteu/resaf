import { runExpirationSweep } from '../src/core/reservations/sweep.mjs';

const result = await runExpirationSweep();
console.log(JSON.stringify(result));
if (result.failed) process.exitCode = 1;
