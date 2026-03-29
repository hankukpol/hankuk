CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE track_type AS ENUM ('police', 'fire');
CREATE TYPE room_status AS ENUM ('recruiting', 'formed', 'closed');
CREATE TYPE member_role AS ENUM ('creator', 'leader', 'member');
CREATE TYPE member_status AS ENUM ('joined', 'left');

CREATE TABLE academy_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  academy_name TEXT NOT NULL DEFAULT '한국경찰학원',
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  track track_type NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  reservation_open_at TIMESTAMPTZ,
  reservation_close_at TIMESTAMPTZ,
  apply_open_at TIMESTAMPTZ,
  apply_close_at TIMESTAMPTZ,
  interview_date DATE,
  max_group_size INT DEFAULT 10,
  min_group_size INT DEFAULT 6,
  created_at TIMESTAMPTZ DEFAULT now(),
  archived_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_sessions_active_track
  ON sessions(track)
  WHERE status = 'active';

CREATE TABLE reservation_slots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  capacity INT NOT NULL,
  reserved_count INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_slots_session_date ON reservation_slots(session_id, date);

CREATE TABLE reservations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slot_id UUID REFERENCES reservation_slots(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  status TEXT DEFAULT '확정' CHECK (status IN ('확정', '취소')),
  cancel_reason TEXT,
  booked_by TEXT DEFAULT '학생' CHECK (booked_by IN ('학생', '관리자')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_reservations_unique
  ON reservations(session_id, phone)
  WHERE status = '확정';

CREATE TABLE registered_students (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  gender TEXT CHECK (gender IN ('남', '여')),
  series TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id, phone)
);

CREATE TABLE students (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('남', '여')),
  series TEXT NOT NULL,
  region TEXT NOT NULL,
  age INT CHECK (age BETWEEN 18 AND 60),
  score NUMERIC,
  access_token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id, phone)
);

CREATE INDEX idx_students_token ON students(access_token);

CREATE TABLE group_rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  room_name TEXT,
  invite_code TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  status room_status DEFAULT 'recruiting',
  creator_student_id UUID REFERENCES students(id),
  created_by_admin BOOLEAN DEFAULT false,
  max_members INT DEFAULT 10,
  request_extra_members INT DEFAULT 0,
  request_extra_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_rooms_invite ON group_rooms(invite_code);

CREATE TABLE room_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES group_rooms(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  role member_role DEFAULT 'member',
  status member_status DEFAULT 'joined',
  joined_at TIMESTAMPTZ DEFAULT now(),
  left_at TIMESTAMPTZ,
  UNIQUE(room_id, student_id)
);

CREATE TABLE chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES group_rooms(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id),
  message TEXT NOT NULL CHECK (char_length(message) <= 500),
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chat_room ON chat_messages(room_id, created_at DESC);

CREATE TABLE student_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE UNIQUE,
  intro TEXT CHECK (char_length(intro) <= 100),
  show_phone BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE study_polls (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES group_rooms(id) ON DELETE CASCADE,
  created_by UUID REFERENCES students(id),
  title TEXT NOT NULL,
  options JSONB NOT NULL,
  is_closed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE poll_votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  poll_id UUID REFERENCES study_polls(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  selected_options JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(poll_id, student_id)
);

CREATE TABLE waiting_pool (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  assigned_room_id UUID REFERENCES group_rooms(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id, student_id)
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_read"
  ON chat_messages
  FOR SELECT
  USING (true);

CREATE POLICY "members_read"
  ON room_members
  FOR SELECT
  USING (true);
