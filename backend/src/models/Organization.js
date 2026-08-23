const mongoose = require('mongoose');

const ORG_TYPES = [
  'donor',
  'government',
  'un-agency',
  'international-ngo',
  'national-ngo',
  'civil-society',
  'community-based',
  'faith-based',
  'private-sector',
  'academia',
  'red-cross-red-crescent',
  'umbrella-network',
  'professional-association',
  'sports-cultural-club',
  'foundation-trust',
  'cooperative',
  'volunteer-youth-movement',
  'other',
];

const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    acronym: { type: String, trim: true },
    // Organization type — donors appear first in funding-source pickers.
    type: { type: String, enum: ORG_TYPES, default: 'civil-society' },
    aim: { type: String, trim: true },
    // Source directory dates are inconsistent ("1998", "2015, 17 August") — kept verbatim.
    dateFounded: { type: String, trim: true },
    chairperson: { type: String, trim: true },
    emails: [{ type: String, trim: true }],
    phones: [{ type: String, trim: true }],
    postalAddress: { type: String, trim: true },
    physicalAddress: { type: String, trim: true },
    // Public-facing blurb; `aim` stays the formal directory aim.
    description: { type: String, trim: true },
    // Office point for map presence — same {lat,lng} shape as Location.centroid.
    location: {
      lat: { type: Number },
      lng: { type: Number },
    },
    webpage: { type: String, trim: true },
    // National CSO register fields (REV1): commission stays the PRIMARY sector.
    registrationNo: { type: String, trim: true },
    hqDistrict: { type: mongoose.Schema.Types.ObjectId, ref: 'Location' },
    contactPerson: { type: String, trim: true },
    notes: { type: String, trim: true },
    otherSectors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Sector' }],
    commission: { type: mongoose.Schema.Types.ObjectId, ref: 'Sector' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Organization', organizationSchema);
module.exports.ORG_TYPES = ORG_TYPES;
