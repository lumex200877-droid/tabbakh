// Keep npm's dependency tree out of the adjacent Godot project's importer.
// Runs after npm install/ci; does not modify user-global configuration.
import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('node_modules', { recursive: true });
writeFileSync('node_modules/.gdignore', '');
