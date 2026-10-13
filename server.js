// server.js
// Meeting Room Booking System - backend
// Pure Node.js (http module only) - no npm install required.
// Run with: node server.js

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = 3000;
const ROOMS = ['Alpha', 'Beta', 'Gamma'];
const OFFICE_START = '09:00';
const OFFICE_END = '18:00';
const STEP_MINUTES = 15;

// ---- In-memory store ----
let bookings = []; // { id, room, date, start, end, bookedBy }
let nextId = 1;

// ---- Time helpers ----
function isValidTimeFormat(t) {
  return typeof t === 'string' && /^([01]\d|2[0-3]):([0-5]\d)$/.test(t);
}

function toMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function toTimeStr(mins) {
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function isValidDateFormat(d) {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
}

// ---- Response helpers ----
function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendError(res, status, message) {
  sendJSON(res, status, { error: message });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// ---- Core validation + booking logic ----
function validateBookingInput(body) {
  const { room, date, start, end, bookedBy } = body;

  if (!room || !date || !start || !end || !bookedBy) {
    return { error: 'All fields are required: room, date, start, end, bookedBy.' };
  }
  if (!ROOMS.includes(room)) {
    return { notFound: `Room "${room}" does not exist. Valid rooms: ${ROOMS.join(', ')}.` };
  }
  if (!isValidDateFormat(date)) {
    return { error: 'Date must be in YYYY-MM-DD format.' };
  }
  if (!isValidTimeFormat(start) || !isValidTimeFormat(end)) {
    return { error: 'Start and end must be in HH:MM 24-hour format.' };
  }
  if (typeof bookedBy !== 'string' || !bookedBy.trim()) {
    return { error: 'bookedBy must be a non-empty name.' };
  }

  const startMin = toMinutes(start);
  const endMin = toMinutes(end);
  const officeStartMin = toMinutes(OFFICE_START);
  const officeEndMin = toMinutes(OFFICE_END);

  if (endMin <= startMin) {
    return { error: 'End time must be after start time.' };
  }
  if (startMin < officeStartMin || endMin > officeEndMin) {
    return { error: `Bookings must be within office hours (${OFFICE_START} - ${OFFICE_END}).` };
  }
  if (startMin % STEP_MINUTES !== 0 || endMin % STEP_MINUTES !== 0) {
    return { error: `Start and end times must fall on ${STEP_MINUTES}-minute steps (e.g. 10:00, 10:15, 10:30...).` };
  }

  return { ok: true, startMin, endMin };
}

function hasOverlap(room, date, startMin, endMin, excludeId = null) {
  return bookings.some((b) => {
    if (b.room !== room || b.date !== date) return false;
    if (excludeId !== null && b.id === excludeId) return false;
    const bStart = toMinutes(b.start);
    const bEnd = toMinutes(b.end);
    // Overlap if they are not fully separate (back-to-back is OK: bEnd<=startMin or endMin<=bStart)
    return startMin < bEnd && endMin > bStart;
  });
}

function freeSlotsForRoom(room, date) {
  const dayBookings = bookings
    .filter((b) => b.room === room && b.date === date)
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

  const officeStartMin = toMinutes(OFFICE_START);
  const officeEndMin = toMinutes(OFFICE_END);

  const free = [];
  let cursor = officeStartMin;

  for (const b of dayBookings) {
    const bStart = toMinutes(b.start);
    const bEnd = toMinutes(b.end);
    if (bStart > cursor) {
      free.push({ start: toTimeStr(cursor), end: toTimeStr(bStart) });
    }
    cursor = Math.max(cursor, bEnd);
  }
  if (cursor < officeEndMin) {
    free.push({ start: toTimeStr(cursor), end: toTimeStr(officeEndMin) });
  }
  return free;
}

// ---- Static file serving (frontend) ----
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(PUBLIC_DIR, filePath);

  // Prevent path traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return sendError(res, 403, 'Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      return sendError(res, 404, 'Not found');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---- Request router ----
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  try {
    // GET /api/rooms
    if (method === 'GET' && pathname === '/api/rooms') {
      return sendJSON(res, 200, { rooms: ROOMS });
    }

    // POST /api/bookings
    if (method === 'POST' && pathname === '/api/bookings') {
      let body;
      try {
        body = await readBody(req);
      } catch (e) {
        return sendError(res, 400, e.message);
      }

      const result = validateBookingInput(body);
      if (result.notFound) return sendError(res, 404, result.notFound);
      if (result.error) return sendError(res, 400, result.error);

      const { room, date, start, end, bookedBy } = body;
      if (hasOverlap(room, date, result.startMin, result.endMin)) {
        return sendError(
          res,
          409,
          `Room "${room}" is already booked on ${date} during part of ${start}-${end}.`
        );
      }

      const booking = {
        id: nextId++,
        room,
        date,
        start,
        end,
        bookedBy: bookedBy.trim(),
      };
      bookings.push(booking);
      return sendJSON(res, 201, booking);
    }

    // GET /api/bookings?date=YYYY-MM-DD
    if (method === 'GET' && pathname === '/api/bookings') {
      const date = parsedUrl.searchParams.get('date');
      let result = bookings;
      if (date) {
        if (!isValidDateFormat(date)) {
          return sendError(res, 400, 'Date must be in YYYY-MM-DD format.');
        }
        result = bookings.filter((b) => b.date === date);
      }
      result = [...result].sort((a, b) => {
        const t = toMinutes(a.start) - toMinutes(b.start);
        if (t !== 0) return t;
        return a.room.localeCompare(b.room);
      });
      return sendJSON(res, 200, result);
    }

    // DELETE /api/bookings/:id
    if (method === 'DELETE' && pathname.startsWith('/api/bookings/')) {
      const idStr = pathname.split('/').pop();
      const id = Number(idStr);
      const idx = bookings.findIndex((b) => b.id === id);
      if (idx === -1) {
        return sendError(res, 404, `Booking with id ${idStr} not found.`);
      }
      const [removed] = bookings.splice(idx, 1);
      return sendJSON(res, 200, removed);
    }

    // GET /api/rooms/:room/free?date=YYYY-MM-DD
    const freeMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/free$/);
    if (method === 'GET' && freeMatch) {
      const room = decodeURIComponent(freeMatch[1]);
      if (!ROOMS.includes(room)) {
        return sendError(res, 404, `Room "${room}" does not exist. Valid rooms: ${ROOMS.join(', ')}.`);
      }
      const date = parsedUrl.searchParams.get('date');
      if (!date || !isValidDateFormat(date)) {
        return sendError(res, 400, 'Query param "date" (YYYY-MM-DD) is required.');
      }
      return sendJSON(res, 200, { room, date, free: freeSlotsForRoom(room, date) });
    }

    // Fallback: static frontend files
    if (method === 'GET') {
      return serveStatic(req, res, pathname);
    }

    return sendError(res, 404, 'Not found');
  } catch (e) {
    console.error(e);
    return sendError(res, 500, 'Internal server error');
  }
});

server.listen(PORT, () => {
  console.log(`Meeting Room Booking server running at http://localhost:${PORT}`);
});