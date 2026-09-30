import { AUDIT_RESOURCES, TRANSITION_ACTORS } from '@zyventa/shared';
import type { HydratedDocument, InferSchemaType } from 'mongoose';
import { Schema, model } from '../../database/mongoose.js';

/**
 * Append-only record of privileged actions (admin + seller). Updates and deletes are blocked
 * at the model layer. `metadata` is free-form by necessity (before/after values differ per
 * action) but passes through the audit service's redactor — no passwords, tokens or secrets.
 */
const auditLogSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorRole: { type: String, enum: TRANSITION_ACTORS, required: true },
    /** Dotted verb, e.g. `seller.approved`, `product.price_changed`, `refund.initiated`. */
    action: { type: String, required: true, match: /^[a-z]+(?:_[a-z]+)*\.[a-z]+(?:_[a-z]+)*$/ },
    resource: { type: String, enum: AUDIT_RESOURCES, required: true },
    resourceId: { type: String, required: true, maxlength: 64 },
    // Mixed is intentional: shape varies per action; content is redacted before write.
    metadata: { type: Schema.Types.Mixed, default: {} },
    ip: { type: String, maxlength: 64 },
    userAgent: { type: String, maxlength: 512 },
    requestId: { type: String, maxlength: 64 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, minimize: true },
);

function rejectMutation(): never {
  throw new Error('Audit logs are append-only');
}
for (const op of [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'replaceOne',
  'findOneAndReplace',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
] as const) {
  auditLogSchema.pre(op, rejectMutation);
}
auditLogSchema.pre('save', function () {
  if (!this.isNew) rejectMutation();
});

auditLogSchema.index({ resource: 1, resourceId: 1, createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

export type AuditLogAttrs = InferSchemaType<typeof auditLogSchema>;
export type AuditLogDocument = HydratedDocument<AuditLogAttrs>;
export const AuditLog = model('AuditLog', auditLogSchema);
