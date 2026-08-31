const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..');
const databasePath = path.join(rootDir, 'shared-data.json');

function ensureProfileShape(profile) {
  const safeProfile = profile && typeof profile === 'object' ? profile : {};
  const name = String(safeProfile.name || '').trim().slice(0, 40);
  return {
    id: String(safeProfile.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80),
    name,
    friends: Array.isArray(safeProfile.friends) ? safeProfile.friends.map(String).slice(0, 100) : [],
    trackerState: safeProfile.trackerState && typeof safeProfile.trackerState === 'object'
      ? safeProfile.trackerState
      : { days: {}, timer: {} },
    updatedAt: new Date().toISOString(),
  };
}

function readDatabase() {
  try {
    const raw = fs.readFileSync(databasePath, 'utf8');
    const data = JSON.parse(raw);
    return {
      profiles: Array.isArray(data && data.profiles) ? data.profiles.map(ensureProfileShape) : [],
    };
  } catch (_) {
    return { profiles: [] };
  }
}

function writeDatabase(data) {
  const safeData = {
    profiles: Array.isArray(data && data.profiles) ? data.profiles.map(ensureProfileShape) : [],
  };
  fs.writeFileSync(databasePath, JSON.stringify(safeData, null, 2));
}

module.exports = { readDatabase, writeDatabase, ensureProfileShape };
