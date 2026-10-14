#!/usr/bin/env node
import { run } from '../scripts/i18n-check.mjs';

process.exit(await run(process.argv.slice(2)));
