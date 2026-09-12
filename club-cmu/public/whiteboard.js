var Whiteboard = (function () {
  "use strict";

  // Must match BOARD_WIDTH / BOARD_HEIGHT in server/application.mjs.
  var WIDTH = 1600;
  var HEIGHT = 600;
  var MAX_POINTS = 12000;

  var panel = document.getElementById("whiteboard-panel");
  var canvas = document.getElementById("whiteboard-canvas");
  var ctx = canvas.getContext("2d");
  var status = document.getElementById("whiteboard-status");

  // organizer.js reads the canvas size when it loads, so set it first.
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  // The Fence on the Cut: four thick posts and two heavy rails, with every
  // edge rounded by decades of paint. Only these parts can be painted; the
  // gaps between and below the rails show campus behind the fence.
  var GROUND_Y = 572;
  var FENCE_LEFT = 38;
  var POST_WIDTH = 96;
  var BAY_WIDTH = 380;
  var FENCE_RIGHT = FENCE_LEFT + POST_WIDTH * 4 + BAY_WIDTH * 3;

  var POSTS = [0, 1, 2, 3].map(function (i) {
    return {
      x: FENCE_LEFT + i * (POST_WIDTH + BAY_WIDTH),
      y: 10,
      width: POST_WIDTH,
      height: 580,
      radius: 30
    };
  });

  var RAILS = [100, 330].map(function (y) {
    return {
      x: FENCE_LEFT,
      y: y,
      width: FENCE_RIGHT - FENCE_LEFT,
      height: 150,
      radius: 22
    };
  });

  var FENCE_PARTS = POSTS.concat(RAILS);
  var fencePath = new Path2D();

  FENCE_PARTS.forEach(function (part) {
    addRoundedRect(fencePath, part);
  });

  // Every part is traced in the same direction, so with the nonzero rule the
  // overlapping posts and rails fill and clip as one silhouette.
  function addRoundedRect(path, part) {
    var right = part.x + part.width;
    var bottom = part.y + part.height;
    var r = part.radius;

    path.moveTo(part.x + r, part.y);
    path.arcTo(right, part.y, right, bottom, r);
    path.arcTo(right, bottom, part.x, bottom, r);
    path.arcTo(part.x, bottom, part.x, part.y, r);
    path.arcTo(part.x, part.y, right, part.y, r);
    path.closePath();
  }

  function isOnFence(point) {
    return ctx.isPointInPath(fencePath, point[0], point[1]);
  }

  // Persistent drawing data.
  var elements = [];
  var ready = false;

  // Temporary interaction data.
  var peers = new Map();
  var draft = null;
  var pointerId = null;
  var localCursor = null;
  var boardId = null;
  var tool = "pen";
  var lastCursorSent = 0;

  var identity = {
    playerId: makeId(),
    name: "Student",
    color: "#3388ff"
  };

  // Keep the local prototype's identity across refreshes in this tab.
  try {
    var savedId = sessionStorage.getItem("fence-author-id");

    if (savedId) identity.playerId = savedId;

    sessionStorage.setItem(
      "fence-author-id",
      identity.playerId
    );
  } catch (error) {}

  var api = {
    isOpen: false,
    onOpen: function () {},
    onClose: function () {},
    setReady: function(value) { ready = value; if (!value) cancelDraft(); status.textContent = value ? "Ready to draw." : "Connecting to saved board…"; },
    showError: function(message) { status.textContent = message; },
    open: open,
    close: close,
    loadBoard: loadBoard,
    applyElement: applyElement,
    removeElement: removeElement,
    updateCursor: updateCursor,
    removeCursor: removeCursor,
    setCursorIdentity: setCursorIdentity,

    // Local-only default: immediately accept our own additions.
    // Your teammates replace these with network requests later.
    onElementCreate: function (element) {
      applyElement(element);
    },

    onElementDelete: function (request) {
      removeElement(request);
    },

    onCursorMove: function () {},
    onCursorLeave: function () {},

    getElements: function () {
      // Return a copy so the organizer cannot accidentally edit the board.
      return JSON.parse(JSON.stringify(elements));
    },

    getBoardId: function () {
      return boardId;
    },
  };

  function makeId() {
    return crypto.randomUUID();
  }

  function validColor(color) {
    return typeof color === "string" &&
      /^#[0-9a-f]{6}$/i.test(color);
  }

  function validPoint(point) {
    return Array.isArray(point) &&
      point.length === 2 &&
      Number.isFinite(point[0]) &&
      Number.isFinite(point[1]) &&
      point[0] >= 0 &&
      point[0] <= WIDTH &&
      point[1] >= 0 &&
      point[1] <= HEIGHT;
  }

  function validElement(element) {
    if (
      !element ||
      typeof element.id !== "string" ||
      element.id.length > 128 ||
      element.boardId !== boardId ||
      typeof element.authorId !== "string" ||
      !validColor(element.color)
    ) {
      return false;
    }

    if (element.type === "stroke") {
      return Number.isFinite(element.width) &&
        element.width >= 1 &&
        element.width <= 16 &&
        Array.isArray(element.points) &&
        element.points.length > 0 &&
        element.points.length <= MAX_POINTS &&
        element.points.every(validPoint);
    }

    if (element.type === "text") {
      return validPoint([element.x, element.y]) &&
        typeof element.text === "string" &&
        element.text.length > 0 &&
        element.text.length <= 200;
    }

    return false;
  }

  function storageKey() {
    // Separate key so we don't overwrite the old pixel drawing.
    return "cmu-freehand-v1:" + boardId;
  }

  function save() { /* Persistence belongs to the server. */ }

  function loadBoard(data) {
    if (!Array.isArray(data)) return false;

    // Skip, rather than reject the whole board for, elements that don't fit
    // the current board, such as drawings saved before it became the Fence.
    elements = JSON.parse(JSON.stringify(data.filter(validElement)));
    render();
    return true;
  }

  function applyElement(element) {
    if (!validElement(element)) return false;

    // Ignore duplicate deliveries of the same operation.
    if (elements.some(function (item) {
      return item.id === element.id;
    })) {
      return false;
    }

    elements.push(JSON.parse(JSON.stringify(element)));
    save();
    render();
    return true;
  }

  function removeElement(request) {
    if (!request || request.boardId !== boardId) return;

    elements = elements.filter(function (element) {
      return element.id !== request.id;
    });

    save();
    render();
  }

  function drawElement(element) {
    ctx.strokeStyle = element.color;
    ctx.fillStyle = element.color;

    if (element.type === "text") {
      ctx.font = "24px Arial";
      ctx.textBaseline = "top";
      ctx.fillText(element.text, element.x, element.y);
      return;
    }

    var points = element.points;

    // A click without dragging makes a dot.
    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(
        points[0][0],
        points[0][1],
        element.width / 2,
        0,
        Math.PI * 2
      );
      ctx.fill();
      return;
    }

    ctx.lineWidth = element.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);

    for (var i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }

    ctx.stroke();
  }

  function drawCursor(cursor, isLocal) {
    var name = cursor.name.slice(0, 24) +
      (isLocal ? " (you)" : "");

    ctx.fillStyle = cursor.color;
    ctx.beginPath();
    ctx.arc(cursor.x, cursor.y, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = "14px Arial";
    var labelWidth = ctx.measureText(name).width + 12;

    // Keep the label within the board edges.
    var x = Math.max(
      0,
      Math.min(cursor.x + 10, WIDTH - labelWidth)
    );
    var y = Math.max(
      0,
      Math.min(cursor.y + 10, HEIGHT - 24)
    );

    ctx.fillRect(x, y, labelWidth, 24);
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "top";
    ctx.fillText(name, x + 6, y + 4);
  }

  function drawCampus() {
    ctx.fillStyle = "#cfe3f1";
    ctx.fillRect(0, 0, WIDTH, GROUND_Y);
    ctx.fillStyle = "#7faa5b";
    ctx.fillRect(0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y);
  }

  function drawFence() {
    // Stroke first, then fill over it, so only the outer silhouette keeps an
    // outline and the seams where posts overlap rails disappear.
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#4a3b2e";
    ctx.stroke(fencePath);
    ctx.fillStyle = "#efe8da";
    ctx.fill(fencePath);

    ctx.save();
    ctx.clip(fencePath);

    elements.forEach(drawElement);

    if (draft) drawElement(draft);

    // Faint post edges on top of the paint keep the fence readable once it
    // has been painted over.
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(40, 30, 20, 0.18)";
    POSTS.forEach(function (post) {
      var path = new Path2D();
      addRoundedRect(path, post);
      ctx.stroke(path);
    });

    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    drawCampus();
    drawFence();

    peers.forEach(function (cursor) {
      drawCursor(cursor, false);
    });

    if (localCursor) {
      drawCursor(
        Object.assign({}, identity, localCursor),
        true
      );
    }

    document.getElementById(
      "whiteboard-presence"
    ).textContent = peers.size + " other cursors";
  }

  function pointFromEvent(event) {
    var bounds = canvas.getBoundingClientRect();

    return [
      Math.max(0, Math.min(
        WIDTH,
        (event.clientX - bounds.left) /
          bounds.width * WIDTH
      )),
      Math.max(0, Math.min(
        HEIGHT,
        (event.clientY - bounds.top) /
          bounds.height * HEIGHT
      ))
    ];
  }

  function setLocalCursor(point) {
    localCursor = { x: point[0], y: point[1] };

    if (Date.now() - lastCursorSent >= 60) {
      sendCursor();
    }
  }

  function sendCursor() {
    if (!localCursor || !api.isOpen) return;

    lastCursorSent = Date.now();

    api.onCursorMove(Object.assign(
      {},
      identity,
      localCursor,
      { boardId: boardId }
    ));
  }

  function leaveCursor() {
    if (localCursor) {
      api.onCursorLeave({
        boardId: boardId,
        playerId: identity.playerId
      });
    }

    localCursor = null;
    render();
  }

  function updateCursor(cursor) {
    if (
      !api.isOpen ||
      !cursor ||
      cursor.boardId !== boardId ||
      cursor.playerId === identity.playerId ||
      typeof cursor.playerId !== "string" ||
      typeof cursor.name !== "string" ||
      !validColor(cursor.color) ||
      !validPoint([cursor.x, cursor.y])
    ) {
      return false;
    }

    peers.set(cursor.playerId, {
      playerId: cursor.playerId,
      name: cursor.name.slice(0, 24),
      color: cursor.color,
      x: cursor.x,
      y: cursor.y,
      seenAt: Date.now()
    });

    render();
    return true;
  }

  function removeCursor(playerId) {
    peers.delete(playerId);
    render();
  }

  function setCursorIdentity(nextIdentity) {
    if (
      !nextIdentity ||
      typeof nextIdentity.playerId !== "string" ||
      !nextIdentity.playerId ||
      typeof nextIdentity.name !== "string" ||
      !validColor(nextIdentity.color)
    ) {
      return false;
    }

    leaveCursor();

    identity = {
      playerId: nextIdentity.playerId,
      name: nextIdentity.name.slice(0, 24),
      color: nextIdentity.color
    };

    return true;
  }

  function cancelDraft() {
    var captured = pointerId;
    pointerId = null;
    draft = null;

    if (
      captured !== null &&
      canvas.hasPointerCapture(captured)
    ) {
      canvas.releasePointerCapture(captured);
    }

    render();
  }

  function open(id) {
    if (typeof id !== "string" || !id) return;

    cancelDraft();
    leaveCursor();
    peers.clear();
    boardId = id;
    elements = [];

    ready = false;

    api.isOpen = true;
      panel.hidden = false;
      chooseTool(tool);
      render();
      api.onOpen(boardId);
  }

  function close() {
    cancelDraft();
    leaveCursor();
    peers.clear();
    api.isOpen = false;
    panel.hidden = true;
    ready = false;
    api.onClose();
  }

  function chooseTool(nextTool) {
    tool = nextTool;

    document.getElementById(
      "whiteboard-pen"
    ).setAttribute("aria-pressed", String(tool === "pen"));

    document.getElementById(
      "whiteboard-text"
    ).setAttribute("aria-pressed", String(tool === "text"));

    status.textContent = tool === "pen"
      ? "Drag to draw. Undo removes your latest addition."
      : "Click to place a short text note.";
  }

  canvas.addEventListener("pointerdown", function (event) {
    if (
      !api.isOpen ||
      !event.isPrimary ||
      event.button !== 0 ||
      pointerId !== null
    ) {
      return;
    }

    event.preventDefault();

    var point = pointFromEvent(event);
    var color = document.getElementById(
      "whiteboard-color"
    ).value;

    setLocalCursor(point);

    if (tool === "text") {
      if (!isOnFence(point)) {
        status.textContent = "Click a post or rail to place a note.";
        return;
      }

      // Simple MVP editor. Replace with an inline text box later.
      leaveCursor();
      var text = window.prompt("Add a short note:");

      if (text && text.trim()) {
        api.onElementCreate({
          id: makeId(),
          boardId: boardId,
          authorId: identity.playerId,
          type: "text",
          x: Math.min(point[0], WIDTH - 30),
          y: Math.min(point[1], HEIGHT - 30),
          text: text.trim().slice(0, 200),
          color: color
        });
      }

      return;
    }

    pointerId = event.pointerId;
    canvas.setPointerCapture(pointerId);

    draft = {
      id: makeId(),
      boardId: boardId,
      authorId: identity.playerId,
      type: "stroke",
      points: [point],
      color: color,
      width: Number(document.getElementById(
        "whiteboard-width"
      ).value)
    };

    render();
  });

  canvas.addEventListener("pointermove", function (event) {
    if (!api.isOpen || !event.isPrimary) return;

    var point = pointFromEvent(event);
    setLocalCursor(point);
    canvas.style.cursor = draft || isOnFence(point) ? "crosshair" : "default";

    if (
      draft &&
      event.pointerId === pointerId &&
      draft.points.length < MAX_POINTS
    ) {
      var previous = draft.points[draft.points.length - 1];

      // Skip almost-identical points to keep strokes smaller.
      if (Math.hypot(
        point[0] - previous[0],
        point[1] - previous[1]
      ) >= 1) {
        draft.points.push(point);
      }
    }

    render();
  });

  canvas.addEventListener("pointerup", function (event) {
    if (event.pointerId !== pointerId) return;

    var completed = draft;
    cancelDraft();

    // A stroke entirely in the gaps would be saved but never visible.
    if (completed && completed.points.some(isOnFence)) {
      api.onElementCreate(completed);
    } else if (completed) {
      status.textContent = "Paint on the posts and rails. The gaps can't hold paint.";
    }

    leaveCursor();
  });

  canvas.addEventListener("pointercancel", function () {
    cancelDraft();
    leaveCursor();
  });

  canvas.addEventListener("lostpointercapture", function () {
    if (draft) {
      cancelDraft();
      leaveCursor();
    }
  });

  canvas.addEventListener("pointerleave", function () {
    if (!draft) leaveCursor();
  });

  document.getElementById(
    "whiteboard-pen"
  ).onclick = function () {
    chooseTool("pen");
  };

  document.getElementById(
    "whiteboard-text"
  ).onclick = function () {
    chooseTool("text");
  };

  document.getElementById(
    "whiteboard-close"
  ).onclick = close;

  document.getElementById(
    "whiteboard-undo"
  ).onclick = function () {
    if (!ready) return;
    for (var i = elements.length - 1; i >= 0; i--) {
      if (elements[i].authorId === identity.playerId) {
        api.onElementDelete({
          boardId: boardId,
          id: elements[i].id
        });
        return;
      }
    }
  };

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && api.isOpen) close();
  });

  window.addEventListener("blur", function () {
    cancelDraft();
    leaveCursor();
  });

  window.addEventListener("pagehide", leaveCursor);

  setInterval(function () {
    var changed = false;

    peers.forEach(function (cursor, id) {
      if (Date.now() - cursor.seenAt > 12000) {
        peers.delete(id);
        changed = true;
      }
    });

    if (
      localCursor &&
      Date.now() - lastCursorSent > 1000
    ) {
      sendCursor();
    }

    if (changed) render();
  }, 250);

  return api;
})();
