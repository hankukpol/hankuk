/** Read ordered PostgREST pages without treating the server row cap as EOF. */
export async function readPaymentPages<T>(
  readPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  maxRows = Infinity,
): Promise<T[]> {
  const rows: T[] = []
  while (rows.length < maxRows) {
    const to = rows.length + Math.min(1000, maxRows - rows.length) - 1
    const { data, error } = await readPage(rows.length, to)
    if (error) throw error
    if (!data?.length) break
    rows.push(...data)
  }
  return rows
}
