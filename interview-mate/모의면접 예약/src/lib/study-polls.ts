export type StudyPollOption = {
  id: string;
  label: string;
};

export type StudyPollSummary = {
  id: string;
  title: string;
  isClosed: boolean;
  createdAt: string;
  createdByStudentId: string | null;
  createdByName: string;
  canManage: boolean;
  selectedOptionIds: string[];
  options: Array<{
    id: string;
    label: string;
    voteCount: number;
    voterNames: string[];
    voted: boolean;
  }>;
};

type PollRecord = {
  id: string;
  title: string;
  options: unknown;
  is_closed: boolean;
  created_at: string;
  created_by: string | null;
};

type VoteRecord = {
  poll_id: string;
  student_id: string;
  selected_options: unknown;
};

export function normalizeStudyPollOptions(raw: unknown): StudyPollOption[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const candidate = entry as {
        id?: unknown;
        label?: unknown;
      };
      const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
      const label =
        typeof candidate.label === "string" ? candidate.label.trim() : "";

      if (!label) {
        return null;
      }

      return {
        id: id || `option-${index + 1}`,
        label,
      } satisfies StudyPollOption;
    })
    .filter((entry): entry is StudyPollOption => Boolean(entry));
}

function normalizeSelectedOptions(raw: unknown) {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

export function serializeStudyPolls(args: {
  polls: PollRecord[];
  votes: VoteRecord[];
  studentNameMap: Map<string, string>;
  viewerStudentId: string;
  canManage: boolean;
}) {
  const votesByPoll = new Map<string, VoteRecord[]>();

  for (const vote of args.votes) {
    const current = votesByPoll.get(vote.poll_id) ?? [];
    current.push(vote);
    votesByPoll.set(vote.poll_id, current);
  }

  return args.polls.map((poll) => {
    const options = normalizeStudyPollOptions(poll.options);
    const pollVotes = votesByPoll.get(poll.id) ?? [];
    const viewerVote = pollVotes.find(
      (vote) => vote.student_id === args.viewerStudentId,
    );
    const selectedOptionIds = viewerVote
      ? normalizeSelectedOptions(viewerVote.selected_options)
      : [];

    return {
      id: poll.id,
      title: poll.title,
      isClosed: poll.is_closed,
      createdAt: poll.created_at,
      createdByStudentId: poll.created_by,
      createdByName: poll.created_by
        ? args.studentNameMap.get(poll.created_by) ?? "학생"
        : "학생",
      canManage: args.canManage,
      selectedOptionIds,
      options: options.map((option) => {
        const voters = pollVotes.filter((vote) =>
          normalizeSelectedOptions(vote.selected_options).includes(option.id),
        );

        return {
          id: option.id,
          label: option.label,
          voteCount: voters.length,
          voterNames: voters.map(
            (vote) => args.studentNameMap.get(vote.student_id) ?? "학생",
          ),
          voted: selectedOptionIds.includes(option.id),
        };
      }),
    } satisfies StudyPollSummary;
  });
}
