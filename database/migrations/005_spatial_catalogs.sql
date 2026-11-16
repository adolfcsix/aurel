-- V2.0: optional editable floor and room catalogues; existing free-form labels retained.
BEGIN;
CREATE TABLE IF NOT EXISTS floors (id text PRIMARY KEY, data jsonb NOT NULL, project_id text REFERENCES projects(id), unit_id text, lease_id text);
CREATE TABLE IF NOT EXISTS rooms  (id text PRIMARY KEY, data jsonb NOT NULL, project_id text REFERENCES projects(id), unit_id text, lease_id text);
CREATE INDEX IF NOT EXISTS floors_building_ref ON floors ((data->>'buildingId'));
CREATE INDEX IF NOT EXISTS rooms_floor_ref ON rooms ((data->>'floorId'));
CREATE INDEX IF NOT EXISTS units_floor_ref ON units ((data->>'floorId'));
CREATE INDEX IF NOT EXISTS units_room_ref ON units ((data->>'roomId'));
COMMIT;
