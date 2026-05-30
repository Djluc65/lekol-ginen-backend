import mongoose from 'mongoose';

const oracleLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    prompt: { type: String, required: true },
    response: { type: String, default: '' },
    tokensIn: { type: Number, default: 0 },
    tokensOut: { type: Number, default: 0 },
    model: { type: String, default: '' },
    cacheHit: { type: Boolean, default: false },
    error: { type: String, default: '' },
  },
  { timestamps: true }
);

export const OracleLog = mongoose.model('OracleLog', oracleLogSchema);
