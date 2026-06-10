import type { CampaignCadence } from '@/lib/types'

// Proposes the next follow-up date after an outbound touch, based on the
// lead's campaign cadence. 'Twice weekly' maps to the cold-outreach rhythm:
// the next Tuesday or Thursday, never same-day.

export function nextTueOrThu(from: Date = new Date()): string {
  const d = new Date(from)
  do {
    d.setDate(d.getDate() + 1)
  } while (d.getDay() !== 2 && d.getDay() !== 4)
  return d.toISOString().slice(0, 10)
}

export function nextFollowupDate(
  cadence: CampaignCadence | undefined,
  from: Date = new Date(),
): string {
  if (cadence === 'Twice weekly') return nextTueOrThu(from)
  const d = new Date(from)
  switch (cadence) {
    case 'Daily':
      d.setDate(d.getDate() + 1)
      break
    case 'Bi-weekly':
      d.setDate(d.getDate() + 14)
      break
    case 'Monthly':
      d.setDate(d.getDate() + 30)
      break
    case 'Quarterly':
      d.setDate(d.getDate() + 91)
      break
    case 'Weekly':
    default:
      d.setDate(d.getDate() + 7)
  }
  return d.toISOString().slice(0, 10)
}
