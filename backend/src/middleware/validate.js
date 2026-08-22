const { validationResult } = require('express-validator');

// Wrap an array of express-validator chains; respond 422 with field errors on failure.
function validate(chains) {
  return [
    ...chains,
    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ error: 'Validation failed', details: errors.array() });
      }
      next();
    },
  ];
}

module.exports = validate;
