-- V0.5 - protected proof metadata. Files stay on a protected local volume.
BEGIN;
CREATE TABLE IF NOT EXISTS payment_attachments (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  project_id text,
  unit_id text REFERENCES units(id),
  lease_id text REFERENCES leases(id)
);
CREATE INDEX IF NOT EXISTS payment_attachments_payment_id ON payment_attachments ((data->>'paymentId'));
COMMIT;
