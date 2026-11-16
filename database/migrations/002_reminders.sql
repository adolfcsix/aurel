-- V0.3 contact history is an internal activity log, not a receipt.
BEGIN;
CREATE TABLE IF NOT EXISTS reminder_contacts (
 id text PRIMARY KEY,
 data jsonb NOT NULL,
 project_id text,
 unit_id text REFERENCES units(id),
 lease_id text REFERENCES leases(id)
);
CREATE INDEX IF NOT EXISTS reminder_contacts_schedule_ref ON reminder_contacts ((data->>'scheduleId'));
CREATE INDEX IF NOT EXISTS reminder_contacts_date_idx ON reminder_contacts ((data->>'contactedAt'));
COMMIT;
