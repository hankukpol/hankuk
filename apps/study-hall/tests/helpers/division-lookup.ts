/**
 * 서비스들이 학원 조회를 공용 getDivisionBySlugOrThrow(@/lib/service-helpers)로 한다(2026-10-07 리팩토링).
 * service-helpers 를 가짜로 바꾼 테스트는 이 함수로 감싸면, 같은 가짜 DB(getPrismaClient)로 학원을 찾는 조회가 더해진다.
 */
type HelperMock = { getPrismaClient?: () => Promise<unknown>; getDivisionBySlugOrThrow?: unknown; [key: string]: unknown };
type DivisionDelegate = { division?: { findUnique?: (args: unknown) => Promise<unknown>; findFirst?: (args: unknown) => Promise<unknown> } };

export function withDivisionLookup<T extends HelperMock>(helpers: T): T {
  if (helpers.getDivisionBySlugOrThrow) return helpers;
  return {
    ...helpers,
    getDivisionBySlugOrThrow: async (slug: string) => {
      const prisma = (await helpers.getPrismaClient?.()) as DivisionDelegate | undefined;
      const lookup = prisma?.division?.findUnique ?? prisma?.division?.findFirst;
      const division = lookup ? await lookup.call(prisma!.division, { where: { slug } }) : null;
      if (!division) throw new Error("지점 정보를 찾을 수 없습니다.");
      return division;
    },
  };
}
