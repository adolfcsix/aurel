/** Single source of truth for backend release metadata; no third-party packages. */
import {readFileSync} from 'node:fs';
const manifest=JSON.parse(readFileSync(new URL('../../package.json',import.meta.url),'utf8'));
export const APP_VERSION=manifest.version;
