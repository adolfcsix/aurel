-- V0.4: explicit deposit proposals and internal notification inbox.
BEGIN;
CREATE TABLE IF NOT EXISTS deposit_settlements (
 id text PRIMARY KEY, data jsonb NOT NULL,
 project_id text, unit_id text REFERENCES units(id), lease_id text REFERENCES leases(id)
);
CREATE TABLE IF NOT EXISTS reminder_notifications (
 id text PRIMARY KEY, data jsonb NOT NULL,
 project_id text, unit_id text REFERENCES units(id), lease_id text REFERENCES leases(id)
);
CREATE INDEX IF NOT EXISTS deposit_settlements_lease_idx ON deposit_settlements(lease_id);
CREATE INDEX IF NOT EXISTS deposit_settlements_status_idx ON deposit_settlements ((data->>'status'));
CREATE INDEX IF NOT EXISTS reminder_notifications_date_idx ON reminder_notifications ((data->>'forDate'));
CREATE INDEX IF NOT EXISTS reminder_notifications_schedule_idx ON reminder_notifications ((data->>'scheduleId'));
COMMIT;
