import { getStartupWelcomeText } from "@cinnabar-forge/utils";
import "dotenv/config";
import express from "express";
import fsSync from "fs";
import fs from "fs/promises";
import http from "http";
import multer from "multer";
import os from "os";
import path from "path";
import { Server, Socket } from "socket.io";

import { CINNABAR_PROJECT_VERSION } from "./cinnabar.js";

const INSTANCE_NAME = process.env.INSTANCE_NAME || "Default";

const generateInstanceCode = () => {
  let code = INSTANCE_NAME.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
  if (code === "") {
    code = "default";
  }
  return code;
};

const INSTANCE_CODE = process.env.INSTANCE_CODE || generateInstanceCode();

interface Note {
  content: string;
  creator: string;
  date: string;
  id: string;
  ip: string;
  timestamp: number;
}

interface File {
  creator: string;
  date: string;
  id: string;
  ip: string;
  name: string;
  timestamp: number;
}

interface User {
  id: string;
  ip: string;
  username: string;
}

interface LogEntry {
  action: string;
  ip: string;
  name: string;
  time: string;
  timestamp: number;
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const notes: Note[] = [];
const files: File[] = [];
const users: User[] = [];
const logEntries: LogEntry[] = [];

const CONTENTS_FOLDER =
  process.env.CONTENT_PATH ||
  path.resolve(
    os.homedir(),
    ".cache",
    "cinnabar-forge",
    "bistro-shara",
    INSTANCE_CODE,
  );

const NOTES_FILE = path.resolve(CONTENTS_FOLDER, "notes.json");
const METADATA_FILE = path.resolve(CONTENTS_FOLDER, "files-data.json");
const FILES_DIR = path.resolve(CONTENTS_FOLDER, "files");
const LOG_FILE = path.resolve(CONTENTS_FOLDER, "log.json");

app.use(express.static(path.join(import.meta.dirname, "..", "client")));
app.use(
  express.static(
    path.join(import.meta.dirname, "..", "node_modules", "marked"),
  ),
);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, FILES_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage: storage });

app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded.");
  }

  // const currentTimestamp = Date.now();
  // new Date(currentTimestamp).toISOString()
  const currentTimestamp = Date.now();

  const file: File = {
    creator: req.body.creator,
    date: new Date(currentTimestamp).toISOString(),
    id: req.file.filename,
    ip: req.ip || "unknown-ip",
    name: req.file.originalname,
    timestamp: currentTimestamp,
  };

  files.push(file);
  saveFiles();
  io.emit("fileCreated", file);
  logActivity(file.creator, file.ip, `uploaded file ${file.name}`);

  res.status(200).send("File uploaded successfully.");
});

app.get("/download/:id", (req, res) => {
  const file = files.find((f) => f.id === req.params.id);
  if (!file) {
    return res.status(404).send("File not found.");
  }

  res.download(path.join(FILES_DIR, file.id), file.name);
});

app.get("/appData", (req, res) => {
  res.json({
    header: process.env.INSTANCE_NAME || "Notes and file sharing",
    version: CINNABAR_PROJECT_VERSION,
  });
});

/**
 *
 */
async function loadData() {
  try {
    if (!fsSync.existsSync(NOTES_FILE)) {
      await fs.writeFile(NOTES_FILE, "[]");
    }
    if (!fsSync.existsSync(METADATA_FILE)) {
      await fs.writeFile(METADATA_FILE, "[]");
    }
    const notesData = await fs.readFile(NOTES_FILE, "utf-8");
    notes.push(...JSON.parse(notesData));

    const filesMetadata = await fs.readFile(METADATA_FILE, "utf-8");
    files.push(...JSON.parse(filesMetadata));

    const existingFilenames = files.map((file) => file.id);

    const filesData = await fs.readdir(FILES_DIR);
    for (const filename of filesData) {
      if (!existingFilenames.includes(filename)) {
        const stats = await fs.stat(path.join(FILES_DIR, filename));
        files.push({
          creator: "uid-" + stats.uid,
          date: stats.birthtime.toISOString(),
          id: filename,
          ip: "Unknown",
          name: filename,
          timestamp: 0,
        });
      }
    }

    if (!fsSync.existsSync(LOG_FILE)) {
      await fs.writeFile(LOG_FILE, "[]");
    }

    const logData = await fs.readFile(LOG_FILE, "utf-8");
    logEntries.push(...JSON.parse(logData));
  } catch (error) {
    console.error("Error loading data:", error);
  }
}

