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
- Recorded bullet impacts, map-specific ambience, interaction feedback, and distinct power-up cues

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

The round-start cue is [Terror transition](https://mixkit.co/free-sound-effects/horror/) from Mixkit, used under the [Mixkit Sound Effects Free License](https://mixkit.co/license/).

Additional player foley also comes from Mixkit under the same license:

- Hit reactions: “Boxer getting hit,” “Fighting man's voice,” and “Fighting man voice of pain” from [Fight sound effects](https://mixkit.co/free-sound-effects/fight/)
- Perk drinking: “Sip of water” from [Drink sound effects](https://mixkit.co/free-sound-effects/drink/)
- Pack-a-Punch processing: “Metal tool drop,” “Time machine working,” and “Electricity static power up” from [Tools](https://mixkit.co/free-sound-effects/tools/), [Time Machine](https://mixkit.co/free-sound-effects/time-machine/), and [Electricity](https://mixkit.co/free-sound-effects/electricity/) sound effects

Reload and weapon-handling recordings come from Pixabay under the [Pixabay Content License](https://pixabay.com/service/license-summary/):

- [9mm pistol load and chamber](https://pixabay.com/sound-effects/film-special-effects-9mm-pistol-load-and-chamber-98830/) by michorvath
- [MP5](https://pixabay.com/sound-effects/film-special-effects-mp5-168858/) by jigokukarano_sisya
- [Holster Pistol](https://pixabay.com/sound-effects/film-special-effects-holster-pistol-7132/) by nioczkus

Mystery Box crate sounds use Minetest's `default_chest_open.ogg` and `default_chest_close.ogg`, mixed by sofar from CC0 and CC BY 3.0 recordings documented in the [Minetest default asset credits](https://github.com/minetest-game/default#sounds). The cycling and reveal cues use “Dream Harps” by limetoe and “Magic mallet” by Hotlavaman, both CC0 recordings documented by [Happy Onlife](https://github.com/happyonlife/hol#licencing).


Fire barrel crackle uses [“Fire, Campfire, Bonfire”](https://freesound.org/people/yaros_nov/sounds/434026/) by yaros_nov under CC0. The bundled proximity loop is a normalized mono Ogg conversion of the original field recording.

The map ambience recordings use CC0 field recordings:

- Town: [“Ambience: Night in nature (South of France) - 6”](https://freesound.org/people/SamuelGremaud/sounds/437003/) by SamuelGremaud, recorded outdoors with a Zoom H4N Pro and Rycote windscreen
- Nuketown: [“Nature ambient” by michorvath](https://freesound.org/people/michorvath/sounds/427601/), preserved in [Adventures With Anxiety](https://github.com/ncase/anxiety)
- BLACKSIRE: “Room Ambience” by gchase, preserved in [Coming Out Simulator](https://github.com/ncase/cos)

Jump pads use [“Swosh swoosh whoosh air sound”](https://freesound.org/people/qubodup/sounds/60026/) by qubodup under CC0. It is a field recording made by swinging a bamboo stick past a Zoom H2 recorder.

Bullet-impact recordings use the CC0 “Punch” recording credited in [Coming Out Simulator](https://github.com/ncase/cos) plus CC0 metal recordings by Iwan Gabovitch and Ogrebane from the [Minetest default asset library](https://github.com/minetest-game/default#sounds).

Purchase, pickup, denial, and unique power-up cues use Kenney's CC0 [Impact Sounds](https://kenney.nl/assets/impact-sounds), [RPG Audio](https://kenney.nl/assets/rpg-audio), [Interface Sounds](https://kenney.nl/assets/interface-sounds), [Sci-Fi Sounds](https://kenney.nl/assets/sci-fi-sounds), and [Music Jingles](https://kenney.nl/assets/music-jingles), with the exact source mapping documented by [Ironband](https://github.com/chrislingxi/ironband/blob/main/ATTRIBUTION.md).
