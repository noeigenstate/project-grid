const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { adoptProfile } = require('../electron/profile-migration.cjs');

const profile = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-')), from = path.join(root, 'Project Grid'), to = path.join(root, 'Agentrix');
  fs.mkdirSync(path.join(from, 'voice'), { recursive: true });
  fs.writeFileSync(path.join(from, 'workspace.json'), '{"version":2,"projects":[{"name":"mine"}]}');
  fs.writeFileSync(path.join(from, 'voice', 'model.onnx'), 'weights');
  fs.mkdirSync(path.join(from, 'Cache'));
  return { from, to };
};

test('the first start under the new name takes the old profile over whole', () => {
  const { from, to } = profile();
  assert.equal(adoptProfile(from, to), 'moved');
  assert.equal(fs.existsSync(from), false);
  assert.match(fs.readFileSync(path.join(to, 'workspace.json'), 'utf8'), /mine/);
  assert.equal(fs.readFileSync(path.join(to, 'voice', 'model.onnx'), 'utf8'), 'weights');
  assert.equal(adoptProfile(from, to), 'none', 'only once');
});

test('while the old app holds its folder, the projects, settings and voice models are copied and the old folder stays', () => {
  const { from, to } = profile();
  const locked = { ...fs, renameSync: () => { throw Object.assign(new Error('busy'), { code: 'EBUSY' }); } };
  assert.equal(adoptProfile(from, to, locked), 'copied');
  assert.match(fs.readFileSync(path.join(to, 'workspace.json'), 'utf8'), /mine/);
  assert.equal(fs.readFileSync(path.join(to, 'voice', 'model.onnx'), 'utf8'), 'weights');
  assert.equal(fs.existsSync(path.join(to, 'Cache')), false, 'caches are rebuilt, not copied');
  assert.equal(fs.existsSync(path.join(from, 'workspace.json')), true);
});

test('an existing new profile is never overwritten', () => {
  const { from, to } = profile();
  fs.mkdirSync(to); fs.writeFileSync(path.join(to, 'workspace.json'), '{"projects":[]}');
  assert.equal(adoptProfile(from, to), 'none');
  assert.equal(fs.readFileSync(path.join(to, 'workspace.json'), 'utf8'), '{"projects":[]}');
});
