/**
 * Load `.env` from the project root (parent of `scripts/`), not from `process.cwd()`.
 * Ensures `RESEND_API_KEY`, `SMTP_*`, etc. apply when npm/tsx is run from another directory.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
config({ path: path.join(ROOT, ".env") });
