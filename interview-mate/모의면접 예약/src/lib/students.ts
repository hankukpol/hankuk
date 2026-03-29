export type RegisteredStudentRecord = {
  id: string;
  session_id: string;
  name: string;
  phone: string;
  gender: "남" | "여" | null;
  series: string | null;
  created_at: string;
};

export type StudentRecord = {
  id: string;
  session_id: string;
  phone: string;
  name: string;
  gender: "남" | "여";
  series: string;
  region: string;
  age: number | null;
  score: number | null;
  access_token: string;
  created_at: string;
};

export type StudentSummary = {
  id: string;
  sessionId: string;
  phone: string;
  name: string;
  gender: "남" | "여";
  series: string;
  region: string;
  age: number | null;
  score: number | null;
  accessToken: string;
  createdAt: string;
};

export function serializeStudent(student: StudentRecord): StudentSummary {
  return {
    id: student.id,
    sessionId: student.session_id,
    phone: student.phone,
    name: student.name,
    gender: student.gender,
    series: student.series,
    region: student.region,
    age: student.age,
    score: student.score,
    accessToken: student.access_token,
    createdAt: student.created_at,
  };
}
