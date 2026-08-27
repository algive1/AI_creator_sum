import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const templateStripSource = readFileSync(new URL('../components/business/TemplateStrip.vue', import.meta.url), 'utf8');
const previewSheetSource = readFileSync(new URL('../components/business/TemplatePreviewSheet.vue', import.meta.url), 'utf8');
const inspirationSource = readFileSync(new URL('./inspiration/index.vue', import.meta.url), 'utf8');
const homeSource = readFileSync(new URL('./home/index.vue', import.meta.url), 'utf8');
const agreementSource = readFileSync(new URL('./agreement/index.vue', import.meta.url), 'utf8');
const favoritesSource = readFileSync(new URL('./favorites/index.vue', import.meta.url), 'utf8');
const resultSource = readFileSync(new URL('./result/index.vue', import.meta.url), 'utf8');
const profileSource = readFileSync(new URL('./profile/index.vue', import.meta.url), 'utf8');
const announcementsSource = readFileSync(new URL('./announcements/index.vue', import.meta.url), 'utf8');
const templateApiSource = readFileSync(new URL('../api/template.ts', import.meta.url), 'utf8');
const productDocSource = readFileSync(new URL('../../../PRODUCT.md', import.meta.url), 'utf8');

function styleBlock(source, selector) {
  const start = source.indexOf(selector);
  assert.ok(start > -1, `${selector} style should exist`);
  const nextSelector = source.indexOf('\n.', start + selector.length);
  return source.slice(start, nextSelector > -1 ? nextSelector : undefined);
}

function styleBlocks(source, selector) {
  const blocks = [];
  let offset = 0;
  while (offset < source.length) {
    const start = source.indexOf(selector, offset);
    if (start === -1) break;
    const nextSelector = source.indexOf('\n.', start + selector.length);
    blocks.push(source.slice(start, nextSelector > -1 ? nextSelector : undefined));
    offset = start + selector.length;
  }
  assert.ok(blocks.length > 0, `${selector} style should exist`);
  return blocks;
}

function assertImageTitleHasNoBackground(source, selector) {
  for (const block of styleBlocks(source, selector)) {
    assert.doesNotMatch(block, /\n\s*background:/, `${selector} should not use title background`);
    assert.doesNotMatch(block, /\n\s*padding:/, `${selector} should not use title padding`);
    assert.doesNotMatch(block, /\n\s*border-radius:/, `${selector} should not use title radius`);
    assert.match(block, /text-shadow:/, `${selector} should keep a readable shadow`);
  }
}

function assertTitleHasNoBackground(source, selector) {
  for (const block of styleBlocks(source, selector)) {
    assert.doesNotMatch(block, /\n\s*background:/, `${selector} should not use title background`);
    assert.doesNotMatch(block, /\n\s*padding:/, `${selector} should not use title padding`);
    assert.doesNotMatch(block, /\n\s*border-radius:/, `${selector} should not use title radius`);
  }
}

function tagSnippets(source, tagName, className) {
  const pattern = new RegExp(`<${tagName}[^>]*class="${className}"[^>]*>`, 'g');
  return Array.from(source.matchAll(pattern)).map((match) => match[0]);
}

function sourceBlock(source, marker) {
  const start = source.indexOf(marker);
  assert.ok(start > -1, `${marker} block should exist`);
  const nextFunction = source.indexOf('\nfunction ', start + marker.length);
  return source.slice(start, nextFunction > -1 ? nextFunction : undefined);
}

function exactStyleSelectorCount(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Array.from(source.matchAll(new RegExp(`(^|\\n)${escaped}\\s*\\{`, 'g'))).length;
}

