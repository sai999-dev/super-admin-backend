/**
 * Territory Service
 * Helper functions for managing territories in agencies.territories JSONB field
 * Date: 2025-11-10
 */

const supabase = require('../config/supabaseClient');
const crypto = require('crypto');

/**
 * Get all territories for an agency
 * @param {string} agencyId - Agency UUID
 * @param {object} filters - Optional filters (type, state, isActive, search)
 * @returns {Promise<Array>} Array of territory objects
 */
async function getAgencyTerritories(agencyId, filters = {}) {
  const { data: agency, error } = await supabase
    .from('agencies')
    .select('territories')
    .eq('id', agencyId)
    .single();

  if (error) throw error;
  if (!agency) return [];

  let territories = agency.territories || [];

  // Apply filters
  if (filters.isActive !== undefined) {
    territories = territories.filter(t => 
      t.is_active === filters.isActive && !t.deleted_at
    );
  } else {
    // Default: only active, non-deleted
    territories = territories.filter(t => t.is_active && !t.deleted_at);
  }

  if (filters.type) {
    territories = territories.filter(t => t.type === filters.type);
  }

  if (filters.state) {
    territories = territories.filter(t => t.state === filters.state);
  }

  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    territories = territories.filter(t => 
      (t.value && t.value.toLowerCase().includes(searchLower)) ||
      (t.city && t.city.toLowerCase().includes(searchLower)) ||
      (t.zipcode && t.zipcode.toLowerCase().includes(searchLower))
    );
  }

  return territories;
}

/**
 * Add a territory to an agency
 * @param {string} agencyId - Agency UUID
 * @param {object} territoryData - Territory data {type, value, state, county, city, zipcode, priority, subscription_id}
 * @returns {Promise<object>} Created territory object
 */
async function addTerritory(agencyId, territoryData) {
  const { type, value, state, county, city, zipcode, priority, subscription_id, metadata } = territoryData;

  // Validation
  if (!type || !value) {
    throw new Error('Territory type and value are required');
  }

  if (!['zipcode', 'city', 'county', 'state'].includes(type)) {
    throw new Error('Invalid territory type');
  }

  // Fetch current agency data
  const { data: agency, error: fetchError } = await supabase
    .from('agencies')
    .select('id, territories, territory_count, territory_limit')
    .eq('id', agencyId)
    .single();

  if (fetchError) throw fetchError;

  const currentTerritories = agency.territories || [];

  // Check if territory already exists
  const exists = currentTerritories.some(t => 
    t.type === type && 
    t.value === value && 
    t.is_active && 
    !t.deleted_at
  );

  if (exists) {
    throw new Error('Territory already exists');
  }

  // Check territory limit
  const activeCount = currentTerritories.filter(t => t.is_active && !t.deleted_at).length;
  if (agency.territory_limit > 0 && activeCount >= agency.territory_limit) {
    throw new Error(`Territory limit reached. Maximum: ${agency.territory_limit}`);
  }

  // Create new territory object
  const newTerritory = {
    id: crypto.randomUUID(),
    type,
    value,
    state: state || null,
    county: county || null,
    city: city || null,
    zipcode: zipcode || (type === 'zipcode' ? value : null),
    is_active: true,
    priority: priority || 0,
    subscription_id: subscription_id || null,
    added_at: new Date().toISOString(),
    metadata: metadata || {}
  };

  // Add to territories array
  const updatedTerritories = [...currentTerritories, newTerritory];

  // Update agency
  const { error: updateError } = await supabase
    .from('agencies')
    .update({ territories: updatedTerritories })
    .eq('id', agencyId);

  if (updateError) throw updateError;

  return newTerritory;
}

/**
 * Update a territory
 * @param {string} agencyId - Agency UUID
 * @param {string} territoryId - Territory ID
 * @param {object} updates - Fields to update
 * @returns {Promise<object>} Updated territory object
 */
async function updateTerritory(agencyId, territoryId, updates) {
  // Fetch current agency data
  const { data: agency, error: fetchError } = await supabase
    .from('agencies')
    .select('id, territories')
    .eq('id', agencyId)
    .single();

  if (fetchError) throw fetchError;

  let territories = agency.territories || [];
  const territoryIndex = territories.findIndex(t => t.id === territoryId);

  if (territoryIndex === -1) {
    throw new Error('Territory not found');
  }

  // Update territory
  territories[territoryIndex] = {
    ...territories[territoryIndex],
    ...updates,
    updated_at: new Date().toISOString()
  };

  // Update agency
  const { error: updateError } = await supabase
    .from('agencies')
    .update({ territories })
    .eq('id', agencyId);

  if (updateError) throw updateError;

  return territories[territoryIndex];
}

/**
 * Remove (soft delete) a territory
 * @param {string} agencyId - Agency UUID
 * @param {string} territoryId - Territory ID
 * @returns {Promise<boolean>} Success status
 */
async function removeTerritory(agencyId, territoryId) {
  // Fetch current agency data
  const { data: agency, error: fetchError } = await supabase
    .from('agencies')
    .select('id, territories')
    .eq('id', agencyId)
    .single();

  if (fetchError) throw fetchError;

  let territories = agency.territories || [];
  const territoryIndex = territories.findIndex(t => t.id === territoryId);

  if (territoryIndex === -1) {
    throw new Error('Territory not found');
  }

  // Soft delete
  territories[territoryIndex].is_active = false;
  territories[territoryIndex].deleted_at = new Date().toISOString();

  // Update agency
  const { error: updateError } = await supabase
    .from('agencies')
    .update({ territories })
    .eq('id', agencyId);

  if (updateError) throw updateError;

  return true;
}

