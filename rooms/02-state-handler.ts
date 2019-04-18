import { Room } from "colyseus";
import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";

export class Vector extends Schema {
    @type("number")
    x: number;

    @type("number")
    y: number;

    constructor(x: number, y: number) {
        super();

        this.x = x;
        this.y = y;
    }

    mag(): number {
        return Math.sqrt(Math.pow(this.x, 2) + Math.pow(this.y, 2));
    }

    normalized(): Vector {
        return new Vector(this.x / this.mag(), this.y / this.mag());
    }
}

export class Entity extends Schema {
    @type(Vector)
    pos: Vector = new Vector(0, 0);
}

export abstract class MovingEntity extends Entity {
    movement: Vector = new Vector(0, 0);

    @type(Vector)
    velocity: Vector;

    @type("number")
    speed: number;

    constructor() {
        super();

        this.speed = this.getSpeed();
    }

    setMovement(movement: Vector){
        this.movement = movement;
    }

    abstract getSpeed(): number;

    move (deltaTime: number) {
        if (this.movement.x) {
            this.pos.x += this.movement.x * this.getSpeed() * deltaTime;
        }
        if (this.movement.y) {
            this.pos.y += this.movement.y * this.getSpeed() * deltaTime;
        }
        this.velocity = new Vector(this.movement.x * this.getSpeed(), this.movement.y * this.getSpeed());
    }
}

export class Player extends MovingEntity {
    static playersColors: string[] = ['red', 'green', 'yellow', 'blue', 'cyan', 'magenta'];

    @type("string")
    color = Player.playersColors[Math.floor(Math.random() * Player.playersColors.length)];

    constructor() {
        super();

        this.pos = new Vector(Math.floor(Math.random() * 600), Math.floor(Math.random() * 600));
    }

    getSpeed(): number {
        return 0.4;
    }
}


export class Decoration extends Entity {
    static decorationsTypes: string[] = ['grass'];

    @type("string")
    type = Decoration.decorationsTypes[Math.floor(Math.random() * Decoration.decorationsTypes.length)];

    constructor() {
        super();

        this.pos = new Vector(Math.floor(Math.random() * 4000) - 2000, Math.floor(Math.random() * 4000) - 2000);
    }
}

export class Alpaca extends MovingEntity {
    static alpacasColors: string[] = ['grey'];

    @type(Vector)
    destination: Vector = new Vector(this.pos.x, this.pos.y);

    @type("string")
    color: string = Alpaca.alpacasColors[Math.floor(Math.random() * Alpaca.alpacasColors.length)];

    @type("number")
    timer: number = 0;

    constructor() {
        super();

        this.pos = new Vector(Math.floor(Math.random() * 600), Math.floor(Math.random() * 600));
    }

    getSpeed(): number {
        return 0.05;
    }

    update (deltaTime, players: MapSchema<Player>) {
        this.timer -= deltaTime;

        var repulse: Vector = new Vector(0, 0);
        Object.keys(players).forEach(playerId => {
            var player: Player = players[playerId];

            let direction: Vector = new Vector(this.pos.x - player.pos.x, this.pos.y - player.pos.y);
            let distance: number = direction.mag();

            if(distance < 100) {
                repulse.x += direction.x;
                repulse.y += direction.y;
            }
        });
        if(repulse.x != 0 || repulse.y != 0) {
            this.movement = repulse.normalized();
            this.destination.x = this.pos.x;
            this.destination.y = this.pos.y;
        }
        else {
            if(this.timer <= 0) {
                this.timer = (Math.random() * 5 + 5) * 1000;
                let move = Math.floor(Math.random() * 2) == 0;
                if(move) {
                    this.destination.x = this.pos.x + Math.floor(Math.random() * 200) - 100;
                    this.destination.y = this.pos.y + Math.floor(Math.random() * 200) - 100;
                } else {
                    this.destination.x = this.pos.x;
                    this.destination.y = this.pos.y;
                }
            }

            let direction: Vector = new Vector(this.destination.x - this.pos.x, this.destination.y - this.pos.y);
            if(direction.mag() > 5) {
                this.movement = direction.normalized();
            } else {
                this.movement = new Vector(0, 0);
            }
        }
    }
}

export class State extends Schema {
    @type({ map: Player })
    players: MapSchema<Player> = new MapSchema<Player>();

    @type([ Alpaca ])
    alpacas: ArraySchema<Alpaca> = new ArraySchema<Alpaca>();

    @type([ Decoration ])
    decorations: ArraySchema<Decoration> = new ArraySchema<Decoration>();

    createPlayer (id: string) {
        this.players[ id ] = new Player();
    }

    removePlayer (id: string) {
        delete this.players[ id ];
    }

    setPlayerMovement (id: string, movement: any) {
        this.players[ id ].setMovement(movement);
    }

    checkPlayerPosition (id: string, clientPosition: Vector) {
        var player: Player = this.players[ id ];
        var distance: number = new Vector(player.pos.x - clientPosition.x, player.pos.y - clientPosition.y).mag();
        if(distance < 10){
            player.pos.x = clientPosition.x;
            player.pos.y = clientPosition.y;
        } else {
            console.log("Discrepency detected !")
        }
    }

    init() {
        for(let i=0 ; i<1 ; i++) {
            this.alpacas.push(new Alpaca());
        }
        for(let i=0 ; i<100 ; i++) {
            this.decorations.push(new Decoration());
        }
    }
}

export class StateHandlerRoom extends Room<State> {
    onInit (options) {
        console.log("StateHandlerRoom created!", options);

        this.setMetadata({roomName: options.roomName});

        let state = new State();
        state.init();

        this.setState(state);

        this.setSimulationInterval((deltaTime) => this.update(deltaTime));
    }

    requestJoin (options, isNewRoom: boolean) {
        return (options.create)
            ? (options.create && isNewRoom)
            : this.clients.length > 0;
    }

    onJoin (client) {
        this.state.createPlayer(client.sessionId);
    }

    onLeave (client) {
        this.state.removePlayer(client.sessionId);
    }

    onMessage (client, data) {
        //console.log("StateHandlerRoom received message from", client.sessionId, ":", data);
        switch(data.type) {
            case "set_player_movement":
                this.state.setPlayerMovement(client.sessionId, data.payload);
                break;
            case "check_player_position":
                var clientPosition: Vector = new Vector(data.payload.x, data.payload.y);
                this.state.checkPlayerPosition(client.sessionId, clientPosition);
                break;
        }
    }

    onDispose () {
        console.log("Dispose StateHandlerRoom");
    }

    update (deltaTime) {
        if(this.state.alpacas) {
            this.state.alpacas.forEach((alpaca: Alpaca) => {
                alpaca.update(deltaTime, this.state.players);
            });
        };

        if(this.state.alpacas) {
            this.state.alpacas.forEach((alpaca: Alpaca) => {
                alpaca.move(deltaTime);
            });
        };
        if(this.state.players) {
            Object.keys(this.state.players).forEach((sessionId: string) => {
                var player: Player = this.state.players[sessionId];
                player.move(deltaTime);
            });
        };
    }

}