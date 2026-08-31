const { readDatabase, writeDatabase, ensureProfileShape } = require('../_lib/data');

function sendJson(response, status, data) {
  response.status(status).json(data);
}

module.exports = async function handler(request, response) {
  if (request.method !== 'PUT') {
    return sendJson(response, 405, { error: 'Method not allowed.' });
  }

  try {
    const profileId = request.query && request.query.id ? String(request.query.id) : '';
    const body = typeof request.body === 'string' ? JSON.parse(request.body) : (request.body || {});
    const profile = ensureProfileShape(body);

    if (profile.id !== profileId || !profile.name) {
      return sendJson(response, 400, { error: 'Invalid profile.' });
    }

    const database = readDatabase();
    const index = database.profiles.findIndex(item => item.id === profile.id);
    if (index === -1) {
      return sendJson(response, 404, { error: 'Profile not found.' });
    }

    database.profiles[index] = profile;
    writeDatabase(database);
    return sendJson(response, 200, { profile });
  } catch (error) {
    return sendJson(response, 400, { error: error.message || 'Invalid request.' });
  }
};
