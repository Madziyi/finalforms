import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { BackupWorkflowParams, Env } from "./env";
import { buildBackupGeneration, deliverBackupGeneration, dirtyDates, previousTorontoDate } from "./domain/backup";
import { recomputeDerivedDate } from "./domain/derivations";
import { nextCalendarDate } from "../shared/safetyContract";

export class BackupWorkflow extends WorkflowEntrypoint<Env, BackupWorkflowParams> {
  async run(event: WorkflowEvent<BackupWorkflowParams>, step: WorkflowStep) {
    const dates = await step.do("select backup dates", async () => {
      if (event.payload?.plantDate) return [event.payload.plantDate];
      const scheduledNow = event.payload?.scheduledAt
        ? new Date(event.payload.scheduledAt)
        : event.schedule
          ? new Date(event.schedule.scheduledTime)
          : event.timestamp;
      const daily = previousTorontoDate(scheduledNow);
      const dirty = await dirtyDates(this.env.DB, daily);
      return [...new Set([daily, ...dirty])].slice(0, 30);
    });

    const results: Array<Record<string, unknown>> = [];
    for (const plantDate of dates) {
      await step.do(`refresh derived ${plantDate}`, { retries: { limit: 3, delay: "5 seconds", backoff: "linear" }, timeout: "2 minutes" }, async () => {
        // Idempotent recovery path: only dates with a Form 8 dependency or an existing projection need derivation work.
        // This avoids inventing Form 5/6 rows on dates that contain only unrelated forms.
        const previousDate = nextCalendarDate(plantDate, -1);
        const relevant = await this.env.DB.prepare(`SELECT
          EXISTS(SELECT 1 FROM latest_completed_records WHERE form_key='integrator-readings' AND plant_date IN (?,?)) AS has_integrator,
          EXISTS(SELECT 1 FROM derived_projections WHERE plant_date=?) AS has_projection`).bind(plantDate, previousDate, plantDate).first<{has_integrator:number;has_projection:number}>();
        if (!Number(relevant?.has_integrator ?? 0) && !Number(relevant?.has_projection ?? 0)) return { skipped: true };
        return recomputeDerivedDate(this.env.DB, plantDate);
      });
      const built = await step.do(`build ${plantDate}`, { retries: { limit: 3, delay: "5 seconds", backoff: "linear" }, timeout: "2 minutes" }, async () => {
        const result = await buildBackupGeneration(this.env.DB, plantDate);
        if (result.generation?.generation_id) {
          await this.env.DB.prepare(`UPDATE backup_generations SET workflow_instance_id=? WHERE generation_id=?`).bind(event.instanceId, result.generation.generation_id).run();
        }
        return result;
      });
      if (!built.ready || !built.generation) {
        results.push({ plantDate, status: "not_ready", reason: built.reason ?? "Generation not ready" });
        continue;
      }
      if (built.generation.status === "verified") {
        results.push({ plantDate, generationId: built.generation.generation_id, status: "verified_already" });
        continue;
      }
      if (built.generation.status === "failed" && !event.payload?.plantDate) {
        results.push({ plantDate, generationId: built.generation.generation_id, status: "permanent_failure_requires_manual_retry" });
        continue;
      }
      const delivered = await step.do(`deliver ${plantDate} generation ${built.generation.generation_number}`, {
        retries: { limit: 5, delay: "30 seconds", backoff: "exponential" },
        timeout: "10 minutes",
      }, async () => {
        const result = await deliverBackupGeneration(this.env, built.generation!.generation_id);
        return { outcome: result.outcome, message: result.message };
      });
      results.push({ plantDate, generationId: built.generation.generation_id, status: delivered.outcome, message: delivered.message });
    }
    return { instanceId: event.instanceId, dates, results };
  }
}
