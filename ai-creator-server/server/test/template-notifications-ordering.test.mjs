import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const contentTemplatesSource = readFileSync(new URL('../src/routes/content-templates.ts', import.meta.url), 'utf8');
const publicConfigSource = readFileSync(new URL('../src/routes/public-config.ts', import.meta.url), 'utf8');
const appHomeSource = readFileSync(new URL('../src/routes/app-home.ts', import.meta.url), 'utf8');
const adminTemplatesSource = readFileSync(new URL('../src/routes/admin-templates.ts', import.meta.url), 'utf8');
const adminContentSource = readFileSync(new URL('../src/routes/admin-content.ts', import.meta.url), 'utf8');
const notificationsSource = readFileSync(new URL('../src/routes/notifications.ts', import.meta.url), 'utf8');
const notificationServiceSource = readFileSync(new URL('../src/services/template-notification.service.ts', import.meta.url), 'utf8');
const serverIndexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const miniApiDocSource = readFileSync(new URL('../../docs/MINI_PROGRAM_API.md', import.meta.url), 'utf8');
const migrationUrl = new URL('../src/migrations/20260616_001_template_favorite_notifications.sql', import.meta.url);
const reviewMigrationUrl = new URL('../src/migrations/20260617_001_template_review_notifications.sql', import.meta.url);

function routeBlock(source, marker) {
  const start = source.indexOf(marker);
  assert.ok(start > -1, `${marker} route should exist`);
  const nextRoute = source.indexOf('\nrouter.', start + marker.length);
  return source.slice(start, nextRoute > -1 ? nextRoute : undefined);
}

function sourceBlock(source, marker) {
  const start = source.indexOf(marker);
  assert.ok(start > -1, `${marker} block should exist`);
  return source.slice(start);
}

test('template favorite notifications have migration, service route, and API docs', () => {
  assert.equal(existsSync(migrationUrl), true, 'favorite notification migration should exist');
  const migration = readFileSync(migrationUrl, 'utf8');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS template_favorite_notifications/);
  assert.match(migration, /owner_user_id BIGINT UNSIGNED NOT NULL/);
  assert.match(migration, /actor_user_id BIGINT UNSIGNED NOT NULL/);
  assert.match(migration, /template_id BIGINT UNSIGNED NOT NULL/);
  assert.match(migration, /read_at DATETIME\(3\) NULL/);
  assert.match(migration, /UNIQUE KEY uk_template_favorite_notification/);

  assert.match(serverIndexSource, /import notificationRoutes from '\.\/routes\/notifications'/);
  assert.match(serverIndexSource, /app\.use\('\/api\/v1\/notifications', notificationRoutes\)/);
  assert.match(miniApiDocSource, /GET \/notifications\/unread-count/);
  assert.match(miniApiDocSource, /GET \/notifications/);
  assert.match(miniApiDocSource, /POST \/notifications\/:id\/read/);
});

