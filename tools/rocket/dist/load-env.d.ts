/**
 * Load `<repo-root>/.env` into `process.env`, filling only keys that are not already set.
 * Idempotent and safe to call once at every entry point. Returns the list of key NAMES loaded
 * (never the values) so a caller could log "loaded N keys from .env" without leaking secrets.
 */
export declare function loadDotenv(fromDir?: string): string[];
