import mongoose from 'mongoose';

const workSchema = new mongoose.Schema(
  {
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['artwork', 'music', 'writing', 'research', 'testimony'], required: true },
    lwaSlug: { type: String, default: null, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: mongoose.Schema.Types.Mixed, default: {} },
    mediaUrls: { type: [String], default: [] },
    tags: { type: [String], default: [], index: true },
    published: { type: Boolean, default: true, index: true },
    publishedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true }
);

export const Work = mongoose.model('Work', workSchema);
