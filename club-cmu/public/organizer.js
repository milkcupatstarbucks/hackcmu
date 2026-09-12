var Organizer = (function () {
  "use strict";

  var board = window.Whiteboard;
  var canvas = document.getElementById("whiteboard-canvas");
  var organizeButton = document.getElementById(
    "whiteboard-organize"
  );
  var status = document.getElementById("organizer-status");
  var topicList = document.getElementById("organizer-topics");
  var details = document.getElementById("organizer-details");

  var WIDTH = canvas.width;
  var HEIGHT = canvas.height;

  var groups = [];
  var selectedId = null;
  var groupedBoardId = null;
  var busy = false;
  var lastSignature = null;

  // Separate measuring context: don't change the drawing canvas state.
  var measureCanvas = document.createElement("canvas");
  var measure = measureCanvas.getContext("2d");
  measure.font = "24px Arial";

  // Wrap the existing canvas with a positioned overlay.
  var wrapper = document.createElement("div");
  wrapper.className = "organizer-board-wrap";

  canvas.parentNode.insertBefore(wrapper, canvas);
  wrapper.appendChild(canvas);

  var overlay = document.createElement("div");
  overlay.className = "organizer-overlay";
  wrapper.appendChild(overlay);

  var TOPICS = [
    {
      id: "study",
      title: "Study spots",
      color: "#356baf",
      background: "#356baf10",
      words: ["study", "library", "quiet", "desk", "homework"]
    },
    {
      id: "food",
      title: "Food and coffee",
      color: "#a45323",
      background: "#a4532310",
      words: ["food", "coffee", "lunch", "dinner", "eat", "cafe"]
    },
    {
      id: "research",
      title: "Research and opportunities",
      color: "#7952a5",
      background: "#7952a510",
      words: ["research", "lab", "internship", "professor", "project"]
    },
    {
      id: "campus",
      title: "Campus life",
      color: "#377c56",
      background: "#377c5610",
      words: ["club", "dorm", "event", "roommate", "society"]
    }
  ];

  var OTHER = {
    id: "other",
    title: "Other conversations",
    color: "#737373",
    background: "#73737310"
  };

  var api = {
    // Replace this with a backend request later.
    proposeGroups: proposeGroups,
    loadOrganization: function (saved) {
      groups = []; selectedId = null;
      groupedBoardId = board.getBoardId();
      if (saved && saved.boardId === groupedBoardId) groups = normalizeGroups(saved, getNotes());
      lastSignature = signature(getNotes());
      selectedId = groups[0]?.id || null;
      render();
      status.textContent = saved ? "Saved topic groups. Organize again after new notes." : "Add notes and ask Scotty to organize.";
    }
  };

  function getNotes() {
    return board.getElements().filter(function (element) {
      return element.type === "text";
    });
  }

  function signature(notes) {
    return JSON.stringify(notes.map(function (note) {
      return [note.id, note.text, note.x, note.y];
    }));
  }

  // This is a local keyword prototype, not an AI model.
  async function proposeGroups(notes) {
    var buckets = new Map();

    notes.forEach(function (note) {
      var words = new Set(
        note.text.toLowerCase().match(/[a-z]+/g) || []
      );

      var winner = OTHER;
      var bestScore = 0;

      TOPICS.forEach(function (topic) {
        var score = topic.words.filter(function (word) {
          return words.has(word);
        }).length;

        if (score > bestScore) {
          bestScore = score;
          winner = topic;
        }
      });

      if (!buckets.has(winner.id)) {
        buckets.set(winner.id, {
          id: winner.id,
          title: winner.title,
          elementIds: []
        });
      }

      buckets.get(winner.id).elementIds.push(note.id);
    });

    return {
      groups: Array.from(buckets.values())
    };
  }

  function topicStyle(id) {
    return TOPICS.find(function (topic) {
      return topic.id === id;
    }) || OTHER;
  }

  // Validate the proposed groups before displaying them.
  function normalizeGroups(result, notes) {
    if (!result || !Array.isArray(result.groups)) {
      throw new Error("Organizer returned an invalid result.");
    }

    var validIds = new Set(notes.map(function (note) {
      return note.id;
    }));

    var usedGroupIds = new Set();

    return result.groups.slice(0, 12).map(function (group, index) {
      if (!group || typeof group.title !== "string") return null;

      var id = typeof group.id === "string"
        ? group.id.slice(0, 80)
        : "topic-" + index;

      if (usedGroupIds.has(id)) return null;
      usedGroupIds.add(id);

      var ids = Array.isArray(group.elementIds)
        ? Array.from(new Set(group.elementIds.filter(function (id) {
            return validIds.has(id);
          })))
        : [];

      if (!ids.length) return null;

      return {
        id: id,
        title: group.title.slice(0, 60),
        elementIds: ids
      };
    }).filter(Boolean);
  }

  function notesForGroup(group, notes) {
    var ids = new Set(group.elementIds);

    return notes.filter(function (note) {
      return ids.has(note.id);
    });
  }

  function boundsForNotes(notes) {
    var left = WIDTH;
    var top = HEIGHT;
    var right = 0;
    var bottom = 0;

    notes.forEach(function (note) {
      var textWidth = measure.measureText(note.text).width;

      left = Math.min(left, note.x);
      top = Math.min(top, note.y);
      right = Math.max(right, note.x + textWidth);
      bottom = Math.max(bottom, note.y + 28);
    });

    // Add space for the category label and clamp to the board.
    left = Math.max(0, left - 12);
    top = Math.max(0, top - 30);
    right = Math.min(WIDTH, right + 12);
    bottom = Math.min(HEIGHT, bottom + 12);

    return {
      x: left,
      y: top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top)
    };
  }

  function selectGroup(id) {
    selectedId = id;
    render();
  }

  function render() {
    overlay.replaceChildren();
    topicList.replaceChildren();
    details.replaceChildren();

    var notes = getNotes();

    groups.forEach(function (group) {
      var members = notesForGroup(group, notes);
      if (!members.length) return;

      var style = topicStyle(group.id);
      var bounds = boundsForNotes(members);

      var region = document.createElement("div");
      region.className = "organizer-region";

      if (group.id === selectedId) {
        region.classList.add("is-selected");
      }

      region.style.left = bounds.x / WIDTH * 100 + "%";
      region.style.top = bounds.y / HEIGHT * 100 + "%";
      region.style.width = bounds.width / WIDTH * 100 + "%";
      region.style.height = bounds.height / HEIGHT * 100 + "%";
      region.style.setProperty("--topic-color", style.color);
      region.style.setProperty(
        "--topic-background",
        style.background
      );

      var label = document.createElement("button");
      label.type = "button";
      label.className = "organizer-label";
      label.textContent = group.title;
      label.onclick = function () {
        selectGroup(group.id);
      };

      region.appendChild(label);
      overlay.appendChild(region);

      var chip = document.createElement("button");
      chip.type = "button";
      chip.textContent = group.title + " · " + members.length;
      chip.setAttribute(
        "aria-pressed",
        String(group.id === selectedId)
      );
      chip.onclick = function () {
        selectGroup(group.id);
      };

      topicList.appendChild(chip);

      if (group.id === selectedId) {
        renderDetails(group, members);
      }
    });
  }

  function renderDetails(group, notes) {
    var heading = document.createElement("h3");
    heading.textContent = group.title;
    details.appendChild(heading);

    var explanation = document.createElement("p");
    explanation.textContent =
      "Original student notes in this suggested group:";
    details.appendChild(explanation);

    notes.forEach(function (note) {
      var item = document.createElement("div");
      item.className = "organizer-note";
      item.textContent = note.text;
      details.appendChild(item);
    });

    var rename = document.createElement("button");
    rename.textContent = "Rename group";
    rename.onclick = function () {
      var title = window.prompt("Category name:", group.title);

      if (title && title.trim()) {
        group.title = title.trim().slice(0, 60);
        render();
      }
    };

    var dismiss = document.createElement("button");
    dismiss.textContent = "Dismiss group";
    dismiss.onclick = function () {
      groups = groups.filter(function (item) {
        return item.id !== group.id;
      });

      selectedId = null;
      render();
    };

    details.append(rename, dismiss);
  }

  organizeButton.addEventListener("click", async function () {
    if (busy) return;

    var notes = getNotes();

    if (!notes.length) {
      status.textContent = "Add at least one text note first.";
      return;
    }

    var requestedBoard = board.getBoardId();
    var requestedSignature = signature(notes);

    busy = true;
    organizeButton.disabled = true;
    status.textContent = "Finding topics…";

    try {
      var result = await api.proposeGroups(notes);
      if (board.getBoardId() === requestedBoard && result.sourceRevision !== undefined) { api.loadOrganization(result); return; }

      // Don't apply results to a different or changed board.
      if (
        board.getBoardId() !== requestedBoard ||
        signature(getNotes()) !== requestedSignature
      ) {
        status.textContent =
          "The board changed. Click Organize again.";
        return;
      }

      groups = normalizeGroups(result, notes);
      groupedBoardId = requestedBoard;
      lastSignature = requestedSignature;
      selectedId = groups.length ? groups[0].id : null;

      render();

      status.textContent =
        groups.length +
" suggested topics. Your notes were not changed.";
    } catch (error) {
      status.textContent =
        "Could not organize: " + error.message;
    } finally {
      busy = false;
      organizeButton.disabled = false;
    }
  });

  // Keep results honest when notes change after organizing.
  setInterval(function () {
    if (!board.isOpen) return;

    if (
      groupedBoardId !== null &&
      board.getBoardId() !== groupedBoardId
    ) {
      groups = [];
      selectedId = null;
      groupedBoardId = null;
      lastSignature = null;
      render();
      status.textContent = "Organize this board to find topics.";
      return;
    }

    if (lastSignature !== null) {
      var currentSignature = signature(getNotes());

      if (currentSignature !== lastSignature) {
        lastSignature = currentSignature;
        render();
        status.textContent =
          "Notes changed. Organize again to update topic membership.";
      }
    }
  }, 500);

  return api;
})();
