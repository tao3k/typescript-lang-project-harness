#!/usr/bin/env node

import { runCliFromEnv } from "../cli.js";

process.exitCode = runCliFromEnv();
