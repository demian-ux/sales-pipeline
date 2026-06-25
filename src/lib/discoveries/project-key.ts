// Project-level dedup key, shared by the ingestion processor and the backfill.
// normalize(project_name) + '|' + normalize(city). Only built when the analyzer
// named a real development — without a named project we don't risk collapsing
// distinct deals from the same developer/city.

export function makeProjectKey(projectName: string | null, city: string | null | undefined): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  const name = projectName ? norm(projectName) : ''
  if (name.length < 3) return null
  const c = city ? norm(city) : ''
  return c ? `${name}|${c}` : name
}
