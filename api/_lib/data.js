const fs = require('fs');
const path = require('path');
const os = require('os');

// Path to seed data in project root
const seedDataPath = path.resolve(__dirname, '..', '..', 'shared-data.json');

// Path to writable tmp file in serverless container
const databasePath = process.env.SHARED_DATA_PATH || path.join(os.tmpdir(), 'consistency-tracker-shared-data.json');

// In-memory fallback cache in case disk write fails or during warm container invocations
let memoryCache = null;

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
  if (memoryCache && Array.isArray(memoryCache.profiles)) {
    return { profiles: memoryCache.profiles.map(ensureProfileShape) };
  }

  // Try reading from /tmp storage first
  try {
    if (fs.existsSync(databasePath)) {
      const raw = fs.readFileSync(databasePath, 'utf8');
      const data = JSON.parse(raw);
      if (Array.isArray(data && data.profiles)) {
        memoryCache = { profiles: data.profiles.map(ensureProfileShape) };
        return memoryCache;
      }
    }
  } catch (err) {
    console.error('Failed reading databasePath:', err);
  }

  // Fallback to seed data in project root
  try {
    if (fs.existsSync(seedDataPath)) {
      const rawSeed = fs.readFileSync(seedDataPath, 'utf8');
      const seedData = JSON.parse(rawSeed);
      if (Array.isArray(seedData && seedData.profiles)) {
        memoryCache = { profiles: seedData.profiles.map(ensureProfileShape) };
        return memoryCache;
      }
    }
  } catch (err) {
    console.error('Failed reading seedDataPath:', err);
  }

  return { profiles: [] };
}

function writeDatabase(data) {
  const safeData = {
    profiles: Array.isArray(data && data.profiles) ? data.profiles.map(ensureProfileShape) : [],
  };

  memoryCache = safeData;

  try {
    const dir = path.dirname(databasePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(databasePath, JSON.stringify(safeData, null, 2));
    return true;
  } catch (err) {
    console.error('Failed writing databasePath:', err);
    return false;
  }
}

module.exports = { readDatabase, writeDatabase, ensureProfileShape };

