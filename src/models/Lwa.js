import mongoose from 'mongoose';

const lwaSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    family: { type: String, required: true, enum: ['Rada', 'Nago', 'Petro', 'Kongo', 'Gede'], index: true },
    title: { type: Object, default: {} },
    energy: { type: Object, default: {} },
    domain: { type: Object, default: {} },
    elements: { type: [String], default: [] },
    colors: { type: [String], default: [] },
    songs: { type: [String], default: [] },
    offerings: { type: Object, default: {} },
    story: { type: Object, default: {} },
    veve: { type: [String], default: [] },
    grad: { type: [String], default: [] },
  },
  { timestamps: true }
);

lwaSchema.index({ name: 'text', 'title.fr': 'text', 'domain.fr': 'text' });

export const Lwa = mongoose.model('Lwa', lwaSchema);
