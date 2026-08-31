const { readDatabase, writeDatabase } = require('./_lib/data');

function sendJson(response, status, data) {
  response.status(status).json(data);
}

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    return sendJson(response, 405, { error: 'Method not allowed.' });
  }

  try {
    const body = typeof request.body === 'string' ? JSON.parse(request.body) : (request.body || {});
    const { profileId, friendName } = body;
    const database = readDatabase();
    const profile = database.profiles.find(item => item.id === String(profileId));
    const friend = database.profiles.find(item => item.name.toLowerCase() === String(friendName || '').trim().toLowerCase());

    if (!profile || !friend) {
      return sendJson(response, 404, { error: 'Profile not found. Ask your friend to create their profile first.' });
    }
    if (profile.id === friend.id) {
      return sendJson(response, 400, { error: 'You cannot add your own profile.' });
    }

    profile.friends = Array.from(new Set([...(profile.friends || []), friend.id]));
    friend.friends = Array.from(new Set([...(friend.friends || []), profile.id]));
    writeDatabase(database);
    return sendJson(response, 200, { profile, friend });
  } catch (error) {
    return sendJson(response, 400, { error: error.message || 'Invalid request.' });
  }
};
