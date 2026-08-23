/* Migration (safe to re-run): rename "Persons with Disabilities" -> "Special Needs".
   Run BEFORE `node seed/seed.js`, from the backend/ directory — the seed upserts
   BeneficiaryGroup by name and would otherwise insert a duplicate "Special Needs"
   group next to the old one.

   Only LABELS change. The DisaggregationCategory key ("pwd") and HXL attribute
   ("+disabled") stay stable: keys are field names inside stored Activity
   disaggregation maps and must never be renamed. */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const DisaggregationCategory = require('../src/models/DisaggregationCategory');
const BeneficiaryGroup = require('../src/models/BeneficiaryGroup');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fivews');
  console.log('Connected to MongoDB');

  const cat = await DisaggregationCategory.updateOne(
    { key: 'pwd', label: 'Persons with Disabilities' },
    { $set: { label: 'Special Needs' } }
  );
  console.log(`DisaggregationCategory "pwd" relabeled to "Special Needs": ${cat.modifiedCount}`);

  // Guard against a duplicate created by a seed that ran before this migration:
  // if both names exist, fold the old group into the new one on activities.
  const oldGrp = await BeneficiaryGroup.findOne({ name: 'Persons with Disabilities' });
  const newGrp = await BeneficiaryGroup.findOne({ name: 'Special Needs' });
  if (oldGrp && newGrp) {
    const Activity = require('../src/models/Activity');
    const moved = await Activity.updateMany(
      { 'beneficiaries.group': oldGrp._id },
      { $set: { 'beneficiaries.$[b].group': newGrp._id } },
      { arrayFilters: [{ 'b.group': oldGrp._id }] }
    );
    await BeneficiaryGroup.deleteOne({ _id: oldGrp._id });
    console.log(`Duplicate group folded into "Special Needs" (activities touched: ${moved.modifiedCount})`);
  } else if (oldGrp) {
    await BeneficiaryGroup.updateOne({ _id: oldGrp._id }, { $set: { name: 'Special Needs' } });
    console.log('BeneficiaryGroup renamed to "Special Needs": 1');
  } else {
    console.log('BeneficiaryGroup rename: nothing to do');
  }

  await mongoose.disconnect();
  console.log('Special Needs migration complete. Now run: node seed/seed.js');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
