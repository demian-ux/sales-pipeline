import { redirect } from 'next/navigation'

// Legacy URL — the research inbox now lives at /research.
export default function ResearchInboxPage() {
  redirect('/research')
}
