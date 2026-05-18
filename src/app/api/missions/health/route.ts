import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { listMissions } from "@/lib/mission-repository";
import { listCronJobs } from "@/lib/cron-repository";
import { PATHS } from "@/lib/paths";
import { fetchGateway } from "@/lib/gateway-client";
import { logApiError } from "@/lib/api-logger";

const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

interface HealthReport {
  status: "healthy" | "degraded" | "critical";
  timestamp: string;
  missions: {
    total: number;
    active: number;
    stuck: Array<{ id: string; name: string; age: string; status: string }>;
  };
  cron: {
    total: number;
    running: number;
    stuck: Array<{ id: string; name: string; state: string }>;
  };
  gateway: {
    running: boolean;
    lastTick?: string;
  };
}

export async function GET() {
  try {
    const report: HealthReport = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      missions: { total: 0, active: 0, stuck: [] },
      cron: { total: 0, running: 0, stuck: [] },
      gateway: { running: false },
    };

    const missions = listMissions();
    report.missions.total = missions.length;

    for (const m of missions) {
      if (m.status === "queued" || m.status === "dispatched") {
        report.missions.active++;
        const age = Date.now() - new Date(m.createdAt).getTime();
        if (age > STALE_THRESHOLD_MS) {
          report.missions.stuck.push({
            id: m.id,
            name: m.name,
            age: Math.round(age / 60000) + "m",
            status: m.status,
          });
        }
      }

      // Supplement dispatched missions with on-disk status files (Hermes dispatch artifacts)
      if (m.status === "dispatched") {
        const statusPath = join(PATHS.missions, `${m.id}.status.json`);
        if (existsSync(statusPath)) {
          try {
            const disk = JSON.parse(readFileSync(statusPath, "utf-8")) as {
              status?: string;
              completed_at?: string;
            };
            if (disk.completed_at) {
              report.gateway.lastTick = disk.completed_at;
            }
            if (disk.status === "successful" || disk.status === "failed") {
              // MissionSync will update SQLite; health still flags long-running dispatched
            }
          } catch (error) {
            logApiError("GET /api/missions/health", `status file ${m.id}`, error);
          }
        }
      }
    }

    const cronJobs = listCronJobs();
    report.cron.total = cronJobs.length;

    for (const job of cronJobs) {
      if (job.state === "running") {
        report.cron.running++;
        if (job.last_run_at) {
          const runAge = Date.now() - new Date(job.last_run_at).getTime();
          if (runAge > STALE_THRESHOLD_MS) {
            report.cron.stuck.push({
              id: job.id,
              name: job.name || job.id,
              state: "running too long (" + Math.round(runAge / 60000) + "m)",
            });
          }
        }
      }
    }

    try {
      const res = await fetchGateway("/v1/models", { method: "GET", timeoutMs: 5000 });
      report.gateway.running = res.ok;
    } catch (error) {
      logApiError("GET /api/missions/health", "gateway probe", error);
      report.gateway.running = false;
    }

    if (report.missions.stuck.length > 0 || report.cron.stuck.length > 0) {
      report.status = "degraded";
    }
    if (!report.gateway.running && report.missions.active > 0) {
      report.status = "critical";
    }

    return NextResponse.json({ data: report });
  } catch (err) {
    logApiError("GET /api/missions/health", "checking mission health", err);
    return NextResponse.json({ error: "Health check failed" }, { status: 500 });
  }
}
