#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

try {
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], {
    stdio: 'ignore',
  });
  console.log('Git hooks configured: .githooks/');
} catch (error) {
  if (error?.status !== 128) {
    throw error;
  }
}
