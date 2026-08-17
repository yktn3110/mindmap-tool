const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const { createMindflowServer } = require('../server.js');

let server;
test.beforeAll(async () => {
  server = createMindflowServer();
  await new Promise(resolve => server.listen(4173, '127.0.0.1', resolve));
});
test.afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
});

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.removeItem('mindflow-map'));
  await page.reload();
});

test('Tab adds a child node instead of moving browser focus', async ({ page }) => {
  const nodes = page.locator('.node');
  await nodes.first().click();
  const before = await nodes.count();
  await page.keyboard.press('Tab');
  await expect(nodes).toHaveCount(before + 1);
  await expect(nodes.filter({ hasText: '新しいノード' })).toHaveCount(1);
});

test('save status changes after editing and JSON export', async ({ page }) => {
  await expect(page.locator('#save-status')).toHaveText('変更なし');
  await page.locator('.node.root').click();
  await page.keyboard.press('Tab');
  await expect(page.locator('#save-status')).toHaveText('未保存');
  await expect(page.locator('#save-status')).toHaveClass(/dirty/);
  await expect(page.locator('#export-btn')).toHaveText('保存');
  await expect(page.locator('#import-btn')).toHaveText('開く');
  const downloadPromise=page.waitForEvent('download');
  await page.locator('#export-btn').click();
  await downloadPromise;
  await expect(page.locator('#save-status')).toHaveText(/保存済み/);
  await expect(page.locator('#save-status')).not.toHaveClass(/dirty/);
});

test('closing a page with unsaved changes shows a browser warning', async ({ page }) => {
  await page.locator('.node.root').click();
  await page.keyboard.press('Tab');
  const dialogPromise=page.waitForEvent('dialog');
  await page.close({runBeforeUnload:true});
  const dialog=await dialogPromise;
  expect(dialog.type()).toBe('beforeunload');
  await dialog.dismiss();
});

test('editing does not save data to browser storage', async ({ page }) => {
  await page.locator('.node.root').click();
  await page.keyboard.press('Tab');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('mindflow-map'))).toBeNull();
});

test('Tab adds a child while the node created by the previous Tab is being edited', async ({ page }) => {
  const nodes = page.locator('.node');
  await page.locator('.node.root').click();
  const initialCount = await nodes.count();
  await page.keyboard.press('Tab');
  await expect(nodes).toHaveCount(initialCount + 1);
  await expect(page.locator('.node-label[contenteditable="true"]')).toHaveCount(1);
  await page.keyboard.press('Tab');
  await expect(nodes).toHaveCount(initialCount + 2);
});

test('Tab adds a child while editing a node opened by double-click', async ({ page }) => {
  const nodes = page.locator('.node');
  const node = page.locator('.node').filter({ hasText: 'やりたいこと' });
  await node.dblclick();
  await expect(page.locator('.node-label[contenteditable="true"]')).toHaveCount(1);
  const before = await nodes.count();
  await page.keyboard.press('Tab');
  await expect(nodes).toHaveCount(before + 1);
});

test('undo and redo restore a node added with the keyboard shortcut', async ({ page }) => {
  const nodes = page.locator('.node');
  const root = page.locator('.node.root');
  await root.click();
  const initialCount = await nodes.count();
  await page.keyboard.press('Tab');
  await expect(nodes).toHaveCount(initialCount + 1);
  await root.click();
  await page.keyboard.press('Control+Z');
  await expect(nodes).toHaveCount(initialCount);
  await expect(page.locator('#redo-btn')).toBeEnabled();
  await page.keyboard.press('Control+Shift+Z');
  await expect(nodes).toHaveCount(initialCount + 1);
});

test('undo restores a deleted node and redo deletes it again', async ({ page }) => {
  const node = page.locator('.node').filter({ hasText: 'やりたいこと' });
  await node.click();
  await page.keyboard.press('Delete');
  await expect(node).toHaveCount(0);
  await page.keyboard.press('Control+Z');
  await expect(page.locator('.node').filter({ hasText: 'やりたいこと' })).toHaveCount(1);
  await page.keyboard.press('Control+Y');
  await expect(page.locator('.node').filter({ hasText: 'やりたいこと' })).toHaveCount(0);
});

test('double-clicking a node enables text editing and persists it', async ({ page }) => {
  const node = page.locator('.node').filter({ hasText: 'やりたいこと' });
  await node.dblclick();
  await expect(node.locator('.node-label')).toHaveAttribute('contenteditable', 'true');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('企画すること');
  await page.keyboard.press('Enter');
  await expect(page.locator('.node').filter({ hasText: '企画すること' })).toHaveCount(1);
});

