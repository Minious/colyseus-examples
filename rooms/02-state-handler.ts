import { Room } from "colyseus";
import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";
import { runInThisContext } from "vm";

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
    pos: Vector = new Vector(Math.floor(Math.random() * 600), Math.floor(Math.random() * 600));
}

export class MovingEntity extends Entity {
    static speed: number;

    movement: Vector = new Vector(0, 0);

    setMovement(movement){
        this.movement = movement;
    }

    move (deltaTime) {
        if (this.movement.x) {
            this.pos.x += this.movement.x * Player.speed * deltaTime;
        }
        if (this.movement.y) {
            this.pos.y += this.movement.y * Player.speed * deltaTime;
        }
    }
}

export class Player extends MovingEntity {
    static playersColors: string[] = ['red', 'green', 'yellow', 'blue', 'cyan', 'magenta'];
    static speed: number = 0.4;

    @type("string")
    color = Player.playersColors[Math.floor(Math.random() * Player.playersColors.length)];
}


export class Decoration extends Entity {
    static decorationsTypes: string[] = ['grass'];

    @type("string")
    type = Decoration.decorationsTypes[Math.floor(Math.random() * Decoration.decorationsTypes.length)];
}

export class Alpaca extends MovingEntity {
    static alpacasColors: string[] = ['grey'];
    static speed: number = 0.1;

    @type("number")
    dir: Vector = new Vector(this.pos.x, this.pos.y);

    @type("string")
    color: string = Alpaca.alpacasColors[Math.floor(Math.random() * Alpaca.alpacasColors.length)];

    @type("number")
    timer: number = 0;

    update (deltaTime, players: MapSchema<Player>) {
        this.timer -= deltaTime;

        var repulse: Vector = new Vector(0, 0);
        Object.keys(players).forEach(playerId => {
            var player: Player = players[playerId];

            let dir: Vector = new Vector(this.pos.x - player.pos.x, this.pos.y - player.pos.y);
            let dist: number = dir.mag();

            if(dist < 100) {
                repulse.x += dir.x;
                repulse.y += dir.y;
            }
        });
        if(repulse.x != 0 || repulse.y != 0) {
            this.movement = repulse.normalized();
            this.dir.x = this.pos.x;
            this.dir.y = this.pos.y;
        }
        else {
            if(this.timer <= 0) {
                this.timer = (Math.random() * 5 + 5) * 1000;
                let move = Math.floor(Math.random() * 2) == 0;
                if(move) {
                    this.dir.x = Math.floor(Math.random() * 600);
                    this.dir.y = Math.floor(Math.random() * 600);
                } else {
                    this.dir.x = this.pos.x;
                    this.dir.y = this.pos.y;
                }
            }

            let dir = new Vector(this.dir.x - this.pos.x, this.dir.y - this.pos.y);
            if(dir.mag() > 5) {
                this.movement = dir.normalized();
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

    init() {
        for(let i=0 ; i<10 ; i++) {
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

        let state = new State();
        state.init();

        this.setState(state);

        this.setSimulationInterval((deltaTime) => this.update(deltaTime));
    }

    onJoin (client) {
        this.state.createPlayer(client.sessionId);
    }

    onLeave (client) {
        this.state.removePlayer(client.sessionId);
    }

    onMessage (client, data) {
        console.log("StateHandlerRoom received message from", client.sessionId, ":", data);
        switch(data.type) {
            case "set_player_movement":
                this.state.setPlayerMovement(client.sessionId, data.payload);
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