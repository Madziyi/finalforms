export type BackupWorkflowParams = { plantDate?: string; reason?: string; scheduledAt?: string };

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  BACKUP_WORKFLOW: Workflow<BackupWorkflowParams>;
  APP_PROTOCOL_VERSION: string;
  APP_SCHEMA_VERSION: string;
  PLANT_TIME_ZONE: string;
  OPENAI_MODEL: string;
  DEVICE_TOKEN?: string;
  OPENAI_API_KEY?: string;
  POWER_AUTOMATE_BACKUP_URL?: string;
  POWER_AUTOMATE_BACKUP_KEY?: string;
}
