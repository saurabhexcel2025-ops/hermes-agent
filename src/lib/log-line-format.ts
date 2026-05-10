/**
 * Parse plain-text log lines into timestamp, level, and message for aligned display.
 */

export type ParsedLogLevel = "error" | "warn" | "info" | "debug" | "unknown";

export interface ParsedLogLine {
  timestamp: string | null;
  level: ParsedLogLevel;
  message: string;
}

const RE_SPACE_TS =
  /^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?)\s+(.*)$/;
const RE_ISO_PREFIX =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:?\d{2})?)\s+(.*)$/;
const RE_SLASH_TS =
  /^(\d{4}\/\d{2}\/\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?)\s+(.*)$/;
const RE_BRACKET_LEVEL = /^\[(DEBUG|INFO|INF|WARN|WARNING|ERROR|ERR|FATAL|TRACE)\]\s*(.*)$/i;
const RE_EPOCH = /^(\d{10}|\d{13})(\s+|$)(.*)$/;

function levelFromToken(token: string): ParsedLogLevel | null {
  const u = token.toUpperCase();
  if (u === "ERROR" || u === "ERR" || u === "FATAL") return "error";
  if (u === "WARN" || u === "WARNING") return "warn";
  if (u === "INFO" || u === "INF" || u === "TRACE") return "info";
  if (u === "DEBUG") return "debug";
  return null;
}

function levelFromMessage(text: string): ParsedLogLevel {
  const upper = text.toUpperCase();
  if (/\b(ERROR|ERR|FATAL)\b/.test(upper) || text.includes("Error")) {
    return "error";
  }
  if (/\b(WARN|WARNING)\b/.test(upper)) return "warn";
  if (/\bDEBUG\b/.test(upper)) return "debug";
  if (/\b(INFO|INF)\b/.test(upper)) return "info";
  return "unknown";
}

/**
 * Parse a single log line into display fields.
 */
export function parseLogLine(raw: string): ParsedLogLine {
  const line = raw.replace(/\r$/, "");
  if (!line) {
    return { timestamp: null, level: "unknown", message: "" };
  }

  let rest = line;
  let timestamp: string | null = null;

  const tryTs = (re: RegExp): boolean => {
    const m = rest.match(re);
    if (!m) return false;
    timestamp = m[1];
    rest = m[2] ?? "";
    return true;
  };

  if (tryTs(RE_SPACE_TS)) {
    return finishParse(timestamp, rest);
  }
  if (tryTs(RE_ISO_PREFIX)) {
    return finishParse(timestamp, rest);
  }
  if (tryTs(RE_SLASH_TS)) {
    return finishParse(timestamp, rest);
  }

  const epoch = rest.match(RE_EPOCH);
  if (epoch) {
    const ms = epoch[1].length === 13 ? Number(epoch[1]) : Number(epoch[1]) * 1000;
    if (Number.isFinite(ms)) {
      try {
        timestamp = new Date(ms).toISOString().replace("T", " ").slice(0, 19);
      } catch {
        timestamp = epoch[1];
      }
      rest = (epoch[3] ?? "").trimStart();
      return finishParse(timestamp, rest);
    }
  }

  const br = rest.match(RE_BRACKET_LEVEL);
  if (br) {
    const lvl = levelFromToken(br[1]);
    rest = br[2] ?? "";
    const subIso = rest.match(RE_ISO_PREFIX);
    if (subIso) {
      timestamp = subIso[1];
      rest = subIso[2] ?? "";
    }
    const level = lvl ?? levelFromMessage(rest);
    return { timestamp, level, message: rest.trim() || line };
  }

  return { timestamp: null, level: levelFromMessage(line), message: line };
}

function finishParse(ts: string | null, msg: string): ParsedLogLine {
  const trimmed = msg.trimStart();
  const br = trimmed.match(RE_BRACKET_LEVEL);
  let level: ParsedLogLevel;
  let message: string;
  if (br) {
    level = levelFromToken(br[1]) ?? levelFromMessage(trimmed);
    message = (br[2] ?? "").trim() || trimmed;
  } else {
    level = levelFromMessage(trimmed);
    message = trimmed;
  }
  return { timestamp: ts, level, message: message || trimmed };
}