/**
 *
 */
async function saveNotes() {
  try {
    await fs.writeFile(NOTES_FILE, JSON.stringify(notes, null, 2));
  } catch (error) {
    console.error("Error saving notes:", error);
  }
}

/**
 *
 */
async function saveFiles() {
  try {
    await fs.writeFile(METADATA_FILE, JSON.stringify(files, null, 2));
  } catch (error) {
    console.error("Error saving file metadata:", error);
  }
}

/**
 *
 */
async function saveLog() {
  try {
    await fs.writeFile(LOG_FILE, JSON.stringify(logEntries, null, 2));
  } catch (error) {
    console.error("Error saving log:", error);
  }
}

/**
 *
 * @param name
 * @param ip
 * @param action
 */
function logActivity(name: string, ip: string, action: string) {
  const currentTimestamp = Date.now();
  const logEntry: LogEntry = {
    action,
    ip,
    name,
    time: new Date(currentTimestamp).toISOString(),
    timestamp: currentTimestamp,
  };
  logEntries.push(logEntry);
  saveLog();
  io.emit("logEntry", logEntry);
  console.log(`[${logEntry.time}] ${name} (${ip}): ${action}`);
}

io.use((socket: Socket, next) => {
  const username = socket.handshake.auth.username;
  const accessToken = socket.handshake.auth.accessToken;

  if (!username) {
    return next(new Error("Invalid username"));
  }

  if (process.env.ACCESS_TOKEN && accessToken !== process.env.ACCESS_TOKEN) {
    return next(new Error("Invalid access token"));
  }

  const existingUser = users.find((u) => u.username === username);
  if (existingUser) {
    return next(new Error("Username already taken"));
  }

  (socket as any).username = username;
  next();
});

io.on("connection", (socket: Socket) => {
  const ip =
    socket.handshake.headers["x-forwarded-for"] || socket.handshake.address;
  const user: User = {
    id: socket.id,
    ip: typeof ip === "string" ? ip : ip[0],
    username: (socket as any).username,
  };

  socket.emit("initialData", {
    appVersion: CINNABAR_PROJECT_VERSION,
    files,
    logEntries,
    notes,
    users,
  });
  users.push(user);
  io.emit("userJoined", user);
  logActivity(user.username, user.ip, "entered");

  socket.on("createNote", (content: string) => {
    const currentTimestamp = Date.now();

    const newNote: Note = {
      content,
      creator: user.username,
      date: new Date(currentTimestamp).toISOString(),
      id: currentTimestamp.toString(),
      ip: user.ip,
      timestamp: currentTimestamp,
    };
    notes.push(newNote);
    saveNotes();
    io.emit("noteCreated", newNote);
    logActivity(user.username, user.ip, "created a note");
  });

  socket.on("deleteNote", (id: string) => {
    const index = notes.findIndex(
      (note) => note.id === id && note.creator === user.username,
    );
    if (index !== -1) {
      notes.splice(index, 1);
      saveNotes();
      io.emit("noteDeleted", id);
      logActivity(user.username, user.ip, `deleted note ${id}`);
    }
  });

  socket.on("deleteFile", (id: string) => {
    const index = files.findIndex(
      (file) => file.id === id && file.creator === user.username,
    );
    if (index !== -1) {
      const file = files[index];
      files.splice(index, 1);
      fs.unlink(path.join(FILES_DIR, file.id)).catch(console.error);
      saveFiles();
      io.emit("fileDeleted", id);
      logActivity(user.username, user.ip, `deleted file ${file.name}`);
    }
  });

  socket.on("disconnect", () => {
    const index = users.findIndex((u) => u.id === socket.id);
    if (index !== -1) {
      const user = users[index];
      users.splice(index, 1);
      io.emit("userLeft", user);
      logActivity(user.username, user.ip, "exited");
    }
  });
});

const PORT = Number(process.env.PORT) || 3000;
server.listen(PORT, async () => {
  await fs.mkdir(CONTENTS_FOLDER, { recursive: true });
  await fs.mkdir(FILES_DIR, { recursive: true });
  await loadData();
  console.log(
    getStartupWelcomeText(
      "bistro-shara",
      CINNABAR_PROJECT_VERSION,
      process.env.NODE_ENV === "production",
      "http",
      PORT,
      `(instance ${INSTANCE_NAME} '${INSTANCE_CODE}') is running`,
    ),
  );
});
