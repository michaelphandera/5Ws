const { catchAsync, httpError } = require('../middleware/errorHandler');
const { audit } = require('../utils/audit');

// Generic CRUD controller for lookup/master-data collections.
// opts.isReferenced(id) -> Promise<boolean>: when true, DELETE soft-deletes (active:false)
// instead of removing, so historical activities keep resolving.
function makeCrudController(Model, opts = {}) {
  const { searchFields = [], populate = null, isReferenced = null, sort = 'name' } = opts;

  return {
    list: catchAsync(async (req, res) => {
      const filter = {};
      if (req.query.active === 'true') filter.active = true;
      if (req.query.active === 'false') filter.active = false;
      if (req.query.q && searchFields.length) {
        const rx = new RegExp(req.query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = searchFields.map((f) => ({ [f]: rx }));
      }
      let query = Model.find(filter).sort(sort);
      if (populate) query = query.populate(populate);
      res.json(await query);
    }),

    get: catchAsync(async (req, res) => {
      let query = Model.findById(req.params.id);
      if (populate) query = query.populate(populate);
      const doc = await query;
      if (!doc) throw httpError(404, `${Model.modelName} not found`);
      res.json(doc);
    }),

    create: catchAsync(async (req, res) => {
      const doc = await Model.create(req.body);
      audit(req, 'create', Model.modelName, doc);
      res.status(201).json(doc);
    }),

    update: catchAsync(async (req, res) => {
      const doc = await Model.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true,
      });
      if (!doc) throw httpError(404, `${Model.modelName} not found`);
      audit(req, 'update', Model.modelName, doc);
      res.json(doc);
    }),

    remove: catchAsync(async (req, res) => {
      const doc = await Model.findById(req.params.id);
      if (!doc) throw httpError(404, `${Model.modelName} not found`);
      if (isReferenced && (await isReferenced(doc._id))) {
        doc.active = false;
        await doc.save();
        audit(req, 'update', Model.modelName, doc, { softDeleted: true });
        return res.json({ message: `${Model.modelName} is in use; deactivated instead of deleted`, softDeleted: true });
      }
      await doc.deleteOne();
      audit(req, 'delete', Model.modelName, doc);
      res.json({ message: `${Model.modelName} deleted`, softDeleted: false });
    }),
  };
}

module.exports = makeCrudController;
