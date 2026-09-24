/** Everything the activity log can record. Kept free of database imports so any code can use it. */
export const ACTIVITY_ACTIONS = [
  'qr.created',
  'qr.updated',
  'qr.deleted',
  'qr.duplicated',
  'qr.batch_created',
  'qr.moved',
  'qr.handoff',
  'qr.destination_restored',
  'qr.health_changed',
  'folder.created',
  'folder.renamed',
  'folder.deleted',
  'page.created',
  'page.updated',
  'page.deleted',
  'page.published',
  'page.unpublished',
  'page.expiry_changed',
  'page.handoff',
  'template.created',
  'template.updated',
  'template.deleted',
  'data.exported',
  'data.imported',
] as const;

export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];
