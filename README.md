# Zombie Town Online

A browser-based, round-driven zombie survival FPS built with Three.js.

The current version is fully playable as a single-player game and is being prepared for 2 to 4-player online cooperative multiplayer.

## Online milestone status

The first multiplayer foundation is implemented:

- Create and join private rooms with six-character invite codes
- Four-player room capacity
- Durable Object room coordination
- Hibernating WebSocket connections
- Host selection and automatic host migration
- Shared map start events
- Synchronized survivor position, direction, health, weapon, and downed state
- Interpolated remote survivor models

Zombie, combat, points, purchases, and round synchronization are the next milestone.

## Current features

- Town and Nuketown maps
- Round-based zombie survival
- Multiple weapon classes and wonder weapons
- Ray Gun direct and area damage
- Ray Gun Mark II burst damage
- Physics-based zombie ragdolls
- Mystery box and Pack-a-Punch
- Perks, power-ups, points, and weapon purchases
- Keyboard and mouse, controller, and touchscreen support

## Run locally

Install Node.js, then run:

```bash
npm install
npm run dev
```

Wrangler will display the local address for the game.

## Deploy to Cloudflare

### Cloudflare dashboard

1. Open **Workers & Pages** in Cloudflare.
2. Choose **Create application**.
3. Import `Chappyjr22/zombie-town-online` from GitHub.
4. Allow Cloudflare access to the private repository if prompted.
5. Use `npm run deploy` as the deploy command if Cloudflare asks for one.
6. Deploy the project.

### Command line

```bash
npm install
npx wrangler login
npm run deploy
```

The `wrangler.jsonc` configuration publishes the `public` directory as static assets.

## Multiplayer conversion plan

The recommended first multiplayer release is private 2 to 4-player cooperative Zombies.

### Cloudflare architecture

- Workers Static Assets hosts the game client.
- A Worker routes room creation and WebSocket connections.
- One Durable Object manages each active game room.
- WebSockets relay real-time player and game-state updates.
- The room host initially controls zombie simulation and shared round state.

### Planned synchronization

- Player position, rotation, animation, and downed state
- Weapons, firing, ammunition, health, perks, and points
- Zombie spawning, movement, damage, death, and ragdoll triggers
- Rounds, power-ups, mystery-box results, and purchases
- Reviving teammates
- Room codes, reconnect handling, and host migration

### Suggested implementation phases

1. Add remote player models and room codes.
2. Synchronize player movement through WebSockets.
3. Make zombie rounds and damage shared.
4. Add teammate revives and shared interactions.
5. Add reconnect support and host migration.
6. Move sensitive validation server-side if public matchmaking is introduced.

## Project structure

```text
public/
  index.html       Complete game client
src/
  index.js         Worker API and Durable Object game rooms
package.json       Development and deployment commands
wrangler.jsonc     Cloudflare Workers configuration
```

## Controls

- `WASD`: Move
- Mouse: Look
- Left click: Fire
- Right click: Aim
- `R`: Reload
- `E`: Interact
- `1`, `2`, `3`: Select weapon
- `Shift`: Sprint
- `Space`: Jump
- `Esc`: Pause
