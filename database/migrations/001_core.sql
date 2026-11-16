-- AUREL V0.2: transactional PostgreSQL persistence with separate FK-constrained entity tables.
-- Each entity stores its expandable business attributes as JSONB; indexed relation keys remain relational.
-- Run `npm run db:migrate` before starting PostgreSQL mode.
BEGIN;
CREATE TABLE IF NOT EXISTS projects (id text PRIMARY KEY, data jsonb NOT NULL, project_id text, unit_id text, lease_id text);
CREATE TABLE IF NOT EXISTS staff (id text PRIMARY KEY, data jsonb NOT NULL, project_id text, unit_id text, lease_id text);
CREATE TABLE IF NOT EXISTS clients (id text PRIMARY KEY, data jsonb NOT NULL, project_id text, unit_id text, lease_id text);
CREATE TABLE IF NOT EXISTS buildings (id text PRIMARY KEY, data jsonb NOT NULL, project_id text REFERENCES projects(id), unit_id text, lease_id text);
CREATE TABLE IF NOT EXISTS units (id text PRIMARY KEY, data jsonb NOT NULL, project_id text REFERENCES projects(id), unit_id text, lease_id text);
CREATE TABLE IF NOT EXISTS leases (id text PRIMARY KEY, data jsonb NOT NULL, project_id text, unit_id text REFERENCES units(id), lease_id text);
CREATE TABLE IF NOT EXISTS payment_schedules (id text PRIMARY KEY, data jsonb NOT NULL, project_id text, unit_id text REFERENCES units(id), lease_id text REFERENCES leases(id));
CREATE TABLE IF NOT EXISTS payments (id text PRIMARY KEY, data jsonb NOT NULL, project_id text, unit_id text REFERENCES units(id), lease_id text REFERENCES leases(id));
CREATE TABLE IF NOT EXISTS deposit_transactions (id text PRIMARY KEY, data jsonb NOT NULL, project_id text, unit_id text REFERENCES units(id), lease_id text REFERENCES leases(id));
CREATE TABLE IF NOT EXISTS fee_history (id text PRIMARY KEY, data jsonb NOT NULL, project_id text, unit_id text REFERENCES units(id), lease_id text);
CREATE TABLE IF NOT EXISTS audit_logs (id text PRIMARY KEY, data jsonb NOT NULL, project_id text, unit_id text, lease_id text);
CREATE TABLE IF NOT EXISTS app_users (id text PRIMARY KEY, data jsonb NOT NULL, project_id text, unit_id text, lease_id text);
CREATE TABLE IF NOT EXISTS app_sessions (id text PRIMARY KEY, data jsonb NOT NULL, project_id text, unit_id text, lease_id text);
CREATE TABLE IF NOT EXISTS app_settings (key text PRIMARY KEY, value jsonb NOT NULL);
CREATE INDEX IF NOT EXISTS units_project_fk ON units(project_id);
CREATE INDEX IF NOT EXISTS leases_unit_fk ON leases(unit_id);
CREATE INDEX IF NOT EXISTS payment_schedules_lease_fk ON payment_schedules(lease_id);
CREATE INDEX IF NOT EXISTS payment_schedules_due_on ON payment_schedules ((data->>'dueOn'));
CREATE INDEX IF NOT EXISTS payments_schedule_ref ON payments ((data->>'scheduleId'));
CREATE INDEX IF NOT EXISTS fee_history_unit_effective ON fee_history(unit_id,(data->>'effectiveFrom'));
CREATE INDEX IF NOT EXISTS audit_logs_time ON audit_logs ((data->>'time'));
COMMIT;
