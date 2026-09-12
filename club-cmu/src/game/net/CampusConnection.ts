import { getAccessToken, getUser } from '../../auth/auth0';
import type { Facing } from '../campus/scotty';

export interface PlayerState
{
    id: string;
    name: string;
    look: number;
    x: number;
    y: number;
    facing: Facing;
    moving: boolean;
}

export type Movement = Pick<PlayerState, 'x' | 'y' | 'facing' | 'moving'>;

export interface CampusEvents
{
    welcome (you: PlayerState, players: PlayerState[]): void;
    joined (player: PlayerState): void;
    moved (id: string, movement: Movement): void;
    left (id: string): void;
    replaced (): void;
    status (message: string | null): void;
}

type ServerMessage =
    | { type: 'campus-welcome', you: PlayerState, players: PlayerState[] }
    | { type: 'player-joined', player: PlayerState }
    | ({ type: 'player-moved', id: string } & Movement)
    | { type: 'player-left', id: string }
    | { type: 'campus-replaced' }
    | { type: 'error', message: string };

//  Movement goes out at most this often; the server drops faster updates.
const SEND_INTERVAL = 100;

//  The anonymous id local demo mode signs players in with. It is the same
//  session key whiteboard-network.js uses, so the campus and the board see
//  the same player.
function clientId ()
{
    const key = 'board-connection-id';
    const existing = sessionStorage.getItem(key);

    if (existing)
    {
        return existing;
    }

    const id = crypto.randomUUID();
    sessionStorage.setItem(key, id);

    return id;
}

//  One player's presence on campus: logs on over the shared /ws socket,
//  reconnects with backoff, and logs off when told to or when the page closes.
export class CampusConnection
{
    private socket: WebSocket | null = null;
    private loggedOn = false;
    private stopped = false;
    private retryTimer = 0;
    private retryDelay = 1000;
    private lastError: string | null = null;

    private latest: Movement | null = null;
    private lastSentKey = '';
    private lastSentAt = 0;

    constructor (private readonly events: CampusEvents)
    {
    }

    logOn ()
    {
        this.stopped = false;
        this.open();
    }

    logOff ()
    {
        if (this.stopped)
        {
            return;
        }

        this.stopped = true;
        window.clearTimeout(this.retryTimer);
        this.send({ type: 'campus-leave' });
        this.socket?.close();
        this.socket = null;
        this.loggedOn = false;
    }

    //  Record where the local player is; `flush` decides when to send it.
    setMovement (movement: Movement)
    {
        this.latest = movement;
    }

    //  Call every frame. Sends the newest movement once the interval has
    //  passed, so the final "stopped" state is never lost to throttling.
    flush ()
    {
        if (!this.loggedOn || this.latest === null || performance.now() - this.lastSentAt < SEND_INTERVAL)
        {
            return;
        }

        const movement = { ...this.latest, x: Math.round(this.latest.x), y: Math.round(this.latest.y) };
        const key = JSON.stringify(movement);

        if (key !== this.lastSentKey && this.send({ type: 'campus-move', ...movement }))
        {
            this.lastSentKey = key;
            this.lastSentAt = performance.now();
        }
    }

    private open ()
    {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

        this.socket = socket;

        socket.addEventListener('open', () => this.join());

        socket.addEventListener('message', (event) => {

            let message: ServerMessage;

            try
            {
                message = JSON.parse(event.data);
            }
            catch
            {
                return;
            }

            this.handle(message);

        });

        socket.addEventListener('close', () => {

            if (this.socket !== socket)
            {
                return;
            }

            this.socket = null;
            this.loggedOn = false;

            if (this.stopped)
            {
                return;
            }

            this.events.status(`${this.lastError ?? 'Connection lost.'} Reconnecting...`);
            this.retryTimer = window.setTimeout(() => this.open(), this.retryDelay);
            this.retryDelay = Math.min(this.retryDelay * 2, 8000);
        });
    }

    private async join ()
    {
        const token = await getAccessToken();

        this.send({
            type: 'campus-join',
            token,
            clientId: clientId(),
            name: getUser()?.name ?? 'Student',
            //  After a dropped connection, pick up where the player was standing.
            ...(this.latest ? { x: Math.round(this.latest.x), y: Math.round(this.latest.y) } : {})
        });
    }

    private handle (message: ServerMessage)
    {
        switch (message.type)
        {
            case 'campus-welcome':
                this.loggedOn = true;
                this.lastError = null;
                this.lastSentKey = '';
                this.retryDelay = 1000;
                this.events.status(null);
                this.events.welcome(message.you, message.players);
                break;

            case 'player-joined':
                this.events.joined(message.player);
                break;

            case 'player-moved':
                this.events.moved(message.id, message);
                break;

            case 'player-left':
                this.events.left(message.id);
                break;

            case 'campus-replaced':
                this.logOff();
                this.events.replaced();
                break;

            case 'error':
                this.lastError = message.message;
                this.events.status(message.message);
                break;
        }
    }

    private send (data: object)
    {
        if (this.socket?.readyState !== WebSocket.OPEN)
        {
            return false;
        }

        this.socket.send(JSON.stringify(data));

        return true;
    }
}
