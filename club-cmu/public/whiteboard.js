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

  var api = {
    isOpen: false,
    open: open,
    close: close,
    applyPixel: applyPixel,
    loadBoard: loadBoard,

    // Replace this function when connecting multiplayer.
    onPlacePixel: function (placement) {
      applyPixel(placement);
    }
  };

  function storageKey() {
    return "cmu-whiteboard:" + boardId;
  }

  function validColor(color) {
    return COLORS.indexOf(color) !== -1;
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

    try {
      var saved = JSON.parse(localStorage.getItem(storageKey()));
      loadBoard(saved);
    } catch (error) {
      // Missing or invalid local data starts with a blank board.
    }

    draw();
    api.isOpen = true;
    panel.hidden = false;
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

    try {
      localStorage.setItem(storageKey(), JSON.stringify(pixels));
    } catch (error) {
      // Drawing still works when browser storage is unavailable.
    }
  }

  function updateStatus() {
    var remaining = Math.max(0, nextPlacementAt - Date.now());

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

    nextPlacementAt = Date.now() + COOLDOWN;

    api.onPlacePixel({
      boardId: boardId,
      x: x,
      y: y,
      color: selectedColor
    });

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