test('double-clicking a selected node selects all of its text for editing', async ({ page }) => {
  const node = page.locator('.node').filter({ hasText: 'やりたいこと' });
  await node.click();
  await node.dblclick();
  await expect(node.locator('.node-label')).toHaveAttribute('contenteditable', 'true');
  await expect.poll(() => page.evaluate(() => window.getSelection().toString())).toBe('やりたいこと');
});

test('clicking inside an edited node moves the caret instead of reselecting all text', async ({ page }) => {
  const node=page.locator('.node').filter({hasText:'やりたいこと'});
  const label=node.locator('.node-label');
  await node.dblclick();
  await expect.poll(() => page.evaluate(() => window.getSelection().toString())).toBe('やりたいこと');
  const box=await label.boundingBox();
  await page.mouse.click(box.x+box.width-3,box.y+box.height/2);
  const selection=await page.evaluate(() => {const range=window.getSelection();return {collapsed:range.isCollapsed,offset:range.focusOffset,text:range.focusNode?.textContent};});
  expect(selection.collapsed).toBeTruthy();
  expect(selection.offset).toBeGreaterThan(0);
  expect(selection.text).toContain('やりたいこと');
});

test('clicking text in a selected node starts editing at the clicked position', async ({ page }) => {
  const node=page.locator('.node').filter({hasText:'やりたいこと'});
  const label=node.locator('.node-label');
  await node.click();
  await expect(node).toHaveClass(/selected/);
  const box=await label.boundingBox();
  await page.mouse.click(box.x+box.width-3,box.y+box.height/2);
  await expect(label).toHaveAttribute('contenteditable','true');
  const selection=await page.evaluate(() => {const range=window.getSelection();return {collapsed:range.isCollapsed,offset:range.focusOffset};});
  expect(selection.collapsed).toBeTruthy();
  expect(selection.offset).toBeGreaterThan(0);
});

