export type RoomRecord = {
  id: string;
  session_id: string;
  room_name: string | null;
  invite_code: string;
  status: "recruiting" | "formed" | "closed";
  creator_student_id: string | null;
  created_by_admin: boolean;
  max_members: number;
  request_extra_members: number;
  request_extra_reason: string | null;
  created_at: string;
};

export type RoomSummary = {
  id: string;
  sessionId: string;
  roomName: string | null;
  inviteCode: string;
  status: "recruiting" | "formed" | "closed";
  creatorStudentId: string | null;
  createdByAdmin: boolean;
  maxMembers: number;
  requestExtraMembers: number;
  requestExtraReason: string | null;
  createdAt: string;
};

export function serializeRoom(room: RoomRecord): RoomSummary {
  return {
    id: room.id,
    sessionId: room.session_id,
    roomName: room.room_name,
    inviteCode: room.invite_code,
    status: room.status,
    creatorStudentId: room.creator_student_id,
    createdByAdmin: room.created_by_admin,
    maxMembers: room.max_members,
    requestExtraMembers: room.request_extra_members,
    requestExtraReason: room.request_extra_reason,
    createdAt: room.created_at,
  };
}
