import { configurationForDate } from "./academy-configuration-history";
import { managementPolicySchema } from "./management-policy";
import { buildExamPointAwards, parseExamPointAutomation, type ExamPointSource } from "./exam-point-automation";

type Configuration = {
  settings: { examPointAutomation?: unknown; managementPolicy?: unknown };
  pointRules: ExamPointSource["rules"];
  periods: NonNullable<ExamPointSource["periods"]>;
  examTypes: { id: string; category: string; studyTrack?: string | null }[];
};
export type ExamConfigurationHistory = {
  effectiveFrom: string; createdAt: string; status: string; before: Configuration; after?: Configuration;
};

/** Each awarded date uses that academy's configuration; month ranks use month end. */
export function buildVersionedExamPoints(current: Configuration, history: ExamConfigurationHistory[], source: ExamPointSource, month: string, today: string) {
  const dates = new Map<string, Configuration>();
  const end = new Date(`${month}-01T00:00:00Z`); end.setUTCMonth(end.getUTCMonth()+1); end.setUTCDate(0);
  for (let day=1; day<=end.getUTCDate(); day++) { const date=`${month}-${String(day).padStart(2,"0")}`; dates.set(date,configurationForDate(current,history,date)); }
  const variants = Array.from(new Set(dates.values()));
  return variants.flatMap(configuration => {
    const policy = managementPolicySchema.safeParse(configuration.settings.managementPolicy);
    const types = new Map(configuration.examTypes.map(type => [type.id, type]));
    const awards = buildExamPointAwards(parseExamPointAutomation(configuration.settings.examPointAutomation), {
      ...source, rules: configuration.pointRules, periods: configuration.periods,
      morningPeriodId: policy.success && policy.data.morningExam.syncAttendance ? policy.data.morningExam.periodId : null,
      sessions: source.sessions.map(session => {
        const type = types.get(session.examTypeId);
        return type ? { ...session, category: type.category, studyTrack: type.studyTrack } : session;
      }),
    }, month, today);
    return awards.filter(award => dates.get(award.date) === configuration);
  });
}
