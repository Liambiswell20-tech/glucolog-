import * as fs from 'fs';
import * as path from 'path';

/**
 * Lint guard: crypto.randomUUID must never appear in source code.
 * This prevents the exact bug that killed the previous Supabase attempt
 * (crypto.randomUUID doesn't exist in React Native runtime).
 *
 * Uses Node.js fs to scan files cross-platform (grep is not available on Windows).
 */

const SEARCH_DIRS = ['src', 'lib', 'supabase'];
const SEARCH_FILES = ['index.ts'];
const PATTERN = /crypto\.randomUUID/;
// Exclude test files and comments-only matches
const EXCLUDE_PATTERNS = [/__tests__/, /\.test\.ts/];

function collectTsFiles(dir: string, root: string): string[] {
  const absDir = path.resolve(root, dir);
  if (!fs.existsSync(absDir)) return [];
  const results: string[] = [];
  const entries = fs.readdirSync(absDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(path.join(dir, entry.name), root));
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      results.push(fullPath);
    }
  }
  return results;
}

describe('crypto.randomUUID guard', () => {
  it('must not appear anywhere in source code (excluding tests and comments)', () => {
    const root = path.resolve(__dirname, '..', '..');
    const files: string[] = [];

    for (const dir of SEARCH_DIRS) {
      files.push(...collectTsFiles(dir, root));
    }
    for (const file of SEARCH_FILES) {
      const abs = path.resolve(root, file);
      if (fs.existsSync(abs)) files.push(abs);
    }

    const violations: string[] = [];

    for (const file of files) {
      // Skip test files
      const relPath = path.relative(root, file);
      if (EXCLUDE_PATTERNS.some(p => p.test(relPath))) continue;

      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip single-line comments and multi-line comment lines
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

        if (PATTERN.test(line)) {
          violations.push(`${relPath}:${i + 1}: ${trimmed}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