/**
 * Check if agency has a specific territory
 * @param {string} agencyId - Agency UUID
 * @param {string} type - Territory type
 * @param {string} value - Territory value
 * @returns {Promise<boolean>} True if territory exists and is active
 */
async function hasTerritory(agencyId, type, value) {
  const { data: agency, error } = await supabase
    .from('agencies')
    .select('territories')
    .eq('id', agencyId)
    .single();

  if (error) return false;

  const territories = agency.territories || [];
  return territories.some(t => 
    t.is_active && 
    !t.deleted_at && 
    t.type === type && 
    t.value === value
  );
}

/**
 * Get all agencies with territories (for admin views)
 * @param {object} options - Query options {page, limit, sortBy, sortOrder, filters}
 * @returns {Promise<object>} {agencies, total, page, limit}
 */
async function getAllAgenciesWithTerritories(options = {}) {
  const {
    page = 1,
    limit = 25,
    sortBy = 'territory_count',
    sortOrder = 'DESC',
    filters = {}
  } = options;

  const offset = (page - 1) * limit;

  let query = supabase
    .from('agencies')
    .select('id, business_name, email, status, territories, territory_count, territory_limit, created_at', { count: 'exact' })
    .order(sortBy, { ascending: sortOrder === 'ASC' })
    .range(offset, offset + limit - 1);

  // Apply filters
  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  if (filters.hasTerritoriesOnly) {
    query = query.gt('territory_count', 0);
  }

  const { data, error, count } = await query;

  if (error) throw error;

  return {
    agencies: data || [],
    total: count || 0,
    page,
    limit
  };
}

/**
 * Search territories across all agencies
 * @param {object} searchParams - {type, value, state, city, zipcode}
 * @returns {Promise<Array>} Array of {agency, territory} objects
 */
async function searchTerritoriesAcrossAgencies(searchParams) {
  const { type, value, state, city, zipcode } = searchParams;

  const { data: agencies, error } = await supabase
    .from('agencies')
    .select('id, business_name, email, territories')
    .gt('territory_count', 0);

  if (error) throw error;

  const results = [];

  (agencies || []).forEach(agency => {
    const territories = agency.territories || [];
    territories.forEach(territory => {
      if (!territory.is_active || territory.deleted_at) return;

      let matches = true;
      if (type && territory.type !== type) matches = false;
      if (value && territory.value !== value) matches = false;
      if (state && territory.state !== state) matches = false;
      if (city && territory.city !== city) matches = false;
      if (zipcode && territory.zipcode !== zipcode) matches = false;

      if (matches) {
        results.push({
          agency: {
            id: agency.id,
            business_name: agency.business_name,
            email: agency.email
          },
          territory
        });
      }
    });
  });

  return results;
}

/**
 * Bulk update territory limits for agencies
 * @param {Array} updates - Array of {agencyId, territoryLimit}
 * @returns {Promise<number>} Number of agencies updated
 */
async function bulkUpdateTerritoryLimits(updates) {
  let updateCount = 0;

  for (const { agencyId, territoryLimit } of updates) {
    const { error } = await supabase
      .from('agencies')
      .update({ territory_limit: territoryLimit })
      .eq('id', agencyId);

    if (!error) updateCount++;
  }

  return updateCount;
}

/**
 * Get territory statistics
 * @returns {Promise<object>} Statistics object
 */
async function getTerritoryStatistics() {
  const { data: agencies, error } = await supabase
    .from('agencies')
    .select('territories, territory_count');

  if (error) throw error;

  const stats = {
    totalAgenciesWithTerritories: 0,
    totalTerritories: 0,
    totalActiveTerritories: 0,
    territoriesByType: {
      zipcode: 0,
      city: 0,
      county: 0,
      state: 0
    },
    averageTerritoriesPerAgency: 0
  };

  let totalCount = 0;

  (agencies || []).forEach(agency => {
    const territories = agency.territories || [];
    const activeTerritories = territories.filter(t => t.is_active && !t.deleted_at);

    if (activeTerritories.length > 0) {
      stats.totalAgenciesWithTerritories++;
      totalCount += activeTerritories.length;
    }

    stats.totalTerritories += territories.length;
    stats.totalActiveTerritories += activeTerritories.length;

    activeTerritories.forEach(t => {
      if (t.type && stats.territoriesByType[t.type] !== undefined) {
        stats.territoriesByType[t.type]++;
      }
    });
  });

  if (stats.totalAgenciesWithTerritories > 0) {
    stats.averageTerritoriesPerAgency = (totalCount / stats.totalAgenciesWithTerritories).toFixed(2);
  }

  return stats;
}

module.exports = {
  getAgencyTerritories,
  addTerritory,
  updateTerritory,
  removeTerritory,
  hasTerritory,
  getAllAgenciesWithTerritories,
  searchTerritoriesAcrossAgencies,
  bulkUpdateTerritoryLimits,
  getTerritoryStatistics
};
