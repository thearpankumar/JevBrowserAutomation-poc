import { config } from "dotenv";
import { fileURLToPath } from "node:url";

// Resolved relative to this file (backend/src/ or backend/dist/ → backend/.env),
// not process.cwd(), so it doesn't matter which directory the process was
// started from. A missing file is fine: in production the host sets real
// environment variables instead. Import this first — logger.ts reads
// NODE_ENV/LOG_LEVEL at import time.
config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });
