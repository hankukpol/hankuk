/** Continue by the actual returned row count, including servers with a lower cap. */
export async function readAllPages<T>(readPage: (offset: number, size: number) => Promise<T[]>): Promise<T[]> {
  const rows: T[] = []
  for (;;) {
    const page = await readPage(rows.length, 1000)
    if (page.length === 0) return rows
    rows.push(...page)
  }
}
