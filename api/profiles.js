const { readDatabase, writeDatabase, ensureProfileShape } = require('./_lib/data');

function sendJson(response, status, data) {
  if (typeof response.status === 'function') {
    return response.status(status).json(data);
  }
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(data));
}

module.exports = async function handler(request, response) {
  if (request.method === 'GET') {
    return sendJson(response, 200, readDatabase());
  }

  if (request.method === 'POST') {
    try {
      const body = typeof request.body === 'string' ? JSON.parse(request.body) : (request.body || {});
      const profile = ensureProfileShape(body);

      if (!profile.id || !profile.name) {
        return sendJson(response, 400, { error: 'A profile name is required.' });
      }

      const database = readDatabase();
      if (database.profiles.some(item => item.id === profile.id || item.name.toLowerCase() === profile.name.toLowerCase())) {
        return sendJson(response, 409, { error: 'That profile already exists.' });
      }

      database.profiles.push(profile);
      writeDatabase(database);
      return sendJson(response, 201, { profile });
    } catch (error) {
      return sendJson(response, 400, { error: error.message || 'Invalid request.' });
    }
  }

  return sendJson(response, 405, { error: 'Method not allowed.' });
};