test('template cards do not use full-image masks and image titles are single line', () => {
  assert.doesNotMatch(templateStripSource, /\.template-card::after/);
  assert.doesNotMatch(homeSource, /\.inspiration-art::after\s*\{[\s\S]*background:/);
  assert.doesNotMatch(inspirationSource, /\.feed-art::after\s*\{[\s\S]*background:/);

  assertImageTitleHasNoBackground(templateStripSource, '.template-name');
  assertImageTitleHasNoBackground(inspirationSource, '.feed-title');
  assertImageTitleHasNoBackground(homeSource, '.inspiration-title');
  assertTitleHasNoBackground(favoritesSource, '.favorite-title');
  assert.match(styleBlock(templateStripSource, '.template-name'), /white-space:\s*nowrap/);
  assert.match(styleBlock(inspirationSource, '.feed-title'), /-webkit-line-clamp:\s*1/);
  assert.match(styleBlock(homeSource, '.inspiration-title'), /white-space:\s*nowrap/);
  assert.match(styleBlock(favoritesSource, '.favorite-title'), /white-space:\s*nowrap/);
  assert.match(styleBlock(favoritesSource, '.favorite-badge'), /rgba\(15,\s*23,\s*42,\s*0\.[0-9]+\)/);
});

test('template image bottom text sits closer to actions without dark pills', () => {
  assert.doesNotMatch(styleBlock(homeSource, '.inspiration-source'), /\n\s*background:\s*rgba\(15,\s*23,\s*42/);
  assert.doesNotMatch(styleBlock(homeSource, '.inspiration-favorite'), /\n\s*background:\s*rgba\(15,\s*23,\s*42/);
  assert.doesNotMatch(styleBlock(inspirationSource, '.feed-usage'), /\n\s*background:\s*rgba\(15,\s*18,\s*32/);
  assert.doesNotMatch(styleBlock(inspirationSource, '.feed-favorite'), /\n\s*background:\s*rgba\(15,\s*18,\s*32/);
  assert.doesNotMatch(styleBlock(favoritesSource, '.unfavorite-btn'), /\n\s*background:\s*rgba\(15,\s*23,\s*42/);
  assert.match(styleBlock(homeSource, '.inspiration-title'), /font-size:\s*24rpx/);
  assert.match(styleBlock(inspirationSource, '.feed-title'), /font-size:\s*24rpx/);
  assert.ok(styleBlocks(inspirationSource, '.feed-title').some((block) => /bottom:\s*43rpx/.test(block)));
});

test('template favorite buttons hide zero counts', () => {
  assert.match(homeSource, /<text v-if="hasFavoriteCount\(item\.favoriteCount\)">\{\{ item\.favoriteText \}\}<\/text>/);
  assert.match(inspirationSource, /<text v-if="hasFavoriteCount\(item\.favoriteCount\)">\{\{ item\.favoriteText \}\}<\/text>/);
  assert.match(favoritesSource, /<text v-if="hasFavoriteCount\(item\.favoriteCount\)">\{\{ item\.favoriteText \}\}<\/text>/);
  assert.match(homeSource, /function hasFavoriteCount\(value\?: number\)/);
  assert.match(inspirationSource, /function hasFavoriteCount\(value: number\)/);
  assert.match(favoritesSource, /function hasFavoriteCount\(value: number\)/);
});

test('template preview prompt is clamped to four lines and detail images show complete content', () => {
  assert.match(previewSheetSource, /promptExpanded/);
  assert.match(previewSheetSource, /promptExpandable/);
  assert.match(previewSheetSource, /@tap="togglePromptExpanded"/);
  assert.match(previewSheetSource, /-webkit-line-clamp:\s*4/);
  const previewImages = tagSnippets(previewSheetSource, 'image', 'preview-media preview-media-image');
  assert.equal(previewImages.length, 1);
  assert.match(previewImages[0], /mode="aspectFit"/);
  assert.match(previewSheetSource, /preview-frame-image/);
  assert.match(previewSheetSource, /imagePreviewFrameStyle/);
  assert.match(previewSheetSource, /onPreviewImageLoad/);
  assert.match(previewSheetSource, /imageFrameStyle\(imagePreviewSize\.value\.width,\s*imagePreviewSize\.value\.height,\s*694\)/);
  assert.doesNotMatch(styleBlock(previewSheetSource, '.preview-frame'), /height:\s*min\(960rpx,\s*58vh\)/);
  assert.doesNotMatch(styleBlock(previewSheetSource, '.preview-frame'), /max-height:\s*58vh/);
  assert.match(styleBlock(previewSheetSource, '.preview-frame'), /overflow:\s*hidden/);
  assert.match(styleBlock(previewSheetSource, '.preview-media-image'), /height:\s*100%/);
});

test('image preview cards follow real image ratio without cropping generated results', () => {
  assert.match(resultSource, /resultImageFrameStyle/);
  assert.match(resultSource, /onResultImageLoad/);
  assert.match(resultSource, /mode="aspectFit"/);
  assert.match(resultSource, /imageFrameStyle\(size\.width,\s*size\.height,\s*694\)/);
  assert.doesNotMatch(resultSource, /imageFrameStyle\(size\.width,\s*size\.height,\s*694,\s*660\)/);
  assert.match(styleBlock(resultSource, '.media-stage'), /margin-right:\s*auto/);
  assert.match(resultSource, /\.main-image,\s*\n\.main-video\s*\{[\s\S]*height:\s*100%/);
});

test('product docs record the fixed-width dynamic-height preview rule', () => {
  assert.match(productDocSource, /Image Preview Layout Rule/);
  assert.match(productDocSource, /fixed available width/i);
  assert.match(productDocSource, /height = width \/ imageAspectRatio/i);
});

test('template video previews do not leave an empty dark block below the player', () => {
  assert.match(previewSheetSource, /isPreviewVideo/);
  assert.match(previewSheetSource, /videoPreviewSize/);
  assert.match(previewSheetSource, /videoPreviewFrameStyle/);
  assert.match(previewSheetSource, /videoSizeFromTemplate/);
  assert.match(previewSheetSource, /sizeFromRatio/);
  assert.match(previewSheetSource, /@loadedmetadata="onPreviewVideoLoadedMetadata"/);
  assert.match(previewSheetSource, /const previewFrameStyle = computed/);
  assert.match(previewSheetSource, /imageFrameStyle\(videoPreviewSize\.value\.width,\s*videoPreviewSize\.value\.height,\s*694\)/);
  assert.match(previewSheetSource, /style="width: 100%; height: 100%;"/);
  assert.doesNotMatch(previewSheetSource, /loadVideoPosterInfo/);
  assert.match(inspirationSource, /ratio:\s*work\.ratio/);
  assert.match(inspirationSource, /aspectRatio:\s*work\.aspectRatio/);
  assert.match(favoritesSource, /ratio:\s*item\.ratio/);
  assert.match(favoritesSource, /aspectRatio:\s*item\.aspectRatio/);
  assert.doesNotMatch(styleBlock(previewSheetSource, '.preview-frame-video'), /height:\s*430rpx/);
  assert.match(styleBlock(previewSheetSource, '.preview-media-video'), /height:\s*100%/);
});

test('inspiration waterfall resizes image cards from real cover dimensions', () => {
  const feedImages = tagSnippets(inspirationSource, 'image', 'feed-cover');
  assert.ok(feedImages.length >= 2);
  assert.ok(feedImages.every((snippet) => /@load="onCoverLoad\(item\.id,\s*\$event\)"/.test(snippet)));
  assert.match(inspirationSource, /function onCoverLoad\(/);
  assert.match(inspirationSource, /function applyCoverRatio\(/);
  assert.match(inspirationSource, /const WATERFALL_CARD_WIDTH_RPX = 342/);
  assert.match(inspirationSource, /const COVER_MAX_HEIGHT_RPX = 720/);
});

test('inspiration waterfall primes cover ratios before render and keeps video play centered', () => {
  assert.match(inspirationSource, /COVER_RATIO_PRELOAD_LIMIT/);
  assert.match(inspirationSource, /function primeCoverRatios/);
  assert.match(inspirationSource, /uni\.getImageInfo/);
  assert.match(inspirationSource, /works\.value = await primeCoverRatios\(list\.map\(\(item, index\) => inspirationToWork\(item, index\)\)\)/);
  assert.match(inspirationSource, /topTemplates\.value = await primeCoverRatios\(list\.map\(\(item, index\) => inspirationToWork\(item, index\)\)\)/);
  assert.doesNotMatch(inspirationSource, /\.feed-card\.aspect-(short|standard|tall|poster) \.feed-art \{ height:/);

  const videoMark = styleBlock(inspirationSource, '.feed-video-mark');
  assert.match(videoMark, /inset:\s*0/);
  assert.match(videoMark, /justify-content:\s*center/);
  assert.match(videoMark, /pointer-events:\s*none/);
  assert.doesNotMatch(videoMark, /top:\s*14rpx/);
  assert.doesNotMatch(videoMark, /right:\s*14rpx/);
  assert.match(inspirationSource, /class="feed-duration"/);
  assert.match(styleBlock(inspirationSource, '.feed-duration'), /position:\s*absolute/);
  const centeredPlay = styleBlocks(inspirationSource, '.feed-play').find((block) => /width:\s*68rpx/.test(block));
  assert.ok(centeredPlay, 'centered waterfall video play button style should exist');
  assert.match(centeredPlay, /top:\s*auto/);
  assert.match(centeredPlay, /right:\s*auto/);
});

test('inspiration waterfall thumbnails fill the rounded card for both image and video', () => {
  const feedImages = tagSnippets(inspirationSource, 'image', 'feed-cover');
  assert.ok(feedImages.length >= 2);
  assert.ok(feedImages.every((snippet) => /mode="aspectFill"/.test(snippet)));
  assert.doesNotMatch(inspirationSource, /item\.kind === 'video' \? 'aspectFill' : 'aspectFit'/);
  assert.ok(styleBlocks(inspirationSource, '.feed-art').some((block) => /border-radius:\s*inherit/.test(block)));
  assert.ok(styleBlocks(inspirationSource, '.feed-card').some((block) => /overflow:\s*hidden/.test(block)));
});

test('inspiration landscape image cards use exact aspect height without min-height letterboxing', () => {
  const coverHeightBlock = sourceBlock(inspirationSource, 'function coverHeightOf');
  assert.match(coverHeightBlock, /const rawHeight = WATERFALL_CARD_WIDTH_RPX \/ ratio/);
  assert.match(coverHeightBlock, /Math\.min\(COVER_MAX_HEIGHT_RPX,\s*rawHeight\)/);
  assert.doesNotMatch(coverHeightBlock, /COVER_MIN_HEIGHT_RPX/);
});

test('inspiration ratio parser accepts full-width colon ratios before image load', () => {
  const normalizeBlock = sourceBlock(inspirationSource, 'function normalizeRatio');
  assert.match(inspirationSource, /function normalizeRatioText/);
  assert.match(normalizeBlock, /normalizeRatioText\(value\)/);
  assert.match(normalizeBlock, /normalizeRatioText\(params\?\.aspect_ratio/);
  assert.match(sourceBlock(inspirationSource, 'function normalizeRatioText'), /replace\(\s*\/：\/g,\s*':'\s*\)/);
});

test('inspiration waterfall has one active feed style set without stale layout overrides', () => {
  for (const selector of ['.create-waterfall', '.waterfall-column', '.feed-card', '.feed-art', '.feed-title', '.feed-meta', '.create-empty', '.create-empty-action']) {
    assert.equal(exactStyleSelectorCount(inspirationSource, selector), 1, `${selector} should be defined once`);
  }
  assert.doesNotMatch(inspirationSource, /\.feed-card\.(short|tall)\s+\.feed-art/);
  assert.doesNotMatch(inspirationSource, /\.feed-like\s*\{/);
  assert.doesNotMatch(inspirationSource, /\.theme-(lantern|street|kitchen|studio|green)\b/);
});

test('help page lists title cards and opens fixed-ratio detail pages with copy blocks', () => {
  assert.match(agreementSource, /interface HelpItem/);
  assert.match(agreementSource, /const helpItems = computed/);
  assert.match(agreementSource, /const selectedHelpId = ref/);
  assert.match(agreementSource, /const helpDetailItem = computed/);
  assert.match(agreementSource, /v-for="item in helpItems"/);
  assert.match(agreementSource, /class="card help-item-card"/);
  assert.match(agreementSource, /class="help-card-chevron"/);
  assert.doesNotMatch(agreementSource, /class="help-card-arrow">>/);
  assert.doesNotMatch(agreementSource, /&gt;/);
  assert.match(agreementSource, /@tap="openHelpItem\(item\)"/);
  assert.match(agreementSource, /item\.subtitle/);
  assert.match(agreementSource, /v-if="helpDetailItem"/);
  assert.match(agreementSource, /helpDetailItem\.contentHtml/);
  assert.match(agreementSource, /helpMediaFrameStyle\(helpDetailItem\)/);
  assert.match(agreementSource, /helpDetailItem\.mediaType === 'image'/);
  assert.match(agreementSource, /mode="aspectFit"/);
  assert.match(agreementSource, /object-fit="contain"/);
  assert.match(agreementSource, /class="help-code-block"/);
  assert.match(agreementSource, /selectable/);
  assert.match(agreementSource, /function openHelpItem/);
  assert.match(agreementSource, /function backToHelpList/);
  assert.match(agreementSource, /function copyHelpText/);
  assert.match(styleBlock(agreementSource, '.help-item-card'), /justify-content:\s*space-between/);
  assert.match(styleBlock(agreementSource, '.help-media-frame'), /overflow:\s*hidden/);
  assert.match(styleBlock(agreementSource, '.help-media-frame'), /max-width:\s*100%/);
  assert.match(styleBlock(agreementSource, '.help-media-frame'), /box-sizing:\s*border-box/);
  assert.ok(styleBlocks(agreementSource, '.help-media').some((block) => /height:\s*100%/.test(block)));
  assert.match(styleBlock(agreementSource, '.help-media'), /max-width:\s*100%/);
});

test('share template flow requires profile nickname before public sharing', () => {
  assert.match(resultSource, /ensureShareNickname/);
  assert.match(resultSource, /profile-nickname-mask/);
  assert.match(resultSource, /updateMe/);
  assert.ok(resultSource.indexOf('ensureShareNickname') < resultSource.indexOf("confirmCompliance({ scene: 'public_template'"));
});

test('notification APIs are wired to profile red dot and announcement message page', () => {
  assert.match(templateApiSource, /getNotificationUnreadCount/);
  assert.match(templateApiSource, /getNotifications/);
  assert.match(templateApiSource, /markNotificationRead/);
  assert.match(profileSource, /getNotificationUnreadCount/);
  assert.match(profileSource, /hasUnreadMessages/);
  assert.match(profileSource, /templateReviewCount/);
  assert.match(announcementsSource, /notification-list/);
  assert.match(announcementsSource, /markNotificationRead/);
  assert.match(announcementsSource, /template_review_approved/);
  assert.match(announcementsSource, /row\.notificationType \|\| row\.notification_type/);
  assert.match(announcementsSource, /type:\s*item\.type \|\| 'template_favorite'/);
  assert.match(announcementsSource, /已通过审核/);
});

test('inspiration refresh requests random top and waterfall templates together', () => {
  assert.match(inspirationSource, /refreshRandomInspirations/);
  assert.match(inspirationSource, /loadTopTemplates\(true\)/);
  assert.match(inspirationSource, /loadWorks\(true\)/);
  assert.match(inspirationSource, /getTopInspirations<[\s\S]*random:\s*random/);
  assert.match(inspirationSource, /getInspirations<[\s\S]*random:\s*random/);
});

test('inspiration refresh uses the same loading and cycling motion as home', () => {
  assert.match(inspirationSource, /const loadingRandomInspirations = ref\(false\)/);
  assert.match(inspirationSource, /const cyclingRandomInspirations = ref\(false\)/);
  assert.match(inspirationSource, /playRandomInspirationRefreshMotion/);
  assert.match(inspirationSource, /:class="\{ loading: loadingRandomInspirations, cycling: cyclingRandomInspirations \}"/);
  assert.match(inspirationSource, /:disabled="loadingRandomInspirations"/);
  assert.match(inspirationSource, /\{\{ loadingRandomInspirations \? '刷新中' : '换一换' \}\}/);
  assert.match(inspirationSource, /class="top-template-refresh-icon"/);
  assert.match(styleBlock(inspirationSource, '.top-template-refresh.loading'), /color:\s*#7a5cff/);
  assert.match(styleBlock(inspirationSource, '.top-template-refresh.loading .top-template-refresh-icon'), /animation:\s*pull-refresh-spin 0\.82s linear infinite/);
  assert.match(styleBlock(inspirationSource, '.top-template-refresh.cycling .top-template-refresh-icon'), /animation:\s*pull-refresh-spin 0\.42s ease-out/);
});
