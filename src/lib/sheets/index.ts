export { USE_MOCK } from './client'

export {
  getLeads,
  getLeadById,
  getLeadByIdStrict,
  createLead,
  updateLead,
  deleteLead,
  bulkDeleteLeads,
  bulkUpdateLeads,
  bulkAssignCampaign,
  clearLeadCampaign,
} from './leads'
export { getCompanies, getCompanyById, createCompany, updateCompany, findOrCreateCompanyByName, deleteCompany, mergeCompanies } from './companies'
export {
  getOpportunities,
  getOpportunitiesForLead,
  getOpenUnclaimedOpportunitiesForCompany,
  createOpportunity,
  updateOpportunity,
  deleteOpportunity,
  clearOpportunityCampaign,
} from './opportunities'
export { getResearchFindings, getResearchForLead, saveResearchFinding } from './research'
export { getInteractions, getInteractionsForLead, saveInteraction, deleteInteraction } from './interactions'
export { getAIInsights, getInsightsForLead, saveAIInsight } from './insights'
export { getCampaigns, updateCampaign, createCampaign, deleteCampaign } from './campaigns'
export { saveMeetingPrep, getMeetingPrep } from './meeting-prep'
