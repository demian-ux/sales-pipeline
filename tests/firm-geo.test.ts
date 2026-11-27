// Firm-geography targeting (2026-11-26): "se busca por dónde está la firma, no
// por dónde está el proyecto." The nine cases from the handoff, against gate-0,
// both scoring functions and the signal → firm join.
//
// Run: npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { gate0Reason, regateRow } from '../src/lib/discoveries/gate0'
import { geoFit, geoPoints, regionToGeo, focusGeoRank, FOCUS_FIRM_GEOS } from '../src/lib/discoveries/target-geo'
import { computeOpportunityScore, type OpportunityScoreInput } from '../src/lib/discoveries/opportunity-score'
import { computeIcpFit, type IcpFitInput } from '../src/lib/discoveries/icp'
import { matchPoolFirms, candidateSeedsFromExamples, geoPriority } from '../src/lib/firm-pool/match'

const GEO_POINTS = 5
const FULL = geoPoints('full', GEO_POINTS)
const PARTIAL = geoPoints('partial', GEO_POINTS)

// ── Fixtures ────────────────────────────────────────────────────────────────

interface Case {
  region: string
  country: string
  city: string
  named_firm_geos: string[]
}

const NASHVILLE_NY_DESIGNER: Case = { region: 'US Other', country: 'United States', city: 'Nashville', named_firm_geos: ['nyc'] }
const DENVER_NO_FIRM: Case        = { region: 'US Other', country: 'United States', city: 'Denver', named_firm_geos: [] }
const MIAMI_MIAMI_DEV: Case       = { region: 'Miami', country: 'United States', city: 'Miami', named_firm_geos: ['south_florida'] }
const BRISBANE_AU_ARCH: Case      = { region: 'Other', country: 'Australia', city: 'Brisbane', named_firm_geos: ['other'] }
const TURKS_NO_FIRM: Case         = { region: 'Caribbean', country: 'Turks and Caicos', city: 'Providenciales', named_firm_geos: [] }
const RIYADH_NY_DESIGNER: Case    = { region: 'Middle East', country: 'Saudi Arabia', city: 'Riyadh', named_firm_geos: ['nyc'] }
const CHICAGO_CHICAGO_FIRM: Case  = { region: 'US Other', country: 'United States', city: 'Chicago', named_firm_geos: ['chicago'] }
const PARIS_FRENCH_ARCH: Case     = { region: 'Europe', country: 'France', city: 'Paris', named_firm_geos: ['europe'] }
const LA_LA_ARCH: Case            = { region: 'California', country: 'United States', city: 'Los Angeles', named_firm_geos: ['california'] }

const gate = (c: Case) =>
  gate0Reason({ title: 'New luxury hotel announced', region: c.region, country: c.country, named_firm_geos: c.named_firm_geos })

const fit = (c: Case) => geoFit({ region: c.region, country: c.country, namedFirmGeos: c.named_firm_geos })

// A signal that scores the same on everything but geography, so the geography
// term can be isolated by subtraction.
const OPP_BASE: Omit<OpportunityScoreInput, 'region' | 'country' | 'named_firm_geos'> = {
  segment: 'hospitality',
  creates_design_demand: 'high',
  design_scope: 'mid',
  timing: 'design_ahead',
  targets: 'findable',
  briefs_status: 'unawarded',
  future_work_test: true,
}
const oppScore = (c: Partial<Case>) =>
  computeOpportunityScore({ ...OPP_BASE, region: c.region, country: c.country, named_firm_geos: c.named_firm_geos }).opportunity_score
const oppGeoPoints = (c: Case) => oppScore(c) - oppScore({ region: '', country: '', named_firm_geos: [] })

const ICP_BASE: Omit<IcpFitInput, 'region' | 'country' | 'named_firm_geos'> = {
  signal_type: 'new_development',
  tenure: 'for_sale',
  has_for_sale_residential: true,
  project_stage: 'entitled',
  sector_fit: 'high',
  viz_buyer_role: 'architect',
  est_scale_vs_floor: 'near',
  incumbent_viz: null,
}
const icpScore = (c: Partial<Case>) =>
  computeIcpFit({ ...ICP_BASE, region: c.region, country: c.country, named_firm_geos: c.named_firm_geos }).icp_fit_score
const icpGeoPoints = (c: Case) => icpScore(c) - icpScore({ region: '', country: '', named_firm_geos: [] })