test('template review approval creates a user notification shown with unread counts', () => {
  assert.equal(existsSync(reviewMigrationUrl), true, 'review notification migration should exist');
  const migration = readFileSync(reviewMigrationUrl, 'utf8');
  const approveBlock = routeBlock(adminContentSource, "router.post('/templates/:id(\\\\d+)/approve'");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS template_review_notifications/);
  assert.match(migration, /user_id BIGINT UNSIGNED NOT NULL/);
  assert.match(migration, /template_id BIGINT UNSIGNED NOT NULL/);
  assert.match(migration, /UNIQUE KEY uk_template_review_notification/);
  assert.match(adminContentSource, /createTemplateReviewNotification/);
  assert.match(approveBlock, /SELECT id, user_id, source, title FROM templates/);
  assert.match(approveBlock, /template\?\.source === 'user'/);
  assert.match(approveBlock, /createTemplateReviewNotification\(\{\s*userId:\s*Number\(template\.user_id \|\| 0\),\s*templateId:\s*Number\(template\.id \|\| 0\)/);
  assert.match(notificationServiceSource, /REVIEW_NOTIFICATION_ID_OFFSET/);
  assert.match(notificationServiceSource, /createTemplateReviewNotification/);
  assert.match(notificationServiceSource, /template_review_notifications/);
  assert.match(notificationServiceSource, /type:\s*'template_review_approved'/);
  assert.match(notificationsSource, /templateReviewCount/);
  assert.match(miniApiDocSource, /templateReviewCount/);
});

test('favorite endpoint creates owner notification only for a first-time favorite', () => {
  const favoriteBlock = routeBlock(contentTemplatesSource, "router.post('/:id(\\\\d+)/favorite'");
  assert.match(contentTemplatesSource, /createTemplateFavoriteNotification/);
  assert.match(favoriteBlock, /if \(!existingFavorites\.length\)[\s\S]*createTemplateFavoriteNotification/);
  assert.match(favoriteBlock, /ownerUserId:\s*Number\(template\.user_id \|\| 0\)/);
  assert.match(favoriteBlock, /actorUserId:\s*userId/);
  assert.match(favoriteBlock, /templateId/);
});

test('sharing a template requires a non-default nickname before inserting user template', () => {
  const shareBlock = routeBlock(contentTemplatesSource, "router.post('/share'");
  assert.match(shareBlock, /getShareProfileNickname/);
  assert.match(shareBlock, /hasShareProfileNickname/);
  assert.match(shareBlock, /PROFILE_REQUIRED/);
  assert.ok(shareBlock.indexOf('getShareProfileNickname') < shareBlock.indexOf('INSERT INTO templates'));
});

test('template queries keep pinned templates first and otherwise default to newest or random', () => {
  const queryTemplatesBlock = sourceBlock(contentTemplatesSource, 'async function queryTemplates');
  const displayBlock = sourceBlock(contentTemplatesSource, 'async function queryDisplayPositionTemplates');
  const topBlock = routeBlock(contentTemplatesSource, "router.get('/inspirations/top'");
  const legacyPublicBlock = routeBlock(publicConfigSource, "router.get('/public/templates'");
  const legacyCompareBlock = sourceBlock(publicConfigSource, 'function compareTemplatesForFeature');
  const appHomeTemplatesBlock = sourceBlock(appHomeSource, 'async function getTemplates');

  assert.match(contentTemplatesSource, /function isRandomTemplateRequest/);
  assert.match(contentTemplatesSource, /function templateDefaultOrderBy/);
  assert.match(contentTemplatesSource, /function templateRandomOrderBy/);
  assert.match(queryTemplatesBlock, /templateDefaultOrderBy\(normalizedTargetFeature, randomRequested\)/);
  assert.match(displayBlock, /templateDefaultOrderBy\(position, isRandomTemplateRequest\(req\)\)/);
  assert.match(topBlock, /templateDefaultOrderBy\('inspiration_top', isRandomTemplateRequest\(req\)\)/);
  assert.match(contentTemplatesSource, /t\.created_at DESC, t\.id DESC/);
  assert.match(contentTemplatesSource, /RAND\(\)/);
  assert.match(legacyPublicBlock, /ORDER BY t\.is_recommended DESC, t\.created_at DESC, t\.id DESC/);
  assert.match(legacyCompareBlock, /templateCreatedValue\(b\) - templateCreatedValue\(a\)/);
  assert.match(legacyCompareBlock, /Number\(b\.id \|\| b\.templateId \|\| 0\) - Number\(a\.id \|\| a\.templateId \|\| 0\)/);
  assert.match(publicConfigSource, /function templateCreatedValue/);
  assert.match(appHomeTemplatesBlock, /'t\.is_recommended DESC, t\.created_at DESC, t\.id DESC'/);
  assert.doesNotMatch(queryTemplatesBlock, /t\.is_recommended DESC, t\.is_hot DESC, t\.sort_order DESC, t\.id DESC/);
  assert.doesNotMatch(displayBlock, /t\.is_hot DESC, t\.is_recommended DESC, t\.sort_order DESC, t\.id DESC/);
  assert.doesNotMatch(legacyPublicBlock, /ORDER BY t\.is_recommended DESC, t\.sort_order DESC, t\.id DESC/);
  assert.doesNotMatch(legacyCompareBlock, /Number\(a\.sortOrder \|\| 0\) !== Number\(b\.sortOrder \|\| 0\)/);
  assert.doesNotMatch(appHomeTemplatesBlock, /'is_recommended DESC, sort_order DESC'/);
});

test('admin template management includes approved user templates and newest-first ordering', () => {
  const listBlock = routeBlock(adminTemplatesSource, "router.get('/templates'");
  const updateBlock = routeBlock(adminTemplatesSource, "router.put('/templates/:id(\\\\d+)'");
  const deleteBlock = routeBlock(adminTemplatesSource, "router.delete('/templates/:id(\\\\d+)'");
  const batchDeleteBlock = routeBlock(adminTemplatesSource, "router.delete('/templates/batch'");
  const batchDisplayBlock = routeBlock(adminTemplatesSource, "router.put('/templates/batch/display-config'");

  assert.match(adminTemplatesSource, /function adminManageableTemplateWhere/);
  assert.match(adminTemplatesSource, /t\.source = 'official'/);
  assert.match(adminTemplatesSource, /t\.source = 'user' AND t\.review_status = 'approved'/);
  assert.match(listBlock, /adminManageableTemplateWhere\('t'\)/);
  assert.match(listBlock, /ORDER BY t\.created_at DESC, t\.id DESC/);
  assert.doesNotMatch(listBlock, /ORDER BY t\.template_type, t\.sort_order, t\.id/);
  assert.match(updateBlock, /adminManageableTemplateWhere\('t'\)/);
  assert.doesNotMatch(updateBlock, /source = \?/);
  assert.match(deleteBlock, /adminManageableTemplateWhere\('t'\)/);
  assert.match(batchDeleteBlock, /adminManageableTemplateWhere\('t'\)/);
  assert.match(batchDisplayBlock, /adminManageableTemplateWhere\('t'\)/);
});

test('admin template review list is newest-first', () => {
  const reviewListBlock = routeBlock(adminContentSource, "router.get('/template-reviews'");

  assert.match(reviewListBlock, /ORDER BY created_at DESC, id DESC/);
  assert.doesNotMatch(reviewListBlock, /ORDER BY FIELD\(review_status/);
});
