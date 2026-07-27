# Zombie Town Online

A browser-based, round-driven zombie survival FPS built with Three.js.

The current version is playable in single-player or in private 2 to 4-player online cooperative rooms.

## Online milestone status

The shared multiplayer milestone is implemented:

- Create and join private rooms with six-character invite codes
- Four-player room capacity
- Durable Object room coordination
- Hibernating WebSocket connections
- Host selection and automatic host migration
- Shared map start events
- Synchronized survivor position, direction, health, weapon, and downed state
- Interpolated remote survivor models
- Host-authoritative zombie spawning, movement, damage, and death
- Shared round state and automatic host migration
- Synchronized power-up drops and mystery-box results
- Per-player combat rewards and shared zombie kill counts
- Teammate-only revives and team-wipe game over
- Synchronized equipped weapon models, muzzle flashes, and gunshot audio
- Host-controlled room-wide pause and resume
- Articulated military survivor models with synchronized movement, aim, recoil, airborne, and downed animation
- Two-handed weapon poses with fire-time yaw and pitch correction
- Quick-knife melee and crouching with synchronized first-person and survivor animations
- Layered footsteps, recorded zombie vocals, attack snarls, hurt reactions, death sounds, and War Machine impact audio

## Current features

- Town, Nuketown, and BLACKSIRE maps
- Two-level BLACKSIRE military compound with a surface base, underground containment lab, storm lighting, rain, and accelerated lockdown rounds
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

### Current synchronization

- Player position, rotation, animation, and downed state
- Health, downed state, teammate revives, combat rewards, and points
- Equipped weapons, gunfire visuals, and distance-aware gunshot audio
- Host pause state, including late joins and host migration
- Survivor movement speed, sprinting, aiming, grounded state, and animation pose
- Zombie spawning, movement, damage, death, and ragdoll triggers
- Rounds, power-ups, and mystery-box results
- Room codes and host migration

### Remaining multiplayer work

- Reconnect into an existing survivor slot
- Additional server-side validation for public matchmaking

### Suggested implementation phases

1. Add reconnect support.
2. Improve latency compensation and state compression.
3. Move sensitive validation server-side if public matchmaking is introduced.

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
- `V` or middle mouse: Knife melee
- `C` or Left Ctrl: Crouch
- `Esc`: Pause

Controller: click the right stick for melee and press `B` to crouch.

## Audio credits

The bundled zombie vocal recordings were created by Mike Koenig and downloaded from SoundBible under the [Creative Commons Attribution 3.0 license](https://creativecommons.org/licenses/by/3.0/):

- [Zombie Moan](https://soundbible.com/1035-Zombie-Moan.html)
- [Zombie Attack Walk](https://soundbible.com/1030-Zombie-Attack-Walk.html)
- [Zombie Gets Attacked](https://soundbible.com/1040-Zombie-Gets-Attacked.html)
- [Zombie Long Death](https://soundbible.com/1042-Zombie-Long-Death.html)
