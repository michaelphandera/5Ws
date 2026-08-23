// Organization types — must match the enum in backend/src/models/Organization.js.
export const ORG_TYPES = [
  { value: 'donor', label: 'Donor' },
  { value: 'government', label: 'Government' },
  { value: 'un-agency', label: 'UN Agency' },
  { value: 'international-ngo', label: 'International NGO' },
  { value: 'national-ngo', label: 'National NGO' },
  { value: 'civil-society', label: 'Civil Society Organization' },
  { value: 'community-based', label: 'Community-Based Organization' },
  { value: 'faith-based', label: 'Faith-Based Organization' },
  { value: 'private-sector', label: 'Private Sector' },
  { value: 'academia', label: 'Academia / Research' },
  { value: 'red-cross-red-crescent', label: 'Red Cross / Red Crescent' },
  { value: 'umbrella-network', label: 'Umbrella body / Network' },
  { value: 'professional-association', label: 'Professional Association' },
  { value: 'sports-cultural-club', label: 'Sports / Cultural Club' },
  { value: 'foundation-trust', label: 'Foundation / Trust' },
  { value: 'cooperative', label: 'Cooperative' },
  { value: 'volunteer-youth-movement', label: 'Volunteer / Youth Movement' },
  { value: 'other', label: 'Other' },
];

export const orgTypeLabel = (value) =>
  ORG_TYPES.find((t) => t.value === value)?.label || value || '—';
