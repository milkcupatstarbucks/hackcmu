(function () {
  var board = window.Whiteboard, socket = null, retry = null, wanted = null, revision = 0, ready = false;
  var options = { getToken: async function () { return null; }, getName: function () { return 'Student'; } };
  var clientId = sessionStorage.getItem('board-connection-id') || crypto.randomUUID();
  sessionStorage.setItem('board-connection-id', clientId);
  window.BoardConnection = {
    configure: function (value) { options = Object.assign(options, value); },
    headers: async function () { var token = await options.getToken(); return Object.assign({ 'Content-Type': 'application/json', 'X-Client-Id': clientId }, token ? { Authorization: 'Bearer ' + token } : {}); },
    isReady: function () { return ready; }
  };
  function send(data) { if (!socket || socket.readyState !== WebSocket.OPEN) return false; socket.send(JSON.stringify(data)); return true; }
  async function join() {
    var id = wanted;
    try { var token = await options.getToken(); if (id !== wanted || !id) return; send({ type: 'join-elements', boardId: id, token: token, clientId: clientId, name: options.getName() }); }
    catch { board.showError('Sign in again to connect.'); }
  }
  function connect() {
    if (!wanted) return;
    if (socket && socket.readyState === WebSocket.OPEN) { join(); return; }
    if (socket && socket.readyState === WebSocket.CONNECTING) return;
    var current = socket = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    current.onopen = join;
    current.onmessage = function (event) {
      var m; try { m = JSON.parse(event.data); } catch { return; }
      if (m.type === 'error') { board.showError(m.message); return; }
      if (m.boardId !== wanted) return;
      if (m.type === 'elements-snapshot') {
        board.loadBoard(m.elements); revision = m.revision; ready = true;
        board.setCursorIdentity(m.identity); board.setReady(true);
        Organizer.loadOrganization(m.organization);
      } else if (m.type === 'element-created' || m.type === 'element-deleted') {
        if (!ready || m.revision <= revision) return;
        if (m.revision !== revision + 1) { ready = false; board.setReady(false); join(); return; }
        if (m.type === 'element-created') board.applyElement(m.element); else board.removeElement(m);
        revision = m.revision;
      } else if (m.type === 'cursor-move') board.updateCursor(m);
      else if (m.type === 'cursor-leave') board.removeCursor(m.playerId);
      else if (m.type === 'organization-updated') Organizer.loadOrganization(m.organization);
    };
    current.onclose = function () { if (socket !== current) return; socket = null; ready = false; board.setReady(false); if (wanted) retry = setTimeout(connect, 1500); };
    current.onerror = function () { board.showError('Connection interrupted; reconnecting…'); };
  }
  board.onOpen = function (id) { wanted = id; ready = false; board.setReady(false); Organizer.loadOrganization(null); clearTimeout(retry); connect(); };
  board.onClose = function () { send({ type: 'leave' }); wanted = null; ready = false; clearTimeout(retry); };
  board.onElementCreate = function (element) { if (!ready || !send({ type: 'element-create', boardId: wanted, element: element })) board.showError('Not connected. This drawing was not saved.'); };
  board.onElementDelete = function (m) { if (ready) send({ type: 'element-delete', boardId: wanted, id: m.id }); };
  board.onCursorMove = function (m) { if (ready) send(Object.assign({}, m, { type: 'cursor-move' })); };
  board.onCursorLeave = function (m) { send(Object.assign({}, m, { type: 'cursor-leave' })); };
})();