// A small pool: hospitality + experiential firms in every focus geo, plus rows
// that must never be returned.
const POOL = [
  { name: 'NY Hospitality A',   geo: 'nyc',           categories: ['hospitality_design', 'interior_design'], pool_status: 'active' },
  { name: 'NY Experiential',    geo: 'nyc',           categories: ['experiential'],                          pool_status: 'active' },
  { name: 'NY Developer',       geo: 'nyc',           categories: ['development'],                           pool_status: 'active' },
  { name: 'Miami Hospitality',  geo: 'south_florida', categories: ['hospitality_design'],                    pool_status: 'parked' },
  { name: 'LA Hospitality',     geo: 'california',    categories: ['hospitality_design'],                    pool_status: 'active' },
  { name: 'LA Architect',       geo: 'california',    categories: ['architecture'],                          pool_status: 'active' },
  { name: 'Seattle Experiential', geo: 'seattle',     categories: ['experiential'],                          pool_status: 'candidate' },
  { name: 'Chicago Hand-picked', geo: 'chicago',      categories: ['hospitality_design'],                    pool_status: 'active' },
  { name: 'Paris Hospitality',  geo: 'europe',        categories: ['hospitality_design'],                    pool_status: 'active' },
  { name: 'Dallas Hospitality', geo: 'other',         categories: ['hospitality_design'],                    pool_status: 'active' },
  { name: 'NY Excluded',        geo: 'nyc',           categories: ['hospitality_design'],                    pool_status: 'excluded' },
]
const names = (firms: { name: string }[]) => firms.map((f) => f.name)
const join = (c: Case, categories: string[]) =>
  matchPoolFirms(POOL, {
    categories,
    projectGeo: regionToGeo(c.region, c.country, c.city),
    namedFirmGeos: c.named_firm_geos,
  })

// ── The nine cases ──────────────────────────────────────────────────────────

test('hotel in Nashville, designer is a New York firm → passes, full points, NY hospitality firms first', () => {
  const c = NASHVILLE_NY_DESIGNER
  assert.equal(gate(c), null)
  assert.equal(fit(c), 'full')
  assert.equal(oppGeoPoints(c), FULL)
  assert.equal(icpGeoPoints(c), FULL)

  const firms = join(c, ['hospitality_design'])
  assert.equal(firms[0].geo, 'nyc')
  assert.deepEqual(names(firms), ['NY Hospitality A', 'Miami Hospitality', 'LA Hospitality', 'Chicago Hand-picked'])
})

test('airport lounge in Denver, no firm named → passes, partial points, joins hospitality + experiential firms in all focus geos', () => {
  const c = DENVER_NO_FIRM
  assert.equal(gate(c), null)
  assert.equal(fit(c), 'partial')
  assert.equal(oppGeoPoints(c), PARTIAL)
  assert.ok(PARTIAL > 0 && PARTIAL < FULL)

  const firms = join(c, ['hospitality_design', 'experiential'])
  assert.deepEqual(names(firms), [
    'NY Hospitality A', 'NY Experiential', 'Miami Hospitality', 'LA Hospitality', 'Seattle Experiential', 'Chicago Hand-picked',
  ])
  assert.deepEqual([...new Set(firms.map((f) => f.geo))], ['nyc', 'south_florida', 'california', 'seattle', 'chicago'])
})

test('condo tower in Miami, Miami developer → unchanged: passes, full points, South Florida firms first', () => {
  const c = MIAMI_MIAMI_DEV
  assert.equal(gate(c), null)
  assert.equal(fit(c), 'full')
  assert.equal(icpGeoPoints(c), FULL)
  assert.equal(regionToGeo(c.region, c.country, c.city), 'south_florida')
  assert.equal(join(c, ['hospitality_design'])[0].name, 'Miami Hospitality')
})

test('resort in Brisbane, Australian architect → rejected off-geo, score capped tier', () => {
  const c = BRISBANE_AU_ARCH
  assert.equal(gate(c), 'off-geo (Other, Australia)')
  assert.equal(fit(c), 'none')
  assert.equal(oppGeoPoints(c), 0)
})

test('resort in Turks and Caicos, no firm named → passes, partial points, joins hospitality firms in focus geos', () => {
  const c = TURKS_NO_FIRM
  assert.equal(gate(c), null)
  assert.equal(fit(c), 'partial')
  assert.equal(oppGeoPoints(c), PARTIAL)
  assert.deepEqual(names(join(c, ['hospitality_design'])), [
    'NY Hospitality A', 'Miami Hospitality', 'LA Hospitality', 'Chicago Hand-picked',
  ])
})

