import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 50 },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['visitor', 'creator', 'admin'], default: 'visitor', index: true },
    displayName: { type: String, default: '' },
    bio: { type: String, default: '' },
    avatarUrl: { type: String, default: '' },
    locale: { type: String, default: 'fr' },
  },
  { timestamps: true }
);

userSchema.methods.toPublicJSON = function () {
  return {
    id: this._id.toString(),
    username: this.username,
    email: this.email,
    role: this.role,
    displayName: this.displayName,
    bio: this.bio,
    avatarUrl: this.avatarUrl,
    locale: this.locale,
    createdAt: this.createdAt,
  };
};

export const User = mongoose.model('User', userSchema);
