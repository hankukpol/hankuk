import { createServerSupabaseClient } from "@/lib/supabase/server";

type MemberRole = "creator" | "leader" | "member";

type RemainingMemberRow = {
  id: string;
  role: MemberRole;
  joined_at: string;
  student_id: string;
};

type RemoveJoinedMemberOptions = {
  roomId: string;
  sessionId: string;
  membershipId: string;
  studentId: string;
  studentName: string;
  role: MemberRole;
  noticeMessage: string;
  moveToWaitingPool?: boolean;
};

type DissolveRoomOptions = {
  roomId: string;
  sessionId: string;
  members: Array<{
    id: string;
    studentId: string;
    name: string;
  }>;
  noticeMessage: string;
};

export async function removeJoinedMemberFromRoom({
  roomId,
  sessionId,
  membershipId,
  studentId,
  studentName,
  role,
  noticeMessage,
  moveToWaitingPool = true,
}: RemoveJoinedMemberOptions) {
  const supabase = createServerSupabaseClient();

  const { error: leaveError } = await supabase
    .from("room_members")
    .update({
      status: "left",
      left_at: new Date().toISOString(),
    })
    .eq("id", membershipId);

  if (leaveError) {
    throw leaveError;
  }

  const { data: remainingMembers, error: remainingMembersError } = await supabase
    .from("room_members")
    .select("id, role, joined_at, student_id")
    .eq("room_id", roomId)
    .eq("status", "joined")
    .order("joined_at", { ascending: true });

  if (remainingMembersError) {
    throw remainingMembersError;
  }

  const nextMembers = (remainingMembers ?? []) as RemainingMemberRow[];

  if (role === "creator" && nextMembers.length > 0) {
    await supabase
      .from("room_members")
      .update({ role: "creator" })
      .eq("id", nextMembers[0].id);

    await supabase
      .from("group_rooms")
      .update({ creator_student_id: nextMembers[0].student_id })
      .eq("id", roomId);
  } else if (role === "leader" && nextMembers.length > 0) {
    const nextLeader =
      nextMembers.find((member) => member.role !== "creator") ?? nextMembers[0];

    await supabase
      .from("room_members")
      .update({ role: "leader" })
      .eq("id", nextLeader.id);
  }

  if (nextMembers.length === 0) {
    await supabase
      .from("group_rooms")
      .update({
        status: "closed",
        creator_student_id: null,
        request_extra_members: 0,
        request_extra_reason: null,
      })
      .eq("id", roomId);
  }

  if (moveToWaitingPool) {
    await Promise.all([
      supabase.from("chat_messages").insert({
        room_id: roomId,
        student_id: null,
        message: noticeMessage,
        is_system: true,
      }),
      supabase.from("waiting_pool").upsert(
        {
          session_id: sessionId,
          student_id: studentId,
          assigned_room_id: null,
        },
        {
          onConflict: "session_id,student_id",
        },
      ),
    ]);
  } else {
    await supabase.from("chat_messages").insert({
      room_id: roomId,
      student_id: null,
      message: noticeMessage,
      is_system: true,
    });
  }

  return {
    roomId,
    studentId,
    studentName,
    remainingCount: nextMembers.length,
  };
}

export async function dissolveRoom({
  roomId,
  sessionId,
  members,
  noticeMessage,
}: DissolveRoomOptions) {
  const supabase = createServerSupabaseClient();
  const leftAt = new Date().toISOString();

  if (members.length > 0) {
    const membershipIds = members.map((member) => member.id);
    const studentIds = members.map((member) => member.studentId);

    const { error: membersError } = await supabase
      .from("room_members")
      .update({
        status: "left",
        left_at: leftAt,
      })
      .in("id", membershipIds);

    if (membersError) {
      throw membersError;
    }

    const waitingRows = studentIds.map((studentId) => ({
      session_id: sessionId,
      student_id: studentId,
      assigned_room_id: null,
    }));

    const { error: waitingError } = await supabase
      .from("waiting_pool")
      .upsert(waitingRows, {
        onConflict: "session_id,student_id",
      });

    if (waitingError) {
      throw waitingError;
    }
  }

  const { error: roomError } = await supabase
    .from("group_rooms")
    .update({
      status: "closed",
      creator_student_id: null,
      request_extra_members: 0,
      request_extra_reason: null,
    })
    .eq("id", roomId);

  if (roomError) {
    throw roomError;
  }

  const { error: chatError } = await supabase.from("chat_messages").insert({
    room_id: roomId,
    student_id: null,
    message: noticeMessage,
    is_system: true,
  });

  if (chatError) {
    throw chatError;
  }

  return {
    roomId,
    movedCount: members.length,
  };
}