test('a node can have its color, icon, and note configured and exported', async ({ page }) => {
  const node = page.locator('.node').filter({ hasText: 'やりたいこと' });
  await node.click();
  await page.locator('#color-picker button[data-color="#43a77b"]').click();
  await expect(node).toHaveAttribute('style', /--node-color: #43a77b/);
  await expect(node).toHaveCSS('border-left-color', 'rgb(67, 167, 123)');
  await expect(node).toHaveCSS('background-color', 'rgb(225, 241, 234)');
  await page.locator('#color-picker button[aria-label="色なし"]').click();
  await expect(node).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(node).not.toHaveAttribute('style', /--node-color/);
  await page.locator('#color-picker button[data-color="#43a77b"]').click();
  await page.locator('#node-icon').selectOption('💡');
  await expect(node.locator('.node-icon')).toHaveText('💡 ');
  const note = page.locator('#node-note');
  await note.fill('次回までに調査する');
  await note.blur();
  await expect(node.locator('.note-indicator')).toHaveCount(1);
  await expect(page.locator('#note-preview')).toBeVisible();
  await expect(page.locator('#note-preview-text')).toHaveText('次回までに調査する');
  const downloadPromise=page.waitForEvent('download');
  await page.locator('#export-btn').click();
  const download=await downloadPromise;
  const saved=JSON.parse(await fs.readFile(await download.path(),'utf8'));
  expect(saved.nodes.find(item=>item.text==='やりたいこと').note).toBe('次回までに調査する');
});

test('Backspace in a note edits text without deleting the selected node', async ({ page }) => {
  const node=page.locator('.node').filter({hasText:'やりたいこと'});
  await node.click();
  const note=page.locator('#node-note');
  await note.fill('メモX');
  await note.press('Backspace');
  await expect(note).toHaveValue('メモ');
  await expect(node).toHaveCount(1);
});

test('tree layout rearranges nodes and can be undone', async ({ page }) => {
  const root = page.locator('.node.root');
  const before = await root.getAttribute('style');
  await page.locator('#auto-layout').click();
  await expect(root).not.toHaveAttribute('style', before);
  await page.locator('#undo-btn').click();
  await expect(root).toHaveAttribute('style', before);
});

test('horizontal layout places children to the right of their parent and switches back to tree', async ({ page }) => {
  await page.locator('#horizontal-layout').click();
  const positions = await page.evaluate(() => {const node=id=>document.querySelector(`[data-id="${id}"]`);const root=node('root'),child=[...document.querySelectorAll('.node')].find(el=>el.dataset.id!=='root'&&el.style.left);return {root:{x:parseFloat(root.style.left),y:parseFloat(root.style.top)},child:{x:parseFloat(child.style.left),y:parseFloat(child.style.top)}};});
  expect(positions.child.x).toBeGreaterThan(positions.root.x);
  await expect(page.locator('#horizontal-layout')).toHaveClass(/active/);
  await page.locator('#auto-layout').click();
  const treePositions = await page.evaluate(() => {const node=id=>document.querySelector(`[data-id="${id}"]`);const root=node('root'),child=[...document.querySelectorAll('.node')].find(el=>el.dataset.id!=='root');return {root:{x:parseFloat(root.style.left),y:parseFloat(root.style.top)},child:{x:parseFloat(child.style.left),y:parseFloat(child.style.top)}};});
  expect(treePositions.child.y).toBeGreaterThan(treePositions.root.y);
  await expect(page.locator('#auto-layout')).toHaveClass(/active/);
});

test('new child placement follows the active layout direction', async ({ page }) => {
  const positions=async () => page.evaluate(() => {const root=document.querySelector('[data-id="root"]'),added=[...document.querySelectorAll('.node')].find(el=>el.textContent.includes('新しいノード'));return {root:{x:parseFloat(root.style.left),y:parseFloat(root.style.top)},added:{x:parseFloat(added.style.left),y:parseFloat(added.style.top)}};});
  await page.locator('#horizontal-layout').click();
  await page.locator('.node.root').click();
  await page.keyboard.press('Tab');
  let result=await positions();
  expect(result.added.x).toBeGreaterThan(result.root.x);
  await page.reload();
  await page.locator('#auto-layout').click();
  await page.locator('.node.root').click();
  await page.keyboard.press('Tab');
  result=await positions();
  expect(result.added.y).toBeGreaterThan(result.root.y);
});

test('fit view scales and centers every node inside the canvas', async ({ page }) => {
  await page.locator('#horizontal-layout').click();
  await page.locator('#fit-view').click();
  const result = await page.evaluate(() => {
    const canvas=document.querySelector('#canvas').getBoundingClientRect();
    const nodes=[...document.querySelectorAll('.node')].map(node=>node.getBoundingClientRect());
    const margin=2;
    return nodes.every(node=>node.left>=canvas.left-margin && node.right<=canvas.right+margin && node.top>=canvas.top-margin && node.bottom<=canvas.bottom-margin);
  });
  expect(result).toBeTruthy();
  await expect(page.locator('#zoom-label')).not.toHaveText('100%');
});

test('search finds a node and focuses it in the canvas', async ({ page }) => {
  const search=page.locator('#node-search');
  await search.fill('参考資料');
  const result=page.locator('.search-result').filter({hasText:'参考資料'});
  await expect(result).toHaveCount(1);
  await expect(page.locator('.node').filter({hasText:'参考資料'})).toHaveClass(/search-match/);
  await result.click();
  const focused=page.locator('.node').filter({hasText:'参考資料'});
  await expect(focused).toHaveClass(/selected/);
  const centered=await page.evaluate(() => { const canvas=document.querySelector('#canvas').getBoundingClientRect(), node=[...document.querySelectorAll('.node')].find(el=>el.textContent.includes('参考資料')).getBoundingClientRect(); return Math.abs((node.left+node.right)/2-(canvas.left+canvas.right)/2)<3 && Math.abs((node.top+node.bottom)/2-(canvas.top+canvas.bottom)/2)<3; });
  expect(centered).toBeTruthy();
});

test('a parent node collapses and expands all of its descendants', async ({ page }) => {
  const parent=page.locator('.node').filter({hasText:'やりたいこと'});
  const child=page.locator('.node').filter({hasText:'アイデアをメモ'});
  await expect(child).toHaveCount(1);
  await parent.locator('.collapse-toggle').click();
  await expect(child).toHaveCount(0);
  await expect(parent.locator('.collapse-toggle')).toHaveText('＋');
  await parent.locator('.collapse-toggle').click();
  await expect(child).toHaveCount(1);
});

test('PNG export downloads a non-empty image file', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export-png-btn').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  expect((await download.createReadStream()).readable).toBeTruthy();
});

test('the sidebar scrolls and its sections do not overlap', async ({ page }) => {
  const sidebar = page.locator('.sidebar');
  await expect(sidebar).toHaveCSS('overflow-y', 'auto');
  const options = await page.locator('.node-options').boundingBox();
  const tips = await page.locator('.tips').boundingBox();
  expect(options.y + options.height).toBeLessThanOrEqual(tips.y);
});

test('dragging blank canvas pans the map', async ({ page }) => {
  const layer = page.locator('#node-layer');
  const before = await layer.evaluate(el => el.style.transform);
  const canvas = page.locator('#canvas');
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + 40, box.y + 500);
  await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y + 550, { steps: 5 });
  await page.mouse.up();
  await expect(layer).not.toHaveAttribute('style', `transform: ${before};`);
});
