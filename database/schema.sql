CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL CHECK (role IN ('GUEST','MEMBER','TEACHER','STAFF','MANAGER')),
  member_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS members (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  package_type VARCHAR(32) NOT NULL,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  total_turns INTEGER NOT NULL CHECK (total_turns > 0),
  used_turns INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tables (
  id SERIAL PRIMARY KEY,
  table_number INTEGER UNIQUE NOT NULL,
  zone VARCHAR(32) NOT NULL CHECK (zone IN ('teaching', 'customer')),
  capacity INTEGER NOT NULL DEFAULT 4 CHECK (capacity BETWEEN 1 AND 4),
  status VARCHAR(32) NOT NULL DEFAULT 'available',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  table_id INTEGER NOT NULL REFERENCES tables(id),
  member_id INTEGER REFERENCES members(id),
  customer_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(255),
  booking_type VARCHAR(32) NOT NULL CHECK (booking_type IN ('WALK_IN', 'MEMBER', 'TEACHER')),
  start_time TIMESTAMPTZ NOT NULL,
  duration_hours NUMERIC(4,1) NOT NULL DEFAULT 2,
  people_count INTEGER NOT NULL CHECK (people_count BETWEEN 1 AND 4),
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','CONFIRMED','CHECKED_IN','CHECKED_OUT','CANCELLED')),
  amount INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS class_sessions (
  id SERIAL PRIMARY KEY,
  teacher_id INTEGER NOT NULL,
  teacher_name VARCHAR(255) NOT NULL,
  session_date DATE NOT NULL,
  start_hour INTEGER NOT NULL,
  end_hour INTEGER NOT NULL,
  tables VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  type VARCHAR(32) NOT NULL,
  amount INTEGER NOT NULL,
  reference VARCHAR(255) NOT NULL,
  who VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS configs (
  id SERIAL PRIMARY KEY,
  court_price INTEGER NOT NULL DEFAULT 20000,
  default_hours INTEGER NOT NULL DEFAULT 2,
  max_people_per_table INTEGER NOT NULL DEFAULT 4,
  opening_hour INTEGER NOT NULL DEFAULT 6,
  closing_hour INTEGER NOT NULL DEFAULT 21,
  class_cutoff_hour INTEGER NOT NULL DEFAULT 19,
  alert_minutes INTEGER NOT NULL DEFAULT 30,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO configs (
  court_price,
  default_hours,
  max_people_per_table,
  opening_hour,
  closing_hour,
  class_cutoff_hour,
  alert_minutes
) VALUES (20000, 2, 4, 6, 21, 19, 30)
ON CONFLICT DO NOTHING;
