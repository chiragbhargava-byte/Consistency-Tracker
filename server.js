const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const databasePath = path.join(root, "shared-data.json");
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

function readDatabase() {
  try {
    const data = JSON.parse(fs.readFileSync(databasePath, "utf8"));
    return { profiles: Array.isArray(data.profiles) ? data.profiles : [] };
  } catch (_) {
    return { profiles: [] };
  }
}

function writeDatabase(data) {
  fs.writeFileSync(databasePath, JSON.stringify(data, null, 2));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", chunk => {
      body += chunk;
      if (body.length > 2_000_000) reject(new Error("Request is too large."));
    });
    request.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (_) { reject(new Error("Invalid JSON.")); }
    });
  });
}

function safeProfile(profile) {
  const name = String(profile.name || "").trim().slice(0, 40);
  return {
    id: String(profile.id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80),
    name,
    friends: Array.isArray(profile.friends) ? profile.friends.map(String).slice(0, 100) : [],
    trackerState: profile.trackerState && typeof profile.trackerState === "object" ? profile.trackerState : { days: {}, timer: {} },
    updatedAt: new Date().toISOString()
  };
}

http.createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);

  if (pathname === "/api/profiles" && request.method === "GET") {
    return sendJson(response, 200, readDatabase());
  }

  if (pathname === "/api/profiles" && request.method === "POST") {
    try {
      const profile = safeProfile(await readBody(request));
      if (!profile.id || !profile.name) return sendJson(response, 400, { error: "A profile name is required." });
      const database = readDatabase();
      if (database.profiles.some(item => item.id === profile.id || item.name.toLowerCase() === profile.name.toLowerCase())) {
        return sendJson(response, 409, { error: "That profile already exists." });
      }
      database.profiles.push(profile);
      writeDatabase(database);
      return sendJson(response, 201, { profile });
    } catch (error) { return sendJson(response, 400, { error: error.message }); }
  }

  if (pathname === "/api/connect" && request.method === "POST") {
    try {
      const { profileId, friendName } = await readBody(request);
      const database = readDatabase();
      const profile = database.profiles.find(item => item.id === String(profileId));
      const friend = database.profiles.find(item => item.name.toLowerCase() === String(friendName || "").trim().toLowerCase());
      if (!profile || !friend) return sendJson(response, 404, { error: "Profile not found. Ask your friend to create their profile first." });
      if (profile.id === friend.id) return sendJson(response, 400, { error: "You cannot add your own profile." });
      profile.friends = Array.from(new Set([...(profile.friends || []), friend.id]));
      friend.friends = Array.from(new Set([...(friend.friends || []), profile.id]));
      writeDatabase(database);
      return sendJson(response, 200, { profile, friend });
    } catch (error) { return sendJson(response, 400, { error: error.message }); }
  }

  const profileMatch = pathname.match(/^\/api\/profiles\/([a-zA-Z0-9_-]+)$/);
  if (profileMatch && request.method === "PUT") {
    try {
      const profile = safeProfile(await readBody(request));
      if (profile.id !== profileMatch[1] || !profile.name) return sendJson(response, 400, { error: "Invalid profile." });
      const database = readDatabase();
      const index = database.profiles.findIndex(item => item.id === profile.id);
      if (index === -1) return sendJson(response, 404, { error: "Profile not found." });
      database.profiles[index] = profile;
      writeDatabase(database);
      return sendJson(response, 200, { profile });
    } catch (error) { return sendJson(response, 400, { error: error.message }); }
  }

  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(root, relativePath);

  if (!filePath.startsWith(root + path.sep)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500).end("Not found");
      return;
    }
    response.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
    response.end(content);
  });
}).listen(5500, "0.0.0.0", () => {
  console.log("Consistency Tracker available at http://127.0.0.1:5500 (and on your local network)");
});
