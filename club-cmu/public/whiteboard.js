var Whiteboard = (function () {
  var SIZE = 32;
  var COOLDOWN = 1000;
  var COLORS = [
    "#ffffff", "#222222", "#c41230", "#ffcc00",
    "#22aa66", "#3388ff", "#9955dd", "#ff88bb"
  ];

  var panel = document.getElementById("whiteboard-panel");
  var canvas = document.getElementById("whiteboard-canvas");
  var palette = document.getElementById("whiteboard-palette");
  var status = document.getElementById("whiteboard-status");
  var ctx = canvas.getContext("2d");
  var cellSize = canvas.width / SIZE;

  var pixels = [];
  var selectedColor = COLORS[2];
  var boardId = null;
  var nextPlacementAt = 0;
  var socket = null;
  var reconnectTimer = null;
  var connectionState = "disconnected";
  var clientId = getClientId();

  var api = {
    isOpen: false,
    open: open,
    close: close,
    applyPixel: applyPixel,
    loadBoard: loadBoard
  };

  function validColor(color) {
    return COLORS.indexOf(color) !== -1;
  }

  function getClientId() {
    var key = "cmu-whiteboard:client-id";

    try {
      var existing = localStorage.getItem(key);
      if (existing && /^[a-zA-Z0-9_-]{8,128}$/.test(existing)) return existing;

      var generated = window.crypto && window.crypto.randomUUID
        ? window.crypto.randomUUID()
        : "client-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
      localStorage.setItem(key, generated);
      return generated;
    } catch (error) {
      // A private browser window still receives an anonymous session id.
      return "client-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
    }
  }

  function draw() {
    pixels.forEach(function (color, index) {
      var x = index % SIZE;
      var y = Math.floor(index / SIZE);

      ctx.fillStyle = color;
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    });

    ctx.strokeStyle = "#dddddd";
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (var i = 0; i <= SIZE; i++) {
      var position = i * cellSize;
      ctx.moveTo(position, 0);
      ctx.lineTo(position, canvas.height);
      ctx.moveTo(0, position);
      ctx.lineTo(canvas.width, position);
    }

    ctx.stroke();
  }

  function loadBoard(data) {
    if (
      !Array.isArray(data) ||
      data.length !== SIZE * SIZE ||
      !data.every(validColor)
    ) {
      return false;
    }

    pixels = data.slice();
    draw();
    return true;
  }

  function open(id) {
    boardId = id;
    pixels = new Array(SIZE * SIZE).fill("#ffffff");
    draw();
    api.isOpen = true;
    panel.hidden = false;
    connect();
    updateStatus();
  }

  function close() {
    api.isOpen = false;
    panel.hidden = true;
    
  }

  function applyPixel(data) {
    if (
      !data ||
      data.boardId !== boardId ||
      !Number.isInteger(data.x) ||
      !Number.isInteger(data.y) ||
      data.x < 0 || data.x >= SIZE ||
      data.y < 0 || data.y >= SIZE ||
      !validColor(data.color)
    ) {
      return;
    }

    pixels[data.y * SIZE + data.x] = data.color;
    draw();
  }

  function socketUrl() {
    var protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return protocol + "//" + window.location.host + "/ws";
  }

  function send(message) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
      return true;
    }

    return false;
  }

  function connect() {
    if (
      socket &&
      (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    connectionState = "connecting";
    updateStatus();
    socket = new WebSocket(socketUrl());

    socket.addEventListener("open", function () {
      connectionState = "connected";
      send({ type: "join", boardId: boardId, clientId: clientId });
      updateStatus();
    });

    socket.addEventListener("message", function (event) {
      var message;

      try {
        message = JSON.parse(event.data);
      } catch (error) {
        return;
      }

      if (message.type === "snapshot" && message.boardId === boardId) {
        loadBoard(message.pixels);
      } else if (message.type === "pixel") {
        applyPixel(message);
      } else if (message.type === "error") {
        connectionState = "error";
        status.textContent = "Whiteboard error: " + message.message;
      }
    });

    socket.addEventListener("close", function () {
      socket = null;

      if (!api.isOpen) {
        return;
      }

      connectionState = "disconnected";
      updateStatus();
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, 1500);
    });

    socket.addEventListener("error", function () {
      connectionState = "error";
      updateStatus();
    });
  }

  function updateStatus() {
    var remaining = Math.max(0, nextPlacementAt - Date.now());

    if (connectionState === "connecting") {
      status.textContent = "Connecting to the shared whiteboard...";
      return;
    }

    if (connectionState === "disconnected" || connectionState === "error") {
      status.textContent = "Reconnecting to the shared whiteboard...";
      return;
    }

    status.textContent = remaining > 0
      ? "Next pixel in " + (remaining / 1000).toFixed(1) + "s"
      : "Pick a color, then click a pixel.";
  }

  COLORS.forEach(function (color) {
    var button = document.createElement("button");

    button.type = "button";
    button.style.backgroundColor = color;
    button.setAttribute("aria-label", "Select " + color);
    button.setAttribute("aria-pressed", String(color === selectedColor));

    button.addEventListener("click", function () {
      selectedColor = color;

      Array.from(palette.children).forEach(function (item) {
        item.setAttribute("aria-pressed", String(item === button));
      });
    });

    palette.appendChild(button);
  });

  canvas.addEventListener("click", function (event) {
    if (!api.isOpen || Date.now() < nextPlacementAt) return;

    var bounds = canvas.getBoundingClientRect();
    var x = Math.floor((event.clientX - bounds.left) / bounds.width * SIZE);
    var y = Math.floor((event.clientY - bounds.top) / bounds.height * SIZE);

    if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;

    if (!send({
      type: "place",
      boardId: boardId,
      x: x,
      y: y,
      color: selectedColor
    })) {
      status.textContent = "Not connected yet. Your pixel was not sent.";
      connect();
      return;
    }

    nextPlacementAt = Date.now() + COOLDOWN;

    updateStatus();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && api.isOpen) close();
  });

  setInterval(function () {
    if (api.isOpen) updateStatus();
  }, 100);

  document
  .getElementById("whiteboard-close")
  .addEventListener("click", close);
  return api;
})();
