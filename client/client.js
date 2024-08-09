const loginForm = document.getElementById("loginForm");
const usernameInput = document.getElementById("username");
const accessTokenInput = document.getElementById("accessToken");
const loginButton = document.getElementById("loginButton");
const app = document.getElementById("app");

async function fetchAppVersion() {
  const appHeaderSpan = document.getElementById("appHeader");
  const appVersionSpan = document.getElementById("appVersion");
  try {
    const response = await fetch("/appData");
    if (!response.ok) {
      throw new Error("Network response was not ok");
    }
    const data = await response.json();
    appHeaderSpan.innerHTML = data.header;
    appVersionSpan.innerHTML = " v" + data.version;
  } catch (error) {
    console.error("There was a problem with the fetch operation:", error);
  }
}

fetchAppVersion();

const noteForm = document.getElementById("noteForm");
const noteContent = document.getElementById("noteContent");
const contentList = document.getElementById("contentList");
const fileForm = document.getElementById("fileForm");
const fileInput = document.getElementById("fileInput");
const userList = document.getElementById("userList");
const activityLog = document.getElementById("activityLog");

let socket;
let currentUser;

loginButton.addEventListener("click", () => {
  const username = usernameInput.value.trim();
  const accessToken = accessTokenInput.value.trim();
  if (username) {
    socket = io({ auth: { username, accessToken } });

    socket.on("connect_error", (err) => {
      if (err.message === "Username already taken") {
        alert("Username already taken. Please choose another.");
      } else if (err.message === "Invalid access token") {
        alert("Invalid access token. Please try again.");
      } else {
        console.error(err);
      }
    });

    socket.on("connect", () => {
      setupSocketListeners();
      loginForm.style.display = "none";
      app.style.display = "block";
      currentUser = username;
    });
  }
});

function setupSocketListeners() {
  socket.on("initialData", ({ notes, files, users, logEntries }) => {
    contentList.innerHTML = "";
    userList.innerHTML = "";
    activityLog.innerHTML = "";
    notes.forEach((note) => addNoteToDOM(note));
    files.forEach((file) => addFileToDOM(file));
    users.forEach((user) => addUserToDOM(user));
    logEntries.forEach((entry) => addLogEntryToDOM(entry));
  });

  socket.on("noteCreated", (note) => addNoteToDOM(note));
  socket.on("noteDeleted", (id) => removeElementById(`note-${id}`));
  socket.on("fileCreated", (file) => addFileToDOM(file));
  socket.on("fileDeleted", (id) => removeElementById(`file-${id}`));
  socket.on("userJoined", (user) => addUserToDOM(user));
  socket.on("userLeft", (user) => removeElementById(`user-${user.id}`));
  socket.on("logEntry", (entry) => addLogEntryToDOM(entry));
}

noteForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const content = noteContent.value.trim();
  if (content) {
    socket.emit("createNote", content);
    noteContent.value = "";
  }
});

fileForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const file = fileInput.files[0];
  if (file) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("creator", currentUser);

    try {
      const response = await fetch("/upload", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        throw new Error("File upload failed");
      }
      fileInput.value = "";
    } catch (error) {
      console.error("Error uploading file:", error);
      alert("File upload failed. Please try again.");
    }
  }
});

function addNoteToDOM(note) {
  const card = createCard(
    note.id,
    "note",
    note.creator,
    note.ip,
    note.date,
    marked.parse(note.content),
    note.creator === currentUser,
    () => socket.emit("deleteNote", note.id),
  );
  contentList.appendChild(card);
}

function addFileToDOM(file) {
  const card = createCard(
    file.id,
    "file",
    file.creator,
    file.ip,
    file.date,
    `<a href="/download/${file.id}" download="${file.name}">${file.name}</a>`,
    file.creator === currentUser,
    () => socket.emit("deleteFile", file.id),
  );
  contentList.appendChild(card);
}

function addUserToDOM(user) {
  const li = document.createElement("li");
  li.id = `user-${user.id}`;
  li.textContent = `${user.username} (${user.ip})`;
  userList.appendChild(li);
}

function addLogEntryToDOM(entry) {
  const li = document.createElement("li");
  li.textContent = `[${entry.time}] ${entry.name} (${entry.ip}): ${entry.action}`;
  activityLog.appendChild(li);
}

function createCard(id, type, creator, ip, date, content, canDelete, onDelete) {
  const card = document.createElement("div");
  card.id = `${type}-${id}`;
  card.className = "card";
  card.innerHTML = `
    <div class="card-header">
    ${type}
    </div>
    <div class="card-info">
      <div class="creator">${creator}</div>
      <div class="ip">${ip}</div>
      <div class="date">${new Date(date).toLocaleString()}</div>
    </div>
    
    <div class="card-content">${content}</div>
    ${
      canDelete
        ? `<button class="delete-btn" onclick="deleteWithConfirmation('${type}', '${id}')">Delete</button>`
        : ""
    }
  `;
  return card;
}

function deleteWithConfirmation(type, id) {
  if (confirm(`Are you sure you want to delete this ${type}?`)) {
    socket.emit(`delete${type.charAt(0).toUpperCase() + type.slice(1)}`, id);
  }
}

function removeElementById(id) {
  const element = document.getElementById(id);
  if (element) element.remove();
}