test('hotel in Riyadh, designer is a New York firm → passes, full points', () => {
  const c = RIYADH_NY_DESIGNER
  assert.equal(gate(c), null)
  assert.equal(fit(c), 'full')
  assert.equal(oppGeoPoints(c), FULL)
  assert.equal(regionToGeo(c.region, c.country, c.city), 'middle_east')
})

test('hotel in Chicago, Chicago firm not hand-picked → passes as a US project, joins focus-geo firms, firm is not added to the pool', () => {
  const c = CHICAGO_CHICAGO_FIRM
  assert.equal(gate(c), null)
  assert.equal(fit(c), 'partial')            // a Chicago HQ does not earn full points by itself
  assert.equal(regionToGeo(c.region, c.country, c.city), 'chicago')

  const firms = join(c, ['hospitality_design'])
  assert.equal(firms[0].name, 'Chicago Hand-picked')   // the hand-picked pool firm leads: same geo as the project
  assert.ok(names(firms).includes('NY Hospitality A'))

  const { seeds, skipped } = candidateSeedsFromExamples([{ firm: 'Some Chicago Studio', hq_geo: 'chicago' }], 'chicago')
  assert.deepEqual(seeds, [])
  assert.equal(skipped[0].name, 'Some Chicago Studio')
})

test('mixed-use in Paris, French architect → no longer in target', () => {
  const c = PARIS_FRENCH_ARCH
  assert.equal(gate(c), 'off-geo (Europe, France)')
  assert.equal(fit(c), 'none')
  assert.equal(icpGeoPoints(c), 0)
  assert.equal(oppGeoPoints(c), 0)
  // Legacy rows still carry region 'France' — same verdict.
  assert.equal(geoFit({ region: 'France', country: 'France' }), 'none')
  // The europe geo value survives for existing clients; a manual ?geo=europe run still works.
  assert.equal(regionToGeo(c.region, c.country, c.city), 'europe')
  assert.deepEqual(
    names(matchPoolFirms(POOL, { categories: ['hospitality_design'], overrideGeo: 'europe' })),
    ['Paris Hospitality'],
  )
})

test('residential in Los Angeles, Los Angeles architect → passes, project geo california, California firms first', () => {
  const c = LA_LA_ARCH
  assert.equal(gate(c), null)
  assert.equal(fit(c), 'full')
  assert.equal(regionToGeo(c.region, c.country, c.city), 'california')
  const firms = join(c, ['architecture', 'hospitality_design'])
  assert.deepEqual(names(firms).slice(0, 2), ['LA Hospitality', 'LA Architect'])
  assert.equal(firms[2].geo, 'nyc')
})

// ── Rules around the cases ──────────────────────────────────────────────────

test('a non-US project outside the Caribbean / Middle East passes only with a named open-focus firm', () => {
  assert.equal(gate0Reason({ region: 'Europe', country: 'Portugal', named_firm_geos: ['nyc'] }), null)
  assert.equal(gate0Reason({ region: 'Europe', country: 'Portugal', named_firm_geos: ['california'] }), null)
  assert.match(gate0Reason({ region: 'Europe', country: 'Portugal', named_firm_geos: ['chicago'] }) ?? '', /^off-geo/)
  assert.match(gate0Reason({ region: 'Europe', country: 'Portugal', named_firm_geos: ['unknown'] }) ?? '', /^off-geo/)
  assert.match(gate0Reason({ region: 'Other', country: 'Thailand', named_firm_geos: [] }) ?? '', /^off-geo/)
})

test('the country allow-lists still decide abroad: Egypt stays out, Dubai and the Bahamas stay in', () => {
  assert.match(gate0Reason({ region: 'Middle East', country: 'Egypt' }) ?? '', /^off-geo/)
  assert.equal(gate0Reason({ region: 'Middle East', country: 'United Arab Emirates' }), null)
  assert.equal(gate0Reason({ region: 'Caribbean', country: 'Bahamas' }), null)
  assert.equal(gate0Reason({ region: 'Other', country: 'Bahamas' }), null)   // legacy label
})

test('non-geography gate-0 rules are untouched and now reach US rows', () => {
  assert.equal(
    gate0Reason({ title: 'Extended-stay hotel planned in Dallas', region: 'US Other', country: 'United States' }),
    'midscale/economy/hostel hospitality',
  )
  assert.equal(
    gate0Reason({ title: 'Tower tops out in Manhattan', region: 'New York', country: 'United States' }),
    'construction-progress without launch',
  )
})

