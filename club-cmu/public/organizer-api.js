Organizer.proposeGroups = async function () {
  if (!BoardConnection.isReady()) throw Error('Wait for the saved board to load.');
  const response = await fetch('/api/organize', {
    method: 'POST', headers: await BoardConnection.headers(),
    signal: AbortSignal.timeout(110000),
    body: JSON.stringify({ boardId: Whiteboard.getBoardId() })
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || 'Organization failed.');
  return result;
};
