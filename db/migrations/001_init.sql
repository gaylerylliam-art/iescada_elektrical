CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text UNIQUE NOT NULL CHECK (name IN ('Admin', 'Engineer', 'Viewer'))
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  role_id uuid NOT NULL REFERENCES roles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE substations (
  id text PRIMARY KEY,
  name text NOT NULL,
  region text NOT NULL,
  latitude numeric(10, 6),
  longitude numeric(10, 6),
  voltage_level_kv numeric(8, 2) NOT NULL,
  rated_mva numeric(10, 2) NOT NULL,
  allowable_mva numeric(10, 2) NOT NULL,
  rated_current_a numeric(10, 2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE transformers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  substation_id text NOT NULL REFERENCES substations(id) ON DELETE CASCADE,
  equipment_id text NOT NULL,
  rating_mva numeric(10, 2) NOT NULL,
  status text NOT NULL DEFAULT 'in_service',
  UNIQUE (substation_id, equipment_id)
);

CREATE TABLE feeders (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  substation_id text NOT NULL REFERENCES substations(id) ON DELETE CASCADE,
  name text NOT NULL,
  rating_mva numeric(10, 2) NOT NULL,
  UNIQUE (substation_id, name)
);

CREATE TABLE equipment (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  substation_id text NOT NULL REFERENCES substations(id) ON DELETE CASCADE,
  equipment_id text NOT NULL,
  equipment_type text NOT NULL,
  source_tag text,
  UNIQUE (substation_id, equipment_id)
);

CREATE TABLE telemetry (
  time timestamptz NOT NULL,
  substation_id text NOT NULL REFERENCES substations(id) ON DELETE CASCADE,
  voltage_kv numeric(10, 3),
  current_a numeric(12, 3),
  mw numeric(12, 3),
  mvar numeric(12, 3),
  mva numeric(12, 3),
  loading_percent numeric(8, 3),
  available_capacity_mva numeric(12, 3),
  transformer_temp_c numeric(8, 3),
  status text NOT NULL,
  n_minus_one_status text,
  connection_status text,
  is_stale boolean NOT NULL DEFAULT false,
  PRIMARY KEY (time, substation_id)
);

SELECT create_hypertable('telemetry', 'time', if_not_exists => TRUE);

CREATE TABLE feeder_telemetry (
  time timestamptz NOT NULL,
  substation_id text NOT NULL REFERENCES substations(id) ON DELETE CASCADE,
  feeder_name text NOT NULL,
  loading_percent numeric(8, 3),
  PRIMARY KEY (time, substation_id, feeder_name)
);

SELECT create_hypertable('feeder_telemetry', 'time', if_not_exists => TRUE);

CREATE TABLE alarm_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  alarm_key text NOT NULL,
  substation_id text NOT NULL REFERENCES substations(id) ON DELETE CASCADE,
  severity text NOT NULL CHECK (severity IN ('Info', 'Warning', 'Critical')),
  type text NOT NULL,
  message text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  acknowledged boolean NOT NULL DEFAULT false,
  acknowledged_by uuid REFERENCES users(id),
  acknowledged_at timestamptz,
  raised_at timestamptz NOT NULL DEFAULT now(),
  cleared_at timestamptz
);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id),
  action text NOT NULL,
  target_type text,
  target_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO roles (name) VALUES ('Admin'), ('Engineer'), ('Viewer') ON CONFLICT DO NOTHING;