test('legacy rows (region "Other" + a US country, no named_firms) flip on re-triage; other non-US rows do not', () => {
  assert.equal(regateRow({ title: 'Luxury hotel announced in Dallas', region: 'Other', country: 'United States' }), null)
  assert.equal(regateRow({ title: 'Luxury hotel announced in Austin', region: 'Other', country: 'USA' }), null)
  assert.match(regateRow({ title: 'Resort announced', region: 'Other', country: 'Australia' }) ?? '', /^off-geo/)
  assert.match(regateRow({ title: 'Hotel announced', region: 'Europe', country: 'Spain' }) ?? '', /^off-geo/)
  assert.equal(
    regateRow({ title: 'Student housing tower in Ohio', region: 'Other', country: 'United States' }),
    'student housing / EB-5',
  )
})

test('Puerto Rico counts as a US project; Mexico stays out', () => {
  assert.equal(gate0Reason({ region: 'Caribbean', country: 'Puerto Rico' }), null)
  assert.equal(geoFit({ region: 'Caribbean', country: 'Puerto Rico' }), 'partial')
  assert.match(gate0Reason({ region: 'Other', country: 'Mexico' }) ?? '', /^off-geo/)
})

test('a row with no region is not rejected on geography', () => {
  assert.equal(gate0Reason({ title: 'New flagship hotel', region: '', country: '' }), null)
})

test('focus geo order: New York, South Florida, California, Seattle, then Chicago and DC', () => {
  assert.deepEqual([...FOCUS_FIRM_GEOS], ['nyc', 'south_florida', 'california', 'seattle', 'chicago', 'dc'])
  const sorted = ['europe', 'dc', 'california', 'other', 'nyc', 'seattle', 'south_florida', 'chicago']
    .sort((a, b) => focusGeoRank(a) - focusGeoRank(b))
  assert.deepEqual(sorted.slice(0, 6), ['nyc', 'south_florida', 'california', 'seattle', 'chicago', 'dc'])
  assert.deepEqual(geoPriority({ projectGeo: 'other', namedFirmGeos: [] }), [...FOCUS_FIRM_GEOS])
  assert.deepEqual(geoPriority({ projectGeo: 'california', namedFirmGeos: ['nyc'] }).slice(0, 2), ['california', 'nyc'])
})

test('inside one geo, level A firms come before B, then unrated, then C', () => {
  const pool = [
    { name: 'NY C', geo: 'nyc', categories: ['hospitality_design'], pool_status: 'parked', fit_level: 'C' },
    { name: 'NY unrated', geo: 'nyc', categories: ['hospitality_design'], pool_status: 'active' },
    { name: 'NY B', geo: 'nyc', categories: ['hospitality_design'], pool_status: 'parked', fit_level: 'B' },
    { name: 'Miami A', geo: 'south_florida', categories: ['hospitality_design'], pool_status: 'parked', fit_level: 'A' },
    { name: 'NY A', geo: 'nyc', categories: ['hospitality_design'], pool_status: 'parked', fit_level: 'A' },
  ]
  const out = matchPoolFirms(pool, { categories: ['hospitality_design'], projectGeo: 'nyc' })
  assert.deepEqual(names(out), ['NY A', 'NY B', 'NY unrated', 'NY C', 'Miami A'])
})

test('example firms enter the pool under their own HQ geo, never the project geo', () => {
  const { seeds, skipped } = candidateSeedsFromExamples(
    [
      { firm: 'NY Studio', hq_geo: 'nyc' },
      { firm: 'LA Studio', hq_geo: 'california' },
      { firm: 'Dallas Studio', hq_geo: 'other' },
      { firm: 'Mystery Studio', hq_geo: 'unknown' },
      { firm: 'DC Studio', hq_geo: 'dc' },
      { firm: 'ny studio', hq_geo: 'nyc' },          // duplicate by name
    ],
    'other',                                          // a Nashville project
  )
  assert.deepEqual(seeds, [{ name: 'NY Studio', geo: 'nyc' }, { name: 'LA Studio', geo: 'california' }])
  assert.deepEqual(skipped.map((s) => s.name), ['Dallas Studio', 'Mystery Studio', 'DC Studio'])
})

test('example firms on pre-change rows (no hq_geo) fall back to the signal geo, focus geos only', () => {
  assert.deepEqual(candidateSeedsFromExamples([{ firm: 'Old NY Example' }], 'nyc').seeds, [{ name: 'Old NY Example', geo: 'nyc' }])
  assert.deepEqual(candidateSeedsFromExamples([{ firm: 'Old Paris Example' }], 'europe').seeds, [])
  assert.deepEqual(candidateSeedsFromExamples([{ firm: 'Old Example' }], 'other').seeds, [])
})
