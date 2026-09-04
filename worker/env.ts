export type BackupWorkflowParams = { plantDate?: string; reason?: string; scheduledAt?: string };

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  BACKUP_WORKFLOW: Workflow<BackupWorkflowParams>;
  APP_PROTOCOL_VERSION: string;
  APP_SCHEMA_VERSION: string;
  PLANT_TIME_ZONE: string;
  GEMINI_MODEL: string;
  DEVICE_TOKEN?: string;
  GEMINI_API_KEY?: string;
  POWER_AUTOMATE_BACKUP_URL?: string;
  POWER_AUTOMATE_BACKUP_KEY?: string;
}
