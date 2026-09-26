import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

/**
 * One shared, structured logger instead of scattered console.log/warn/error
 * calls — each line carries real fields (mpn, supplier, job id, ...)
 * instead of only living inside an interpolated string, so it's filterable
 * once this runs for real ("only errors for job X"). Pretty-printed and
 * colorized outside production so the terminal experience stays the same
 * as before; plain JSON in production for log aggregation.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
      },
});
