import pino from "pino";

const env = process.env.NODE_ENV;
const isProduction = env === "production";
// Vitest sets NODE_ENV=test. Tests re-import modules (vi.resetModules), and
// each pino-pretty transport starts its own worker thread plus a process exit
// listener — so tests get no transport and are silent unless LOG_LEVEL says otherwise.
const isTest = env === "test";

/**
 * One shared, structured logger — each line carries real fields (mpn,
 * supplier, job id, ...) instead of only an interpolated string, so it's
 * filterable once this runs for real ("only errors for job X").
 * Pretty-printed in development, plain JSON in production for log aggregation.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isTest ? "silent" : "info"),
  transport:
    isProduction || isTest
      ? undefined
      : {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
        },
});
