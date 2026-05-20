export { USE_MOCK } from './client'

export { getLeads, getLeadById, createLead, updateLead } from './leads'
export { getCompanies, getCompanyById, createCompany } from './companies'
export {
  getOpportunities,
  getOpportunitiesForLead,
  createOpportunity,
  updateOpportunity,
} from './opportunities'
export { getResearchFindings, getResearchForLead, saveResearchFinding } from './research'
export { getInteractions, getInteractionsForLead, saveInteraction } from './interactions'
export { getAIInsights, getInsightsForLead, saveAIInsight } from './insights'
export { getCampaigns, updateCampaign, createCampaign } from './campaigns'
export { saveMeetingPrep, getMeetingPrep } from './meeting-prep'
