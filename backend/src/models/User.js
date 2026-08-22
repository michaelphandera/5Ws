const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, trim: true },
    role: { type: String, enum: ['admin', 'org'], required: true },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      validate: {
        validator: function (v) {
          return this.role !== 'org' || v != null;
        },
        message: 'organization is required for org-role users',
      },
    },
    active: { type: Boolean, default: true },
    // Set by an admin issuing a temporary password; forces the user to change it
    // at next login before using the rest of the API.
    forcePasswordChange: { type: Boolean, default: false },
  },
  { timestamps: true }
);

userSchema.methods.setPassword = async function (plain) {
  this.passwordHash = await bcrypt.hash(plain, 10);
};

userSchema.methods.checkPassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.toSafeJSON = function () {
  return {
    id: this._id,
    username: this.username,
    email: this.email,
    name: this.name,
    role: this.role,
    organization: this.organization,
    active: this.active,
    forcePasswordChange: this.forcePasswordChange || false,
  };
};

module.exports = mongoose.model('User', userSchema);
